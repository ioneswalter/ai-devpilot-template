/**
 * AI Learning Logger (Phase 3 — Prompt Library)
 * Records corrections, patterns, and constraints from AI interactions.
 * Fire-and-forget — errors are swallowed so they never block the main flow.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export type LearningType = 'correction' | 'pattern' | 'constraint' | 'tip';
export type Severity = 'low' | 'medium' | 'high' | 'critical';

interface LearningParams {
  categorySlug: string;
  learningType: LearningType;
  title: string;
  context: string;
  correction: string;
  appliesTo?: string[];
  severity?: Severity;
  createdBy?: string;
}

/** Record an AI learning. Non-blocking — errors are swallowed. */
export async function recordLearning(
  supabase: SupabaseClient,
  params: LearningParams,
): Promise<void> {
  try {
    // Look up category ID from slug
    const { data: category } = await supabase
      .from('prompt_categories')
      .select('id')
      .eq('slug', params.categorySlug)
      .single();

    await supabase.from('ai_learnings').insert({
      id: crypto.randomUUID(),
      category_id: category?.id ?? null,
      learning_type: params.learningType,
      title: params.title,
      context: params.context,
      correction: params.correction,
      applies_to: params.appliesTo ?? [],
      severity: params.severity ?? 'medium',
      is_active: true,
      created_by: params.createdBy,
    });
  } catch {
    // Fire-and-forget — never block the caller
  }
}

/** Fetch active learnings for a category to inject into AI prompts. */
export async function fetchLearnings(
  supabase: SupabaseClient,
  categorySlug: string,
  limit = 10,
): Promise<string> {
  try {
    const { data: category } = await supabase
      .from('prompt_categories')
      .select('id')
      .eq('slug', categorySlug)
      .single();

    if (!category) return '';

    const { data: learnings } = await supabase
      .from('ai_learnings')
      .select('title, correction, severity, learning_type')
      .eq('category_id', category.id)
      .eq('is_active', true)
      .order('severity', { ascending: false })
      .limit(limit);

    if (!learnings || learnings.length === 0) return '';

    const lines = learnings.map(
      (l) => `- [${l.severity.toUpperCase()}] ${l.title}: ${l.correction}`,
    );

    return `\n## Known Learnings (avoid these mistakes)\n${lines.join('\n')}`;
  } catch {
    return '';
  }
}
