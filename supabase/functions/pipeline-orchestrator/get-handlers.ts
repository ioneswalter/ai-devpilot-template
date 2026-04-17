/** GET action handlers for pipeline-orchestrator (FR-113, FR-119, FR-142) */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { jsonResponse, errorResponse } from './shared.ts';
import { getQueueStatus } from './queue-manager.ts';
import { getDeployLockStatus } from './deploy-lock.ts';
import { getDeployProgress } from './deploy-progress.ts';

type SB = ReturnType<typeof createClient>;

/** Handle notifications listing */
export async function handleNotifications(supabase: SB, url: URL): Promise<Response> {
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

/** Handle queue status with deploy lock info */
export async function handleQueueStatus(supabase: SB): Promise<Response> {
  const queueData = await getQueueStatus(supabase);
  const lockStatus = await getDeployLockStatus(supabase);
  let lockDisplay = {
    held_by_pipeline: null as string | null,
    feature_title: null as string | null,
    acquired_at: null as string | null,
  };
  if (lockStatus.held) {
    const { data: f } = await supabase
      .from('product_features')
      .select('title')
      .eq('id', lockStatus.feature_id)
      .single();
    lockDisplay = {
      held_by_pipeline: lockStatus.pipeline_id ?? null,
      feature_title: f?.title ?? null,
      acquired_at: lockStatus.acquired_at ?? null,
    };
  }
  return jsonResponse({ data: { ...queueData, deploy_lock: lockDisplay } });
}

/** Handle deploy progress */
export async function handleDeployProgress(supabase: SB, url: URL): Promise<Response> {
  const pid = url.searchParams.get('pipeline_id');
  if (!pid) return errorResponse('VALIDATION_ERROR', 'pipeline_id required', 400);
  const progress = await getDeployProgress(supabase, pid);
  if (!progress) return errorResponse('NOT_FOUND', 'Pipeline run not found', 404);
  return jsonResponse({ data: progress });
}

/** Handle conflict report */
export async function handleConflictReport(supabase: SB, url: URL): Promise<Response> {
  const pid = url.searchParams.get('pipeline_id');
  if (!pid) return errorResponse('VALIDATION_ERROR', 'pipeline_id required', 400);
  const { data: pr } = await supabase
    .from('pipeline_runs')
    .select('conflict_report')
    .eq('id', pid)
    .single();
  return jsonResponse({ data: pr?.conflict_report ?? null });
}

/** Handle learning insights */
export async function handleLearningInsights(supabase: SB): Promise<Response> {
  const [pats, fails, recs, metrics] = await Promise.all([
    supabase.from('failure_patterns').select('*').eq('is_active', true).order('frequency', { ascending: false }).limit(10),
    supabase.from('pipeline_failures').select('id, error_type, error_code, error_message, file_path, outcome, created_at').order('created_at', { ascending: false }).limit(20),
    supabase.from('constitution_recommendations').select('*').order('created_at', { ascending: false }).limit(10),
    supabase.from('pipeline_failures').select('id', { count: 'exact', head: true }),
  ]);
  const patCount = (await supabase.from('failure_patterns').select('id', { count: 'exact', head: true })).count ?? 0;
  const activeCount = (await supabase.from('failure_patterns').select('id', { count: 'exact', head: true }).eq('is_active', true)).count ?? 0;
  return jsonResponse({
    data: {
      top_patterns: pats.data ?? [],
      recent_failures: fails.data ?? [],
      recommendations: recs.data ?? [],
      metrics: { total_failures: metrics.count ?? 0, patterns_detected: patCount, adaptations_active: activeCount },
    },
  });
}
