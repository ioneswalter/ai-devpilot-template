/**
 * Handler functions for test-execution API
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import { jsonResponse, errorResponse, SubmitResultsSchema, CreateTestCaseSchema } from './auth.ts';

export async function handleSubmitResults(
  supabase: SupabaseClient,
  body: z.infer<typeof SubmitResultsSchema>,
  userId: string,
): Promise<Response> {
  const { feature_id, environment, results } = body;

  // Verify all test_case_ids belong to this feature
  const caseIds = results.map((r) => r.test_case_id);
  const { data: validCases, error: caseError } = await supabase
    .from('test_cases')
    .select('id')
    .eq('feature_id', feature_id)
    .in('id', caseIds);

  if (caseError) {
    return errorResponse('DB_ERROR', caseError.message, 500);
  }

  const validIds = new Set((validCases ?? []).map((c: { id: string }) => c.id));
  const invalid = caseIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return errorResponse(
      'INVALID_TEST_CASES',
      `Test case(s) not found for this feature: ${invalid.join(', ')}`,
      400,
    );
  }

  const now = new Date().toISOString();
  const runRows = results.map((r) => ({
    id: crypto.randomUUID(),
    test_case_id: r.test_case_id,
    environment,
    result: r.result,
    error_message: r.notes ?? null,
    evidence: r.evidence ?? null,
    executed_by: userId,
    executed_at: now,
  }));

  const { data: testRuns, error: insertError } = await supabase
    .from('test_runs')
    .insert(runRows)
    .select('*');

  if (insertError) {
    return errorResponse('DB_ERROR', insertError.message, 500);
  }

  // Update test_cases.passed for non-skipped results
  const updates = results
    .filter((r) => r.result !== 'skipped')
    .map((r) =>
      supabase
        .from('test_cases')
        .update({ passed: r.result === 'passed' })
        .eq('id', r.test_case_id)
    );

  await Promise.all(updates);

  return jsonResponse({ test_runs: testRuns }, 201);
}

export async function handleGetHistory(
  supabase: SupabaseClient,
  featureId: string,
): Promise<Response> {
  const { data, error } = await supabase
    .from('test_runs')
    .select(`
      id,
      test_case_id,
      environment,
      result,
      error_message,
      evidence,
      executed_at,
      executed_by,
      duration_ms,
      test_cases!inner (
        id,
        title,
        test_code,
        feature_id
      )
    `)
    .eq('test_cases.feature_id', featureId)
    .order('executed_at', { ascending: false })
    .limit(50);

  if (error) {
    return errorResponse('DB_ERROR', error.message, 500);
  }

  return jsonResponse({ test_runs: data });
}

export async function handleReleaseSummary(
  supabase: SupabaseClient,
  featureId: string,
): Promise<Response> {
  const { data: testCases, error } = await supabase
    .from('test_cases')
    .select('id, passed')
    .eq('feature_id', featureId);

  if (error) {
    return errorResponse('DB_ERROR', error.message, 500);
  }

  const cases = testCases ?? [];
  const total = cases.length;
  const passed = cases.filter((tc: { passed: boolean | null }) => tc.passed === true).length;
  const failed = cases.filter((tc: { passed: boolean | null }) => tc.passed === false).length;
  const notRun = cases.filter((tc: { passed: boolean | null }) => tc.passed === null).length;

  // Get last run timestamp
  const { data: lastRun } = await supabase
    .from('test_runs')
    .select('executed_at, test_cases!inner(feature_id)')
    .eq('test_cases.feature_id', featureId)
    .order('executed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastRunAt = lastRun?.executed_at ?? null;
  const isReady = total > 0 && failed === 0 && notRun === 0;

  // Count auto-verified vs human-verified (FR-109 J4)
  const caseIds = cases.map((c: { id: string }) => c.id);
  let autoVerified = 0;
  let humanVerified = 0;

  if (caseIds.length > 0) {
    const { data: latestRuns } = await supabase
      .from('test_runs')
      .select('test_case_id, evidence')
      .in('test_case_id', caseIds)
      .order('executed_at', { ascending: false });

    const seenCases = new Set<string>();
    for (const run of latestRuns ?? []) {
      if (seenCases.has(run.test_case_id)) continue;
      seenCases.add(run.test_case_id);
      const ev = run.evidence as Record<string, unknown> | null;
      if (ev?.type === 'automated') autoVerified++;
      else humanVerified++;
    }
  }

  return jsonResponse({
    total, passed, failed, notRun, lastRunAt, isReady,
    autoVerified, humanVerified,
  });
}

export async function handleCreateTestCase(
  supabase: SupabaseClient,
  body: unknown,
  userId: string,
): Promise<Response> {
  const validation = CreateTestCaseSchema.safeParse(body);
  if (!validation.success) {
    const msg = validation.error.errors.map((e) => e.message).join('; ');
    return errorResponse('VALIDATION_ERROR', msg, 400);
  }

  const { feature_id, title, steps, expected_result, test_type } = validation.data;

  // Generate test code
  const { count } = await supabase
    .from('test_cases')
    .select('id', { count: 'exact', head: true })
    .eq('feature_id', feature_id);

  const num = ((count ?? 0) + 1).toString().padStart(3, '0');
  const featureCode = feature_id.slice(0, 8).toUpperCase();
  const testCode = `TC-${featureCode}-${num}`;

  const { data: testCase, error } = await supabase
    .from('test_cases')
    .insert({
      id: crypto.randomUUID(),
      feature_id,
      test_code: testCode,
      title,
      steps: JSON.stringify(steps),
      expected_result: expected_result,
      test_type,
      automated: false,
      created_by: userId,
    })
    .select('id, test_code')
    .single();

  if (error) return errorResponse('DB_ERROR', error.message, 500);
  return jsonResponse({ data: testCase }, 201);
}
