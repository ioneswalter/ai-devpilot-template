/**
 * GET handler: Fetch implementation request + task items for a feature
 */

import { GetRequestSchema } from './schemas.ts';
import { jsonResponse, errorResponse, type AuthContext } from './shared.ts';

export async function handleGetRequest(url: URL, ctx: AuthContext): Promise<Response> {
  const featureId = url.searchParams.get('feature_id');
  const validation = GetRequestSchema.safeParse({ feature_id: featureId });
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
  }

  const { data: implRequest } = await ctx.supabase
    .from('implementation_requests')
    .select('*')
    .eq('feature_id', validation.data.feature_id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!implRequest) {
    return errorResponse('NOT_FOUND', 'No implementation request exists for this feature', 404);
  }

  const { data: taskItems } = await ctx.supabase
    .from('implementation_task_items')
    .select('*')
    .eq('request_id', implRequest.id)
    .order('sort_order', { ascending: true });

  return jsonResponse({ data: { ...implRequest, task_items: taskItems || [] } });
}
