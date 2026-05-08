-- FR-163 J3 — api_audit_log: per-request audit entries written by withApiGateway.
--
-- Captures every gateway-routed request (success, error, rate-limited) for
-- operational visibility and to feed FR-167 billing meters. Writes are
-- fire-and-forget from the middleware — failed inserts log to console; the
-- user request is never blocked.

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.get_default_tenant_id() REFERENCES public.tenants(id),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code int NOT NULL,
  duration_ms int NOT NULL,
  error_code text NULL,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_audit_log_tenant_created_idx
  ON public.api_audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_audit_log_api_key_idx
  ON public.api_audit_log (api_key_id, created_at DESC);

ALTER TABLE public.api_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_audit_log_tenant_isolation ON public.api_audit_log;
CREATE POLICY api_audit_log_tenant_isolation ON public.api_audit_log
  FOR ALL
  TO authenticated
  USING (
    tenant_id = COALESCE(
      NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid,
      public.get_default_tenant_id()
    )
  )
  WITH CHECK (
    tenant_id = COALESCE(
      NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid,
      public.get_default_tenant_id()
    )
  );

COMMENT ON TABLE public.api_audit_log IS
  'FR-163 J3 — per-request gateway audit log. Written fire-and-forget by withApiGateway. Used by FR-167 billing.';

COMMIT;
