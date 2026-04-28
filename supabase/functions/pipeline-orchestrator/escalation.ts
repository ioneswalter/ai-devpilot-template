/** Escalation Handlers (FR-142) — acknowledge and resolve deploy escalations */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { appendLog } from './shared.ts';

interface EscalationResult {
  escalation_id: string;
  status: string;
  pipeline_stage: string;
}

export async function handleAcknowledgeEscalation(
  supabase: ReturnType<typeof createClient>,
  escalationId: string,
  userId: string
): Promise<{ data?: EscalationResult; error?: { code: string; message: string } }> {
  const { data: esc } = await supabase
    .from('deploy_escalations')
    .select('id, status, pipeline_id')
    .eq('id', escalationId)
    .single();

  if (!esc) {
    return { error: { code: 'NOT_FOUND', message: 'Escalation not found' } };
  }

  if (esc.status !== 'open') {
    return { error: { code: 'ALREADY_ACKNOWLEDGED', message: 'Escalation already acknowledged' } };
  }

  await supabase
    .from('deploy_escalations')
    .update({
      status: 'acknowledged',
      acknowledged_by: userId,
      acknowledged_at: new Date().toISOString(),
    })
    .eq('id', escalationId);

  // Set pipeline to escalated stage
  await supabase
    .from('pipeline_runs')
    .update({
      current_stage: 'escalated',
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', esc.pipeline_id);

  await appendLog(
    supabase,
    esc.pipeline_id,
    'warn',
    `Escalation acknowledged by SE — pipeline paused`
  );

  return {
    data: { escalation_id: escalationId, status: 'acknowledged', pipeline_stage: 'escalated' },
  };
}

export async function handleResolveEscalation(
  supabase: ReturnType<typeof createClient>,
  escalationId: string,
  resolutionNotes: string
): Promise<{ data?: EscalationResult; error?: { code: string; message: string } }> {
  const { data: esc } = await supabase
    .from('deploy_escalations')
    .select('id, status, pipeline_id')
    .eq('id', escalationId)
    .single();

  if (!esc) {
    return { error: { code: 'NOT_FOUND', message: 'Escalation not found' } };
  }

  if (esc.status !== 'acknowledged') {
    return {
      error: {
        code: 'NOT_ACKNOWLEDGED',
        message: 'Escalation must be acknowledged before resolving',
      },
    };
  }

  await supabase
    .from('deploy_escalations')
    .update({
      status: 'resolved',
      resolved_at: new Date().toISOString(),
      resolution_notes: resolutionNotes,
    })
    .eq('id', escalationId);

  // Resume pipeline — set back to deploying and trigger next step
  await supabase
    .from('pipeline_runs')
    .update({
      current_stage: 'deploying',
      last_heartbeat: new Date().toISOString(),
    })
    .eq('id', esc.pipeline_id);

  await appendLog(
    supabase,
    esc.pipeline_id,
    'info',
    `Escalation resolved — pipeline resuming. Notes: ${resolutionNotes}`
  );

  // Trigger pipeline resume via self-chain
  try {
    const { data: run } = await supabase
      .from('pipeline_runs')
      .select('request_id')
      .eq('id', esc.pipeline_id)
      .single();

    if (run) {
      const fnUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/pipeline-orchestrator`;
      const svcKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      fetch(fnUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${svcKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'redeploy', pipeline_id: esc.pipeline_id }),
      }).catch((err) => console.error('Resume trigger error:', err));
    }
  } catch (err) {
    console.error('Failed to trigger pipeline resume:', err);
  }

  return {
    data: { escalation_id: escalationId, status: 'resolved', pipeline_stage: 'deploying' },
  };
}
