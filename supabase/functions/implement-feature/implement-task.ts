/**
 * POST ?action=implement handler: Process ONE next accepted task
 * Called repeatedly by the frontend until all tasks are done.
 */

import { generateCode } from './ai-codegen.ts';
import { jsonResponse, errorResponse, countRemainingTasks, finalizeRequest, type AuthContext } from './shared.ts';

export async function handleImplementTask(req: Request, ctx: AuthContext): Promise<Response> {
  const rawBody = await req.json();
  const requestId = rawBody.request_id;
  if (!requestId) {
    return errorResponse('VALIDATION_ERROR', 'request_id is required', 400);
  }

  const { data: implRequest } = await ctx.supabase
    .from('implementation_requests')
    .select('*, feature:product_features(*)')
    .eq('id', requestId)
    .single();

  if (!implRequest) {
    return errorResponse('NOT_FOUND', 'Implementation request not found', 404);
  }

  // Recovery: reset any tasks stuck in 'generating' for >3 minutes
  await resetStaleTasks(ctx, requestId);

  // Get the NEXT accepted task that hasn't been implemented
  const { data: tasks } = await ctx.supabase
    .from('implementation_task_items')
    .select('*')
    .eq('request_id', requestId)
    .in('decision', ['accepted', 'modified'])
    .eq('implementation_status', 'pending')
    .order('sort_order', { ascending: true })
    .limit(1);

  if (!tasks || tasks.length === 0) {
    await finalizeRequest(ctx.supabase, requestId);
    return jsonResponse({ data: { done: true, remaining: 0 } });
  }

  const task = tasks[0];
  const feature = implRequest.feature;

  // Ensure request status is 'implementing'
  if (implRequest.status !== 'implementing') {
    await ctx.supabase
      .from('implementation_requests')
      .update({ status: 'implementing', updated_at: new Date().toISOString() })
      .eq('id', requestId);
  }

  // Mark task as generating
  await ctx.supabase
    .from('implementation_task_items')
    .update({ implementation_status: 'generating', updated_at: new Date().toISOString() })
    .eq('id', task.id);

  // Generate code for this ONE task
  const result = await generateCode(
    { title: task.title, description: task.description, file_path: task.file_path, task_type: task.task_type },
    { feature_code: feature.feature_code, title: feature.title, description: feature.description, criteria: feature.acceptance_criteria || [] },
  );

  await saveTaskResult(ctx, task.id, result);

  const remaining = await countRemainingTasks(ctx.supabase, requestId);
  if (remaining === 0) {
    await finalizeRequest(ctx.supabase, requestId);
  }

  console.log(`Implementation: ${feature.feature_code} task "${task.title}" — ${result?.code ? 'completed' : 'failed'} (${remaining} remaining)`);

  return jsonResponse({
    data: {
      done: remaining === 0,
      remaining,
      task_id: task.id,
      status: result?.code ? 'completed' : 'failed',
    },
  });
}

async function resetStaleTasks(ctx: AuthContext, requestId: string): Promise<void> {
  const staleThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  await ctx.supabase
    .from('implementation_task_items')
    .update({
      implementation_status: 'failed',
      ai_log: 'Timed out — task was stuck in generating state',
      updated_at: new Date().toISOString(),
    })
    .eq('request_id', requestId)
    .eq('implementation_status', 'generating')
    .lt('updated_at', staleThreshold);
}

async function saveTaskResult(
  ctx: AuthContext,
  taskId: string,
  result: { code?: string; log?: string } | null,
): Promise<void> {
  if (result?.code) {
    await ctx.supabase
      .from('implementation_task_items')
      .update({
        implementation_status: 'completed',
        generated_code: result.code,
        ai_log: result.log,
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
  } else {
    await ctx.supabase
      .from('implementation_task_items')
      .update({
        implementation_status: 'failed',
        ai_log: result?.log || 'AI code generation failed',
        updated_at: new Date().toISOString(),
      })
      .eq('id', taskId);
  }
}
