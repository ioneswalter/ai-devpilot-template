-- FR-062: RLS Security Audit & Fix
-- Production audit revealed 12 tables with RLS DISABLED and missing policies.
-- This migration idempotently enables RLS on ALL public schema tables and
-- recreates missing policies for affected tables.
--
-- Tables with RLS DISABLED in production (confirmed 2026-03-02):
--   additional_work_escrows, cms_pages, cms_sections, cms_content_blocks,
--   cms_global_config, service_categories, product_features, test_cases,
--   releases, release_features, test_runs, feature_dependencies

-- ============================================================================
-- PHASE 1: Enable RLS on ALL tables (idempotent — safe to re-run)
-- ============================================================================

-- Core business tables (originally in 20250115000004_enable_rls.sql)
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE bids ENABLE ROW LEVEL SECURITY;
ALTER TABLE bid_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE escrow_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE membership_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE mediation_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- FR-014: Issue handling
ALTER TABLE additional_work_escrows ENABLE ROW LEVEL SECURITY;

-- CMS tables (originally in 20260121_create_cms_tables.sql)
ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_global_config ENABLE ROW LEVEL SECURITY;

-- Roadmap governance tables (originally in 20260215_fr029_roadmap_governance.sql)
ALTER TABLE feature_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- Internal/tooling tables (originally in 20260219_enable_rls_internal_tables.sql)
ALTER TABLE service_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE release_features ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_dependencies ENABLE ROW LEVEL SECURITY;

-- Marketplace tables (originally in 20260216/20260217 migrations)
ALTER TABLE marketplace_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_bids ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PHASE 2: Recreate additional_work_escrows policies
-- (from 20260206_fr014_issue_handling.sql — confirmed missing in production)
-- ============================================================================

DROP POLICY IF EXISTS "Customers can view own additional escrows" ON additional_work_escrows;
CREATE POLICY "Customers can view own additional escrows"
ON additional_work_escrows FOR SELECT
TO authenticated
USING (
  customer_id IN (
    SELECT id FROM customers WHERE user_id = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "Providers can view own additional escrows" ON additional_work_escrows;
CREATE POLICY "Providers can view own additional escrows"
ON additional_work_escrows FOR SELECT
TO authenticated
USING (
  provider_id IN (
    SELECT id FROM service_providers WHERE user_id = auth.uid()::text
  )
);

DROP POLICY IF EXISTS "Service role full access to additional escrows" ON additional_work_escrows;
CREATE POLICY "Service role full access to additional escrows"
ON additional_work_escrows FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ============================================================================
-- PHASE 3: Recreate CMS table policies
-- (from 20260121_create_cms_tables.sql — confirmed missing in production)
-- ============================================================================

-- cms_pages
DROP POLICY IF EXISTS "Allow public read access to cms_pages" ON cms_pages;
CREATE POLICY "Allow public read access to cms_pages"
  ON cms_pages FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Allow service role full access to cms_pages" ON cms_pages;
CREATE POLICY "Allow service role full access to cms_pages"
  ON cms_pages FOR ALL
  USING (auth.role() = 'service_role');

-- cms_sections
DROP POLICY IF EXISTS "Allow public read access to cms_sections" ON cms_sections;
CREATE POLICY "Allow public read access to cms_sections"
  ON cms_sections FOR SELECT
  USING (is_visible = true);

DROP POLICY IF EXISTS "Allow service role full access to cms_sections" ON cms_sections;
CREATE POLICY "Allow service role full access to cms_sections"
  ON cms_sections FOR ALL
  USING (auth.role() = 'service_role');

-- cms_content_blocks
DROP POLICY IF EXISTS "Allow public read access to cms_content_blocks" ON cms_content_blocks;
CREATE POLICY "Allow public read access to cms_content_blocks"
  ON cms_content_blocks FOR SELECT
  USING (is_visible = true);

DROP POLICY IF EXISTS "Allow service role full access to cms_content_blocks" ON cms_content_blocks;
CREATE POLICY "Allow service role full access to cms_content_blocks"
  ON cms_content_blocks FOR ALL
  USING (auth.role() = 'service_role');

-- cms_global_config
DROP POLICY IF EXISTS "Allow public read access to cms_global_config" ON cms_global_config;
CREATE POLICY "Allow public read access to cms_global_config"
  ON cms_global_config FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Allow service role full access to cms_global_config" ON cms_global_config;
CREATE POLICY "Allow service role full access to cms_global_config"
  ON cms_global_config FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- PHASE 4: Recreate internal/tooling table policies
-- (from 20260219_enable_rls_internal_tables.sql — confirmed missing in production)
-- ============================================================================

-- service_categories
DROP POLICY IF EXISTS "Public read access to service_categories" ON service_categories;
CREATE POLICY "Public read access to service_categories"
  ON service_categories FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write access to service_categories" ON service_categories;
CREATE POLICY "Service role write access to service_categories"
  ON service_categories FOR ALL
  TO service_role
  USING (true);

-- product_features
DROP POLICY IF EXISTS "Public read access to product_features" ON product_features;
CREATE POLICY "Public read access to product_features"
  ON product_features FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write access to product_features" ON product_features;
CREATE POLICY "Service role write access to product_features"
  ON product_features FOR ALL
  TO service_role
  USING (true);

-- test_cases
DROP POLICY IF EXISTS "Public read access to test_cases" ON test_cases;
CREATE POLICY "Public read access to test_cases"
  ON test_cases FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write access to test_cases" ON test_cases;
CREATE POLICY "Service role write access to test_cases"
  ON test_cases FOR ALL
  TO service_role
  USING (true);

-- releases
DROP POLICY IF EXISTS "Public read access to releases" ON releases;
CREATE POLICY "Public read access to releases"
  ON releases FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write access to releases" ON releases;
CREATE POLICY "Service role write access to releases"
  ON releases FOR ALL
  TO service_role
  USING (true);

-- release_features
DROP POLICY IF EXISTS "Public read access to release_features" ON release_features;
CREATE POLICY "Public read access to release_features"
  ON release_features FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write access to release_features" ON release_features;
CREATE POLICY "Service role write access to release_features"
  ON release_features FOR ALL
  TO service_role
  USING (true);

-- test_runs
DROP POLICY IF EXISTS "Public read access to test_runs" ON test_runs;
CREATE POLICY "Public read access to test_runs"
  ON test_runs FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write access to test_runs" ON test_runs;
CREATE POLICY "Service role write access to test_runs"
  ON test_runs FOR ALL
  TO service_role
  USING (true);

-- feature_dependencies
DROP POLICY IF EXISTS "Public read access to feature_dependencies" ON feature_dependencies;
CREATE POLICY "Public read access to feature_dependencies"
  ON feature_dependencies FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role write access to feature_dependencies" ON feature_dependencies;
CREATE POLICY "Service role write access to feature_dependencies"
  ON feature_dependencies FOR ALL
  TO service_role
  USING (true);

-- ============================================================================
-- PHASE 5: Add explicit service_role bypass for marketplace tables
-- (defense-in-depth, consistent with other tables)
-- ============================================================================

DROP POLICY IF EXISTS "Service role full access to marketplace_posts" ON marketplace_posts;
CREATE POLICY "Service role full access to marketplace_posts"
ON marketplace_posts FOR ALL
TO service_role
USING (true);

DROP POLICY IF EXISTS "Service role full access to marketplace_bids" ON marketplace_bids;
CREATE POLICY "Service role full access to marketplace_bids"
ON marketplace_bids FOR ALL
TO service_role
USING (true);

-- Documentation
COMMENT ON TABLE additional_work_escrows IS 'FR-014: Stores escrow payments for additional work. FR-062: RLS re-enabled and policies recreated.';
