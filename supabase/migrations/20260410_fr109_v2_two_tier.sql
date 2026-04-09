-- FR-109 v2: Two-Tier Test Automation
-- Adds api_verification_tests, test_failure_guidance, improvement_recommendations tables
-- Extends automated_test_scripts, automation_coverage_cache, test_cases with v2 columns

-- ============================================================================
-- 1. New Table: api_verification_tests
-- ============================================================================

CREATE TABLE IF NOT EXISTS api_verification_tests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL CHECK (method IN ('GET', 'POST', 'PUT', 'DELETE')),
  setup_sql JSONB NOT NULL DEFAULT '[]',
  request_body JSONB DEFAULT '{}',
  auth_context JSONB NOT NULL DEFAULT '{"type": "service_role"}',
  assertions JSONB NOT NULL,
  cleanup_sql JSONB NOT NULL DEFAULT '[]',
  negative_cases JSONB DEFAULT '[]',
  generated_from_hash TEXT NOT NULL,
  ai_model TEXT NOT NULL,
  is_stale BOOLEAN NOT NULL DEFAULT false,
  last_run_result TEXT CHECK (last_run_result IN ('passed', 'failed', 'error')),
  last_run_at TIMESTAMPTZ,
  failure_count INT NOT NULL DEFAULT 0,
  generation_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_api_tests_test_case
  ON api_verification_tests(test_case_id);
CREATE INDEX IF NOT EXISTS idx_api_tests_feature
  ON api_verification_tests(feature_id);
CREATE INDEX IF NOT EXISTS idx_api_tests_stale
  ON api_verification_tests(feature_id) WHERE is_stale = true;

-- ============================================================================
-- 2. New Table: test_failure_guidance
-- ============================================================================

CREATE TABLE IF NOT EXISTS test_failure_guidance (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  test_run_id TEXT REFERENCES test_runs(id) ON DELETE SET NULL,
  test_case_id TEXT NOT NULL REFERENCES test_cases(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  tier TEXT NOT NULL CHECK (tier IN ('api', 'e2e')),
  root_cause TEXT NOT NULL,
  likely_source JSONB NOT NULL,
  suggested_fix TEXT NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('critical', 'major', 'minor')),
  category TEXT NOT NULL CHECK (category IN (
    'code_bug', 'missing_feature', 'data_issue', 'permission_error', 'contract_mismatch'
  )),
  group_id TEXT,
  evidence JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'fixing', 'resolved', 'dismissed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_guidance_test_run
  ON test_failure_guidance(test_run_id);
CREATE INDEX IF NOT EXISTS idx_guidance_feature
  ON test_failure_guidance(feature_id);
CREATE INDEX IF NOT EXISTS idx_guidance_group
  ON test_failure_guidance(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guidance_status
  ON test_failure_guidance(feature_id, status) WHERE status = 'new';

-- ============================================================================
-- 3. New Table: improvement_recommendations
-- ============================================================================

CREATE TABLE IF NOT EXISTS improvement_recommendations (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  test_run_id TEXT REFERENCES test_runs(id) ON DELETE SET NULL,
  category TEXT NOT NULL CHECK (category IN (
    'performance', 'ux', 'accessibility', 'coverage', 'reliability'
  )),
  observation TEXT NOT NULL,
  why_it_matters TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  priority TEXT NOT NULL CHECK (priority IN ('high', 'medium', 'low')),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'accepted', 'dismissed', 'deferred')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_recommendations_feature
  ON improvement_recommendations(feature_id);
CREATE INDEX IF NOT EXISTS idx_recommendations_status
  ON improvement_recommendations(feature_id, status) WHERE status IN ('new', 'deferred');

-- ============================================================================
-- 4. Extend automated_test_scripts with v2 columns
-- ============================================================================

ALTER TABLE automated_test_scripts
  ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'e2e' CHECK (tier IN ('e2e'));

ALTER TABLE automated_test_scripts
  ADD COLUMN IF NOT EXISTS retry_config JSONB DEFAULT '{"max_retries": 2, "delay_ms": [500, 1000]}';

ALTER TABLE automated_test_scripts
  ADD COLUMN IF NOT EXISTS data_setup_steps JSONB DEFAULT '[]';

ALTER TABLE automated_test_scripts
  ADD COLUMN IF NOT EXISTS data_cleanup_steps JSONB DEFAULT '[]';

-- ============================================================================
-- 5. Extend automation_coverage_cache with two-tier metrics
-- ============================================================================

ALTER TABLE automation_coverage_cache
  ADD COLUMN IF NOT EXISTS api_test_count INT NOT NULL DEFAULT 0;

ALTER TABLE automation_coverage_cache
  ADD COLUMN IF NOT EXISTS e2e_test_count INT NOT NULL DEFAULT 0;

ALTER TABLE automation_coverage_cache
  ADD COLUMN IF NOT EXISTS api_coverage_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

ALTER TABLE automation_coverage_cache
  ADD COLUMN IF NOT EXISTS e2e_coverage_pct NUMERIC(5,2) NOT NULL DEFAULT 0;

-- ============================================================================
-- 6. Extend test_cases with tier assignment
-- ============================================================================

ALTER TABLE test_cases
  ADD COLUMN IF NOT EXISTS test_tier TEXT DEFAULT 'unassigned'
    CHECK (test_tier IN ('api', 'e2e', 'both', 'manual', 'unassigned'));

-- ============================================================================
-- 7. RLS Policies for new tables
-- ============================================================================

-- api_verification_tests
ALTER TABLE api_verification_tests ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_verification_tests' AND policyname = 'Admin can read api tests') THEN
    CREATE POLICY "Admin can read api tests"
      ON api_verification_tests FOR SELECT
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_verification_tests' AND policyname = 'Admin can insert api tests') THEN
    CREATE POLICY "Admin can insert api tests"
      ON api_verification_tests FOR INSERT
      WITH CHECK (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_verification_tests' AND policyname = 'Admin can update api tests') THEN
    CREATE POLICY "Admin can update api tests"
      ON api_verification_tests FOR UPDATE
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_verification_tests' AND policyname = 'Service role full access api tests') THEN
    CREATE POLICY "Service role full access api tests"
      ON api_verification_tests FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- test_failure_guidance
ALTER TABLE test_failure_guidance ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_failure_guidance' AND policyname = 'Admin can read guidance') THEN
    CREATE POLICY "Admin can read guidance"
      ON test_failure_guidance FOR SELECT
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_failure_guidance' AND policyname = 'Admin can manage guidance') THEN
    CREATE POLICY "Admin can manage guidance"
      ON test_failure_guidance FOR UPDATE
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_failure_guidance' AND policyname = 'Service role full access guidance') THEN
    CREATE POLICY "Service role full access guidance"
      ON test_failure_guidance FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- improvement_recommendations
ALTER TABLE improvement_recommendations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'improvement_recommendations' AND policyname = 'Admin can read recommendations') THEN
    CREATE POLICY "Admin can read recommendations"
      ON improvement_recommendations FOR SELECT
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'improvement_recommendations' AND policyname = 'Admin can manage recommendations') THEN
    CREATE POLICY "Admin can manage recommendations"
      ON improvement_recommendations FOR UPDATE
      USING (EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'improvement_recommendations' AND policyname = 'Service role full access recommendations') THEN
    CREATE POLICY "Service role full access recommendations"
      ON improvement_recommendations FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;

-- ============================================================================
-- 8. Updated_at triggers for new tables
-- ============================================================================

CREATE OR REPLACE FUNCTION update_api_tests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_api_tests_updated_at
  BEFORE UPDATE ON api_verification_tests
  FOR EACH ROW
  EXECUTE FUNCTION update_api_tests_updated_at();
