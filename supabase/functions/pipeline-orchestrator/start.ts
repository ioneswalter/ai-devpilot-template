/**
 * Start a server-side pipeline for a feature (FR-113)
 * Creates pipeline_runs record, validates tasks, triggers first chain invocation
 */

import { jsonResponse, errorResponse, appendLog, getEdgeFunctionUrl, type AuthContext } from './shared.ts';

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

  // Create pipeline run
  const { data: pipeline, error: createErr } = await ctx.supabase
    .from('pipeline_runs')
    .insert({
      feature_id,
      request_id,
      status: 'running',
      current_stage: 'implementing',
      total_tasks: taskCount,
      completed_tasks: 0,
      failed_tasks: 0,
      logs: [],
    })
    .select('id')
    .single();

  if (createErr || !pipeline) {
    console.error('Failed to create pipeline run:', createErr);
    return errorResponse('INTERNAL_ERROR', 'Failed to create pipeline run', 500);
  }

  // Update implementation request status
  await ctx.supabase
    .from('implementation_requests')
    .update({ status: 'implementing', updated_at: new Date().toISOString() })
    .eq('id', request_id);

  await appendLog(ctx.supabase, pipeline.id, 'info', `Pipeline started — ${taskCount} tasks to process`);

  // Fire-and-forget: trigger the first task processing
  triggerNextTask(pipeline.id, request_id);

  return jsonResponse({
    data: {
      pipeline_id: pipeline.id,
      total_tasks: taskCount,
      status: 'running',
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
      'Authorization': `Bearer ${serviceKey}`,
    },
    body: JSON.stringify({
      action: 'next',
      pipeline_id: pipelineId,
      request_id: requestId,
    }),
  }).catch(err => {
    console.error('Failed to trigger next task:', err);
  });
}
