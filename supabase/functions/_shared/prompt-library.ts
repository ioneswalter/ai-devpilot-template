/**
 * Prompt Library Client (Phase 3)
 * Fetches prompt templates and learnings to enrich AI calls.
 * Falls back gracefully to hardcoded prompts if the library is unavailable.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export interface PromptContext {
  systemPrompt: string;
  learnings: string;
  modelRecommendation: string;
  maxTokens: number;
}

/**
 * Fetch a prompt template by slug, with active learnings for its category.
 * Returns null if the template is not found — caller should fall back to hardcoded prompt.
 */
export async function fetchPromptContext(
  supabase: SupabaseClient,
  templateSlug: string,
): Promise<PromptContext | null> {
  try {
    const { data: template } = await supabase
      .from('prompt_templates')
      .select('system_prompt, model_recommendation, max_tokens, category_id')
      .eq('slug', templateSlug)
      .eq('is_active', true)
      .single();

    if (!template) return null;

    // Fetch active learnings for this category
    let learnings = '';
    if (template.category_id) {
      const { data: items } = await supabase
        .from('ai_learnings')
        .select('title, correction, severity')
        .eq('category_id', template.category_id)
        .eq('is_active', true)
        .order('severity', { ascending: false })
        .limit(10);

      if (items && items.length > 0) {
        const lines = items.map(
          (l) => `- [${(l.severity as string).toUpperCase()}] ${l.title}: ${l.correction}`,
        );
        learnings = `\n## Known Learnings (avoid these mistakes)\n${lines.join('\n')}`;
      }
    }

    // Increment usage count (fire-and-forget)
    supabase.rpc('increment_prompt_usage', { slug: templateSlug }).then().catch(() => {});

    return {
      systemPrompt: template.system_prompt as string,
      learnings,
      modelRecommendation: (template.model_recommendation as string) ?? 'claude-sonnet-4-5-20250514',
      maxTokens: (template.max_tokens as number) ?? 4096,
    };
  } catch {
    return null;
  }
}

/**
 * Record prompt effectiveness after an AI call.
 * Fire-and-forget — never blocks the caller.
 */
export async function ratePrompt(
  supabase: SupabaseClient,
  templateSlug: string,
  params: {
    qualityScore: number;
    wasUseful: boolean;
    inputTokens?: number;
    outputTokens?: number;
    latencyMs?: number;
    modelUsed?: string;
    featureId?: string;
    ratedBy?: string;
  },
): Promise<void> {
  try {
    const { data: template } = await supabase
      .from('prompt_templates')
      .select('id')
      .eq('slug', templateSlug)
      .single();

    if (!template) return;

    await supabase.from('prompt_ratings').insert({
      id: crypto.randomUUID(),
      prompt_template_id: template.id,
      quality_score: params.qualityScore,
      was_useful: params.wasUseful,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      latency_ms: params.latencyMs,
      model_used: params.modelUsed,
      feature_id: params.featureId,
      rated_by: params.ratedBy,
    });
  } catch {
    // Fire-and-forget
  }
}
