/**
 * devpilot-merge-in-flight Edge Function (FR-149 v1.1, T050 / J7)
 *
 * POST: append a proposal's acceptance criteria into a feature's in-flight v1.N
 * spec, instead of attempting a second version bump that would fail with
 * "Only released features can be version-bumped."
 *
 * Runs server-side with the service role so the merge bypasses RLS for
 * non-owner admins (J8 / FR-019). Compensation logic isn't needed here because
 * we don't bump — we only append to an already-existing in-flight version.
 *
 * Request body:
 *   { feature_code, conversation_id, criteria, throwaway_feature_id }
 *
 * Response:
 *   { feature: {...}, merged_criteria: [...] }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import { getInFlightVersion, mergeIntoInFlightVersion } from '../_shared/version-utils.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

const requestSchema = z.object({
  feature_code: z.string().regex(/^FR-\d+$/, 'feature_code must match FR-\\d+'),
  conversation_id: z.string().min(1),
  criteria: z.array(z.string().min(1)).min(1, 'At least one criterion required'),
  throwaway_feature_id: z.string().uuid('throwaway_feature_id must be a UUID'),
});

async function deleteThrowawayFeature(
  supabase: ReturnType<typeof createClient>,
  featureId: string
): Promise<void> {
  const r1 = await supabase.from('test_cases').delete().eq('feature_id', featureId);
  if (r1.error) throw new Error(`Cleanup failed (test_cases): ${r1.error.message}`);
  const r2 = await supabase.from('feature_spec_artifacts').delete().eq('feature_id', featureId);
  if (r2.error) throw new Error(`Cleanup failed (feature_spec_artifacts): ${r2.error.message}`);
  const r3 = await supabase.from('product_features').delete().eq('id', featureId);
  if (r3.error) throw new Error(`Cleanup failed (product_features): ${r3.error.message}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only POST requests allowed', 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(authHeader.substring(7));
    if (authErr || !user) return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!adminRow) return errorResponse('FORBIDDEN', 'Admin role required', 403);

    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
    }
    const { feature_code, conversation_id, criteria, throwaway_feature_id } = validation.data;

    const { data: target, error: tErr } = await supabase
      .from('product_features')
      .select('id, feature_code, title, status, priority, category')
      .eq('feature_code', feature_code)
      .single();
    if (tErr || !target) {
      return errorResponse('NOT_FOUND', `Feature ${feature_code} not found`, 404);
    }

    const inFlight = await getInFlightVersion(supabase, target.id as string);
    if (!inFlight) {
      return errorResponse(
        'NO_IN_FLIGHT_VERSION',
        `${feature_code} has no in-flight version to merge into. Use version_bump instead.`,
        409
      );
    }

    const { merged_criteria } = await mergeIntoInFlightVersion(supabase, inFlight.id, criteria);

    const { error: relinkErr } = await supabase
      .from('ideation_conversations')
      .update({ submitted_feature_id: target.id, status: 'submitted' })
      .eq('id', conversation_id);
    if (relinkErr) {
      return errorResponse(
        'DATABASE_ERROR',
        `Failed to re-link conversation: ${relinkErr.message}`,
        500
      );
    }

    await deleteThrowawayFeature(supabase, throwaway_feature_id);

    return jsonResponse({
      data: {
        feature: target,
        in_flight_version_label: inFlight.version_label,
        merged_criteria,
      },
    });
  } catch (err) {
    console.error('devpilot-merge-in-flight error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
