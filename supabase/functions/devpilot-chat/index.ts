/**
 * DevPilot Chat Edge Function — Streaming
 * POST: Send a message and stream the AI response via SSE
 * GET: Returns available models
 *
 * FR-090 Feature Ideation Chat
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';
import { buildSystemPrompt } from '../_shared/devpilot-prompt.ts';
import type { FeatureContext } from '../_shared/devpilot-prompt.ts';
import { buildKnowledgeContext, formatFeatureContext } from '../_shared/knowledge-context.ts';
import { logAIUsage, calculateCost } from '../_shared/usage-logger.ts';
import { streamClaude } from '../_shared/claude-stream.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
};

const DEFAULT_MODEL = 'claude-sonnet-4-6';
const ALLOWED_MODELS: Record<string, string> = {
  'claude-opus-4-6': 'Opus',
  'claude-sonnet-4-6': 'Sonnet',
  'claude-haiku-4-5-20251001': 'Haiku',
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

const requestSchema = z.object({
  conversation_id: z.string().min(1, 'Conversation ID required'),
  message: z.string().min(1, 'Message is required').max(10000, 'Message too long'),
  model: z.string().optional(),
});

function parseMetadata(content: string): Record<string, unknown> | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;
  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    if (parsed.type === 'dedup_warning') return parsed;
    if (parsed.type === 'proposal') {
      if (parsed.proposals && Array.isArray(parsed.proposals)) return parsed;
      if (parsed.proposal) return { type: 'proposal', proposals: [parsed.proposal] };
      return parsed;
    }
  } catch { /* not metadata */ }
  return null;
}

/** Trim conversation history to stay within context limits */
function trimHistory(allMessages: { role: string; content: string }[]) {
  if (allMessages.length <= 10) return allMessages;
  const first = allMessages.slice(0, 2);
  const recent = allMessages.slice(-6);
  const note = {
    role: 'assistant' as const,
    content: `[Note: ${allMessages.length - 8} earlier messages omitted for context limits.]`,
  };
  return [...first, note, ...recent];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method === 'GET') {
    const models = Object.entries(ALLOWED_MODELS).map(([id, label]) => ({ id, label }));
    return jsonResponse({ data: { model: DEFAULT_MODEL, available_models: models } });
  }

  if (req.method !== 'POST') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Only POST and GET requests allowed', 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.substring(7));
    if (authErr || !user) return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);

    const { data: adminRow } = await supabase
      .from('admin_users').select('id').eq('user_id', user.id).maybeSingle();
    const isAdmin = !!adminRow;

    // Validate request
    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
    }
    const { conversation_id, message } = validation.data;
    const selectedModel = (validation.data.model && validation.data.model in ALLOWED_MODELS)
      ? validation.data.model : DEFAULT_MODEL;

    // Verify conversation access
    const { data: conv, error: convErr } = await supabase
      .from('ideation_conversations')
      .select('id, status, created_by').eq('id', conversation_id).single();

    if (convErr || !conv) return errorResponse('NOT_FOUND', 'Conversation not found', 404);
    if (conv.created_by !== user.id && !isAdmin) {
      return errorResponse('FORBIDDEN', 'No access to this conversation', 403);
    }
    if (conv.status !== 'draft') {
      return errorResponse('VALIDATION_ERROR', 'Conversation is not in draft status', 400);
    }

    // Save user message
    const { data: userMsg, error: userMsgErr } = await supabase
      .from('conversation_messages')
      .insert({ conversation_id, role: 'user', content: message })
      .select('id, role, content, metadata, created_at').single();

    if (userMsgErr) {
      console.error('Save user message error:', userMsgErr);
      return errorResponse('INTERNAL_ERROR', 'Failed to save message', 500);
    }

    // Build context
    const knowledge = await buildKnowledgeContext(supabase);
    const features = knowledge.feature_details as unknown as FeatureContext[];
    const enrichedFeatureList = formatFeatureContext(knowledge.feature_details);
    const existingSections = [...new Set(
      knowledge.feature_details.map(f => f.spec_section).filter((s): s is string => !!s),
    )].sort();

    const { data: history } = await supabase
      .from('conversation_messages').select('role, content')
      .eq('conversation_id', conversation_id).order('created_at', { ascending: true });

    const systemPrompt = buildSystemPrompt(
      features, isAdmin, existingSections,
      { constitution_summary: knowledge.constitution_summary, enrichedFeatureList },
    );
    const messages = trimHistory(
      (history ?? []).map((m) => ({ role: m.role as string, content: m.content })),
    );

    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) return errorResponse('AI_ERROR', 'AI service not configured', 500);

    // Stream response — wraps Claude SSE stream, saves message on completion
    const claudeStream = streamClaude(anthropicApiKey, selectedModel, systemPrompt, messages);
    const fullText: string[] = [];
    let inputTokens = 0;
    let outputTokens = 0;

    const encoder = new TextEncoder();
    const outputStream = new ReadableStream({
      async start(controller) {
        // Send user_message event first so frontend can replace optimistic message
        const userEvent = `event: user_message\ndata: ${JSON.stringify(userMsg)}\n\n`;
        controller.enqueue(encoder.encode(userEvent));

        const reader = claudeStream.getReader();
        const decoder = new TextDecoder();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            // Parse to accumulate text, then forward the raw SSE chunk
            const chunk = decoder.decode(value, { stream: true });
            controller.enqueue(value);

            // Accumulate text for DB save
            for (const line of chunk.split('\n')) {
              if (line.startsWith('data: ')) {
                try {
                  const d = JSON.parse(line.slice(6));
                  if (d.text) fullText.push(d.text);
                  if (d.input_tokens) inputTokens = d.input_tokens;
                  if (d.output_tokens) outputTokens = d.output_tokens;
                } catch { /* skip */ }
              }
            }
          }

          // Save assistant message to DB
          const aiContent = fullText.join('');
          const cost = calculateCost(selectedModel, inputTokens, outputTokens);
          const parsedMeta = parseMetadata(aiContent);
          const metadata = { ...(parsedMeta ?? {}), cost, model: selectedModel };

          const { data: assistantMsg } = await supabase
            .from('conversation_messages')
            .insert({ conversation_id, role: 'assistant', content: aiContent, metadata })
            .select('id, role, content, metadata, created_at').single();

          // Send saved message event
          const saveEvent = `event: message_saved\ndata: ${JSON.stringify({
            assistant_message: assistantMsg, model: selectedModel, cost,
          })}\n\n`;
          controller.enqueue(encoder.encode(saveEvent));

          // Update conversation + auto-title
          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          const { count } = await supabase.from('conversation_messages')
            .select('id', { count: 'exact', head: true })
            .eq('conversation_id', conversation_id).eq('role', 'user');
          if (count === 1) updates.title = message.substring(0, 200);
          await supabase.from('ideation_conversations').update(updates).eq('id', conversation_id);

          // FR-112: Log usage
          logAIUsage(supabase, {
            featureId: (conv as Record<string, unknown>).submitted_feature_id as string ?? conversation_id,
            adminId: user.id, modelId: selectedModel, operationType: 'ideation',
            inputTokens, outputTokens,
          }).catch(() => {});
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Stream processing failed';
          const errEvent = `event: error\ndata: ${JSON.stringify({ message: msg })}\n\n`;
          controller.enqueue(encoder.encode(errEvent));
        }
        controller.close();
      },
    });

    return new Response(outputStream, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error) {
    console.error('devpilot-chat error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
