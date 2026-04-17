/**
 * FR-144: Test Integration Edge Function
 * Tests connection to a third-party service by calling its health endpoint.
 * Credentials are retrieved server-side and never sent to the client.
 *
 * POST { integration_id: string }
 * Returns: { data: IntegrationTestResult }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, status: number, message?: string): Response {
  const body = message ? { error: { code, message } } : { error: { code } };
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface Credentials {
  api_key?: string;
  api_secret?: string;
  token?: string;
  username?: string;
  password?: string;
  account_sid?: string;
  project_url?: string;
  service_role_key?: string;
  [key: string]: string | undefined;
}

interface IntegrationRow {
  id: string;
  service_type: string;
  credentials: Credentials | null;
  config: Record<string, unknown>;
}

// ---- Service-specific test functions ----

async function testSupabase(creds: Credentials): Promise<{ ok: boolean; status: number; error?: string }> {
  const url = creds.project_url;
  if (!url) return { ok: false, status: 0, error: 'Missing project_url' };
  const res = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: creds.service_role_key ?? '', Authorization: `Bearer ${creds.service_role_key ?? ''}` },
  });
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
}

async function testStripe(creds: Credentials): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!creds.api_key) return { ok: false, status: 0, error: 'Missing api_key' };
  const res = await fetch('https://api.stripe.com/v1/balance', {
    headers: { Authorization: `Bearer ${creds.api_key}` },
  });
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
}

async function testGitHub(creds: Credentials): Promise<{ ok: boolean; status: number; error?: string }> {
  const token = creds.token;
  if (!token) return { ok: false, status: 0, error: 'Missing token' };
  const res = await fetch('https://api.github.com/user', {
    headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'OwnYourGig-Integration-Test' },
  });
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
}

async function testTwilio(creds: Credentials): Promise<{ ok: boolean; status: number; error?: string }> {
  const sid = creds.account_sid;
  const authToken = creds.api_key;
  if (!sid || !authToken) return { ok: false, status: 0, error: 'Missing account_sid or auth token' };
  const basic = btoa(`${sid}:${authToken}`);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}.json`, {
    headers: { Authorization: `Basic ${basic}` },
  });
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
}

async function testGoDaddy(creds: Credentials): Promise<{ ok: boolean; status: number; error?: string }> {
  if (!creds.api_key || !creds.api_secret) return { ok: false, status: 0, error: 'Missing api_key or api_secret' };
  const res = await fetch('https://api.godaddy.com/v1/domains?limit=1', {
    headers: { Authorization: `sso-key ${creds.api_key}:${creds.api_secret}` },
  });
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
}

async function testCustom(
  creds: Credentials,
  config: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; error?: string }> {
  const baseUrl = config.base_url as string | undefined;
  if (!baseUrl) return { ok: false, status: 0, error: 'Missing base_url in config' };

  const authType = (config.auth_type as string) ?? 'api_key';
  const headers: Record<string, string> = {};

  if (authType === 'bearer') {
    headers['Authorization'] = `Bearer ${creds.token ?? ''}`;
  } else if (authType === 'basic') {
    headers['Authorization'] = `Basic ${btoa(`${creds.username ?? ''}:${creds.password ?? ''}`)}`;
  } else {
    const headerName = (config.header_name as string) || 'X-API-Key';
    headers[headerName] = creds.token ?? creds.api_key ?? '';
  }

  const res = await fetch(baseUrl, { headers });
  return { ok: res.ok, status: res.status, error: res.ok ? undefined : await res.text() };
}

const TEST_HANDLERS: Record<string, (c: Credentials, cfg: Record<string, unknown>) => Promise<{ ok: boolean; status: number; error?: string }>> = {
  supabase: (c) => testSupabase(c),
  stripe: (c) => testStripe(c),
  github: (c) => testGitHub(c),
  twilio: (c) => testTwilio(c),
  godaddy: (c) => testGoDaddy(c),
  custom: testCustom,
};

// ---- Main Handler ----

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return errorResponse('UNAUTHORIZED', 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) return errorResponse('UNAUTHORIZED', 401);

    // Admin check
    const { data: admin } = await supabase
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();
    if (!admin) {
      const { data: adminByEmail } = await supabase
        .from('admin_users')
        .select('role')
        .eq('email', user.email)
        .single();
      if (!adminByEmail) return errorResponse('FORBIDDEN', 403);
    }

    const body = await req.json();
    const integrationId = body.integration_id;
    if (!integrationId) return errorResponse('BAD_REQUEST', 400, 'integration_id is required');

    // Fetch integration with credentials (service role bypasses RLS)
    const { data: integration, error: fetchErr } = await supabase
      .from('integrations')
      .select('id, service_type, credentials, config')
      .eq('id', integrationId)
      .single();

    if (fetchErr || !integration) {
      return errorResponse('NOT_FOUND', 404, 'Integration not found');
    }

    const row = integration as IntegrationRow;
    if (!row.credentials) {
      return errorResponse('BAD_REQUEST', 400, 'Integration has no credentials configured');
    }

    // Run service-specific test
    const handler = TEST_HANDLERS[row.service_type] ?? TEST_HANDLERS.custom;
    const startMs = Date.now();
    let result: { ok: boolean; status: number; error?: string };

    try {
      result = await handler(row.credentials, row.config ?? {});
    } catch (err) {
      result = { ok: false, status: 0, error: err instanceof Error ? err.message : 'Connection failed' };
    }
    const responseTimeMs = Date.now() - startMs;

    // Record test result
    const { data: testResult } = await supabase
      .from('integration_test_results')
      .insert({
        integration_id: integrationId,
        success: result.ok,
        response_time_ms: responseTimeMs,
        status_code: result.status || null,
        error_message: result.error?.slice(0, 500) || null,
        tested_by: user.id,
      })
      .select()
      .single();

    // Update integration status + last_verified_at
    const newStatus = result.ok ? 'connected' : 'error';
    await supabase
      .from('integrations')
      .update({
        status: newStatus,
        last_verified_at: result.ok ? new Date().toISOString() : undefined,
        updated_at: new Date().toISOString(),
      })
      .eq('id', integrationId);

    return jsonResponse(testResult);
  } catch (err) {
    console.error('test-integration error:', err);
    return errorResponse('INTERNAL_ERROR', 500);
  }
});
