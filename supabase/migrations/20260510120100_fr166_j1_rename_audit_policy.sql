-- FR-166 J1 follow-up — rename the audit policy to match FR162 verifier convention.
--
-- The FR162 verifier in scripts/verify-rls-status.ts expects every scope-set
-- table to have a policy named `<tablename>_tenant_isolation`. The initial
-- J1 migration named it `_select`; this rename aligns with the convention.
-- (FR-164 introduced the parallel `_visibility` carve-out for the visibility-
-- tier tables; tenant_provisioning_audit follows the standard convention.)
--
-- Replay-safe: DROP POLICY IF EXISTS before CREATE.

BEGIN;

DROP POLICY IF EXISTS tenant_provisioning_audit_select ON public.tenant_provisioning_audit;
DROP POLICY IF EXISTS tenant_provisioning_audit_tenant_isolation ON public.tenant_provisioning_audit;

CREATE POLICY tenant_provisioning_audit_tenant_isolation ON public.tenant_provisioning_audit
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.admin_users
       WHERE user_id::text = auth.uid()::text
         AND role IN ('super_admin', 'admin')
    )
    OR tenant_id IN (
      SELECT id FROM public.tenants WHERE owner_user_id = auth.uid()
    )
  );

COMMIT;
