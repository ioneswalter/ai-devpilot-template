/**
 * Test Data Check handler (FR-111, Journey 4)
 * Returns whether active test data exists for a feature.
 * Supports both user-token and service-role authentication.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

function getSupabase() {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
}

/** Verify auth — accepts user JWT or service-role key */
function verifyToken(req: Request): { valid: boolean; isServiceRole: boolean } {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return { valid: false, isServiceRole: false };
  }
  const token = authHeader.substring(7);
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (token === serviceKey) {
    return { valid: true, isServiceRole: true };
  }
  return { valid: true, isServiceRole: false };
}

/** GET ?action=check&feature_id=X — Check if active test data exists */
export async function handleCheck(req: Request): Promise<Response> {
  const { valid, isServiceRole } = verifyToken(req);
  if (!valid) {
    return error('UNAUTHORIZED', 'Missing authorization', 401);
  }

  const supabase = getSupabase();

  // If not service-role, verify user token
  if (!isServiceRole) {
    const authHeader = req.headers.get('Authorization')!;
    const { error: authErr } = await supabase.auth.getUser(authHeader.substring(7));
    if (authErr) return error('UNAUTHORIZED', 'Invalid token', 401);
  }

  const url = new URL(req.url);
  const featureId = url.searchParams.get('feature_id');
  if (!featureId) return error('VALIDATION_ERROR', 'feature_id required', 400);

  const { data: datasets } = await supabase
    .from('test_data_sets')
    .select('id, feature_id, records_created, status, created_at')
    .eq('feature_id', featureId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(5);

  const hasActiveData = (datasets ?? []).length > 0;
  const latestDataset = hasActiveData ? datasets![0] : null;

  return json({
    data: {
      has_active_data: hasActiveData,
      dataset_count: (datasets ?? []).length,
      latest_dataset: latestDataset
        ? {
            id: latestDataset.id,
            records_created: latestDataset.records_created,
            created_at: latestDataset.created_at,
          }
        : null,
    },
  });
}
