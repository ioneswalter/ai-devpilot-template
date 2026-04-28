/**
 * Health check: detect and recover stale pipelines (FR-113)
 * - Pipelines with no heartbeat for >5 min: restart chain
 * - Pipelines with no heartbeat for >1 hour: mark as timed_out
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { jsonResponse, appendLog, getEdgeFunctionUrl } from './shared.ts';
import { promoteNextInQueue } from './queue-manager.ts';

export async function handleHealthCheck(): Promise<Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const { data: stalePipelines } = await supabase
    .from('pipeline_runs')
    .select('id, request_id, last_heartbeat')
    .eq('status', 'running');

  if (!stalePipelines || stalePipelines.length === 0) {
    return jsonResponse({ data: { checked: 0, restarted: 0, timed_out: 0 } });
  }

  const now = Date.now();
  const fiveMin = 5 * 60 * 1000;
  const oneHour = 60 * 60 * 1000;
  let restarted = 0;
  let timedOut = 0;

  for (const pipeline of stalePipelines) {
    const heartbeat = new Date(pipeline.last_heartbeat).getTime();
    const age = now - heartbeat;

    if (age > oneHour) {
      // Timed out — mark as dead
      await supabase
        .from('pipeline_runs')
        .update({
          status: 'timed_out',
          current_stage: 'idle',
          current_task_id: null,
          error_message: `Pipeline timed out — no heartbeat for ${Math.round(age / 60000)} minutes`,
          completed_at: new Date().toISOString(),
        })
        .eq('id', pipeline.id);

      await appendLog(
        supabase,
        pipeline.id,
        'error',
        'Pipeline timed out after 1 hour of inactivity'
      );
      timedOut++;
    } else if (age > fiveMin) {
      // Stale — restart the chain
      await appendLog(
        supabase,
        pipeline.id,
        'warn',
        `Restarting stale pipeline (${Math.round(age / 60000)}min since last heartbeat)`
      );

      // Reset any stuck generating tasks
      await supabase
        .from('implementation_task_items')
        .update({ implementation_status: 'failed', ai_log: 'Reset by health check' })
        .eq('request_id', pipeline.request_id)
        .eq('implementation_status', 'generating');

      // Re-trigger the chain
      const url = getEdgeFunctionUrl();
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          action: 'next',
          pipeline_id: pipeline.id,
          request_id: pipeline.request_id,
        }),
      }).catch((err) => console.error('Health check restart error:', err));

      restarted++;
    }
  }

  // FR-119: Fallback queue promotion — check for stuck queued entries
  let promoted = 0;
  try {
    await promoteNextInQueue(supabase);
    const { count } = await supabase
      .from('pipeline_queue')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued');
    promoted = count ?? 0;
  } catch (err) {
    console.error('Queue promotion error:', err);
  }

  return jsonResponse({
    data: {
      checked: stalePipelines.length,
      restarted,
      timed_out: timedOut,
      queued_remaining: promoted,
    },
  });
}
