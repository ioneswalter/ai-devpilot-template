/**
 * FR-163 — DevPilot API Gateway middleware.
 *
 * Wraps an existing Edge Function handler so external callers can authenticate
 * via API key. Verifies Bearer key against `api_keys.key_hash`, resolves the
 * tenant_id, runs rate-limit and audit-log machinery, and invokes the wrapped
 * handler with a `GatewayContext` containing the tenant_id and a service-role
 * Supabase client.
 *
 * v1.0 design note: tenant isolation is enforced application-layer (the wrapped
 * handler filters its queries by `tenantId` explicitly) rather than via JWT-
 * minting + auth.jwt() RLS. The JWT-mint approach requires SUPABASE_JWT_SECRET
 * which is not auto-injected in Edge Functions; configuring it is FR-163 v1.1
 * work. For the foundation phase this trade-off is acceptable since we only
 * wrap one pilot endpoint (pipeline-status).
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { hashKey } from './api-key-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

export interface GatewayContext {
  /** Resolved tenant id from the API key. Wrapped handlers MUST filter their queries by this. */
  tenantId: string;
  /** API key id; used for audit logging and rate-limit correlation. */
  apiKeyId: string;
  /** Per-request correlation id surfaced in `X-Request-Id` and `api_audit_log.request_id`. */
  requestId: string;
  /** Service-role Supabase client. RLS-bypassing — wrapped handler is responsible for tenant filtering. */
  supabase: SupabaseClient;
}

export type GatewayHandler = (req: Request, ctx: GatewayContext) => Promise<Response>;

interface KeyRow {
  id: string;
  tenant_id: string;
  rate_limit_per_minute: number;
  revoked_at: string | null;
  expires_at: string | null;
}

function jsonError(
  code: string,
  message: string,
  status: number,
  extraHeaders: Record<string, string> = {}
) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json', ...extraHeaders },
  });
}

/** Look up a key by hash. Returns the row if active (not revoked, not expired); null otherwise. */
async function lookupActiveKey(supabase: SupabaseClient, rawKey: string): Promise<KeyRow | null> {
  const hash = await hashKey(rawKey);
  const { data } = await supabase
    .from('api_keys')
    .select('id, tenant_id, rate_limit_per_minute, revoked_at, expires_at')
    .eq('key_hash', hash)
    .maybeSingle();
  if (!data) return null;
  const row = data as KeyRow;
  if (row.revoked_at) return null;
  if (row.expires_at && new Date(row.expires_at).getTime() < Date.now()) return null;
  return row;
}

/** Sliding-window rate limit using `rate_limit_log` (FR-063). Returns retry-after seconds when over quota, else 0. */
async function checkRateLimit(
  supabase: SupabaseClient,
  apiKeyId: string,
  perMinute: number
): Promise<number> {
  const windowStart = new Date(Date.now() - 60_000).toISOString();
  const { count } = await supabase
    .from('rate_limit_log')
    .select('*', { count: 'exact', head: true })
    .eq('identifier', apiKeyId)
    .gte('created_at', windowStart);
  if ((count ?? 0) >= perMinute) {
    // Approximate retry-after: time until the oldest in-window entry expires.
    return 60;
  }
  await supabase.from('rate_limit_log').insert({
    identifier: apiKeyId,
    endpoint: 'api-gateway',
    created_at: new Date().toISOString(),
  });
  return 0;
}

/** Fire-and-forget audit + last_used_at update. Never blocks the user response. */
function recordAudit(
  supabase: SupabaseClient,
  ctx: { apiKeyId: string; tenantId: string; requestId: string; endpoint: string; method: string },
  result: { statusCode: number; durationMs: number; errorCode: string | null }
): void {
  supabase
    .from('api_audit_log')
    .insert({
      tenant_id: ctx.tenantId,
      api_key_id: ctx.apiKeyId,
      endpoint: ctx.endpoint,
      method: ctx.method,
      status_code: result.statusCode,
      duration_ms: result.durationMs,
      error_code: result.errorCode,
      request_id: ctx.requestId,
    })
    .then(({ error }) => {
      if (error) console.error('[api-gateway] audit insert failed:', error.message);
    });
  supabase
    .from('api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', ctx.apiKeyId)
    .then(({ error }) => {
      if (error) console.error('[api-gateway] last_used_at update failed:', error.message);
    });
}

/**
 * Wrap a handler with the API gateway middleware. The handler receives a
 * `GatewayContext` with the resolved tenant_id and a service-role client.
 * The handler is responsible for filtering its queries by `ctx.tenantId`.
 */
export function withApiGateway(handler: GatewayHandler): (req: Request) => Promise<Response> {
  return async (req: Request): Promise<Response> => {
    const startedAt = Date.now();
    const requestId = crypto.randomUUID();

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Extract Bearer token
    const authHeader = req.headers.get('Authorization') ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      return jsonError('INVALID_API_KEY', 'API key is invalid, revoked, or expired', 401);
    }
    const rawKey = authHeader.slice(7).trim();
    if (!rawKey) {
      return jsonError('INVALID_API_KEY', 'API key is invalid, revoked, or expired', 401);
    }

    // 2. Look up + validate
    const key = await lookupActiveKey(supabase, rawKey);
    if (!key) {
      return jsonError('INVALID_API_KEY', 'API key is invalid, revoked, or expired', 401);
    }

    const url = new URL(req.url);
    const endpoint = url.pathname.split('/').filter(Boolean).pop() ?? 'unknown';

    // 3. Rate limit
    const retryAfter = await checkRateLimit(supabase, key.id, key.rate_limit_per_minute);
    if (retryAfter > 0) {
      recordAudit(
        supabase,
        { apiKeyId: key.id, tenantId: key.tenant_id, requestId, endpoint, method: req.method },
        { statusCode: 429, durationMs: Date.now() - startedAt, errorCode: 'RATE_LIMITED' }
      );
      return jsonError('RATE_LIMITED', `Quota exceeded. Try again in ${retryAfter} seconds.`, 429, {
        'Retry-After': String(retryAfter),
      });
    }

    // 4. Invoke wrapped handler
    let response: Response;
    let errorCode: string | null = null;
    try {
      response = await handler(req, {
        tenantId: key.tenant_id,
        apiKeyId: key.id,
        requestId,
        supabase,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Internal error';
      errorCode = err instanceof Error ? err.constructor.name : 'UnknownError';
      console.error('[api-gateway] handler exception:', msg, err);
      response = jsonError(
        'INTERNAL_ERROR',
        `An internal error occurred. Reference: ${requestId}`,
        500
      );
    }

    // 5. Audit + last_used (fire-and-forget)
    recordAudit(
      supabase,
      { apiKeyId: key.id, tenantId: key.tenant_id, requestId, endpoint, method: req.method },
      { statusCode: response.status, durationMs: Date.now() - startedAt, errorCode }
    );

    // 6. Add gateway response headers
    const headers = new Headers(response.headers);
    headers.set('X-Request-Id', requestId);
    if (response.status < 400) headers.set('X-Tenant-Id', key.tenant_id);
    return new Response(response.body, { status: response.status, headers });
  };
}
