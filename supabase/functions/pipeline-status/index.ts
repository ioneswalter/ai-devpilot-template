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
  code_applied: boolean | null;
}

interface DeployResultsRow {
  overall_status: string;
}

interface PipelineRunRow {
  feature_id: string;
  status: string;
  completed_tasks: number;
  total_tasks: number;
  deploy_results: DeployResultsRow | null;
}

interface TestCaseRow {
  feature_id: string;
  passed: boolean | null;
}

interface SpecArtifactRow {
  feature_id: string;
  artifact_type: string;
}

interface FeatureRow {
  id: string;
  status: string;
}

interface StageStatus {
  status: 'not_started' | 'in_progress' | 'completed' | 'warning';
  label: string;
}

function computeSpecStage(
  reviews: SpecReviewRow[],
  artifacts: SpecArtifactRow[],
  featureId: string,
  featureStatus?: string,
): StageStatus {
  // Features in testing or released have completed spec by definition
  if (featureStatus === 'in_testing' || featureStatus === 'released') {
    return { status: 'completed', label: 'Approved' };
  }

  // Check ALL spec reviews for this feature (not just latest)
  const featureReviews = reviews.filter((r) => r.feature_id === featureId);

  // If any review is approved → completed
  if (featureReviews.some((r) => r.status === 'approved')) {
    return { status: 'completed', label: 'Approved' };
  }
  // If any is in review → in progress
  if (featureReviews.some((r) => r.status === 'in_review')) {
    return { status: 'in_progress', label: 'In Review' };
  }
  // If sent back → warning
  if (featureReviews.some((r) => r.status === 'sent_back')) {
    return { status: 'warning', label: 'Sent Back' };
  }

  // Check for SpecKit artifacts from DevPilot — spec.md generated means spec draft exists
  const featureArtifacts = artifacts.filter((a) => a.feature_id === featureId);
  const hasSpec = featureArtifacts.some((a) => a.artifact_type === 'spec');
  if (hasSpec) {
    return { status: 'in_progress', label: 'Draft (DevPilot)' };
  }

  // Proposal review gate: reviewed features are ready for spec generation
  if (featureStatus === 'reviewed') {
    return { status: 'not_started', label: 'Reviewed' };
  }

  if (featureReviews.length === 0) return { status: 'not_started', label: 'Not Started' };
  return { status: 'not_started', label: 'Not Started' };
}

function computeBuildStage(
  impls: ImplRequestRow[],
  pipelineRuns: PipelineRunRow[],
  featureId: string,
  featureStatus: string,
): StageStatus {
  const featureImpls = impls.filter((r) => r.feature_id === featureId);
  const featurePipelines = pipelineRuns.filter((r) => r.feature_id === featureId);

  // FR-113: Check server-side pipeline status first
  const runningPipeline = featurePipelines.find((p) => p.status === 'running');
  if (runningPipeline) {
    const pct = runningPipeline.total_tasks > 0
      ? Math.round((runningPipeline.completed_tasks / runningPipeline.total_tasks) * 100)
      : 0;
    return { status: 'in_progress', label: `Pipeline ${pct}%` };
  }

  // If any request is completed/implemented with code applied → completed
  if (featureImpls.some((r) => (r.status === 'completed' || r.status === 'implemented') && r.code_applied)) {
    return { status: 'completed', label: 'Completed' };
  }

  // Pipeline completed but code not yet applied
  if (featurePipelines.some((p) => p.status === 'completed')) {
    return { status: 'in_progress', label: 'Pipeline Done' };
  }

  // If completed but code not applied → plan ready (in_progress)
  if (featureImpls.some((r) => r.status === 'completed' || r.status === 'implemented')) {
    return { status: 'in_progress', label: 'Plan Ready' };
  }
  // If any is in progress → building
  if (featureImpls.some((r) => r.status === 'pending' || r.status === 'in_progress' || r.status === 'implementing')) {
    return { status: 'in_progress', label: 'Building' };
  }

  // Pipeline failed/cancelled
  if (featurePipelines.some((p) => p.status === 'failed' || p.status === 'timed_out')) {
    return { status: 'warning', label: 'Pipeline Failed' };
  }
  if (featureImpls.some((r) => r.status === 'failed')) {
    return { status: 'warning', label: 'Failed' };
  }

  if (featureStatus === 'released') return { status: 'completed', label: 'Completed' };
  if (featureStatus === 'in_testing') return { status: 'completed', label: 'Completed' };
  if (featureStatus === 'in_development') return { status: 'in_progress', label: 'In Progress' };

  return { status: 'not_started', label: 'Not Started' };
}

function computeTestStage(testCases: TestCaseRow[], featureId: string): StageStatus {
  const cases = testCases.filter((tc) => tc.feature_id === featureId);
  if (cases.length === 0) return { status: 'not_started', label: 'Not Started' };

  const allNull = cases.every((tc) => tc.passed === null);
  if (allNull) return { status: 'not_started', label: 'Not Run' };

  const passed = cases.filter((tc) => tc.passed === true).length;
  const failed = cases.filter((tc) => tc.passed === false).length;
  const total = cases.length;

  if (failed > 0) return { status: 'warning', label: `${passed}/${total} passed` };
  if (passed === total) return { status: 'completed', label: 'All Passed' };
  return { status: 'in_progress', label: `${passed}/${total} passed` };
}

function computeDeployStage(
  pipelineRuns: PipelineRunRow[],
  featureId: string,
  featureStatus: string,
): StageStatus {
  if (featureStatus === 'released') return { status: 'completed', label: 'Released' };
  if (featureStatus === 'deprecated') return { status: 'warning', label: 'Deprecated' };
  const run = pipelineRuns.find((r) => r.feature_id === featureId && r.deploy_results);
  if (run?.deploy_results?.overall_status === 'success') {
    return { status: 'completed', label: 'Deployed' };
  }
  return { status: 'not_started', label: 'Not Started' };
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

    // Fetch features (pipeline-visible statuses — includes proposed for SpecKit integration)
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

    // Batch fetch all stage data in parallel (includes SpecKit artifacts + pipeline runs)
    const [specResult, implResult, testResult, artifactResult, pipelineResult] = await Promise.all([
      supabase
        .from('spec_reviews')
        .select('feature_id, status')
        .in('feature_id', featureIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('implementation_requests')
        .select('feature_id, status, code_applied')
        .in('feature_id', featureIds)
        .order('created_at', { ascending: false }),
      supabase
        .from('test_cases')
        .select('feature_id, passed')
        .in('feature_id', featureIds),
      supabase
        .from('feature_spec_artifacts')
        .select('feature_id, artifact_type')
        .in('feature_id', featureIds),
      supabase
        .from('pipeline_runs')
        .select('feature_id, status, completed_tasks, total_tasks, deploy_results')
        .in('feature_id', featureIds)
        .order('created_at', { ascending: false }),
    ]);

    if (specResult.error) return errorResponse('DB_ERROR', specResult.error.message, 500);
    if (implResult.error) return errorResponse('DB_ERROR', implResult.error.message, 500);
    if (testResult.error) return errorResponse('DB_ERROR', testResult.error.message, 500);
    // Artifact fetch is non-blocking — default to empty if it fails
    const allArtifacts = (artifactResult.data ?? []) as SpecArtifactRow[];

    const allSpecs = (specResult.data ?? []) as SpecReviewRow[];
    const allImpls = (implResult.data ?? []) as ImplRequestRow[];
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

