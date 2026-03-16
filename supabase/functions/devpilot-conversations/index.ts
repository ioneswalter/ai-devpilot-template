/**
 * DevPilot Conversations CRUD Edge Function
 * GET: List conversations (role-filtered) or get single conversation with messages
 * POST: Create new conversation
 * PATCH: Update conversation (title, archive)
 *
 * FR-090 Feature Ideation Chat
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

// Schemas
const createSchema = z.object({ title: z.string().max(200).optional() });
const updateSchema = z.object({
  conversation_id: z.string().min(1, 'Conversation ID required'),
  title: z.string().max(200).optional(),
  status: z.enum(['archived']).optional(),
});

async function verifyAuth(req: Request, supabase: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;

  const { data: adminRow } = await supabase
    .from('admin_users')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  return { userId: user.id, isAdmin: !!adminRow };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const auth = await verifyAuth(req, supabase);
    if (!auth) return errorResponse('UNAUTHORIZED', 'Authentication required', 401);

    const { userId, isAdmin } = auth;

    // ── GET: List or single conversation ──
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const conversationId = url.searchParams.get('id');

      if (conversationId) {
        // Single conversation with messages
        const { data: conv, error: convErr } = await supabase
          .from('ideation_conversations')
          .select('*')
          .eq('id', conversationId)
          .single();

        if (convErr || !conv) return errorResponse('NOT_FOUND', 'Conversation not found', 404);
        if (conv.created_by !== userId && !isAdmin) {
          return errorResponse('FORBIDDEN', 'You do not have access to this conversation', 403);
        }

        const { data: messages } = await supabase
          .from('conversation_messages')
          .select('id, role, content, metadata, created_at')
          .eq('conversation_id', conversationId)
          .order('created_at', { ascending: true });

        return jsonResponse({ data: { ...conv, messages: messages ?? [] } });
      }

      // List conversations
      const statusFilter = url.searchParams.get('status');
      let query = supabase.from('ideation_conversations').select('*');

      if (!isAdmin) {
        query = query.eq('created_by', userId);
      }
      if (statusFilter && statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data: conversations } = await query.order('updated_at', { ascending: false });

      // Enrich with message counts and feature info
      const enriched = await Promise.all(
        (conversations ?? []).map(async (conv) => {
          const { count } = await supabase
            .from('conversation_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conv.id);

          let submitted_feature_code: string | null = null;
          let submitted_feature_title: string | null = null;

          if (conv.submitted_feature_id) {
            const { data: feat } = await supabase
              .from('product_features')
              .select('feature_code, title')
              .eq('id', conv.submitted_feature_id)
              .single();
            if (feat) {
              submitted_feature_code = feat.feature_code;
              submitted_feature_title = feat.title;
            }
          }

          return {
            ...conv,
            message_count: count ?? 0,
            submitted_feature_code,
            submitted_feature_title,
          };
        })
      );

      return jsonResponse({ data: enriched });
    }

    // ── POST: Create conversation ──
    if (req.method === 'POST') {
      const body = await req.json();
      const validation = createSchema.safeParse(body);
      if (!validation.success) {
        return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
      }

      const title = validation.data.title || 'New Ideation';
      const { data: conv, error: insertErr } = await supabase
        .from('ideation_conversations')
        .insert({ title, status: 'draft', created_by: userId, updated_at: new Date().toISOString() })
        .select()
        .single();

      if (insertErr) {
        console.error('Create conversation error:', insertErr);
        return errorResponse('INTERNAL_ERROR', 'Failed to create conversation', 500);
      }

      return jsonResponse({ data: conv }, 201);
    }

    // ── PATCH: Update conversation ──
    if (req.method === 'PATCH') {
      const body = await req.json();
      const validation = updateSchema.safeParse(body);
      if (!validation.success) {
        return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
      }

      const { conversation_id, title, status } = validation.data;

      // Fetch conversation
      const { data: conv, error: fetchErr } = await supabase
        .from('ideation_conversations')
        .select('*')
        .eq('id', conversation_id)
        .single();

      if (fetchErr || !conv) return errorResponse('NOT_FOUND', 'Conversation not found', 404);
      if (conv.created_by !== userId && !isAdmin) {
        return errorResponse('FORBIDDEN', 'You do not have access to this conversation', 403);
      }

      // Validate state transition
      if (status === 'archived' && conv.status !== 'draft') {
        return errorResponse('VALIDATION_ERROR', 'Only draft conversations can be archived', 400);
      }

      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title !== undefined) updates.title = title;
      if (status !== undefined) updates.status = status;

      const { data: updated, error: updateErr } = await supabase
        .from('ideation_conversations')
        .update(updates)
        .eq('id', conversation_id)
        .select('id, title, status, updated_at')
        .single();

      if (updateErr) {
        console.error('Update conversation error:', updateErr);
        return errorResponse('INTERNAL_ERROR', 'Failed to update conversation', 500);
      }

      return jsonResponse({ data: updated });
    }

    return errorResponse('METHOD_NOT_ALLOWED', 'Method not allowed', 405);
  } catch (error) {
    console.error('devpilot-conversations error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
