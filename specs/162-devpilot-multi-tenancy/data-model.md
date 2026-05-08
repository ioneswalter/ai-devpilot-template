# Data Model — FR-162 DevPilot Multi-Tenancy Foundation

## New table: `tenants`

```sql
CREATE TABLE IF NOT EXISTS public.tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.tenants (code, name)
VALUES ('ownyourgig', 'OwnYourGig App')
ON CONFLICT (code) DO NOTHING;
```

## New SQL helper: `get_default_tenant_id()`

```sql
CREATE OR REPLACE FUNCTION public.get_default_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.tenants WHERE code = 'ownyourgig' LIMIT 1;
$$;
```

`STABLE` (rather than `IMMUTABLE`) because the seed row's UUID is read once per migration but the function is allowed to be re-evaluated across transactions.

## Scope set — 28 tables

Every table below gets a `tenant_id uuid NOT NULL REFERENCES tenants(id)` column with an index on `(tenant_id)`. Migration `ADD COLUMN IF NOT EXISTS` is replay-safe; backfill UPDATEs are idempotent; NOT NULL escalation is gated on a zero-NULL count.

### Spec stage (5)

- `product_features` — root entity
- `feature_versions` — version snapshots (FR-149)
- `feature_spec_artifacts` — spec.md / plan.md / tasks.md / etc.
- `spec_reviews` — AI review records
- `review_items` — per-criterion review state

### Build stage (4)

- `implementation_requests` — build run header
- `implementation_task_items` — per-task progress
- `pipeline_runs` — pipeline orchestrator state
- `pipeline_queue` — pending pipeline jobs (FR-119)
- `pipeline_failures` — pipeline error history
- `pipeline_notifications` — pipeline alerts

(Build stage actually has 6 tables; the 4 vs 6 grouping is just for readability — all 6 are in scope.)

### Test stage (6)

- `test_cases` — Given/When/Then catalogue
- `test_runs` — execution evidence (FR-145 v1.1)
- `test_data_sets` — generated fixtures
- `test_failure_guidance` — AI fix hints (FR-109 v2)
- `automated_test_scripts` — E2E scripts
- `api_verification_tests` — API tests

### UAT stage (5)

- `uat_packages` — UAT review packages (FR-130 v2)
- `uat_checklist_items` — per-criterion checklist
- `uat_review_decisions` — BP decisions
- `uat_review_audit` — decision audit log
- `uat_scenarios` — curated UAT scenarios (FR-141)
- `bp_review_projections` — BP-friendly projection layer (FR-130 v2.1)

### Cross-cutting (5)

- `feature_dependencies` — inter-feature DAG
- `feature_comments` — discussion threads
- `feature_ratings` — feedback ratings
- `prompt_templates` — Ideation prompt library
- `prompt_categories` — prompt taxonomy
- `prompt_ratings` — prompt feedback

**Total: 28 tables.** Full enumeration is the source of truth for J1's migration and J4's verifier extension.

## Migrations

### Migration 1 (J1): tenants table + scope-set columns + backfill

Pseudocode (full SQL in `supabase/migrations/<timestamp>_fr162_j1_tenants_and_scope_columns.sql`):

```sql
BEGIN;

-- 1. Tenants table + helper
CREATE TABLE IF NOT EXISTS tenants (...);
INSERT INTO tenants (code, name) VALUES ('ownyourgig', 'OwnYourGig App') ON CONFLICT (code) DO NOTHING;
CREATE OR REPLACE FUNCTION get_default_tenant_id() ...;

-- 2. For each of 28 scoped tables — same pattern, replay-safe
DO $$
DECLARE
  t text;
  scoped_tables text[] := ARRAY['product_features','feature_versions',...]; -- 28 entries
  default_id uuid := get_default_tenant_id();
BEGIN
  FOREACH t IN ARRAY scoped_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES tenants(id)', t);
    EXECUTE format('UPDATE public.%I SET tenant_id = $1 WHERE tenant_id IS NULL', t) USING default_id;
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I (tenant_id)', t || '_tenant_id_idx', t);
    -- NOT NULL escalation — guarded so replay is idempotent
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name=t AND column_name='tenant_id' AND is_nullable='NO'
    ) THEN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    END IF;
  END LOOP;
END $$;

COMMIT;
```

### Migration 2 (J2): Enable RLS on scope set

```sql
BEGIN;

DO $$
DECLARE
  t text;
  scoped_tables text[] := ARRAY[...same 28 names...];
BEGIN
  FOREACH t IN ARRAY scoped_tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_isolation', t);
    EXECUTE format($pol$
      CREATE POLICY %I ON public.%I
      FOR ALL
      TO authenticated
      USING (tenant_id = current_setting('request.jwt.claim.tenant_id', true)::uuid)
      WITH CHECK (tenant_id = current_setting('request.jwt.claim.tenant_id', true)::uuid)
    $pol$, t || '_tenant_isolation', t);
  END LOOP;
END $$;

COMMIT;
```

`TO authenticated` scopes the policy to authenticated users — service role's BYPASS isn't affected.

## Read-path / write-path changes

### Edge Functions (J3)

Every authenticated Edge Function gets a one-line addition near the top of its handler:

```ts
// FR-162 J3 — set tenant context for RLS
const tenantId = resolveTenantId(req); // reads JWT claim or falls back to get_default_tenant_id()
await supabase.rpc('set_tenant_context', { tenant_id: tenantId });
```

Where `set_tenant_context` is a tiny RPC wrapper around `set_config`:

```sql
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
```

The RPC pattern is needed because `set_config` is a Postgres-internal function and Edge Functions interact via the Supabase client, not raw SQL.

### Backwards compatibility

- Service role queries via the admin client (most batch scripts) bypass RLS naturally — no change needed.
- The existing `update-handler.ts:200` test_runs evidence check (FR-106 v2) runs as service role — preserved.
- The FR-130 v2.1 trigger function `fr130_v21_promote_feature_on_uat_package_approval()` runs as `SECURITY DEFINER` — bypasses RLS — preserved.
