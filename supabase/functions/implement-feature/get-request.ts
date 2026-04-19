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

  // Fetch ALL implementation requests for this feature (all versions)
  const { data: allRequests } = await ctx.supabase
    .from('implementation_requests')
    .select('*')
    .eq('feature_id', validation.data.feature_id)
    .order('created_at', { ascending: false });

  if (!allRequests || allRequests.length === 0) {
    return errorResponse('NOT_FOUND', 'No implementation request exists for this feature', 404);
  }

  // Latest request is the "primary" one for status/metadata
  const primaryRequest = allRequests[0];

  // Resolve version labels for requests that have feature_version_id
  const versionIds = allRequests
    .map(r => r.feature_version_id)
    .filter((id): id is string => !!id);

  let versionMap: Record<string, string> = {};
  if (versionIds.length > 0) {
    const { data: versions } = await ctx.supabase
      .from('feature_versions')
      .select('id, version_label')
      .in('id', versionIds);
    if (versions) {
      versionMap = Object.fromEntries(versions.map(v => [v.id, v.version_label]));
    }
  }

  // Fetch task items from ALL requests, tagged with version_label
  const allTaskItems = [];
  for (const req of allRequests) {
    const { data: taskItems } = await ctx.supabase
      .from('implementation_task_items')
      .select('*')
      .eq('request_id', req.id)
      .order('sort_order', { ascending: true });

    const versionLabel = req.feature_version_id
      ? (versionMap[req.feature_version_id] ?? 'v1.0')
      : 'v1.0';

    for (const item of (taskItems || [])) {
      allTaskItems.push({ ...item, version_label: versionLabel });
    }
  }

  // Sort: v1.0 tasks first, then v1.1, etc. Within each version, by sort_order
  allTaskItems.sort((a, b) => {
    if (a.version_label !== b.version_label) {
      return a.version_label.localeCompare(b.version_label);
    }
    return (a.sort_order ?? 0) - (b.sort_order ?? 0);
  });

  return jsonResponse({
    data: { ...primaryRequest, task_items: allTaskItems },
  });
}
