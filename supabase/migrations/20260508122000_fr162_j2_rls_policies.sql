-- FR-162 J2 — Enable RLS on the 29-table DevPilot scope set with per-tenant
-- isolation policies.
--
-- Architecture note (revised during build, 2026-05-08):
--   The original spec used `set_config('request.jwt.claim.tenant_id', ...)` from
--   Edge Functions to pin the tenant per request. That doesn't work in practice:
--   Supabase JS client calls go through PostgREST as separate HTTP requests,
--   each in its own transaction. set_config(..., true) is transaction-scoped,
--   so the GUC set by a `supabase.rpc('set_tenant_context', ...)` call doesn't
--   carry over to the subsequent `supabase.from(...)` query.
--
--   The pattern that DOES work per-request is `auth.jwt()` — PostgREST extracts
--   the JWT claims into a JSON object available natively in every query's
--   context. We read `tenant_id` from there.
--
--   For the foundation phase (OwnYourGig only), existing JWTs don't carry a
--   tenant_id claim. We COALESCE with `get_default_tenant_id()` so any
--   authenticated request without a claim falls back to the OwnYourGig tenant.
--   FR-163 (API Gateway + Customer Auth) will introduce JWT minting that
--   includes tenant_id; at that point the COALESCE can be tightened or kept as
--   a safety net.
--
-- Policy shape per scoped table:
--   USING (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id')::uuid, get_default_tenant_id()))
--   WITH CHECK (tenant_id = COALESCE((auth.jwt() ->> 'tenant_id')::uuid, get_default_tenant_id()))
--
-- TO authenticated — service role retains its native Postgres BYPASS, so
-- every admin/ops script (verify-feature-state.ts, sync:roadmap, the deploy
-- command's update-handler.ts) keeps working unchanged.
--
-- Replay-safe: ALTER TABLE ... ENABLE RLS is idempotent; DROP POLICY IF EXISTS
-- before CREATE POLICY makes per-table policy creation idempotent.

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
  policy_name text;
BEGIN
  FOREACH t IN ARRAY scoped_tables LOOP
    -- 1. Enable RLS (idempotent)
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);

    -- 2. Drop existing tenant_isolation policy if any (replay-safe)
    policy_name := t || '_tenant_isolation';
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', policy_name, t);

    -- 3. Create the per-tenant policy
    --    auth.jwt() returns the JWT claims JSON; ->> extracts tenant_id as text.
    --    COALESCE falls back to OwnYourGig when the claim isn't set
    --    (foundation-phase compatibility). Service role bypasses RLS natively.
    EXECUTE format($pol$
      CREATE POLICY %I ON public.%I
        FOR ALL
        TO authenticated
        USING (tenant_id = COALESCE(
          NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid,
          public.get_default_tenant_id()
        ))
        WITH CHECK (tenant_id = COALESCE(
          NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid,
          public.get_default_tenant_id()
        ))
    $pol$, policy_name, t);

    RAISE NOTICE 'FR-162 J2: RLS enabled on % with policy %', t, policy_name;
  END LOOP;
END $$;

COMMIT;
