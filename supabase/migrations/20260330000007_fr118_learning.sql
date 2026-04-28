-- FR-118: Adaptive Learning Engine tables
CREATE TABLE IF NOT EXISTS pipeline_failures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID,
  feature_id UUID,
  task_item_id UUID,
  error_type TEXT NOT NULL,
  error_code TEXT NOT NULL DEFAULT 'unknown',
  error_message TEXT NOT NULL DEFAULT '',
  file_path TEXT,
  context JSONB DEFAULT '{}',
  outcome TEXT NOT NULL DEFAULT 'captured',
  adaptation_applied BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_failures_error_code ON pipeline_failures(error_code);
CREATE INDEX IF NOT EXISTS idx_pipeline_failures_error_type ON pipeline_failures(error_type);
CREATE INDEX IF NOT EXISTS idx_pipeline_failures_feature_id ON pipeline_failures(feature_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_failures_created_at ON pipeline_failures(created_at);

CREATE TABLE IF NOT EXISTS failure_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_type TEXT NOT NULL,
  error_code TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  description TEXT NOT NULL DEFAULT '',
  frequency INTEGER NOT NULL DEFAULT 0,
  affected_features TEXT[] DEFAULT '{}',
  first_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  adaptation_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_failure_patterns_code ON failure_patterns(error_type, error_code);

CREATE TABLE IF NOT EXISTS constitution_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern_id UUID REFERENCES failure_patterns(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  suggested_rule TEXT NOT NULL,
  evidence JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  decided_by UUID,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_constitution_recs_status ON constitution_recommendations(status);

-- RLS policies
ALTER TABLE pipeline_failures ENABLE ROW LEVEL SECURITY;
ALTER TABLE failure_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE constitution_recommendations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on pipeline_failures" ON pipeline_failures;
CREATE POLICY "Service role full access on pipeline_failures"
  ON pipeline_failures FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access on failure_patterns" ON failure_patterns;
CREATE POLICY "Service role full access on failure_patterns"
  ON failure_patterns FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access on constitution_recommendations" ON constitution_recommendations;
CREATE POLICY "Service role full access on constitution_recommendations"
  ON constitution_recommendations FOR ALL USING (true) WITH CHECK (true);
