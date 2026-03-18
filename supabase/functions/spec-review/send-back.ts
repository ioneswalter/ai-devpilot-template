/**
 * Send Back handler (FR-091 — Journey 4)
 * Sends a feature back to ideation with feedback
 */

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

interface SendBackParams {
  reviewId: string;
  version: number;
  feedback: string;
  supabase: SupabaseClient;
}

export async function handleSendBack(
  { reviewId, version, feedback, supabase }: SendBackParams
): Promise<{ data?: unknown; error?: { code: string; message: string }; status: number }> {
  // 1. Fetch review
  const { data: review, error: reviewErr } = await supabase
    .from('spec_reviews')
    .select('id, feature_id, status, version')
    .eq('id', reviewId)
    .single();

  if (reviewErr || !review) {
    return { error: { code: 'REVIEW_NOT_FOUND', message: 'Review does not exist' }, status: 404 };
  }

  if (review.status !== 'in_review') {
    return {
      error: { code: 'REVIEW_COMPLETED', message: `Review is already ${review.status}` },
      status: 422,
    };
  }

  if (review.version !== version) {
    return {
      error: { code: 'VERSION_CONFLICT', message: 'Review was modified by another user' },
      status: 409,
    };
  }

  const now = new Date().toISOString();

  // 2. Update review status to "sent_back" with feedback
  const { error: updateErr } = await supabase
    .from('spec_reviews')
    .update({ status: 'sent_back', feedback, updated_at: now })
    .eq('id', reviewId);

  if (updateErr) {
    console.error('Failed to send back review:', updateErr);
    return { error: { code: 'DATABASE_ERROR', message: 'Failed to update review' }, status: 500 };
  }

  // 3. Feature status remains "proposed" — no change needed
  // Just get the feature for response
  const { data: feature } = await supabase
    .from('product_features')
    .select('id, updated_at')
    .eq('id', review.feature_id)
    .single();

  console.log(`Review ${reviewId} sent back with feedback`);

  return {
    data: {
      review: { id: reviewId, status: 'sent_back', feedback, updated_at: now },
      feature: { id: review.feature_id, status: 'proposed', updated_at: feature?.updated_at ?? now },
    },
    status: 200,
  };
}
