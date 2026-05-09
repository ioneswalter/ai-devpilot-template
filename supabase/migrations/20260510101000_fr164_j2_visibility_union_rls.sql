-- FR-164 J2 — Visibility tier (private/shared) on prompt_templates + ai_learnings.
--
-- Adds a `visibility` column with a CHECK constraint, and replaces the
-- per-table tenant_isolation policy with a union policy:
--
--   USING (visibility = 'shared' OR tenant_id = COALESCE(...))
--
-- A tenant sees its own private rows AND every shared row. WITH CHECK still
-- enforces single-tenant writes — only the FR-164 J3 promote-memory-row Edge
-- Function (running under service_role) flips visibility from 'private' to
-- 'shared'.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, DROP POLICY IF EXISTS before
-- CREATE POLICY.

BEGIN;

-- =============================================================================
-- prompt_templates
-- =============================================================================

ALTER TABLE public.prompt_templates
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'prompt_templates_visibility_check'
  ) THEN
    ALTER TABLE public.prompt_templates
      ADD CONSTRAINT prompt_templates_visibility_check
      CHECK (visibility IN ('private', 'shared'));
  END IF;
END $$;

DROP POLICY IF EXISTS prompt_templates_tenant_isolation ON public.prompt_templates;
DROP POLICY IF EXISTS prompt_templates_visibility ON public.prompt_templates;
CREATE POLICY prompt_templates_visibility ON public.prompt_templates
  FOR ALL
  TO authenticated
  USING (
    visibility = 'shared'
    OR tenant_id = COALESCE(
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

-- =============================================================================
-- ai_learnings
-- =============================================================================

ALTER TABLE public.ai_learnings
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_schema = 'public'
       AND constraint_name = 'ai_learnings_visibility_check'
  ) THEN
    ALTER TABLE public.ai_learnings
      ADD CONSTRAINT ai_learnings_visibility_check
      CHECK (visibility IN ('private', 'shared'));
  END IF;
END $$;

DROP POLICY IF EXISTS ai_learnings_tenant_isolation ON public.ai_learnings;
DROP POLICY IF EXISTS ai_learnings_visibility ON public.ai_learnings;
CREATE POLICY ai_learnings_visibility ON public.ai_learnings
  FOR ALL
  TO authenticated
  USING (
    visibility = 'shared'
    OR tenant_id = COALESCE(
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
