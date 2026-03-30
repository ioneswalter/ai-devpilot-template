/**
 * Adaptive Learning Engine — Failure Capture & Pattern Detection (FR-118)
 * Captures pipeline failures, detects recurring patterns, and provides
 * learned constraints for prompt adaptation.
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

// ── Types ──

export interface CaptureFailureInput {
  pipeline_id: string;
  feature_id: string;
  task_item_id?: string;
  error_type: 'constitution_reject' | 'ci_typecheck' | 'ci_lint' | 'ci_test' | 'complexity_split';
  error_code: string;
  error_message: string;
  file_path?: string;
  context?: Record<string, unknown>;
  adaptation_applied?: boolean;
}

interface CaptureResult {
  failure_id: string;
  pattern_detected: boolean;
  pattern_id?: string;
}

export interface AdaptationResult {
  constraints: string[];
  pattern_ids: string[];
  count: number;
}

// ── Configuration ──

const PATTERN_THRESHOLD = 3;
const RECOMMENDATION_THRESHOLD = 5;
const MIN_FEATURES_FOR_RECOMMENDATION = 3;
const MAX_ADAPTATIONS = 5;
const CATEGORY_MAP: Record<string, string> = {
  constitution_reject: 'constitution_limit',
  ci_typecheck: 'type_error',
  ci_lint: 'lint_rule',
  ci_test: 'test_failure',
  complexity_split: 'complexity',
};

// ── Core Functions ──

function getSupabase(): SupabaseClient {
  return createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
}

export async function captureFailure(input: CaptureFailureInput): Promise<CaptureResult> {
  const supabase = getSupabase();

  // Insert failure record
  const { data: failure, error } = await supabase
    .from('pipeline_failures')
    .insert({
      pipeline_id: input.pipeline_id,
      feature_id: input.feature_id,
      task_item_id: input.task_item_id ?? null,
      error_type: input.error_type,
      error_code: input.error_code,
      error_message: input.error_message,
      file_path: input.file_path ?? null,
      context: input.context ?? {},
      adaptation_applied: input.adaptation_applied ?? false,
    })
    .select('id')
    .single();

  if (error || !failure) {
    console.error('Failed to capture failure:', error);
    return { failure_id: '', pattern_detected: false };
  }

  // Inline pattern detection
  const patternResult = await detectPattern(supabase, input);

  return {
    failure_id: failure.id,
    pattern_detected: patternResult.detected,
    pattern_id: patternResult.pattern_id,
  };
}

async function detectPattern(
  supabase: SupabaseClient,
  input: CaptureFailureInput,
): Promise<{ detected: boolean; pattern_id?: string }> {
  try {
    const { count } = await supabase
      .from('pipeline_failures')
      .select('id', { count: 'exact', head: true })
      .eq('error_code', input.error_code)
      .eq('error_type', input.error_type);

    if (!count || count < PATTERN_THRESHOLD) {
      return { detected: false };
    }

    // Get distinct affected features
    const { data: features } = await supabase
      .from('pipeline_failures')
      .select('feature_id')
      .eq('error_code', input.error_code)
      .eq('error_type', input.error_type);

    const uniqueFeatures = [...new Set((features ?? []).map(f => f.feature_id))];
    const category = CATEGORY_MAP[input.error_type] ?? 'other';
    const description = `${input.error_type}/${input.error_code}: ${input.error_message}`.slice(0, 200);
    const adaptationText = buildAdaptationText(input.error_type, input.error_code, count, input.error_message);

    // Upsert pattern
    const { data: pattern } = await supabase
      .from('failure_patterns')
      .upsert({
        error_type: input.error_type,
        error_code: input.error_code,
        category,
        description,
        frequency: count,
        affected_features: uniqueFeatures,
        last_seen: new Date().toISOString(),
        adaptation_text: adaptationText,
        is_active: true,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'error_type,error_code' })
      .select('id')
      .single();

    // Check for constitution recommendation threshold
    if (count >= RECOMMENDATION_THRESHOLD && uniqueFeatures.length >= MIN_FEATURES_FOR_RECOMMENDATION && pattern) {
      await maybeCreateRecommendation(supabase, pattern.id, input, count, uniqueFeatures);
    }

    return { detected: true, pattern_id: pattern?.id };
  } catch (err) {
    console.error('Pattern detection error:', err);
    return { detected: false };
  }
}

function buildAdaptationText(errorType: string, errorCode: string, count: number, message: string): string {
  const shortMsg = message.slice(0, 100);
  if (errorType === 'constitution_reject') {
    return `Keep files under 300 lines — constitution reject has occurred ${count} times (${shortMsg})`;
  }
  if (errorType.startsWith('ci_')) {
    return `Avoid ${errorCode} — this rule has failed ${count} times: ${shortMsg}`;
  }
  if (errorType === 'complexity_split') {
    return `Break complex tasks into smaller files — complexity split triggered ${count} times`;
  }
  return `Watch for ${errorCode} — seen ${count} times: ${shortMsg}`;
}

async function maybeCreateRecommendation(
  supabase: SupabaseClient,
  patternId: string,
  input: CaptureFailureInput,
  count: number,
  features: string[],
): Promise<void> {
  // Check if recommendation already exists for this pattern
  const { count: existing } = await supabase
    .from('constitution_recommendations')
    .select('id', { count: 'exact', head: true })
    .eq('pattern_id', patternId);

  if (existing && existing > 0) return;

  const title = `Add rule for ${input.error_code} (${CATEGORY_MAP[input.error_type] ?? 'other'})`;
  const suggestedRule = buildAdaptationText(input.error_type, input.error_code, count, input.error_message);

  await supabase.from('constitution_recommendations').insert({
    pattern_id: patternId,
    title,
    suggested_rule: suggestedRule,
    evidence: { failure_count: count, affected_features: features, error_type: input.error_type, error_code: input.error_code },
    status: 'pending',
  });
}

// ── Adaptation Queries ──

export async function getAdaptations(filePath: string, taskType: string): Promise<AdaptationResult> {
  const supabase = getSupabase();

  try {
    // Get active patterns
    const { data: patterns } = await supabase
      .from('failure_patterns')
      .select('id, adaptation_text, error_type, category')
      .eq('is_active', true)
      .order('frequency', { ascending: false })
      .limit(MAX_ADAPTATIONS);

    // Get approved constitution recommendations
    const { data: recommendations } = await supabase
      .from('constitution_recommendations')
      .select('id, suggested_rule')
      .eq('status', 'approved')
      .limit(MAX_ADAPTATIONS);

    const constraints: string[] = [];
    const patternIds: string[] = [];

    // Add pattern-based constraints (most relevant first)
    for (const p of patterns ?? []) {
      if (p.adaptation_text && isRelevant(p, filePath, taskType)) {
        constraints.push(p.adaptation_text);
        patternIds.push(p.id);
      }
      if (constraints.length >= MAX_ADAPTATIONS) break;
    }

    // Add approved recommendation constraints
    for (const r of recommendations ?? []) {
      if (constraints.length >= MAX_ADAPTATIONS) break;
      constraints.push(`[Constitution] ${r.suggested_rule}`);
    }

    return { constraints, pattern_ids: patternIds, count: constraints.length };
  } catch (err) {
    console.error('getAdaptations error:', err);
    return { constraints: [], pattern_ids: [], count: 0 };
  }
}

function isRelevant(pattern: { error_type: string; category: string }, filePath: string, taskType: string): boolean {
  // Constitution and complexity patterns are always relevant
  if (pattern.category === 'constitution_limit' || pattern.category === 'complexity') return true;
  // Lint/type patterns relevant to all code
  if (pattern.category === 'lint_rule' || pattern.category === 'type_error') return true;
  // Test patterns only relevant to test tasks
  if (pattern.category === 'test_failure') return taskType === 'test';
  return true;
}
