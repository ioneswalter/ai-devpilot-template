/**
 * Pipeline Orchestrator Edge Function (FR-113)
 * Server-side pipeline execution with self-chaining pattern
 *
 * Routes:
 *   GET  → status (query params: feature_id or pipeline_id)
 *   POST → start | next | cancel | health-check (via action field)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, jsonResponse, errorResponse, type AuthContext } from './shared.ts';
import { handleStart } from './start.ts';
import { handleNext } from './next.ts';
import { handleCancel } from './cancel.ts';
import { handleStatus } from './status.ts';
import { handleHealthCheck } from './health-check.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auth — require valid token
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }

    const token = authHeader.substring(7);
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

    // Internal self-calls use service role key directly
    const isInternalCall = token === serviceRoleKey;

    let ctx: AuthContext;

    if (isInternalCall) {
      // Internal call from self-chaining — use system context
      ctx = {
        user: { id: 'system' },
        admin: { id: 'system', email: 'pipeline@system' },
        supabase,
      };
    } else {
      // External call — validate user token
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

      ctx = {
        user: { id: user.id, email: user.email },
        admin: { id: adminRow.id, email: adminRow.email },
        supabase,
      };
    }

    // GET → status
    if (req.method === 'GET') {
      return handleStatus(req, ctx);
    }

    // POST → route by action
    if (req.method === 'POST') {
      // Clone request to peek at action without consuming body
      const body = await req.json();
      const action = body.action;

      if (!action) {
        return errorResponse('VALIDATION_ERROR', 'action is required', 400);
      }

      // Reconstruct request with body for handlers that need it
      const newReq = new Request(req.url, {
        method: 'POST',
        headers: req.headers,
        body: JSON.stringify(body),
      });

      switch (action) {
        case 'start':
          return handleStart(newReq, ctx);

        case 'next':
          // Internal only — fire and forget (don't block on response)
          handleNext({
            pipeline_id: body.pipeline_id,
            request_id: body.request_id,
            retry_count: body.retry_count ?? 0,
          });
          return jsonResponse({ data: { acknowledged: true } });

        case 'cancel':
          return handleCancel(newReq, ctx);

        case 'health-check':
          return handleHealthCheck();

        default:
          return errorResponse('VALIDATION_ERROR', `Unknown action: ${action}`, 400);
      }
    }

    return errorResponse('METHOD_NOT_ALLOWED', 'Only GET and POST allowed', 405);
  } catch (error) {
    console.error('Pipeline orchestrator error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
