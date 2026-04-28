/**
 * Shared helpers for test data generation (FR-111)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

type SupabaseClient = ReturnType<typeof createClient>;

/** Try to load data-model.md from feature_spec_artifacts for targeted schema context */
export async function getDataModelContext(
  featureId: string,
  supabase: SupabaseClient
): Promise<string | null> {
  try {
    const { data: artifact } = await supabase
      .from('feature_spec_artifacts')
      .select('content')
      .eq('feature_id', featureId)
      .eq('artifact_type', 'data-model')
      .maybeSingle();

    if (artifact?.content) {
      return `Feature data model (from spec):\n${artifact.content}\n\nUse ONLY the tables and columns described above. Do NOT reference tables outside this data model.`;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildSpecContext(
  title: string,
  description: string | null,
  criteria: string[]
): string {
  const parts = [`Feature: ${title}`];
  if (description) parts.push(`Description: ${description}`);
  if (criteria.length > 0) {
    parts.push('Acceptance Criteria:\n' + criteria.map((c, i) => `${i + 1}. ${c}`).join('\n'));
  }
  return parts.join('\n\n');
}

export const GENERATE_PROMPT = `You are a test data generator for a gig economy platform (OwnYourGig). Generate realistic SQL INSERT statements for testing the described feature.

Rules:
- Return ONLY valid PostgreSQL SQL — no markdown fences, no explanations
- Use gen_random_uuid() for UUID primary keys
- Use ON CONFLICT DO NOTHING for idempotent inserts
- Generate 5-10 realistic records relevant to the feature
- Include realistic Australian names, addresses, phone numbers, ABNs
- Never use real PII — all data must be fictional but realistic
- Maintain referential integrity across related tables
- Include diverse data: different states, amounts, dates, categories
- Each statement on its own line ending with semicolon
- ONLY use tables and columns that appear in the provided schema
- For columns marked DEFAULT, you may omit them from INSERT (they auto-fill)
- Do NOT guess column names — use exactly the names from the schema`;
