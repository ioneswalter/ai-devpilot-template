/**
 * DevPilot Chat Edge Function
 * POST: Send a message in an ideation conversation and receive AI response
 *
 * FR-090 Feature Ideation Chat
 */

import Anthropic from 'npm:@anthropic-ai/sdk@0.39.0';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const DEFAULT_MODEL = 'claude-opus-4-1-20250805';
const ALLOWED_MODELS: Record<string, string> = {
  'claude-opus-4-1-20250805': 'Opus',
  'claude-sonnet-4-5-20250514': 'Sonnet',
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

import { buildSystemPrompt } from '../_shared/devpilot-prompt.ts';
import type { FeatureContext } from '../_shared/devpilot-prompt.ts';
import { buildKnowledgeContext, formatFeatureContext } from '../_shared/knowledge-context.ts';
import { logAIUsage } from '../_shared/usage-logger.ts';

function parseMetadata(content: string): Record<string, unknown> | null {
  const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
  if (!jsonMatch) return null;

  try {
    const parsed = JSON.parse(jsonMatch[1].trim());
    if (parsed.type === 'dedup_warning') {
      return parsed;
    }
    if (parsed.type === 'proposal') {
      // Normalize: support both old single "proposal" and new "proposals" array format
      if (parsed.proposals && Array.isArray(parsed.proposals)) {
        return parsed;
      }
      if (parsed.proposal) {
        return { type: 'proposal', proposals: [parsed.proposal] };
      }
      return parsed;
    }
  } catch {
    // Not valid JSON metadata — that's fine
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  // GET returns the default model and available models list
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
    const { data: { user }, error: authErr } = await supabase.auth.getUser(authHeader.substring(7));
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
    const selectedModel = (validation.data.model && validation.data.model in ALLOWED_MODELS)
      ? validation.data.model : DEFAULT_MODEL;

    // Verify conversation access
    const { data: conv, error: convErr } = await supabase
      .from('ideation_conversations')
      .select('id, status, created_by')
      .eq('id', conversation_id)
      .single();

    if (convErr || !conv) return errorResponse('NOT_FOUND', 'Conversation not found', 404);
    if (conv.created_by !== user.id && !isAdmin) {
      return errorResponse('FORBIDDEN', 'You do not have access to this conversation', 403);
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

    // FR-120: Fetch deep knowledge context (constitution, criteria, tests)
    const knowledge = await buildKnowledgeContext(supabase);
    const features = knowledge.feature_details as unknown as FeatureContext[];
    const enrichedFeatureList = formatFeatureContext(knowledge.feature_details);
    const existingSections = [...new Set(
      knowledge.feature_details.map(f => f.spec_section).filter((s): s is string => !!s)
    )].sort();

    // Fetch conversation history
    const { data: history } = await supabase
      .from('conversation_messages')
      .select('role, content')
      .eq('conversation_id', conversation_id)
      .order('created_at', { ascending: true });

    // Build messages for Claude with enriched knowledge context
    const systemPrompt = buildSystemPrompt(
      features, isAdmin, existingSections,
      { constitution_summary: knowledge.constitution_summary, enrichedFeatureList },
    );
    const allMessages = (history ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    let messages = allMessages;
    if (allMessages.length > 20) {
      const first = allMessages.slice(0, 2);
      const recent = allMessages.slice(-10);
      const summaryNote = {
        role: 'assistant' as const,
        content: `[Note: ${allMessages.length - 12} earlier messages were omitted to stay within context limits. The conversation started with the messages above and continued with the messages below.]`,
      };
      messages = [...first, summaryNote, ...recent];
    }

    // Check API key
    const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!anthropicApiKey) {
      return errorResponse('AI_ERROR', 'AI service not configured', 500);
    }

    // Call Claude
    const anthropic = new Anthropic({ apiKey: anthropicApiKey });
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000);

    let aiContent: string;
    try {
      const response = await anthropic.messages.create({
        model: selectedModel,
        max_tokens: 16384,
        system: systemPrompt,
        messages,
      });
      clearTimeout(timeoutId);

      const textBlock = response.content.find((b) => b.type === 'text');
      aiContent = textBlock && textBlock.type === 'text' ? textBlock.text : 'I was unable to generate a response.';

      // FR-112: Log usage (fire-and-forget)
      const convFeature = conv as Record<string, unknown>;
      logAIUsage(supabase, {
        featureId: (convFeature.submitted_feature_id as string) ?? conversation_id,
        adminId: user.id, modelId: selectedModel, operationType: 'ideation',
        inputTokens: response.usage?.input_tokens ?? 0, outputTokens: response.usage?.output_tokens ?? 0,
      }).catch(() => {});
    } catch (aiError) {
      clearTimeout(timeoutId);
      console.error('Claude API error:', aiError);
      return errorResponse('AI_ERROR', 'Failed to generate AI response', 500);
    }

    // Parse metadata from AI response
    const metadata = parseMetadata(aiContent);

    // Save assistant message
    const { data: assistantMsg, error: assistantMsgErr } = await supabase
      .from('conversation_messages')
      .insert({
        conversation_id,
        role: 'assistant',
        content: aiContent,
        metadata: metadata ?? null,
      })
      .select('id, role, content, metadata, created_at')
      .single();

    if (assistantMsgErr) {
      console.error('Save assistant message error:', assistantMsgErr);
      return errorResponse('INTERNAL_ERROR', 'Failed to save AI response', 500);
    }

    // Update conversation timestamp + auto-title
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    // Auto-generate title from first user message
    const { count: msgCount } = await supabase
      .from('conversation_messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', conversation_id)
      .eq('role', 'user');

    if (msgCount === 1) {
      updates.title = message.substring(0, 200);
    }

    await supabase
      .from('ideation_conversations')
      .update(updates)
      .eq('id', conversation_id);

    return jsonResponse({
      data: {
        user_message: userMsg,
        assistant_message: assistantMsg,
        model: selectedModel,
      },
    });
  } catch (error) {
    console.error('devpilot-chat error:', error);
    return errorResponse('INTERNAL_ERROR', 'An unexpected error occurred', 500);
  }
});
