/**
 * Staleness Check Handler (FR-109 Journey 5)
 * Compares script generated_from_hash against current criteria text hash.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

const StalenessSchema = z.object({
  feature_id: z.string().uuid(),
});

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}

function hashText(text: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  let hash = 0;
  for (const byte of data) {
    hash = ((hash << 5) - hash + byte) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

export async function handleCheckStaleness(
  supabase: SupabaseClient,
  body: unknown,
): Promise<Response> {
  const validation = StalenessSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.message, 400);
  }

  const { feature_id } = validation.data;

  // Get current acceptance criteria
  const { data: feature } = await supabase
    .from('product_features')
    .select('acceptance_criteria')
    .eq('id', feature_id)
    .single();

  if (!feature) return errorResponse('NOT_FOUND', 'Feature not found', 404);

  const criteria: string[] = feature.acceptance_criteria || [];
  const currentHash = hashText(criteria.join('\n'));

  // Get all scripts for this feature
  const { data: scripts } = await supabase
    .from('automated_test_scripts')
    .select('id, test_case_id, generated_from_hash, is_stale')
    .eq('feature_id', feature_id);

  if (!scripts?.length) {
    return jsonResponse({ data: { total_scripts: 0, stale_count: 0, stale_scripts: [] } });
  }

  const staleScripts: Array<{
    script_id: string;
    test_case_id: string;
    test_case_title: string;
    criterion_changed: string;
  }> = [];

  const staleIds: string[] = [];
  const freshIds: string[] = [];

  for (const script of scripts) {
    if (script.generated_from_hash !== currentHash) {
      staleIds.push(script.id);
      staleScripts.push({
        script_id: script.id,
        test_case_id: script.test_case_id,
        test_case_title: '', // filled below
        criterion_changed: 'Acceptance criteria modified since script generation',
      });
    } else if (script.is_stale) {
      freshIds.push(script.id);
    }
  }

  // Batch update stale scripts
  if (staleIds.length > 0) {
    await supabase
      .from('automated_test_scripts')
      .update({ is_stale: true })
      .in('id', staleIds);

    // Update test case status
    const staleTestCaseIds = staleScripts.map((s) => s.test_case_id);
    await supabase
      .from('test_cases')
      .update({ automation_status: 'stale' })
      .in('id', staleTestCaseIds);

    // Get test case titles
    const { data: titles } = await supabase
      .from('test_cases')
      .select('id, title')
      .in('id', staleTestCaseIds);

    const titleMap = new Map((titles ?? []).map((t: { id: string; title: string }) => [t.id, t.title]));
    for (const ss of staleScripts) {
      ss.test_case_title = titleMap.get(ss.test_case_id) || 'Unknown';
    }
  }

  // Un-stale scripts that are now fresh
  if (freshIds.length > 0) {
    await supabase
      .from('automated_test_scripts')
      .update({ is_stale: false })
      .in('id', freshIds);
  }

  return jsonResponse({
    data: {
      total_scripts: scripts.length,
      stale_count: staleIds.length,
      stale_scripts: staleScripts,
    },
  });
}
