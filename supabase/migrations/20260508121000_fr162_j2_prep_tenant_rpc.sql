-- FR-162 J2 prep — set_tenant_context RPC.
--
-- Creates the RPC that Edge Functions call from JS to pin the tenant_id
-- claim for the current transaction. RLS policies (added in 20260508122000)
-- read this setting via current_setting('request.jwt.claim.tenant_id', true).
--
-- This migration ships ALONE first (no RLS yet) so that Edge Functions can be
-- updated and deployed to call set_tenant_context safely. Once every relevant
-- Edge Function is live, the next migration enables RLS on the scope set.
--
-- Idempotent via CREATE OR REPLACE.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_tenant_context(tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.tenant_id', tenant_id::text, true);
END;
$$;

COMMENT ON FUNCTION public.set_tenant_context(uuid) IS
  'FR-162 J2 — pins request.jwt.claim.tenant_id for the current transaction. Called by Edge Functions via supabase.rpc(''set_tenant_context'', { tenant_id }) before any user-scoped query so RLS policies can read the tenant context. Transaction-scoped (set_config third arg true) to prevent leakage between concurrent requests.';

-- Allow authenticated and anon roles to call this RPC (it sets a session-scoped
-- GUC; no privilege escalation possible since the value is what the caller claims).
GRANT EXECUTE ON FUNCTION public.set_tenant_context(uuid) TO authenticated, anon, service_role;

COMMIT;
