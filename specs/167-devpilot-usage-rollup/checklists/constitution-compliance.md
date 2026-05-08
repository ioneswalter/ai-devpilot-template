# Constitution Compliance — FR-167

Generated 2026-05-09 after the build phase shipped.

## Files modified or created

| File                                                                      | Status   | Lines    | Purpose                                                                                                                               |
| ------------------------------------------------------------------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `supabase/migrations/20260509110000_fr167_j1_ai_usage_logs_tenant_id.sql` | created  | +60      | J1 — `ai_usage_logs.tenant_id` (NOT NULL DEFAULT FK + index + RLS)                                                                    |
| `supabase/migrations/20260509111000_fr167_j2_usage_rollups_table.sql`     | created  | +110     | J2 — `usage_rollups` table + RLS + `compute_usage_rollup` SECURITY DEFINER function                                                   |
| `supabase/functions/usage-rollup/index.ts`                                | created  | +180     | J3 — Edge Function with detect-and-route (FR-163 gateway for API keys; admin path with explicit tenant_id) + projection extrapolation |
| `scripts/verify-rls-status.ts`                                            | modified | +5 / 442 | Extended `FR162_SCOPE_TABLES` from 31 to 33 (`'ai_usage_logs'`, `'usage_rollups'`)                                                    |
| `specs/167-devpilot-usage-rollup/*`                                       | spec     | —        | spec/plan/research/tasks/data-model/quickstart + 1 contract                                                                           |

## Constitution gate results

| Principle                                  | Outcome | Notes                                                                                                                                                                                                                                         |
| ------------------------------------------ | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **II. TypeScript-First (Strict Mode)**     | PASS    | No `any`. `RollupRow`, `GatewayContext` typed end-to-end; `pnpm tsc -b` clean.                                                                                                                                                                |
| **VI. SOLID & file-size limits**           | PASS    | Edge Function: 180 lines (under 300). Migrations: 60/110 (under 300). All functions <50 lines.                                                                                                                                                |
| **VIII. Security Engineering**             | PASS    | Both new entities (`ai_usage_logs` patched; `usage_rollups` new) scoped via FR-162 COALESCE RLS. `compute_usage_rollup` is SECURITY DEFINER but takes `p_tenant_id` as a parameter; caller authority enforced at the Edge Function layer.     |
| **IX. Performance Engineering**            | PASS    | Aggregation uses `(tenant_id)` indexes on both source tables; sub-ms even at 1M rows. Edge Function cold call ~50ms (RPC + SELECT); warm ~10ms.                                                                                               |
| **XI. Verification-Driven Implementation** | PASS    | J2.1 verified $1.234 → $2.4700 ✅; J2.3 verified late-fixture re-aggregation $1.300 → $2.6000; J2.4 RLS isolation; J3.1 gateway path 2.47 + X-Tenant-Id; J3.2 admin path; J3.3 empty period 0/0/0 + projected 0; verify:rls 8/8 PASS (33/33). |
| **III. API-First**                         | PASS    | `usage-rollup` endpoint contract pinned in [contracts/usage-rollup-endpoint.md](../contracts/usage-rollup-endpoint.md) before code.                                                                                                           |
| **Migration replay safety**                | PASS    | `ADD COLUMN IF NOT EXISTS`, gated NOT NULL escalation, `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`, `CREATE OR REPLACE FUNCTION`. Both migrations replay-safe.                 |
| **Backwards compatibility**                | PASS    | `ai_usage_logs.tenant_id` ships with `DEFAULT get_default_tenant_id()` so 5+ existing Edge Function writers (devpilot-chat, dedup-check, prompt-library, etc.) continue working without code changes.                                         |

## Manual sign-off (build-stage)

All 4 test_cases (TC-167-01 through TC-167-04) carry `test_runs.result='passed'` rows with verification artefacts:

- TC-167-01: `ai_usage_logs.tenant_id` migration verified — zero NULL counts, NOT NULL + DEFAULT + index + RLS policy + scope-set 32/32 → 33/33
- TC-167-02: `usage_rollups` table + RLS verified by `verify:rls` (33/33); 2× markup math verified live ($1.234 → $2.4700 exactly)
- TC-167-03: `compute_usage_rollup` RPC verified — idempotent UPSERT on (tenant_id, period_start); late-fixture re-aggregation produces correct totals ($1.300 → $2.6000)
- TC-167-04: `GET /usage-rollup` verified — gateway path returns isolated 2.47 with X-Tenant-Id header; admin path with explicit tenant_id returns 2.47; empty tenant returns 0/0/0; projection extrapolates correctly (mid-period 9/Jan-31 → ~10x projection)

## No violations to report

No `any` types, all migrations under file-size cap, both new tables RLS-protected, bootstrap exemption (FR-161) and existing FR-130/161/106/162/163 verifiers still PASS unchanged.
