-- FR-162 v1.1 — JWT-aware DEFAULT on every scoped tenant_id column.
--
-- v1.0 set DEFAULT public.get_default_tenant_id() (always OwnYourGig). That
-- works during the foundation phase but is a footgun the moment FR-163 mints
-- JWTs with a customer's tenant_id claim — an INSERT that doesn't explicitly
-- set tenant_id would silently land under OwnYourGig regardless of the
-- calling JWT.
--
-- v1.1 changes the DEFAULT to read from the request's JWT claim first, then
-- fall back to OwnYourGig. PostgREST populates `request.jwt.claim.tenant_id`
-- per request from the JWT; the GUC is also empty for service-role and
-- direct-postgres connections (ops scripts, batch jobs), which correctly
-- fall back to OwnYourGig.
--
-- DEFAULT expression:
--   COALESCE(
--     NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid,
--     public.get_default_tenant_id()
--   )
--
-- The `, true` second arg to current_setting means it returns NULL instead of
-- erroring when the GUC isn't set. NULLIF wraps the empty-string case (a
-- present-but-empty claim is treated the same as no claim).
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
    EXECUTE format($expr$
      ALTER TABLE public.%I
        ALTER COLUMN tenant_id SET DEFAULT
          COALESCE(
            NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid,
            public.get_default_tenant_id()
          )
    $expr$, t);
    RAISE NOTICE 'FR-162 v1.1: JWT-aware DEFAULT set on %.tenant_id', t;
  END LOOP;
END $$;

COMMIT;
