/**
 * POST handler: Create a new implementation request
 * Loads tasks from SpecKit artifacts (tasks.md) instead of AI-inventing them.
 * Falls back to AI generation only if no SpecKit artifacts exist.
 */

import { CreateRequestSchema } from './schemas.ts';
import { generateImplementation } from './ai-implementation.ts';
import { jsonResponse, errorResponse, type AuthContext } from './shared.ts';
import { parseTasksMarkdown } from './parse-tasks.ts';

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

  if (feature.status !== 'specified' && feature.status !== 'in_development') {
    return errorResponse(
      'INVALID_STATE',
      `Feature must be "specified" or "in_development", currently "${feature.status}"`,
      400
    );
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

  // Load SpecKit artifacts from DB
  const { data: artifacts } = await ctx.supabase
    .from('feature_spec_artifacts')
    .select('artifact_type, file_name, content')
    .eq('feature_id', feature_id);

  const tasksArtifact = artifacts?.find(
    (a: { artifact_type: string }) => a.artifact_type === 'tasks'
  );

  // Create request record
  const criteria = feature.acceptance_criteria || [];
  const prompt = buildPrompt(feature, criteria, implementation_notes);

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

  // Strategy: Use SpecKit tasks.md if available, fall back to AI generation
  if (tasksArtifact) {
    return await saveSpecKitTasks(ctx, implRequest, feature, tasksArtifact.content);
  }

  // Fallback: AI-generated tasks (legacy behavior)
  const { data: testCases } = await ctx.supabase
    .from('test_cases')
    .select('test_code, title, description')
    .eq('feature_id', feature_id);

  const aiPlan = await generateImplementation(
    feature.feature_code,
    feature.title,
    feature.description,
    criteria,
    testCases || [],
    implementation_notes || null
  );

  if (aiPlan) {
    return await saveAiPlan(ctx, implRequest, feature, aiPlan);
  }

  return await saveManualFallback(ctx, implRequest);
}

/** Parse tasks.md from SpecKit and save as implementation task items */
async function saveSpecKitTasks(
  ctx: AuthContext,
  implRequest: Record<string, unknown>,
  feature: Record<string, unknown>,
  tasksContent: string
): Promise<Response> {
  const tasks = parseTasksMarkdown(tasksContent);

  if (tasks.length === 0) {
    // tasks.md exists but couldn't parse — fall back to manual
    return await saveManualFallback(ctx, implRequest);
  }

  await ctx.supabase
    .from('implementation_requests')
    .update({
      status: 'completed',
      ai_response: {
        summary: `Loaded ${tasks.length} tasks from SpecKit tasks.md`,
        architecture_notes: 'Tasks sourced from SpecKit workflow artifacts.',
      },
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', implRequest.id);

  const taskRows = tasks.map((t, i) => ({
    request_id: implRequest.id as string,
    title: t.title,
    description: t.description || null,
    file_path: t.file_path || 'TBD',
    task_type: t.task_type,
    source: 'speckit',
    decision: 'pending',
    sort_order: i,
  }));

  const { data: savedItems, error: taskErr } = await ctx.supabase
    .from('implementation_task_items')
    .insert(taskRows)
    .select();

  if (taskErr) {
    console.error(`Failed to save SpecKit tasks: ${taskErr.message}`);
  }

  const code = (feature as Record<string, string>).feature_code;
  console.log(`SpecKit tasks: ${code} — ${savedItems?.length ?? 0}/${tasks.length} tasks saved`);

  return jsonResponse(
    {
      data: {
        ...implRequest,
        status: 'completed',
        ai_response: {
          summary: `Loaded ${tasks.length} tasks from SpecKit`,
          architecture_notes: 'SpecKit-sourced',
        },
        task_items: savedItems || [],
      },
    },
    201
  );
}

async function saveAiPlan(
  ctx: AuthContext,
  implRequest: Record<string, unknown>,
  feature: Record<string, unknown>,
  aiPlan: {
    summary: string;
    architecture_notes: string;
    tasks: Array<{ title: string; description?: string; file_path: string; task_type: string }>;
  }
): Promise<Response> {
  await ctx.supabase
    .from('implementation_requests')
    .update({
      status: 'completed',
      ai_response: {
        summary: aiPlan.summary,
        architecture_notes: aiPlan.architecture_notes,
        tasks: aiPlan.tasks,
      },
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

  const { data: savedItems, error: taskErr } = await ctx.supabase
    .from('implementation_task_items')
    .insert(taskRows)
    .select();

  if (taskErr) {
    console.error(`Failed to save task items: ${taskErr.message}`);
  }

  const code = (feature as Record<string, string>).feature_code;
  console.log(
    `AI fallback: ${code} — ${savedItems?.length ?? 0}/${aiPlan.tasks.length} tasks saved`
  );

  return jsonResponse(
    {
      data: {
        ...implRequest,
        status: 'completed',
        ai_response: { summary: aiPlan.summary, architecture_notes: aiPlan.architecture_notes },
        task_items: savedItems || [],
      },
    },
    201
  );
}

async function saveManualFallback(
  ctx: AuthContext,
  implRequest: Record<string, unknown>
): Promise<Response> {
  await ctx.supabase
    .from('implementation_requests')
    .update({
      status: 'completed',
      error_message: 'No SpecKit artifacts found and AI unavailable. Add tasks manually.',
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', implRequest.id);

  return jsonResponse(
    {
      data: {
        ...implRequest,
        status: 'completed',
        task_items: [],
        error_message: 'No SpecKit artifacts found and AI unavailable. Add tasks manually.',
      },
    },
    201
  );
}

function buildPrompt(
  feature: {
    feature_code: string;
    title: string;
    description: string;
    priority: string;
    feature_type: string;
  },
  criteria: string[],
  notes: string | undefined
): string {
  return `## Feature: ${feature.feature_code} — ${feature.title}
${feature.description}

### Acceptance Criteria:
${criteria.map((c: string, i: number) => `${i + 1}. ${c}`).join('\n')}

### Notes:
${notes || 'None.'}`.trim();
}
