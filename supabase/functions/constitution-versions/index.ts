/**
 * Constitution Versions Edge Function (FR-128)
 * GET: List versions or retrieve a specific version with rules
 *
 * Query params:
 *   - id: Get specific version by ID (includes rules)
 *   - status: Filter by status (active, archived, draft)
 *   - include_rules: Include rules in list response (true/false)
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

  // Require authenticated user (admin check is optional for reads)
  const admin = await verifyAdmin(req);
  if (!admin) {
    return badRequest('Unauthorized', undefined, req);
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const url = new URL(req.url);
    const id = url.searchParams.get('id');
    const statusFilter = url.searchParams.get('status');
    const includeRules = url.searchParams.get('include_rules') === 'true';

    // Single version by ID
    if (id) {
      const { data: version, error: vErr } = await supabase
        .from('constitution_versions')
        .select('*')
        .eq('id', id)
        .single();

      if (vErr || !version) {
        return badRequest('Version not found', undefined, req);
      }

      const { data: rules } = await supabase
        .from('constitution_rules')
        .select('*')
        .eq('version_id', id)
        .order('sort_order', { ascending: true });

      return success({ version: { ...version, rules: rules ?? [] } }, 200, req);
    }

    // List versions
    let query = supabase
      .from('constitution_versions')
      .select('*')
      .order('created_at', { ascending: false });

    if (statusFilter && statusFilter !== 'all') {
      query = query.eq('status', statusFilter);
    }

    const { data: versions, error: listErr } = await query;

    if (listErr) {
      console.error('Error listing versions:', listErr);
      return internalError('Failed to list versions', undefined, req);
    }

    // Optionally include rules for each version
    if (includeRules && versions && versions.length > 0) {
      const versionIds = versions.map(
        (v: Record<string, unknown>) => v.id as string
      );
      const { data: allRules } = await supabase
        .from('constitution_rules')
        .select('*')
        .in('version_id', versionIds)
        .order('sort_order', { ascending: true });

      const rulesByVersion = new Map<string, unknown[]>();
      for (const rule of allRules ?? []) {
        const vid = (rule as Record<string, unknown>).version_id as string;
        if (!rulesByVersion.has(vid)) rulesByVersion.set(vid, []);
        rulesByVersion.get(vid)!.push(rule);
      }

      const enriched = versions.map((v: Record<string, unknown>) => ({
        ...v,
        rules: rulesByVersion.get(v.id as string) ?? [],
      }));

      return success({ versions: enriched }, 200, req);
    }

    return success({ versions: versions ?? [] }, 200, req);
  } catch (err) {
    console.error('Constitution versions error:', err);
    return internalError('Failed to fetch versions', undefined, req);
  }
});
