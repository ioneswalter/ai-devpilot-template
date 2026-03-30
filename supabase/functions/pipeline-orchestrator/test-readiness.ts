/**
 * Test Readiness Handler (FR-116)
 * After deploy succeeds, seeds test data, generates test cases, updates
 * feature status, and creates a notification. Non-blocking: failures
 * in any step don't prevent other steps from running.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import pg from 'npm:pg@8.13.1';
import { appendLog } from './shared.ts';

interface ReadinessStepResult {
  status: 'success' | 'failed' | 'skipped';
  duration_ms: number;
  errors: string[];
}

interface SeedDataResult extends ReadinessStepResult {
  records: number;
}

interface TestCaseResult extends ReadinessStepResult {
  created: number;
  skipped: number;
}

interface StatusUpdateResult {
  status: 'success' | 'failed';
  from: string;
  to: string;
}

interface ReadinessResults {
  seed_data: SeedDataResult;
  test_cases: TestCaseResult;
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

  // Step 3: Update feature status
  results.status_update = await updateFeatureStatus(supabase, pipelineId, featureId, feature?.status ?? '');

  // Step 4: Create notification (J2 — included here for pipeline completeness)
  await createNotification(supabase, pipelineId, featureId, feature, results);

  // Finalize
  results.completed_at = new Date().toISOString();
  const allSuccess = results.seed_data.status === 'success' &&
    results.test_cases.status === 'success' &&
    results.status_update.status === 'success';
  const allFailed = results.seed_data.status === 'failed' &&
    results.test_cases.status === 'failed' &&
    results.status_update.status === 'failed';

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

// ── Step 1: Seed Test Data ──

async function seedTestData(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  featureId: string,
  specContext: string,
): Promise<SeedDataResult> {
  const start = Date.now();
  if (!specContext || specContext.length < 20) {
    await appendLog(supabase, pipelineId, 'warn', 'No spec context for seed data — skipping');
    return { status: 'skipped', duration_ms: Date.now() - start, errors: [], records: 0 };
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return { status: 'skipped', duration_ms: Date.now() - start, errors: ['ANTHROPIC_API_KEY not set'], records: 0 };
    }

    const anthropic = new Anthropic({ apiKey });
    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Given this feature context, generate realistic test data as a series of SQL INSERT statements that would help test the feature. Only generate INSERTs for tables that likely exist in a Supabase PostgreSQL database for a gig platform (service providers, customers, jobs, etc). Each INSERT must be idempotent (use ON CONFLICT DO NOTHING where possible). Return ONLY valid SQL, no markdown fences or explanation.

Feature context:
${specContext}

Requirements:
- Generate 3-8 realistic test records
- Use UUIDs for IDs (use gen_random_uuid())
- Include realistic data (names, descriptions, amounts)
- Target tables: product_features, test_cases, or domain tables mentioned in context
- Each statement on its own line, ending with semicolon`
      }],
    });

    const sqlText = (msg.content[0] as { text: string }).text.trim();
    if (!sqlText || sqlText.length < 10) {
      return { status: 'skipped', duration_ms: Date.now() - start, errors: ['AI returned empty SQL'], records: 0 };
    }

    // Execute via npm:pg
    const dbUrl = buildDbUrl();
    const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();

    const statements = sqlText.split(';').map((s: string) => s.trim()).filter((s: string) => s.length > 5);
    let inserted = 0;
    const errors: string[] = [];

    for (const stmt of statements) {
      try {
        await client.query(stmt);
        inserted++;
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(msg.substring(0, 200));
      }
    }

    await client.end();
    await appendLog(supabase, pipelineId, 'info', `Seed data: ${inserted}/${statements.length} records inserted`);

    return {
      status: errors.length === 0 ? 'success' : (inserted > 0 ? 'success' : 'failed'),
      duration_ms: Date.now() - start,
      errors,
      records: inserted,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendLog(supabase, pipelineId, 'warn', `Seed data failed: ${msg}`);
    return { status: 'failed', duration_ms: Date.now() - start, errors: [msg], records: 0 };
  }
}

function buildDbUrl(): string {
  const ref = (Deno.env.get('SUPABASE_URL') ?? '').replace('https://', '').split('.')[0];
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return `postgresql://postgres.${ref}:${key}@aws-0-ap-southeast-2.pooler.supabase.com:6543/postgres`;
}

// ── Step 2: Generate Test Cases ──

async function generateTestCases(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  featureId: string,
  feature: Record<string, unknown> | null,
  specContext: string,
): Promise<TestCaseResult> {
  const start = Date.now();
  if (!specContext || specContext.length < 20) {
    await appendLog(supabase, pipelineId, 'warn', 'No spec context for test cases — skipping');
    return { status: 'skipped', duration_ms: Date.now() - start, errors: [], created: 0, skipped: 0 };
  }

  try {
    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      return { status: 'skipped', duration_ms: Date.now() - start, errors: ['ANTHROPIC_API_KEY not set'], created: 0, skipped: 0 };
    }

    const anthropic = new Anthropic({ apiKey });
    const featureCode = (feature?.feature_code ?? 'FR-XXX') as string;

    const msg = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: `Given this feature context, generate test cases as a JSON array. Each test case should cover a user journey or acceptance scenario.

Feature context:
${specContext}

Return a JSON array (no markdown fences) where each object has:
- "title": short test case title (max 80 chars)
- "description": what to test
- "test_type": "e2e"
- "priority": "high" or "medium"
- "expected_result": what success looks like

Generate 4-10 test cases covering the main user journeys and edge cases.`
      }],
    });

    const rawJson = (msg.content[0] as { text: string }).text.trim();
    let testCases: Array<{ title: string; description: string; test_type: string; priority: string; expected_result: string }>;

    try {
      testCases = JSON.parse(rawJson);
    } catch {
      // Try extracting JSON from markdown
      const match = rawJson.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('AI did not return valid JSON array');
      testCases = JSON.parse(match[0]);
    }

    // Check for existing test cases to avoid duplicates
    const { data: existing } = await supabase
      .from('test_cases')
      .select('title')
      .eq('feature_id', featureId);

    const existingTitles = new Set((existing ?? []).map((t: { title: string }) => t.title.toLowerCase()));

    let created = 0;
    let skippedCount = 0;
    const errors: string[] = [];

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      if (existingTitles.has(tc.title.toLowerCase())) {
        skippedCount++;
        continue;
      }

      const testCode = `${featureCode}-TC${String(i + 1).padStart(2, '0')}`;
      const { error } = await supabase.from('test_cases').insert({
        test_code: testCode,
        feature_id: featureId,
        title: tc.title,
        description: tc.description,
        test_type: tc.test_type || 'e2e',
        priority: tc.priority || 'medium',
        expected_result: tc.expected_result,
        status: 'draft',
        created_by: 'ai-pipeline',
      });

      if (error) {
        // Handle duplicate test_code
        if (error.message?.includes('duplicate')) {
          skippedCount++;
        } else {
          errors.push(`${tc.title}: ${error.message}`);
        }
      } else {
        created++;
      }
    }

    await appendLog(supabase, pipelineId, 'info',
      `Test cases: ${created} created, ${skippedCount} skipped (existing)`);

    return {
      status: created > 0 || skippedCount > 0 ? 'success' : (errors.length > 0 ? 'failed' : 'skipped'),
      duration_ms: Date.now() - start,
      errors,
      created,
      skipped: skippedCount,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendLog(supabase, pipelineId, 'warn', `Test case generation failed: ${msg}`);
    return { status: 'failed', duration_ms: Date.now() - start, errors: [msg], created: 0, skipped: 0 };
  }
}

// ── Step 3: Update Feature Status ──

async function updateFeatureStatus(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  featureId: string,
  currentStatus: string,
): Promise<StatusUpdateResult> {
  try {
    if (currentStatus === 'testing' || currentStatus === 'released') {
      await appendLog(supabase, pipelineId, 'info',
        `Feature already "${currentStatus}" — skipping status update`);
      return { status: 'success', from: currentStatus, to: currentStatus };
    }

    const { error } = await supabase.from('product_features').update({
      status: 'testing',
      updated_at: new Date().toISOString(),
    }).eq('id', featureId);

    if (error) throw new Error(error.message);

    await appendLog(supabase, pipelineId, 'info',
      `Feature status: ${currentStatus} → testing`);

    return { status: 'success', from: currentStatus, to: 'testing' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'failed', from: currentStatus, to: 'testing' };
  }
}

// ── Step 4: Create Notification ──

async function createNotification(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  featureId: string,
  feature: Record<string, unknown> | null,
  results: ReadinessResults,
): Promise<void> {
  try {
    const featureTitle = (feature?.feature_code ?? '') + ' ' + (feature?.title ?? 'Feature');
    const type = results.status_update.status === 'success' ? 'test_ready' : 'readiness_failed';
    const details = [
      results.test_cases.created > 0 ? `${results.test_cases.created} test cases generated` : '',
      results.seed_data.records > 0 ? `${results.seed_data.records} seed records created` : '',
    ].filter(Boolean).join(', ');

    await supabase.from('pipeline_notifications').insert({
      feature_id: featureId,
      pipeline_id: pipelineId,
      type,
      title: `${featureTitle} ready for testing`,
      message: details || 'Feature is ready for testing',
    });
  } catch (err: unknown) {
    // Non-blocking — just log
    await appendLog(supabase, pipelineId, 'warn',
      `Notification creation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

// ── Failure handler ──

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
