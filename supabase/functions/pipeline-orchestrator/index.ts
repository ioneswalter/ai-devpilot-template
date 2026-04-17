/**
 * Pipeline Orchestrator Edge Function (FR-113)
 * Server-side pipeline execution with self-chaining pattern
 *
 * Routes:
 *   GET  -> status (query params: feature_id or pipeline_id)
 *   POST -> start | next | cancel | health-check (via action field)
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
import { cancelQueueEntry } from './queue-manager.ts';
import { createAndStartPipeline } from './start.ts';
import { handleAcknowledgeEscalation, handleResolveEscalation } from './escalation.ts';
import {
  handleNotifications,
  handleQueueStatus,
  handleDeployProgress,
  handleConflictReport,
  handleLearningInsights,
} from './get-handlers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }

    const token = authHeader.substring(7);
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isInternalCall = token === serviceRoleKey;

    let ctx: AuthContext;

    if (isInternalCall) {
      ctx = { user: { id: 'system' }, admin: { id: 'system', email: 'pipeline@system' }, supabase };
    } else {
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
      if (authErr || !user) return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);

      const { data: adminRow } = await supabase
        .from('admin_users')
        .select('id, email')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!adminRow) return errorResponse('FORBIDDEN', 'Admin access required', 403);

      ctx = { user: { id: user.id, email: user.email }, admin: { id: adminRow.id, email: adminRow.email }, supabase };
    }

    // GET handlers
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const action = url.searchParams.get('action');

      switch (action) {
        case 'notifications': return handleNotifications(supabase, url);
        case 'queue-status': return handleQueueStatus(supabase);
        case 'deploy-progress': return handleDeployProgress(supabase, url);
        case 'conflict-report': return handleConflictReport(supabase, url);
        case 'learning-insights': return handleLearningInsights(supabase);
        default: return handleStatus(req, ctx);
      }
    }

    // POST handlers
    if (req.method === 'POST') {
      const body = await req.json();
      const action = body.action;
      if (!action) return errorResponse('VALIDATION_ERROR', 'action is required', 400);

      const newReq = new Request(req.url, {
        method: 'POST', headers: req.headers, body: JSON.stringify(body),
      });

      switch (action) {
        case 'start':
          return handleStart(newReq, ctx);

        case 'next':
          handleNext({ pipeline_id: body.pipeline_id, request_id: body.request_id, retry_count: body.retry_count ?? 0 });
          return jsonResponse({ data: { acknowledged: true } });

        case 'cancel':
          return handleCancel(newReq, ctx);

        case 'rerun-ci': {
          const pid = body.pipeline_id as string;
          if (!pid) return errorResponse('VALIDATION_ERROR', 'pipeline_id is required', 400);
          const { data: pRun } = await supabase.from('pipeline_runs').select('request_id, status').eq('id', pid).single();
          if (!pRun) return errorResponse('NOT_FOUND', 'Pipeline not found', 404);
          if (pRun.status === 'running') return errorResponse('CONFLICT', 'Pipeline is still running', 409);
          await supabase.from('pipeline_runs').update({ status: 'running', current_stage: 'build_check', ci_results: null, completed_at: null, last_heartbeat: new Date().toISOString() }).eq('id', pid);
          runCICheck(pid, pRun.request_id).catch(err => console.error('rerun-ci error:', err));
          return jsonResponse({ data: { pipeline_id: pid, status: 'running', stage: 'build_check' } });
        }

        case 'redeploy': {
          const dpid = body.pipeline_id as string;
          if (!dpid) return errorResponse('VALIDATION_ERROR', 'pipeline_id is required', 400);
          const { data: dRun } = await supabase.from('pipeline_runs').select('request_id, status').eq('id', dpid).single();
          if (!dRun) return errorResponse('NOT_FOUND', 'Pipeline not found', 404);
          if (dRun.status === 'running') return errorResponse('CONFLICT', 'Pipeline is still running', 409);
          await supabase.from('pipeline_runs').update({ status: 'running', current_stage: 'deploying', deploy_results: null, completed_at: null, last_heartbeat: new Date().toISOString() }).eq('id', dpid);
          runDeploy(dpid, dRun.request_id).catch(err => console.error('redeploy error:', err));
          return jsonResponse({ data: { pipeline_id: dpid, status: 'running', stage: 'deploying' } });
        }

        case 'rerun-readiness': {
          const rpid = body.pipeline_id as string;
          if (!rpid) return errorResponse('VALIDATION_ERROR', 'pipeline_id is required', 400);
          const { data: rRun } = await supabase.from('pipeline_runs').select('request_id, status').eq('id', rpid).single();
          if (!rRun) return errorResponse('NOT_FOUND', 'Pipeline not found', 404);
          if (rRun.status === 'running') return errorResponse('CONFLICT', 'Pipeline is still running', 409);
          await supabase.from('pipeline_runs').update({ status: 'running', current_stage: 'readying', readiness_results: null, completed_at: null, last_heartbeat: new Date().toISOString() }).eq('id', rpid);
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

        case 'cancel-queue': {
          const qid = body.queue_entry_id as string;
          if (!qid) return errorResponse('VALIDATION_ERROR', 'queue_entry_id required', 400);
          const cResult = await cancelQueueEntry(supabase, qid);
          return jsonResponse({ data: { queue_entry_id: qid, ...cResult } });
        }

        case 'acknowledge-conflicts': {
          const acPid = body.pipeline_id as string;
          if (!acPid) return errorResponse('VALIDATION_ERROR', 'pipeline_id required', 400);
          const { data: acPr } = await supabase.from('pipeline_runs').select('conflict_report').eq('id', acPid).single();
          if (acPr?.conflict_report) {
            const updated = { ...acPr.conflict_report, status: 'acknowledged', acknowledged_by: ctx.admin.id };
            await supabase.from('pipeline_runs').update({ conflict_report: updated }).eq('id', acPid);
          }
          return jsonResponse({ data: { pipeline_id: acPid, conflict_status: 'acknowledged' } });
        }

        case 'start-from-queue': {
          const sfqFid = body.feature_id as string;
          const sfqRid = body.request_id as string;
          const sfqQid = body.queue_entry_id as string;
          if (!sfqFid || !sfqRid) return errorResponse('VALIDATION_ERROR', 'feature_id and request_id required', 400);
          const { count: tc } = await supabase.from('implementation_task_items')
            .select('id', { count: 'exact', head: true }).eq('request_id', sfqRid).in('decision', ['accepted', 'modified']).eq('implementation_status', 'pending');
          return createAndStartPipeline(ctx, sfqFid, sfqRid, tc ?? 0, sfqQid);
        }

        case 'acknowledge-escalation': {
          const aeId = body.escalation_id as string;
          if (!aeId) return errorResponse('VALIDATION_ERROR', 'escalation_id required', 400);
          const aeResult = await handleAcknowledgeEscalation(supabase, aeId, ctx.user.id ?? 'system');
          if (aeResult.error) return errorResponse(aeResult.error.code, aeResult.error.message, 400);
          return jsonResponse({ data: aeResult.data });
        }

        case 'resolve-escalation': {
          const reId = body.escalation_id as string;
          const reNotes = body.resolution_notes as string;
          if (!reId) return errorResponse('VALIDATION_ERROR', 'escalation_id required', 400);
          if (!reNotes) return errorResponse('VALIDATION_ERROR', 'resolution_notes required', 400);
          const reResult = await handleResolveEscalation(supabase, reId, reNotes);
          if (reResult.error) return errorResponse(reResult.error.code, reResult.error.message, 400);
          return jsonResponse({ data: reResult.data });
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
