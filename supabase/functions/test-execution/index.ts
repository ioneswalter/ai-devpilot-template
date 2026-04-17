/**
 * Test Execution API
 *
 * POST /test-execution — Submit test results for a feature
 * GET  /test-execution?feature_id=xxx — Get test run history
 * GET  /test-execution?feature_id=xxx&summary=true — Release readiness summary
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { corsHeaders, errorResponse, authenticateAdmin, SubmitResultsSchema } from './auth.ts';
import {
  handleSubmitResults,
  handleGetHistory,
  handleReleaseSummary,
  handleCreateTestCase,
} from './handlers.ts';

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
