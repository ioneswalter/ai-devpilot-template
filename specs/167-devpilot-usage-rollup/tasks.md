# Tasks — FR-167 DevPilot Usage Roll-Up Read-Model

**Branch**: `001-coop-marketplace-platform`
**Total tasks**: 11 (J1: 3, J2: 3, J3: 4, verifier: 1)

## Phase J1 — `ai_usage_logs.tenant_id` migration (Priority: P1)

- [x] T001 [J1] Create migration `supabase/migrations/<timestamp>_fr167_j1_ai_usage_logs_tenant_id.sql`: `ADD COLUMN IF NOT EXISTS tenant_id` with FK + DEFAULT, backfill `UPDATE ... WHERE tenant_id IS NULL`, gated `ALTER COLUMN ... SET NOT NULL`, `(tenant_id)` index, RLS enable + `ai_usage_logs_tenant_isolation` policy.
- [x] T002 [J1] Edit `scripts/verify-rls-status.ts`: add `'ai_usage_logs'` to `FR162_SCOPE_TABLES` (31 → 32).
- [x] T003 [J1] Apply migration via `supabase db push`. Verify per Quickstart J1.1 (zero NULL counts), J1.2 (`pnpm verify:rls` 32/32), J1.3 (existing `devpilot-chat` writer continues working).

## Phase J2 — `usage_rollups` + `compute_usage_rollup` (Priority: P2)

- [x] T004 [J2] Create migration `supabase/migrations/<timestamp>_fr167_j2_usage_rollups_table.sql` per [data-model.md](data-model.md): table + UNIQUE `(tenant_id, period_start)` + indexes + RLS policy + `compute_usage_rollup(uuid, date)` SECURITY DEFINER function. `GRANT EXECUTE ON FUNCTION` to authenticated and service_role.
- [x] T005 [J2] Edit `scripts/verify-rls-status.ts`: add `'usage_rollups'` to `FR162_SCOPE_TABLES` (32 → 33).
- [x] T006 [J2] Apply migration. Smoke per Quickstart J2.1 (synthetic tenant + 3 fixtures → ai_billable_cost = 2.47), J2.2 (idempotent re-run), J2.3 (late-arriving fixture re-aggregates), J2.4 (RLS isolation).

## Phase J3 — `GET /usage-rollup` Edge Function (Priority: P3)

- [x] T007 [J3] Create `supabase/functions/usage-rollup/index.ts`: detect-and-route between FR-163 API key path (`withApiGateway` from `_shared/api-gateway.ts`) and service-role admin path with `?tenant_id=` query. Per [contracts/usage-rollup-endpoint.md](contracts/usage-rollup-endpoint.md).
- [x] T008 [J3] In the same file: implement on-the-fly compute when no rollup row exists (`SELECT * FROM usage_rollups WHERE tenant_id = $1 AND period_start = date_trunc('month', now())::date`; if 0 rows → `SELECT compute_usage_rollup($1, ...)` then re-SELECT). Compute `projected_billable_cost` per the formula in research.md Decision 6.
- [x] T009 [J3] Deploy `usage-rollup` via `npx supabase functions deploy usage-rollup --no-verify-jwt`.
- [x] T010 [J3] Smoke per Quickstart J3.1 (API key path with isolated rollup), J3.2 (admin service-role with `?tenant_id=`), J3.3 (zero-usage empty period), J3.4 (projection extrapolation matches the math).

## Verifier extension

- [x] T011 Run `pnpm verify:rls` after both migrations land — expect 33/33 protected. Run `pnpm verify:feature FR-130/161/106/162/163 --stage test` regression — all exit 0.

## Verification gate (mandatory)

After all 11 tasks complete: `pnpm verify:feature FR-167 --stage build` returns exit 0. Constitution compliance report in [checklists/constitution-compliance.md](checklists/constitution-compliance.md).
