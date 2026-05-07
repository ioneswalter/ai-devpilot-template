/**
 * FR-147 — devpilot-post-status Edge Function
 *
 * Internal pipeline endpoint. Called when a pipeline_run reaches a terminal
 * state. Posts a commit status check (`devpilot/pipeline`) and a summary
 * comment on the linked PR.
 *
 * Auth: service-role JWT only (decoded role claim).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.22.4';
import { corsHeaders } from '../_shared/cors.ts';
import { getInstallationToken } from '../_shared/github-app-auth.ts';
import { withRateLimitRetry } from '../_shared/github-rate-limit.ts';

const RequestSchema = z.object({
  pipeline_run_id: z.string().uuid(),
  state: z.enum(['success', 'failure', 'pending']),
  summary_markdown: z.string().min(1),
  target_url: z.string().url().optional(),
  description: z.string().max(140).optional(),
});
type RequestBody = z.infer<typeof RequestSchema>;

interface PipelineRunRow {
  id: string;
  github_installation_id: string | null;
  github_repo_full_name: string | null;
  github_pr_number: number | null;
  github_commit_sha: string | null;
}

interface InstallationStatusRow {
  status: 'active' | 'revoked' | 'suspended';
  status_reason: string | null;
}

interface PostStatusResult {
  ok: true;
  status_url: string;
  comment_url: string;
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error('[devpilot-post-status] uncaught:', err);
    return json(
      {
        error: 'Internal error',
        detail: err instanceof Error ? err.message : String(err),
      },
      500
    );
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!hasServiceRoleClaim(req.headers.get('Authorization'))) {
    return json({ error: 'Service-role only' }, 401);
  }

  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const run = await loadPipelineRun(supabase, parsed.body.pipeline_run_id);
  if (!run) return json({ error: 'pipeline_run not found' }, 404);
  if (
    !run.github_installation_id ||
    !run.github_repo_full_name ||
    !run.github_pr_number ||
    !run.github_commit_sha
  ) {
    return json({ error: 'pipeline_run has no GitHub linkage' }, 422);
  }

  const installation = await loadInstallationStatus(supabase, run.github_installation_id);
  if (!installation) return json({ error: 'Installation not found' }, 404);
  if (installation.status !== 'active') {
    return json(
      {
        error: `Installation status: ${installation.status}`,
        status_reason: installation.status_reason,
      },
      409
    );
  }

  const token = await getInstallationToken(supabase, run.github_installation_id);
  let result: PostStatusResult;
  try {
    result = await postStatusAndComment(token, run, parsed.body);
  } catch (err) {
    if (err instanceof GhApiError) {
      return json({ error: 'GitHub API failed', ...err.payload }, 502);
    }
    throw err;
  }

  await supabase
    .from('pipeline_runs')
    .update({ last_status_posted_at: new Date().toISOString() })
    .eq('id', run.id);

  return json(result, 200);
}

async function postStatusAndComment(
  token: string,
  run: PipelineRunRow,
  body: RequestBody
): Promise<PostStatusResult> {
  const status = await postStatus(token, run, body);
  const comment = await postComment(token, run, body.summary_markdown);
  return { ok: true, status_url: status.url, comment_url: comment.html_url };
}

interface StatusResponse {
  url: string;
}
async function postStatus(
  token: string,
  run: PipelineRunRow,
  body: RequestBody
): Promise<StatusResponse> {
  const repo = run.github_repo_full_name as string;
  const sha = run.github_commit_sha as string;
  const url = `https://api.github.com/repos/${repo}/statuses/${sha}`;
  const description = (body.description ?? defaultDescription(body.state)).slice(0, 140);
  const payload: Record<string, string> = {
    state: body.state,
    context: 'devpilot/pipeline',
    description,
  };
  if (body.target_url) payload.target_url = body.target_url;

  const { response } = await withRateLimitRetry(() =>
    fetch(url, { method: 'POST', headers: ghHeaders(token), body: JSON.stringify(payload) })
  );
  if (!response.ok) throw await ghError('post_status', response);
  return (await response.json()) as StatusResponse;
}

interface CommentResponse {
  html_url: string;
}
async function postComment(
  token: string,
  run: PipelineRunRow,
  markdown: string
): Promise<CommentResponse> {
  const repo = run.github_repo_full_name as string;
  const prNumber = run.github_pr_number as number;
  const url = `https://api.github.com/repos/${repo}/issues/${prNumber}/comments`;
  const { response } = await withRateLimitRetry(() =>
    fetch(url, {
      method: 'POST',
      headers: ghHeaders(token),
      body: JSON.stringify({ body: markdown }),
    })
  );
  if (!response.ok) throw await ghError('post_comment', response);
  return (await response.json()) as CommentResponse;
}

function defaultDescription(state: 'success' | 'failure' | 'pending'): string {
  if (state === 'success') return 'DevPilot pipeline succeeded';
  if (state === 'failure') return 'DevPilot pipeline failed';
  return 'DevPilot pipeline running';
}

async function loadPipelineRun(
  supabase: SupabaseClient,
  id: string
): Promise<PipelineRunRow | null> {
  const { data, error } = await supabase
    .from('pipeline_runs')
    .select(
      'id, github_installation_id, github_repo_full_name, github_pr_number, github_commit_sha'
    )
    .eq('id', id)
    .maybeSingle<PipelineRunRow>();
  if (error) throw new Error(`pipeline_runs lookup failed: ${error.message}`);
  return data;
}

async function loadInstallationStatus(
  supabase: SupabaseClient,
  id: string
): Promise<InstallationStatusRow | null> {
  const { data, error } = await supabase
    .from('github_installations')
    .select('status, status_reason')
    .eq('id', id)
    .maybeSingle<InstallationStatusRow>();
  if (error) throw new Error(`installation lookup failed: ${error.message}`);
  return data;
}

type ParseResult =
  | { ok: true; body: RequestBody }
  | { ok: false; response: Response };
async function parseBody(req: Request): Promise<ParseResult> {
  try {
    const raw = await req.json();
    return { ok: true, body: RequestSchema.parse(raw) };
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, response: json({ error: 'Validation failed', details: err.errors }, 400) };
    }
    return { ok: false, response: json({ error: 'Invalid JSON body' }, 400) };
  }
}

interface GhErrorPayload {
  step: string;
  github_status: number;
  github_body: string;
}
class GhApiError extends Error {
  readonly payload: GhErrorPayload;
  constructor(step: string, status: number, body: string) {
    super(`GitHub ${step} failed: ${status}`);
    this.payload = { step, github_status: status, github_body: body.slice(0, 400) };
  }
}
async function ghError(step: string, response: Response): Promise<GhApiError> {
  return new GhApiError(step, response.status, await response.text());
}

function ghHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
  };
}

function hasServiceRoleClaim(authHeader: string | null): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const parts = authHeader.slice('Bearer '.length).split('.');
  if (parts.length !== 3) return false;
  try {
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return (JSON.parse(atob(padded)) as { role?: unknown }).role === 'service_role';
  } catch {
    return false;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
