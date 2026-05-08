# Research — FR-167 DevPilot Usage Roll-Up Read-Model

## Decision log

### 1. Reuse `ai_usage_logs` instead of creating a new event table

**Decision**: Build the rollup on top of the existing `ai_usage_logs` table. Add `tenant_id` to it; aggregate from there.

**Why**: `ai_usage_logs` has captured every Claude API call across DevPilot since Dec 2024 (input_tokens, output_tokens, total_cost via `ai_models` cost-per-token registry). It already has rows for every operation_type that matters (spec_review, implementation, code_review, test_generation, error_fixing). Building a parallel `usage_events` table would either duplicate writes (every Edge Function emits to both) or backfill-from-`ai_usage_logs` (same outcome, more code). Reuse is cheaper and produces the same billing answer.

**Alternative considered**: New `usage_events` table normalised across resource types (tokens / pipeline_runs / deploys / GB stored). Rejected for v1.0 — for the foundation phase, AI tokens are the only billable resource that has clean cost data. Pipeline runs and deploys can be derived from `pipeline_runs.created_at` and `pipeline_runs.deploy_results`, but they don't have direct cost mapping yet (FR-170's concern).

### 2. Don't denormalise `ai_models.input_cost_per_token` into the rollup

**Decision**: `usage_rollups.ai_raw_cost` is computed by SUM-ing `ai_usage_logs.total_cost` (which was computed at write time using the model's cost-per-token at that time). Don't re-multiply tokens × current cost rate.

**Why**: Token costs change over time (Anthropic releases cheaper models, etc.). Re-computing rollup cost using the _current_ per-token rate would retroactively change historical bills. Use the cost-at-time-of-call, which is already frozen in `ai_usage_logs.total_cost`.

**Alternative considered**: Recompute on every rollup using current rates. Rejected — historical bills would shift if Anthropic re-priced.

### 3. The 2× markup formula — exact math

**Decision**: `ai_billable_cost = ceil(ai_raw_cost × 200) / 100`.

**Why**: The documented business model says "SaaS pricing at 2× AI cost" with all charges rounded up to the cent in the operator's favour. The expression multiplies by 200 (cost in cents × 2), takes the ceiling, then divides by 100 to get back to dollars. Avoids floating-point edge cases of `ceil(x * 2 * 100) / 100` for marginal values.

**Examples**:

- raw $0.001 → $0.001 × 200 = 0.2 → ceil = 1 → $0.01 (always at least 1 cent on any non-zero usage)
- raw $1.234 → 246.8 → ceil = 247 → $2.47
- raw $5.00 → 1000.0 → ceil = 1000 → $10.00 (no rounding penalty when already cent-aligned)

**Alternative considered**: `round_half_up(x × 2, 2)`. Rejected — banker's-rounding edge cases at .005 would split half-cents; `ceil` is unambiguous and always favours the operator.

### 4. UPSERT key — `(tenant_id, period_start)`

**Decision**: `usage_rollups` UNIQUE constraint on `(tenant_id, period_start)`. The RPC uses `INSERT ... ON CONFLICT (tenant_id, period_start) DO UPDATE`.

**Why**: Idempotent re-aggregation. Late-arriving `ai_usage_logs` rows can land any time; running the RPC again for the same period overwrites the same row. Saves the operator from chasing duplicate rollup rows during reconciliation.

**Alternative considered**: Append-only with a `version` column. Rejected — appending creates ambiguity about which row is "the rollup" for billing.

### 5. `compute_usage_rollup` is a SECURITY DEFINER PL/pgSQL function

**Decision**: Define as `SECURITY DEFINER` so it runs with the function-owner's privileges (postgres / service role) regardless of who calls it via PostgREST. Service role naturally bypasses RLS; the function reads across all of `ai_usage_logs` and `api_audit_log` for the requested tenant + period without RLS interference.

**Why**: An authenticated tenant calling the RPC needs to read its own data; the function should still see ALL the tenant's rows (RLS COALESCE would scope them anyway, but the RPC needs to be deterministic regardless of caller). `SECURITY DEFINER` removes the policy variability.

**Alternative considered**: `SECURITY INVOKER` with explicit RLS policy lookups. Rejected — doubles the policy surface; the SECURITY DEFINER pattern matches `set_tenant_context` (FR-162 J2 prep).

### 6. Projected-cost extrapolation — linear, ceil-to-cent

**Decision**: `projected_billable_cost = ceil(ai_billable_cost × 100 / fraction_elapsed) / 100` where `fraction_elapsed = (now() - period_start) / (period_end - period_start)`.

**Why**: Linear extrapolation is the simplest defensible projection. It's wrong for usage spikes / lulls but it's the most-information-out-of-data approach without a usage-pattern model. ceil-to-cent matches the markup formula style.

**Edge case**: If `fraction_elapsed < 0.05` (less than ~36 hours into a 31-day month), the projection is wildly inaccurate. The endpoint returns it anyway; consumers (dashboards) can choose to show "<insufficient data>" until day 2.

**Alternative considered**: Exponentially weighted moving average using prior periods. Rejected for v1.0 — no historical rollups exist yet; can't bootstrap.

### 7. Edge Function tenant resolution — reuse FR-163 gateway when API key, fallback when service role

**Decision**: The `usage-rollup` Edge Function uses the same detect-and-route pattern as `pipeline-status`:

- If `Authorization: Bearer dp_*` → route through `withApiGateway` → tenantId from API key
- Else if service-role bearer + `?tenant_id=X` → admin path, returns rollup for tenant X
- Else → 401 UNAUTHORIZED

**Why**: Consistency with FR-163's pilot endpoint pattern. Customer-facing API key path is the primary use case (FR-168 onboarding will mint keys for new tenants); admin path is for ops queries.

**Alternative considered**: Always service-role + filter by `tenant_id` arg. Rejected — defeats FR-163 isolation; customers shouldn't need to know their own tenant_id.

## Open questions resolved

| Question                                                           | Resolution                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does `ai_usage_logs` need to also track gateway calls?             | No — `api_audit_log` (FR-163) already counts gateway calls per tenant. The RPC joins both sources.                                                                                                                                                   |
| Does Anthropic's prompt-cache discount affect billing?             | Out of scope for v1.0. `ai_usage_logs.total_cost` reflects whatever cost was computed at call time; cache discounts (if applied by the cost calculator) flow through naturally. Reconciliation against actual Anthropic billing is FR-170's concern. |
| What about pipeline runs and deploys (mentioned in original AC-1)? | Deferred. The reduced v1.0 scope only meters AI tokens + gateway calls. Pipeline runs / deploys can be derived from `pipeline_runs` rows but lack a direct cost mapping until FR-170 introduces a pricing schedule.                                  |
| Does the rollup need a cron job?                                   | Not for v1.0. The endpoint computes on the fly when no row exists. A periodic cron job to pre-compute rollups can be added in FR-170 when invoicing needs guaranteed end-of-month finalisation.                                                      |

## Constraints and assumptions

- **`ai_usage_logs.feature_id` and `admin_id` are TEXT, not UUID**. Pre-FR-162 schema. The migration leaves them alone — only adds `tenant_id`. Cleanup is a separate FR.
- **Replay-safe migrations** per [feedback_migration_replay_safety.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_migration_replay_safety.md): `ADD COLUMN IF NOT EXISTS`, gated NOT NULL escalation, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`.
- **NOT NULL ships with DEFAULT** per [feedback_not_null_columns_need_defaults.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_not_null_columns_need_defaults.md). The 5+ Edge Functions that already write to `ai_usage_logs` continue working without code changes.
- **No new Edge Function helpers** — reuse `_shared/api-gateway.ts` (FR-163) for the `usage-rollup` endpoint's gateway path.
- **Deploy-branch only**: per session policy, all changes land on `001-coop-marketplace-platform`. No new branch.
