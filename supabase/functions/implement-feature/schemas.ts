/**
 * Zod validation schemas for implement-feature Edge Function (FR-105)
 */

import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

export const CreateRequestSchema = z.object({
  feature_id: z.string().min(1, 'feature_id is required'),
  implementation_notes: z.string().optional(),
});

export const GetRequestSchema = z.object({
  feature_id: z.string().min(1, 'feature_id is required'),
});

export const UpdateTaskItemSchema = z.object({
  item_id: z.string().uuid('item_id must be a valid UUID'),
  decision: z.enum(['accepted', 'rejected', 'modified']).optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  comment: z.string().min(1).optional(),
});

export const AddTaskItemSchema = z.object({
  request_id: z.string().uuid('request_id must be a valid UUID'),
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  file_path: z.string().min(1, 'file_path is required'),
  task_type: z.enum(['create', 'modify', 'test', 'config']),
});
