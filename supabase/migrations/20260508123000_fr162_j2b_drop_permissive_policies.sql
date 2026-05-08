-- FR-162 J2b — Drop pre-existing permissive RLS policies that defeat tenant
-- isolation.
--
-- Discovered during build (2026-05-08): 26 pre-existing policies on the scope
-- set carried `qual = true` for `{public}` or `{authenticated}` roles. In
-- Postgres, multiple permissive policies on the same table are OR'd, so these
-- "open" policies completely bypassed the new `<table>_tenant_isolation`
-- policies created in 20260508122000.
--
-- This migration drops policies that:
--   * have `qual = 'true'` (no row-level filter), AND
--   * target `{public}` or `{authenticated}` (not `{service_role}`)
--
-- Service-role-named permissive policies are kept — they're redundant
-- (Postgres service role natively bypasses RLS) but harmless.
--
-- Replay-safe: DROP POLICY IF EXISTS no-ops on missing policies.

BEGIN;

DO $$
DECLARE
  scoped_tables text[] := ARRAY[
    'product_features',
    'feature_versions',
    'feature_spec_artifacts',
    'spec_reviews',
    'review_items',
    'implementation_requests',
    'implementation_task_items',
    'pipeline_runs',
    'pipeline_queue',
    'pipeline_failures',
    'pipeline_notifications',
    'test_cases',
    'test_runs',
    'test_data_sets',
    'test_failure_guidance',
    'automated_test_scripts',
    'api_verification_tests',
    'uat_packages',
    'uat_checklist_items',
    'uat_review_decisions',
    'uat_review_audit',
    'uat_scenarios',
    'bp_review_projections',
    'feature_dependencies',
    'feature_comments',
    'feature_ratings',
    'prompt_templates',
    'prompt_categories',
    'prompt_ratings'
  ];
  rec record;
  t text;
BEGIN
  FOREACH t IN ARRAY scoped_tables LOOP
    -- Find every permissive policy on the table that:
    --   * has qual = 'true' (no actual filter)
    --   * targets {public} or {authenticated} (NOT service_role)
    --   * is NOT our new tenant_isolation policy (defensive: leave it alone)
    FOR rec IN
      SELECT policyname, roles
        FROM pg_policies
       WHERE schemaname = 'public'
         AND tablename = t
         AND qual = 'true'
         AND policyname != t || '_tenant_isolation'
         AND NOT (
           array_length(roles, 1) = 1 AND roles::text[] = ARRAY['service_role']
         )
    LOOP
      RAISE NOTICE 'FR-162 J2b: dropping permissive policy %.% for roles %',
        t, rec.policyname, rec.roles;
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, t);
    END LOOP;
  END LOOP;
END $$;

COMMIT;
