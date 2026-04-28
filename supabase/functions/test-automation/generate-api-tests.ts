/**
 * API Test Generation Handler (FR-109 v2 Journey 1)
 * Generates API verification test definitions from acceptance criteria using Claude Sonnet.
 * Called by generate-scripts.ts after criteria categorization assigns tier='api'.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { logAIUsageFromEnv } from '../_shared/usage-logger.ts';

const AI_MODEL = 'claude-sonnet-4-6-20250514';

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

function hashText(text: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  let hash = 0;
  for (const byte of data) {
    hash = ((hash << 5) - hash + byte) | 0;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/** Called from generate-scripts.ts for each API-categorized test case */
export async function handleGenerateApiTest(
  supabase: SupabaseClient,
  anthropic: Anthropic,
  testCase: { id: string; title: string; steps: string; expected_result: string },
  featureId: string,
  criteria: string[],
  userId: string
): Promise<{
  test_case_id: string;
  test_id: string;
  endpoint: string;
  assertion_count: number;
  negative_case_count: number;
} | null> {
  const prompt = buildApiTestPrompt(testCase, criteria);

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    logAIUsageFromEnv({
      featureId: 'test-automation',
      adminId: userId,
      modelId: AI_MODEL,
      operationType: 'generate_api_test',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    if (!parsed.endpoint || !parsed.method || !parsed.assertions) return null;

    const hash = hashText(criteria.join('\n'));
    const { data: test, error } = await supabase
      .from('api_verification_tests')
      .upsert(
        {
          test_case_id: testCase.id,
          feature_id: featureId,
          endpoint: parsed.endpoint,
          method: parsed.method,
          setup_sql: parsed.setup_sql || [],
          request_body: parsed.request_body || {},
          auth_context: parsed.auth_context || { type: 'service_role' },
          assertions: parsed.assertions,
          cleanup_sql: parsed.cleanup_sql || [],
          negative_cases: parsed.negative_cases || [],
          generated_from_hash: hash,
          ai_model: AI_MODEL,
          is_stale: false,
          generation_notes: parsed.notes || '',
          created_by: userId,
        },
        { onConflict: 'test_case_id' }
      )
      .select('id')
      .single();

    if (error || !test) return null;

    const assertionCount = 1 + (parsed.assertions.db_assertions?.length || 0);
    return {
      test_case_id: testCase.id,
      test_id: test.id,
      endpoint: parsed.endpoint,
      assertion_count: assertionCount,
      negative_case_count: parsed.negative_cases?.length || 0,
    };
  } catch {
    return null;
  }
}

function buildApiTestPrompt(
  testCase: { title: string; steps: string; expected_result: string },
  criteria: string[]
): string {
  const criteriaList = criteria.map((c, i) => `[${i}] ${c}`).join('\n');
  return `Generate an API verification test for this test case. The test calls a Supabase Edge Function directly and asserts on the response + database state.

TEST: ${testCase.title}
STEPS: ${testCase.steps}
EXPECTED: ${testCase.expected_result}

CRITERIA:\n${criteriaList}

EDGE FUNCTION ROUTES (use these):
- /learner-courses?action=... — Enrollment, module progress, assessments
- /course-builder?action=... — Course/module CRUD
- /test-data-gen?action=generate|cleanup — Test data management
- /pipeline-orchestrator?action=... — Pipeline operations
- /ideation-chat?action=... — AI ideation

Return JSON:
\`\`\`json
{
  "endpoint": "/learner-courses?action=submit-assessment",
  "method": "POST",
  "setup_sql": ["INSERT INTO courses (id, title) VALUES ('test_prefix_001', 'Test Course') ON CONFLICT DO NOTHING"],
  "request_body": {"course_id": "test_prefix_001", "answers": [1, 2, 3]},
  "auth_context": {"type": "service_role"},
  "assertions": {
    "status": 200,
    "response_match": {"data.result": "passed"},
    "db_assertions": [{"query": "SELECT status FROM enrollments WHERE id = 'test_prefix_001'", "expected": "completed", "description": "Enrollment marked complete"}]
  },
  "cleanup_sql": ["DELETE FROM courses WHERE id LIKE 'test_prefix_%'"],
  "negative_cases": [{"description": "Anon rejected", "auth_context": {"type": "anon"}, "request_body": {}, "expected_status": 401, "expected_error_code": "UNAUTHORIZED"}],
  "notes": "Tests assessment submission and DB state update"
}
\`\`\`

RULES:
- setup_sql creates test data with unique prefixes. cleanup_sql removes it.
- Use ON CONFLICT DO NOTHING for idempotent setup.
- assertions.status is the expected HTTP status code.
- assertions.response_match uses dot-notation paths into the response body.
- assertions.db_assertions verify database state after the API call.
- negative_cases test permission/validation failures with different auth contexts.
- Test must be fully self-contained — no dependency on pre-existing data.`;
}

/** Standalone handler for POST ?action=execute-api-test (delegated from index.ts) */
export async function handleExecuteApiTest(
  supabase: SupabaseClient,
  body: unknown,
  _userId: string
): Promise<Response> {
  // Delegate to execute-api-tests.ts
  const { handleExecuteApiTest: exec } = await import('./execute-api-tests.ts');
  return exec(supabase, body, _userId);
}
