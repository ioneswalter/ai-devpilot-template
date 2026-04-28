/**
 * Failure Analysis Handler (FR-109 v2 Journey 5)
 * Analyzes test failures using Claude Sonnet to produce actionable fix guidance.
 * Groups related failures by shared root cause. Consumed by \fix-test command.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';

const AI_MODEL = 'claude-sonnet-4-6-20250514';

const AnalyzeSchema = z.object({
  test_run_id: z.string(),
  feature_id: z.string(),
  failures: z.array(
    z.object({
      test_case_id: z.string(),
      tier: z.enum(['api', 'e2e']),
      evidence: z.unknown(),
    })
  ),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}

export async function handleAnalyzeFailures(
  supabase: SupabaseClient,
  body: unknown,
  _userId: string
): Promise<Response> {
  const validation = AnalyzeSchema.safeParse(body);
  if (!validation.success) return errorResponse('VALIDATION_ERROR', validation.error.message, 400);

  const { test_run_id, feature_id, failures } = validation.data;
  if (!failures.length) return jsonResponse({ data: { guidance_count: 0, guidance: [] } });

  const anthropic = new Anthropic();
  const allGuidance: Array<Record<string, unknown>> = [];

  // Analyze each failure
  for (const failure of failures) {
    const { data: tc } = await supabase
      .from('test_cases')
      .select('title, steps, expected_result')
      .eq('id', failure.test_case_id)
      .single();

    const prompt = `Analyze this test failure and provide actionable fix guidance.

TEST: ${tc?.title || 'Unknown'}
TIER: ${failure.tier}
EVIDENCE: ${JSON.stringify(failure.evidence, null, 2).substring(0, 3000)}

Respond with JSON:
\`\`\`json
{
  "root_cause": "specific description of what broke",
  "likely_source": {"file": "path/to/file.ts", "function": "functionName", "line_hint": "around line N"},
  "suggested_fix": "concrete code change suggestion",
  "severity": "critical|major|minor",
  "category": "code_bug|missing_feature|data_issue|permission_error|contract_mismatch"
}
\`\`\``;

    try {
      const response = await anthropic.messages.create({
        model: AI_MODEL,
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      });

      logAIUsageFromEnv({
        featureId: 'test-automation',
        adminId: 'system',
        modelId: AI_MODEL,
        operationType: 'failure_analysis',
        inputTokens: response.usage?.input_tokens ?? 0,
        outputTokens: response.usage?.output_tokens ?? 0,
      });

      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('');
      const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) continue;

      const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
      const { data: guidance } = await supabase
        .from('test_failure_guidance')
        .insert({
          test_run_id,
          test_case_id: failure.test_case_id,
          feature_id,
          tier: failure.tier,
          root_cause: parsed.root_cause || 'Unknown',
          likely_source: parsed.likely_source || { file: '', function: '', line_hint: '' },
          suggested_fix: parsed.suggested_fix || '',
          severity: parsed.severity || 'major',
          category: parsed.category || 'code_bug',
          evidence: failure.evidence || {},
          status: 'new',
        })
        .select('*')
        .single();

      if (guidance) allGuidance.push(guidance);
    } catch {
      /* skip failed analysis */
    }
  }

  // Group related failures by similar root causes
  const groups = groupBySimilarRootCause(allGuidance);
  for (const group of groups) {
    const groupId = crypto.randomUUID();
    for (const g of group) {
      await supabase.from('test_failure_guidance').update({ group_id: groupId }).eq('id', g.id);
    }
  }

  return jsonResponse({ data: { guidance_count: allGuidance.length, guidance: allGuidance } }, 201);
}

function groupBySimilarRootCause(
  guidance: Array<Record<string, unknown>>
): Array<Array<Record<string, unknown>>> {
  const groups: Array<Array<Record<string, unknown>>> = [];
  const used = new Set<number>();
  for (let i = 0; i < guidance.length; i++) {
    if (used.has(i)) continue;
    const group = [guidance[i]];
    used.add(i);
    const src = (guidance[i].likely_source as Record<string, string>)?.file || '';
    for (let j = i + 1; j < guidance.length; j++) {
      if (used.has(j)) continue;
      const otherSrc = (guidance[j].likely_source as Record<string, string>)?.file || '';
      if (src && src === otherSrc) {
        group.push(guidance[j]);
        used.add(j);
      }
    }
    if (group.length > 1) groups.push(group);
  }
  return groups;
}

/** GET handler: retrieve guidance for a feature */
export async function handleGetGuidance(
  supabase: SupabaseClient,
  featureId: string,
  status?: string
): Promise<Response> {
  let query = supabase
    .from('test_failure_guidance')
    .select('*, test_cases!inner(title)')
    .eq('feature_id', featureId)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data } = await query;

  const guidance = (data ?? []).map((g) => ({
    ...g,
    test_case_title: (g.test_cases as unknown as { title: string })?.title || '',
    test_cases: undefined,
  }));

  // Build group summaries
  const groupMap = new Map<string, { count: number; cause: string }>();
  for (const g of guidance) {
    if (g.group_id) {
      const existing = groupMap.get(g.group_id);
      if (existing) existing.count++;
      else groupMap.set(g.group_id, { count: 1, cause: g.root_cause || '' });
    }
  }
  const groups = [...groupMap.entries()].map(([id, v]) => ({
    group_id: id,
    shared_root_cause: v.cause,
    affected_test_count: v.count,
  }));

  return jsonResponse({ data: { guidance, groups } });
}

/** PATCH handler: update guidance status */
export async function handleUpdateGuidance(
  supabase: SupabaseClient,
  body: unknown
): Promise<Response> {
  const { guidance_id, status } = body as { guidance_id: string; status: string };
  if (!guidance_id || !status)
    return errorResponse('VALIDATION_ERROR', 'guidance_id and status required', 400);
  const { data } = await supabase
    .from('test_failure_guidance')
    .update({ status })
    .eq('id', guidance_id)
    .select('id, status')
    .single();
  if (!data) return errorResponse('NOT_FOUND', 'Guidance not found', 404);
  return jsonResponse({ data });
}
