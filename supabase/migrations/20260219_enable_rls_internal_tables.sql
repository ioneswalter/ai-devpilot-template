-- Enable RLS on internal/tooling tables
-- These tables were created by Prisma and need RLS policies added
-- All data is public-readable (shown on /roadmap page) but write-protected

-- ============================================================================
-- SERVICE CATEGORIES
-- ============================================================================
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;

-- Anyone can read service categories (public reference data)
CREATE POLICY "Public read access to service_categories"
  ON service_categories FOR SELECT
  USING (true);

-- Only service role can modify (admin operations via Edge Functions)
CREATE POLICY "Service role write access to service_categories"
  ON service_categories FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- PRODUCT FEATURES (Roadmap)
-- ============================================================================
ALTER TABLE product_features ENABLE ROW LEVEL SECURITY;

-- Anyone can read product features (displayed on public roadmap)
CREATE POLICY "Public read access to product_features"
  ON product_features FOR SELECT
  USING (true);

-- Only service role can modify
CREATE POLICY "Service role write access to product_features"
  ON product_features FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- TEST CASES
-- ============================================================================
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;

-- Anyone can read test cases (displayed on roadmap)
CREATE POLICY "Public read access to test_cases"
  ON test_cases FOR SELECT
  USING (true);

-- Only service role can modify
CREATE POLICY "Service role write access to test_cases"
  ON test_cases FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- RELEASES
-- ============================================================================
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;

-- Anyone can read releases (public version history)
CREATE POLICY "Public read access to releases"
  ON releases FOR SELECT
  USING (true);

-- Only service role can modify
CREATE POLICY "Service role write access to releases"
  ON releases FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- RELEASE FEATURES
-- ============================================================================
ALTER TABLE release_features ENABLE ROW LEVEL SECURITY;

-- Anyone can read release features
CREATE POLICY "Public read access to release_features"
  ON release_features FOR SELECT
  USING (true);

-- Only service role can modify
CREATE POLICY "Service role write access to release_features"
  ON release_features FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- TEST RUNS
-- ============================================================================
ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;

-- Anyone can read test runs (test execution history)
CREATE POLICY "Public read access to test_runs"
  ON test_runs FOR SELECT
  USING (true);

-- Only service role can modify
CREATE POLICY "Service role write access to test_runs"
  ON test_runs FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- FEATURE DEPENDENCIES
-- ============================================================================
ALTER TABLE feature_dependencies ENABLE ROW LEVEL SECURITY;

-- Anyone can read feature dependencies
CREATE POLICY "Public read access to feature_dependencies"
  ON feature_dependencies FOR SELECT
  USING (true);

-- Only service role can modify
CREATE POLICY "Service role write access to feature_dependencies"
  ON feature_dependencies FOR ALL
  TO service_role
  USING (true);

-- NOTE: spatial_ref_sys is a PostGIS system table owned by supabase_admin.
-- RLS cannot be enabled (ownership restriction). This is a Supabase Security Advisor
-- false positive — the table contains only standard coordinate reference definitions.
