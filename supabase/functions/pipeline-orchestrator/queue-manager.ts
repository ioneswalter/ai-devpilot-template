/**
 * Pipeline Queue Manager (FR-119)
 * Manages concurrent pipeline execution with FIFO queue.
 * All state is database-backed for stateless Edge Function compatibility.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendLog, getEdgeFunctionUrl } from './shared.ts';

const DEFAULT_MAX_CONCURRENT = 3;

function getMaxConcurrent(): number {
  const env = Deno.env.get('PIPELINE_MAX_CONCURRENT');
  return env ? parseInt(env, 10) || DEFAULT_MAX_CONCURRENT : DEFAULT_MAX_CONCURRENT;
}

interface EnqueueResult {
  queued: boolean;
  started: boolean;
  queue_entry_id: string;
  pipeline_id?: string;
  position: number;
}

/** Enqueue a pipeline start request. If under limit, starts immediately. */
export async function enqueuePipeline(
  supabase: SupabaseClient,
  featureId: string,
  requestId: string,
  createdBy?: string,
): Promise<EnqueueResult> {
  const maxConcurrent = getMaxConcurrent();

  // Count currently running pipelines
  const { count: runningCount } = await supabase
    .from('pipeline_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'running');

  const running = runningCount ?? 0;

  if (running < maxConcurrent) {
    // Slot available — create queue entry as 'running'
    const { data: entry } = await supabase
      .from('pipeline_queue')
      .insert({
        feature_id: featureId,
        request_id: requestId,
        status: 'running',
        position: 0,
        max_concurrent: maxConcurrent,
        started_at: new Date().toISOString(),
        created_by: createdBy ?? null,
      })
      .select('id')
      .single();

    return { queued: false, started: true, queue_entry_id: entry?.id ?? '', position: 0 };
  }

  // At capacity — queue it
  const { count: queuedCount } = await supabase
    .from('pipeline_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'queued');

  const position = (queuedCount ?? 0) + 1;

  const { data: entry } = await supabase
    .from('pipeline_queue')
    .insert({
      feature_id: featureId,
      request_id: requestId,
      status: 'queued',
      position,
      max_concurrent: maxConcurrent,
      created_by: createdBy ?? null,
    })
    .select('id')
    .single();

  return { queued: true, started: false, queue_entry_id: entry?.id ?? '', position };
}

/** Link a pipeline_run to its queue entry */
export async function linkPipelineToQueue(
  supabase: SupabaseClient,
  queueEntryId: string,
  pipelineId: string,
): Promise<void> {
  await supabase.from('pipeline_queue').update({ pipeline_id: pipelineId }).eq('id', queueEntryId);
  await supabase.from('pipeline_runs').update({ queue_entry_id: queueEntryId }).eq('id', pipelineId);
}

/** Mark a queue entry as completed and promote the next one */
export async function completeQueueEntry(
  supabase: SupabaseClient,
  pipelineId: string,
  finalStatus: 'completed' | 'failed' = 'completed',
): Promise<void> {
  await supabase
    .from('pipeline_queue')
    .update({ status: finalStatus, completed_at: new Date().toISOString() })
    .eq('pipeline_id', pipelineId);

  await promoteNextInQueue(supabase);
}

/** Promote the next queued pipeline to running */
export async function promoteNextInQueue(supabase: SupabaseClient): Promise<void> {
  const maxConcurrent = getMaxConcurrent();

  const { count: runningCount } = await supabase
    .from('pipeline_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'running');

  if ((runningCount ?? 0) >= maxConcurrent) return;

  // Get the next queued entry (lowest position)
  const { data: next } = await supabase
    .from('pipeline_queue')
    .select('id, feature_id, request_id')
    .eq('status', 'queued')
    .order('position', { ascending: true })
    .limit(1);

  if (!next || next.length === 0) return;

  const entry = next[0];

  // Promote to running
  await supabase.from('pipeline_queue').update({
    status: 'running',
    position: 0,
    started_at: new Date().toISOString(),
  }).eq('id', entry.id);

  // Reorder remaining queued entries
  await reorderQueue(supabase);

  // Fire the actual pipeline start
  triggerPipelineStart(entry.feature_id, entry.request_id, entry.id);

  // Send notification
  await sendQueueNotification(supabase, entry.feature_id, 'queue_promoted',
    'Your pipeline has started', 'Your queued pipeline is now running.');
}

/** Cancel a queue entry */
export async function cancelQueueEntry(
  supabase: SupabaseClient,
  queueEntryId: string,
): Promise<{ cancelled: boolean; positions_updated: number }> {
  const { data: entry } = await supabase
    .from('pipeline_queue')
    .select('id, status, pipeline_id')
    .eq('id', queueEntryId)
    .single();

  if (!entry) return { cancelled: false, positions_updated: 0 };

  if (entry.status === 'running' && entry.pipeline_id) {
    // Cancel the running pipeline too
    await supabase.from('pipeline_runs').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(),
    }).eq('id', entry.pipeline_id);
  }

  await supabase.from('pipeline_queue').update({
    status: 'cancelled', completed_at: new Date().toISOString(),
  }).eq('id', queueEntryId);

  const updated = await reorderQueue(supabase);

  // Promote next if we freed a running slot
  if (entry.status === 'running') await promoteNextInQueue(supabase);

  return { cancelled: true, positions_updated: updated };
}

/** Get full queue status for dashboard */
export async function getQueueStatus(supabase: SupabaseClient): Promise<{
  running: unknown[];
  queued: unknown[];
  recent_completed: unknown[];
  max_concurrent: number;
}> {
  const [runRes, queueRes, completedRes] = await Promise.all([
    supabase.from('pipeline_queue').select('*').eq('status', 'running').order('started_at', { ascending: true }),
    supabase.from('pipeline_queue').select('*').eq('status', 'queued').order('position', { ascending: true }),
    supabase.from('pipeline_queue').select('*').in('status', ['completed', 'failed']).order('completed_at', { ascending: false }).limit(10),
  ]);

  // Enrich with feature titles and pipeline progress
  const enriched = async (entries: unknown[]) => {
    const results = [];
    for (const e of entries as Array<Record<string, unknown>>) {
      const { data: feat } = await supabase.from('product_features').select('title').eq('id', e.feature_id).single();
      let progress = null;
      let stage = null;
      if (e.pipeline_id) {
        const { data: pr } = await supabase.from('pipeline_runs')
          .select('current_stage, completed_tasks, total_tasks').eq('id', e.pipeline_id).single();
        if (pr) { stage = pr.current_stage; progress = { completed: pr.completed_tasks, total: pr.total_tasks }; }
      }
      results.push({ ...e, feature_title: feat?.title ?? 'Unknown', stage, progress });
    }
    return results;
  };

  return {
    running: await enriched(runRes.data ?? []),
    queued: await enriched(queueRes.data ?? []),
    recent_completed: await enriched(completedRes.data ?? []),
    max_concurrent: getMaxConcurrent(),
  };
}

async function reorderQueue(supabase: SupabaseClient): Promise<number> {
  const { data: queued } = await supabase
    .from('pipeline_queue')
    .select('id')
    .eq('status', 'queued')
    .order('queued_at', { ascending: true });

  if (!queued) return 0;
  for (let i = 0; i < queued.length; i++) {
    await supabase.from('pipeline_queue').update({ position: i + 1 }).eq('id', queued[i].id);
  }
  return queued.length;
}

function triggerPipelineStart(featureId: string, requestId: string, queueEntryId: string): void {
  const url = getEdgeFunctionUrl();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ action: 'start-from-queue', feature_id: featureId, request_id: requestId, queue_entry_id: queueEntryId }),
  }).catch(err => console.error('Failed to trigger queued pipeline:', err));
}

async function sendQueueNotification(
  supabase: SupabaseClient, featureId: string, type: string, title: string, message: string,
): Promise<void> {
  await supabase.from('pipeline_notifications').insert({ feature_id: featureId, pipeline_id: featureId, type, title, message }).catch(() => {});
}
