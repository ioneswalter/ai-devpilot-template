/** Validate actual page state against expected outcome (FR-108 J3) */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logAIUsage } from '../_shared/usage-logger.ts';
import { resolveAuth, isAuth } from './auth.ts';

const AI_MODEL = 'claude-haiku-4-5-20251001';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

export async function handleValidateState(req: Request): Promise<Response> {
  const auth = await resolveAuth(req);
  if (!isAuth(auth)) return auth;

  const body = await req.json();
  const { session_id, step_number, expected_outcome, actual_page_state } = body;

  if (!session_id || step_number == null || !expected_outcome || !actual_page_state) {
    return error('VALIDATION_ERROR', 'session_id, step_number, expected_outcome, and actual_page_state required', 400);
  }

  // Verify session exists
  const { data: session } = await auth.supabase
    .from('guided_test_sessions')
    .select('id, feature_id')
    .eq('id', session_id)
    .single();

  if (!session) return error('SESSION_NOT_FOUND', 'Guided test session not found', 404);

  const prompt = buildValidationPrompt(
    expected_outcome,
    actual_page_state,
    body.console_errors,
    body.failed_requests,
  );

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return error('AI_ERROR', 'AI service not configured', 500);

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    system: VALIDATION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText = textBlock?.type === 'text' ? textBlock.text : '';

  logAIUsage(auth.supabase, {
    featureId: session.feature_id,
    adminId: auth.userId,
    modelId: AI_MODEL,
    operationType: 'guided_testing',
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  }).catch(() => {});

  const result = parseValidationResult(rawText);
  return json({ data: result });
}

function buildValidationPrompt(
  expected: string,
  pageState: unknown,
  consoleErrors?: string[],
  failedRequests?: unknown[],
): string {
  const parts = [
    `Expected Outcome: ${expected}`,
    `\nActual Page State:\n${JSON.stringify(pageState, null, 2)}`,
  ];
  if (consoleErrors?.length) {
    parts.push(`\nConsole Errors:\n${consoleErrors.join('\n')}`);
  }
  if (failedRequests?.length) {
    parts.push(`\nFailed Network Requests:\n${JSON.stringify(failedRequests)}`);
  }
  return parts.join('\n');
}

interface ValidationOutput {
  matches_expected: boolean;
  confidence: number;
  explanation: string;
  mismatches: string[];
  console_issues: string[];
  network_issues: string[];
}

function parseValidationResult(rawText: string): ValidationOutput {
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        matches_expected: Boolean(parsed.matches_expected),
        confidence: Number(parsed.confidence) || 0.5,
        explanation: String(parsed.explanation ?? ''),
        mismatches: Array.isArray(parsed.mismatches) ? parsed.mismatches : [],
        console_issues: Array.isArray(parsed.console_issues) ? parsed.console_issues : [],
        network_issues: Array.isArray(parsed.network_issues) ? parsed.network_issues : [],
      };
    }
  } catch {
    // Fall through
  }

  return {
    matches_expected: true,
    confidence: 0.3,
    explanation: 'Could not parse AI validation response',
    mismatches: [],
    console_issues: [],
    network_issues: [],
  };
}

const APP_ROUTES = `APP NAVIGATION REFERENCE (these are the correct routes):
- /learn — Course catalogue (default tab)
- /learn?tab=courses — Course Builder (create/edit courses, modules, quizzes)
- /learn?tab=lms — LMS Monitoring Dashboard
- /admin?tab=overview — Admin Overview
- /admin?tab=users — User Management
- /admin?tab=verifications — Provider Verifications
- /learn/{courseId} — Individual course view
- /learn/{courseId}/module/{moduleId} — Module content + quizzes
- /roadmap — Product Roadmap (features, test panels, pipeline)
- /dashboard — Main dashboard
- /marketplace — Service marketplace`;

const VALIDATION_SYSTEM_PROMPT = `You are an AI testing validator. Compare the expected outcome of a test step against the actual page state.

Analyze the DOM elements, their text content, and visual state to determine if the expected outcome is met.

${APP_ROUTES}

Return a JSON object:
{
  "matches_expected": true/false,
  "confidence": 0.0-1.0,
  "explanation": "Clear explanation of your assessment",
  "mismatches": ["Specific mismatch 1", "Specific mismatch 2"],
  "console_issues": ["Relevant console error explanations"],
  "network_issues": ["Relevant network failure explanations"]
}

RULES:
- Be specific: reference actual element text vs expected text
- Distinguish cosmetic differences (spacing, font) from functional failures
- Only flag mismatches that violate the expected outcome
- Confidence > 0.8 means high certainty, < 0.5 means uncertain
- The APP NAVIGATION REFERENCE above shows the correct URLs. Do NOT flag a URL as a mismatch if it matches a route in the reference.
- Focus on whether the page CONTENT matches the expected outcome, not on URL format

Return ONLY the JSON object. No markdown fences.`;
