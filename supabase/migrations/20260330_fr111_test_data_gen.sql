-- FR-111: AI Test Data Generation System
-- Tracks generated test datasets for cleanup and audit

CREATE TABLE IF NOT EXISTS test_data_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  generated_by UUID NOT NULL,
  sql_statements TEXT,
  records_created INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'partial', 'cleaned', 'failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cleaned_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE test_data_sets ENABLE ROW LEVEL SECURITY;

-- Admin-only access
DROP POLICY IF EXISTS "admin_test_data_sets_all" ON test_data_sets;
CREATE POLICY "admin_test_data_sets_all" ON test_data_sets
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text)
  );

-- Index for feature lookups
CREATE INDEX IF NOT EXISTS idx_test_data_sets_feature ON test_data_sets(feature_id);

-- Add operation type for usage tracking
ALTER TABLE ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_operation_type_check;

ALTER TABLE ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_operation_type_check
  CHECK (operation_type IN (
    'ideation', 'spec_review', 'code_generation', 'task_splitting',
    'learning', 'test_data_gen', 'implementation'
  ));
