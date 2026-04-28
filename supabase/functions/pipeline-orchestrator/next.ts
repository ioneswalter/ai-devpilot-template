/**
 * Process next task in pipeline chain (FR-113)
 * Self-chaining: processes one task, then fires off next invocation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { generateCode, type SpecArtifacts } from '../implement-feature/ai-codegen.ts';
import { autoSplitTask, intelligentSplit } from '../implement-feature/split-task.ts';
import { scoreTask } from '../implement-feature/complexity-scorer.ts';
import {
  appendLog,
  updateHeartbeat,
  triggerNextTask,
  loadSpecArtifacts,
  onPipelineComplete,
} from './shared.ts';
import { runCICheck } from './ci-check.ts';
import { captureFailure, getAdaptations } from './failure-capture.ts';

interface NextParams {
  pipeline_id: string;
  request_id: string;
  retry_count?: number;
}

export async function handleNext(params: NextParams): Promise<void> {
  const { pipeline_id, request_id, retry_count = 0 } = params;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    // Check pipeline status — abort if cancelled or not running
    const { data: pipeline } = await supabase
      .from('pipeline_runs')
      .select('status')
      .eq('id', pipeline_id)
      .single();

    if (!pipeline || pipeline.status !== 'running') {
      console.log(`Pipeline ${pipeline_id} is ${pipeline?.status ?? 'missing'} — stopping chain`);
      return;
    }

    await updateHeartbeat(supabase, pipeline_id);

    // Reset stale tasks (stuck in 'generating' >3 min)
    const staleThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();
    await supabase
      .from('implementation_task_items')
      .update({ implementation_status: 'failed', ai_log: 'Timed out in generating state' })
      .eq('request_id', request_id)
      .eq('implementation_status', 'generating')
      .lt('updated_at', staleThreshold);

    // Find next pending accepted task. Excludes manual-verification items —
    // tasks whose work is performed by the user (not code generation), marked
    // by task_type='manual' OR the legacy file_path='manual verification'
    // sentinel. Without this filter, the orchestrator would invoke code
    // generation against a non-file path and produce garbage or fail loudly.
    const { data: tasks } = await supabase
      .from('implementation_task_items')
      .select('*')
      .eq('request_id', request_id)
      .in('decision', ['accepted', 'modified'])
      .eq('implementation_status', 'pending')
      .neq('task_type', 'manual')
      .neq('file_path', 'manual verification')
      .order('sort_order', { ascending: true })
      .limit(1);

    if (!tasks || tasks.length === 0) {
      // All tasks done — finalize pipeline
      await finalizePipeline(supabase, pipeline_id, request_id);
      return;
    }

    const task = tasks[0];

    // Update pipeline current task
    await supabase
      .from('pipeline_runs')
      .update({
        current_task_id: task.id,
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', pipeline_id);

    // Fetch feature context
    const { data: implReq } = await supabase
      .from('implementation_requests')
      .select('*, feature:product_features(*)')
      .eq('id', request_id)
      .single();

    if (!implReq) {
      await appendLog(supabase, pipeline_id, 'error', 'Implementation request not found');
      await markPipelineFailed(supabase, pipeline_id, 'Implementation request not found');
      return;
    }

    const feature = implReq.feature;
    await appendLog(supabase, pipeline_id, 'info', `Processing: ${task.title}`, task.id);

    // Fetch sibling file paths (needed for scoring + generation)
    const { data: allTasks } = await supabase
      .from('implementation_task_items')
      .select('file_path')
      .eq('request_id', request_id)
      .in('decision', ['accepted', 'modified']);
    const siblingPaths = (allTasks || [])
      .map((t) => t.file_path)
      .filter((p) => p !== task.file_path);

    // FR-117: Pre-score complexity before code generation
    const complexityScore = scoreTask({
      title: task.title,
      description: task.description,
      file_path: task.file_path,
      task_type: task.task_type,
      siblingPaths,
    });

    // Save complexity score regardless of outcome
    await supabase
      .from('implementation_task_items')
      .update({ complexity_score: complexityScore, updated_at: new Date().toISOString() })
      .eq('id', task.id);

    // If score exceeds threshold and task isn't already a split child, do intelligent split
    const isAlreadySplitChild = task.source === 'auto-split';
    if (complexityScore.split_recommended && !isAlreadySplitChild) {
      await appendLog(
        supabase,
        pipeline_id,
        'info',
        `Complexity score ${complexityScore.total}/${complexityScore.threshold} — splitting`,
        task.id
      );

      const authCtx = {
        user: { id: 'pipeline' },
        admin: { id: 'pipeline', email: 'pipeline@system' },
        supabase,
      };
      const splitCount = await intelligentSplit(authCtx, { ...task, request_id }, complexityScore);

      if (splitCount > 0) {
        // FR-118: Capture complexity split as failure for learning
        captureFailure({
          pipeline_id,
          feature_id: feature.id,
          task_item_id: task.id,
          error_type: 'complexity_split',
          error_code: 'threshold_exceeded',
          error_message: `Score ${complexityScore.total}/${complexityScore.threshold}`,
          file_path: task.file_path,
          context: { complexity_score: complexityScore },
        }).catch(() => {});

        const { count: newTotal } = await supabase
          .from('implementation_task_items')
          .select('id', { count: 'exact', head: true })
          .eq('request_id', request_id)
          .in('decision', ['accepted', 'modified']);

        await supabase
          .from('pipeline_runs')
          .update({ total_tasks: newTotal ?? 0 })
          .eq('id', pipeline_id);
        await appendLog(
          supabase,
          pipeline_id,
          'info',
          `Intelligent split into ${splitCount} subtasks`,
          task.id
        );
        triggerNextTask(pipeline_id, request_id);
        return;
      }
      // If intelligent split fails, fall through to normal generation
      await appendLog(
        supabase,
        pipeline_id,
        'warn',
        'Intelligent split failed — proceeding with generation',
        task.id
      );
    }

    // Mark task as generating
    await supabase
      .from('implementation_task_items')
      .update({ implementation_status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', task.id);

    // FR-118: Get learned adaptations before code generation
    const adaptations = await getAdaptations(task.file_path, task.task_type);
    const learnedConstraints = adaptations.count > 0 ? adaptations.constraints : undefined;

    // Load SpecKit artifacts
    const artifacts = await loadSpecArtifacts(supabase, feature.id);

    // Generate code via AI (with learned constraints from FR-118)
    const result = await generateCode(
      {
        title: task.title,
        description: task.description,
        file_path: task.file_path,
        task_type: task.task_type,
      },
      {
        feature_code: feature.feature_code,
        title: feature.title,
        description: feature.description,
        criteria: feature.acceptance_criteria || [],
      },
      siblingPaths,
      artifacts,
      undefined,
      learnedConstraints
    );

    // Handle reactive auto-split for oversized code (fallback when scoring underestimates)
    const isConstitutionReject = !result?.code && result?.log?.includes('REJECTED');
    if (isConstitutionReject) {
      // FR-118: Capture constitution reject for learning
      captureFailure({
        pipeline_id,
        feature_id: feature.id,
        task_item_id: task.id,
        error_type: 'constitution_reject',
        error_code: 'line_limit',
        error_message: 'Code exceeded 300-line limit',
        file_path: task.file_path,
        adaptation_applied: adaptations.count > 0,
      }).catch(() => {});
    }
    if (isConstitutionReject && !isAlreadySplitChild) {
      const authCtx = {
        user: { id: 'pipeline' },
        admin: { id: 'pipeline', email: 'pipeline@system' },
        supabase,
      };
      const splitCount = await autoSplitTask(authCtx, { ...task, request_id });
      if (splitCount > 0) {
        // Update total tasks count
        const { count: newTotal } = await supabase
          .from('implementation_task_items')
          .select('id', { count: 'exact', head: true })
          .eq('request_id', request_id)
          .in('decision', ['accepted', 'modified']);

        await supabase
          .from('pipeline_runs')
          .update({ total_tasks: newTotal ?? 0 })
          .eq('id', pipeline_id);

        await appendLog(
          supabase,
          pipeline_id,
          'info',
          `Task auto-split into ${splitCount} subtasks`,
          task.id
        );
        triggerNextTask(pipeline_id, request_id);
        return;
      }
    }

    // Save task result
    const succeeded = !!result?.code;
    await supabase
      .from('implementation_task_items')
      .update({
        implementation_status: succeeded ? 'completed' : 'failed',
        generated_code: result?.code ?? null,
        ai_log: result?.log ?? 'AI code generation failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', task.id);

    // Update pipeline progress
    const { data: pd } = await supabase
      .from('pipeline_runs')
      .select('completed_tasks, failed_tasks')
      .eq('id', pipeline_id)
      .single();
    await supabase
      .from('pipeline_runs')
      .update({
        completed_tasks: (pd?.completed_tasks ?? 0) + (succeeded ? 1 : 0),
        failed_tasks: (pd?.failed_tasks ?? 0) + (succeeded ? 0 : 1),
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', pipeline_id);
    await appendLog(
      supabase,
      pipeline_id,
      succeeded ? 'info' : 'warn',
      `${succeeded ? 'Completed' : 'Failed'}: ${task.title}`,
      task.id
    );

    // Chain to next task
    triggerNextTask(pipeline_id, request_id);
  } catch (error) {
    console.error(`Pipeline ${pipeline_id} error:`, error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    // Retry with exponential backoff for transient errors
    if (retry_count < 3 && isTransientError(msg)) {
      const delay = Math.pow(4, retry_count) * 1000; // 1s, 4s, 16s
      await appendLog(
        supabase,
        pipeline_id,
        'warn',
        `Transient error, retrying in ${delay / 1000}s: ${msg}`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      triggerNextTask(pipeline_id, request_id, retry_count + 1);
      return;
    }

    await appendLog(supabase, pipeline_id, 'error', `Fatal error: ${msg}`);
    await markPipelineFailed(supabase, pipeline_id, msg);
  }
}

function isTransientError(message: string): boolean {
  const transient = ['rate_limit', 'timeout', 'ECONNRESET', 'overloaded', '529', '503'];
  return transient.some((t) => message.toLowerCase().includes(t.toLowerCase()));
}

async function finalizePipeline(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  requestId: string
): Promise<void> {
  await appendLog(supabase, pipelineId, 'info', 'All tasks processed — starting CI validation');

  // Transition to CI check stage (FR-114)
  try {
    await runCICheck(pipelineId, requestId);
  } catch (error) {
    console.error('CI check failed:', error);
    const msg = error instanceof Error ? error.message : 'Unknown CI error';
    await appendLog(supabase, pipelineId, 'error', `CI check error: ${msg}`);

    await supabase
      .from('pipeline_runs')
      .update({
        status: 'completed',
        current_stage: 'build_failed',
        current_task_id: null,
        completed_at: new Date().toISOString(),
      })
      .eq('id', pipelineId);
    await supabase
      .from('implementation_requests')
      .update({ status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', requestId);
    await onPipelineComplete(supabase, pipelineId, 'failed');
  }
}

async function markPipelineFailed(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  errorMessage: string
): Promise<void> {
  await supabase
    .from('pipeline_runs')
    .update({
      status: 'failed',
      current_stage: 'idle',
      error_message: errorMessage,
      completed_at: new Date().toISOString(),
    })
    .eq('id', pipelineId);
  await onPipelineComplete(supabase, pipelineId, 'failed');
}
