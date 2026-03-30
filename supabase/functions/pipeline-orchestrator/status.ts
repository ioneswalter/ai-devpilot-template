/**
 * Get pipeline status for a feature (FR-113)
 */

import { jsonResponse, errorResponse, type AuthContext } from './shared.ts';

export async function handleStatus(req: Request, ctx: AuthContext): Promise<Response> {
  const url = new URL(req.url);
  const featureId = url.searchParams.get('feature_id');
  const pipelineId = url.searchParams.get('pipeline_id');

  if (!featureId && !pipelineId) {
    return errorResponse('VALIDATION_ERROR', 'feature_id or pipeline_id is required', 400);
  }

  let query = ctx.supabase.from('pipeline_runs').select('*');

  if (pipelineId) {
    query = query.eq('id', pipelineId);
  } else {
    query = query.eq('feature_id', featureId);
  }

  const { data: pipelines, error } = await query.order('created_at', { ascending: false }).limit(5);

  if (error) {
    console.error('Pipeline status query error:', error);
    return errorResponse('INTERNAL_ERROR', 'Failed to fetch pipeline status', 500);
  }

  // Get the latest/active pipeline
  const active = pipelines?.find(p => p.status === 'running') ?? pipelines?.[0] ?? null;

  // If active pipeline, also fetch the current task info
  let currentTask = null;
  if (active?.current_task_id) {
    const { data: task } = await ctx.supabase
      .from('implementation_task_items')
      .select('id, title, file_path, implementation_status')
      .eq('id', active.current_task_id)
      .single();
    currentTask = task;
  }

  return jsonResponse({
    data: {
      active,
      current_task: currentTask,
      history: pipelines ?? [],
    },
  });
}
