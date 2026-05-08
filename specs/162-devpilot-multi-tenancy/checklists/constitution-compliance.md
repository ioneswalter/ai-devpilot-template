# Constitution Compliance — FR-162

Generated 2026-05-08 after the build phase shipped. Three migrations + one TypeScript edit reviewed against [.specify/memory/constitution.md](../../../.specify/memory/constitution.md).

## Files modified or created

| File                                                                        | Status   | Lines     | Purpose                                                                                                                         |
| --------------------------------------------------------------------------- | -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260508120000_fr162_j1_tenants_and_scope_columns.sql` | created  | +130      | J1 — tenants table, helper, 29-table column adds + backfill + indexes + NOT NULL                                                |
| `supabase/migrations/20260508121000_fr162_j2_prep_tenant_rpc.sql`           | created  | +29       | J2 prep — `set_tenant_context` RPC (retained as forward-compat for FR-163; not used in foundation RLS path)                     |
| `supabase/migrations/20260508122000_fr162_j2_rls_policies.sql`              | created  | +90       | J2 — ENABLE RLS + per-table `<table>_tenant_isolation` policy using `auth.jwt() ->> 'tenant_id'` COALESCE fallback              |
| `supabase/migrations/20260508123000_fr162_j2b_drop_permissive_policies.sql` | created  | +75       | J2b (build-discovered) — drop 18 pre-existing permissive `qual=true` policies that would have OR-bypassed tenant_isolation      |
| `scripts/verify-rls-status.ts`                                              | modified | +50 / 433 | J4 — added `FR162_SCOPE_TABLES` constant + `TC-FR162-J4-01` test asserting every scoped table has RLS + tenant_isolation policy |
| `specs/162-devpilot-multi-tenancy/*`                                        | spec     | —         | spec.md, plan.md, research.md, tasks.md, data-model.md, quickstart.md, 2 contracts (out of scope for code constitution gates)   |

## Constitution gate results

| Principle                                  | Outcome | Notes                                                                                                                                                                                                                                           |
| ------------------------------------------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **II. TypeScript-First (Strict Mode)**     | PASS    | No `any` introduced. `verify-rls-status.ts` extension uses existing typed shapes. `pnpm tsc -b` clean.                                                                                                                                          |
| **VI. SOLID & file-size limits**           | PASS    | All migrations under 130 lines. `verify-rls-status.ts` grew from ~400 to ~433 lines, under the 300-line guidance for individual functions but file-level approaching the cap — acceptable for a verifier with multiple TC-blocks.               |
| **VIII. Security Engineering**             | PASS    | This feature **is** the security mandate (constitution principle VIII). RLS enabled on 29 scoped tables. Service role bypass preserved for ops scripts. Permissive `qual=true` policies dropped. `pnpm verify:rls` reports 8/8 PASS.            |
| **IX. Performance Engineering**            | PASS    | Per-tenant policy is a single equality with COALESCE; `(tenant_id)` index on every scoped table makes the WHERE clause sub-ms. Backfill ran in seconds across ~30k rows.                                                                        |
| **XI. Verification-Driven Implementation** | PASS    | Each phase ended with verification: J1 → SQL audit (29/29 ready); J2 → smoke (anon=0, sr=162, edge fn=200); J2b → policy audit; J4 → 8/8 verify:rls; regression → FR-130/161/106 all 4/4.                                                       |
| **III. API-First**                         | PASS    | No API surface changed. `pipeline-status` response shape unchanged; frontend untouched.                                                                                                                                                         |
| **Migration replay safety**                | PASS    | `IF NOT EXISTS`, gated NOT NULL escalation, `ON CONFLICT DO NOTHING` for the seed, `DROP POLICY IF EXISTS` before each `CREATE POLICY`. All 4 migrations are replay-safe.                                                                       |
| **Backwards compatibility**                | PASS    | Single-tenant flows behave identically: existing OwnYourGig admin user (JWT without tenant_id claim) sees all OwnYourGig data via the COALESCE fallback. Service role admin scripts unchanged. GitHub App webhook (FR-147) processes unchanged. |

## Build-time scope change (transparent)

The original spec had four journeys (J1 schema, J2 RLS via set_config, J3 Edge Function tenant resolution, J4 verifier). During build I discovered the set_config approach wouldn't work in production:

- `set_config(..., true)` is **transaction-scoped** in Postgres
- Supabase JS client calls go through PostgREST as **separate HTTP requests, each in its own transaction**
- A `supabase.rpc('set_tenant_context', ...)` call's GUC would not carry to the next `supabase.from(...)` query

Replacement (now shipped): RLS policies use `auth.jwt() ->> 'tenant_id'` directly. PostgREST extracts JWT claims into `auth.jwt()` natively per request — no helper needed. `COALESCE(..., get_default_tenant_id())` falls back to OwnYourGig for callers without a claim, preserving single-tenant behaviour during the foundation phase. FR-163 will tighten the COALESCE once JWT minting includes tenant_id.

J3's 33 Edge Function diffs are deferred to FR-163. Net scope reduction: 11 tasks shipped vs 18 planned, with no behaviour gap (the deferred path was structurally redundant).

## Build-time addition (transparent)

J2b was added during build after auditing pre-existing policies. 18 permissive `qual=true` policies on the scope set targeting `{public}` or `{authenticated}` would have OR-bypassed the new tenant_isolation policy. They were dropped in a follow-up migration (`20260508123000_fr162_j2b_drop_permissive_policies.sql`). Service-role-named permissive policies kept — redundant with Postgres BYPASS but harmless.

## Manual sign-off (build-stage)

All 5 test_cases (TC-162-01 through TC-162-05) carry `test_runs.result='passed'` rows with `evidence.type='manual'` referencing the verification artefacts:

- TC-162-01: tenants seed + helper verified via direct SQL (`get_default_tenant_id()` returned the seeded UUID)
- TC-162-02: 29/29 tables passed `is_nullable=NO + has_index=true + null_count=0` audit
- TC-162-03: anon=0, authenticated-no-claim=162, service-role=162 — three-way isolation matrix verified
- TC-162-04: `pnpm verify:rls` returned 8/8 PASS including TC-FR162-J4-01 (29/29 protected)
- TC-162-05: `pnpm verify:feature FR-130/161/106 --stage test` all 4/4 PASS post-RLS

Same admin sign-off pattern used on FR-130/FR-161/FR-106 in this session.

## No violations to report

No `any`-types introduced; no migrations exceed limits; no RLS regressions (this feature ADDS RLS on 29 tables); bootstrap exemption preserved (FR-161 verifier still PASSES); existing `update-handler.ts:200` evidence check (FR-106 v2) still functions because service role bypasses RLS.
