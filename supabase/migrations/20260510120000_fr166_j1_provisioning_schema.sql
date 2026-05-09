-- FR-166 J1 — Per-tenant environment provisioning schema.
--
-- Extends the tenants table with provisioning metadata (external resource IDs,
-- region, billing tier, owner, status, timestamps, error text) and creates
-- tenant_provisioning_audit as an append-only state-transition log.
--
-- v1.0 stores supabase_service_role_key in plaintext with column-level GRANT
-- REVOKE keeping it from `authenticated`. Service-role-only column access is
-- the v1.0 protection. v1.1 will add pgsodium encryption.
--
-- Replay-safe: idempotent CREATE TABLE / COLUMN / INDEX / POLICY guards.

BEGIN;

-- 1. Extend tenants table with 12 provisioning columns (additive, idempotent)

ALTER TABLE public.tenants
  ADD COLUMN IF NOT EXISTS github_repo_full_name text,
  ADD COLUMN IF NOT EXISTS supabase_project_id text,
  ADD COLUMN IF NOT EXISTS supabase_url text,
  ADD COLUMN IF NOT EXISTS supabase_service_role_key text,
  ADD COLUMN IF NOT EXISTS do_app_id text,
  ADD COLUMN IF NOT EXISTS do_app_url text,
  ADD COLUMN IF NOT EXISTS billing_tier text NOT NULL DEFAULT 'foundation',
  ADD COLUMN IF NOT EXISTS region text NOT NULL DEFAULT 'syd1',
  ADD COLUMN IF NOT EXISTS owner_user_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS provisioning_status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS provisioning_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS provisioning_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS provisioning_error text;

-- CHECK constraints (gated on existence so re-run doesn't error)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public' AND constraint_name = 'tenants_billing_tier_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_billing_tier_check
      CHECK (billing_tier IN ('foundation', 'growth', 'enterprise'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public' AND constraint_name = 'tenants_region_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_region_check
      CHECK (region IN ('syd1', 'nyc1', 'fra1', 'sfo3'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public' AND constraint_name = 'tenants_provisioning_status_check'
  ) THEN
    ALTER TABLE public.tenants
      ADD CONSTRAINT tenants_provisioning_status_check
      CHECK (provisioning_status IN ('pending', 'provisioning', 'provisioned', 'failed', 'rolled_back'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS tenants_provisioning_status_idx ON public.tenants (provisioning_status);
CREATE INDEX IF NOT EXISTS tenants_owner_user_id_idx ON public.tenants (owner_user_id);

-- Column-level GRANT REVOKE: keep supabase_service_role_key from authenticated readers.
-- Service role bypasses GRANT REVOKE (postgres role privileges only apply to non-superusers).
REVOKE SELECT (supabase_service_role_key) ON public.tenants FROM authenticated;
REVOKE SELECT (supabase_service_role_key) ON public.tenants FROM anon;

-- 2. tenant_provisioning_audit (append-only)

CREATE TABLE IF NOT EXISTS public.tenant_provisioning_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  from_status text,
  to_status text NOT NULL,
  step_name text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error_text text,
  audit_metadata jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS tenant_provisioning_audit_tenant_idx
  ON public.tenant_provisioning_audit (tenant_id);
CREATE INDEX IF NOT EXISTS tenant_provisioning_audit_tenant_started_idx
  ON public.tenant_provisioning_audit (tenant_id, started_at DESC);
CREATE INDEX IF NOT EXISTS tenant_provisioning_audit_step_idx
  ON public.tenant_provisioning_audit (step_name);

ALTER TABLE public.tenant_provisioning_audit ENABLE ROW LEVEL SECURITY;

-- super_admin reads all; tenant owner reads own.
DROP POLICY IF EXISTS tenant_provisioning_audit_select ON public.tenant_provisioning_audit;
CREATE POLICY tenant_provisioning_audit_select ON public.tenant_provisioning_audit
  FOR SELECT
  TO authenticated
  USING (
    -- admin_users.user_id may be text or uuid depending on schema history; cast both sides for safety.
    EXISTS (
      SELECT 1 FROM public.admin_users
       WHERE user_id::text = auth.uid()::text
         AND role IN ('super_admin', 'admin')
    )
    OR tenant_id IN (
      SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()
    )
  );

-- service_role full access (explicit for documentation; service_role bypasses RLS natively).
DROP POLICY IF EXISTS tenant_provisioning_audit_service_role ON public.tenant_provisioning_audit;
CREATE POLICY tenant_provisioning_audit_service_role ON public.tenant_provisioning_audit
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- No UPDATE / DELETE policy → both blocked for authenticated and service_role-via-RLS.
-- (service_role bypasses RLS so superusers can still manually clean up if absolutely needed.)

COMMENT ON TABLE public.tenant_provisioning_audit IS
  'FR-166 J1 — append-only audit of tenant provisioning state transitions. Service-role INSERT only via the orchestrator; authenticated SELECT scoped to super_admin or tenant owner.';

COMMIT;
