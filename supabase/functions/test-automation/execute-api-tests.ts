/**
 * API Test Execution Handler (FR-109 v2 Journey 1)
 * Executes API verification tests: setup data → call endpoint → assert → cleanup.
 * Zero browser dependency — pure server-side execution.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { z } from 'https://esm.sh/zod@3.22.4';

const ExecuteSchema = z.object({
  test_id: z.string(),
  environment: z.string().default('development'),
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

function errorResponse(code: string, message: string, status: number): Response {
  return jsonResponse({ error: { code, message } }, status);
}

interface AssertionResult {
  description: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
}

interface NegativeCaseResult {
  description: string;
  expected_status: number;
  actual_status: number;
  passed: boolean;
}

/** Execute setup SQL statements */
async function runSqlStatements(supabase: SupabaseClient, statements: string[]): Promise<boolean> {
  for (const sql of statements) {
    if (!sql?.trim()) continue;
    const { error } = await supabase.rpc('exec_sql', { sql_text: sql });
    if (error) {
      console.error('[API Test] SQL error:', error.message, 'SQL:', sql.substring(0, 100));
      return false;
    }
  }
  return true;
}

/** Call an Edge Function endpoint and return response */
async function callEndpoint(
  baseUrl: string,
  endpoint: string,
  method: string,
  body: Record<string, unknown>,
  authToken: string
): Promise<{ status: number; body: unknown; duration_ms: number }> {
  // For GET endpoints with query params already in the endpoint string, append body as query params
  let url = `${baseUrl}/functions/v1/${endpoint.replace(/^\//, '')}`;
  if (method === 'GET' && Object.keys(body).length > 0) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) params.set(k, String(v));
    url += (url.includes('?') ? '&' : '?') + params.toString();
  }
  const start = Date.now();

  const anonKey =
    Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      apikey: anonKey,
    },
    body: method !== 'GET' ? JSON.stringify(body) : undefined,
  });

  const responseBody = await response.json().catch(() => null);
  return { status: response.status, body: responseBody, duration_ms: Date.now() - start };
}

/** Check assertions against API response */
function checkResponseAssertions(
  assertions: {
    status: number;
    response_match: Record<string, unknown>;
    db_assertions?: unknown[];
  },
  actual: { status: number; body: unknown }
): AssertionResult[] {
  const results: AssertionResult[] = [];

  results.push({
    description: `Status code is ${assertions.status}`,
    expected: assertions.status,
    actual: actual.status,
    passed: actual.status === assertions.status,
  });

  for (const [path, expected] of Object.entries(assertions.response_match || {})) {
    const actualValue = getNestedValue(actual.body, path);

    // null expected = "exists" check (value is defined and not null/undefined)
    if (expected === null) {
      results.push({
        description: `Response ${path} exists`,
        expected: '(any non-null value)',
        actual: actualValue,
        passed: actualValue !== undefined && actualValue !== null,
      });
    } else {
      results.push({
        description: `Response ${path} equals ${JSON.stringify(expected)}`,
        expected,
        actual: actualValue,
        passed: JSON.stringify(actualValue) === JSON.stringify(expected),
      });
    }
  }

  return results;
}

/** Get a nested value from an object using dot notation */
function getNestedValue(obj: unknown, path: string): unknown {
  return path.split('.').reduce((current: unknown, key) => {
    if (current && typeof current === 'object') {
      return (current as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

/** Check database assertions */
async function checkDbAssertions(
  supabase: SupabaseClient,
  dbAssertions: Array<{ query: string; expected: unknown; description: string }>
): Promise<AssertionResult[]> {
  const results: AssertionResult[] = [];
  for (const assertion of dbAssertions) {
    try {
      const { data, error } = await supabase.rpc('exec_sql', { sql_text: assertion.query });
      const actual = error ? `ERROR: ${error.message}` : data;

      // null expected = "exists" check (result is defined and not error)
      const passed =
        assertion.expected === null
          ? actual !== undefined && actual !== null && !String(actual).startsWith('ERROR:')
          : JSON.stringify(actual) === JSON.stringify(assertion.expected);

      results.push({
        description: assertion.description,
        expected: assertion.expected === null ? '(any non-error result)' : assertion.expected,
        actual,
        passed,
      });
    } catch (err) {
      results.push({
        description: assertion.description,
        expected: assertion.expected,
        actual: `ERROR: ${err instanceof Error ? err.message : 'Unknown'}`,
        passed: false,
      });
    }
  }
  return results;
}

/** Run negative test cases (permission/validation failures) */
async function runNegativeCases(
  baseUrl: string,
  endpoint: string,
  method: string,
  negativeCases: Array<{
    description: string;
    auth_context: { type: string };
    request_body: Record<string, unknown>;
    expected_status: number;
  }>
): Promise<NegativeCaseResult[]> {
  const results: NegativeCaseResult[] = [];
  for (const nc of negativeCases) {
    try {
      const token =
        nc.auth_context.type === 'anon' ? '' : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
      const resp = await callEndpoint(baseUrl, endpoint, method, nc.request_body, token);
      results.push({
        description: nc.description,
        expected_status: nc.expected_status,
        actual_status: resp.status,
        passed: resp.status === nc.expected_status,
      });
    } catch {
      results.push({
        description: nc.description,
        expected_status: nc.expected_status,
        actual_status: 0,
        passed: false,
      });
    }
  }
  return results;
}

export async function handleExecuteApiTest(
  supabase: SupabaseClient,
  body: unknown,
  userId: string,
  callerToken?: string
): Promise<Response> {
  const validation = ExecuteSchema.safeParse(body);
  if (!validation.success) return errorResponse('VALIDATION_ERROR', validation.error.message, 400);

  const { test_id } = validation.data;
  const { data: test } = await supabase
    .from('api_verification_tests')
    .select('*')
    .eq('id', test_id)
    .single();

  if (!test) return errorResponse('TEST_NOT_FOUND', 'API test not found', 404);
  if (test.is_stale) return errorResponse('TEST_STALE', 'Test is stale — regenerate first', 422);

  const baseUrl = Deno.env.get('SUPABASE_URL') || '';
  // Use caller's token for target endpoint auth (user JWT from browser), fall back to service key
  const serviceToken = callerToken || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const startTime = Date.now();
  let setupSuccess = false;
  let cleanupSuccess = false;

  // v2 T020: Inject unique run prefix for collision safety
  const runPrefix = `run_${Date.now()}_`;
  const injectPrefix = (stmts: string[]) =>
    stmts.map((s: string) => s.replace(/test_prefix_/g, `test_${runPrefix}`));

  try {
    // 1. Setup test data (with unique run prefix)
    setupSuccess = await runSqlStatements(supabase, injectPrefix(test.setup_sql || []));

    // 2. Call the endpoint
    const apiResult = await callEndpoint(
      baseUrl,
      test.endpoint,
      test.method,
      test.request_body || {},
      serviceToken
    );

    // 3. Check response assertions
    const responseAssertions = checkResponseAssertions(test.assertions, apiResult);

    // 4. Check DB assertions
    const dbAssertions = await checkDbAssertions(supabase, test.assertions?.db_assertions || []);
    const allAssertions = [...responseAssertions, ...dbAssertions];

    // 5. Run negative cases
    const negativeCaseResults = await runNegativeCases(
      baseUrl,
      test.endpoint,
      test.method,
      test.negative_cases || []
    );

    // 6. Determine overall result
    const allPassed =
      allAssertions.every((a) => a.passed) && negativeCaseResults.every((n) => n.passed);
    const result = allPassed ? 'passed' : 'failed';

    // 7. Record result
    const failureCount = result === 'passed' ? 0 : (test.failure_count || 0) + 1;
    await supabase
      .from('api_verification_tests')
      .update({
        last_run_result: result,
        last_run_at: new Date().toISOString(),
        failure_count: failureCount,
      })
      .eq('id', test_id);

    // Sync test_cases.passed so the status view reflects the API result
    await supabase
      .from('test_cases')
      .update({ passed: result === 'passed' })
      .eq('id', test.test_case_id);

    // FR-145 release-gate evidence: every API run MUST write a test_runs row.
    // Without this, api_verification_tests.last_run_result tracks the result but the
    // verifier (which reads test_runs) cannot see API evidence.
    await supabase.from('test_runs').insert({
      id: crypto.randomUUID(),
      test_case_id: test.test_case_id,
      environment: 'development',
      result,
      duration_ms: Date.now() - startTime,
      error_message:
        result === 'passed'
          ? null
          : `${allAssertions.filter((a) => !a.passed).length} assertion(s) failed`,
      evidence: {
        type: 'api',
        test_id,
        endpoint: test.endpoint,
        method: test.method,
        status: apiResult.status,
        assertions: allAssertions,
        negative_cases: negativeCaseResults,
        setup_success: setupSuccess,
      },
      executed_by: userId,
      executed_at: new Date().toISOString(),
    });

    return jsonResponse({
      data: {
        test_id,
        test_case_id: test.test_case_id,
        result,
        duration_ms: Date.now() - startTime,
        setup_success: setupSuccess,
        api_call: {
          endpoint: test.endpoint,
          method: test.method,
          status: apiResult.status,
          response_body: apiResult.body,
          duration_ms: apiResult.duration_ms,
        },
        assertions: allAssertions,
        negative_cases: negativeCaseResults,
        cleanup_success: cleanupSuccess,
      },
    });
  } finally {
    // Always cleanup (with same run prefix)
    cleanupSuccess = await runSqlStatements(supabase, injectPrefix(test.cleanup_sql || []));
  }
}
