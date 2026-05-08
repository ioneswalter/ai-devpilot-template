-- FR-163 J1 — api_keys table for the DevPilot API gateway.
--
-- Holds hashed API keys per tenant. The raw key is never persisted; only the
-- SHA-256 hash and a short prefix for human identification. Issuance returns
-- the raw value ONCE via the admin endpoint; subsequent reads expose only the
-- prefix and metadata.
--
-- RLS follows the FR-162 COALESCE pattern. Service role bypasses RLS so the
-- gateway middleware (running as service role) can perform key lookups across
-- all tenants.

BEGIN;

CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.get_default_tenant_id() REFERENCES public.tenants(id),
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  name text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  rate_limit_per_minute int NOT NULL DEFAULT 60,
  expires_at timestamptz NULL,
  revoked_at timestamptz NULL,
  last_used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS api_keys_tenant_id_idx ON public.api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_active_idx
  ON public.api_keys (tenant_id, revoked_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_keys_tenant_isolation ON public.api_keys;
CREATE POLICY api_keys_tenant_isolation ON public.api_keys
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

COMMENT ON TABLE public.api_keys IS
  'FR-163 J1 — DevPilot API gateway keys. Raw key is never stored; only SHA-256 hash + 8-char prefix for identification. Issuance via admin endpoint returns raw value ONCE.';

COMMIT;
