/**
 * Pipeline Status API — Batch pipeline stage statuses for all features.
 *
 * GET /pipeline-status            — All features
 * GET /pipeline-status?feature_id=xxx — Single feature
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import {
  computeSpecStage,
  computeBuildStage,
  computeTestStage,
  computeDeployStage,
  type SpecReviewRow,
  type ImplRequestRow,
  type PipelineRunRow,
  type TestCaseRow,
  type SpecArtifactRow,
  type FeatureRow,
} from './compute-stages.ts';

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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return errorResponse('UNAUTHORIZED', 'Missing authorization token', 401);
    }
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.substring(7));
    if (authError || !user) {
      return errorResponse('UNAUTHORIZED', 'Invalid authentication token', 401);
    }

    const url = new URL(req.url);
    const featureIdParam = url.searchParams.get('feature_id');

    let featuresQuery = supabase
      .from('product_features')
      .select('id, status')
      .in('status', ['proposed', 'reviewed', 'approved', 'in_development', 'in_testing', 'released']);

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
    const [specResult, implResult, testBatch1, testBatch2, artifactResult, pipelineResult] = await Promise.all([
      supabase.from('spec_reviews').select('feature_id, status').in('feature_id', featureIds).order('created_at', { ascending: false }),
      supabase.from('implementation_requests').select('feature_id, status, code_applied').in('feature_id', featureIds).order('created_at', { ascending: false }),
      supabase.from('test_cases').select('feature_id, passed').in('feature_id', featureIds).range(0, 999),
      supabase.from('test_cases').select('feature_id, passed').in('feature_id', featureIds).range(1000, 2999),
      supabase.from('feature_spec_artifacts').select('feature_id, artifact_type').in('feature_id', featureIds),
      supabase.from('pipeline_runs').select('feature_id, status, current_stage, completed_tasks, total_tasks, deploy_results').in('feature_id', featureIds).order('created_at', { ascending: false }),
    ]);

    const testResult = {
      data: [...(testBatch1.data ?? []), ...(testBatch2.data ?? [])],
      error: testBatch1.error || testBatch2.error,
    };

    if (specResult.error) return errorResponse('DB_ERROR', specResult.error.message, 500);
    if (implResult.error) return errorResponse('DB_ERROR', implResult.error.message, 500);
    if (testResult.error) return errorResponse('DB_ERROR', testResult.error.message, 500);

    const allSpecs = (specResult.data ?? []) as SpecReviewRow[];
    const allImpls = (implResult.data ?? []) as ImplRequestRow[];
    const allArtifacts = (artifactResult.data ?? []) as SpecArtifactRow[];
    const allPipelineRuns = (pipelineResult.data ?? []) as PipelineRunRow[];

    const pipelines = (features as FeatureRow[]).map((f) => ({
      feature_id: f.id,
      spec: computeSpecStage(allSpecs, allArtifacts, f.id, f.status),
      build: computeBuildStage(allImpls, allPipelineRuns, f.id, f.status),
      test: computeTestStage((testResult.data ?? []) as TestCaseRow[], f.id),
      deploy: computeDeployStage(allPipelineRuns, f.id, f.status),
    }));

    return jsonResponse({ pipelines });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
