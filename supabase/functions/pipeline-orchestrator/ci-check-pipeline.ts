/**
 * CI Check — Pipeline completion logic (FR-114)
 * Handles CI stage iteration, DB updates, and deploy transition
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { appendLog, onPipelineComplete } from './shared.ts';
import { runDeploy } from './deploy.ts';
import { captureFailure } from './failure-capture.ts';
import {
  validateStage,
  fixErrors,
  STAGE_LABELS,
  type CIStage,
  type GeneratedFile,
} from './ci-check-validation.ts';

const MAX_FIX_ATTEMPTS = 3;

interface CIAttempt {
  errors: Array<{ file: string; line: number; message: string; code: string }>;
  fix_applied: boolean;
  fixed_files?: string[];
  timestamp: string;
}

interface CIStageResult {
  passed: boolean;
  attempts: CIAttempt[];
}

interface CIResults {
  typecheck: CIStageResult;
  lint: CIStageResult;
  test: CIStageResult;
}

type SupabaseClient = ReturnType<typeof createClient>;

/** Run a single CI stage with up to MAX_FIX_ATTEMPTS retries */
export async function runStageWithRetries(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  pipelineId: string,
  requestId: string,
  stage: CIStage,
  files: GeneratedFile[],
  feature: { title: string; description: string; acceptance_criteria: string[] } | null,
  stageResult: CIStageResult
): Promise<boolean> {
  await appendLog(supabase, pipelineId, 'info', `Running ${STAGE_LABELS[stage]} validation...`);
  await supabase
    .from('pipeline_runs')
    .update({ last_heartbeat: new Date().toISOString() })
    .eq('id', pipelineId);

  for (let attempt = 0; attempt < MAX_FIX_ATTEMPTS; attempt++) {
    const errors = await validateStage(anthropic, stage, files, feature);

    if (errors.length === 0) {
      stageResult.attempts.push({
        errors: [],
        fix_applied: false,
        timestamp: new Date().toISOString(),
      });
      await appendLog(supabase, pipelineId, 'info', `${STAGE_LABELS[stage]} passed`);
      return true;
    }

    await appendLog(
      supabase,
      pipelineId,
      attempt < MAX_FIX_ATTEMPTS - 1 ? 'warn' : 'error',
      `${STAGE_LABELS[stage]}: ${errors.length} issue(s) found (attempt ${attempt + 1}/${MAX_FIX_ATTEMPTS})`
    );

    if (attempt < MAX_FIX_ATTEMPTS - 1) {
      const fixes = await fixErrors(anthropic, stage, errors, files);
      const fixedPaths: string[] = [];

      if (fixes && fixes.length > 0) {
        for (const fix of fixes) {
          const fileIdx = files.findIndex((f) => f.file_path === fix.path);
          if (fileIdx >= 0) {
            files[fileIdx].code = fix.code;
            fixedPaths.push(fix.path);
          }
        }

        for (const fix of fixes) {
          await supabase
            .from('implementation_task_items')
            .update({ generated_code: fix.code, updated_at: new Date().toISOString() })
            .eq('request_id', requestId)
            .eq('file_path', fix.path);
        }

        await appendLog(
          supabase,
          pipelineId,
          'info',
          `Applied fixes to ${fixedPaths.length} file(s)`
        );
      }

      stageResult.attempts.push({
        errors,
        fix_applied: fixedPaths.length > 0,
        fixed_files: fixedPaths.length > 0 ? fixedPaths : undefined,
        timestamp: new Date().toISOString(),
      });
    } else {
      stageResult.attempts.push({
        errors,
        fix_applied: false,
        timestamp: new Date().toISOString(),
      });
    }

    await supabase
      .from('pipeline_runs')
      .update({ last_heartbeat: new Date().toISOString() })
      .eq('id', pipelineId);
  }

  return false;
}

/** Complete the pipeline after CI — either deploy or mark as failed */
export async function completePipeline(
  supabase: SupabaseClient,
  pipelineId: string,
  requestId: string,
  allPassed: boolean | null
): Promise<void> {
  if (allPassed !== true) {
    const finalStage = allPassed === null ? 'idle' : 'build_failed';
    await supabase
      .from('pipeline_runs')
      .update({
        status: 'completed',
        current_stage: finalStage,
        current_task_id: null,
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

    const msg =
      allPassed === null
        ? 'Pipeline completed (CI skipped)'
        : 'Pipeline completed — some CI checks failed';
    await appendLog(supabase, pipelineId, allPassed === null ? 'info' : 'warn', msg);
    await onPipelineComplete(supabase, pipelineId, 'completed');
    return;
  }

  // CI passed — transition to autonomous deployment (FR-115)
  await supabase
    .from('pipeline_runs')
    .update({
      current_stage: 'build_passed',
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', pipelineId);

  await appendLog(supabase, pipelineId, 'info', 'CI passed — starting autonomous deployment');

  try {
    await runDeploy(pipelineId, requestId);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown deploy error';
    await appendLog(supabase, pipelineId, 'error', `Deployment crashed: ${msg}`);
    await supabase
      .from('pipeline_runs')
      .update({
        status: 'completed',
        current_stage: 'deploy_failed',
        current_task_id: null,
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
    await onPipelineComplete(supabase, pipelineId, 'failed');
  }
}

/** Capture CI failures for the learning system (FR-118) */
export function captureStageFailures(
  ciResults: CIResults,
  stage: CIStage,
  pipelineId: string,
  featureId: string
): void {
  const lastErrors = ciResults[stage].attempts[ciResults[stage].attempts.length - 1]?.errors ?? [];
  for (const err of lastErrors.slice(0, 3)) {
    captureFailure({
      pipeline_id: pipelineId,
      feature_id: featureId,
      error_type: `ci_${stage}` as 'ci_typecheck' | 'ci_lint' | 'ci_test',
      error_code: err.code || stage,
      error_message: err.message,
      file_path: err.file,
    }).catch(() => {});
  }
}

export type { CIResults, CIStageResult, CIAttempt };
