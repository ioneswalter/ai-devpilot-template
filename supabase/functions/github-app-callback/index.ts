/**
 * FR-147 — github-app-callback Edge Function
 *
 * Called by the React Integrations page after GitHub redirects back from the
 * App install flow. Persists the installation, mints the first access token,
 * and encrypts both the access token and the App-level webhook secret into
 * `github_installations`. Returns the installation row to the caller.
 *
 * NOT a webhook receiver — this is the OAuth-style install confirmation.
 * GitHub itself does not pass any auth header; the React caller does (admin JWT).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { mintAppJwt } from '../_shared/github-app-auth.ts';
import { withRateLimitRetry } from '../_shared/github-rate-limit.ts';
import { githubEncrypt } from '../_shared/github-encryption.ts';

interface CallbackBody {
  installation_id: number;
  setup_action: 'install' | 'update';
}

interface InstallationTokenResponse {
  token: string;
  expires_at: string;
}

interface InstallationMetadata {
  id: number;
  account: { login: string; type: 'Organization' | 'User' };
}

Deno.serve(async (req) => {
  try {
    return await handleRequest(req);
  } catch (err) {
    console.error('[github-app-callback] uncaught:', err);
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
  if (req.method !== 'POST') {
    return json({ error: 'Method not allowed' }, 405);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  // ─── Auth: admin only ───
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.slice('Bearer '.length);
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const userId = userData.user.id;
  const userEmail = userData.user.email;

  // Admin check — match by user_id, fall back to email (admin_users.user_id can
  // become stale if the auth.users row was recreated). Same pattern as
  // admin-dashboard/shared.ts → isAdmin().
  const { data: adminById } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  let isAdmin = !!adminById;
  if (!isAdmin && userEmail) {
    const { data: adminByEmail } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', userEmail)
      .maybeSingle();
    isAdmin = !!adminByEmail;
  }
  if (!isAdmin) {
    return json({ error: 'Admin access required' }, 403);
  }

  // ─── Body ───
  let body: CallbackBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON body' }, 400);
  }
  if (!body.installation_id || typeof body.installation_id !== 'number') {
    return json({ error: 'installation_id is required (number)' }, 400);
  }

  // ─── Mint App JWT and call GitHub ───
  let appJwt: string;
  try {
    appJwt = await mintAppJwt();
  } catch (err) {
    return json({ error: 'Server misconfigured', detail: errorMessage(err) }, 500);
  }

  const installationId = body.installation_id;
  const tokenUrl = `https://api.github.com/app/installations/${installationId}/access_tokens`;
  const metaUrl = `https://api.github.com/app/installations/${installationId}`;

  const tokenResponseResult = await withRateLimitRetry(() =>
    fetch(tokenUrl, {
      method: 'POST',
      headers: githubAppHeaders(appJwt),
    })
  );
  if (!tokenResponseResult.response.ok) {
    const text = await tokenResponseResult.response.text();
    return json(
      {
        error: 'GitHub access token mint failed',
        github_status: tokenResponseResult.response.status,
        github_body: text.slice(0, 300),
      },
      502
    );
  }
  const tokenJson = (await tokenResponseResult.response.json()) as InstallationTokenResponse;

  const metaResponseResult = await withRateLimitRetry(() =>
    fetch(metaUrl, {
      method: 'GET',
      headers: githubAppHeaders(appJwt),
    })
  );
  if (!metaResponseResult.response.ok) {
    const text = await metaResponseResult.response.text();
    return json(
      {
        error: 'GitHub installation metadata fetch failed',
        github_status: metaResponseResult.response.status,
        github_body: text.slice(0, 300),
      },
      502
    );
  }
  const meta = (await metaResponseResult.response.json()) as InstallationMetadata;

  // ─── Encrypt token + webhook secret, then UPSERT ───
  const webhookSecret = Deno.env.get('GITHUB_APP_WEBHOOK_SECRET');
  if (!webhookSecret) {
    return json({ error: 'GITHUB_APP_WEBHOOK_SECRET not set' }, 500);
  }

  const encryptedToken = await githubEncrypt(supabase, tokenJson.token);
  const encryptedSecret = await githubEncrypt(supabase, webhookSecret);

  const { data: row, error: upsertErr } = await supabase
    .from('github_installations')
    .upsert(
      {
        tenant_id: 'ownyourgig',
        github_installation_id: installationId,
        github_account_login: meta.account.login,
        account_type: meta.account.type,
        encrypted_access_token: bytesToHexLiteral(encryptedToken),
        access_token_expires_at: tokenJson.expires_at,
        encrypted_webhook_secret: bytesToHexLiteral(encryptedSecret),
        status: 'active',
        status_reason: null,
        installed_by_user_id: userId,
      },
      { onConflict: 'tenant_id,github_installation_id' }
    )
    .select('id, github_account_login, account_type, status, installed_at')
    .single();

  if (upsertErr) {
    return json({ error: 'Persist failed', detail: upsertErr.message }, 500);
  }

  return json({ installation: row, setup_action: body.setup_action ?? 'install' }, 200);
}

function githubAppHeaders(jwt: string): HeadersInit {
  return {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
}

function bytesToHexLiteral(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return `\\x${hex}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
