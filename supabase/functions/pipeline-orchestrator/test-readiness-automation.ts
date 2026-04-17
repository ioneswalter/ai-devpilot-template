/**
 * Test Readiness — Automated Tests + Status + Notification steps (FR-116)
 * Runs automated test scripts, updates feature status, creates notifications
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendLog } from './shared.ts';

type SupabaseClient = ReturnType<typeof createClient>;

export interface AutomatedTestsResult {
  status: 'success' | 'failed' | 'skipped';
  duration_ms: number;
  errors: string[];
  total: number;
  passed: number;
  failed: number;
  is_release_ready: boolean;
}

export interface StatusUpdateResult {
  status: 'success' | 'failed';
  from: string;
  to: string;
}

export async function runAutomatedTests(
  supabase: SupabaseClient,
  pipelineId: string,
  featureId: string,
): Promise<AutomatedTestsResult> {
  const start = Date.now();
  try {
    const { data: scripts, error: queryErr } = await supabase
      .from('automated_test_scripts')
      .select('id')
      .eq('feature_id', featureId)
      .eq('is_stale', false);

    if (queryErr || !scripts?.length) {
      await appendLog(supabase, pipelineId, 'info', 'No automated scripts — skipping');
      return { status: 'skipped', duration_ms: Date.now() - start, errors: [], total: 0, passed: 0, failed: 0, is_release_ready: false };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const response = await fetch(`${supabaseUrl}/functions/v1/test-automation?action=execute-suite`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceKey}`,
      },
      body: JSON.stringify({
        feature_id: featureId,
        environment: 'development',
        pipeline_run_id: pipelineId,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Suite execution failed: ${errText.substring(0, 200)}`);
    }

    const result = await response.json();
    const data = result.data;

    await appendLog(supabase, pipelineId, 'info',
      `Automated tests: ${data.passed}/${data.total_scripts} passed, ${data.failed} failed`);

    return {
      status: data.failed > 0 ? 'failed' : 'success',
      duration_ms: Date.now() - start,
      errors: data.failed > 0 ? [`${data.failed} automated test(s) failed`] : [],
      total: data.total_scripts,
      passed: data.passed,
      failed: data.failed,
      is_release_ready: data.is_release_ready,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    await appendLog(supabase, pipelineId, 'warn', `Automated tests failed: ${msg}`);
    return { status: 'failed', duration_ms: Date.now() - start, errors: [msg], total: 0, passed: 0, failed: 0, is_release_ready: false };
  }
}

export async function updateFeatureStatus(
  supabase: SupabaseClient,
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
  } catch {
    return { status: 'failed', from: currentStatus, to: 'testing' };
  }
}

export async function createNotification(
  supabase: SupabaseClient,
  pipelineId: string,
  featureId: string,
  feature: Record<string, unknown> | null,
  statusUpdateStatus: string,
  testCasesCreated: number,
  seedRecords: number,
): Promise<void> {
  try {
    const featureTitle = (feature?.feature_code ?? '') + ' ' + (feature?.title ?? 'Feature');
    const type = statusUpdateStatus === 'success' ? 'test_ready' : 'readiness_failed';
    const details = [
      testCasesCreated > 0 ? `${testCasesCreated} test cases generated` : '',
      seedRecords > 0 ? `${seedRecords} seed records created` : '',
    ].filter(Boolean).join(', ');

    await supabase.from('pipeline_notifications').insert({
      feature_id: featureId,
      pipeline_id: pipelineId,
      type,
      title: `${featureTitle} ready for testing`,
      message: details || 'Feature is ready for testing',
    });
  } catch (err: unknown) {
    await appendLog(supabase, pipelineId, 'warn',
      `Notification creation failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}
