-- Enable RLS on internal/tooling tables
-- These tables were created by Prisma and need RLS policies added
-- All data is public-readable (shown on /roadmap page) but write-protected

-- ============================================================================
-- SERVICE CATEGORIES
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_categories') THEN
    ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_categories' AND policyname = 'Public read access to service_categories') THEN
      CREATE POLICY "Public read access to service_categories"
        ON service_categories FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_categories' AND policyname = 'Service role write access to service_categories') THEN
      CREATE POLICY "Service role write access to service_categories"
        ON service_categories FOR ALL
        TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- PRODUCT FEATURES (Roadmap)
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_features') THEN
    ALTER TABLE product_features ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_features' AND policyname = 'Public read access to product_features') THEN
      CREATE POLICY "Public read access to product_features"
        ON product_features FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'product_features' AND policyname = 'Service role write access to product_features') THEN
      CREATE POLICY "Service role write access to product_features"
        ON product_features FOR ALL
        TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- TEST CASES
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'test_cases') THEN
    ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_cases' AND policyname = 'Public read access to test_cases') THEN
      CREATE POLICY "Public read access to test_cases"
        ON test_cases FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_cases' AND policyname = 'Service role write access to test_cases') THEN
      CREATE POLICY "Service role write access to test_cases"
        ON test_cases FOR ALL
        TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- RELEASES
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'releases') THEN
    ALTER TABLE releases ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'releases' AND policyname = 'Public read access to releases') THEN
      CREATE POLICY "Public read access to releases"
        ON releases FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'releases' AND policyname = 'Service role write access to releases') THEN
      CREATE POLICY "Service role write access to releases"
        ON releases FOR ALL
        TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- RELEASE FEATURES
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'release_features') THEN
    ALTER TABLE release_features ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'release_features' AND policyname = 'Public read access to release_features') THEN
      CREATE POLICY "Public read access to release_features"
        ON release_features FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'release_features' AND policyname = 'Service role write access to release_features') THEN
      CREATE POLICY "Service role write access to release_features"
        ON release_features FOR ALL
        TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- TEST RUNS
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'test_runs') THEN
    ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_runs' AND policyname = 'Public read access to test_runs') THEN
      CREATE POLICY "Public read access to test_runs"
        ON test_runs FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_runs' AND policyname = 'Service role write access to test_runs') THEN
      CREATE POLICY "Service role write access to test_runs"
        ON test_runs FOR ALL
        TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- ============================================================================
-- FEATURE DEPENDENCIES
-- ============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'feature_dependencies') THEN
    ALTER TABLE feature_dependencies ENABLE ROW LEVEL SECURITY;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feature_dependencies' AND policyname = 'Public read access to feature_dependencies') THEN
      CREATE POLICY "Public read access to feature_dependencies"
        ON feature_dependencies FOR SELECT
        USING (true);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feature_dependencies' AND policyname = 'Service role write access to feature_dependencies') THEN
      CREATE POLICY "Service role write access to feature_dependencies"
        ON feature_dependencies FOR ALL
        TO service_role
        USING (true);
    END IF;
  END IF;
END $$;

-- NOTE: spatial_ref_sys is a PostGIS system table owned by supabase_admin.
-- RLS cannot be enabled (ownership restriction). This is a Supabase Security Advisor
-- false positive — the table contains only standard coordinate reference definitions.
