-- FR-114: CI Pipeline with AI Auto-Fix
-- Add ci_results column and expand current_stage check constraint

ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS ci_results JSONB;

-- Expand current_stage to include CI stages
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_current_stage_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_current_stage_check
  CHECK (current_stage IN ('implementing', 'build_check', 'build_passed', 'build_failed', 'idle'));
