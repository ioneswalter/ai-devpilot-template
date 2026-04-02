/**
 * Start Review handler (FR-091 — Journey 1)
 * Creates a new spec review with AI enrichment for a proposed feature
 */

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { enrichFeature } from './ai-enrichment.ts';
import { buildReviewContext, formatRelatedFeatures } from './review-context.ts';
import { logAIUsage } from '../_shared/usage-logger.ts';
import { fetchLearnings } from '../_shared/learning-logger.ts';

interface StartReviewParams {
  featureId: string;
  userId: string;
  supabase: SupabaseClient;
}

export async function handleStartReview(
  { featureId, userId, supabase }: StartReviewParams
): Promise<{ data?: unknown; error?: { code: string; message: string }; status: number }> {
  // 1. Verify feature exists and is "proposed"
  const { data: feature, error: featureErr } = await supabase
    .from('product_features')
    .select('id, title, description, acceptance_criteria, status, feature_code, spec_section, category')
    .eq('id', featureId)
    .single();

  if (featureErr || !feature) {
    return { error: { code: 'FEATURE_NOT_FOUND', message: 'Feature does not exist' }, status: 404 };
  }

  if (feature.status !== 'proposed' && feature.status !== 'approved') {
    return {
      error: { code: 'INVALID_STATUS', message: `Feature is "${feature.status}" — review requires "proposed" or "approved" status` },
      status: 422,
    };
  }

  // 2. Check no active review exists
  const { data: existingReview } = await supabase
    .from('spec_reviews')
    .select('id')
    .eq('feature_id', featureId)
    .eq('status', 'in_review')
    .maybeSingle();

  if (existingReview) {
    return {
      error: { code: 'REVIEW_IN_PROGRESS', message: 'Feature already has an active review' },
      status: 409,
    };
  }

  // 3. Look up reviewer name
  const { data: adminUser } = await supabase
    .from('admin_users')
    .select('email')
    .eq('user_id', userId)
    .maybeSingle();

  const reviewerName = adminUser?.email ?? null;

  // 4. Create spec_reviews record
  const reviewId = crypto.randomUUID();
  const now = new Date().toISOString();

  const { error: reviewInsertErr } = await supabase
    .from('spec_reviews')
    .insert({
      id: reviewId,
      feature_id: featureId,
      reviewer_id: userId,
      reviewer_name: reviewerName,
      status: 'in_review',
      version: 1,
      created_at: now,
      updated_at: now,
    });

  if (reviewInsertErr) {
    console.error('Failed to create review:', reviewInsertErr);
    return { error: { code: 'DATABASE_ERROR', message: 'Failed to create review' }, status: 500 };
  }

  // 5. Extract original acceptance criteria as review items
  const criteria = (feature.acceptance_criteria as string[]) || [];
  const originalItems = criteria.map((criterion: string, index: number) => ({
    id: crypto.randomUUID(),
    review_id: reviewId,
    item_type: 'criterion',
    source: 'original',
    content: criterion,
    original_content: criterion,
    decision: 'pending',
    sort_order: index,
    comments: [],
    created_at: now,
    updated_at: now,
  }));

  if (originalItems.length > 0) {
    const { error: itemsErr } = await supabase.from('review_items').insert(originalItems);
    if (itemsErr) {
      console.error('Failed to insert original items:', itemsErr);
      return { error: { code: 'DATABASE_ERROR', message: 'Failed to insert original review items' }, status: 500 };
    }
  }

  // 5b. Load spec artifacts and parse into reviewable items (SpecKit integration)
  const specItems = await loadSpecArtifactItems(supabase, featureId, reviewId, originalItems.length, now);
  if (specItems.length > 0) {
    const { error: specItemsErr } = await supabase.from('review_items').insert(specItems);
    if (specItemsErr) {
      console.error('Failed to insert spec artifact items:', specItemsErr);
    }
  }

  // 6. FR-121: Fetch deep review context (constitution, related features, test coverage)
  const reviewCtx = await buildReviewContext(supabase, featureId, feature.spec_section ?? null, feature.category ?? null);
  const relatedText = formatRelatedFeatures(reviewCtx.related_features);

  // Fetch learnings from prompt library (Phase 3)
  const learnings = await fetchLearnings(supabase, 'spec_review', 5);

  // Call AI enrichment with deep context
  let aiItems: typeof originalItems = [];
  let aiEnrichment: unknown = null;

  const enrichment = await enrichFeature(
    feature.title,
    feature.description ?? '',
    criteria,
    { constitution: reviewCtx.constitution, related_features: relatedText, existing_test_count: reviewCtx.existing_test_count, learnings },
  );

  if (enrichment) {
    aiEnrichment = { raw_response: enrichment.raw_response, model: enrichment.model };
    // FR-112: Log AI usage (fire-and-forget)
    logAIUsage(supabase, {
      featureId, adminId: userId, modelId: enrichment.model, operationType: 'spec_review',
      inputTokens: enrichment.input_tokens, outputTokens: enrichment.output_tokens,
    }).catch(() => {});
    const startOrder = originalItems.length + specItems.length;
    aiItems = enrichment.items.map((item, index) => ({
      id: crypto.randomUUID(),
      review_id: reviewId,
      item_type: item.item_type,
      source: 'ai_generated',
      content: item.content,
      original_content: null,
      decision: 'pending',
      sort_order: startOrder + index,
      comments: [],
      created_at: now,
      updated_at: now,
    }));

    if (aiItems.length > 0) {
      const { error: aiItemsErr } = await supabase.from('review_items').insert(aiItems);
      if (aiItemsErr) {
        console.error('Failed to insert AI items:', aiItemsErr);
        // Non-fatal: continue with original items only (manual-only mode)
        aiItems = [];
      }
    }

    // Store AI enrichment data on the review
    const { error: enrichUpdateErr } = await supabase
      .from('spec_reviews')
      .update({ ai_enrichment: aiEnrichment })
      .eq('id', reviewId);

    if (enrichUpdateErr) {
      console.error('Failed to store AI enrichment data:', enrichUpdateErr);
    }
  } else {
    console.warn('AI enrichment unavailable — manual-only review mode');
  }

  // 7. Return the review and all items
  const allItems = [...originalItems, ...specItems, ...aiItems].map(item => ({
    id: item.id,
    item_type: item.item_type,
    source: item.source,
    content: item.content,
    decision: item.decision,
    sort_order: item.sort_order,
  }));

  return {
    data: {
      review: {
        id: reviewId,
        feature_id: featureId,
        reviewer_id: userId,
        reviewer_name: reviewerName,
        status: 'in_review',
        version: 1,
        created_at: now,
        ai_model: enrichment?.model ?? null,
      },
      items: allItems,
    },
    status: 201,
  };
}

/**
 * Parse spec artifacts (spec.md) into individual reviewable items.
 * Extracts: acceptance scenarios, edge cases, and functional requirements.
 */
async function loadSpecArtifactItems(
  supabase: SupabaseClient,
  featureId: string,
  reviewId: string,
  startOrder: number,
  now: string,
) {
  const { data: artifacts } = await supabase
    .from('feature_spec_artifacts')
    .select('artifact_type, content')
    .eq('feature_id', featureId)
    .in('artifact_type', ['spec']);

  if (!artifacts || artifacts.length === 0) return [];

  const specContent = artifacts.find((a: { artifact_type: string }) => a.artifact_type === 'spec')?.content;
  if (!specContent) return [];

  const items: Array<{
    id: string; review_id: string; item_type: string; source: string;
    content: string; original_content: string; decision: string;
    sort_order: number; comments: never[]; created_at: string; updated_at: string;
  }> = [];
  let order = startOrder;

  // Extract acceptance scenarios (numbered items after **Acceptance Scenarios**: )
  const scenarioMatches = specContent.match(/\d+\.\s+\*\*Given\*\*[^\n]+/g) ?? [];
  for (const scenario of scenarioMatches) {
    const cleaned = scenario.replace(/^\d+\.\s+/, '').replace(/\*\*/g, '');
    items.push({
      id: crypto.randomUUID(), review_id: reviewId, item_type: 'criterion',
      source: 'speckit', content: cleaned, original_content: cleaned,
      decision: 'pending', sort_order: order++, comments: [],
      created_at: now, updated_at: now,
    });
  }

  // Extract edge cases (lines starting with "- What happens when" or "- How does")
  // Rephrase questions as testable acceptance criteria
  const edgeCaseMatches = specContent.match(/^- (?:What happens when|How does)[^\n]+/gm) ?? [];
  for (const edgeCase of edgeCaseMatches) {
    const cleaned = edgeCase.replace(/^- /, '');
    const asCriteria = rephraseEdgeCaseAsCriteria(cleaned);
    items.push({
      id: crypto.randomUUID(), review_id: reviewId, item_type: 'edge_case',
      source: 'speckit', content: asCriteria, original_content: cleaned,
      decision: 'pending', sort_order: order++, comments: [],
      created_at: now, updated_at: now,
    });
  }

  // Extract functional requirements (lines matching **REQ-###**: )
  const reqMatches = specContent.match(/\*\*REQ-\d+\*\*:\s*[^\n]+/g) ?? [];
  for (const req of reqMatches) {
    const cleaned = req.replace(/\*\*/g, '');
    items.push({
      id: crypto.randomUUID(), review_id: reviewId, item_type: 'criterion',
      source: 'speckit', content: cleaned, original_content: cleaned,
      decision: 'pending', sort_order: order++, comments: [],
      created_at: now, updated_at: now,
    });
  }

  return items;
}

/**
 * Rephrase an edge case question into a testable acceptance criterion.
 * "What happens when X?" → "The system handles X gracefully with appropriate feedback"
 * "How does the system handle X?" → "The system handles X correctly"
 */
function rephraseEdgeCaseAsCriteria(question: string): string {
  // "What happens when a learner enrolls in an archived course?"
  // → "The system handles the scenario where a learner enrolls in an archived course"
  const whatHappens = question.match(/^What happens when (.+?)\??$/i);
  if (whatHappens) {
    const scenario = whatHappens[1].replace(/\.$/, '');
    return `The system handles the scenario where ${scenario} with appropriate feedback to the user`;
  }

  // "How does the system handle X?" → "The system handles X correctly"
  const howDoes = question.match(/^How does (?:the system |the app |it )?(.+?)\??$/i);
  if (howDoes) {
    const action = howDoes[1].replace(/\.$/, '');
    return `The system ${action} correctly and provides appropriate feedback`;
  }

  // Fallback: strip trailing ? and prepend "The system ensures"
  if (question.endsWith('?')) {
    return `The system ensures: ${question.slice(0, -1)}`;
  }

  return question;
}
