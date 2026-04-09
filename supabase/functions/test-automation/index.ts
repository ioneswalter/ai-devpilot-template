/**
 * Test Automation API (FR-109 v2 — Two-Tier)
 *
 * POST ?action=generate-scripts     — Categorize criteria + generate API & E2E tests
 * POST ?action=execute-script       — Execute a single E2E test script
 * POST ?action=execute-api-test     — Execute a single API verification test
 * POST ?action=execute-suite        — Execute full two-tier suite (fail-fast)
 * POST ?action=check-staleness      — Check/update script staleness
 * POST ?action=analyze-failures     — Generate failure guidance from test evidence
 * POST ?action=analyze-improvements — Generate improvement recommendations
 * GET  ?action=coverage             — Get two-tier automation coverage metrics
 * GET  ?action=scripts              — List automated scripts for a feature
 * GET  ?action=guidance             — Get failure guidance for a feature
 * GET  ?action=recommendations      — Get improvement recommendations
 * PATCH ?action=update-guidance     — Update guidance status
 * PATCH ?action=update-recommendation — Update recommendation status
 * DELETE ?action=delete-script      — Delete an automated script
 */

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
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

async function authenticateAdmin(
  req: Request,
  supabase: SupabaseClient,
): Promise<{ userId: string } | Response> {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
  }
  const token = authHeader.substring(7);
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return errorResponse('UNAUTHORIZED', 'Invalid token', 401);
  }
  const { data: admin } = await supabase
    .from('admin_users')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (!admin) {
    return errorResponse('FORBIDDEN', 'Admin access required', 403);
  }
  return { userId: user.id };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authResult = await authenticateAdmin(req, supabase);
    if (authResult instanceof Response) return authResult;
    const { userId } = authResult;

    const url = new URL(req.url);
    const action = url.searchParams.get('action');

    if (req.method === 'POST') {
      const body = await req.json();

      if (action === 'generate-scripts') {
        const { handleGenerateScripts } = await import('./generate-scripts.ts');
        return handleGenerateScripts(supabase, body, userId);
      }
      if (action === 'execute-script') {
        const { handleExecuteScript } = await import('./execute-scripts.ts');
        return handleExecuteScript(supabase, body, userId);
      }
      if (action === 'execute-suite') {
        const { handleExecuteSuite } = await import('./execute-scripts.ts');
        return handleExecuteSuite(supabase, body, userId);
      }
      if (action === 'execute-api-test') {
        const { handleExecuteApiTest } = await import('./execute-api-tests.ts');
        return handleExecuteApiTest(supabase, body, userId);
      }
      if (action === 'check-staleness') {
        const { handleCheckStaleness } = await import('./staleness-check.ts');
        return handleCheckStaleness(supabase, body);
      }
      if (action === 'analyze-failures') {
        const { handleAnalyzeFailures } = await import('./failure-analysis.ts');
        return handleAnalyzeFailures(supabase, body, userId);
      }
      if (action === 'analyze-improvements') {
        const { handleAnalyzeImprovements } = await import('./improvement-analysis.ts');
        return handleAnalyzeImprovements(supabase, body, userId);
      }
      return errorResponse('INVALID_ACTION', `Unknown POST action: ${action}`, 400);
    }

    if (req.method === 'GET') {
      const featureId = url.searchParams.get('feature_id');
      if (!featureId) {
        return errorResponse('VALIDATION_ERROR', 'feature_id required', 400);
      }
      if (action === 'coverage') {
        const { handleGetCoverage } = await import('./coverage-metrics.ts');
        return handleGetCoverage(supabase, featureId);
      }
      if (action === 'scripts') {
        const { handleListScripts } = await import('./coverage-metrics.ts');
        return handleListScripts(supabase, featureId);
      }
      if (action === 'guidance') {
        const status = url.searchParams.get('status') || undefined;
        const { handleGetGuidance } = await import('./failure-analysis.ts');
        return handleGetGuidance(supabase, featureId, status);
      }
      if (action === 'recommendations') {
        const status = url.searchParams.get('status') || undefined;
        const { handleGetRecommendations } = await import('./improvement-analysis.ts');
        return handleGetRecommendations(supabase, featureId, status);
      }
      return errorResponse('INVALID_ACTION', `Unknown GET action: ${action}`, 400);
    }

    if (req.method === 'PATCH') {
      const body = await req.json();
      if (action === 'update-guidance') {
        const { handleUpdateGuidance } = await import('./failure-analysis.ts');
        return handleUpdateGuidance(supabase, body);
      }
      if (action === 'update-recommendation') {
        const { handleUpdateRecommendation } = await import('./improvement-analysis.ts');
        return handleUpdateRecommendation(supabase, body);
      }
      return errorResponse('INVALID_ACTION', `Unknown PATCH action: ${action}`, 400);
    }

    if (req.method === 'DELETE') {
      const scriptId = url.searchParams.get('script_id');
      const force = url.searchParams.get('force') === 'true';
      if (!scriptId) {
        return errorResponse('VALIDATION_ERROR', 'script_id required', 400);
      }
      const { handleDeleteScript } = await import('./coverage-metrics.ts');
      return handleDeleteScript(supabase, scriptId, force);
    }

    return errorResponse('METHOD_NOT_ALLOWED', 'Use GET, POST, PATCH, or DELETE', 405);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
