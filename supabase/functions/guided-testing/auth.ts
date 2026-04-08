/** Shared auth for guided-testing Edge Function (FR-108) */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders } from '../_shared/cors.ts';

export interface AuthContext {
  supabase: SupabaseClient;
  userId: string;
  isServiceRole: boolean;
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function error(code: string, message: string, status: number) {
  return json({ error: { code, message } }, status);
}

export function getSupabase(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

/** Verify auth — accepts user JWT or service-role key. Returns AuthContext or error Response. */
export async function resolveAuth(req: Request): Promise<AuthContext | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return error('UNAUTHORIZED', 'Missing authorization', 401);
  }

  const token = authHeader.substring(7);
  const supabase = getSupabase();

  // Validate token via Supabase Auth — works for both user JWTs and service-role JWTs
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) {
    // If getUser fails, check if this is a service-role JWT by decoding the role claim
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.role === 'service_role') {
        return { supabase, userId: 'service-role', isServiceRole: true };
      }
    } catch { /* not a valid JWT */ }
    return error('UNAUTHORIZED', 'Invalid token', 401);
  }

  return { supabase, userId: user.id, isServiceRole: false };
}

/** Type guard: is the result an AuthContext (not a Response)? */
export function isAuth(result: AuthContext | Response): result is AuthContext {
  return 'supabase' in result;
}
