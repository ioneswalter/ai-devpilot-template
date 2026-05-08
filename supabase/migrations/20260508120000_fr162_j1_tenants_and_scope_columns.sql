-- FR-162 J1 — DevPilot Multi-Tenancy Foundation: tenants table + scope-set columns + backfill.
--
-- This migration ships the structural foundation for multi-tenancy. After it runs:
--   * A `tenants` table exists with one row seeded for OwnYourGig.
--   * A `get_default_tenant_id()` helper returns that tenant's id.
--   * Every table in the 29-table DevPilot scope set carries a non-null `tenant_id`
--     column with a FK to `tenants(id)` and an index on `(tenant_id)`. Existing rows
--     are backfilled to the OwnYourGig tenant.
--
-- RLS is NOT enabled here — that lands in J2 (separate migration). After this
-- migration, the cluster behaves identically to today (any caller still sees all
-- rows). J2 + J3 must ship together to avoid a window where RLS is on but Edge
-- Functions don't yet set the tenant context. See specs/162-devpilot-multi-tenancy/plan.md.
--
-- Replay-safe: every DDL is `IF NOT EXISTS`, every UPDATE is idempotent, NOT NULL
-- escalation is gated on the column not already being NOT NULL, seed is `ON CONFLICT
-- DO NOTHING`. Per feedback_migration_replay_safety.md.

BEGIN;

-- 1. tenants table + helper
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenants (code, name)
VALUES ('ownyourgig', 'OwnYourGig App')
ON CONFLICT (code) DO NOTHING;

CREATE OR REPLACE FUNCTION public.get_default_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.tenants WHERE code = 'ownyourgig' LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_default_tenant_id() IS
  'FR-162 J1 — returns the OwnYourGig tenant id. Used by backfill migrations and Edge Function fallbacks (set_tenant_context) when no JWT tenant claim is present (e.g., GitHub App webhook from FR-147).';

-- 2. Add tenant_id to every scoped table (29 tables), backfill, index, NOT NULL.
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
  default_tenant_id uuid := public.get_default_tenant_id();
  is_not_null boolean;
BEGIN
  IF default_tenant_id IS NULL THEN
    RAISE EXCEPTION 'FR-162 J1 — get_default_tenant_id() returned NULL; tenants seed missing';
  END IF;

  FOREACH t IN ARRAY scoped_tables LOOP
    -- 2a. Add column (replay-safe)
    EXECUTE format(
      'ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id)',
      t
    );

    -- 2b. Backfill (idempotent — only fills NULLs)
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = $1 WHERE tenant_id IS NULL',
      t
    ) USING default_tenant_id;

    -- 2c. Index on (tenant_id) (replay-safe)
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)',
      t || '_tenant_id_idx',
      t
    );

    -- 2d. NOT NULL escalation (gated — only if not already NOT NULL)
    SELECT (is_nullable = 'NO') INTO is_not_null
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = t AND column_name = 'tenant_id';

    IF NOT is_not_null THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    END IF;

    RAISE NOTICE 'FR-162 J1: %.tenant_id ready', t;
  END LOOP;
END $$;

COMMIT;
