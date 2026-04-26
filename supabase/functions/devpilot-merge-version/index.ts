/**
 * devpilot-merge-version Edge Function (FR-149 v1.1, T053-T054 / J8)
 *
 * POST: bump a released feature to a new version AND merge a proposal's content
 * (title/description/criteria/priority) into product_features atomically. Replaces
 * the prior client-side flow in ProposalPanel.tsx.mergeIntoVersionedFeature,
 * which was hitting 406 because RLS blocks non-owner admins from updating
 * product_features rows they don't own.
 *
 * Runs server-side with the service role so the merge bypasses RLS (FR-019).
 *
 * Compensation (FR-020): if the merge UPDATE fails after the bump succeeded,
 * undoBump() removes the just-created in-flight version row and restores
 * product_features.status, so the user can safely retry without leaving a
 * phantom version.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import { bumpFeatureVersion, undoBump } from '../_shared/version-utils.ts';

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
  throwaway_feature_id: z.string().uuid('throwaway_feature_id must be a UUID'),
  proposal: z.object({
    title: z.string().min(1).max(200),
    description: z.string().min(1),
    criteria: z.array(z.string().min(1)).min(1),
    priority: z.enum(['P1', 'P2', 'P3', 'P4']),
  }),
  bump_type: z.enum(['minor', 'major']).default('minor'),
});

async function deleteThrowawayFeature(
  supabase: ReturnType<typeof createClient>,
  featureId: string,
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
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.substring(7));
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
    const { feature_code, conversation_id, throwaway_feature_id, proposal, bump_type } = validation.data;

    const { data: target, error: tErr } = await supabase
      .from('product_features')
      .select('id, feature_code, title, description, acceptance_criteria, status, priority, category')
      .eq('feature_code', feature_code)
      .single();
    if (tErr || !target) {
      return errorResponse('NOT_FOUND', `Feature ${feature_code} not found`, 404);
    }
    if (target.status !== 'released') {
      return errorResponse(
        'FEATURE_NOT_RELEASED',
        `${feature_code} is ${target.status}, not released. Use merge_in_flight if it has an in-flight version.`,
        400,
      );
    }

    let bump;
    try {
      bump = await bumpFeatureVersion(
        supabase,
        target.id as string,
        bump_type,
        `New version from Ideation: ${proposal.title}`,
        user.id,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Bump failed';
      return errorResponse('BUMP_FAILED', message, 500);
    }

    // Merge content into product_features. If this fails, compensate (FR-020).
    const mergedCriteria = [
      ...((target.acceptance_criteria as string[]) ?? []),
      ...proposal.criteria,
    ];
    const mergedDescription = `${target.description}\n\n${proposal.description}`;

    const { data: updated, error: updateErr } = await supabase
      .from('product_features')
      .update({
        description: mergedDescription,
        acceptance_criteria: mergedCriteria,
        priority: proposal.priority,
        updated_at: new Date().toISOString(),
      })
      .eq('id', target.id as string)
      .select('id, feature_code, title, status, priority, category')
      .single();

    if (updateErr || !updated) {
      console.error('Merge UPDATE failed, compensating:', updateErr);
      await undoBump(supabase, target.id as string, bump);
      return errorResponse(
        'MERGE_FAILED',
        `Merge failed and bump was rolled back: ${updateErr?.message ?? 'no data returned'}`,
        500,
      );
    }

    const { error: relinkErr } = await supabase
      .from('ideation_conversations')
      .update({ submitted_feature_id: target.id, status: 'submitted' })
      .eq('id', conversation_id);
    if (relinkErr) {
      console.error('Re-link failed (non-fatal, version already created):', relinkErr);
    }

    try {
      await deleteThrowawayFeature(supabase, throwaway_feature_id);
    } catch (cleanupErr) {
      console.error('Throwaway cleanup failed (non-fatal):', cleanupErr);
    }

    return jsonResponse({
      data: {
        feature: updated,
        new_version: {
          id: bump.new_version_id,
          version_label: bump.new_version_label,
          version_number: bump.new_version_number,
        },
        archived_version: bump.archived_version_id ? {
          id: bump.archived_version_id,
          version_label: bump.archived_version_label,
        } : null,
      },
    });
  } catch (err) {
    console.error('devpilot-merge-version error:', err);
    const message = err instanceof Error ? err.message : 'Internal error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
