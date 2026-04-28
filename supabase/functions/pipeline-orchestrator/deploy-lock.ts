/**
 * Deploy Lock: Database-backed mutex for migration serialization (FR-119)
 * Prevents concurrent database migrations across parallel feature pipelines.
 * Uses a deploy_locks table with heartbeat-based expiry (10 min timeout).
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendLog } from './shared.ts';

const LOCK_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const RETRY_DELAY_MS = 15_000; // 15 seconds between retries
const MAX_DEPLOY_WAIT_RETRIES = 40; // ~10 minutes of waiting

interface AcquireResult {
  acquired: boolean;
  held_by?: string;
  retries_remaining?: number;
}

/** Attempt to acquire the deploy lock for a pipeline */
export async function acquireDeployLock(
  supabase: SupabaseClient,
  pipelineId: string,
  featureId: string
): Promise<AcquireResult> {
  // First, clean up any expired locks
  await cleanExpiredLocks(supabase);

  // Check if a lock already exists
  const { data: existing } = await supabase
    .from('deploy_locks')
    .select('id, pipeline_id, last_heartbeat, feature_id')
    .limit(1);

  if (existing && existing.length > 0) {
    const lock = existing[0];
    const age = Date.now() - new Date(lock.last_heartbeat).getTime();

    // If stale (>10 min), force-release and take over
    if (age > LOCK_TIMEOUT_MS) {
      await supabase.from('deploy_locks').delete().eq('id', lock.id);
      await appendLog(
        supabase,
        pipelineId,
        'warn',
        `Stale deploy lock released (held by pipeline ${lock.pipeline_id}, age ${Math.round(age / 60000)}min)`
      );
    } else {
      return { acquired: false, held_by: lock.pipeline_id };
    }
  }

  // Try to insert our lock
  const expiresAt = new Date(Date.now() + LOCK_TIMEOUT_MS).toISOString();
  const { error } = await supabase
    .from('deploy_locks')
    .insert({ pipeline_id: pipelineId, feature_id: featureId, expires_at: expiresAt });

  if (error) {
    // Another pipeline grabbed it between our check and insert
    return { acquired: false };
  }

  return { acquired: true };
}

/** Release the deploy lock held by a pipeline */
export async function releaseDeployLock(
  supabase: SupabaseClient,
  pipelineId: string
): Promise<void> {
  await supabase.from('deploy_locks').delete().eq('pipeline_id', pipelineId);
}

/** Update the heartbeat on the deploy lock */
export async function updateDeployLockHeartbeat(
  supabase: SupabaseClient,
  pipelineId: string
): Promise<void> {
  await supabase
    .from('deploy_locks')
    .update({ last_heartbeat: new Date().toISOString() })
    .eq('pipeline_id', pipelineId);
}

/** Check if any deploy lock is currently held */
export async function getDeployLockStatus(
  supabase: SupabaseClient
): Promise<{ held: boolean; pipeline_id?: string; feature_id?: string; acquired_at?: string }> {
  await cleanExpiredLocks(supabase);
  const { data } = await supabase.from('deploy_locks').select('*').limit(1);
  if (!data || data.length === 0) return { held: false };
  return {
    held: true,
    pipeline_id: data[0].pipeline_id,
    feature_id: data[0].feature_id,
    acquired_at: data[0].acquired_at,
  };
}

/** Wait for deploy lock with retries, updating pipeline status */
export async function waitForDeployLock(
  supabase: SupabaseClient,
  pipelineId: string,
  featureId: string
): Promise<boolean> {
  for (let i = 0; i < MAX_DEPLOY_WAIT_RETRIES; i++) {
    const result = await acquireDeployLock(supabase, pipelineId, featureId);
    if (result.acquired) return true;

    // Update pipeline to show waiting state
    await supabase
      .from('pipeline_runs')
      .update({
        waiting_for_deploy: true,
        current_stage: 'waiting_for_deploy',
        last_heartbeat: new Date().toISOString(),
      })
      .eq('id', pipelineId);

    if (i === 0) {
      await appendLog(
        supabase,
        pipelineId,
        'info',
        `Waiting for deployment slot (held by pipeline ${result.held_by ?? 'unknown'})`
      );
    }

    // Check if pipeline was cancelled while waiting
    const { data: pCheck } = await supabase
      .from('pipeline_runs')
      .select('status')
      .eq('id', pipelineId)
      .single();
    if (pCheck?.status !== 'running') return false;

    await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
  }

  await appendLog(supabase, pipelineId, 'error', 'Timed out waiting for deployment slot');
  return false;
}

/** Detect file path conflicts with other concurrent pipelines */
export async function detectFileConflicts(
  supabase: SupabaseClient,
  pipelineId: string,
  requestId: string
): Promise<
  Array<{
    file_path: string;
    other_pipelines: Array<{ pipeline_id: string; feature_title: string; task_title: string }>;
  }>
> {
  // Get this pipeline's file paths
  const { data: myTasks } = await supabase
    .from('implementation_task_items')
    .select('file_path')
    .eq('request_id', requestId)
    .eq('implementation_status', 'completed')
    .not('generated_code', 'is', null);

  if (!myTasks || myTasks.length === 0) return [];
  const myPaths = myTasks.map((t) => t.file_path);

  // Find other running/completed pipelines (not this one)
  const { data: otherPipelines } = await supabase
    .from('pipeline_runs')
    .select('id, feature_id, request_id')
    .neq('id', pipelineId)
    .in('status', ['running', 'completed'])
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  if (!otherPipelines || otherPipelines.length === 0) return [];

  const conflicts: Array<{
    file_path: string;
    other_pipelines: Array<{ pipeline_id: string; feature_title: string; task_title: string }>;
  }> = [];

  for (const other of otherPipelines) {
    const { data: otherTasks } = await supabase
      .from('implementation_task_items')
      .select('file_path, title')
      .eq('request_id', other.request_id)
      .eq('implementation_status', 'completed')
      .not('generated_code', 'is', null)
      .in('file_path', myPaths);

    if (!otherTasks || otherTasks.length === 0) continue;

    const { data: feat } = await supabase
      .from('product_features')
      .select('title')
      .eq('id', other.feature_id)
      .single();

    for (const ot of otherTasks) {
      const existing = conflicts.find((c) => c.file_path === ot.file_path);
      const entry = {
        pipeline_id: other.id,
        feature_title: feat?.title ?? 'Unknown',
        task_title: ot.title,
      };
      if (existing) {
        existing.other_pipelines.push(entry);
      } else {
        conflicts.push({ file_path: ot.file_path, other_pipelines: [entry] });
      }
    }
  }

  return conflicts;
}

async function cleanExpiredLocks(supabase: SupabaseClient): Promise<void> {
  await supabase.from('deploy_locks').delete().lt('expires_at', new Date().toISOString());
}
