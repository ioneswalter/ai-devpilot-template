/**
 * FR-130 J3 — UAT release gate.
 * Blocks the released-status transition when the feature's UAT package has
 * any unreviewed/failed/deferred criteria.
 */

import type { SupabaseClient } from './shared.ts';
import { corsHeaders } from './shared.ts';

interface BlockingItem {
  checklist_item_id: string;
  criterion_text: string;
  decision: 'fail' | 'defer' | null;
}

export async function checkUatReleaseGate(
  supabase: SupabaseClient,
  featureId: string
): Promise<Response | null> {
  const { data: pkg } = await supabase
    .from('uat_packages')
    .select('id, status')
    .eq('feature_id', featureId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!pkg) return null;
  if (pkg.status === 'approved') return null;

  const { data: items } = await supabase
    .from('uat_checklist_items')
    .select('id, content, decision')
    .eq('package_id', pkg.id);

  const blocking: BlockingItem[] = [];
  for (const item of items ?? []) {
    const decision = item.decision as string;
    if (decision === 'pass') continue;
    blocking.push({
      checklist_item_id: item.id as string,
      criterion_text: item.content as string,
      decision: decision === 'fail' || decision === 'defer' ? decision : null,
    });
  }

  if (blocking.length === 0) {
    return null;
  }

  const body = {
    error: {
      code: 'RELEASE_BLOCKED_BY_UAT',
      message: `Release blocked by UAT review: ${blocking.length} criteria pending review or failed.`,
      blocking_items: blocking,
      package_status: pkg.status,
    },
  };
  return new Response(JSON.stringify(body), {
    status: 403,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
