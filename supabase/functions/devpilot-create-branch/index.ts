/**
 * FR-147 — devpilot-create-branch Edge Function
 *
 * Internal pipeline endpoint. Creates a branch on the configured GitHub repo,
 * commits a list of file changes via the Git Data API, and opens a PR. Updates
 * the originating `pipeline_runs` row with the resulting branch + PR metadata.
 *
 * Auth: service-role only. The orchestrator calls this; end users never do.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { z } from 'https://esm.sh/zod@3.22.4';
import { corsHeaders } from '../_shared/cors.ts';
import { getInstallationToken } from '../_shared/github-app-auth.ts';
import {
  BranchExistsError,
  GhApiError,
  createBlobs,
  createCommit,
  createRef,
  createTree,
  getBaseSha,
  openPr,
  updateRef,
  type FileChange,
} from '../_shared/github-git-data.ts';

const RequestSchema = z.object({
  installation_id: z.string().uuid(),
  repo_full_name: z.string().regex(/^[^/]+\/[^/]+$/, 'expected "owner/repo"'),
  base_branch: z.string().min(1),
  feature_branch: z.string().min(1),
  commit_message: z.string().min(1),
  files: z.array(z.object({ path: z.string().min(1), content: z.string() })).min(1),
  pr_title: z.string().min(1),
  pr_body: z.string().min(1),
  pipeline_run_id: z.string().uuid().optional(),
});
type RequestBody = z.infer<typeof RequestSchema>;

interface InstallationRow {
  id: string;
  status: 'active' | 'revoked' | 'suspended';
  status_reason: string | null;
}

interface BranchCreated {
  pr_url: string;
  pr_number: number;
  branch: string;
  commit_sha: string;
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error('[devpilot-create-branch] uncaught:', err);
    return json(
      {
        error: 'Internal error',
        detail: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack?.split('\n').slice(0, 5).join('\n') : undefined,
      },
      500
    );
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!hasServiceRoleClaim(req.headers.get('Authorization'))) {
    return json({ error: 'Service-role only' }, 401);
  }

  const parsed = await parseBody(req);
  if (!parsed.ok) return parsed.response;

  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey);
  const installation = await loadInstallation(supabase, parsed.body.installation_id);
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

  const token = await getInstallationToken(supabase, installation.id);
  let result: BranchCreated;
  try {
    result = await createBranchAndPr(token, parsed.body);
  } catch (err) {
    if (err instanceof BranchExistsError) {
      return json({ error: 'Branch already exists', detail: err.githubBody.slice(0, 200) }, 422);
    }
    if (err instanceof GhApiError) {
      return json({ error: 'GitHub API failed', ...err.payload }, 502);
    }
    throw err;
  }

  if (parsed.body.pipeline_run_id) {
    await updatePipelineRun(
      supabase,
      parsed.body.pipeline_run_id,
      installation.id,
      parsed.body.repo_full_name,
      result
    );
  }
  return json(result, 200);
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

async function loadInstallation(
  supabase: SupabaseClient,
  id: string
): Promise<InstallationRow | null> {
  const { data, error } = await supabase
    .from('github_installations')
    .select('id, status, status_reason')
    .eq('id', id)
    .maybeSingle<InstallationRow>();
  if (error) throw new Error(`installation lookup failed: ${error.message}`);
  return data;
}

async function createBranchAndPr(token: string, req: RequestBody): Promise<BranchCreated> {
  const baseSha = await getBaseSha(token, req.repo_full_name, req.base_branch);
  await createRef(token, req.repo_full_name, req.feature_branch, baseSha);
  const files: FileChange[] = req.files;
  const blobShas = await createBlobs(token, req.repo_full_name, files);
  const treeSha = await createTree(token, req.repo_full_name, baseSha, files, blobShas);
  const commitSha = await createCommit(
    token,
    req.repo_full_name,
    req.commit_message,
    treeSha,
    baseSha
  );
  await updateRef(token, req.repo_full_name, req.feature_branch, commitSha);
  const pr = await openPr(
    token,
    req.repo_full_name,
    req.pr_title,
    req.pr_body,
    req.feature_branch,
    req.base_branch
  );
  return { pr_url: pr.html_url, pr_number: pr.number, branch: req.feature_branch, commit_sha: commitSha };
}

async function updatePipelineRun(
  supabase: SupabaseClient,
  pipelineRunId: string,
  installationRowId: string,
  repoFullName: string,
  result: BranchCreated
): Promise<void> {
  const { error } = await supabase
    .from('pipeline_runs')
    .update({
      github_installation_id: installationRowId,
      github_repo_full_name: repoFullName,
      github_branch_name: result.branch,
      github_pr_url: result.pr_url,
      github_pr_number: result.pr_number,
      github_commit_sha: result.commit_sha,
    })
    .eq('id', pipelineRunId);
  if (error) {
    console.warn('[devpilot-create-branch] pipeline_runs update failed:', error.message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/**
 * Check the request was made with a service-role JWT. The Supabase platform has
 * already verified the JWT signature before our function ran (verify_jwt=true,
 * default). Here we just decode the payload and check the `role` claim.
 */
function hasServiceRoleClaim(authHeader: string | null): boolean {
  if (!authHeader?.startsWith('Bearer ')) return false;
  const token = authHeader.slice('Bearer '.length);
  const parts = token.split('.');
  if (parts.length !== 3) return false;
  try {
    const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = payloadB64 + '='.repeat((4 - (payloadB64.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { role?: unknown };
    return payload.role === 'service_role';
  } catch {
    return false;
  }
}
