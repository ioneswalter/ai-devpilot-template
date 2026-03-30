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
import { runCICheck } from './ci-check.ts';
import { runDeploy } from './deploy.ts';
import { runTestReadiness } from './test-readiness.ts';

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

    // GET → status or notifications
    if (req.method === 'GET') {
      const url = new URL(req.url);
      if (url.searchParams.get('action') === 'notifications') {
        const unreadOnly = url.searchParams.get('unread') !== 'false';
        let query = supabase.from('pipeline_notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(20);
        if (unreadOnly) query = query.eq('read', false);
        const { data, error } = await query;
        if (error) return errorResponse('INTERNAL_ERROR', error.message, 500);
        return jsonResponse({ data: data ?? [] });
      }
      // FR-118: Learning insights
      if (url.searchParams.get('action') === 'learning-insights') {
        const [pats, fails, recs, metrics] = await Promise.all([
          supabase.from('failure_patterns').select('*').eq('is_active', true).order('frequency', { ascending: false }).limit(10),
          supabase.from('pipeline_failures').select('id, error_type, error_code, error_message, file_path, outcome, created_at').order('created_at', { ascending: false }).limit(20),
          supabase.from('constitution_recommendations').select('*').order('created_at', { ascending: false }).limit(10),
          supabase.from('pipeline_failures').select('id', { count: 'exact', head: true }),
        ]);
        const patCount = (await supabase.from('failure_patterns').select('id', { count: 'exact', head: true })).count ?? 0;
        const activeCount = (await supabase.from('failure_patterns').select('id', { count: 'exact', head: true }).eq('is_active', true)).count ?? 0;
        return jsonResponse({ data: { top_patterns: pats.data ?? [], recent_failures: fails.data ?? [], recommendations: recs.data ?? [], metrics: { total_failures: metrics.count ?? 0, patterns_detected: patCount, adaptations_active: activeCount } } });
      }
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

        case 'rerun-ci': {
          // Re-run CI validation on existing generated code
          const pid = body.pipeline_id as string;
          if (!pid) return errorResponse('VALIDATION_ERROR', 'pipeline_id is required', 400);
          const { data: pRun } = await supabase
            .from('pipeline_runs')
            .select('request_id, status')
            .eq('id', pid)
            .single();
          if (!pRun) return errorResponse('NOT_FOUND', 'Pipeline not found', 404);
          if (pRun.status === 'running') return errorResponse('CONFLICT', 'Pipeline is still running', 409);
          // Reset to running for CI re-run
          await supabase.from('pipeline_runs').update({
            status: 'running',
            current_stage: 'build_check',
            ci_results: null,
            completed_at: null,
            last_heartbeat: new Date().toISOString(),
          }).eq('id', pid);
          // Fire and forget CI check
          runCICheck(pid, pRun.request_id).catch(err => console.error('rerun-ci error:', err));
          return jsonResponse({ data: { pipeline_id: pid, status: 'running', stage: 'build_check' } });
        }

        case 'redeploy': {
          const dpid = body.pipeline_id as string;
          if (!dpid) return errorResponse('VALIDATION_ERROR', 'pipeline_id is required', 400);
          const { data: dRun } = await supabase
            .from('pipeline_runs')
            .select('request_id, status')
            .eq('id', dpid)
            .single();
          if (!dRun) return errorResponse('NOT_FOUND', 'Pipeline not found', 404);
          if (dRun.status === 'running') return errorResponse('CONFLICT', 'Pipeline is still running', 409);
          await supabase.from('pipeline_runs').update({
            status: 'running',
            current_stage: 'deploying',
            deploy_results: null,
            completed_at: null,
            last_heartbeat: new Date().toISOString(),
          }).eq('id', dpid);
          runDeploy(dpid, dRun.request_id).catch(err => console.error('redeploy error:', err));
          return jsonResponse({ data: { pipeline_id: dpid, status: 'running', stage: 'deploying' } });
        }

        case 'rerun-readiness': {
          const rpid = body.pipeline_id as string;
          if (!rpid) return errorResponse('VALIDATION_ERROR', 'pipeline_id is required', 400);
          const { data: rRun } = await supabase
            .from('pipeline_runs')
            .select('request_id, status')
            .eq('id', rpid)
            .single();
          if (!rRun) return errorResponse('NOT_FOUND', 'Pipeline not found', 404);
          if (rRun.status === 'running') return errorResponse('CONFLICT', 'Pipeline is still running', 409);
          await supabase.from('pipeline_runs').update({
            status: 'running',
            current_stage: 'readying',
            readiness_results: null,
            completed_at: null,
            last_heartbeat: new Date().toISOString(),
          }).eq('id', rpid);
          runTestReadiness(rpid, rRun.request_id).catch(err => console.error('rerun-readiness error:', err));
          return jsonResponse({ data: { pipeline_id: rpid, status: 'running', stage: 'readying' } });
        }

        case 'mark-notification-read': {
          const nid = body.notification_id as string;
          if (!nid) return errorResponse('VALIDATION_ERROR', 'notification_id is required', 400);
          await supabase.from('pipeline_notifications').update({ read: true }).eq('id', nid);
          return jsonResponse({ data: { id: nid, read: true } });
        }

        case 'approve-recommendation': {
          const recId = body.recommendation_id as string;
          if (!recId) return errorResponse('VALIDATION_ERROR', 'recommendation_id required', 400);
          await supabase.from('constitution_recommendations').update({ status: 'approved', decided_by: ctx.admin.id, decided_at: new Date().toISOString() }).eq('id', recId);
          return jsonResponse({ data: { id: recId, status: 'approved' } });
        }

        case 'dismiss-recommendation': {
          const dRecId = body.recommendation_id as string;
          if (!dRecId) return errorResponse('VALIDATION_ERROR', 'recommendation_id required', 400);
          await supabase.from('constitution_recommendations').update({ status: 'dismissed', decided_by: ctx.admin.id, decided_at: new Date().toISOString() }).eq('id', dRecId);
          return jsonResponse({ data: { id: dRecId, status: 'dismissed' } });
        }

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
