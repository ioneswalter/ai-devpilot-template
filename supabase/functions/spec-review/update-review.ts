/**
 * Update Review handler (FR-091 — Journey 1/3)
 * Updates item decisions, adds comments, creates new manual items
 */

import { type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import type { z } from 'https://esm.sh/zod@3.22.4';
import type { updateReviewSchema } from './schemas.ts';

type UpdateReviewInput = z.infer<typeof updateReviewSchema>;

interface UpdateReviewParams {
  input: UpdateReviewInput;
  userId: string;
  userName: string | null;
  supabase: SupabaseClient;
}

export async function handleUpdateReview({
  input,
  userId,
  userName,
  supabase,
}: UpdateReviewParams): Promise<{
  data?: unknown;
  error?: { code: string; message: string };
  status: number;
}> {
  const { review_id, version, updates, new_items } = input;

  // 1. Fetch review and verify
  const { data: review, error: reviewErr } = await supabase
    .from('spec_reviews')
    .select('id, status, version')
    .eq('id', review_id)
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
  const updatedItems: Array<{ id: string; decision: string; updated_at: string }> = [];

  // 2. Process item updates
  if (updates && updates.length > 0) {
    for (const update of updates) {
      const updateFields: Record<string, unknown> = { updated_at: now };

      // Fetch existing item once if we need content or comments
      const needsFetch = (update.decision === 'modified' && update.content) || update.comment;
      let existingItem: Record<string, unknown> | null = null;

      if (needsFetch) {
        const { data } = await supabase
          .from('review_items')
          .select('content, original_content, comments')
          .eq('id', update.item_id)
          .single();
        existingItem = data;
      }

      if (update.decision) {
        updateFields.decision = update.decision;
        updateFields.decided_by = userId;
        updateFields.decided_at = now;

        // If modified, store the new content and preserve original
        if (update.decision === 'modified' && update.content && existingItem) {
          updateFields.content = update.content;
          if (!existingItem.original_content) {
            updateFields.original_content = existingItem.content;
          }
        }
      }

      // 3. Handle comments (Journey 3)
      if (update.comment && existingItem) {
        const existingComments = (existingItem.comments as Array<Record<string, unknown>>) || [];
        const newComment = {
          user_id: userId,
          user_name: userName ?? 'Admin',
          text: update.comment,
          created_at: now,
        };
        updateFields.comments = [...existingComments, newComment];
      }

      const { error: updateErr } = await supabase
        .from('review_items')
        .update(updateFields)
        .eq('id', update.item_id)
        .eq('review_id', review_id);

      if (!updateErr) {
        updatedItems.push({
          id: update.item_id,
          decision: update.decision ?? 'pending',
          updated_at: now,
        });
      }
    }
  }

  // 4. Create new manual items
  let createdItems: Array<{ id: string; item_type: string; content: string }> | undefined;

  if (new_items && new_items.length > 0) {
    // Get current max sort_order
    const { data: existingItems } = await supabase
      .from('review_items')
      .select('sort_order')
      .eq('review_id', review_id)
      .order('sort_order', { ascending: false })
      .limit(1);

    let nextOrder = (existingItems?.[0]?.sort_order ?? 0) + 1;

    createdItems = [];
    for (const item of new_items) {
      const itemId = crypto.randomUUID();
      const { error: insertErr } = await supabase.from('review_items').insert({
        id: itemId,
        review_id,
        item_type: item.item_type,
        source: 'manual',
        content: item.content,
        decision: 'pending',
        sort_order: nextOrder++,
        comments: [],
        created_at: now,
        updated_at: now,
      });

      if (!insertErr) {
        createdItems.push({ id: itemId, item_type: item.item_type, content: item.content });
      }
    }
  }

  // 5. Increment version
  const newVersion = version + 1;
  const { error: versionErr } = await supabase
    .from('spec_reviews')
    .update({ version: newVersion, updated_at: now })
    .eq('id', review_id);

  if (versionErr) {
    console.error('Failed to increment review version:', versionErr);
    return {
      error: { code: 'DATABASE_ERROR', message: 'Failed to update review version' },
      status: 500,
    };
  }

  return {
    data: {
      review: { id: review_id, version: newVersion, updated_at: now },
      updated_items: updatedItems,
      ...(createdItems && createdItems.length > 0 ? { new_items: createdItems } : {}),
    },
    status: 200,
  };
}
