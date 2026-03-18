/**
 * POST handler: Create a new implementation request and trigger AI plan generation
 */

import { CreateRequestSchema } from './schemas.ts';
import { generateImplementation } from './ai-implementation.ts';
import { jsonResponse, errorResponse, type AuthContext } from './shared.ts';

export async function handleCreateRequest(req: Request, ctx: AuthContext): Promise<Response> {
  const rawBody = await req.json();
  const validation = CreateRequestSchema.safeParse(rawBody);
  if (!validation.success) {
    return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
  }

  const { feature_id, implementation_notes } = validation.data;

  const { data: feature, error: featureErr } = await ctx.supabase
    .from('product_features')
    .select('*')
    .eq('id', feature_id)
    .single();

  if (featureErr || !feature) {
    return errorResponse('NOT_FOUND', 'Feature not found', 404);
  }

  if (feature.status !== 'approved') {
    return errorResponse('INVALID_STATE', `Feature must be "approved", currently "${feature.status}"`, 400);
  }

  // Check for existing active request
  const { data: existing } = await ctx.supabase
    .from('implementation_requests')
    .select('id, status')
    .eq('feature_id', feature_id)
    .in('status', ['pending', 'in_progress'])
    .maybeSingle();

  if (existing) {
    return errorResponse('DUPLICATE', 'An implementation request is already active', 409);
  }

  const { data: testCases } = await ctx.supabase
    .from('test_cases')
    .select('test_code, title, description')
    .eq('feature_id', feature_id);

  const criteria = feature.acceptance_criteria || [];
  const prompt = buildPrompt(feature, criteria, testCases || [], implementation_notes);

  // Create request record
  const { data: implRequest, error: insertErr } = await ctx.supabase
    .from('implementation_requests')
    .insert({
      feature_id,
      requested_by: ctx.user.id,
      requested_by_name: ctx.admin.email || ctx.user.email,
      status: 'pending',
      implementation_notes: implementation_notes || null,
      implementation_prompt: prompt,
    })
    .select()
    .single();

  if (insertErr) {
    return errorResponse('DB_ERROR', 'Failed to create implementation request', 500);
  }

  // Update feature status
  await ctx.supabase
    .from('product_features')
    .update({ status: 'in_development' })
    .eq('id', feature_id);

  // Generate AI plan
  const aiPlan = await generateImplementation(
    feature.feature_code, feature.title, feature.description,
    criteria, testCases || [], implementation_notes || null,
  );

  if (aiPlan) {
    return await saveAiPlan(ctx, implRequest, feature, aiPlan);
  }

  return await saveManualFallback(ctx, implRequest);
}

async function saveAiPlan(
  ctx: AuthContext,
  implRequest: Record<string, unknown>,
  feature: Record<string, unknown>,
  aiPlan: { summary: string; architecture_notes: string; tasks: Array<{ title: string; description?: string; file_path: string; task_type: string }> },
): Promise<Response> {
  await ctx.supabase
    .from('implementation_requests')
    .update({
      status: 'completed',
      ai_response: { summary: aiPlan.summary, architecture_notes: aiPlan.architecture_notes },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', implRequest.id);

  const taskRows = aiPlan.tasks.map((t, i) => ({
    request_id: implRequest.id as string,
    title: t.title,
    description: t.description || null,
    file_path: t.file_path,
    task_type: t.task_type,
    source: 'ai_generated',
    decision: 'pending',
    sort_order: i,
  }));

  const { data: savedItems } = await ctx.supabase
    .from('implementation_task_items')
    .insert(taskRows)
    .select();

  console.log(`AI implementation: ${(feature as Record<string, string>).feature_code} — ${aiPlan.tasks.length} tasks saved`);

  return jsonResponse({
    data: {
      ...implRequest,
      status: 'completed',
      ai_response: { summary: aiPlan.summary, architecture_notes: aiPlan.architecture_notes },
      task_items: savedItems || [],
    },
  }, 201);
}

async function saveManualFallback(
  ctx: AuthContext,
  implRequest: Record<string, unknown>,
): Promise<Response> {
  await ctx.supabase
    .from('implementation_requests')
    .update({
      status: 'completed',
      error_message: 'AI unavailable. Add implementation tasks manually.',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', implRequest.id);

  return jsonResponse({
    data: {
      ...implRequest,
      status: 'completed',
      task_items: [],
      error_message: 'AI unavailable. Add implementation tasks manually.',
    },
  }, 201);
}

function buildPrompt(
  feature: { feature_code: string; title: string; description: string; priority: string; feature_type: string },
  criteria: string[],
  testCases: { test_code: string; title: string; description?: string }[],
  notes: string | undefined,
): string {
  return `## Feature Implementation Request

**Feature Code:** ${feature.feature_code}
**Title:** ${feature.title}
**Description:** ${feature.description}
**Priority:** ${feature.priority}
**Type:** ${feature.feature_type}

### Acceptance Criteria:
${criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}

### Test Cases:
${testCases.length > 0 ? testCases.map(tc => `- ${tc.test_code}: ${tc.title}`).join('\n') : 'None defined.'}

### Implementation Notes:
${notes || 'No additional notes provided.'}

### Instructions:
Implement this feature following the project coding standards and patterns.
Create test cases for each acceptance criterion.
Update the roadmap when complete.`.trim();
}
