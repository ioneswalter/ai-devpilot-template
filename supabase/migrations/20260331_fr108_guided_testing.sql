-- FR-108: AI Testing Co-Pilot — guided test sessions
CREATE TABLE IF NOT EXISTS guided_test_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  total_steps INTEGER NOT NULL DEFAULT 0,
  completed_steps INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  ai_model TEXT NOT NULL,
  guidance_context JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE guided_test_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_guided_sessions_all" ON guided_test_sessions
  FOR ALL USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text)
  );

CREATE POLICY "service_role_guided_sessions" ON guided_test_sessions
  FOR ALL USING (
    current_setting('role', true) = 'service_role'
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_guided_sessions_feature ON guided_test_sessions(feature_id);
CREATE INDEX IF NOT EXISTS idx_guided_sessions_test_case ON guided_test_sessions(test_case_id);
CREATE INDEX IF NOT EXISTS idx_guided_sessions_admin ON guided_test_sessions(admin_id);
CREATE INDEX IF NOT EXISTS idx_guided_sessions_status ON guided_test_sessions(status) WHERE status = 'active';

-- Add guided_testing operation type for AI usage tracking
ALTER TABLE ai_usage_logs
  DROP CONSTRAINT IF EXISTS ai_usage_logs_operation_type_check;

ALTER TABLE ai_usage_logs
  ADD CONSTRAINT ai_usage_logs_operation_type_check
  CHECK (operation_type IN (
    'ideation', 'spec_review', 'code_generation', 'task_splitting',
    'learning', 'test_data_gen', 'implementation', 'guided_testing'
  ));
