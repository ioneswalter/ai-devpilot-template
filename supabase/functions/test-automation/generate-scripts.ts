/**
 * AI Script Generation Handler (FR-109 v2)
 * Categorizes criteria (API vs E2E), then generates appropriate test type.
 * Uses Sonnet for better quality (v1 used Haiku, produced unreliable scripts).
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';

const GenerateSchema = z.object({
  feature_id: z.string().uuid(),
  test_case_ids: z.array(z.string().uuid()).optional(),
  force: z.boolean().optional(),
});

const AI_MODEL = 'claude-sonnet-4-6-20250514';

export type CriterionTier = 'api' | 'e2e' | 'manual';

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

/** Classify a test case as API-testable, E2E-required, or manual */
export async function categorizeCriterion(
  anthropic: Anthropic,
  testCase: { title: string; steps: string; expected_result: string },
): Promise<CriterionTier> {
  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 100,
      messages: [{
        role: 'user',
        content: `Classify this test case into ONE category:
- "api" if it validates: data operations, business rules, permissions, validation, state transitions, calculations, error codes
- "e2e" if it validates: navigation, visual feedback, form interactions, client-side behavior, UI states
- "manual" if it cannot be automated (complex drag-drop, multi-step wizard)

RULE: Multi-step backend workflows (retry loops, repeated submissions, state machines) are ALWAYS "api".

Test: ${testCase.title}
Steps: ${testCase.steps}
Expected: ${testCase.expected_result}

Reply with ONLY one word: api, e2e, or manual`,
      }],
    });

    logAIUsageFromEnv({
      featureId: 'test-automation', adminId: 'system', modelId: AI_MODEL,
      operationType: 'categorize_criterion', inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text).join('').trim().toLowerCase();

    if (text.includes('api')) return 'api';
    if (text.includes('e2e')) return 'e2e';
    if (text.includes('manual')) return 'manual';
    return 'e2e'; // Default to E2E if unclear
  } catch {
    return 'e2e';
  }
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

  return `Generate an E2E browser test script for this test case. Max 5 browser steps (FR-021).

TEST: ${testCase.title}
STEPS: ${testCase.steps}
EXPECTED: ${testCase.expected_result}

CRITERIA:\n${criteriaList}

ROUTES: /learn, /learn?tab=courses (Course Builder), /learn?tab=lms, /admin, /roadmap, /marketplace, /dashboard, /ai-coach

Return JSON: {"steps":[{"step_number":1,"action":"navigate|click|type|wait_for|assert_text|assert_visible","target":{"strategy":"testid|role|label|text|url","value":"..."},"value":"optional","expected_outcome":"...","checkpoint":false,"criterion_index":0,"timeout_ms":5000,"condition":"visible|gone|text_present"}],"criterion_refs":[0],"notes":"..."}

RULES:
- Prefer testid selectors. Fall back: role > label > text. Never CSS/XPath.
- Use wait_for with condition instead of hardcoded wait times.
- Max 5 browser interaction steps. Navigate + interact + assert.
- Never simulate multi-step workflows (retry loops, repeated submissions).`;
}
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

  const { feature_id, test_case_ids, force } = validation.data;

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
  const apiTests: Array<{ test_case_id: string; test_id: string; endpoint: string; assertion_count: number; negative_case_count: number }> = [];
  const e2eScripts: Array<{ test_case_id: string; script_id: string; step_count: number; selectors_used: { testid: number; role: number; label: number; text: number } }> = [];
  const skipped: Array<{ test_case_id: string; reason: string }> = [];
  let catApi = 0, catE2e = 0, catManual = 0;

  for (const tc of testCases || []) {
    if (tc.automation_status === 'automated' && !force) {
      skipped.push({ test_case_id: tc.id, reason: 'Already automated' });
      continue;
    }

    // v2: Categorize criterion first
    const tier = await categorizeCriterion(anthropic, tc);
    await supabase.from('test_cases').update({ test_tier: tier }).eq('id', tc.id);

    if (tier === 'manual') {
      catManual++;
      skipped.push({ test_case_id: tc.id, reason: 'Classified as manual — cannot be reliably automated' });
      await supabase.from('test_cases').update({ automation_failure_reason: 'Classified as manual' }).eq('id', tc.id);
      continue;
    }

    if (tier === 'api') {
      catApi++;
      // API test generation delegated to generate-api-tests handler (T007)
      // For now, record categorization; API tests generated separately
      try {
        const { handleGenerateApiTest } = await import('./generate-api-tests.ts');
        const apiResult = await handleGenerateApiTest(supabase, anthropic, tc, feature_id, criteria, userId);
        if (apiResult) {
          apiTests.push(apiResult);
          await supabase.from('test_cases').update({ automated: true, automation_status: 'automated', automation_failure_reason: null }).eq('id', tc.id);
        } else {
          skipped.push({ test_case_id: tc.id, reason: 'API test generation failed' });
        }
      } catch {
        skipped.push({ test_case_id: tc.id, reason: 'API test generator not yet available' });
      }
      continue;
    }

    // tier === 'e2e': Generate browser extension script
    catE2e++;
    const result = await generateScriptForTestCase(anthropic, tc, criteria);

    if (!result) {
      skipped.push({ test_case_id: tc.id, reason: 'Could not generate reliable E2E script' });
      await supabase.from('test_cases').update({ automation_failure_reason: 'AI could not generate reliable script' }).eq('id', tc.id);
      continue;
    }

    const hash = hashCriterionText(criteria.join('\n'));
    const { data: script, error: insertErr } = await supabase
      .from('automated_test_scripts')
      .upsert({
        test_case_id: tc.id, feature_id, script_steps: result.steps,
        generation_source: 'ai_criteria', generated_from_hash: hash,
        ai_model: AI_MODEL, is_stale: false, tier: 'e2e',
        generation_notes: result.notes, created_by: userId,
      }, { onConflict: 'test_case_id' })
      .select('id').single();

    if (insertErr) { skipped.push({ test_case_id: tc.id, reason: insertErr.message }); continue; }

    await supabase.from('test_cases').update({ automated: true, automation_status: 'automated', automation_failure_reason: null }).eq('id', tc.id);

    const selectors = { testid: 0, role: 0, label: 0, text: 0 };
    for (const step of result.steps as Array<{ target?: { strategy?: string } }>) {
      const s = step.target?.strategy;
      if (s === 'testid') selectors.testid++;
      else if (s === 'role') selectors.role++;
      else if (s === 'label') selectors.label++;
      else if (s === 'text') selectors.text++;
    }

    e2eScripts.push({ test_case_id: tc.id, script_id: script.id, step_count: result.steps.length, selectors_used: selectors });
  }

  return jsonResponse({
    data: {
      categorized: { api: catApi, e2e: catE2e, manual: catManual },
      api_tests: apiTests,
      e2e_scripts: e2eScripts,
      skipped,
    },
  }, 201);
}
