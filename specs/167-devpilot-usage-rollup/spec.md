# Feature Specification: DevPilot Usage Roll-Up Read-Model (Foundation)

**Feature Code**: FR-167
**Branch**: `001-coop-marketplace-platform`
**Created**: 2026-05-09
**Status**: Draft
**Input**: Capture AI token consumption per tenant on the existing `ai_usage_logs` table (currently lacks `tenant_id`), aggregate it monthly into a new `usage_rollups` table with the documented 2× markup, and expose a read endpoint so tenants and FR-168 (Self-Service Onboarding) can see current-period usage + projected charge. Excludes Stripe invoicing (FR-170), quota limits + notifications (FR-171), dunning + plan management (FR-172).

## User Scenarios & Testing _(mandatory)_

### Journey 1 — `ai_usage_logs` becomes tenant-scoped (Priority: P1)

The existing `ai_usage_logs` table has captured every Claude API call since Dec 2024 (input_tokens, output_tokens, total_cost via the `ai_models` cost-per-token registry). It pre-dates FR-162 and lacks a `tenant_id` column, so RLS doesn't isolate it per tenant. Until that's fixed, no rollup can be tenant-scoped — every tenant would see every other tenant's API costs.

**Why this priority**: J2 and J3 depend on `tenant_id` existing on `ai_usage_logs`. This is the smallest atomic unblocker.

**Independent Test**: Apply the migration. Query `SELECT count(*) FROM ai_usage_logs WHERE tenant_id IS NULL` — returns 0. `pnpm verify:rls` reports 32/32 scoped tables protected. The OwnYourGig Edge Functions that already write to `ai_usage_logs` (devpilot-chat, dedup-check, prompt-library, etc.) continue working — the `DEFAULT public.get_default_tenant_id()` covers the inserts that don't yet set `tenant_id` explicitly.

**Acceptance Scenarios**:

1. **Given** the migration has not yet run, **When** it runs against production, **Then** `ai_usage_logs` has a non-nullable `tenant_id uuid REFERENCES tenants(id) DEFAULT public.get_default_tenant_id()` column with an index on `(tenant_id)`, all existing rows backfilled to OwnYourGig, RLS enabled with the standard `<table>_tenant_isolation` COALESCE policy.
2. **Given** the migration has run, **When** `pnpm verify:rls` executes, **Then** `FR162_SCOPE_TABLES` includes `'ai_usage_logs'` and the `TC-FR162-J4-01` check reports 32/32 protected (was 31/31).
3. **Given** an Edge Function that already writes to `ai_usage_logs` without setting `tenant_id` (e.g., devpilot-chat for an OwnYourGig user), **When** it inserts a row, **Then** the row's `tenant_id` is auto-populated by the DEFAULT to OwnYourGig — no code change required in the writer for backwards compatibility during the foundation phase.

---

### Journey 2 — `usage_rollups` table + `compute_usage_rollup` RPC (Priority: P2)

The roll-up is the actual billing primitive: for each tenant + month, sum the AI tokens, raw cost, and gateway-call count into one row. The 2× markup is computed on `ai_raw_cost` and rounded up to the nearest cent, matching the documented business model. Re-running the RPC for the same tenant + period overwrites the same row idempotently — useful for late-arriving `ai_usage_logs` data or backfills.

**Why this priority**: This is the actual billing read-model. J3 just exposes it; the math lives here.

**Independent Test**: Insert a synthetic tenant with 3 fixture `ai_usage_logs` rows totalling $1.234 raw cost. Call `compute_usage_rollup(<tenant>, '2026-05-01')`. Query `usage_rollups` for that tenant + period — exactly one row exists with `ai_raw_cost = 1.234`, `ai_billable_cost = 2.47` (2 × 1.234 = 2.468, rounded up to 2.47). Run again — same row, same values (idempotent). Add a 4th fixture row, re-run — single row with updated totals (UPSERT, not INSERT).

**Acceptance Scenarios**:

1. **Given** a tenant has 3 `ai_usage_logs` rows in May 2026 totalling raw cost $1.234, **When** `compute_usage_rollup(<tenant_id>, '2026-05-01')` is called, **Then** a single `usage_rollups` row exists for `(tenant_id, period_start='2026-05-01')` with `ai_raw_cost = 1.234` and `ai_billable_cost = 2.47` (ceil($1.234 × 2 × 100) / 100).
2. **Given** the same call is made twice, **When** the second call runs, **Then** the same row is upserted (no duplicate; no error). Idempotent.
3. **Given** the `usage_rollups` table is read by an authenticated tenant via PostgREST, **When** RLS evaluates, **Then** only rows whose `tenant_id` matches the caller's `auth.jwt() ->> 'tenant_id'` (or COALESCE fallback to OwnYourGig) are visible. Service role sees all rows.
4. **Given** `gateway_calls` aggregates `api_audit_log` for the same tenant + period, **When** the period is the current month and there are 12 audit rows for the tenant, **Then** `usage_rollups.gateway_calls = 12`.

---

### Journey 3 — `GET /usage-rollup` Edge Function with projected-cost extrapolation (Priority: P3)

A tenant or admin needs to read the rollup at any time during a period, not just after month-end. The endpoint returns the current-period row (computing it on the fly if missing) plus a `projected_billable_cost` field that linearly extrapolates the partial-period cost to a full-month estimate. This is the surface FR-168's onboarding dashboard reads from.

**Why this priority**: User-facing surface. Depends on J1 + J2.

**Independent Test**: With a synthetic tenant + 3 fixture rows totalling $1.234 raw cost on May 9 (day 9 of a 31-day month, 9/31 ≈ 0.29 of period elapsed), call `GET /usage-rollup?period=current` — response includes the rollup row plus `projected_billable_cost ≈ 2.47 / (9/31) = 8.51` (rounded up to nearest cent). Authenticate via FR-163 API key — the response is the calling tenant's rollup, not OwnYourGig's. Authenticate with admin service role + explicit `?tenant_id=<X>` — returns the requested tenant's rollup.

**Acceptance Scenarios**:

1. **Given** a synthetic tenant has 3 `ai_usage_logs` rows in the current month totalling $1.234 raw cost, **When** the tenant calls `GET /usage-rollup?period=current` via FR-163 API key, **Then** the response is `{ data: { period_start, period_end, ai_raw_cost: 1.234, ai_billable_cost: 2.47, gateway_calls: <count>, projected_billable_cost: <linear extrapolation rounded up> } }`. The endpoint computes the rollup on the fly if no row exists yet.
2. **Given** an admin calls `GET /usage-rollup?period=current&tenant_id=<X>` with the service-role bearer, **When** the function runs, **Then** the response is for tenant X (admin can read across tenants).
3. **Given** an unauthenticated request, **When** the function runs, **Then** a `401 UNAUTHORIZED` is returned.
4. **Given** the period is mid-month with 9/31 ≈ 29% elapsed, **When** the response is computed, **Then** `projected_billable_cost = ceil(ai_billable_cost / fraction_elapsed × 100) / 100`. If the period is the first day with 1/31 ≈ 3% elapsed and `ai_billable_cost = 0.10`, projection ≈ $3.10.

---

### Edge Cases

- **Anthropic credits / non-billable usage**: `ai_usage_logs.total_cost` reflects the cost-per-token math from `ai_models`, which doesn't account for Anthropic's free-tier credits or volume discounts. The rollup carries that same approximation; it's "list price" not "actual paid cost". Documented as a limitation; reconciliation is FR-170's concern.
- **Cross-period writes**: An `ai_usage_logs` row for May 28 inserted on June 2 (delayed write) is captured by re-running `compute_usage_rollup(<tenant>, '2026-05-01')` after the late row lands. Idempotent UPSERT handles this.
- **Empty period**: If a tenant has zero `ai_usage_logs` rows for the period, the rollup row is still inserted with all zero values (so the dashboard always has a row to read).
- **Daily extrapolation when only minutes elapsed**: If period_start is today and only an hour has elapsed, `fraction_elapsed = 1/(31*24)`. The projected cost can be wildly inaccurate but the endpoint still returns it. UI can choose to suppress projections in the first day.
- **Rounding direction**: `ai_billable_cost` rounds UP via `ceil(... × 100) / 100`. Half-cent rounding always favours the operator (DevPilot), per the documented business model. Documented; no surprise on the customer side because the markup is 2× anyway.
- **Service role across tenants**: The endpoint accepts `?tenant_id=` only when the caller is service-role-authenticated. API-key callers are pinned to their key's tenant; the parameter is ignored if present.
- **`ai_usage_logs.feature_id` and `admin_id` columns are TEXT, not UUID**: pre-FR-162 schema. The migration adds `tenant_id uuid` alongside; the legacy columns aren't touched.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-167-1**: `ai_usage_logs.tenant_id` exists with the FR-162 standard pattern (NOT NULL, DEFAULT, FK, index, RLS policy). Backfilled to OwnYourGig. Added to `FR162_SCOPE_TABLES` (31 → 32).
- **FR-167-2**: `usage_rollups` table per [data-model.md](data-model.md) with FR-162-style RLS, unique constraint on `(tenant_id, period_start)`, and the documented 2× markup formula computed by the RPC.
- **FR-167-3**: `compute_usage_rollup(p_tenant_id uuid, p_period_start date)` RPC aggregates `ai_usage_logs` + `api_audit_log` for the tenant + month-of-period_start window and UPSERTs into `usage_rollups`. Idempotent.
- **FR-167-4**: `GET /usage-rollup?period=current[&tenant_id=X]` Edge Function returns the current-period rollup with `projected_billable_cost` extrapolation. FR-163 gateway path resolves tenant_id from the API key; admin/service-role can pass `?tenant_id=` explicitly. Computes the rollup on the fly if no row exists yet.

### Key Entities

- **`ai_usage_logs`** (existing, modified): gains `tenant_id uuid NOT NULL DEFAULT get_default_tenant_id() REFERENCES tenants(id)` + index + RLS policy.
- **`usage_rollups`** (new): per-tenant per-month aggregate of AI tokens, raw cost, billable cost, gateway calls.
- **`compute_usage_rollup`** (new SQL function): the aggregator.
- **`usage-rollup` Edge Function** (new): the read endpoint.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: `pnpm verify:rls` reports 32/32 protected DevPilot tables after FR-167 ships.
- **SC-002**: For the synthetic-tenant smoke fixture (3 rows totalling $1.234 raw cost), `compute_usage_rollup` produces `ai_billable_cost = 2.47` exactly (2× markup, ceil-to-cent).
- **SC-003**: `GET /usage-rollup?period=current` returns isolated data per FR-163: synthetic-tenant key sees only that tenant's rollup; OwnYourGig admin via service role + `?tenant_id=<X>` can read any tenant's rollup.
- **SC-004**: Existing-feature regression unchanged: `pnpm verify:feature FR-130/161/106/162/163 --stage test` all return exit 0 after FR-167 lands.
- **SC-005**: FR-170 (Stripe Invoicing) and FR-168 (Onboarding) can read `usage_rollups` without further FR-167 work.
