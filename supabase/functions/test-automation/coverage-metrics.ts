/**
 * Coverage Metrics Handler (FR-109 Journey 5)
 * Computes automation coverage, lists scripts, handles deletion.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}

export async function handleGetCoverage(
  supabase: SupabaseClient,
  featureId: string,
): Promise<Response> {
  // Get test case counts
  const { data: testCases } = await supabase
    .from('test_cases')
    .select('id, automation_status')
    .eq('feature_id', featureId);

  const cases = testCases ?? [];
  const total = cases.length;
  const automated = cases.filter((c: { automation_status: string }) =>
    c.automation_status === 'automated',
  ).length;
  const stale = cases.filter((c: { automation_status: string }) =>
    c.automation_status === 'stale',
  ).length;
  const manual = total - automated - stale;

  // Get acceptance criteria count
  const { data: feature } = await supabase
    .from('product_features')
    .select('acceptance_criteria')
    .eq('id', featureId)
    .single();

  const criteria: string[] = feature?.acceptance_criteria || [];
  const criteriaTotal = criteria.length;

  // Count criteria with automated coverage
  const { data: scripts } = await supabase
    .from('automated_test_scripts')
    .select('script_steps')
    .eq('feature_id', featureId)
    .eq('is_stale', false);

  const coveredIndices = new Set<number>();
  for (const script of scripts ?? []) {
    const steps = script.script_steps as Array<{ criterion_index?: number }>;
    for (const step of steps) {
      if (step.criterion_index !== undefined) {
        coveredIndices.add(step.criterion_index);
      }
    }
  }
  const criteriaAutomated = Math.min(coveredIndices.size, criteriaTotal);

  const percentage = total > 0 ? Math.round((automated / total) * 10000) / 100 : 0;

  // Update cache
  const cacheRow = {
    feature_id: featureId,
    total_test_cases: total,
    automated_count: automated,
    manual_count: manual,
    stale_count: stale,
    criteria_total: criteriaTotal,
    criteria_automated: criteriaAutomated,
    coverage_percentage: percentage,
    last_computed_at: new Date().toISOString(),
  };

  await supabase
    .from('automation_coverage_cache')
    .upsert(cacheRow, { onConflict: 'feature_id' });

  // Load trend data
  const { data: cache } = await supabase
    .from('automation_coverage_cache')
    .select('trend_data')
    .eq('feature_id', featureId)
    .single();

  const trend = (cache?.trend_data as Array<{ date: string; percentage: number }>) || [];

  return jsonResponse({
    data: {
      feature_id: featureId,
      total_test_cases: total,
      automated_count: automated,
      manual_count: manual,
      stale_count: stale,
      criteria_total: criteriaTotal,
      criteria_automated: criteriaAutomated,
      coverage_percentage: percentage,
      trend,
      last_computed_at: cacheRow.last_computed_at,
    },
  });
}

export async function handleListScripts(
  supabase: SupabaseClient,
  featureId: string,
): Promise<Response> {
  const { data: scripts, error } = await supabase
    .from('automated_test_scripts')
    .select(`
      id, test_case_id, generation_source, is_stale, is_custom_modified,
      last_run_result, last_run_at, created_at, script_steps,
      test_cases!inner(title)
    `)
    .eq('feature_id', featureId)
    .order('created_at', { ascending: false });

  if (error) return errorResponse('DB_ERROR', error.message, 500);

  const list = (scripts ?? []).map((s: Record<string, unknown>) => {
    const steps = s.script_steps as unknown[];
    const tc = s.test_cases as { title: string };
    return {
      id: s.id,
      test_case_id: s.test_case_id,
      test_case_title: tc?.title || 'Unknown',
      step_count: Array.isArray(steps) ? steps.length : 0,
      generation_source: s.generation_source,
      is_stale: s.is_stale,
      is_custom_modified: s.is_custom_modified,
      last_run_result: s.last_run_result,
      last_run_at: s.last_run_at,
      created_at: s.created_at,
    };
  });

  return jsonResponse({ data: { scripts: list } });
}

export async function handleDeleteScript(
  supabase: SupabaseClient,
  scriptId: string,
  force: boolean,
): Promise<Response> {
  const { data: script } = await supabase
    .from('automated_test_scripts')
    .select('id, test_case_id, is_custom_modified')
    .eq('id', scriptId)
    .single();

  if (!script) return errorResponse('SCRIPT_NOT_FOUND', 'Script not found', 404);

  if (script.is_custom_modified && !force) {
    return errorResponse(
      'CUSTOM_MODIFIED',
      'Script has manual edits. Use ?force=true to delete.',
      409,
    );
  }

  await supabase.from('automated_test_scripts').delete().eq('id', scriptId);

  // Revert test case to manual
  await supabase
    .from('test_cases')
    .update({
      automated: false,
      automation_status: 'manual',
    })
    .eq('id', script.test_case_id);

  return jsonResponse({
    data: {
      deleted_script_id: scriptId,
      test_case_id: script.test_case_id,
      automation_status: 'manual',
    },
  });
}
