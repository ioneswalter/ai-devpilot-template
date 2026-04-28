-- FR-109: AI-Powered Test Automation
-- Creates automated_test_scripts, visual_checkpoints, automation_coverage_cache tables
-- Extends test_cases with automation_status and automation_failure_reason

-- ============================================================================
-- 1. New Tables
-- ============================================================================

-- automated_test_scripts: Stores AI-generated executable test scripts
CREATE TABLE IF NOT EXISTS automated_test_scripts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  script_steps JSONB NOT NULL,
  generation_source TEXT NOT NULL DEFAULT 'ai_criteria'
    CHECK (generation_source IN ('ai_criteria', 'manual_conversion', 'manual_edit')),
  generated_from_hash TEXT NOT NULL,
  ai_model TEXT NOT NULL,
  is_stale BOOLEAN NOT NULL DEFAULT false,
  is_custom_modified BOOLEAN NOT NULL DEFAULT false,
  last_run_result TEXT
    CHECK (last_run_result IN ('passed', 'failed', 'error')),
  last_run_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  generation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

-- One active script per test case
CREATE UNIQUE INDEX IF NOT EXISTS idx_auto_scripts_test_case
  ON automated_test_scripts(test_case_id);
CREATE INDEX IF NOT EXISTS idx_auto_scripts_feature
  ON automated_test_scripts(feature_id);
CREATE INDEX IF NOT EXISTS idx_auto_scripts_stale
  ON automated_test_scripts(feature_id) WHERE is_stale = true;

-- visual_checkpoints: AI vision assertion results
CREATE TABLE IF NOT EXISTS visual_checkpoints (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  script_id TEXT NOT NULL REFERENCES automated_test_scripts(id) ON DELETE CASCADE,
  test_run_id TEXT REFERENCES test_runs(id) ON DELETE SET NULL,
  step_number INT NOT NULL,
  screenshot_base64 TEXT NOT NULL,
  expected_outcome TEXT NOT NULL,
  ai_assessment JSONB NOT NULL,
  passed BOOLEAN NOT NULL,
  cosmetic_only BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_visual_cp_script
  ON visual_checkpoints(script_id);
CREATE INDEX IF NOT EXISTS idx_visual_cp_test_run
  ON visual_checkpoints(test_run_id);

-- automation_coverage_cache: Cached coverage metrics per feature
CREATE TABLE IF NOT EXISTS automation_coverage_cache (
  feature_id TEXT PRIMARY KEY REFERENCES product_features(id) ON DELETE CASCADE,
  total_test_cases INT NOT NULL DEFAULT 0,
  automated_count INT NOT NULL DEFAULT 0,
  manual_count INT NOT NULL DEFAULT 0,
  stale_count INT NOT NULL DEFAULT 0,
  criteria_total INT NOT NULL DEFAULT 0,
  criteria_automated INT NOT NULL DEFAULT 0,
  coverage_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  trend_data JSONB DEFAULT '[]'
);

-- ============================================================================
-- 2. Extend test_cases
-- ============================================================================

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS automation_status TEXT
  DEFAULT 'manual' CHECK (automation_status IN ('manual', 'automated', 'stale', 'converting'));

ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS automation_failure_reason TEXT;

-- ============================================================================
-- 3. RLS Policies
-- ============================================================================

-- automated_test_scripts
ALTER TABLE automated_test_scripts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automated_test_scripts' AND policyname = 'Admin can read auto scripts') THEN
    DROP POLICY IF EXISTS "Admin can read auto scripts" ON automated_test_scripts;
    CREATE POLICY "Admin can read auto scripts"
      ON automated_test_scripts FOR SELECT
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automated_test_scripts' AND policyname = 'Admin can insert auto scripts') THEN
    DROP POLICY IF EXISTS "Admin can insert auto scripts" ON automated_test_scripts;
    CREATE POLICY "Admin can insert auto scripts"
      ON automated_test_scripts FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automated_test_scripts' AND policyname = 'Admin can update auto scripts') THEN
    DROP POLICY IF EXISTS "Admin can update auto scripts" ON automated_test_scripts;
    CREATE POLICY "Admin can update auto scripts"
      ON automated_test_scripts FOR UPDATE
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automated_test_scripts' AND policyname = 'Service role full access auto scripts') THEN
    DROP POLICY IF EXISTS "Service role full access auto scripts" ON automated_test_scripts;
    CREATE POLICY "Service role full access auto scripts"
      ON automated_test_scripts FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- visual_checkpoints
ALTER TABLE visual_checkpoints ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visual_checkpoints' AND policyname = 'Admin can read visual checkpoints') THEN
    DROP POLICY IF EXISTS "Admin can read visual checkpoints" ON visual_checkpoints;
    CREATE POLICY "Admin can read visual checkpoints"
      ON visual_checkpoints FOR SELECT
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visual_checkpoints' AND policyname = 'Admin can insert visual checkpoints') THEN
    DROP POLICY IF EXISTS "Admin can insert visual checkpoints" ON visual_checkpoints;
    CREATE POLICY "Admin can insert visual checkpoints"
      ON visual_checkpoints FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'visual_checkpoints' AND policyname = 'Service role full access visual checkpoints') THEN
    DROP POLICY IF EXISTS "Service role full access visual checkpoints" ON visual_checkpoints;
    CREATE POLICY "Service role full access visual checkpoints"
      ON visual_checkpoints FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- automation_coverage_cache
ALTER TABLE automation_coverage_cache ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automation_coverage_cache' AND policyname = 'Admin can read coverage cache') THEN
    DROP POLICY IF EXISTS "Admin can read coverage cache" ON automation_coverage_cache;
    CREATE POLICY "Admin can read coverage cache"
      ON automation_coverage_cache FOR SELECT
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'automation_coverage_cache' AND policyname = 'Service role full access coverage cache') THEN
    DROP POLICY IF EXISTS "Service role full access coverage cache" ON automation_coverage_cache;
    CREATE POLICY "Service role full access coverage cache"
      ON automation_coverage_cache FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 4. Updated_at Triggers
-- ============================================================================

CREATE OR REPLACE FUNCTION update_auto_scripts_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_auto_scripts_updated_at ON automated_test_scripts;
CREATE TRIGGER set_auto_scripts_updated_at
  BEFORE UPDATE ON automated_test_scripts
  FOR EACH ROW
  EXECUTE FUNCTION update_auto_scripts_updated_at();
