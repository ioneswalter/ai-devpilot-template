/**
 * Pipeline stage computation functions (FR-113)
 * Pure functions that compute stage status from DB rows.
 */

export interface SpecReviewRow {
  feature_id: string;
  feature_version_id?: string | null; // FR-149 v1.1
  status: string;
}

export interface ImplRequestRow {
  feature_id: string;
  feature_version_id?: string | null; // FR-149 v1.1
  status: string;
  code_applied: boolean | null;
}

export interface DeployResultsRow {
  overall_status: string;
}

export interface PipelineRunRow {
  feature_id: string;
  feature_version_id?: string | null; // FR-149 v1.1
  status: string;
  current_stage: string;
  completed_tasks: number;
  total_tasks: number;
  deploy_results: DeployResultsRow | null;
}

export interface TestCaseRow {
  feature_id: string;
  feature_version_id?: string | null; // FR-149 v1.1
  passed: boolean | null;
}

export interface SpecArtifactRow {
  feature_id: string;
  artifact_type: string;
}

export interface FeatureRow {
  id: string;
  status: string;
}

export interface StageStatus {
  status: 'not_started' | 'in_progress' | 'completed' | 'warning' | string;
  label: string;
}

export function computeSpecStage(
  reviews: SpecReviewRow[],
  artifacts: SpecArtifactRow[],
  featureId: string,
  featureStatus?: string,
): StageStatus {
  if (featureStatus === 'in_testing' || featureStatus === 'released') {
    return { status: 'completed', label: 'Approved' };
  }

  const featureReviews = reviews.filter((r) => r.feature_id === featureId);

  if (featureReviews.some((r) => r.status === 'approved')) {
    return { status: 'completed', label: 'Approved' };
  }
  if (featureReviews.some((r) => r.status === 'in_review')) {
    return { status: 'in_progress', label: 'In Review' };
  }
  if (featureReviews.some((r) => r.status === 'sent_back')) {
    return { status: 'warning', label: 'Sent Back' };
  }

  const featureArtifacts = artifacts.filter((a) => a.feature_id === featureId);
  const hasSpec = featureArtifacts.some((a) => a.artifact_type === 'spec');
  if (hasSpec) {
    return { status: 'in_progress', label: 'Draft (DevPilot)' };
  }

  if (featureStatus === 'reviewed') {
    return { status: 'not_started', label: 'Reviewed' };
  }

  return { status: 'not_started', label: 'Not Started' };
}

export function computeBuildStage(
  impls: ImplRequestRow[],
  pipelineRuns: PipelineRunRow[],
  featureId: string,
  featureStatus: string,
): StageStatus {
  const featureImpls = impls.filter((r) => r.feature_id === featureId);
  const featurePipelines = pipelineRuns.filter((r) => r.feature_id === featureId);

  const runningPipeline = featurePipelines.find((p) => p.status === 'running');
  if (runningPipeline) {
    const pct = runningPipeline.total_tasks > 0
      ? Math.round((runningPipeline.completed_tasks / runningPipeline.total_tasks) * 100)
      : 0;
    return { status: 'in_progress', label: `Pipeline ${pct}%` };
  }

  if (featureImpls.some((r) => (r.status === 'completed' || r.status === 'implemented') && r.code_applied)) {
    return { status: 'completed', label: 'Completed' };
  }
  if (featurePipelines.some((p) => p.status === 'completed')) {
    return { status: 'in_progress', label: 'Pipeline Done' };
  }
  if (featureImpls.some((r) => r.status === 'completed' || r.status === 'implemented')) {
    return { status: 'in_progress', label: 'Plan Ready' };
  }
  if (featureImpls.some((r) => r.status === 'pending' || r.status === 'in_progress' || r.status === 'implementing')) {
    return { status: 'in_progress', label: 'Building' };
  }
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

export function computeTestStage(
  testCases: TestCaseRow[],
  featureId: string,
): StageStatus {
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

export interface UatPackageRow {
  id: string;
  feature_id: string;
  status: string;
  due_at: string | null;
  created_at: string;
}

export interface UatDecisionRow {
  package_id: string;
  cycle_number: number;
  decision: string;
}

export interface UatStageDetail extends StageStatus {
  packageStatus: string | null;
  cycleNumber: number;
  decisionCounts: { pass: number; fail: number; defer: number; pending: number };
  dueAt: string | null;
}

/**
 * FR-130 v2.0 / J10: compute UAT pipeline tile state.
 *
 * Picks the latest UAT package per feature, derives the cycle number from the
 * highest cycle in uat_review_decisions, and aggregates per-decision counts
 * across that cycle's items. SLA overdue is reflected in the label only;
 * the consumer renders the overdue badge from packageStatus + dueAt.
 */
export function computeUatStage(
  packages: UatPackageRow[],
  decisions: UatDecisionRow[],
  totalChecklistItems: number,
  featureId: string,
  featureStatus: string,
): UatStageDetail {
  const featurePackages = packages.filter((p) => p.feature_id === featureId);
  const latest = featurePackages.length > 0 ? featurePackages[0] : null;

  if (!latest) {
    return {
      status: featureStatus === 'released' ? 'completed' : 'not_started',
      label: featureStatus === 'released' ? 'Released' : 'Not Started',
      packageStatus: null,
      cycleNumber: 0,
      decisionCounts: { pass: 0, fail: 0, defer: 0, pending: 0 },
      dueAt: null,
    };
  }

  const pkgDecisions = decisions.filter((d) => d.package_id === latest.id);
  const maxCycle = pkgDecisions.reduce((m, d) => Math.max(m, d.cycle_number), 0);
  const currentCycleDecisions = pkgDecisions.filter((d) => d.cycle_number === maxCycle);
  const counts = { pass: 0, fail: 0, defer: 0, pending: 0 };
  for (const d of currentCycleDecisions) {
    if (d.decision === 'pass') counts.pass++;
    else if (d.decision === 'fail') counts.fail++;
    else if (d.decision === 'defer') counts.defer++;
  }
  counts.pending = Math.max(0, totalChecklistItems - counts.pass - counts.fail - counts.defer);

  const cycleLabel = maxCycle > 1 ? ` · Cycle ${maxCycle}` : '';
  if (latest.status === 'approved') {
    return { status: 'completed', label: `Approved${cycleLabel}`, packageStatus: 'approved', cycleNumber: maxCycle || 1, decisionCounts: counts, dueAt: latest.due_at };
  }
  if (latest.status === 'rejected') {
    return { status: 'warning', label: `Rejected${cycleLabel}`, packageStatus: 'rejected', cycleNumber: maxCycle || 1, decisionCounts: counts, dueAt: latest.due_at };
  }
  // in_review
  const overdue = latest.due_at !== null && new Date(latest.due_at).getTime() < Date.now();
  const label = overdue ? `Overdue${cycleLabel}` : `In Review${cycleLabel}`;
  return {
    status: overdue ? 'warning' : 'in_progress',
    label,
    packageStatus: 'in_review',
    cycleNumber: maxCycle || 1,
    decisionCounts: counts,
    dueAt: latest.due_at,
  };
}

export function computeDeployStage(
  pipelineRuns: PipelineRunRow[],
  featureId: string,
  featureStatus: string,
): StageStatus {
  if (featureStatus === 'released') return { status: 'completed', label: 'Released' };
  if (featureStatus === 'deprecated') return { status: 'warning', label: 'Deprecated' };
  const run = pipelineRuns.find((r) => r.feature_id === featureId && r.deploy_results);
  if (run?.deploy_results?.overall_status === 'success') {
    if (featureStatus === 'in_testing') {
      return { status: 'in_progress', label: 'Ready to Deploy' };
    }
    return { status: 'completed', label: 'Deployed' };
  }
  if (run?.current_stage === 'escalated') {
    return { status: 'escalated', label: 'Escalated' };
  }
  if (run?.current_stage === 'deploying') {
    return { status: 'in_progress', label: 'Deploying' };
  }
  if (run?.current_stage === 'deploy_failed') {
    return { status: 'warning', label: 'Failed' };
  }
  return { status: 'not_started', label: 'Not Started' };
}
