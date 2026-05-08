/**
 * FR-163 J2 — Admin handlers for API key lifecycle (issue / rotate / revoke / list).
 *
 * Mounted under roadmap-admin-features by index.ts. All routes require admin
 * auth (validated by parent function). Raw key value is returned ONCE on
 * issuance/rotation; subsequent reads expose only the prefix.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders, errorResponse } from './shared.ts';

const RAW_KEY_PREFIX = 'dp_';
const RAW_KEY_BODY_LEN = 32;

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function generateRawKey(): string {
  const bytes = new Uint8Array(RAW_KEY_BODY_LEN);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return RAW_KEY_PREFIX + hex;
}

async function hashKey(rawKey: string): Promise<string> {
  const buf = new TextEncoder().encode(rawKey);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

interface IssueBody {
  tenant_id: string;
  name: string;
  scopes?: string[];
  rate_limit_per_minute?: number;
  expires_at?: string | null;
}

export async function handleApiKeyIssue(
  req: Request,
  supabase: SupabaseClient,
  adminUserId: string
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as IssueBody | null;
  if (!body?.tenant_id) return errorResponse('MISSING_FIELD', 'tenant_id required', 400);
  if (!body?.name) return errorResponse('MISSING_FIELD', 'name required', 400);
  if (body.rate_limit_per_minute !== undefined && body.rate_limit_per_minute < 1) {
    return errorResponse('INVALID_FIELD', 'rate_limit_per_minute must be >= 1', 400);
  }

  // Verify tenant exists
  const { data: tenant } = await supabase
    .from('tenants')
    .select('id')
    .eq('id', body.tenant_id)
    .maybeSingle();
  if (!tenant) return errorResponse('TENANT_NOT_FOUND', 'Tenant not found', 404);

  // Generate + hash + insert (one retry on hash collision)
  for (let attempt = 0; attempt < 2; attempt++) {
    const rawKey = generateRawKey();
    const keyHash = await hashKey(rawKey);
    const keyPrefix = rawKey.slice(0, 8);
    const { data, error } = await supabase
      .from('api_keys')
      .insert({
        tenant_id: body.tenant_id,
        key_hash: keyHash,
        key_prefix: keyPrefix,
        name: body.name,
        scopes: body.scopes ?? [],
        rate_limit_per_minute: body.rate_limit_per_minute ?? 60,
        expires_at: body.expires_at ?? null,
        created_by: adminUserId,
      })
      .select('id, key_prefix, name, rate_limit_per_minute, expires_at, created_at')
      .single();
    if (!error) {
      return jsonResponse({ data: { ...data, raw_key: rawKey } }, 201);
    }
    if (!error.message.includes('duplicate')) {
      return errorResponse('DB_ERROR', error.message, 500);
    }
  }
  return errorResponse('HASH_COLLISION', 'Could not generate a unique key after retries', 500);
}

export async function handleApiKeyRotate(
  req: Request,
  supabase: SupabaseClient,
  adminUserId: string
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { api_key_id?: string } | null;
  if (!body?.api_key_id) return errorResponse('MISSING_FIELD', 'api_key_id required', 400);

  const { data: existing } = await supabase
    .from('api_keys')
    .select('id, tenant_id, name, scopes, rate_limit_per_minute, expires_at, revoked_at')
    .eq('id', body.api_key_id)
    .maybeSingle();
  if (!existing) return errorResponse('API_KEY_NOT_FOUND', 'API key not found', 404);

  const now = new Date().toISOString();

  // Revoke old (idempotent if already revoked)
  if (!existing.revoked_at) {
    await supabase.from('api_keys').update({ revoked_at: now }).eq('id', existing.id);
  }

  // Issue new under same name + scopes + rate limit
  const rawKey = generateRawKey();
  const keyHash = await hashKey(rawKey);
  const keyPrefix = rawKey.slice(0, 8);
  const { data: newKey, error } = await supabase
    .from('api_keys')
    .insert({
      tenant_id: existing.tenant_id,
      key_hash: keyHash,
      key_prefix: keyPrefix,
      name: existing.name,
      scopes: existing.scopes,
      rate_limit_per_minute: existing.rate_limit_per_minute,
      expires_at: existing.expires_at,
      created_by: adminUserId,
    })
    .select('id, key_prefix, name, rate_limit_per_minute, expires_at, created_at')
    .single();
  if (error) return errorResponse('DB_ERROR', error.message, 500);

  return jsonResponse({
    data: {
      old_key_id: existing.id,
      old_revoked_at: existing.revoked_at ?? now,
      new_key: { ...newKey, raw_key: rawKey },
    },
  });
}

export async function handleApiKeyRevoke(
  req: Request,
  supabase: SupabaseClient
): Promise<Response> {
  const body = (await req.json().catch(() => null)) as { api_key_id?: string } | null;
  if (!body?.api_key_id) return errorResponse('MISSING_FIELD', 'api_key_id required', 400);

  const { data: existing } = await supabase
    .from('api_keys')
    .select('id, revoked_at')
    .eq('id', body.api_key_id)
    .maybeSingle();
  if (!existing) return errorResponse('API_KEY_NOT_FOUND', 'API key not found', 404);

  if (existing.revoked_at) {
    return jsonResponse({ data: { id: existing.id, revoked_at: existing.revoked_at } });
  }

  const now = new Date().toISOString();
  await supabase.from('api_keys').update({ revoked_at: now }).eq('id', existing.id);
  return jsonResponse({ data: { id: existing.id, revoked_at: now } });
}

export async function handleApiKeyList(req: Request, supabase: SupabaseClient): Promise<Response> {
  const url = new URL(req.url);
  const tenantId = url.searchParams.get('tenant_id');
  if (!tenantId) return errorResponse('MISSING_FIELD', 'tenant_id query param required', 400);

  const { data, error } = await supabase
    .from('api_keys')
    .select(
      'id, key_prefix, name, rate_limit_per_minute, expires_at, revoked_at, last_used_at, created_at'
    )
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  if (error) return errorResponse('DB_ERROR', error.message, 500);

  return jsonResponse({ data: { keys: data ?? [] } });
}
