/**
 * Cancel a running pipeline (FR-113)
 */

import { jsonResponse, errorResponse, appendLog, type AuthContext } from './shared.ts';

export async function handleCancel(req: Request, ctx: AuthContext): Promise<Response> {
  const body = await req.json();
  const { pipeline_id } = body;

  if (!pipeline_id) {
    return errorResponse('VALIDATION_ERROR', 'pipeline_id is required', 400);
  }

  const { data: pipeline, error } = await ctx.supabase
    .from('pipeline_runs')
    .select('id, status, request_id')
    .eq('id', pipeline_id)
    .single();

  if (error || !pipeline) {
    return errorResponse('NOT_FOUND', 'Pipeline not found', 404);
  }

  if (pipeline.status !== 'running') {
    return errorResponse('VALIDATION_ERROR', `Pipeline is already ${pipeline.status}`, 400);
  }

  await ctx.supabase
    .from('pipeline_runs')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: ctx.user.id,
      current_stage: 'idle',
      current_task_id: null,
    })
    .eq('id', pipeline_id);

  // Reset any currently-generating tasks back to pending
  await ctx.supabase
    .from('implementation_task_items')
    .update({
      implementation_status: 'pending',
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', pipeline.request_id)
    .eq('implementation_status', 'generating');

  await appendLog(ctx.supabase, pipeline_id, 'info', `Pipeline cancelled by ${ctx.admin.email}`);

  return jsonResponse({ data: { pipeline_id, status: 'cancelled' } });
}
