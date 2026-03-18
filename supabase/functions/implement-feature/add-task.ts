/**
 * POST ?action=add-task handler: Add a manual task item to a request
 */

import { AddTaskItemSchema } from './schemas.ts';
import { jsonResponse, errorResponse, type AuthContext } from './shared.ts';

export async function handleAddTask(req: Request, ctx: AuthContext): Promise<Response> {
  const rawBody = await req.json();
  const validation = AddTaskItemSchema.safeParse(rawBody);
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
  }

  const { request_id, title, description, file_path, task_type } = validation.data;

  // Get max sort_order
  const { data: maxItem } = await ctx.supabase
    .from('implementation_task_items')
    .select('sort_order')
    .eq('request_id', request_id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextOrder = (maxItem?.sort_order ?? -1) + 1;

  const { data: newItem, error: insertErr } = await ctx.supabase
    .from('implementation_task_items')
    .insert({
      request_id,
      title,
      description: description || null,
      file_path,
      task_type,
      source: 'manual',
      decision: 'pending',
      sort_order: nextOrder,
    })
    .select()
    .single();

  if (insertErr) {
    return errorResponse('DB_ERROR', 'Failed to add task item', 500);
  }

  return jsonResponse({ data: newItem }, 201);
}
