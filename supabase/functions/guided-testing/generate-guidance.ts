/** Generate AI test guidance from acceptance criteria + page state (FR-108 J1) */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logAIUsage } from '../_shared/usage-logger.ts';
import { CONSTITUTION_PRINCIPLES } from '../_shared/knowledge-context.ts';
import { fetchLearnings } from '../_shared/learning-logger.ts';
import { resolveAuth, isAuth } from './auth.ts';

const AI_MODEL = 'claude-sonnet-4-6';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

export async function handleGenerateGuidance(req: Request): Promise<Response> {
  const auth = await resolveAuth(req);
  if (!isAuth(auth)) return auth;

  const body = await req.json();
  const { feature_id, test_case_id, page_state } = body;
  if (!feature_id || !test_case_id) {
    return error('VALIDATION_ERROR', 'feature_id and test_case_id required', 400);
  }

  // Fetch feature + acceptance criteria
  const { data: feature } = await auth.supabase
    .from('product_features')
    .select('id, title, description, acceptance_criteria')
    .eq('id', feature_id)
    .single();

  if (!feature) return error('NOT_FOUND', 'Feature not found', 404);

  const criteria = (feature.acceptance_criteria as string[]) ?? [];
  if (criteria.length === 0) {
    return error('NO_CRITERIA', 'Feature has no acceptance criteria', 404);
  }

  // Fetch test case
  const { data: testCase } = await auth.supabase
    .from('test_cases')
    .select('id, test_code, title, steps, expected_result')
    .eq('id', test_case_id)
    .single();

  if (!testCase) return error('NOT_FOUND', 'Test case not found', 404);

  // Create session
  const { data: session } = await auth.supabase
    .from('guided_test_sessions')
    .insert({
      feature_id,
      test_case_id,
      admin_id: auth.userId,
      status: 'active',
      ai_model: AI_MODEL,
    })
    .select('id')
    .single();

  if (!session) return error('DB_ERROR', 'Failed to create session', 500);

  // Build AI prompt and generate guidance
  const prompt = buildGuidancePrompt(feature, testCase, criteria, page_state);
  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  if (!apiKey) return error('AI_ERROR', 'AI service not configured', 500);

  // Fetch learnings from prompt library (Phase 3)
  const learnings = await fetchLearnings(auth.supabase, 'test_guidance', 5);
  const enrichedPrompt = GUIDANCE_SYSTEM_PROMPT + learnings;

  const anthropic = new Anthropic({ apiKey });
  const response = await anthropic.messages.create({
    model: AI_MODEL,
    max_tokens: 4096,
    system: enrichedPrompt,
    messages: [{ role: 'user', content: prompt }],
  });

  const textBlock = response.content.find((b) => b.type === 'text');
  const rawText = textBlock?.type === 'text' ? textBlock.text : '';

  // Log AI usage
  logAIUsage(auth.supabase, {
    featureId: feature_id,
    adminId: auth.userId,
    modelId: AI_MODEL,
    operationType: 'guided_testing',
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
  }).catch(() => {});

  // Parse steps from AI response
  const steps = parseGuidanceSteps(rawText, criteria);

  // Update session with total steps
  await auth.supabase
    .from('guided_test_sessions')
    .update({ total_steps: steps.length, guidance_context: { steps } })
    .eq('id', session.id);

  return json({
    data: {
      session_id: session.id,
      steps,
      total_steps: steps.length,
      model_used: AI_MODEL,
    },
  });
}

interface FeatureRow {
  id: string;
  title: string;
  description: string | null;
  acceptance_criteria: unknown;
}

interface TestCaseRow {
  id: string;
  test_code: string;
  title: string;
  steps: unknown;
  expected_result: string | null;
}

function buildGuidancePrompt(
  feature: FeatureRow,
  testCase: TestCaseRow,
  criteria: string[],
  pageState: unknown
): string {
  const parts = [
    `Feature: ${feature.title}`,
    feature.description ? `Description: ${feature.description}` : '',
    `\nAcceptance Criteria:`,
    ...criteria.map((c, i) => `AC-${i + 1}: ${c}`),
    `\nTest Case: ${testCase.test_code} — ${testCase.title}`,
  ];

  if (testCase.steps) {
    const stepsArr = Array.isArray(testCase.steps) ? testCase.steps : [];
    parts.push(`Existing Steps: ${JSON.stringify(stepsArr)}`);
  }
  if (testCase.expected_result) {
    parts.push(`Expected Result: ${testCase.expected_result}`);
  }
  if (pageState) {
    parts.push(`\nCurrent Page State:\n${JSON.stringify(pageState, null, 2)}`);
  }

  return parts.filter(Boolean).join('\n');
}

interface ParsedStep {
  step_number: number;
  action: string;
  target_element: string;
  expected_outcome: string;
  criterion_id: string;
  criterion_text: string;
  requires_navigation?: string;
}

function parseGuidanceSteps(rawText: string, criteria: string[]): ParsedStep[] {
  try {
    // Try to parse JSON array from AI response
    const jsonMatch = rawText.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as ParsedStep[];
      return parsed.map((step, i) => ({
        step_number: step.step_number ?? i + 1,
        action: step.action ?? '',
        target_element: step.target_element ?? '',
        expected_outcome: step.expected_outcome ?? '',
        criterion_id: step.criterion_id ?? `AC-${i + 1}`,
        criterion_text: step.criterion_text ?? criteria[i] ?? '',
        requires_navigation: step.requires_navigation,
      }));
    }
  } catch {
    // Fall through to fallback
  }

  // Fallback: create one step per criterion
  return criteria.map((c, i) => ({
    step_number: i + 1,
    action: `Verify: ${c}`,
    target_element: 'See acceptance criterion',
    expected_outcome: c,
    criterion_id: `AC-${i + 1}`,
    criterion_text: c,
  }));
}

const APP_ROUTES = `APP NAVIGATION REFERENCE (use these exact routes):
- /learn?tab=courses — Course Builder (create/edit courses, modules, quizzes)
- /learn?tab=lms — LMS Monitoring Dashboard
- /admin?tab=overview — Admin Overview
- /admin?tab=users — User Management
- /admin?tab=verifications — Provider Verifications
- /learn — Learner course catalog (enrollment, course delivery)
- /learn/{courseId} — Individual course view
- /learn/{courseId}/module/{moduleId} — Module content + quizzes
- /roadmap — Product Roadmap (features, test panels, pipeline)
- /dashboard — Main dashboard
- /marketplace — Service marketplace
- /ideation — Feature ideation chat
- /membership — Membership page
- /customer/post-job — Post a new job
- /provider/invoices — Provider invoices
NEVER guess URLs. Only use routes from this list.`;

const GUIDANCE_SYSTEM_PROMPT = `You are an AI testing co-pilot. Generate step-by-step test instructions for manual QA testing.

Given a feature's acceptance criteria, test case definition, and the current page state (visible UI elements), generate specific, actionable test steps.

${CONSTITUTION_PRINCIPLES}

${APP_ROUTES}

CRITICAL RULES:
1. Reference ACTUAL UI elements from the page state (buttons by text, inputs by label, etc.)
2. Each step maps to a specific acceptance criterion (use AC-1, AC-2, etc.)
3. Include navigation instructions if the tester needs to go to a different page — use ONLY routes from the APP NAVIGATION REFERENCE above
4. Describe expected visual outcomes clearly

Return a JSON array of steps:
[
  {
    "step_number": 1,
    "action": "Click the 'Start Implementation' button in the top-right of the pipeline bar",
    "target_element": "Button with text 'Start Implementation'",
    "expected_outcome": "A modal opens showing AI model selection options",
    "criterion_id": "AC-3",
    "criterion_text": "The full criterion text...",
    "requires_navigation": "/admin?tab=courses"
  }
]

Return ONLY the JSON array. No markdown fences, no explanations.`;
