/**
 * AI Script Generation Handler (FR-109 Journey 1)
 * Generates automated test scripts from acceptance criteria using Claude Sonnet.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';

const GenerateSchema = z.object({
  feature_id: z.string().uuid(),
  test_case_ids: z.array(z.string().uuid()).optional(),
});

const AI_MODEL = 'claude-sonnet-4-6';

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

function hashCriterionText(text: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  let hash = 0;
  for (const byte of data) {
    hash = ((hash << 5) - hash + byte) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

async function generateScriptForTestCase(
  anthropic: Anthropic,
  testCase: { id: string; title: string; steps: string; expected_result: string },
  acceptanceCriteria: string[],
): Promise<{ steps: unknown[]; criterionRefs: number[]; notes: string } | null> {
  const prompt = buildGenerationPrompt(testCase, acceptanceCriteria);

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    logAIUsageFromEnv({
      featureId: 'test-automation', adminId: 'system', modelId: AI_MODEL,
      operationType: 'test_automation', inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const steps = Array.isArray(parsed.steps) ? parsed.steps : parsed;
    const criterionRefs = parsed.criterion_refs || [];
    const notes = parsed.notes || '';

    return { steps, criterionRefs, notes };
  } catch {
    return null;
  }
}

function buildGenerationPrompt(
  testCase: { title: string; steps: string; expected_result: string },
  acceptanceCriteria: string[],
): string {
  const criteriaList = acceptanceCriteria
    .map((c, i) => `[${i}] ${c}`)
    .join('\n');

  return `Generate an automated test script for this test case.

TEST CASE: ${testCase.title}
STEPS: ${testCase.steps}
EXPECTED RESULT: ${testCase.expected_result}

ACCEPTANCE CRITERIA:
${criteriaList}

Return JSON with this structure:
\`\`\`json
{
  "steps": [
    {
      "step_number": 1,
      "action": "navigate|click|type|wait|assert_text|assert_visible|assert_not_visible|screenshot|select|hover",
      "target": {"strategy": "text|role|label|testid|url", "value": "..."},
      "value": "optional input value",
      "expected_outcome": "what should happen",
      "checkpoint": false,
      "criterion_index": 0,
      "timeout_ms": 5000
    }
  ],
  "criterion_refs": [0, 1],
  "notes": "Generation notes"
}
\`\`\`

RULES:
- Use SEMANTIC references only: visible text, ARIA roles, labels. Never use CSS selectors or XPaths.
- Include checkpoint:true for steps that validate acceptance criteria visually.
- Map each step to a criterion_index when it directly validates that criterion.
- If this test case cannot be reliably automated (complex drag-drop, multi-step wizard), return null.
- Keep scripts focused and under 15 steps.`;
}

export async function handleGenerateScripts(
  supabase: SupabaseClient,
  body: unknown,
  userId: string,
): Promise<Response> {
  const validation = GenerateSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.message, 400);
  }

  const { feature_id, test_case_ids } = validation.data;

  // Load feature and acceptance criteria
  const { data: feature } = await supabase
    .from('product_features')
    .select('id, acceptance_criteria')
    .eq('id', feature_id)
    .single();

  if (!feature) return errorResponse('FEATURE_NOT_FOUND', 'Feature not found', 404);

  const criteria: string[] = feature.acceptance_criteria || [];

  // Load test cases
  let query = supabase
    .from('test_cases')
    .select('id, title, steps, expected_result, automation_status')
    .eq('feature_id', feature_id);

  if (test_case_ids?.length) {
    query = query.in('id', test_case_ids);
  }

  const { data: testCases, error: tcError } = await query;
  if (tcError) return errorResponse('DB_ERROR', tcError.message, 500);

  const anthropic = new Anthropic();
  const generated: Array<{
    test_case_id: string;
    script_id: string;
    step_count: number;
    criterion_refs: number[];
  }> = [];
  const skipped: Array<{ test_case_id: string; reason: string }> = [];

  for (const tc of testCases || []) {
    if (tc.automation_status === 'automated') {
      skipped.push({ test_case_id: tc.id, reason: 'Already automated' });
      continue;
    }

    const result = await generateScriptForTestCase(
      anthropic,
      tc,
      criteria,
    );

    if (!result) {
      skipped.push({ test_case_id: tc.id, reason: 'Could not generate reliable automation' });
      await supabase
        .from('test_cases')
        .update({ automation_failure_reason: 'AI could not generate reliable script' })
        .eq('id', tc.id);
      continue;
    }

    const criteriaText = criteria.join('\n');
    const hash = hashCriterionText(criteriaText);

    const { data: script, error: insertErr } = await supabase
      .from('automated_test_scripts')
      .upsert({
        test_case_id: tc.id,
        feature_id,
        script_steps: result.steps,
        generation_source: 'ai_criteria',
        generated_from_hash: hash,
        ai_model: AI_MODEL,
        is_stale: false,
        generation_notes: result.notes,
        created_by: userId,
      }, { onConflict: 'test_case_id' })
      .select('id')
      .single();

    if (insertErr) {
      skipped.push({ test_case_id: tc.id, reason: insertErr.message });
      continue;
    }

    await supabase
      .from('test_cases')
      .update({
        automated: true,
        automation_status: 'automated',
        automation_failure_reason: null,
      })
      .eq('id', tc.id);

    generated.push({
      test_case_id: tc.id,
      script_id: script.id,
      step_count: result.steps.length,
      criterion_refs: result.criterionRefs,
    });
  }

  return jsonResponse({
    data: {
      generated,
      skipped,
      total_generated: generated.length,
      total_skipped: skipped.length,
    },
  }, 201);
}
