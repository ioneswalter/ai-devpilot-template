/**
 * FR-167 J3 — GET /usage-rollup
 *
 * Returns the current-period usage rollup for the calling tenant, with a
 * linearly-extrapolated projected charge. Detect-and-route:
 *   * Bearer dp_*  → FR-163 gateway → tenantId from API key
 *   * Bearer <other JWT> → service-role admin path (tenant_id from query)
 *   * Missing → 401
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { withApiGateway, type GatewayContext } from '../_shared/api-gateway.ts';
import { isApiKeyShape } from '../_shared/api-key-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

interface RollupRow {
  tenant_id: string;
  period_start: string;
  period_end: string;
  ai_input_tokens: number;
  ai_output_tokens: number;
  ai_raw_cost: number;
  ai_billable_cost: number;
  gateway_calls: number;
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

/** Compute current calendar-month period_start as YYYY-MM-01 in UTC. */
function currentPeriodStart(): string {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/**
 * Fetch the rollup for tenant + period; if no row exists, call
 * compute_usage_rollup to generate one, then re-fetch.
 */
async function fetchOrComputeRollup(
  supabase: SupabaseClient,
  tenantId: string,
  periodStart: string
): Promise<RollupRow | null> {
  const { data: existing } = await supabase
    .from('usage_rollups')
    .select(
      'tenant_id, period_start, period_end, ai_input_tokens, ai_output_tokens, ai_raw_cost, ai_billable_cost, gateway_calls'
    )
    .eq('tenant_id', tenantId)
    .eq('period_start', periodStart)
    .maybeSingle();
  if (existing) return existing as RollupRow;

  const { error } = await supabase.rpc('compute_usage_rollup', {
    p_tenant_id: tenantId,
    p_period_start: periodStart,
  });
  if (error) {
    console.error('[usage-rollup] compute error:', error.message);
    return null;
  }

  const { data: fresh } = await supabase
    .from('usage_rollups')
    .select(
      'tenant_id, period_start, period_end, ai_input_tokens, ai_output_tokens, ai_raw_cost, ai_billable_cost, gateway_calls'
    )
    .eq('tenant_id', tenantId)
    .eq('period_start', periodStart)
    .maybeSingle();
  return (fresh as RollupRow | null) ?? null;
}

/** Linear extrapolation of billable cost to a full-month projection. ceil to cent. */
function projectBillable(rollup: RollupRow): number {
  const start = new Date(rollup.period_start + 'T00:00:00Z').getTime();
  const end = new Date(rollup.period_end + 'T00:00:00Z').getTime() + 86_400_000;
  const now = Date.now();
  const elapsed = Math.max(0, Math.min(end - start, now - start));
  const fraction = elapsed / (end - start);
  if (fraction <= 0 || rollup.ai_billable_cost === 0) return 0;
  // ceil(billable × 100 / fraction) / 100
  return Math.ceil((Number(rollup.ai_billable_cost) * 100) / fraction) / 100;
}

function buildResponse(rollup: RollupRow): Response {
  const projected = projectBillable(rollup);
  return jsonResponse({
    data: {
      tenant_id: rollup.tenant_id,
      period_start: rollup.period_start,
      period_end: rollup.period_end,
      ai_input_tokens: Number(rollup.ai_input_tokens),
      ai_output_tokens: Number(rollup.ai_output_tokens),
      ai_raw_cost: Number(rollup.ai_raw_cost),
      ai_billable_cost: Number(rollup.ai_billable_cost),
      gateway_calls: rollup.gateway_calls,
      projected_billable_cost: projected,
      computed_at: new Date().toISOString(),
    },
  });
}

/** Gateway-path handler (called via withApiGateway). tenantId from API key. */
async function handleGatewayCall(req: Request, ctx: GatewayContext): Promise<Response> {
  const url = new URL(req.url);
  const period = url.searchParams.get('period') ?? 'current';
  if (period !== 'current') {
    return errorResponse(
      'INVALID_PERIOD',
      "period must be 'current' (other values not yet supported)",
      400
    );
  }
  const rollup = await fetchOrComputeRollup(ctx.supabase, ctx.tenantId, currentPeriodStart());
  if (!rollup) return errorResponse('INTERNAL_ERROR', 'Could not compute rollup', 500);
  return buildResponse(rollup);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'GET') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Use GET', 405);
  }

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) {
    return errorResponse('UNAUTHORIZED', 'Missing or invalid authentication', 401);
  }
  const token = auth.slice(7).trim();

  // FR-163 gateway path for API keys
  if (isApiKeyShape(token)) {
    return withApiGateway(handleGatewayCall)(req);
  }

  // Admin / service-role path
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const url = new URL(req.url);
    const period = url.searchParams.get('period') ?? 'current';
    if (period !== 'current') {
      return errorResponse(
        'INVALID_PERIOD',
        "period must be 'current' (other values not yet supported)",
        400
      );
    }

    let tenantId = url.searchParams.get('tenant_id');
    if (!tenantId) {
      const { data: defTenant } = await supabase.rpc('get_default_tenant_id');
      tenantId = (defTenant as string | null) ?? null;
      if (!tenantId) return errorResponse('INTERNAL_ERROR', 'Default tenant not found', 500);
    } else {
      const { data: tenant } = await supabase
        .from('tenants')
        .select('id')
        .eq('id', tenantId)
        .maybeSingle();
      if (!tenant) return errorResponse('TENANT_NOT_FOUND', 'Tenant not found', 404);
    }

    const rollup = await fetchOrComputeRollup(supabase, tenantId, currentPeriodStart());
    if (!rollup) return errorResponse('INTERNAL_ERROR', 'Could not compute rollup', 500);
    return buildResponse(rollup);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[usage-rollup] admin path error:', msg, err);
    return errorResponse('INTERNAL_ERROR', msg, 500);
  }
});
