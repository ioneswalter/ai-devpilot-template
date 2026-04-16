/** Deploy Progress Query (FR-142) — returns structured deployment step data */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

interface DeployProgressResult {
  pipeline_id: string;
  feature_id: string;
  feature_code: string;
  current_stage: string;
  deploy_results: Record<string, unknown> | null;
  escalations: Record<string, unknown>[];
  deploy_lock: { acquired: boolean; acquired_at: string | null; expires_at: string | null } | null;
  queue_position: number | null;
  last_heartbeat: string | null;
}

export async function getDeployProgress(
  supabase: ReturnType<typeof createClient>,
  pipelineId: string,
): Promise<DeployProgressResult | null> {
  // Get pipeline run with feature info
  const { data: run } = await supabase
    .from('pipeline_runs')
    .select('id, feature_id, current_stage, deploy_results, last_heartbeat, queue_entry_id')
    .eq('id', pipelineId)
    .single();

  if (!run) return null;

  // Get feature code
  const { data: feature } = await supabase
    .from('product_features')
    .select('feature_code')
    .eq('id', run.feature_id)
    .single();

  // Get escalations for this pipeline
  const { data: escalations } = await supabase
    .from('deploy_escalations')
    .select('*')
    .eq('pipeline_id', pipelineId)
    .order('created_at', { ascending: false });

  // Get deploy lock status
  const { data: lock } = await supabase
    .from('deploy_locks')
    .select('acquired_at, expires_at')
    .eq('pipeline_id', pipelineId)
    .maybeSingle();

  // Get queue position if queued
  let queuePosition: number | null = null;
  if (run.queue_entry_id) {
    const { data: qEntry } = await supabase
      .from('pipeline_queue')
      .select('position, status')
      .eq('id', run.queue_entry_id)
      .maybeSingle();
    if (qEntry && qEntry.status === 'queued') {
      queuePosition = qEntry.position;
    }
  }

  return {
    pipeline_id: run.id,
    feature_id: run.feature_id,
    feature_code: feature?.feature_code ?? '',
    current_stage: run.current_stage,
    deploy_results: run.deploy_results as Record<string, unknown> | null,
    escalations: (escalations ?? []) as Record<string, unknown>[],
    deploy_lock: lock ? { acquired: true, acquired_at: lock.acquired_at, expires_at: lock.expires_at } : null,
    queue_position: queuePosition,
    last_heartbeat: run.last_heartbeat,
  };
}
