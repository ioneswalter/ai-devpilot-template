/**
 * Visual Assertion Handler (FR-109 Journey 2)
 * Uses AI vision to validate screenshots against expected outcomes.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';

const VisualAssertSchema = z.object({
  script_id: z.string().uuid(),
  step_number: z.number().int().positive(),
  screenshot_base64: z.string().min(1),
  expected_outcome: z.string().min(1),
  criterion_text: z.string().optional(),
  test_run_id: z.string().uuid().optional(),
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

function buildVisionPrompt(expectedOutcome: string, criterionText?: string): string {
  let prompt = `Analyze this screenshot and determine if it matches the expected visual state.

EXPECTED OUTCOME: ${expectedOutcome}`;

  if (criterionText) {
    prompt += `\nACCEPTANCE CRITERION: ${criterionText}`;
  }

  prompt += `

Respond with JSON only:
\`\`\`json
{
  "passed": true/false,
  "explanation": "Clear explanation of what you see vs what was expected",
  "visual_elements_found": ["list of elements matching expectations"],
  "visual_elements_missing": ["list of expected elements not found"],
  "cosmetic_only": true/false,
  "confidence": 0.0-1.0
}
\`\`\`

RULES:
- "passed" = true if the expected visual state is present
- "cosmetic_only" = true if differences are purely cosmetic (spacing, font size) but functionally correct
- If cosmetic_only is true and the functional state matches, set passed = true
- Be specific about what you see in the screenshot
- confidence should reflect how certain you are about the assessment`;

  return prompt;
}

async function callVisionApi(
  anthropic: Anthropic,
  screenshotBase64: string,
  prompt: string,
): Promise<{
  passed: boolean;
  explanation: string;
  visual_elements_found: string[];
  visual_elements_missing: string[];
  cosmetic_only: boolean;
  confidence: number;
}> {
  // Strip data URL prefix if present
  const base64Data = screenshotBase64.replace(/^data:image\/\w+;base64,/, '');

  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 1000,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'base64', media_type: 'image/png', data: base64Data },
        },
        { type: 'text', text: prompt },
      ],
    }],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('');

  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) || text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return {
      passed: false,
      explanation: 'Could not parse AI vision response',
      visual_elements_found: [],
      visual_elements_missing: [],
      cosmetic_only: false,
      confidence: 0,
    };
  }

  return JSON.parse(jsonMatch[1] || jsonMatch[0]);
}

export async function handleVisualAssert(
  supabase: SupabaseClient,
  body: unknown,
  _userId: string,
): Promise<Response> {
  const validation = VisualAssertSchema.safeParse(body);
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.message, 400);
  }

  const { script_id, step_number, screenshot_base64, expected_outcome, criterion_text, test_run_id } = validation.data;

  // Verify script exists
  const { data: script } = await supabase
    .from('automated_test_scripts')
    .select('id')
    .eq('id', script_id)
    .single();

  if (!script) return errorResponse('SCRIPT_NOT_FOUND', 'Script not found', 404);

  try {
    const anthropic = new Anthropic();
    const prompt = buildVisionPrompt(expected_outcome, criterion_text);
    const assessment = await callVisionApi(anthropic, screenshot_base64, prompt);

    // Store checkpoint
    const { data: checkpoint, error: insertErr } = await supabase
      .from('visual_checkpoints')
      .insert({
        script_id,
        test_run_id: test_run_id || null,
        step_number,
        screenshot_base64,
        expected_outcome,
        ai_assessment: assessment,
        passed: assessment.passed,
        cosmetic_only: assessment.cosmetic_only,
      })
      .select('id')
      .single();

    if (insertErr) return errorResponse('DB_ERROR', insertErr.message, 500);

    return jsonResponse({
      data: {
        ...assessment,
        checkpoint_id: checkpoint.id,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Vision assertion failed';
    return errorResponse('VISION_ERROR', msg, 500);
  }
}
