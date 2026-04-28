/**
 * DevPilot Chat Edge Function
 * POST: Send a message in an ideation conversation and receive AI response
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
import { handlePrototypeGeneration } from './prototype-handler.ts';

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
  generate_prototype: z.boolean().optional(),
  prototype_type: z.enum(['ui', 'flowchart', 'sequence']).optional(),
});

/** Call Claude API via fetch instead of the heavy SDK to save memory */
async function callClaude(
  apiKey: string,
  model: string,
  systemPrompt: string,
  messages: { role: string; content: string }[]
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8192,
      system: systemPrompt,
      messages,
    }),
  });

  if (!resp.ok) {
    const errBody = await resp.text();
    throw new Error(`Claude API ${resp.status}: ${errBody}`);
  }

  const data = await resp.json();
  const textBlock = data.content?.find((b: { type: string }) => b.type === 'text');
  return {
    text: textBlock?.text ?? 'I was unable to generate a response.',
    inputTokens: data.usage?.input_tokens ?? 0,
    outputTokens: data.usage?.output_tokens ?? 0,
  };
}

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
  } catch {
    /* not metadata */
  }
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
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser(authHeader.substring(7));
    if (authErr || !user) return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);

    const { data: adminRow } = await supabase
      .from('admin_users')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();
    const isAdmin = !!adminRow;

    // Validate request
    const body = await req.json();
    const validation = requestSchema.safeParse(body);
    if (!validation.success) {
      return errorResponse('VALIDATION_ERROR', validation.error.errors[0].message, 400);
    }
    const { conversation_id, message } = validation.data;
    const selectedModel =
      validation.data.model && validation.data.model in ALLOWED_MODELS
        ? validation.data.model
        : DEFAULT_MODEL;

    // Verify conversation access
    const { data: conv, error: convErr } = await supabase
      .from('ideation_conversations')
      .select('id, status, created_by')
      .eq('id', conversation_id)
      .single();

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
      .select('id, role, content, metadata, created_at')
      .single();

    if (userMsgErr) {
      console.error('Save user message error:', userMsgErr);
      return errorResponse('INTERNAL_ERROR', 'Failed to save message', 500);
    }

    // Build context
    const knowledge = await buildKnowledgeContext(supabase);
    const features = knowledge.feature_details as unknown as FeatureContext[];
    const enrichedFeatureList = formatFeatureContext(knowledge.feature_details);
    const existingSections = [
      ...new Set(
        knowledge.feature_details.map((f) => f.spec_section).filter((s): s is string => !!s)
      ),
    ].sort();

    const { data: history } = await supabase
      .from('conversation_messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true });

    const systemPrompt = buildSystemPrompt(features, isAdmin, existingSections, {
      constitution_summary: knowledge.constitution_summary,
      enrichedFeatureList,
    });
    const messages = trimHistory(
      (history ?? []).map((m) => ({ role: m.role as string, content: m.content }))
    );

    // Check API key
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) return errorResponse('AI_ERROR', 'AI service not configured', 500);

    // Call Claude via lightweight fetch (no SDK, no streaming)
    let aiContent: string;
    let messageCost = 0;
    try {
      const result = await callClaude(anthropicApiKey, selectedModel, systemPrompt, messages);
      aiContent = result.text;
      messageCost = calculateCost(selectedModel, result.inputTokens, result.outputTokens);

      // FR-112: Log usage (fire-and-forget)
      const convFeature = conv as Record<string, unknown>;
      logAIUsage(supabase, {
        featureId: (convFeature.submitted_feature_id as string) ?? conversation_id,
        adminId: user.id,
        modelId: selectedModel,
        operationType: 'ideation',
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
      }).catch(() => {});
    } catch (aiError) {
      console.error('Claude API error:', aiError);
      return errorResponse('AI_ERROR', 'Failed to generate AI response', 500);
    }

    // Parse metadata from AI response and include cost
    const parsedMeta = parseMetadata(aiContent);
    const metadata = { ...(parsedMeta ?? {}), cost: messageCost, model: selectedModel };

    // Save assistant message
    const { data: assistantMsg, error: assistantMsgErr } = await supabase
      .from('conversation_messages')
      .insert({ conversation_id, role: 'assistant', content: aiContent, metadata })
      .select('id, role, content, metadata, created_at')
      .single();

    if (assistantMsgErr) {
      console.error('Save assistant message error:', assistantMsgErr);
      return errorResponse('INTERNAL_ERROR', 'Failed to save AI response', 500);
    }

    // Update conversation timestamp + auto-title
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const { count: msgCount } = await supabase
      .from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation_id)
      .eq('role', 'user');
    if (msgCount === 1) updates.title = message.substring(0, 200);

    await supabase.from('ideation_conversations').update(updates).eq('id', conversation_id);

    // FR-140 v2.0: Browser-side prototype generation retired — use Claude Code commands
    if (validation.data.generate_prototype) {
      return jsonResponse(
        {
          error: {
            code: 'GONE',
            message:
              'Browser-side prototype generation retired in v2.0. Use \\generate-prototype FR-XXX in Claude Code.',
          },
        },
        410
      );
    }

    return jsonResponse({
      data: {
        user_message: userMsg,
        assistant_message: assistantMsg,
        model: selectedModel,
        cost: messageCost,
      },
    });
  } catch (error) {
    console.error('devpilot-chat error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
