/**
 * Pipeline Bar type definitions.
 * Computed entities for the DevPilot Pipeline Bar (FR-111).
 */

/** Visual status of a single pipeline stage */
export type StageStatusValue =
  | 'not_started'
  | 'in_progress'
  | 'completed'
  | 'warning'
  | 'escalated';

/** Status object for one pipeline stage */
export interface StageStatus {
  status: StageStatusValue;
  label: string;
}

/** UAT-specific tile metadata (FR-130 v2.0 / J10). Extends the basic StageStatus with cycle, decision counts, SLA. */
export interface UatStageDetail extends StageStatus {
  /** uat_packages.status for the latest package: 'in_review' | 'approved' | 'rejected' | null when no package */
  packageStatus: string | null;
  /** Current cycle number (max cycle_number across uat_review_decisions for the package) */
  cycleNumber: number;
  /** Per-decision counts across CURRENT cycle items */
  decisionCounts: { pass: number; fail: number; defer: number; pending: number };
  /** ISO timestamp from uat_packages.due_at; null when no SLA applies */
  dueAt: string | null;
}

/** Pipeline state for a single feature (all five stages) */
export interface FeaturePipelineState {
  feature_id: string;
  spec: StageStatus;
  build: StageStatus;
  test: StageStatus;
  uat: UatStageDetail;
  deploy: StageStatus;
}

/** Batch response from the pipeline-status Edge Function */
export interface PipelineStatusResponse {
  pipelines: FeaturePipelineState[];
}

/** The five pipeline stage names */
export type PipelineStageName = 'spec' | 'build' | 'test' | 'uat' | 'deploy';

/** Stage display metadata */
export const STAGE_CONFIG: Record<PipelineStageName, { label: string; icon: string }> = {
  spec: { label: 'Spec', icon: 'document' },
  build: { label: 'Build', icon: 'cog' },
  test: { label: 'Test', icon: 'check-circle' },
  uat: { label: 'UAT', icon: 'badge-check' },
  deploy: { label: 'Deploy', icon: 'rocket' },
};

/** Feature statuses that show the pipeline bar (in_acceptance added FR-130 v2.0 / J10) */
export const PIPELINE_VISIBLE_STATUSES = [
  'proposed',
  'reviewed',
  'specified',
  'in_development',
  'in_testing',
  'in_acceptance',
  'released',
] as const;
