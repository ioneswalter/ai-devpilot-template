/**
 * Constitution Audit Edge Function (FR-128)
 * GET: Query audit log entries with optional filtering
 *
 * Query params:
 *   - version_id: Filter by target version
 *   - rule_number: Filter by rule
 *   - limit: Max entries (default 50, max 200)
 *   - offset: Pagination offset
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  success,
  badRequest,
  internalError,
  corsResponse,
} from '../_shared/response.ts';
import { verifyAdmin } from '../_shared/admin-auth.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return corsResponse(req);
  }

  if (req.method !== 'GET') {
    return badRequest('Method not allowed', undefined, req);
  }

  const admin = await verifyAdmin(req);
  if (!admin) {
    return badRequest('Unauthorized', undefined, req);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const versionId = url.searchParams.get('version_id');
    const ruleNumber = url.searchParams.get('rule_number');
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') ?? '50', 10),
      200
    );
    const offset = parseInt(url.searchParams.get('offset') ?? '0', 10);

    let query = supabase
      .from('constitution_audit_log')
      .select('*', { count: 'exact' })
      .order('changed_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (versionId) {
      query = query.eq('version_to_id', versionId);
    }
    if (ruleNumber) {
      query = query.eq('rule_number', ruleNumber);
    }

    const { data: entries, count, error: qErr } = await query;

    if (qErr) {
      console.error('Audit query error:', qErr);
      return internalError('Failed to fetch audit log', undefined, req);
    }

    // Enrich entries with version labels
    const versionIds = new Set<string>();
    for (const entry of entries ?? []) {
      const e = entry as Record<string, unknown>;
      if (e.version_from_id) versionIds.add(e.version_from_id as string);
      if (e.version_to_id) versionIds.add(e.version_to_id as string);
    }

    const versionLabels = new Map<string, string>();
    if (versionIds.size > 0) {
      const { data: versions } = await supabase
        .from('constitution_versions')
        .select('id, version')
        .in('id', Array.from(versionIds));

      for (const v of versions ?? []) {
        const ver = v as Record<string, unknown>;
        versionLabels.set(ver.id as string, ver.version as string);
      }
    }

    const enriched = (entries ?? []).map((e: Record<string, unknown>) => ({
      ...e,
      version_from_label: e.version_from_id
        ? versionLabels.get(e.version_from_id as string) ?? null
        : null,
      version_to_label: versionLabels.get(e.version_to_id as string) ?? null,
    }));

    return success({ entries: enriched, total: count ?? 0 }, 200, req);
  } catch (err) {
    console.error('Constitution audit error:', err);
    return internalError('Failed to fetch audit log', undefined, req);
  }
});
