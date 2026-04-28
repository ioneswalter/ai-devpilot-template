/**
 * Shared utilities for Roadmap Admin Features API
 * CORS headers, Zod schemas, auth helpers, parsing utilities
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

export type SupabaseClient = ReturnType<typeof createClient>;

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

export const CreateFeatureSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().min(1, 'description is required'),
  feature_type: z.string().optional().default('functional_requirement'),
  priority: z.string().optional().default('P2'),
  acceptance_criteria_text: z.string().optional().default(''),
  acceptance_criteria: z.array(z.string()).optional().default([]),
  category: z.string().nullable().optional().default(null),
  spec_section: z.string().optional().default('New Features'),
  related_user_stories: z.array(z.string()).optional().default([]),
  test_cases_text: z.string().optional().default(''),
});

export const RequestImplementationSchema = z.object({
  feature_id: z.string().uuid('feature_id is required'),
  implementation_notes: z.string().optional(),
});

export const UpdateFeatureSchema = z.object({
  feature_id: z.string().uuid('feature_id is required'),
  test_cases_text: z.string().optional(),
  title: z.string().optional(),
  description: z.string().optional(),
  feature_type: z.string().optional(),
  priority: z.string().optional(),
  status: z.string().optional(),
  acceptance_criteria: z.array(z.string()).optional(),
  category: z.string().nullable().optional(),
  spec_section: z.string().optional(),
  related_user_stories: z.array(z.string()).optional(),
  implementing_features: z.array(z.string()).optional(),
});

export async function isAdmin(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined
): Promise<boolean> {
  // Check by user_id first (more reliable for phone auth users)
  const { data: adminById } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (adminById) return true;

  // Fallback to email check
  if (userEmail) {
    const { data: adminByEmail } = await supabase
      .from('admin_users')
      .select('role')
      .eq('email', userEmail)
      .single();

    if (adminByEmail) return true;
  }

  return false;
}

/**
 * Generate next available feature code, recycling deleted codes
 * Finds the lowest available gap in the sequence
 */
export function generateFeatureCode(existingCodes: string[], type: 'feature' | 'journey'): string {
  const prefix = type === 'journey' ? 'J-' : 'FR-';
  const relevantCodes = existingCodes.filter((c) => c.startsWith(prefix));

  const existingNumbers: number[] = [];
  for (const code of relevantCodes) {
    const num = parseInt(code.replace(prefix, ''), 10);
    if (!isNaN(num) && num > 0) {
      existingNumbers.push(num);
    }
  }
  existingNumbers.sort((a, b) => a - b);

  let nextNumber = 1;
  for (const num of existingNumbers) {
    if (num === nextNumber) {
      nextNumber++;
    } else if (num > nextNumber) {
      break;
    }
  }

  return `${prefix}${String(nextNumber).padStart(3, '0')}`;
}

/** Simple text parsing fallback for acceptance criteria */
function simpleParseCriteria(text: string): string[] {
  return text
    .split(/[\n\r]+|(?:^|\s)[-•*]\s|(?:^|\s)\d+[.)]\s/m)
    .map((s) => s.trim())
    .filter((s) => s.length > 10)
    .map((s) => s.replace(/^[-•*\d.)]+\s*/, '').trim());
}

/**
 * Parse free-text acceptance criteria into structured list
 * Uses simple text parsing (AI can be enabled later)
 */
export function parseAcceptanceCriteria(text: string): string[] {
  if (!text.trim()) return [];
  return simpleParseCriteria(text);
}

/** Build a JSON error response with CORS headers */
export function errorResponse(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Build a JSON success response with CORS headers */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
