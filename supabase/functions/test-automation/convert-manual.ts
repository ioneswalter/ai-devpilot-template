/**
 * Manual-to-Automated Conversion Handler (FR-109 Journey 3)
 * Converts guided testing evidence (FR-108) into automated test scripts.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';

const ConvertSchema = z.object({
  test_case_id: z.string().uuid(),
  session_id: z.string().uuid().optional(),
});

const AI_MODEL = 'claude-sonnet-4-20250514';

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

interface GuidedStepEvidence {
  step_number: number;
  action: string;
  target: string;
  expected: string;
  verdict: string;
  screenshot?: string;
}

function buildConversionPrompt(
  testCase: { title: string; steps: string; expected_result: string },
  evidence: GuidedStepEvidence[],
  criteria: string[],
): string {
  const criteriaList = criteria.map((c, i) => `[${i}] ${c}`).join('\n');
  const evidenceList = evidence
    .map((e) => `Step ${e.step_number}: ${e.action} on "${e.target}" — ${e.verdict} (expected: ${e.expected})`)
    .join('\n');

  return `Convert this manual test evidence into an automated test script.

TEST CASE: ${testCase.title}
MANUAL STEPS: ${testCase.steps}
EXPECTED RESULT: ${testCase.expected_result}

GUIDED TESTING EVIDENCE:
${evidenceList}

ACCEPTANCE CRITERIA:
${criteriaList}

Generate a JSON automated script that reproduces the manual test flow using semantic element references.

\`\`\`json
{
  "steps": [
    {
      "step_number": 1,
      "action": "navigate|click|type|wait|assert_text|assert_visible|assert_not_visible|screenshot|select|hover",
      "target": {"strategy": "text|role|label|testid|url", "value": "..."},
      "value": "optional input",
      "expected_outcome": "what should happen",
      "checkpoint": false,
      "criterion_index": 0,
      "timeout_ms": 5000
    }
  ],
  "criterion_refs": [0, 1],
  "notes": "Conversion notes"
}
\`\`\`

RULES:
- Use SEMANTIC references: visible text, ARIA roles, labels. Never CSS selectors or XPaths.
- Base the script on the actual manual evidence, not just the test case description.
- Include checkpoints at key visual verification points from the evidence.
- If the evidence shows a step that failed, still include it but note the expected behavior.`;
}

export async function handleConvertManual(
  supabase: SupabaseClient,
  body: unknown,
  userId: string,
): Promise<Response> {
  const validation = ConvertSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.message, 400);
  }

  const { test_case_id, session_id } = validation.data;

  // Check if already automated
  const { data: existingScript } = await supabase
    .from('automated_test_scripts')
    .select('id, is_stale')
    .eq('test_case_id', test_case_id)
    .single();

  if (existingScript && !existingScript.is_stale) {
    return errorResponse('ALREADY_AUTOMATED', 'Test case already has an active script', 409);
  }

  // Load test case
  const { data: testCase } = await supabase
    .from('test_cases')
    .select('id, title, steps, expected_result, feature_id')
    .eq('id', test_case_id)
    .single();

  if (!testCase) return errorResponse('NOT_FOUND', 'Test case not found', 404);

  // Find guided session evidence
  let sessionQuery = supabase
    .from('guided_test_sessions')
    .select('id')
    .eq('test_case_id', test_case_id)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1);

  if (session_id) {
    sessionQuery = supabase
      .from('guided_test_sessions')
      .select('id')
      .eq('id', session_id)
      .eq('status', 'completed');
  }

  const { data: sessions } = await sessionQuery;
  if (!sessions?.length) {
    return errorResponse(
      'NO_GUIDED_EVIDENCE',
      'No completed guided testing session found. Complete guided testing first.',
      404,
    );
  }

  const sourceSessionId = sessions[0].id;

  // Load guided evidence from test runs
  const { data: testRuns } = await supabase
    .from('test_runs')
    .select('evidence')
    .eq('test_case_id', test_case_id)
    .not('evidence', 'is', null)
    .order('executed_at', { ascending: false })
    .limit(1);

  const evidence: GuidedStepEvidence[] = [];
  if (testRuns?.[0]?.evidence) {
    const ev = testRuns[0].evidence as Record<string, unknown>;
    if (ev.type === 'guided' && Array.isArray(ev.steps)) {
      for (const step of ev.steps as Record<string, unknown>[]) {
        evidence.push({
          step_number: step.step_number as number,
          action: (step.action as string) || '',
          target: (step.target as string) || '',
          expected: (step.expected as string) || '',
          verdict: (step.verdict as string) || '',
        });
      }
    }
  }

  if (evidence.length === 0) {
    return errorResponse(
      'NO_GUIDED_EVIDENCE',
      'No step evidence found in test runs. Complete guided testing first.',
      404,
    );
  }

  // Load acceptance criteria
  const { data: feature } = await supabase
    .from('product_features')
    .select('acceptance_criteria')
    .eq('id', testCase.feature_id)
    .single();

  const criteria: string[] = feature?.acceptance_criteria || [];

  // Generate script from evidence + criteria
  const anthropic = new Anthropic();
  const prompt = buildConversionPrompt(testCase, evidence, criteria);

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return errorResponse('GENERATION_FAILED', 'Could not parse AI response', 500);
    }

    const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
    const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
    const criterionRefs = parsed.criterion_refs || [];
    const notes = parsed.notes || '';
    const criteriaText = criteria.join('\n');

    // Upsert script
    const { data: script, error: insertErr } = await supabase
      .from('automated_test_scripts')
      .upsert({
        test_case_id,
        feature_id: testCase.feature_id,
        script_steps: steps,
        generation_source: 'manual_conversion',
        generated_from_hash: hashText(criteriaText),
        ai_model: AI_MODEL,
        is_stale: false,
        failure_count: 0,
        generation_notes: notes,
        created_by: userId,
      }, { onConflict: 'test_case_id' })
      .select('id')
      .single();

    if (insertErr) return errorResponse('DB_ERROR', insertErr.message, 500);

    // Update test case status
    await supabase
      .from('test_cases')
      .update({
        automated: true,
        automation_status: 'automated',
        automation_failure_reason: null,
      })
      .eq('id', test_case_id);

    return jsonResponse({
      data: {
        script_id: script.id,
        test_case_id,
        step_count: steps.length,
        source_session_id: sourceSessionId,
        criterion_refs: criterionRefs,
        validation_note: 'Run this script and compare results against guided session evidence',
      },
    }, 201);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Conversion failed';
    return errorResponse('CONVERSION_ERROR', msg, 500);
  }
}
