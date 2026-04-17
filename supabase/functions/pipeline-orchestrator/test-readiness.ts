/**
 * Test Readiness Handler (FR-116)
 * After deploy succeeds, seeds test data, generates test cases, updates
 * feature status, and creates a notification. Non-blocking: failures
 * in any step don't prevent other steps from running.
 *
 * Logic is split across:
 * - test-readiness-seed.ts  (Step 1: seed data generation)
 * - test-readiness-cases.ts (Step 2: test case generation)
 * - test-readiness-automation.ts (Steps 2.5-4: automated tests, status, notification)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendLog } from './shared.ts';
import { seedTestData, type SeedDataResult } from './test-readiness-seed.ts';
import { generateTestCases, type TestCaseResult } from './test-readiness-cases.ts';
import {
  runAutomatedTests,
  updateFeatureStatus,
  createNotification,
  type AutomatedTestsResult,
  type StatusUpdateResult,
} from './test-readiness-automation.ts';

interface ReadinessResults {
  seed_data: SeedDataResult;
  test_cases: TestCaseResult;
  automated_tests: AutomatedTestsResult;
  status_update: StatusUpdateResult;
  started_at: string;
  completed_at: string;
  overall_status: 'success' | 'partial' | 'failed';
}

export async function runTestReadiness(
  pipelineId: string,
  requestId: string,
): Promise<void> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  // Transition to readying stage
  await supabase.from('pipeline_runs').update({
    current_stage: 'readying',
    last_heartbeat: new Date().toISOString(),
  }).eq('id', pipelineId);

  await appendLog(supabase, pipelineId, 'info', 'Starting test readiness preparation');

  const results: ReadinessResults = {
    seed_data: { status: 'skipped', duration_ms: 0, errors: [], records: 0 },
    test_cases: { status: 'skipped', duration_ms: 0, errors: [], created: 0, skipped: 0 },
    automated_tests: { status: 'skipped', duration_ms: 0, errors: [], total: 0, passed: 0, failed: 0, is_release_ready: false },
    status_update: { status: 'failed', from: '', to: 'testing' },
    started_at: new Date().toISOString(),
    completed_at: '',
    overall_status: 'failed',
  };

  // Get feature context
  const { data: pipelineRun } = await supabase
    .from('pipeline_runs')
    .select('feature_id, request_id')
    .eq('id', pipelineId)
    .single();

  if (!pipelineRun) {
    await failReadiness(supabase, pipelineId, results, 'Pipeline run not found');
    return;
  }

  const featureId = pipelineRun.feature_id;

  // Get feature + spec context
  const { data: feature } = await supabase
    .from('product_features')
    .select('id, feature_code, title, status, description, acceptance_criteria')
    .eq('id', featureId)
    .single();

  const { data: implRequest } = await supabase
    .from('implementation_requests')
    .select('ai_response, implementation_notes')
    .eq('id', requestId)
    .single();

  const specContext = buildSpecContext(feature, implRequest);

  // Step 1: Seed test data
  results.seed_data = await seedTestData(supabase, pipelineId, featureId, specContext);

  // Step 2: Generate test cases
  results.test_cases = await generateTestCases(supabase, pipelineId, featureId, feature, specContext);

  // Step 2.5: Run automated tests (FR-109 J4)
  results.automated_tests = await runAutomatedTests(supabase, pipelineId, featureId);

  // Step 3: Update feature status
  results.status_update = await updateFeatureStatus(supabase, pipelineId, featureId, feature?.status ?? '');

  // Step 4: Create notification
  await createNotification(
    supabase, pipelineId, featureId, feature,
    results.status_update.status,
    results.test_cases.created,
    results.seed_data.records,
  );

  // Finalize
  results.completed_at = new Date().toISOString();
  const stepStatuses = [results.seed_data.status, results.test_cases.status, results.status_update.status];
  if (results.automated_tests.status !== 'skipped') {
    stepStatuses.push(results.automated_tests.status);
  }
  const allSuccess = stepStatuses.every((s) => s === 'success');
  const allFailed = stepStatuses.every((s) => s === 'failed');

  results.overall_status = allSuccess ? 'success' : allFailed ? 'failed' : 'partial';

  const finalStage = results.overall_status === 'failed' ? 'readiness_partial' : 'ready_for_testing';

  await supabase.from('pipeline_runs').update({
    status: 'completed',
    current_stage: finalStage,
    readiness_results: results,
    completed_at: new Date().toISOString(),
    last_heartbeat: new Date().toISOString(),
  }).eq('id', pipelineId);

  await appendLog(supabase, pipelineId, 'info',
    `Test readiness ${results.overall_status}: ` +
    `${results.seed_data.records} seed records, ` +
    `${results.test_cases.created} test cases created`);
}

function buildSpecContext(
  feature: Record<string, unknown> | null,
  implRequest: Record<string, unknown> | null,
): string {
  const parts: string[] = [];
  if (feature?.title) parts.push(`Feature: ${feature.title}`);
  if (feature?.description) parts.push(`Description: ${feature.description}`);
  if (feature?.acceptance_criteria) {
    const criteria = feature.acceptance_criteria as string[];
    if (Array.isArray(criteria) && criteria.length > 0) {
      parts.push('Acceptance Criteria:\n' + criteria.map((c, i) => `${i + 1}. ${c}`).join('\n'));
    }
  }
  const aiResponse = implRequest?.ai_response as Record<string, string> | null;
  if (aiResponse?.summary) parts.push(`Implementation Summary: ${aiResponse.summary}`);
  if (aiResponse?.architecture_notes) parts.push(`Architecture: ${aiResponse.architecture_notes}`);
  if (implRequest?.implementation_notes) parts.push(`Notes: ${implRequest.implementation_notes}`);
  return parts.join('\n\n');
}

async function failReadiness(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  results: ReadinessResults,
  error: string,
): Promise<void> {
  results.completed_at = new Date().toISOString();
  results.overall_status = 'failed';

  await supabase.from('pipeline_runs').update({
    status: 'completed',
    current_stage: 'readiness_partial',
    readiness_results: results,
    completed_at: new Date().toISOString(),
  }).eq('id', pipelineId);

  await appendLog(supabase, pipelineId, 'error', `Test readiness failed: ${error}`);
}
