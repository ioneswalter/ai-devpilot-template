/**
 * Pipeline Bar type definitions.
 * Computed entities for the DevPilot Pipeline Bar (FR-111).
 */

/** Visual status of a single pipeline stage */
export type StageStatusValue = 'not_started' | 'in_progress' | 'completed' | 'warning' | 'escalated';

/** Status object for one pipeline stage */
export interface StageStatus {
  status: StageStatusValue;
  label: string;
}

/** Pipeline state for a single feature (all four stages) */
export interface FeaturePipelineState {
  feature_id: string;
  spec: StageStatus;
  build: StageStatus;
  test: StageStatus;
  deploy: StageStatus;
}

/** Batch response from the pipeline-status Edge Function */
export interface PipelineStatusResponse {
  pipelines: FeaturePipelineState[];
}

/** The four pipeline stage names */
export type PipelineStageName = 'spec' | 'build' | 'test' | 'deploy';

/** Stage display metadata */
export const STAGE_CONFIG: Record<PipelineStageName, { label: string; icon: string }> = {
  spec: { label: 'Spec', icon: 'document' },
  build: { label: 'Build', icon: 'cog' },
  test: { label: 'Test', icon: 'check-circle' },
  deploy: { label: 'Deploy', icon: 'rocket' },
};

/** Feature statuses that show the pipeline bar */
export const PIPELINE_VISIBLE_STATUSES = ['proposed', 'reviewed', 'specified', 'in_development', 'in_testing', 'released'] as const;
