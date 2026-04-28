/**
 * Shared utilities for implement-feature handlers
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
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

/** Count remaining implementable tasks for a request */
export async function countRemainingTasks(
  supabase: SupabaseClient,
  requestId: string
): Promise<number> {
  const { count } = await supabase
    .from('implementation_task_items')
    .select('id', { count: 'exact', head: true })
    .eq('request_id', requestId)
    .in('decision', ['accepted', 'modified'])
    .eq('implementation_status', 'pending');
  return count ?? 0;
}

/** Mark a request as done, checking if all tasks completed successfully */
export async function finalizeRequest(supabase: SupabaseClient, requestId: string): Promise<void> {
  const { data: allItems } = await supabase
    .from('implementation_task_items')
    .select('implementation_status, decision')
    .eq('request_id', requestId)
    .in('decision', ['accepted', 'modified']);

  const allDone = allItems?.every((t) => t.implementation_status === 'completed');
  await supabase
    .from('implementation_requests')
    .update({
      status: allDone ? 'implemented' : 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('id', requestId);
}
