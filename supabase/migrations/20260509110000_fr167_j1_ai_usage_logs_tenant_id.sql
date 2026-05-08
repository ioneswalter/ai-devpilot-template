-- FR-167 J1 — Add tenant_id to ai_usage_logs (FR-162 alignment).
--
-- The ai_usage_logs table predates FR-162 and has no tenant_id. Every Edge
-- Function that writes to it (devpilot-chat, dedup-check, prompt-library,
-- claude-stream, etc.) currently writes without setting tenant_id. The
-- DEFAULT public.get_default_tenant_id() makes those writes safely land
-- under OwnYourGig with no code change required for the foundation phase.
--
-- After this migration, FR-167 J2's compute_usage_rollup can aggregate
-- ai_usage_logs per tenant for billing.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, gated NOT NULL escalation,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY.

BEGIN;

-- 1. Add column with DEFAULT (handles existing-row backfill via DEFAULT)
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid
    REFERENCES public.tenants(id)
    DEFAULT public.get_default_tenant_id();

-- 2. Backfill any pre-existing NULLs (idempotent)
UPDATE public.ai_usage_logs
   SET tenant_id = public.get_default_tenant_id()
 WHERE tenant_id IS NULL;

-- 3. Gated NOT NULL escalation
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'ai_usage_logs'
       AND column_name = 'tenant_id'
       AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.ai_usage_logs ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

-- 4. Index
CREATE INDEX IF NOT EXISTS ai_usage_logs_tenant_id_idx ON public.ai_usage_logs (tenant_id);

-- 5. Enable RLS + tenant_isolation policy (FR-162 COALESCE pattern)
ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_usage_logs_tenant_isolation ON public.ai_usage_logs;
CREATE POLICY ai_usage_logs_tenant_isolation ON public.ai_usage_logs
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

COMMIT;
