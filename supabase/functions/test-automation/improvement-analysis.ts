/**
 * Improvement Analysis Handler (FR-109 v2 Journey 5)
 * Analyzes passing test suite results to generate improvement recommendations.
 * Categories: performance, UX, accessibility, coverage, reliability.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';

const AI_MODEL = 'claude-sonnet-4-6-20250514';

const AnalyzeSchema = z.object({
  test_run_id: z.string(),
  feature_id: z.string(),
  execution_data: z.object({
    api_timings: z.array(
      z.object({
        test_case_id: z.string(),
        endpoint: z.string(),
        duration_ms: z.number(),
      })
    ),
    e2e_timings: z.array(
      z.object({
        test_case_id: z.string(),
        step_timings: z.array(z.object({ step: z.number(), duration_ms: z.number() })),
      })
    ),
    criteria_coverage: z.object({
      total_criteria: z.number(),
      tested_criteria: z.number(),
      untested_criteria: z.array(z.string()),
    }),
  }),
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

export async function handleAnalyzeImprovements(
  supabase: SupabaseClient,
  body: unknown,
  _userId: string
): Promise<Response> {
  const validation = AnalyzeSchema.safeParse(body);
  if (!validation.success) return errorResponse('VALIDATION_ERROR', validation.error.message, 400);

  const { test_run_id, feature_id, execution_data } = validation.data;
  const anthropic = new Anthropic();

  // Build analysis context
  const slowApis = execution_data.api_timings.filter((t) => t.duration_ms > 500);
  const coverageGap =
    execution_data.criteria_coverage.total_criteria -
    execution_data.criteria_coverage.tested_criteria;
  const untestedList = execution_data.criteria_coverage.untested_criteria.slice(0, 5).join(', ');

  const prompt = `Analyze these passing test results and suggest improvements.

SLOW API ENDPOINTS (>500ms): ${slowApis.length > 0 ? slowApis.map((t) => `${t.endpoint}: ${t.duration_ms}ms`).join(', ') : 'None'}
COVERAGE GAPS: ${coverageGap} of ${execution_data.criteria_coverage.total_criteria} criteria untested${untestedList ? `: ${untestedList}` : ''}
E2E TEST COUNT: ${execution_data.e2e_timings.length}

Respond with a JSON array of recommendations:
\`\`\`json
[{
  "category": "performance|ux|accessibility|coverage|reliability",
  "observation": "what was observed",
  "why_it_matters": "why this matters",
  "suggested_action": "what to do",
  "priority": "high|medium|low"
}]
\`\`\`

Only include genuine improvements. If everything looks good, return an empty array.`;

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    logAIUsageFromEnv({
      featureId: 'test-automation',
      adminId: 'system',
      modelId: AI_MODEL,
      operationType: 'improvement_analysis',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return jsonResponse({ data: { recommendations: [] } }, 201);

    const recs = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const stored: Array<Record<string, unknown>> = [];

    for (const rec of Array.isArray(recs) ? recs : []) {
      const { data } = await supabase
        .from('improvement_recommendations')
        .insert({
          feature_id,
          test_run_id,
          category: rec.category || 'coverage',
          observation: rec.observation || '',
          why_it_matters: rec.why_it_matters || '',
          suggested_action: rec.suggested_action || '',
          priority: rec.priority || 'medium',
          status: 'new',
        })
        .select('*')
        .single();
      if (data) stored.push(data);
    }

    return jsonResponse({ data: { recommendations: stored } }, 201);
  } catch {
    return jsonResponse({ data: { recommendations: [] } }, 201);
  }
}

/** GET handler: retrieve recommendations for a feature */
export async function handleGetRecommendations(
  supabase: SupabaseClient,
  featureId: string,
  status?: string
): Promise<Response> {
  let query = supabase
    .from('improvement_recommendations')
    .select('*')
    .eq('feature_id', featureId)
    .order('created_at', { ascending: false });
  if (status) query = query.eq('status', status);
  const { data } = await query;
  return jsonResponse({ data: { recommendations: data ?? [] } });
}

/** PATCH handler: update recommendation status */
export async function handleUpdateRecommendation(
  supabase: SupabaseClient,
  body: unknown
): Promise<Response> {
  const { recommendation_id, status } = body as { recommendation_id: string; status: string };
  if (!recommendation_id || !status)
    return errorResponse('VALIDATION_ERROR', 'recommendation_id and status required', 400);

  const resolved_at = status === 'accepted' ? new Date().toISOString() : null;
  const { data } = await supabase
    .from('improvement_recommendations')
    .update({ status, resolved_at })
    .eq('id', recommendation_id)
    .select('id, status, resolved_at')
    .single();

  if (!data) return errorResponse('NOT_FOUND', 'Recommendation not found', 404);
  return jsonResponse({ data });
}
