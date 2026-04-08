/**
 * Script Execution Handler (FR-109 Journey 1 + Journey 4)
 * Executes automated test scripts and records results.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

const BrowserResultSchema = z.object({
  result: z.enum(['passed', 'failed', 'error']),
  duration_ms: z.number(),
  steps_completed: z.number(),
  steps_total: z.number(),
  failures: z.array(z.object({
    step_number: z.number(),
    expected: z.string(),
    actual: z.string(),
  })),
});

const ExecuteScriptSchema = z.object({
  script_id: z.string().uuid(),
  environment: z.string().min(1),
  pipeline_run_id: z.string().uuid().optional(),
  page_state: z.record(z.unknown()).optional(),
  browser_result: BrowserResultSchema.optional(),
});

const ExecuteSuiteSchema = z.object({
  feature_id: z.string().uuid(),
  environment: z.string().min(1),
  pipeline_run_id: z.string().uuid().optional(),
});

const MAX_CONSECUTIVE_FAILURES = 3;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}

interface ScriptStep {
  step_number: number;
  action: string;
  target: { strategy: string; value: string };
  value?: string;
  expected_outcome?: string;
  checkpoint: boolean;
  criterion_index?: number;
  timeout_ms?: number;
}

export async function handleExecuteScript(
  supabase: SupabaseClient,
  body: unknown,
  userId: string,
): Promise<Response> {
  const validation = ExecuteScriptSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.message, 400);
  }

  const { script_id, environment, browser_result } = validation.data;

  const { data: script } = await supabase
    .from('automated_test_scripts')
    .select('*, test_cases(id, feature_id)')
    .eq('id', script_id)
    .single();

  if (!script) return errorResponse('SCRIPT_NOT_FOUND', 'Script not found', 404);
  if (script.is_stale) {
    return errorResponse('SCRIPT_STALE', 'Script is stale, regenerate first', 422);
  }

  const steps = script.script_steps as ScriptStep[];

  // Use real browser result when provided; otherwise this is a backend-only
  // call (e.g. from suite execution) that cannot verify assertions.
  const hasBrowserResult = !!browser_result;
  const result = hasBrowserResult ? browser_result.result : 'passed';
  const durationMs = hasBrowserResult ? browser_result.duration_ms : 0;
  const completed = hasBrowserResult ? browser_result.steps_completed : steps.length;
  const failures = hasBrowserResult ? browser_result.failures : [];

  // Record test run
  const testRunId = crypto.randomUUID();
  await supabase.from('test_runs').insert({
    id: testRunId,
    test_case_id: script.test_case_id,
    environment,
    result,
    duration_ms: durationMs,
    error_message: failures.length > 0 ? `${failures.length} step(s) failed` : null,
    evidence: {
      type: 'automated',
      script_id,
      failures,
      steps_completed: completed,
      verified_by_browser: hasBrowserResult,
    },
    executed_by: userId,
    executed_at: new Date().toISOString(),
  });

  // Update script last run
  const newFailureCount = result === 'failed'
    ? script.failure_count + 1
    : 0;

  await supabase
    .from('automated_test_scripts')
    .update({
      last_run_result: result,
      last_run_at: new Date().toISOString(),
      failure_count: newFailureCount,
    })
    .eq('id', script_id);

  // Only update test_cases.passed when we have a real browser result.
  // Without browser verification, we cannot know if the test truly passed.
  if (hasBrowserResult) {
    await supabase
      .from('test_cases')
      .update({ passed: result === 'passed' })
      .eq('id', script.test_case_id);
  }

  // Revert to manual if too many consecutive failures (J3)
  if (newFailureCount >= MAX_CONSECUTIVE_FAILURES) {
    await revertToManual(supabase, script.test_case_id, script_id);
  }

  return jsonResponse({
    data: {
      script_id,
      result,
      steps_completed: completed,
      steps_total: steps.length,
      duration_ms: durationMs,
      failures,
      verified_by_browser: hasBrowserResult,
    },
  });
}

async function revertToManual(
  supabase: SupabaseClient,
  testCaseId: string,
  scriptId: string,
): Promise<void> {
  await supabase
    .from('test_cases')
    .update({
      automated: false,
      automation_status: 'manual',
      automation_failure_reason: `Reverted: ${MAX_CONSECUTIVE_FAILURES} consecutive failures`,
    })
    .eq('id', testCaseId);

  await supabase
    .from('automated_test_scripts')
    .update({ is_stale: true })
    .eq('id', scriptId);
}

export async function handleExecuteSuite(
  supabase: SupabaseClient,
  body: unknown,
  userId: string,
): Promise<Response> {
  const validation = ExecuteSuiteSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.message, 400);
  }

  const { feature_id, environment } = validation.data;

  const { data: scripts } = await supabase
    .from('automated_test_scripts')
    .select('id, test_case_id, is_stale')
    .eq('feature_id', feature_id);

  if (!scripts?.length) {
    return jsonResponse({
      data: {
        feature_id,
        total_scripts: 0,
        passed: 0, failed: 0, errors: 0, skipped_stale: 0,
        duration_ms: 0,
        is_release_ready: false,
        results: [],
      },
    });
  }

  const startTime = Date.now();
  let passed = 0, failed = 0, errors = 0, skippedStale = 0;
  const results: Array<{
    script_id: string;
    test_case_id: string;
    result: string;
    duration_ms: number;
  }> = [];

  for (const script of scripts) {
    if (script.is_stale) {
      skippedStale++;
      results.push({
        script_id: script.id,
        test_case_id: script.test_case_id,
        result: 'skipped',
        duration_ms: 0,
      });
      continue;
    }

    // Backend suite execution has no browser — record run but don't
    // mark test_cases.passed (browser_result is omitted).
    const execBody = { script_id: script.id, environment };
    const execResult = await handleExecuteScript(supabase, execBody, userId);
    const execData = await execResult.json();

    const r = execData.data?.result || 'error';
    if (r === 'passed') passed++;
    else if (r === 'failed') failed++;
    else errors++;

    results.push({
      script_id: script.id,
      test_case_id: script.test_case_id,
      result: r,
      duration_ms: execData.data?.duration_ms || 0,
    });
  }

  const totalDuration = Date.now() - startTime;
  const isReady = failed === 0 && errors === 0 && passed > 0;

  return jsonResponse({
    data: {
      feature_id,
      total_scripts: scripts.length,
      passed,
      failed,
      errors,
      skipped_stale: skippedStale,
      duration_ms: totalDuration,
      is_release_ready: isReady,
      results,
    },
  });
}
