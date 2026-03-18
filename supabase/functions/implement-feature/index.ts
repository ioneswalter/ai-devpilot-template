/**
 * implement-feature Edge Function (FR-105)
 * Thin router — delegates to focused handler modules.
 *
 * Routes:
 *   GET   ?feature_id=xxx          — Get request + task items
 *   POST                           — Create request, trigger AI plan
 *   POST  ?action=add-task         — Add a manual task item
 *   POST  ?action=implement        — Execute ONE AI code generation task
 *   PATCH                          — Update task item decision/comment
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { corsHeaders, errorResponse, type AuthContext } from './shared.ts';
import { handleGetRequest } from './get-request.ts';
import { handleCreateRequest } from './create-request.ts';
import { handleAddTask } from './add-task.ts';
import { handleImplementTask } from './implement-task.ts';
import { handleUpdateTask } from './update-task.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const ctx = await authenticate(req);
    if (ctx instanceof Response) return ctx;

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (req.method === 'GET') return handleGetRequest(url, ctx);
    if (req.method === 'POST' && action === 'add-task') return handleAddTask(req, ctx);
    if (req.method === 'POST' && action === 'implement') return handleImplementTask(req, ctx);
    if (req.method === 'POST') return handleCreateRequest(req, ctx);
    if (req.method === 'PATCH') return handleUpdateTask(req, ctx);

    return errorResponse('METHOD_NOT_ALLOWED', `Method ${req.method} not allowed`, 405);
  } catch (error) {
    console.error('Unhandled error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});

async function authenticate(req: Request): Promise<AuthContext | Response> {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
  }

  const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.substring(7));
  if (authErr || !user) {
    return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);
  }

  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('id, email')
    .eq('user_id', user.id)
    .maybeSingle();

  if (!adminRow) {
    return errorResponse('FORBIDDEN', 'Admin access required', 403);
  }

  return { user, admin: adminRow, supabase };
}
