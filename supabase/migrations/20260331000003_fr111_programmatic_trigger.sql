-- FR-111: Add programmatic triggering support for FR-108 (co-pilot) and FR-109 (pipeline)

-- Track how test data generation was triggered
ALTER TABLE test_data_sets
  ADD COLUMN IF NOT EXISTS trigger_source TEXT NOT NULL DEFAULT 'manual'
  CHECK (trigger_source IN ('manual', 'copilot', 'pipeline'));

-- Correlate pipeline-triggered datasets with pipeline runs
ALTER TABLE test_data_sets
  ADD COLUMN IF NOT EXISTS pipeline_run_id UUID;

-- Index for pipeline cleanup lookups
CREATE INDEX IF NOT EXISTS idx_test_data_sets_pipeline_run
  ON test_data_sets(pipeline_run_id) WHERE pipeline_run_id IS NOT NULL;

-- Service-role policy for pipeline/copilot access (bypasses user auth)
DROP POLICY IF EXISTS "service_role_test_data_sets" ON test_data_sets;
CREATE POLICY "service_role_test_data_sets" ON test_data_sets
  FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );
