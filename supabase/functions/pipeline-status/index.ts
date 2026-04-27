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
  computeUatStage,
  type SpecReviewRow,
  type ImplRequestRow,
  type PipelineRunRow,
  type TestCaseRow,
  type SpecArtifactRow,
  type FeatureRow,
  type UatPackageRow,
  type UatDecisionRow,
} from './compute-stages.ts';
import { getCurrentVersionId } from '../_shared/version-utils.ts';

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
      .in('status', ['proposed', 'reviewed', 'specified', 'in_development', 'in_testing', 'in_acceptance', 'released']);

    if (featureIdParam) {
      featuresQuery = featuresQuery.eq('id', featureIdParam);
    }

    const { data: features, error: featError } = await featuresQuery;
    if (featError) return errorResponse('DB_ERROR', featError.message, 500);
    if (!features || features.length === 0) {
      return jsonResponse({ pipelines: [] });
    }

    const featureIds = (features as FeatureRow[]).map((f) => f.id);

    // FR-149 v1.1: Get current version IDs for all features
    const versionMap = new Map<string, string | null>();
    const { data: allVersions } = await supabase
      .from('feature_versions')
      .select('id, feature_id, superseded_by, version_number')
      .in('feature_id', featureIds)
      .is('superseded_by', null)
      .order('version_number', { ascending: false });
    for (const v of allVersions ?? []) {
      if (!versionMap.has(v.feature_id)) versionMap.set(v.feature_id, v.id);
    }

    // Batch fetch all stage data in parallel (include feature_version_id).
    // FR-130 v2.0 / J10: also fetch uat_packages (latest per feature) + uat_review_decisions for the UAT tile.
    const [specResult, implResult, testBatch1, testBatch2, artifactResult, pipelineResult, uatPkgResult] = await Promise.all([
      supabase.from('spec_reviews').select('feature_id, feature_version_id, status').in('feature_id', featureIds).order('created_at', { ascending: false }),
      supabase.from('implementation_requests').select('feature_id, feature_version_id, status, code_applied').in('feature_id', featureIds).order('created_at', { ascending: false }),
      supabase.from('test_cases').select('feature_id, feature_version_id, passed').in('feature_id', featureIds).range(0, 999),
      supabase.from('test_cases').select('feature_id, feature_version_id, passed').in('feature_id', featureIds).range(1000, 2999),
      supabase.from('feature_spec_artifacts').select('feature_id, artifact_type').in('feature_id', featureIds),
      supabase.from('pipeline_runs').select('feature_id, feature_version_id, status, current_stage, completed_tasks, total_tasks, deploy_results').in('feature_id', featureIds).order('created_at', { ascending: false }),
      supabase.from('uat_packages').select('id, feature_id, status, due_at, created_at').in('feature_id', featureIds).order('created_at', { ascending: false }),
    ]);

    // FR-130 v2.0: For each latest UAT package per feature, fetch decision counts + checklist totals.
    // Latest = first row per feature_id thanks to created_at DESC sort.
    const latestPackagesByFeature = new Map<string, UatPackageRow>();
    for (const p of (uatPkgResult.data ?? []) as UatPackageRow[]) {
      if (!latestPackagesByFeature.has(p.feature_id)) latestPackagesByFeature.set(p.feature_id, p);
    }
    const latestPackageIds = Array.from(latestPackagesByFeature.values()).map((p) => p.id);
    let uatDecisions: UatDecisionRow[] = [];
    const checklistTotals = new Map<string, number>();
    if (latestPackageIds.length > 0) {
      const [decRes, itemRes] = await Promise.all([
        supabase.from('uat_review_decisions').select('package_id, cycle_number, decision').in('package_id', latestPackageIds),
        supabase.from('uat_checklist_items').select('package_id').in('package_id', latestPackageIds),
      ]);
      uatDecisions = (decRes.data ?? []) as UatDecisionRow[];
      for (const it of itemRes.data ?? []) {
        const pid = it.package_id as string;
        checklistTotals.set(pid, (checklistTotals.get(pid) ?? 0) + 1);
      }
    }
    const allUatPackages = Array.from(latestPackagesByFeature.values());

    const testResult = {
      data: [...(testBatch1.data ?? []), ...(testBatch2.data ?? [])],
      error: testBatch1.error || testBatch2.error,
    };

    if (specResult.error) return errorResponse('DB_ERROR', specResult.error.message, 500);
    if (implResult.error) return errorResponse('DB_ERROR', implResult.error.message, 500);
    if (testResult.error) return errorResponse('DB_ERROR', testResult.error.message, 500);

    // FR-149 v1.1: Filter pipeline records to current version
    const filterByVersion = <T extends { feature_id: string; feature_version_id?: string | null }>(
      records: T[], fid: string,
    ): T[] => {
      const currentVid = versionMap.get(fid);
      if (!currentVid) return records.filter(r => r.feature_id === fid); // unversioned: show all
      // Versioned: show records matching current version OR NULL (pre-versioning records for v1.0)
      return records.filter(r => r.feature_id === fid && (r.feature_version_id === currentVid || r.feature_version_id === null));
    };

    const allSpecs = (specResult.data ?? []) as (SpecReviewRow & { feature_version_id?: string | null })[];
    const allImpls = (implResult.data ?? []) as (ImplRequestRow & { feature_version_id?: string | null })[];
    const allTests = (testResult.data ?? []) as (TestCaseRow & { feature_version_id?: string | null })[];
    const allArtifacts = (artifactResult.data ?? []) as SpecArtifactRow[];
    const allPipelineRuns = (pipelineResult.data ?? []) as (PipelineRunRow & { feature_version_id?: string | null })[];

    // Check version_id from query param for per-version view
    const versionIdParam = url.searchParams.get('version_id');

    const pipelines = (features as FeatureRow[]).map((f) => {
      // If specific version_id requested, filter to that version only
      const filterFn = <T extends { feature_id: string; feature_version_id?: string | null }>(records: T[]): T[] => {
        if (versionIdParam) {
          return records.filter(r => r.feature_id === f.id && (r.feature_version_id === versionIdParam || r.feature_version_id === null));
        }
        return filterByVersion(records, f.id);
      };

      const latestPkg = latestPackagesByFeature.get(f.id);
      const totalChecklist = latestPkg ? checklistTotals.get(latestPkg.id) ?? 0 : 0;
      return {
        feature_id: f.id,
        spec: computeSpecStage(filterFn(allSpecs), allArtifacts, f.id, f.status),
        build: computeBuildStage(filterFn(allImpls), filterFn(allPipelineRuns) as PipelineRunRow[], f.id, f.status),
        test: computeTestStage(filterFn(allTests), f.id),
        uat: computeUatStage(allUatPackages, uatDecisions, totalChecklist, f.id, f.status),
        deploy: computeDeployStage(filterFn(allPipelineRuns) as PipelineRunRow[], f.id, f.status),
      };
    });

    return jsonResponse({ pipelines });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return errorResponse('INTERNAL_ERROR', message, 500);
  }
});
