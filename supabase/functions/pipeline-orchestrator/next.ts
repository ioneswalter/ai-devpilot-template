/**
 * Process next task in pipeline chain (FR-113)
 * Self-chaining: processes one task, then fires off next invocation
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { generateCode, type SpecArtifacts } from '../implement-feature/ai-codegen.ts';
import { autoSplitTask } from '../implement-feature/split-task.ts';
import { appendLog, updateHeartbeat, getEdgeFunctionUrl } from './shared.ts';

interface NextParams {
  pipeline_id: string;
  request_id: string;
  retry_count?: number;
}

export async function handleNext(params: NextParams): Promise<void> {
  const { pipeline_id, request_id, retry_count = 0 } = params;

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
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

    // Find next pending accepted task
    const { data: tasks } = await supabase
      .from('implementation_task_items')
      .select('*')
      .eq('request_id', request_id)
      .in('decision', ['accepted', 'modified'])
      .eq('implementation_status', 'pending')
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

    // Mark task as generating
    await supabase
      .from('implementation_task_items')
      .update({ implementation_status: 'generating', updated_at: new Date().toISOString() })
      .eq('id', task.id);

    // Fetch sibling file paths
    const { data: allTasks } = await supabase
      .from('implementation_task_items')
      .select('file_path')
      .eq('request_id', request_id)
      .in('decision', ['accepted', 'modified']);
    const siblingPaths = (allTasks || []).map(t => t.file_path).filter(p => p !== task.file_path);

    // Load SpecKit artifacts
    const artifacts = await loadSpecArtifacts(supabase, feature.id);

    // Generate code via AI
    const result = await generateCode(
      { title: task.title, description: task.description, file_path: task.file_path, task_type: task.task_type },
      { feature_code: feature.feature_code, title: feature.title, description: feature.description, criteria: feature.acceptance_criteria || [] },
      siblingPaths,
      artifacts,
      undefined, // No existing file content in server-side mode
    );

    // Handle auto-split for oversized code
    const isConstitutionReject = !result?.code && result?.log?.includes('REJECTED');
    const isAlreadySplit = task.source === 'auto-split';
    if (isConstitutionReject && !isAlreadySplit) {
      const authCtx = { user: { id: 'pipeline' }, admin: { id: 'pipeline', email: 'pipeline@system' }, supabase };
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

        await appendLog(supabase, pipeline_id, 'info', `Task auto-split into ${splitCount} subtasks`, task.id);
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
    const { data: pipelineData } = await supabase
      .from('pipeline_runs')
      .select('completed_tasks, failed_tasks')
      .eq('id', pipeline_id)
      .single();

    await supabase
      .from('pipeline_runs')
      .update({
        completed_tasks: (pipelineData?.completed_tasks ?? 0) + (succeeded ? 1 : 0),
        failed_tasks: (pipelineData?.failed_tasks ?? 0) + (succeeded ? 0 : 1),
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', pipeline_id);

    await appendLog(
      supabase, pipeline_id,
      succeeded ? 'info' : 'warn',
      `${succeeded ? 'Completed' : 'Failed'}: ${task.title}`,
      task.id,
    );

    // Chain to next task
    triggerNextTask(pipeline_id, request_id);
  } catch (error) {
    console.error(`Pipeline ${pipeline_id} error:`, error);
    const msg = error instanceof Error ? error.message : 'Unknown error';

    // Retry with exponential backoff for transient errors
    if (retry_count < 3 && isTransientError(msg)) {
      const delay = Math.pow(4, retry_count) * 1000; // 1s, 4s, 16s
      await appendLog(supabase, pipeline_id, 'warn', `Transient error, retrying in ${delay / 1000}s: ${msg}`);
      await new Promise(resolve => setTimeout(resolve, delay));
      triggerNextTask(pipeline_id, request_id, retry_count + 1);
      return;
    }

    await appendLog(supabase, pipeline_id, 'error', `Fatal error: ${msg}`);
    await markPipelineFailed(supabase, pipeline_id, msg);
  }
}

function isTransientError(message: string): boolean {
  const transient = ['rate_limit', 'timeout', 'ECONNRESET', 'overloaded', '529', '503'];
  return transient.some(t => message.toLowerCase().includes(t.toLowerCase()));
}

async function finalizePipeline(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  requestId: string,
): Promise<void> {
  // Check if all tasks are done
  const { data: allItems } = await supabase
    .from('implementation_task_items')
    .select('implementation_status, decision')
    .eq('request_id', requestId)
    .in('decision', ['accepted', 'modified']);

  const allCompleted = allItems?.every(t => t.implementation_status === 'completed');

  await supabase
    .from('pipeline_runs')
    .update({
      status: 'completed',
      current_stage: 'idle',
      current_task_id: null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', pipelineId);

  await supabase
    .from('implementation_requests')
    .update({
      status: allCompleted ? 'implemented' : 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);

  await appendLog(supabase, pipelineId, 'info', `Pipeline completed — all tasks processed`);
}

async function markPipelineFailed(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
  errorMessage: string,
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
}

async function loadSpecArtifacts(
  supabase: ReturnType<typeof createClient>,
  featureId: string,
): Promise<SpecArtifacts> {
  const { data: rows } = await supabase
    .from('feature_spec_artifacts')
    .select('artifact_type, content')
    .eq('feature_id', featureId);

  if (!rows || rows.length === 0) return {};

  const artifacts: SpecArtifacts = {};
  const contracts: string[] = [];

  for (const row of rows) {
    switch (row.artifact_type) {
      case 'plan': artifacts.plan = row.content; break;
      case 'data_model': artifacts.data_model = row.content; break;
      case 'spec': artifacts.spec = row.content; break;
      case 'research': artifacts.research = row.content; break;
      case 'contract': contracts.push(row.content); break;
    }
  }
  if (contracts.length > 0) artifacts.contracts = contracts;
  return artifacts;
}

function triggerNextTask(pipelineId: string, requestId: string, retryCount = 0): void {
  const url = getEdgeFunctionUrl();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      action: 'next',
      pipeline_id: pipelineId,
      request_id: requestId,
      retry_count: retryCount,
    }),
  }).catch(err => {
    console.error('Failed to trigger next task:', err);
  });
}
