# Tasks — FR-162 DevPilot Multi-Tenancy Foundation

**Branch**: `001-coop-marketplace-platform`
**Total tasks shipped**: 11 (J1: 5, J2: 3, J2b: 1 build-discovered, J4: 2)
**Tasks deferred**: 6 (J3 Edge Function diffs — superseded mid-build by `auth.jwt()` COALESCE pattern; documented below)

## Build-time scope change

The original spec listed J3 (Edge Function tenant resolution via `set_config` + RPC). During build I discovered that `set_config(..., true)` is transaction-scoped and won't carry across separate Supabase JS client calls — each `supabase.from(...)` is a new HTTP/PostgREST request, its own transaction, with no inherited GUC. The set_config-via-RPC pattern would not actually have enforced isolation.

Replacement: native Supabase pattern using `auth.jwt() ->> 'tenant_id'` directly inside the RLS policy, with `COALESCE(..., get_default_tenant_id())` fallback for callers whose JWTs don't yet carry a tenant_id claim. This is per-request automatic — no Edge Function modifications needed for the foundation phase. FR-163 (API Gateway + Customer Auth) will tighten the COALESCE once JWT minting bakes in tenant_id.

J3 tasks T010–T015 are deferred — kept in this file as a pointer for FR-163 to pick up the same pattern.

J2b was added during build to drop 18 pre-existing permissive `qual=true` policies on the scope set that would have OR-bypassed the new tenant_isolation policy.

## Phase J1 — Tenants table + scope-set columns + backfill (Priority: P1) — COMPLETE

- [x] T001 [J1] Audit production schema — confirmed 29 tables exist, none have `tenant_id` yet.
- [x] T002 [J1] Migration `supabase/migrations/20260508120000_fr162_j1_tenants_and_scope_columns.sql` — tenants table + seed + helper.
- [x] T003 [J1] Same migration — per-table loop for `ADD COLUMN`, backfill, index, gated NOT NULL escalation.
- [x] T004 [J1] Applied via `supabase db push`. All 29 tables: `is_nullable=NO`, `has_index=true`, zero NULL counts.
- [x] T005 [J1] Smoke: kanban renders, FR-130 verifier 4/4 PASS, no isolation yet (expected).

## Phase J2 — RLS policies on scope set (Priority: P2) — COMPLETE

- [x] T006 [J2] Created `set_tenant_context(tenant_id uuid)` RPC in `supabase/migrations/20260508121000_fr162_j2_prep_tenant_rpc.sql`. Note: now retained as a forward-compat helper for FR-163; not used in foundation-phase RLS path.
- [x] T007 [J2] Created `supabase/migrations/20260508122000_fr162_j2_rls_policies.sql` — per-table loop using `auth.jwt() ->> 'tenant_id'` with COALESCE fallback (NOT the original set_config approach; see Build-time scope change above).
- [x] T008 [J2] Audited pre-existing permissive policies — 18 found that would OR-bypass tenant_isolation. Decision: drop them all (kept service-role-named ones since service role bypasses RLS natively anyway).
- [x] T009 [J2b] Created `supabase/migrations/20260508123000_fr162_j2b_drop_permissive_policies.sql` — DO loop drops every `qual='true'` policy on the scope set targeting `{public}` or `{authenticated}`. Service-role-named permissive policies kept (redundant but harmless).

## Phase J3 — Edge Function tenant resolution (DEFERRED)

- [ ] T010 [J3] DEFERRED — `_shared/tenant-resolution.ts` helper. Superseded by `auth.jwt()` COALESCE in the RLS policy itself. FR-163 will create this helper with API-key resolution semantics when customer auth lands.
- [ ] T011 [J3] DEFERRED — Edge Function diffs across 33 functions. Not needed: PostgREST extracts JWT claims into `auth.jwt()` automatically per request; the policy reads from there directly.
- [ ] T012 [J3] DEFERRED — github-app-webhook (FR-147) tenant context. Webhook calls reach the function with no JWT; the COALESCE fallback in the policy resolves to OwnYourGig automatically. Verified by smoke-running the existing FR-147 path.
- [ ] T013 [J3] DEFERRED — debug logging.
- [ ] T014 [J3] DEFERRED — bulk Edge Function redeploy.
- [ ] T015 [J3] DEFERRED — Edge Function smoke matrix.

## Phase J4 — Verifier extension + regression — COMPLETE

- [x] T016 [J4] Extended `scripts/verify-rls-status.ts` with `FR162_SCOPE_TABLES` constant + `TC-FR162-J4-01` check that asserts every scoped table has RLS enabled and a `<table>_tenant_isolation` policy.
- [x] T017 [J4] `pnpm verify:rls` → **8/8 PASS** including TC-FR162-J4-01 (29/29 tables protected).
- [x] T018 [J4] Regression: `pnpm verify:feature FR-130/161/106 --stage test` all returned exit 0 unchanged.

## Verification gate

`pnpm verify:feature FR-162 --stage build` runs after pipeline records are populated. Constitution compliance report in [checklists/constitution-compliance.md](checklists/constitution-compliance.md).
