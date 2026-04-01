/** Session management handlers for guided testing (FR-108) */

import { corsHeaders } from '../_shared/cors.ts';
import { resolveAuth, isAuth } from './auth.ts';

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

/** Route to create-session or complete-session */
export async function handleSession(req: Request, action: string): Promise<Response> {
  if (action === 'create-session') return createSession(req);
  if (action === 'complete-session') return completeSession(req);
  return error('INVALID_ACTION', `Unknown session action: ${action}`, 400);
}

async function createSession(req: Request): Promise<Response> {
  const auth = await resolveAuth(req);
  if (!isAuth(auth)) return auth;

  const body = await req.json();
  const { feature_id, test_case_id } = body;
  if (!feature_id || !test_case_id) {
    return error('VALIDATION_ERROR', 'feature_id and test_case_id required', 400);
  }

  const { data, error: dbErr } = await auth.supabase
    .from('guided_test_sessions')
    .insert({
      feature_id,
      test_case_id,
      admin_id: auth.userId,
      status: 'active',
      ai_model: 'claude-sonnet-4-6',
    })
    .select('id, status, started_at')
    .single();

  if (dbErr) {
    return error('DB_ERROR', dbErr.message, 500);
  }

  return json({ data }, 201);
}

async function completeSession(req: Request): Promise<Response> {
  const auth = await resolveAuth(req);
  if (!isAuth(auth)) return auth;

  const body = await req.json();
  const { session_id, status, completed_steps, duration_ms } = body;
  if (!session_id || !status) {
    return error('VALIDATION_ERROR', 'session_id and status required', 400);
  }
  if (status !== 'completed' && status !== 'abandoned') {
    return error('VALIDATION_ERROR', 'status must be completed or abandoned', 400);
  }

  const { data, error: dbErr } = await auth.supabase
    .from('guided_test_sessions')
    .update({
      status,
      completed_steps: completed_steps ?? 0,
      duration_ms: duration_ms ?? null,
      completed_at: new Date().toISOString(),
    })
    .eq('id', session_id)
    .select('id, status, completed_at, duration_ms')
    .single();

  if (dbErr) {
    return error('DB_ERROR', dbErr.message, 500);
  }

  return json({ data });
}
