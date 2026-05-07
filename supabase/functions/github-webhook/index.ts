/**
 * FR-147 — github-webhook Edge Function
 *
 * Receives signed events from GitHub for every installation. Validates the
 * HMAC SHA-256 signature, dedupes by `X-GitHub-Delivery`, persists the event,
 * then branches on event type to update `pipeline_runs` (push/pull_request) or
 * `github_installations` (installation lifecycle).
 *
 * No JWT auth — `verify_jwt = false` in config.toml. Authentication is by
 * signature only.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { validateWebhookSignature } from '../_shared/github-webhook-validator.ts';
import { githubDecrypt } from '../_shared/github-encryption.ts';

interface InstallationRow {
  id: string;
  github_installation_id: number;
  encrypted_webhook_secret: string | null;
  status: 'active' | 'revoked' | 'suspended';
}

interface WebhookContext {
  rawBody: Uint8Array;
  payload: Record<string, unknown>;
  eventType: string;
  deliveryId: string;
  signatureHeader: string;
  installation: InstallationRow;
  supabase: SupabaseClient;
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error('[github-webhook] uncaught:', err);
    return json({ error: 'Internal' }, 500);
  }
});

async function handleRequest(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const eventType = req.headers.get('X-GitHub-Event');
  const deliveryId = req.headers.get('X-GitHub-Delivery');
  const signatureHeader = req.headers.get('X-Hub-Signature-256');
  if (!eventType || !deliveryId || !signatureHeader) {
    return json({ error: 'Missing required header' }, 400);
  }

  const rawBody = new Uint8Array(await req.arrayBuffer());
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(new TextDecoder().decode(rawBody)) as Record<string, unknown>;
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );
  const installation = await loadInstallationFromPayload(supabase, payload);
  if (!installation) return json({ error: 'Installation not found' }, 404);

  const secret = await decryptWebhookSecret(supabase, installation);
  const validSignature = await validateWebhookSignature(rawBody, signatureHeader, secret);
  if (!validSignature) return json({ error: 'Invalid signature' }, 401);

  const ctx: WebhookContext = {
    rawBody,
    payload,
    eventType,
    deliveryId,
    signatureHeader,
    installation,
    supabase,
  };
  return await persistAndDispatch(ctx);
}

async function persistAndDispatch(ctx: WebhookContext): Promise<Response> {
  const { data: inserted } = await ctx.supabase
    .from('github_webhook_events')
    .upsert(
      {
        tenant_id: 'ownyourgig',
        delivery_id: ctx.deliveryId,
        installation_id: ctx.installation.id,
        event_type: ctx.eventType,
        payload: ctx.payload,
        signature_valid: true,
      },
      { onConflict: 'delivery_id', ignoreDuplicates: true }
    )
    .select('id')
    .maybeSingle();
  // Duplicate delivery → upsert ignores it and returns no row. Idempotent.
  if (!inserted) {
    return json({ ok: true, delivery_id: ctx.deliveryId, action_taken: 'duplicate_skipped' }, 200);
  }

  const action = await dispatchEvent(ctx);
  await ctx.supabase
    .from('github_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('id', inserted.id);

  return json({ ok: true, delivery_id: ctx.deliveryId, action_taken: action }, 200);
}

async function dispatchEvent(ctx: WebhookContext): Promise<string> {
  if (ctx.eventType === 'installation') {
    return await handleInstallationEvent(ctx);
  }
  if (ctx.eventType === 'push' || ctx.eventType === 'pull_request') {
    return await handleRepoEvent(ctx);
  }
  return 'ignored';
}

async function handleInstallationEvent(ctx: WebhookContext): Promise<string> {
  const action = ctx.payload.action as string | undefined;
  if (action === 'deleted') {
    await ctx.supabase
      .from('github_installations')
      .update({
        status: 'revoked',
        status_reason: 'admin_uninstalled',
        encrypted_access_token: null,
        access_token_expires_at: null,
      })
      .eq('id', ctx.installation.id);
    await ctx.supabase
      .from('pipeline_runs')
      .update({ status: 'failed', error_message: 'GitHub installation uninstalled' })
      .eq('github_installation_id', ctx.installation.id)
      .in('status', ['queued', 'running']);
    return 'installation_revoked';
  }
  if (action === 'suspend') {
    await ctx.supabase
      .from('github_installations')
      .update({ status: 'suspended', status_reason: 'github_suspended' })
      .eq('id', ctx.installation.id);
    return 'installation_suspended';
  }
  if (action === 'unsuspend') {
    await ctx.supabase
      .from('github_installations')
      .update({ status: 'active', status_reason: null })
      .eq('id', ctx.installation.id);
    return 'installation_unsuspended';
  }
  return 'installation_ignored';
}

async function handleRepoEvent(ctx: WebhookContext): Promise<string> {
  // For now we just log the event row. Linking a webhook to an existing
  // pipeline_run requires the orchestrator to have stamped the branch SHA on
  // the run; that wiring lands with T016. Until then we set
  // pipeline_run_id only if we can match by branch + commit_sha.
  const matchKeys = extractRepoEventKeys(ctx);
  if (!matchKeys) return 'repo_event_logged';

  const { data: run } = await ctx.supabase
    .from('pipeline_runs')
    .select('id')
    .eq('github_installation_id', ctx.installation.id)
    .eq('github_branch_name', matchKeys.branch)
    .eq('github_commit_sha', matchKeys.commitSha)
    .maybeSingle();

  if (run) {
    await ctx.supabase
      .from('github_webhook_events')
      .update({ pipeline_run_id: run.id })
      .eq('delivery_id', ctx.deliveryId);
    return `repo_event_linked:${run.id}`;
  }
  return 'repo_event_logged';
}

function extractRepoEventKeys(ctx: WebhookContext): { branch: string; commitSha: string } | null {
  const p = ctx.payload as Record<string, unknown>;
  if (ctx.eventType === 'push') {
    const ref = p.ref as string | undefined;
    const after = p.after as string | undefined;
    if (!ref?.startsWith('refs/heads/') || !after) return null;
    return { branch: ref.slice('refs/heads/'.length), commitSha: after };
  }
  // pull_request
  const pr = p.pull_request as { head?: { ref?: string; sha?: string } } | undefined;
  if (!pr?.head?.ref || !pr.head.sha) return null;
  return { branch: pr.head.ref, commitSha: pr.head.sha };
}

async function loadInstallationFromPayload(
  supabase: SupabaseClient,
  payload: Record<string, unknown>
): Promise<InstallationRow | null> {
  const installation = payload.installation as { id?: number } | undefined;
  if (!installation?.id) return null;
  const { data } = await supabase
    .from('github_installations')
    .select('id, github_installation_id, encrypted_webhook_secret, status')
    .eq('github_installation_id', installation.id)
    .maybeSingle<InstallationRow>();
  return data;
}

async function decryptWebhookSecret(
  supabase: SupabaseClient,
  row: InstallationRow
): Promise<string> {
  if (row.encrypted_webhook_secret) {
    return await githubDecrypt(supabase, row.encrypted_webhook_secret);
  }
  // Fall back to App-level secret if no per-row value (shouldn't happen post-J1).
  return Deno.env.get('GITHUB_APP_WEBHOOK_SECRET') ?? '';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
