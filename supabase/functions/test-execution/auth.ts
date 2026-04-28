/**
 * Auth helpers and schemas for test-execution
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

export function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

export function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

export const TestResultSchema = z.object({
  test_case_id: z.string().uuid(),
  result: z.enum(['passed', 'failed', 'skipped']),
  notes: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
});

export const SubmitResultsSchema = z.object({
  feature_id: z.string().uuid(),
  environment: z.string().min(1),
  results: z.array(TestResultSchema).min(1, 'At least one result required'),
});

export const CreateTestCaseSchema = z.object({
  feature_id: z.string().uuid(),
  title: z.string().min(1),
  steps: z.array(z.string()).min(1),
  expected_result: z.string().min(1),
  test_type: z.string().default('exploratory'),
});

async function isAdmin(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined
): Promise<boolean> {
  const { data: adminById } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (adminById) return true;

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

export async function authenticateAdmin(
  req: Request,
  supabase: SupabaseClient
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
  }

  const token = authHeader.substring(7);
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    return errorResponse('UNAUTHORIZED', 'Invalid token', 401);
  }

  const adminCheck = await isAdmin(supabase, user.id, user.email);
  if (!adminCheck) {
    return errorResponse('FORBIDDEN', 'Admin access required', 403);
  }

  return { userId: user.id };
}
