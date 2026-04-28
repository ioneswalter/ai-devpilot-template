/**
 * Start a server-side pipeline for a feature (FR-113)
 * Creates pipeline_runs record, validates tasks, triggers first chain invocation
 */

import {
  jsonResponse,
  errorResponse,
  appendLog,
  getEdgeFunctionUrl,
  type AuthContext,
} from './shared.ts';
import { enqueuePipeline, linkPipelineToQueue } from './queue-manager.ts';

export async function handleStart(req: Request, ctx: AuthContext): Promise<Response> {
  const body = await req.json();
  const { feature_id, request_id } = body;

  if (!feature_id || !request_id) {
    return errorResponse('VALIDATION_ERROR', 'feature_id and request_id are required', 400);
  }

  // Verify the implementation request exists and has accepted tasks
  const { data: implReq, error: reqErr } = await ctx.supabase
    .from('implementation_requests')
    .select('id, status, feature_id')
    .eq('id', request_id)
    .single();

  if (reqErr || !implReq) {
    return errorResponse('NOT_FOUND', 'Implementation request not found', 404);
  }

  // Check for already-running pipeline on this request
  const { data: existing } = await ctx.supabase
    .from('pipeline_runs')
    .select('id, status')
    .eq('request_id', request_id)
    .eq('status', 'running')
    .limit(1);

  if (existing && existing.length > 0) {
    return errorResponse('CONFLICT', 'A pipeline is already running for this request', 409);
  }

  // Count accepted tasks
  const { count: taskCount } = await ctx.supabase
    .from('implementation_task_items')
    .select('id', { count: 'exact', head: true })
    .eq('request_id', request_id)
    .in('decision', ['accepted', 'modified'])
    .eq('implementation_status', 'pending');

  if (!taskCount || taskCount === 0) {
    return errorResponse('VALIDATION_ERROR', 'No pending accepted tasks to implement', 400);
  }

  // FR-119: Check queue — enqueue if at capacity
  const qResult = await enqueuePipeline(ctx.supabase, feature_id, request_id, ctx.admin?.id);

  if (qResult.queued) {
    return jsonResponse({
      data: {
        pipeline_id: null,
        queue_entry_id: qResult.queue_entry_id,
        status: 'queued',
        queue_position: qResult.position,
        total_tasks: taskCount,
        message: `Queued at position ${qResult.position}`,
      },
    });
  }

  // Slot available — create pipeline run immediately
  return createAndStartPipeline(ctx, feature_id, request_id, taskCount, qResult.queue_entry_id);
}

/** Create pipeline run and start processing — used by both direct start and queue promotion */
export async function createAndStartPipeline(
  ctx: AuthContext,
  featureId: string,
  requestId: string,
  taskCount: number,
  queueEntryId?: string
): Promise<Response> {
  const { data: pipeline, error: createErr } = await ctx.supabase
    .from('pipeline_runs')
    .insert({
      feature_id: featureId,
      request_id: requestId,
      status: 'running',
      current_stage: 'implementing',
      total_tasks: taskCount,
      completed_tasks: 0,
      failed_tasks: 0,
      logs: [],
      queue_entry_id: queueEntryId ?? null,
    })
    .select('id')
    .single();

  if (createErr || !pipeline) {
    console.error('Failed to create pipeline run:', createErr);
    return errorResponse('INTERNAL_ERROR', 'Failed to create pipeline run', 500);
  }

  // Link queue entry to pipeline
  if (queueEntryId) await linkPipelineToQueue(ctx.supabase, queueEntryId, pipeline.id);

  await ctx.supabase
    .from('implementation_requests')
    .update({ status: 'implementing', updated_at: new Date().toISOString() })
    .eq('id', requestId);

  await appendLog(
    ctx.supabase,
    pipeline.id,
    'info',
    `Pipeline started — ${taskCount} tasks to process`
  );
  triggerNextTask(pipeline.id, requestId);

  return jsonResponse({
    data: {
      pipeline_id: pipeline.id,
      total_tasks: taskCount,
      status: 'running',
      queue_entry_id: queueEntryId ?? null,
    },
  });
}

/** Fire-and-forget call to self to process next task */
function triggerNextTask(pipelineId: string, requestId: string): void {
  const url = getEdgeFunctionUrl();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  // Don't await — fire and forget
  fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      action: 'next',
      pipeline_id: pipelineId,
      request_id: requestId,
    }),
  }).catch((err) => {
    console.error('Failed to trigger next task:', err);
  });
}
