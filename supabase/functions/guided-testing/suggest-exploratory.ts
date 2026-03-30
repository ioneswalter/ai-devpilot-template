/** Suggest exploratory tests from failure context (FR-108 J4) */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logAIUsage } from '../_shared/usage-logger.ts';
import { resolveAuth, isAuth } from './auth.ts';

const AI_MODEL = 'claude-sonnet-4-20250514';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

export async function handleSuggestExploratory(req: Request): Promise<Response> {
  const auth = await resolveAuth(req);
  if (!isAuth(auth)) return auth;

  const body = await req.json();
  const { session_id, feature_id, failure_context, existing_test_codes } = body;

  if (!session_id || !feature_id || !failure_context) {
    return error('VALIDATION_ERROR', 'session_id, feature_id, and failure_context required', 400);
  }

  const prompt = buildSuggestionPrompt(failure_context, existing_test_codes ?? []);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return error('AI_ERROR', 'AI service not configured', 500);

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 2048,
    system: SUGGESTION_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText = textBlock?.type === 'text' ? textBlock.text : '';

  logAIUsage(auth.supabase, {
    featureId: feature_id,
    adminId: auth.userId,
    modelId: AI_MODEL,
    operationType: 'guided_testing',
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  }).catch(() => {});

  const suggestions = parseSuggestions(rawText);
  return json({ data: { suggestions } });
}

interface FailureContext {
  step_number: number;
  action: string;
  expected_outcome: string;
  actual_outcome: string;
  console_errors?: string[];
  failed_requests?: unknown[];
  page_state: unknown;
}

function buildSuggestionPrompt(ctx: FailureContext, existingCodes: string[]): string {
  const parts = [
    `Failed Step #${ctx.step_number}:`,
    `Action: ${ctx.action}`,
    `Expected: ${ctx.expected_outcome}`,
    `Actual: ${ctx.actual_outcome}`,
  ];
  if (ctx.console_errors?.length) {
    parts.push(`Console Errors: ${ctx.console_errors.join('; ')}`);
  }
  if (ctx.failed_requests?.length) {
    parts.push(`Failed Requests: ${JSON.stringify(ctx.failed_requests)}`);
  }
  parts.push(`Page State: ${JSON.stringify(ctx.page_state)}`);
  if (existingCodes.length > 0) {
    parts.push(`\nExisting test codes (avoid duplicates): ${existingCodes.join(', ')}`);
  }
  return parts.join('\n');
}

interface Suggestion {
  id: string;
  title: string;
  description: string;
  steps: string[];
  expected_outcome: string;
  related_criterion?: string;
  overlaps_with?: string;
}

function parseSuggestions(rawText: string): Suggestion[] {
  try {
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Suggestion[];
      return parsed.slice(0, 3).map((s) => ({
        id: s.id ?? crypto.randomUUID(),
        title: String(s.title ?? ''),
        description: String(s.description ?? ''),
        steps: Array.isArray(s.steps) ? s.steps : [],
        expected_outcome: String(s.expected_outcome ?? ''),
        related_criterion: s.related_criterion,
        overlaps_with: s.overlaps_with,
      }));
    }
  } catch {
    // Fall through
  }
  return [];
}

const SUGGESTION_SYSTEM_PROMPT = `You are an AI testing advisor. When a test step fails, suggest 1-3 targeted exploratory tests to probe the root cause.

Given the failure context (what was expected, what happened, console errors, network failures, page state), generate exploratory test suggestions.

Return a JSON array (max 3 items):
[
  {
    "id": "uuid-here",
    "title": "Short descriptive title",
    "description": "Why this test is suggested based on the failure",
    "steps": ["Step 1: Do this", "Step 2: Check that"],
    "expected_outcome": "What to verify",
    "related_criterion": "AC-3 (if related to a specific criterion)",
    "overlaps_with": "TC-108-005 (if it overlaps an existing test)"
  }
]

RULES:
- Focus on the root cause, not symptoms
- Reference actual UI elements from the page state
- Deduplicate against existing test codes
- Keep steps specific and actionable

Return ONLY the JSON array. No markdown fences.`;
