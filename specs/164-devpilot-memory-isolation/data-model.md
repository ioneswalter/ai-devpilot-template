# Data Model — FR-164

## Phase J1: Patch FR-162 gaps

### `ai_learnings` (existing — patch)

| Column        | Type | Change                                                                                                              |
| ------------- | ---- | ------------------------------------------------------------------------------------------------------------------- |
| `tenant_id`   | uuid | **ADD**: NOT NULL DEFAULT JWT-aware FK to `tenants(id)`                                                             |
| `(tenant_id)` | idx  | **ADD INDEX**                                                                                                       |
| RLS policy    | —    | **ENABLE RLS**, add `ai_learnings_tenant_isolation` (FR-162 COALESCE pattern) — superseded by Phase J2 union policy |

Backfill: existing rows → `get_default_tenant_id()`.

### `ideation_conversations` (existing — patch)

| Column        | Type | Change                                                                                                  |
| ------------- | ---- | ------------------------------------------------------------------------------------------------------- |
| `tenant_id`   | uuid | **ADD**: NOT NULL DEFAULT JWT-aware FK to `tenants(id)`                                                 |
| `(tenant_id)` | idx  | **ADD INDEX**                                                                                           |
| RLS policy    | —    | **ENABLE RLS**, add `ideation_conversations_tenant_isolation` (FR-162 COALESCE pattern, no shared tier) |

Backfill: existing rows → `get_default_tenant_id()`.

## Phase J2: Visibility tier

### `prompt_templates` (existing — patch)

| Column       | Type | Change                                                                                     |
| ------------ | ---- | ------------------------------------------------------------------------------------------ |
| `visibility` | text | **ADD**: NOT NULL DEFAULT `'private'` CHECK (visibility IN (`'private'`,`'shared'`))       |
| RLS policy   | —    | **REPLACE** existing `prompt_templates_tenant_isolation` with union policy (see SQL below) |

### `ai_learnings` (further patch from J1)

| Column       | Type | Change                                                                               |
| ------------ | ---- | ------------------------------------------------------------------------------------ |
| `visibility` | text | **ADD**: NOT NULL DEFAULT `'private'` CHECK (visibility IN (`'private'`,`'shared'`)) |
| RLS policy   | —    | **REPLACE** the J1 `ai_learnings_tenant_isolation` with union policy                 |

### Union RLS pattern (applied to both tables)

```sql
DROP POLICY IF EXISTS prompt_templates_tenant_isolation ON public.prompt_templates;

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
```

Note: WITH CHECK does NOT include `visibility='shared'` — INSERT/UPDATE always writes to the caller's tenant; only the promotion Edge Function (service-role) can flip `visibility` to `'shared'`.

## Phase J3: Promotion audit

### `memory_promotion_audit` (new)

| Column                  | Type                               | Notes                                                            |
| ----------------------- | ---------------------------------- | ---------------------------------------------------------------- |
| `id`                    | uuid PK                            | gen_random_uuid()                                                |
| `source_table`          | text NOT NULL                      | CHECK in (`'prompt_templates'`,`'ai_learnings'`)                 |
| `source_row_id`         | uuid NOT NULL                      | The promoted row's id (no FK — row is mutated, not deleted)      |
| `source_tenant_id`      | uuid NOT NULL FK `tenants(id)`     | Tenant that owned the row before promotion                       |
| `promoted_by`           | uuid NOT NULL FK `auth.users(id)`  | BP that triggered the promotion                                  |
| `anonymisation_diff`    | jsonb NOT NULL                     | Array of `{column, before_excerpt, after_excerpt, replacements}` |
| `requires_human_review` | bool NOT NULL DEFAULT false        | Flagged when replacements > 2 OR context non-empty post-replace  |
| `promoted_at`           | timestamptz NOT NULL DEFAULT now() |

**Indexes**: `(source_tenant_id)`, `(source_table, source_row_id)`, `(promoted_by)`.

**RLS**:

- INSERT: `service_role` only. (No INSERT for `authenticated`.)
- SELECT: BPs see audit rows where `source_tenant_id` matches their tenant (FR-162 COALESCE).
- UPDATE / DELETE: nobody — append-only.

## Phase J4: Constitution overrides

### `tenant_constitution_overrides` (new)

| Column                              | Type                                             | Notes                                                  |
| ----------------------------------- | ------------------------------------------------ | ------------------------------------------------------ |
| `id`                                | uuid PK                                          | gen_random_uuid()                                      |
| `tenant_id`                         | uuid NOT NULL DEFAULT JWT-aware FK `tenants(id)` | Same FR-162 v1.1 pattern                               |
| `principle_key`                     | text NOT NULL                                    | Slug matching a heading in shared `constitution.md`    |
| `override_text`                     | text NOT NULL                                    | The principle text to layer on top                     |
| `non_negotiable_strengthen_only`    | bool NOT NULL DEFAULT true                       | Codegen merger checks this; can't weaken NN principles |
| `created_by`                        | uuid NOT NULL FK `auth.users(id)`                |
| `created_at`                        | timestamptz NOT NULL DEFAULT now()               |
| `updated_at`                        | timestamptz NOT NULL DEFAULT now()               |
| `UNIQUE (tenant_id, principle_key)` |

**RLS**: COALESCE pattern (private to the tenant). Authenticated BPs can SELECT/INSERT/UPDATE their own tenant's overrides.

## Verifier impact

`scripts/verify-rls-status.ts` `FR162_SCOPE_TABLES` extends from 33 → 35 by adding `'ai_learnings'` and `'ideation_conversations'`. New tables `memory_promotion_audit` and `tenant_constitution_overrides` are NOT in the FR-162 scope set (they're FR-164 native, but they DO have RLS, and the verifier's protected-tables count rolls them in for general RLS coverage).

The verifier also gains a new check: `verifyVisibilityUnion()` — inserts two rows in different tenants with `visibility='private'`, queries as tenant A under a JWT with `tenant_id=A`, asserts the result includes A's row but NOT B's, then re-runs after flipping B's row to `'shared'` and asserts B's row IS now visible.
