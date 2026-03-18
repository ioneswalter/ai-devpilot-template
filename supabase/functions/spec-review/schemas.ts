/**
 * Zod validation schemas for Spec Review API (FR-091)
 */

import { z } from 'https://esm.sh/zod@3.22.4';

export const startReviewSchema = z.object({
  feature_id: z.string().uuid('Invalid feature_id format'),
});

export const updateReviewSchema = z.object({
  review_id: z.string().uuid('Invalid review_id format'),
  version: z.number().int().positive('Version must be a positive integer'),
  updates: z.array(z.object({
    item_id: z.string().uuid('Invalid item_id format'),
    decision: z.enum(['accepted', 'rejected', 'modified']).optional(),
    content: z.string().min(1, 'Content cannot be empty').optional(),
    comment: z.string().min(1, 'Comment cannot be empty').optional(),
  })).optional(),
  new_items: z.array(z.object({
    item_type: z.enum(['criterion', 'test_case', 'edge_case']),
    content: z.string().min(1, 'Content cannot be empty'),
  })).optional(),
});

export const approveSchema = z.object({
  review_id: z.string().uuid('Invalid review_id format'),
  version: z.number().int().positive('Version must be a positive integer'),
});

export const sendBackSchema = z.object({
  review_id: z.string().uuid('Invalid review_id format'),
  version: z.number().int().positive('Version must be a positive integer'),
  feedback: z.string().min(1, 'Feedback is required when sending back'),
});
