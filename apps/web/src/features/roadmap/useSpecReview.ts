/**
 * Hook for Spec Review workflow (FR-091)
 * Manages review state with TanStack Query for caching and mutations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { adminApi } from '@/lib/api/admin-api';
import type { ReviewItemDecision, ReviewItemType, UpdateReviewRequest } from './spec-review-types';

const REVIEW_KEY = ['spec-review'];

export function useSpecReview(featureId: string, options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const enabled = options?.enabled !== false;

  // Fetch current review (404 means no review exists — not an error)
  const reviewQuery = useQuery({
    queryKey: [...REVIEW_KEY, featureId],
    queryFn: async () => {
      try {
        return await adminApi.getReview(featureId, true);
      } catch (err) {
        if (err instanceof Error && err.message.includes('No review exists')) {
          return null;
        }
        throw err;
      }
    },
    staleTime: 10_000,
    retry: false,
    enabled,
  });

  const review = reviewQuery.data?.data?.review ?? null;
  const items = reviewQuery.data?.data?.items ?? [];
  const history = reviewQuery.data?.data?.history ?? [];

  // Start a new review
  const startMutation = useMutation({
    mutationFn: () => adminApi.startReview(featureId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...REVIEW_KEY, featureId] });
    },
  });

  // Update items (decisions, comments, new items)
  const updateMutation = useMutation({
    mutationFn: (data: UpdateReviewRequest) => adminApi.updateReview(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...REVIEW_KEY, featureId] });
    },
  });

  // Approve the review
  const approveMutation = useMutation({
    mutationFn: () => {
      if (!review) throw new Error('No active review');
      return adminApi.approveReview(review.id, review.version);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...REVIEW_KEY, featureId] });
      queryClient.invalidateQueries({ queryKey: ['product-features'] });
    },
  });

  // Send back with feedback
  const sendBackMutation = useMutation({
    mutationFn: (feedback: string) => {
      if (!review) throw new Error('No active review');
      return adminApi.sendBackReview(review.id, review.version, feedback);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...REVIEW_KEY, featureId] });
      queryClient.invalidateQueries({ queryKey: ['product-features'] });
    },
  });

  // Helper: update a single item's decision
  function updateItemDecision(itemId: string, decision: ReviewItemDecision, content?: string) {
    if (!review) return;
    const data: UpdateReviewRequest = {
      review_id: review.id,
      version: review.version,
      updates: [{ item_id: itemId, decision, ...(content ? { content } : {}) }],
    };
    return updateMutation.mutateAsync(data);
  }

  // Helper: add a comment to an item
  function addComment(itemId: string, comment: string) {
    if (!review) return;
    const data: UpdateReviewRequest = {
      review_id: review.id,
      version: review.version,
      updates: [{ item_id: itemId, comment }],
    };
    return updateMutation.mutateAsync(data);
  }

  // Helper: accept all pending items in one request
  function acceptAll() {
    if (!review) return;
    const pendingItems = items.filter((i) => i.decision === 'pending');
    if (pendingItems.length === 0) return;
    const data: UpdateReviewRequest = {
      review_id: review.id,
      version: review.version,
      updates: pendingItems.map((i) => ({ item_id: i.id, decision: 'accepted' as const })),
    };
    return updateMutation.mutateAsync(data);
  }

  // Helper: add a new manual item
  function addItem(itemType: ReviewItemType, content: string) {
    if (!review) return;
    const data: UpdateReviewRequest = {
      review_id: review.id,
      version: review.version,
      new_items: [{ item_type: itemType, content }],
    };
    return updateMutation.mutateAsync(data);
  }

  const isReviewActive = review?.status === 'in_review';
  const pendingCount = items.filter((i) => i.decision === 'pending').length;
  const acceptedCount = items.filter(
    (i) => i.decision === 'accepted' || i.decision === 'modified'
  ).length;
  const rejectedCount = items.filter((i) => i.decision === 'rejected').length;

  return {
    // Data
    review,
    items,
    history,
    isReviewActive,
    pendingCount,
    acceptedCount,
    rejectedCount,

    // Loading states
    isLoading: reviewQuery.isLoading,
    isStarting: startMutation.isPending,
    isUpdating: updateMutation.isPending,
    isApproving: approveMutation.isPending,
    isSendingBack: sendBackMutation.isPending,

    // Errors
    error: reviewQuery.error,
    startError: startMutation.error,
    updateError: updateMutation.error,
    approveError: approveMutation.error,
    sendBackError: sendBackMutation.error,

    // Actions
    startReview: startMutation.mutateAsync,
    updateItemDecision,
    addComment,
    addItem,
    acceptAll,
    approveReview: approveMutation.mutateAsync,
    sendBack: sendBackMutation.mutateAsync,
    refetch: reviewQuery.refetch,
  };
}
