/**
 * implement-feature Edge Function (FR-105)
 * Manages implementation requests with reviewable task items.
 *
 * Routes:
 *   GET   ?feature_id=xxx          — Get request + task items for a feature
 *   POST                           — Create request, trigger AI, save task items
 *   POST  ?action=add-task         — Add a manual task item
 *   POST  ?action=implement        — Execute AI code generation for accepted tasks
 *   PATCH                          — Update task item decision/comment
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import {
  CreateRequestSchema,
  GetRequestSchema,
  UpdateTaskItemSchema,
  AddTaskItemSchema,
} from './schemas.ts';
import { generateImplementation } from './ai-implementation.ts';
import { generateCode } from './ai-codegen.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    // ── Auth ──
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }
    const token = authHeader.substring(7);

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);
    }

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id, email')
      .eq('user_id', user.id)
      .maybeSingle();
    if (!adminRow) {
      return errorResponse('FORBIDDEN', 'Admin access required', 403);
    }

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    // ── GET: Fetch request + task items ──
    if (req.method === 'GET') {
      const featureId = url.searchParams.get('feature_id');
      const validation = GetRequestSchema.safeParse({ feature_id: featureId });
      if (!validation.success) {
        return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
      }

      const { data: implRequest } = await supabase
        .from('implementation_requests')
        .select('*')
        .eq('feature_id', validation.data.feature_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!implRequest) {
        return errorResponse('NOT_FOUND', 'No implementation request exists for this feature', 404);
      }

      // Fetch task items
      const { data: taskItems } = await supabase
        .from('implementation_task_items')
        .select('*')
        .eq('request_id', implRequest.id)
        .order('sort_order', { ascending: true });

      return jsonResponse({
        data: { ...implRequest, task_items: taskItems || [] },
      });
    }

    // ── POST ?action=add-task: Add manual task item ──
    if (req.method === 'POST' && action === 'add-task') {
      const rawBody = await req.json();
      const validation = AddTaskItemSchema.safeParse(rawBody);
      if (!validation.success) {
        return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
      }

      const { request_id, title, description, file_path, task_type } = validation.data;

      // Get max sort_order
      const { data: maxItem } = await supabase
        .from('implementation_task_items')
        .select('sort_order')
        .eq('request_id', request_id)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();

      const nextOrder = (maxItem?.sort_order ?? -1) + 1;

      const { data: newItem, error: insertErr } = await supabase
        .from('implementation_task_items')
        .insert({
          request_id,
          title,
          description: description || null,
          file_path,
          task_type,
          source: 'manual',
          decision: 'pending',
          sort_order: nextOrder,
        })
        .select()
        .single();

      if (insertErr) {
        return errorResponse('DB_ERROR', 'Failed to add task item', 500);
      }

      return jsonResponse({ data: newItem }, 201);
    }

    // ── POST ?action=implement: Process ONE next task (called repeatedly by frontend) ──
    if (req.method === 'POST' && action === 'implement') {
      const rawBody = await req.json();
      const requestId = rawBody.request_id;
      if (!requestId) {
        return errorResponse('VALIDATION_ERROR', 'request_id is required', 400);
      }

      // Get the implementation request
      const { data: implRequest } = await supabase
        .from('implementation_requests')
        .select('*, feature:product_features(*)')
        .eq('id', requestId)
        .single();

      if (!implRequest) {
        return errorResponse('NOT_FOUND', 'Implementation request not found', 404);
      }

      // Recovery: reset any tasks stuck in 'generating' for >3 minutes
      const staleThreshold = new Date(Date.now() - 3 * 60 * 1000).toISOString();
      await supabase
        .from('implementation_task_items')
        .update({
          implementation_status: 'failed',
          ai_log: 'Timed out — task was stuck in generating state',
          updated_at: new Date().toISOString(),
        })
        .eq('request_id', requestId)
        .eq('implementation_status', 'generating')
        .lt('updated_at', staleThreshold);

      // Get the NEXT accepted task that hasn't been implemented
      const { data: tasks } = await supabase
        .from('implementation_task_items')
        .select('*')
        .eq('request_id', requestId)
        .in('decision', ['accepted', 'modified'])
        .in('implementation_status', ['pending', 'failed'])
        .order('sort_order', { ascending: true })
        .limit(1);

      if (!tasks || tasks.length === 0) {
        // No more tasks — check final status and mark request done
        const { data: allItems } = await supabase
          .from('implementation_task_items')
          .select('implementation_status, decision')
          .eq('request_id', requestId)
          .in('decision', ['accepted', 'modified']);

        const allDone = allItems?.every(t => t.implementation_status === 'completed');
        await supabase
          .from('implementation_requests')
          .update({
            status: allDone ? 'implemented' : 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', requestId);

        return jsonResponse({ data: { done: true, remaining: 0 } });
      }

      const task = tasks[0];
      const feature = implRequest.feature;
      const featureContext = {
        feature_code: feature.feature_code,
        title: feature.title,
        description: feature.description,
        criteria: feature.acceptance_criteria || [],
      };

      // Ensure request status is 'implementing'
      if (implRequest.status !== 'implementing') {
        await supabase
          .from('implementation_requests')
          .update({ status: 'implementing', updated_at: new Date().toISOString() })
          .eq('id', requestId);
      }

      // Mark task as generating
      await supabase
        .from('implementation_task_items')
        .update({ implementation_status: 'generating', updated_at: new Date().toISOString() })
        .eq('id', task.id);

      // Generate code for this ONE task
      const result = await generateCode(
        {
          title: task.title,
          description: task.description,
          file_path: task.file_path,
          task_type: task.task_type,
        },
        featureContext,
      );

      if (result && result.code) {
        await supabase
          .from('implementation_task_items')
          .update({
            implementation_status: 'completed',
            generated_code: result.code,
            ai_log: result.log,
            updated_at: new Date().toISOString(),
          })
          .eq('id', task.id);
      } else {
        const failLog = result?.log || 'AI code generation failed';
        await supabase
          .from('implementation_task_items')
          .update({
            implementation_status: 'failed',
            ai_log: failLog,
            updated_at: new Date().toISOString(),
          })
          .eq('id', task.id);
      }

      // Count remaining tasks
      const { count: remaining } = await supabase
        .from('implementation_task_items')
        .select('id', { count: 'exact', head: true })
        .eq('request_id', requestId)
        .in('decision', ['accepted', 'modified'])
        .in('implementation_status', ['pending', 'failed']);

      // If no remaining tasks, mark request done
      if (remaining === 0) {
        const { data: allItems } = await supabase
          .from('implementation_task_items')
          .select('implementation_status, decision')
          .eq('request_id', requestId)
          .in('decision', ['accepted', 'modified']);

        const allDone = allItems?.every(t => t.implementation_status === 'completed');
        await supabase
          .from('implementation_requests')
          .update({
            status: allDone ? 'implemented' : 'completed',
            updated_at: new Date().toISOString(),
          })
          .eq('id', requestId);
      }

      console.log(`Implementation: ${feature.feature_code} task "${task.title}" — ${result?.code ? 'completed' : 'failed'} (${remaining} remaining)`);

      return jsonResponse({
        data: {
          done: remaining === 0,
          remaining: remaining ?? 0,
          task_id: task.id,
          status: result?.code ? 'completed' : 'failed',
        },
      });
    }

    // ── POST: Create implementation request ──
    if (req.method === 'POST') {
      const rawBody = await req.json();
      const validation = CreateRequestSchema.safeParse(rawBody);
      if (!validation.success) {
        return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
      }

      const { feature_id, implementation_notes } = validation.data;

      const { data: feature, error: featureErr } = await supabase
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
      const { data: existing } = await supabase
        .from('implementation_requests')
        .select('id, status')
        .eq('feature_id', feature_id)
        .in('status', ['pending', 'in_progress'])
        .maybeSingle();

      if (existing) {
        return errorResponse('DUPLICATE', 'An implementation request is already active', 409);
      }

      const { data: testCases } = await supabase
        .from('test_cases')
        .select('test_code, title, description')
        .eq('feature_id', feature_id);

      const criteria = feature.acceptance_criteria || [];
      const implementationPrompt = buildPrompt(feature, criteria, testCases || [], implementation_notes);

      // Create request record
      const { data: implRequest, error: insertErr } = await supabase
        .from('implementation_requests')
        .insert({
          feature_id,
          requested_by: user.id,
          requested_by_name: adminRow.email || user.email,
          status: 'pending',
          implementation_notes: implementation_notes || null,
          implementation_prompt: implementationPrompt,
        })
        .select()
        .single();

      if (insertErr) {
        return errorResponse('DB_ERROR', 'Failed to create implementation request', 500);
      }

      // Update feature status
      await supabase
        .from('product_features')
        .update({ status: 'in_development' })
        .eq('id', feature_id);

      // Generate AI plan
      const aiPlan = await generateImplementation(
        feature.feature_code,
        feature.title,
        feature.description,
        criteria,
        testCases || [],
        implementation_notes || null,
      );

      if (aiPlan) {
        // Save AI response on the request
        await supabase
          .from('implementation_requests')
          .update({
            status: 'completed',
            ai_response: {
              summary: aiPlan.summary,
              architecture_notes: aiPlan.architecture_notes,
            },
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq('id', implRequest.id);

        // Save each task as an individual reviewable item
        const taskRows = aiPlan.tasks.map((t, i) => ({
          request_id: implRequest.id,
          title: t.title,
          description: t.description || null,
          file_path: t.file_path,
          task_type: t.task_type,
          source: 'ai_generated',
          decision: 'pending',
          sort_order: i,
        }));

        const { data: savedItems } = await supabase
          .from('implementation_task_items')
          .insert(taskRows)
          .select();

        console.log(`AI implementation: ${feature.feature_code} — ${aiPlan.tasks.length} tasks saved`);

        return jsonResponse({
          data: {
            ...implRequest,
            status: 'completed',
            ai_response: {
              summary: aiPlan.summary,
              architecture_notes: aiPlan.architecture_notes,
            },
            task_items: savedItems || [],
          },
        }, 201);
      }

      // AI failed — manual mode
      await supabase
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

    // ── PATCH: Update task item decision/comment ──
    if (req.method === 'PATCH') {
      const rawBody = await req.json();
      const validation = UpdateTaskItemSchema.safeParse(rawBody);
      if (!validation.success) {
        return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
      }

      const { item_id, decision, title, description, comment } = validation.data;

      // Get current item
      const { data: item, error: fetchErr } = await supabase
        .from('implementation_task_items')
        .select('*')
        .eq('id', item_id)
        .single();

      if (fetchErr || !item) {
        return errorResponse('NOT_FOUND', 'Task item not found', 404);
      }

      const updates: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };

      if (decision) {
        updates.decision = decision;
        updates.decided_by = user.id;
        updates.decided_at = new Date().toISOString();
      }

      if (title) updates.title = title;
      if (description !== undefined) updates.description = description;

      // Append comment
      if (comment) {
        const existingComments = (item.comments as Array<Record<string, unknown>>) || [];
        existingComments.push({
          user_id: user.id,
          user_name: adminRow.email || user.email,
          text: comment,
          created_at: new Date().toISOString(),
        });
        updates.comments = existingComments;
      }

      const { data: updated, error: updateErr } = await supabase
        .from('implementation_task_items')
        .update(updates)
        .eq('id', item_id)
        .select()
        .single();

      if (updateErr) {
        return errorResponse('DB_ERROR', 'Failed to update task item', 500);
      }

      return jsonResponse({ data: updated });
    }

    return errorResponse('METHOD_NOT_ALLOWED', `Method ${req.method} not allowed`, 405);
  } catch (error) {
    console.error('Unhandled error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});

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
