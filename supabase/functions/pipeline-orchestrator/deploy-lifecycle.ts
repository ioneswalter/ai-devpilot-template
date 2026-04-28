/** Deploy lifecycle: complete and fail handlers (FR-115 + FR-119) */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendLog } from './shared.ts';
import { runTestReadiness } from './test-readiness.ts';
import { releaseDeployLock } from './deploy-lock.ts';
import type { DeployStepResult } from './deploy-steps.ts';

const MAX_RETRIES = 3;

export interface DeployResults {
  migrations: DeployStepResult[];
  functions: DeployStepResult[];
  started_at: string;
  completed_at: string;
  overall_status: 'success' | 'partial' | 'failed';
}

export async function completeDeploy(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  requestId: string,
  results: DeployResults
): Promise<void> {
  results.completed_at = new Date().toISOString();
  results.overall_status = 'success';

  await releaseDeployLock(supabase, pipelineId);

  await supabase
    .from('pipeline_runs')
    .update({
      status: 'completed',
      current_stage: 'deployed',
      current_task_id: null,
      deploy_results: results,
      completed_at: new Date().toISOString(),
    })
    .eq('id', pipelineId);

  await supabase
    .from('implementation_requests')
    .update({
      status: 'implemented',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  const migCount = results.migrations.filter((m) => m.status === 'success').length;
  const fnCount = results.functions.filter((f) => f.status === 'success').length;
  const summary =
    [migCount > 0 ? `${migCount} migration(s)` : '', fnCount > 0 ? `${fnCount} function(s)` : '']
      .filter(Boolean)
      .join(', ') || 'no server-side artifacts';

  await appendLog(supabase, pipelineId, 'info', `Deployment complete: ${summary}`);

  // FR-116: Chain to test readiness after successful deploy
  try {
    await runTestReadiness(pipelineId, requestId);
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    await appendLog(supabase, pipelineId, 'warn', `Test readiness error: ${errMsg}`);
  }
}

export async function failDeploy(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  requestId: string,
  results: DeployResults
): Promise<void> {
  results.completed_at = new Date().toISOString();

  // FR-142: Create escalation for the failed step
  const failedStep = [...results.migrations, ...results.functions].find(
    (s) => s.status === 'failed'
  );
  if (failedStep && failedStep.retry_count >= MAX_RETRIES) {
    await supabase.from('deploy_escalations').insert({
      pipeline_id: pipelineId,
      step_type: failedStep.action === 'execute_sql' ? 'migration' : 'function',
      step_artifact: failedStep.artifact,
      error_message: failedStep.error ?? 'Unknown error',
      fix_attempts_count: failedStep.fix_attempts.length,
      fix_attempts_detail: failedStep.fix_attempts,
      status: 'open',
    });
    await appendLog(
      supabase,
      pipelineId,
      'error',
      `SE Escalation created for ${failedStep.artifact}`
    );
  }

  await releaseDeployLock(supabase, pipelineId);

  await supabase
    .from('pipeline_runs')
    .update({
      status: 'completed',
      current_stage: 'deploy_failed',
      current_task_id: null,
      deploy_results: results,
      completed_at: new Date().toISOString(),
    })
    .eq('id', pipelineId);

  await supabase
    .from('implementation_requests')
    .update({
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  await appendLog(supabase, pipelineId, 'warn', 'Deployment failed — manual intervention required');
}
