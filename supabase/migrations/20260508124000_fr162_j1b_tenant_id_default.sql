-- FR-162 J1b — Add DEFAULT get_default_tenant_id() to every scoped table.
--
-- Discovered during build (2026-05-08): J1 set tenant_id NOT NULL on all 29
-- scoped tables but no DEFAULT. Every existing INSERT path (uat-submit-review,
-- github-app-webhook, devpilot-submit-proposal, test-automation/execute-*,
-- and ~25 other Edge Functions) writes rows without supplying tenant_id —
-- they would now fail with not-null violations.
--
-- Adding DEFAULT public.get_default_tenant_id() means existing single-tenant
-- inserts auto-resolve to the OwnYourGig tenant (matching the foundation-phase
-- expectation). Multi-tenant code paths (FR-163+) will set tenant_id
-- explicitly and override the default.
--
-- The DEFAULT is evaluated at INSERT time, so a row inserted by a webhook
-- (no JWT context) lands under OwnYourGig. A row inserted via an authenticated
-- supabase-js call still gets OwnYourGig until JWT minting includes tenant_id.
--
-- Replay-safe: ALTER COLUMN ... SET DEFAULT is idempotent.

BEGIN;

DO $$
DECLARE
  t text;
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
BEGIN
  FOREACH t IN ARRAY scoped_tables LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT public.get_default_tenant_id()',
      t
    );
    RAISE NOTICE 'FR-162 J1b: DEFAULT get_default_tenant_id() set on %.tenant_id', t;
  END LOOP;
END $$;

COMMIT;
