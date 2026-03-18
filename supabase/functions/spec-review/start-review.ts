/**
 * Start Review handler (FR-091 — Journey 1)
 * Creates a new spec review with AI enrichment for a proposed feature
 */

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { enrichFeature } from './ai-enrichment.ts';

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
    .select('id, title, description, acceptance_criteria, status, feature_code')
    .eq('id', featureId)
    .single();

  if (featureErr || !feature) {
    return { error: { code: 'FEATURE_NOT_FOUND', message: 'Feature does not exist' }, status: 404 };
  }

  if (feature.status !== 'proposed') {
    return {
      error: { code: 'INVALID_STATUS', message: `Feature is "${feature.status}", not "proposed"` },
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
    }
  }

  // 6. Call AI enrichment
  let aiItems: typeof originalItems = [];
  let aiEnrichment: unknown = null;

  const enrichment = await enrichFeature(
    feature.title,
    feature.description ?? '',
    criteria,
  );

  if (enrichment) {
    aiEnrichment = { raw_response: enrichment.raw_response };
    const startOrder = originalItems.length;
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
      }
    }

    // Store AI enrichment data on the review
    await supabase
      .from('spec_reviews')
      .update({ ai_enrichment: aiEnrichment })
      .eq('id', reviewId);
  } else {
    console.warn('AI enrichment unavailable — manual-only review mode');
  }

  // 7. Return the review and all items
  const allItems = [...originalItems, ...aiItems].map(item => ({
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
      },
      items: allItems,
    },
    status: 201,
  };
}
