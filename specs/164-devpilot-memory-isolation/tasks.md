# Tasks — FR-164 DevPilot Cross-Tenant Memory Isolation

**Branch**: `001-coop-marketplace-platform`
**Total tasks**: 13 (J1: 3, J2: 3, J3: 4, J4: 2, verifier: 1)

## Phase J1 — `ai_learnings` + `ideation_conversations` get `tenant_id` (Priority: P1)

- [x] T001 [J1] Create migration `supabase/migrations/<timestamp>_fr164_j1_memory_tables_tenant_id.sql`: `ai_learnings` and `ideation_conversations` each get `ADD COLUMN IF NOT EXISTS tenant_id` with FR-162 v1.1 JWT-aware DEFAULT, FK to `tenants(id)`, gated NOT NULL escalation, `(tenant_id)` index, RLS enable + `<table>_tenant_isolation` policy (FR-162 COALESCE pattern).
- [x] T002 [J1] Edit `scripts/verify-rls-status.ts`: add `'ai_learnings'` and `'ideation_conversations'` to `FR162_SCOPE_TABLES` (33 → 35).
- [x] T003 [J1] Apply migration via `supabase db push`. Verify per Quickstart J1.1 (zero NULL counts on both tables), J1.2 (`pnpm verify:rls` 35/35), J1.3 (existing learning-logger writers continue working).

## Phase J2 — Visibility tier with union RLS (Priority: P2)

- [x] T004 [J2] Create migration `supabase/migrations/<timestamp>_fr164_j2_visibility_union_rls.sql`: `ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared'))` to both `prompt_templates` and `ai_learnings`. `DROP POLICY IF EXISTS` on the existing `tenant_isolation` policies; `CREATE POLICY <table>_visibility` with the union USING/single-tenant WITH CHECK pattern from data-model.md.
- [x] T005 [J2] Apply migration. Smoke per Quickstart J2.1 (two-tenant private isolation — A doesn't see B's private row), J2.2 (flipping to shared makes the row visible to all tenants).
- [x] T006 [J2] Add a verifier check in `scripts/verify-rls-status.ts`: `verifyVisibilityUnion()` — inserts two rows in different tenants, sets the JWT claim via `set_config('request.jwt.claim.tenant_id', ...)`, asserts isolation, flips one to shared, re-asserts visibility. Function must clean up its own test rows.

## Phase J3 — Promotion workflow (Priority: P3)

- [x] T007 [J3] Create migration `supabase/migrations/<timestamp>_fr164_j3_memory_promotion_audit.sql` per data-model.md: `memory_promotion_audit` table + indexes + RLS (service-role INSERT only, BP SELECT own tenant, no UPDATE/DELETE policy at all).
- [x] T008 [J3] Create `supabase/functions/promote-memory-row/index.ts`: detect-and-route (FR-163 gateway path for `dp_*` keys; admin JWT path for users), validate body, enforce admin role, anonymise text columns (slug + name → `{{tenant}}` placeholder), in-place UPDATE to `visibility='shared'` + null `created_by`, INSERT audit row with `anonymisation_diff` and `requires_human_review` flag. Per `contracts/promote-memory-row-endpoint.md`.
- [x] T009 [J3] Deploy `promote-memory-row` via `npx supabase functions deploy promote-memory-row --no-verify-jwt`.
- [x] T010 [J3] Smoke per Quickstart J3.1 (admin promotion success + audit row), J3.2 (idempotent already_shared), J3.3 (non-admin 403), J3.4 (cross-tenant attempt blocked).

## Phase J4 — Tenant constitution overrides (Priority: P4)

- [x] T011 [J4] Create migration `supabase/migrations/<timestamp>_fr164_j4_tenant_constitution_overrides.sql` per data-model.md: `tenant_constitution_overrides` table with FR-162 v1.1 JWT-aware DEFAULT on `tenant_id`, UNIQUE `(tenant_id, principle_key)`, `non_negotiable_strengthen_only` boolean, RLS COALESCE policy.
- [x] T012 [J4] Create `scripts/lib/constitution-merger.ts`: parses `.specify/memory/constitution.md` into `Map<principle_key, { text, non_negotiable }>`, loads tenant overrides via service-role client, returns the merged map. Wire into the `\spec` and `\build` codegen entry points (the existing places that read `.specify/memory/constitution.md`). Smoke per Quickstart J4.1 (file-size-limits override applied) and J4.2 (typescript-strict weakening override IGNORED with a logged warning).

## Verifier extension

- [x] T013 Run `pnpm verify:rls` after all migrations land — expect 35/35 protected and `verifyVisibilityUnion` PASS. Run `pnpm verify:feature FR-130/161/106/162/163/167 --stage test` regression — all exit 0.

## Verification gate (mandatory)

After all 13 tasks complete: `pnpm verify:feature FR-164 --stage build` returns exit 0. Constitution compliance report in [checklists/constitution-compliance.md](checklists/constitution-compliance.md).
