/**
 * Prototype generation handler — orchestrates classification, generation,
 * and version storage for FR-140: AI Prototype Builder.
 * Called from devpilot-chat/index.ts when generate_prototype is true.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  classifyFeature,
  generatePrototype,
  iteratePrototype,
  isGenerateError,
} from './prototype-generator.ts';

type SupabaseClient = ReturnType<typeof createClient>;

export async function handlePrototypeGeneration(
  supabase: SupabaseClient,
  conversationId: string,
  description: string,
  forceType: 'ui' | 'flowchart' | 'process' | undefined,
  messageId: string,
): Promise<Record<string, unknown> | null> {
  try {
    // Check if a prototype already exists (iteration mode)
    const { data: currentVersion } = await supabase
      .from('prototype_versions')
      .select('id, content, prototype_type, version_number')
      .eq('conversation_id', conversationId)
      .eq('is_current', true)
      .maybeSingle();

    // If prototype exists, iterate on it with the new feedback
    if (currentVersion) {
      return await handleIteration(
        supabase, conversationId, description, messageId, currentVersion,
      );
    }

    // First-time generation: classify and generate
    return await handleFirstGeneration(
      supabase, conversationId, description, forceType, messageId,
    );
  } catch (err) {
    console.error('Prototype generation error:', err);
    return {
      type: 'prototype_error',
      error_code: 'GENERATION_FAILED',
      message: 'Unexpected error during prototype generation',
    };
  }
}

async function handleFirstGeneration(
  supabase: SupabaseClient,
  conversationId: string,
  description: string,
  forceType: 'ui' | 'flowchart' | 'process' | undefined,
  messageId: string,
): Promise<Record<string, unknown>> {
  let protoType = forceType;
  let confidence = 1.0;

  if (!protoType) {
    const classification = await classifyFeature(description);
    if (classification.type === 'ambiguous' || classification.confidence < 0.7) {
      return {
        type: 'prototype_disambiguation',
        detected_types: classification.detected_types ?? ['ui', 'flowchart'],
        confidence: classification.confidence,
      };
    }
    protoType = classification.type as 'ui' | 'flowchart' | 'process';
    confidence = classification.confidence;
  }

  const result = await generatePrototype(description, protoType);
  if (isGenerateError(result)) {
    return { type: 'prototype_error', error_code: result.error_code, message: result.message };
  }

  return await insertVersion(supabase, conversationId, messageId, protoType, result.html, confidence, null);
}

async function handleIteration(
  supabase: SupabaseClient,
  conversationId: string,
  feedback: string,
  messageId: string,
  current: { content: string; prototype_type: string; version_number: number },
): Promise<Record<string, unknown>> {
  const result = await iteratePrototype(current.content, feedback);
  if (isGenerateError(result)) {
    return { type: 'prototype_error', error_code: result.error_code, message: result.message };
  }

  const protoType = current.prototype_type as 'ui' | 'flowchart' | 'process';
  return await insertVersion(supabase, conversationId, messageId, protoType, result.html, 1.0, feedback);
}

async function insertVersion(
  supabase: SupabaseClient,
  conversationId: string,
  messageId: string,
  protoType: 'ui' | 'flowchart' | 'process',
  html: string,
  confidence: number,
  feedbackPrompt: string | null,
): Promise<Record<string, unknown>> {
  const { count } = await supabase
    .from('prototype_versions')
    .select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId);
  const versionNum = (count ?? 0) + 1;

  if (versionNum > 1) {
    await supabase.from('prototype_versions')
      .update({ is_current: false }).eq('conversation_id', conversationId);
  }

  const { data: version } = await supabase.from('prototype_versions').insert({
    conversation_id: conversationId,
    message_id: messageId,
    prototype_type: protoType,
    content: html,
    version_number: versionNum,
    is_current: true,
    confidence,
    feedback_prompt: feedbackPrompt,
  }).select('id, version_number').single();

  return {
    type: 'prototype_generated',
    prototype_type: protoType,
    version_id: version?.id,
    version_number: version?.version_number ?? versionNum,
    confidence,
  };
}
