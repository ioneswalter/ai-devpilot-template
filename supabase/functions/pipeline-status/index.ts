/**
 * Pipeline Status API — Batch pipeline stage statuses for all features.
 *
 * GET /pipeline-status            — All features
 * GET /pipeline-status?feature_id=xxx — Single feature
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

interface SpecReviewRow {
  feature_id: string;
  status: string;
}

interface ImplRequestRow {
  feature_id: string;
  status: string;
}

interface TestCaseRow {
  feature_id: string;
  passed: boolean | null;
}

interface FeatureRow {
  id: string;
  status: string;
}

interface StageStatus {
  status: 'not_started' | 'in_progress' | 'completed' | 'warning';
  label: string;
}

function computeSpecStage(reviews: SpecReviewRow[], featureId: string): StageStatus {
  const review = reviews.find((r) => r.feature_id === featureId);
  if (!review) return { status: 'not_started', label: 'Not Started' };
  if (review.status === 'in_review') return { status: 'in_progress', label: 'In Review' };
  if (review.status === 'approved') return { status: 'completed', label: 'Approved' };
  if (review.status === 'sent_back') return { status: 'warning', label: 'Sent Back' };
  return { status: 'not_started', label: 'Not Started' };
}

function computeBuildStage(impls: ImplRequestRow[], featureId: string): StageStatus {
  const impl = impls.find((r) => r.feature_id === featureId);
  if (!impl) return { status: 'not_started', label: 'Not Started' };
  if (impl.status === 'pending' || impl.status === 'in_progress') {
    return { status: 'in_progress', label: 'Building' };
  }
  if (impl.status === 'completed') return { status: 'completed', label: 'Completed' };
  if (impl.status === 'failed') return { status: 'warning', label: 'Failed' };
  return { status: 'not_started', label: 'Not Started' };
}

function computeTestStage(testCases: TestCaseRow[], featureId: string): StageStatus {
  const cases = testCases.filter((tc) => tc.feature_id === featureId);
  if (cases.length === 0) return { status: 'not_started', label: 'No Tests' };

  const allNull = cases.every((tc) => tc.passed === null);
  if (allNull) return { status: 'not_started', label: 'Not Run' };

  const failed = cases.filter((tc) => tc.passed === false).length;
  if (failed > 0) {
    return { status: 'warning', label: `${failed}/${cases.length} failed` };
  }

  const passed = cases.filter((tc) => tc.passed === true).length;
  const total = cases.length;
  if (passed === total) return { status: 'completed', label: 'All Passed' };

  return { status: 'in_progress', label: `${passed}/${total} passed` };
}

function computeDeployStage(featureStatus: string): StageStatus {
  if (featureStatus === 'proposed') return { status: 'not_started', label: 'Proposed' };
  if (featureStatus === 'approved') return { status: 'not_started', label: 'Approved' };
  if (featureStatus === 'in_development') return { status: 'in_progress', label: 'In Development' };
  if (featureStatus === 'released') return { status: 'completed', label: 'Released' };
  if (featureStatus === 'deprecated') return { status: 'warning', label: 'Deprecated' };
  return { status: 'not_started', label: featureStatus };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return errorResponse('METHOD_NOT_ALLOWED', 'Use GET', 405);
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Auth — any authenticated user can read pipeline status
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.substring(7),
    );
    if (authError || !user) {
      return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);
    }

    const url = new URL(req.url);
    const featureIdParam = url.searchParams.get('feature_id');

    // Fetch features (only pipeline-visible statuses)
    let featuresQuery = supabase
      .from('product_features')
      .select('id, status')
      .in('status', ['approved', 'in_development', 'released']);

    if (featureIdParam) {
      featuresQuery = featuresQuery.eq('id', featureIdParam);
    }

    const { data: features, error: featError } = await featuresQuery;
    if (featError) return errorResponse('DB_ERROR', featError.message, 500);
    if (!features || features.length === 0) {
      return jsonResponse({ pipelines: [] });
    }

    const featureIds = (features as FeatureRow[]).map((f) => f.id);

    // Batch fetch all stage data in parallel
    const [specResult, implResult, testResult] = await Promise.all([
      supabase
        .from('spec_reviews')
        .select('feature_id, status')
        .in('feature_id', featureIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('implementation_requests')
        .select('feature_id, status')
        .in('feature_id', featureIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('test_cases')
        .select('feature_id, passed')
        .in('feature_id', featureIds),
    ]);

    if (specResult.error) return errorResponse('DB_ERROR', specResult.error.message, 500);
    if (implResult.error) return errorResponse('DB_ERROR', implResult.error.message, 500);
    if (testResult.error) return errorResponse('DB_ERROR', testResult.error.message, 500);

    // Deduplicate spec_reviews and impl_requests to latest per feature
    const latestSpecs = deduplicateByFeature(specResult.data as SpecReviewRow[]);
    const latestImpls = deduplicateByFeature(implResult.data as ImplRequestRow[]);

    const pipelines = (features as FeatureRow[]).map((f) => ({
      feature_id: f.id,
      spec: computeSpecStage(latestSpecs, f.id),
      build: computeBuildStage(latestImpls, f.id),
      test: computeTestStage((testResult.data ?? []) as TestCaseRow[], f.id),
      deploy: computeDeployStage(f.status),
    }));

    return jsonResponse({ pipelines });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});

/** Keep only the first (latest) record per feature_id — assumes descending order */
function deduplicateByFeature<T extends { feature_id: string }>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.feature_id)) return false;
    seen.add(row.feature_id);
    return true;
  });
}
