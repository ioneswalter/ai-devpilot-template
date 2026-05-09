-- FR-164 J3 — memory_promotion_audit table.
--
-- Append-only audit of every private→shared promotion executed by the
-- promote-memory-row Edge Function. Captures the source row, the source
-- tenant (so a BP can see their own promotions later), the BP that
-- triggered it, and a JSON diff describing what anonymisation
-- replacements were performed.
--
-- RLS:
--   * INSERT — service_role only (never authenticated). The Edge Function
--     runs under service_role for the audit insert specifically; the user
--     UPDATE that flips visibility runs under the caller's JWT.
--   * SELECT — BPs see rows where source_tenant_id matches their tenant
--     (FR-162 COALESCE pattern).
--   * UPDATE / DELETE — no policy → blocked for everyone (append-only).
--
-- Replay-safe: idempotent CREATE TABLE / INDEX / POLICY guards throughout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.memory_promotion_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table text NOT NULL,
  source_row_id uuid NOT NULL,
  source_tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  promoted_by uuid NOT NULL REFERENCES auth.users(id),
  anonymisation_diff jsonb NOT NULL DEFAULT '[]'::jsonb,
  requires_human_review boolean NOT NULL DEFAULT false,
  promoted_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT memory_promotion_audit_source_table_check
    CHECK (source_table IN ('prompt_templates', 'ai_learnings'))
);

CREATE INDEX IF NOT EXISTS memory_promotion_audit_tenant_idx
  ON public.memory_promotion_audit (source_tenant_id);
CREATE INDEX IF NOT EXISTS memory_promotion_audit_source_idx
  ON public.memory_promotion_audit (source_table, source_row_id);
CREATE INDEX IF NOT EXISTS memory_promotion_audit_promoted_by_idx
  ON public.memory_promotion_audit (promoted_by);

ALTER TABLE public.memory_promotion_audit ENABLE ROW LEVEL SECURITY;

-- BP-readable subset (own tenant, FR-162 COALESCE pattern). No INSERT,
-- UPDATE, or DELETE for authenticated — service_role only.
DROP POLICY IF EXISTS memory_promotion_audit_select ON public.memory_promotion_audit;
CREATE POLICY memory_promotion_audit_select ON public.memory_promotion_audit
  FOR SELECT
  TO authenticated
  USING (
    source_tenant_id = COALESCE(
      NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid,
      public.get_default_tenant_id()
    )
  );

-- Explicit service_role bypass for INSERT (gives us a named policy for
-- audit visibility; service_role bypasses RLS natively but documenting
-- the intent here helps future RLS reviewers).
DROP POLICY IF EXISTS memory_promotion_audit_insert_service_role ON public.memory_promotion_audit;
CREATE POLICY memory_promotion_audit_insert_service_role ON public.memory_promotion_audit
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS memory_promotion_audit_select_service_role ON public.memory_promotion_audit;
CREATE POLICY memory_promotion_audit_select_service_role ON public.memory_promotion_audit
  FOR SELECT
  TO service_role
  USING (true);

COMMENT ON TABLE public.memory_promotion_audit IS
  'FR-164 J3 — append-only audit of private→shared row promotions on prompt_templates / ai_learnings. INSERT only via service_role from the promote-memory-row Edge Function. No UPDATE/DELETE policy = blocked for all roles except superuser.';

COMMIT;
