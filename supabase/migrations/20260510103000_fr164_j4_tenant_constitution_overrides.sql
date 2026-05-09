-- FR-164 J4 — tenant_constitution_overrides table.
--
-- Lets a tenant override individual numbered principles in
-- .specify/memory/constitution.md without forking the file. The codegen
-- merger (scripts/lib/constitution-merger.ts) reads the shared markdown,
-- parses it into Map<principle_key, principle>, layers the tenant's
-- overrides on top, and runs constitution checks against the merged map.
--
-- non_negotiable_strengthen_only=true means the merger refuses to apply an
-- override that would weaken a principle marked NON-NEGOTIABLE in the
-- shared file. Only additive strengthening passes through.
--
-- Replay-safe: idempotent CREATE TABLE / INDEX / POLICY guards throughout.

BEGIN;

CREATE TABLE IF NOT EXISTS public.tenant_constitution_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.tenant_id', true), '')::uuid,
      public.get_default_tenant_id()
    )
    REFERENCES public.tenants(id),
  principle_key text NOT NULL,
  override_text text NOT NULL,
  non_negotiable_strengthen_only boolean NOT NULL DEFAULT true,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, principle_key)
);

CREATE INDEX IF NOT EXISTS tenant_constitution_overrides_tenant_idx
  ON public.tenant_constitution_overrides (tenant_id);

ALTER TABLE public.tenant_constitution_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_constitution_overrides_tenant_isolation ON public.tenant_constitution_overrides;
CREATE POLICY tenant_constitution_overrides_tenant_isolation ON public.tenant_constitution_overrides
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

DROP POLICY IF EXISTS tenant_constitution_overrides_service_role ON public.tenant_constitution_overrides;
CREATE POLICY tenant_constitution_overrides_service_role ON public.tenant_constitution_overrides
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.tenant_constitution_overrides IS
  'FR-164 J4 — per-tenant constitution principle overrides applied at codegen time by scripts/lib/constitution-merger.ts. UNIQUE (tenant_id, principle_key). Cannot weaken NON-NEGOTIABLE principles when non_negotiable_strengthen_only=true.';

COMMIT;
