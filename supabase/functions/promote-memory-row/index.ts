/**
 * FR-164 J3 — POST /promote-memory-row
 *
 * Admin-only endpoint that flips a row on `prompt_templates` or `ai_learnings`
 * from `visibility='private'` to `visibility='shared'`, anonymising the row's
 * text columns first and writing a `memory_promotion_audit` entry.
 *
 * Detect-and-route:
 *   * Bearer dp_*        → FR-163 gateway → tenantId from API key
 *   * Bearer <other JWT> → service-role admin path → user_id + admin_users check
 *   * Missing            → 401
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { withApiGateway, type GatewayContext } from '../_shared/api-gateway.ts';
import { isApiKeyShape } from '../_shared/api-key-helpers.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const PROMOTABLE_TABLES = new Set(['prompt_templates', 'ai_learnings']);

const TEXT_COLUMNS_BY_TABLE: Record<string, string[]> = {
  prompt_templates: ['description', 'system_prompt', 'user_prompt_template'],
  ai_learnings: ['title', 'context', 'correction'],
};

interface PromotionBody {
  source_table: string;
  source_id: string;
}

interface AnonymisationDiffEntry {
  column: string;
  before_excerpt: string;
  after_excerpt: string;
  replacements: number;
}

interface PromotionResult {
  audit_id: string | null;
  source_table: string;
  source_id: string;
  source_tenant_id: string;
  promoted_by: string;
  anonymisation_diff: AnonymisationDiffEntry[];
  requires_human_review: boolean;
  promoted_at: string;
  already_shared: boolean;
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validateBody(raw: unknown): PromotionBody | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'INVALID_BODY' };
  const body = raw as Record<string, unknown>;
  const source_table = body.source_table;
  const source_id = body.source_id;
  if (typeof source_table !== 'string' || !PROMOTABLE_TABLES.has(source_table))
    return { error: 'INVALID_TABLE' };
  if (typeof source_id !== 'string' || !UUID_RE.test(source_id)) return { error: 'INVALID_UUID' };
  return { source_table, source_id };
}

/** Replace caller's tenant slug + name with `{{tenant}}` in each text column; record diff. */
function anonymise(
  row: Record<string, unknown>,
  tenantCode: string,
  tenantName: string,
  textColumns: string[]
): { newValues: Record<string, string>; diff: AnonymisationDiffEntry[] } {
  const newValues: Record<string, string> = {};
  const diff: AnonymisationDiffEntry[] = [];
  for (const col of textColumns) {
    const original = (row[col] as string | null) ?? '';
    if (!original) continue;
    let after = original;
    let replacements = 0;
    for (const token of [tenantCode, tenantName]) {
      if (!token) continue;
      const re = new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      after = after.replace(re, () => {
        replacements += 1;
        return '{{tenant}}';
      });
    }
    if (replacements > 0) {
      newValues[col] = after;
      diff.push({
        column: col,
        before_excerpt: original.slice(0, 80),
        after_excerpt: after.slice(0, 80),
        replacements,
      });
    }
  }
  return { newValues, diff };
}

/** Shared promotion — fetch row, anonymise, UPDATE, INSERT audit. Returns the result envelope. */
async function performPromotion(
  supabase: SupabaseClient,
  callerTenantId: string,
  promotedBy: string,
  body: PromotionBody
): Promise<{
  result?: PromotionResult;
  error?: { code: string; status: number; message: string };
}> {
  const { data: row, error: rowErr } = await supabase
    .from(body.source_table)
    .select('*')
    .eq('id', body.source_id)
    .maybeSingle();
  if (rowErr) return { error: { code: 'INTERNAL_ERROR', status: 500, message: rowErr.message } };
  if (!row) return { error: { code: 'SOURCE_NOT_FOUND', status: 404, message: 'Row not found' } };

  if (row.tenant_id !== callerTenantId) {
    return {
      error: {
        code: 'TENANT_MISMATCH',
        status: 403,
        message: 'Caller tenant differs from source row tenant',
      },
    };
  }

  const promotedAt = new Date().toISOString();

  if (row.visibility === 'shared') {
    return {
      result: {
        audit_id: null,
        source_table: body.source_table,
        source_id: body.source_id,
        source_tenant_id: row.tenant_id,
        promoted_by: promotedBy,
        anonymisation_diff: [],
        requires_human_review: false,
        promoted_at: promotedAt,
        already_shared: true,
      },
    };
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('code, name')
    .eq('id', row.tenant_id)
    .single();
  if (!tenant)
    return { error: { code: 'INTERNAL_ERROR', status: 500, message: 'Tenant not found' } };

  const cols = TEXT_COLUMNS_BY_TABLE[body.source_table] ?? [];
  const { newValues, diff } = anonymise(row, tenant.code, tenant.name, cols);

  const requiresReview =
    diff.some((d) => d.replacements > 2) ||
    (body.source_table === 'ai_learnings' && Boolean(newValues.context ?? row.context));

  const updatePayload: Record<string, unknown> = {
    visibility: 'shared',
    created_by: null,
    ...newValues,
  };

  const { error: updErr } = await supabase
    .from(body.source_table)
    .update(updatePayload)
    .eq('id', body.source_id);
  if (updErr) return { error: { code: 'INTERNAL_ERROR', status: 500, message: updErr.message } };

  const { data: audit, error: auditErr } = await supabase
    .from('memory_promotion_audit')
    .insert({
      source_table: body.source_table,
      source_row_id: body.source_id,
      source_tenant_id: row.tenant_id,
      promoted_by: promotedBy,
      anonymisation_diff: diff,
      requires_human_review: requiresReview,
    })
    .select('id, promoted_at')
    .single();
  if (auditErr || !audit) {
    return {
      error: {
        code: 'INTERNAL_ERROR',
        status: 500,
        message: auditErr?.message ?? 'audit insert failed',
      },
    };
  }

  return {
    result: {
      audit_id: audit.id,
      source_table: body.source_table,
      source_id: body.source_id,
      source_tenant_id: row.tenant_id,
      promoted_by: promotedBy,
      anonymisation_diff: diff,
      requires_human_review: requiresReview,
      promoted_at: audit.promoted_at,
      already_shared: false,
    },
  };
}

async function handleGatewayCall(req: Request, ctx: GatewayContext): Promise<Response> {
  const body = validateBody(await req.json().catch(() => null));
  if ('error' in body) return errorResponse(body.error, body.error, 400);
  // API-key callers are pre-authenticated as their tenant; no separate admin check
  // — issuing an API key with promote scope is itself the admin grant.
  const { result, error } = await performPromotion(ctx.supabase, ctx.tenantId, ctx.apiKeyId, body);
  if (error) return errorResponse(error.code, error.message, error.status);
  return jsonResponse({ data: result });
}

async function handleAdminJwtCall(req: Request, token: string): Promise<Response> {
  const body = validateBody(await req.json().catch(() => null));
  if ('error' in body) return errorResponse(body.error, body.error, 400);

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: userResp, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userResp.user) return errorResponse('UNAUTHORIZED', 'Invalid JWT', 401);
  const userId = userResp.user.id;

  const { data: admin } = await supabase
    .from('admin_users')
    .select('user_id, role')
    .eq('user_id', userId)
    .maybeSingle();
  if (!admin) return errorResponse('FORBIDDEN', 'Caller is not an admin', 403);

  const callerTenantId =
    ((userResp.user.app_metadata?.tenant_id as string | undefined) ??
      (userResp.user.user_metadata?.tenant_id as string | undefined)) ||
    null;
  // Admin users with no JWT tenant claim default to OwnYourGig (the source tenant
  // is read from the row itself; the mismatch check still enforces single-tenant).
  const { data: defaultTenant } = await supabase.rpc('get_default_tenant_id');
  const effectiveTenantId = callerTenantId ?? (defaultTenant as string | null);
  if (!effectiveTenantId)
    return errorResponse('INTERNAL_ERROR', 'No tenant context for caller', 500);

  const { result, error } = await performPromotion(supabase, effectiveTenantId, userId, body);
  if (error) return errorResponse(error.code, error.message, error.status);
  return jsonResponse({ data: result });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== 'POST') return errorResponse('METHOD_NOT_ALLOWED', 'Use POST', 405);

  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer '))
    return errorResponse('UNAUTHORIZED', 'Missing or invalid authentication', 401);
  const token = auth.slice(7).trim();

  try {
    if (isApiKeyShape(token)) return await withApiGateway(handleGatewayCall)(req);
    return await handleAdminJwtCall(req, token);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Internal error';
    console.error('[promote-memory-row] error:', msg, err);
    return errorResponse('INTERNAL_ERROR', msg, 500);
  }
});
