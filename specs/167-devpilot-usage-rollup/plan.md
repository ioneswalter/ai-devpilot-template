# Implementation Plan — FR-167 DevPilot Usage Roll-Up Read-Model

**Branch**: `001-coop-marketplace-platform` (no new branch)
**Constitution check**: PASS — no `any`; no file expected to exceed 300 lines; security via FR-162 RLS pattern; pure-additive schema changes; existing writers unaffected by the DEFAULT.

## Architecture decisions

Three sequential journeys, each independently shippable:

| Layer                  | Change                                                                                                         | Files                                                                                                       |
| ---------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **DB schema (J1)**     | Add `tenant_id` to `ai_usage_logs` per FR-162 pattern; backfill; RLS; verifier extension                       | `supabase/migrations/<timestamp>_fr167_j1_ai_usage_logs_tenant_id.sql`; edit `scripts/verify-rls-status.ts` |
| **DB schema (J2)**     | Create `usage_rollups` table + RLS + `compute_usage_rollup` SECURITY DEFINER function                          | `supabase/migrations/<timestamp>_fr167_j2_usage_rollups_table.sql`                                          |
| **Edge Function (J3)** | New `usage-rollup` Edge Function: detect-and-route between API key (FR-163) and service-role + projection math | `supabase/functions/usage-rollup/index.ts` (new)                                                            |

## Phase sequencing

```
J1 — ai_usage_logs.tenant_id migration (column + backfill + RLS + verify:rls 32/32)
   ↓ verify: existing writers (devpilot-chat, dedup-check, prompt-library, etc.) write OwnYourGig tenant via DEFAULT; no code change required
J2 — usage_rollups + compute_usage_rollup RPC
   ↓ verify: synthetic tenant + 3 fixture rows → ai_billable_cost = 2.47 (J2.1); idempotent re-run (J2.2); late-arriving fixture re-aggregates (J2.3); RLS isolation (J2.4)
J3 — GET /usage-rollup Edge Function
   ↓ verify: API key path returns isolated rollup with X-Tenant-Id header (J3.1); admin path with tenant_id query (J3.2); zero-usage empty period (J3.3); projection extrapolation math (J3.4)
```

J1 is the smallest unblocker. J2 is the actual billing primitive. J3 surfaces it. No critical-sequencing constraint within v1.0 (none of the journeys are mid-deploy-fragile like FR-162 J2+J3 was).

## Constitution gate

- **File size**: J1 migration ~50 lines; J2 migration ~120 lines (mostly the SQL function body); J3 Edge Function ~120 lines. All under 300.
- **TypeScript strict**: J3 Edge Function uses existing typed shapes from FR-163's `_shared/api-gateway.ts`; no `any`.
- **Security (VIII)**: Both new tables use the FR-162 COALESCE RLS pattern. `compute_usage_rollup` is SECURITY DEFINER so the math is deterministic regardless of caller. No new auth surface — reuses FR-163 gateway.
- **Performance (IX)**: J2 function uses `(tenant_id)` and `(tenant_id, period_start)` indexes; aggregation is a single GROUP BY across `ai_usage_logs` (sub-ms even at 1M rows). J3 cold call ~50ms (RPC + SELECT); warm call ~10ms (SELECT only).
- **NOT NULL ships with DEFAULT** per [feedback_not_null_columns_need_defaults.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_not_null_columns_need_defaults.md). `ai_usage_logs.tenant_id` and `usage_rollups.tenant_id` both default to `get_default_tenant_id()`.
- **Migration replay safety** per [feedback_migration_replay_safety.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_migration_replay_safety.md): `ADD COLUMN IF NOT EXISTS`, gated NOT NULL, `CREATE TABLE IF NOT EXISTS`, `DROP POLICY IF EXISTS`, `CREATE OR REPLACE FUNCTION`.
- **Prettier before deploy** per [feedback_prettier_before_commit.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_prettier_before_commit.md).

## Risk register

| Risk                                                                                        | Mitigation                                                                                                                                                                                   |
| ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Existing Edge Functions that insert into `ai_usage_logs` break after the column is NOT NULL | DEFAULT `get_default_tenant_id()` covers all current writers; J1.3 quickstart explicitly verifies. No code change required for backwards compatibility during the foundation phase.          |
| 2× markup math has rounding edge cases                                                      | `ceil(raw × 200) / 100` is unambiguous; J2.1 quickstart verifies the $1.234 → $2.47 case. No floating-point drift since `numeric(12,4)` is exact decimal.                                    |
| `compute_usage_rollup` reads across tenants because it's SECURITY DEFINER                   | Acceptable by design: the function takes `p_tenant_id` as a parameter and only aggregates that tenant's data. Caller authority is enforced at the Edge Function layer (J3 detect-and-route). |
| Projected-cost extrapolation is wildly inaccurate early in the period                       | Documented in spec edge cases. Endpoint returns the math; dashboards can suppress projection until day 2. Not a correctness issue.                                                           |
| Anthropic credits / volume discounts not reflected in `ai_usage_logs.total_cost`            | Acknowledged in research.md Decision 1; rollup carries list-price approximation. Reconciliation against actual Anthropic billing is FR-170's concern.                                        |
| Rollup row UPSERT race when two callers compute the same period simultaneously              | UPSERT on `(tenant_id, period_start)` UNIQUE — last writer wins; both end up with the same final values since `compute_usage_rollup` is deterministic for the same input.                    |

## Out of scope

- **Stripe invoicing** (rollup → monthly invoice + tax). Defer to **FR-170**.
- **Quota limits + 80%/100% email notifications**. Defer to **FR-171**.
- **Failed-payment dunning + plan upgrade/downgrade**. Defer to **FR-172**.
- **Pipeline runs / deploys / GB stored as billable resources**. v1.0 only meters AI tokens + gateway calls; FR-170 introduces the broader pricing schedule.
- **Cron job for end-of-month finalisation**. v1.0 computes on the fly; pre-compute job comes with FR-170.

## Rollback plan

- **J1 revert**: drop the column from `ai_usage_logs`. Existing rows return to pre-FR-167 schema. No data loss.
- **J2 revert**: drop `usage_rollups` table + `compute_usage_rollup` function. Aggregates are computable from `ai_usage_logs` if needed; no data loss.
- **J3 revert**: delete the `usage-rollup` Edge Function deployment. The table + RPC remain; ops can query them directly.

## Dependencies

- **FR-162** (Multi-Tenancy Foundation) — `tenants` table, `get_default_tenant_id()`, RLS COALESCE pattern. All shipped.
- **FR-162 v1.1** (JWT-aware DEFAULT) — used by `ai_usage_logs.tenant_id` and `usage_rollups.tenant_id` defaults.
- **FR-163** (API Gateway) — the J3 Edge Function uses `withApiGateway` for the customer path. Shipped.
- **FR-163 v1.1** (audit FK RESTRICT) — preserves `api_audit_log` rows that the rollup counts.
- **`ai_usage_logs`** (existing) — the data source for AI cost aggregation.

## Success metrics (mapped from spec.md SC-001..SC-005)

- **SC-001**: `pnpm verify:rls` reports 32/32 (after J1) → 33/33 (after J2 adds `usage_rollups` to scope set).
- **SC-002**: J2.1 quickstart $1.234 → $2.47 math verified live.
- **SC-003**: J3.1 + J3.2 quickstarts confirm tenant isolation via API key + admin override.
- **SC-004**: Regression `pnpm verify:feature FR-130/161/106/162/163 --stage test` returns exit 0.
- **SC-005**: FR-170/FR-168 can read `usage_rollups` directly without schema changes.
