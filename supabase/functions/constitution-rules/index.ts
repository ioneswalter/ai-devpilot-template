/**
 * Constitution Rules Edge Function (FR-128)
 * GET: Retrieve rules for a specific version
 *
 * Query params:
 *   - version_id: Required - the constitution version ID
 *   - rule_number: Optional - get a specific rule
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { success, badRequest, internalError, corsResponse } from '../_shared/response.ts';
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

    if (!versionId) {
      return badRequest('version_id is required', undefined, req);
    }

    // Verify version exists
    const { data: version, error: vErr } = await supabase
      .from('constitution_versions')
      .select('id, version, status')
      .eq('id', versionId)
      .single();

    if (vErr || !version) {
      return badRequest('Version not found', undefined, req);
    }

    // Get specific rule or all rules
    if (ruleNumber) {
      const { data: rule, error: rErr } = await supabase
        .from('constitution_rules')
        .select('*')
        .eq('version_id', versionId)
        .eq('rule_number', ruleNumber)
        .single();

      if (rErr || !rule) {
        return badRequest('Rule not found', undefined, req);
      }

      return success({ rule, version }, 200, req);
    }

    const { data: rules, error: rErr } = await supabase
      .from('constitution_rules')
      .select('*')
      .eq('version_id', versionId)
      .order('sort_order', { ascending: true });

    if (rErr) {
      console.error('Error fetching rules:', rErr);
      return internalError('Failed to fetch rules', undefined, req);
    }

    return success({ rules: rules ?? [], version }, 200, req);
  } catch (err) {
    console.error('Constitution rules error:', err);
    return internalError('Failed to fetch rules', undefined, req);
  }
});
