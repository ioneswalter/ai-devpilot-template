/**
 * FR-147 — admin-integrations-github Edge Function
 *
 * GET  /admin-integrations-github          → installation status + connected repos
 * POST /admin-integrations-github/revoke   → mark installation revoked, fail in-flight runs
 *
 * Admin-only. Used by the Integrations page (`GitHubInstallationCard`).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';
import { getInstallationToken } from '../_shared/github-app-auth.ts';
import { withRateLimitRetry } from '../_shared/github-rate-limit.ts';

interface ConnectedRepo {
  full_name: string;
  private: boolean;
  default_branch: string;
}

interface InstallationView {
  id: string;
  github_account_login: string;
  account_type: string;
  status: 'active' | 'revoked' | 'suspended';
  status_reason: string | null;
  installed_at: string;
  installed_by_user_email: string | null;
  connected_repos: ConnectedRepo[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey);

  // ─── Auth ───
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const token = authHeader.slice('Bearer '.length);
  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user) {
    return json({ error: 'Unauthorized' }, 401);
  }
  const adminUserId = userData.user.id;
  const adminEmail = userData.user.email;

  // Admin check — user_id, fall back to email (admin_users.user_id can be stale).
  const { data: adminById } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', adminUserId)
    .maybeSingle();
  let isAdmin = !!adminById;
  if (!isAdmin && adminEmail) {
    const { data: adminByEmail } = await supabase
      .from('admin_users')
      .select('id')
      .eq('email', adminEmail)
      .maybeSingle();
    isAdmin = !!adminByEmail;
  }
  if (!isAdmin) {
    return json({ error: 'Admin access required' }, 403);
  }

  const url = new URL(req.url);
  const isRevoke = url.pathname.endsWith('/revoke');

  if (req.method === 'POST' && isRevoke) {
    return handleRevoke(supabase, adminUserId);
  }
  if (req.method === 'GET') {
    return handleGet(supabase);
  }
  return json({ error: 'Method not allowed' }, 405);
});

async function handleGet(supabase: ReturnType<typeof createClient>): Promise<Response> {
  const { data: installation, error } = await supabase
    .from('github_installations')
    .select(
      'id, github_account_login, account_type, status, status_reason, installed_at, installed_by_user_id'
    )
    .eq('tenant_id', 'ownyourgig')
    .order('installed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) return json({ error: error.message }, 500);

  const installUrl = buildInstallUrl();
  if (!installation) {
    return json({ installation: null, install_url: installUrl }, 200);
  }

  const installerEmail = await lookupAdminEmail(supabase, installation.installed_by_user_id);

  let connectedRepos: ConnectedRepo[] = [];
  if (installation.status === 'active') {
    try {
      connectedRepos = await fetchConnectedRepos(supabase, installation.id);
    } catch (err) {
      // Surface but don't fail — admin can still see the installation
      console.error('[admin-integrations-github] fetchConnectedRepos failed:', err);
    }
  }

  const view: InstallationView = {
    id: installation.id,
    github_account_login: installation.github_account_login,
    account_type: installation.account_type,
    status: installation.status,
    status_reason: installation.status_reason,
    installed_at: installation.installed_at,
    installed_by_user_email: installerEmail,
    connected_repos: connectedRepos,
  };
  return json({ installation: view, install_url: installUrl }, 200);
}

async function handleRevoke(
  supabase: ReturnType<typeof createClient>,
  adminUserId: string
): Promise<Response> {
  const { data: installation } = await supabase
    .from('github_installations')
    .select('id')
    .eq('tenant_id', 'ownyourgig')
    .eq('status', 'active')
    .maybeSingle();

  if (!installation) return json({ error: 'No active installation' }, 404);

  const { error: updateErr } = await supabase
    .from('github_installations')
    .update({
      status: 'revoked',
      status_reason: 'admin_revoked',
      encrypted_access_token: null,
      access_token_expires_at: null,
    })
    .eq('id', installation.id);
  if (updateErr) return json({ error: updateErr.message }, 500);

  // Fail in-flight pipeline_runs for this installation
  await supabase
    .from('pipeline_runs')
    .update({ status: 'failed', error_message: 'GitHub installation revoked by admin' })
    .eq('github_installation_id', installation.id)
    .in('status', ['running', 'queued']);

  return json({ revoked: true, by: adminUserId }, 200);
}

async function lookupAdminEmail(
  supabase: ReturnType<typeof createClient>,
  userId: string | null
): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabase.from('admin_users').select('email').eq('user_id', userId).maybeSingle();
  return data?.email ?? null;
}

async function fetchConnectedRepos(
  supabase: ReturnType<typeof createClient>,
  installationRowId: string
): Promise<ConnectedRepo[]> {
  const accessToken = await getInstallationToken(supabase, installationRowId);
  const { response } = await withRateLimitRetry(() =>
    fetch('https://api.github.com/installation/repositories?per_page=100', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    })
  );
  if (!response.ok) {
    throw new Error(`GitHub /installation/repositories returned ${response.status}`);
  }
  const body = (await response.json()) as {
    repositories: { full_name: string; private: boolean; default_branch: string }[];
  };
  return body.repositories.map((r) => ({
    full_name: r.full_name,
    private: r.private,
    default_branch: r.default_branch,
  }));
}

function buildInstallUrl(): string {
  const clientId = Deno.env.get('GITHUB_APP_CLIENT_ID');
  if (!clientId) {
    return 'https://github.com/apps/ai-devpilot-for-ownyourgig/installations/new';
  }
  // GitHub recommends using the app's "/installations/new" URL. Apps page slug
  // matches the App name — for "AI DevPilot for OwnYourGig" this becomes
  // /apps/ai-devpilot-for-ownyourgig (lowercase, dashes).
  return 'https://github.com/apps/ai-devpilot-for-ownyourgig/installations/new';
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
