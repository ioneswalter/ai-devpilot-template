/**
 * Test Execution API
 *
 * POST /test-execution — Submit test results for a feature
 * GET  /test-execution?feature_id=xxx — Get test run history
 * GET  /test-execution?feature_id=xxx&summary=true — Release readiness summary
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ error: { code, message } }, status);
}

// --- Schemas ---

const TestResultSchema = z.object({
  test_case_id: z.string().uuid(),
  result: z.enum(['passed', 'failed', 'skipped']),
  notes: z.string().optional(),
  evidence: z.record(z.unknown()).optional(),
});

const SubmitResultsSchema = z.object({
  feature_id: z.string().uuid(),
  environment: z.string().min(1),
  results: z.array(TestResultSchema).min(1, 'At least one result required'),
});

// --- Auth ---

async function isAdmin(
  supabase: SupabaseClient,
  userId: string,
  userEmail: string | undefined,
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

async function authenticateAdmin(
  req: Request,
  supabase: SupabaseClient,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
  }

  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);

  if (error || !user) {
    return errorResponse('UNAUTHORIZED', 'Invalid token', 401);
  }

  const adminCheck = await isAdmin(supabase, user.id, user.email);
  if (!adminCheck) {
    return errorResponse('FORBIDDEN', 'Admin access required', 403);
  }

  return { userId: user.id };
}

// --- Handlers ---

async function handleSubmitResults(
  supabase: SupabaseClient,
  body: z.infer<typeof SubmitResultsSchema>,
  userId: string,
): Promise<Response> {
  const { feature_id, environment, results } = body;

  // Verify all test_case_ids belong to this feature
  const caseIds = results.map((r) => r.test_case_id);
  const { data: validCases, error: caseError } = await supabase
    .from('test_cases')
    .select('id')
    .eq('feature_id', feature_id)
    .in('id', caseIds);

  if (caseError) {
    return errorResponse('DB_ERROR', caseError.message, 500);
  }

  const validIds = new Set((validCases ?? []).map((c: { id: string }) => c.id));
  const invalid = caseIds.filter((id) => !validIds.has(id));
  if (invalid.length > 0) {
    return errorResponse(
      'INVALID_TEST_CASES',
      `Test case(s) not found for this feature: ${invalid.join(', ')}`,
      400,
    );
  }

  const now = new Date().toISOString();
  const runRows = results.map((r) => ({
    id: crypto.randomUUID(),
    test_case_id: r.test_case_id,
    environment,
    result: r.result,
    error_message: r.notes ?? null,
    evidence: r.evidence ?? null,
    executed_by: userId,
    executed_at: now,
  }));

  const { data: testRuns, error: insertError } = await supabase
    .from('test_runs')
    .insert(runRows)
    .select('*');

  if (insertError) {
    return errorResponse('DB_ERROR', insertError.message, 500);
  }

  // Update test_cases.passed for non-skipped results
  const updates = results
    .filter((r) => r.result !== 'skipped')
    .map((r) =>
      supabase
        .from('test_cases')
        .update({ passed: r.result === 'passed' })
        .eq('id', r.test_case_id)
    );

  await Promise.all(updates);

  return jsonResponse({ test_runs: testRuns }, 201);
}

async function handleGetHistory(
  supabase: SupabaseClient,
  featureId: string,
): Promise<Response> {
  const { data, error } = await supabase
    .from('test_runs')
    .select(`
      id,
      test_case_id,
      environment,
      result,
      error_message,
      evidence,
      executed_at,
      executed_by,
      duration_ms,
      test_cases!inner (
        id,
        title,
        test_code,
        feature_id
      )
    `)
    .eq('test_cases.feature_id', featureId)
    .order('executed_at', { ascending: false })
    .limit(50);

  if (error) {
    return errorResponse('DB_ERROR', error.message, 500);
  }

  return jsonResponse({ test_runs: data });
}

async function handleReleaseSummary(
  supabase: SupabaseClient,
  featureId: string,
): Promise<Response> {
  const { data: testCases, error } = await supabase
    .from('test_cases')
    .select('id, passed')
    .eq('feature_id', featureId);

  if (error) {
    return errorResponse('DB_ERROR', error.message, 500);
  }

  const cases = testCases ?? [];
  const total = cases.length;
  const passed = cases.filter((tc: { passed: boolean | null }) => tc.passed === true).length;
  const failed = cases.filter((tc: { passed: boolean | null }) => tc.passed === false).length;
  const notRun = cases.filter((tc: { passed: boolean | null }) => tc.passed === null).length;

  // Get last run timestamp
  const { data: lastRun } = await supabase
    .from('test_runs')
    .select('executed_at, test_cases!inner(feature_id)')
    .eq('test_cases.feature_id', featureId)
    .order('executed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const lastRunAt = lastRun?.executed_at ?? null;
  const isReady = total > 0 && failed === 0 && notRun === 0;

  // Count auto-verified vs human-verified (FR-109 J4)
  const caseIds = cases.map((c: { id: string }) => c.id);
  let autoVerified = 0;
  let humanVerified = 0;

  if (caseIds.length > 0) {
    const { data: latestRuns } = await supabase
      .from('test_runs')
      .select('test_case_id, evidence')
      .in('test_case_id', caseIds)
      .order('executed_at', { ascending: false });

    const seenCases = new Set<string>();
    for (const run of latestRuns ?? []) {
      if (seenCases.has(run.test_case_id)) continue;
      seenCases.add(run.test_case_id);
      const ev = run.evidence as Record<string, unknown> | null;
      if (ev?.type === 'automated') autoVerified++;
      else humanVerified++;
    }
  }

  return jsonResponse({
    total, passed, failed, notRun, lastRunAt, isReady,
    autoVerified, humanVerified,
  });
}

const CreateTestCaseSchema = z.object({
  feature_id: z.string().uuid(),
  title: z.string().min(1),
  steps: z.array(z.string()).min(1),
  expected_result: z.string().min(1),
  test_type: z.string().default('exploratory'),
});

async function handleCreateTestCase(
  supabase: SupabaseClient,
  body: unknown,
  userId: string,
): Promise<Response> {
  const validation = CreateTestCaseSchema.safeParse(body);
  if (!validation.success) {
    const msg = validation.error.errors.map((e) => e.message).join('; ');
    return errorResponse('VALIDATION_ERROR', msg, 400);
  }

  const { feature_id, title, steps, expected_result, test_type } = validation.data;

  // Generate test code
  const { count } = await supabase
    .from('test_cases')
    .select('id', { count: 'exact', head: true })
    .eq('feature_id', feature_id);

  const num = ((count ?? 0) + 1).toString().padStart(3, '0');
  const featureCode = feature_id.slice(0, 8).toUpperCase();
  const testCode = `TC-${featureCode}-${num}`;

  const { data: testCase, error } = await supabase
    .from('test_cases')
    .insert({
      id: crypto.randomUUID(),
      feature_id,
      test_code: testCode,
      title,
      steps: JSON.stringify(steps),
      expected_result: expected_result,
      test_type,
      automated: false,
      created_by: userId,
    })
    .select('id, test_code')
    .single();

  if (error) return errorResponse('DB_ERROR', error.message, 500);
  return jsonResponse({ data: testCase }, 201);
}

// --- Router ---

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const authResult = await authenticateAdmin(req, supabase);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    const url = new URL(req.url);

    if (req.method === 'POST') {
      const action = url.searchParams.get('action');

      if (action === 'create-test-case') {
        const body = await req.json();
        return handleCreateTestCase(supabase, body, userId);
      }

      const rawBody = await req.json();
      const validation = SubmitResultsSchema.safeParse(rawBody);
      if (!validation.success) {
        const msg = validation.error.errors.map((e) => e.message).join('; ');
        return errorResponse('VALIDATION_ERROR', msg, 400);
      }
      return handleSubmitResults(supabase, validation.data, userId);
    }

    if (req.method === 'GET') {
      const featureId = url.searchParams.get('feature_id');
      if (!featureId) {
        return errorResponse('VALIDATION_ERROR', 'feature_id query parameter is required', 400);
      }

      const summary = url.searchParams.get('summary');
      if (summary === 'true') {
        return handleReleaseSummary(supabase, featureId);
      }
      return handleGetHistory(supabase, featureId);
    }

    return errorResponse('METHOD_NOT_ALLOWED', 'Use GET or POST', 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
