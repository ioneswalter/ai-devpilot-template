/**
 * PATCH handler: Update a task item's decision, title, description, or add a comment
 */

import { UpdateTaskItemSchema } from './schemas.ts';
import { jsonResponse, errorResponse, type AuthContext } from './shared.ts';

export async function handleUpdateTask(req: Request, ctx: AuthContext): Promise<Response> {
  const rawBody = await req.json();
  const validation = UpdateTaskItemSchema.safeParse(rawBody);
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
  }

  const { item_id, decision, title, description, comment } = validation.data;

  const { data: item, error: fetchErr } = await ctx.supabase
    .from('implementation_task_items')
    .select('*')
    .eq('id', item_id)
    .single();

  if (fetchErr || !item) {
    return errorResponse('NOT_FOUND', 'Task item not found', 404);
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (decision) {
    updates.decision = decision;
    updates.decided_by = ctx.user.id;
    updates.decided_at = new Date().toISOString();
  }

  if (title) updates.title = title;
  if (description !== undefined) updates.description = description;

  if (comment) {
    const existingComments = (item.comments as Array<Record<string, unknown>>) || [];
    existingComments.push({
      user_id: ctx.user.id,
      user_name: ctx.admin.email || ctx.user.email,
      text: comment,
      created_at: new Date().toISOString(),
    });
    updates.comments = existingComments;
  }

  const { data: updated, error: updateErr } = await ctx.supabase
    .from('implementation_task_items')
    .update(updates)
    .eq('id', item_id)
    .select()
    .single();

  if (updateErr) {
    return errorResponse('DB_ERROR', 'Failed to update task item', 500);
  }

  return jsonResponse({ data: updated });
}
