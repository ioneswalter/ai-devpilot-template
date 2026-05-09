-- FR-164 J1 — Add tenant_id to ai_learnings and ideation_conversations.
--
-- Both tables are part of DevPilot's institutional memory and were missed
-- by FR-162's scope set. ai_learnings is written every codegen cycle by
-- learning-logger.ts (called from 6+ Edge Functions); ideation_conversations
-- holds the BP's ideation chats.
--
-- DEFAULT uses the FR-162 v1.1 JWT-aware expression: reads the calling
-- request's `request.jwt.claim.tenant_id` GUC first, falls back to OwnYourGig
-- when no JWT is in scope (Edge Function service-role calls, ops scripts).
-- This keeps the existing 6+ writers working unchanged.
--
-- Replay-safe: ADD COLUMN IF NOT EXISTS, gated NOT NULL escalation,
-- CREATE INDEX IF NOT EXISTS, DROP POLICY IF EXISTS before CREATE POLICY.

BEGIN;

-- =============================================================================
-- ai_learnings
-- =============================================================================

ALTER TABLE public.ai_learnings
  ADD COLUMN IF NOT EXISTS tenant_id uuid
    REFERENCES public.tenants(id)
    DEFAULT COALESCE(
      NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid,
      public.get_default_tenant_id()
    );

UPDATE public.ai_learnings
   SET tenant_id = public.get_default_tenant_id()
 WHERE tenant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'ai_learnings'
       AND column_name = 'tenant_id'
       AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.ai_learnings ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ai_learnings_tenant_id_idx ON public.ai_learnings (tenant_id);

ALTER TABLE public.ai_learnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_learnings_tenant_isolation ON public.ai_learnings;
CREATE POLICY ai_learnings_tenant_isolation ON public.ai_learnings
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

-- =============================================================================
-- ideation_conversations
-- =============================================================================

ALTER TABLE public.ideation_conversations
  ADD COLUMN IF NOT EXISTS tenant_id uuid
    REFERENCES public.tenants(id)
    DEFAULT COALESCE(
      NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid,
      public.get_default_tenant_id()
    );

UPDATE public.ideation_conversations
   SET tenant_id = public.get_default_tenant_id()
 WHERE tenant_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'ideation_conversations'
       AND column_name = 'tenant_id'
       AND is_nullable = 'YES'
  ) THEN
    ALTER TABLE public.ideation_conversations ALTER COLUMN tenant_id SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ideation_conversations_tenant_id_idx ON public.ideation_conversations (tenant_id);

ALTER TABLE public.ideation_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ideation_conversations_tenant_isolation ON public.ideation_conversations;
CREATE POLICY ideation_conversations_tenant_isolation ON public.ideation_conversations
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
