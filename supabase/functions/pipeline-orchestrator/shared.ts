/**
 * Shared utilities for pipeline-orchestrator (FR-113)
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

export interface AuthContext {
  user: { id: string; email?: string };
  admin: { id: string; email: string };
  supabase: SupabaseClient;
}

export interface PipelineLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
  task_id?: string;
}

/** Append a log entry to a pipeline run's logs array */
export async function appendLog(
  supabase: SupabaseClient,
  pipelineId: string,
  level: PipelineLogEntry['level'],
  message: string,
  taskId?: string,
): Promise<void> {
  const entry: PipelineLogEntry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...(taskId ? { task_id: taskId } : {}),
  };

  // Fetch current logs, append, update
  const { data } = await supabase
    .from('pipeline_runs')
    .select('logs')
    .eq('id', pipelineId)
    .single();

  const logs: PipelineLogEntry[] = Array.isArray(data?.logs) ? data.logs : [];
  // Keep last 200 entries to prevent unbounded growth
  if (logs.length >= 200) logs.splice(0, logs.length - 199);
  logs.push(entry);

  await supabase
    .from('pipeline_runs')
    .update({ logs, last_heartbeat: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', pipelineId);
}

/** Update pipeline heartbeat to signal it's still alive */
export async function updateHeartbeat(supabase: SupabaseClient, pipelineId: string): Promise<void> {
  await supabase
    .from('pipeline_runs')
    .update({ last_heartbeat: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', pipelineId);
}

/** Get the Edge Function base URL for self-calling */
export function getEdgeFunctionUrl(): string {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  return `${supabaseUrl}/functions/v1/pipeline-orchestrator`;
}

/** Fire-and-forget trigger for the next task in the chain */
export function triggerNextTask(pipelineId: string, requestId: string, retryCount = 0): void {
  const url = getEdgeFunctionUrl();
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${serviceKey}` },
    body: JSON.stringify({ action: 'next', pipeline_id: pipelineId, request_id: requestId, retry_count: retryCount }),
  }).catch(err => { console.error('Failed to trigger next task:', err); });
}

/** Load SpecKit artifacts for a feature from the DB */
export async function loadSpecArtifacts(
  supabase: SupabaseClient,
  featureId: string,
): Promise<Record<string, unknown>> {
  const { data: rows } = await supabase
    .from('feature_spec_artifacts')
    .select('artifact_type, content')
    .eq('feature_id', featureId);

  if (!rows || rows.length === 0) return {};

  const artifacts: Record<string, unknown> = {};
  const contracts: string[] = [];

  for (const row of rows) {
    switch (row.artifact_type) {
      case 'plan': artifacts.plan = row.content; break;
      case 'data_model': artifacts.data_model = row.content; break;
      case 'spec': artifacts.spec = row.content; break;
      case 'research': artifacts.research = row.content; break;
      case 'contract': contracts.push(row.content); break;
    }
  }
  if (contracts.length > 0) artifacts.contracts = contracts;
  return artifacts;
}
