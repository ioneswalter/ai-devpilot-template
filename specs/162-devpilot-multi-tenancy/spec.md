# Feature Specification: DevPilot Multi-Tenancy Foundation

**Feature Code**: FR-162
**Branch**: `001-coop-marketplace-platform`
**Created**: 2026-05-08
**Status**: Draft
**Input**: Add `tenant_id` to every DevPilot pipeline table (28 tables enumerated in plan.md), enforce row-level security keyed off the calling JWT's `tenant_id` claim, seed an OwnYourGig tenant, backfill all existing rows. Foundation for the FR-162→168 DevPilot split arc and a hard prerequisite for the API gateway, repo split, and self-service onboarding. Pure refactor — single-tenant flows behave identically before and after.

## User Scenarios & Testing _(mandatory)_

### Journey 1 — Tenants table + scope-set schema lands with backfill (Priority: P1)

The foundation: create a `tenants` table, seed one row for OwnYourGig, add a `tenant_id` column to every DevPilot pipeline table, backfill existing rows to the seeded tenant, set NOT NULL, add `(tenant_id)` indexes. No RLS yet — the cluster behaves identically to today (any caller still sees all rows). This journey is intentionally low-risk: it ships a structural change without behaviour change.

**Why this priority**: Every subsequent journey depends on the column existing. Without J1, RLS (J2), Edge Function context (J3), and the verifier extension (J4) have nothing to act on. Ships first because it's the smallest atomic change that unblocks the rest.

**Independent Test**: Apply the migration. Query `SELECT count(*) FROM <each_scoped_table> WHERE tenant_id IS NULL` for all 28 tables — every result is 0. `SELECT * FROM tenants` returns one row with `code='ownyourgig'`. The kanban / Ideation / UAT / deploy flows render and behave exactly as before.

**Acceptance Scenarios**:

1. **Given** the migration has not yet run, **When** the J1 migration is applied to a fresh database, **Then** a `tenants` table exists with `id, code, name, created_at`; one row is seeded with `code='ownyourgig'`; a SQL helper `get_default_tenant_id()` returns that row's id.
2. **Given** the migration has run, **When** every scoped table is queried for `tenant_id IS NULL`, **Then** the count is 0 for all 28 tables and the column is `NOT NULL` with a foreign key to `tenants(id)` and an index on `(tenant_id)`.
3. **Given** the migration is replayed against an already-migrated database, **When** it runs end-to-end, **Then** no errors are raised (replay-safe via `IF NOT EXISTS` / conditional NOT NULL escalation) and no data changes.

---

### Journey 2 — RLS enforces per-tenant isolation across the scope set (Priority: P2)

Enable Row-Level Security on every scoped table with policies keyed off the calling JWT's `tenant_id` claim (`current_setting('request.jwt.claim.tenant_id', true)::uuid`). Service role's native Postgres BYPASS is preserved so admin/ops scripts (`verify-feature-state.ts`, `sync:roadmap`, the deploy command's `update-handler.ts`) keep working unchanged. The cluster moves from "data carries a tenant tag but is openly readable" to "users only see their own tenant's data".

**Why this priority**: This is the actual security boundary. Until this journey ships, the column is metadata only. Ships second because it depends on J1's column being non-null and indexed.

**Independent Test**: Insert a fixture row tagged to a synthetic second tenant. Call any user-authenticated Edge Function with the OwnYourGig user's JWT — the synthetic row is invisible. Re-call with a synthetic-tenant JWT — only the synthetic row is visible. Service role queries continue to see all rows.

**Acceptance Scenarios**:

1. **Given** RLS is enabled and a user-authenticated request arrives with `tenant_id='ownyourgig-uuid'` in the JWT claim, **When** the request reads any scoped table, **Then** only rows with that `tenant_id` are returned. Rows tagged to other tenants are invisible.
2. **Given** the same request attempts to INSERT a row with `tenant_id='other-tenant-uuid'`, **When** the policy evaluates the WITH CHECK clause, **Then** the INSERT is rejected.
3. **Given** the deploy command's `update-handler.ts` runs as service role, **When** it queries `product_features` to flip a feature's status, **Then** all rows are visible regardless of `tenant_id` (service-role BYPASS preserved).

---

### Journey 3 — Edge Functions resolve tenant from JWT/API key with OwnYourGig fallback (Priority: P3)

Every authenticated Edge Function reads the calling JWT's `tenant_id` claim (or API key claim) and sets it via `set_config('request.jwt.claim.tenant_id', <uuid>, true)` before any user-scoped query, so RLS policies (J2) actually apply. When no tenant claim is present (GitHub App webhooks from FR-147, anonymous public reads, ops scripts), the function resolves to the seeded OwnYourGig tenant via `get_default_tenant_id()`.

**Why this priority**: Without J3, J2's policies block all user-authenticated requests because no claim is set — the cluster effectively goes read-only for normal users. The OwnYourGig fallback is the bridge that keeps the GitHub webhook (FR-147) and any anonymous read paths working during the foundation phase. FR-163 will replace the fallback with strict tenant context once the API gateway is in place.

**Independent Test**: Hit any Edge Function (`uat-get-review-context`, `pipeline-status`, etc.) with a valid OwnYourGig user JWT — response is identical to today. Hit `github-app-webhook` with no JWT (only the GitHub HMAC signature) — function still processes the webhook and writes to `pipeline_runs` with `tenant_id` set to the OwnYourGig default.

**Acceptance Scenarios**:

1. **Given** an authenticated Edge Function receives a JWT containing `tenant_id` claim, **When** the function runs its first DB query, **Then** `set_config('request.jwt.claim.tenant_id', <uuid>, true)` has been called so RLS policies see the correct tenant.
2. **Given** the GitHub App webhook handler (`github-app-webhook` from FR-147) receives a request with no JWT, **When** the handler validates the HMAC signature successfully and proceeds, **Then** `set_config` is called with `get_default_tenant_id()` so writes land under the OwnYourGig tenant.
3. **Given** an Edge Function fails to resolve a tenant (e.g., malformed JWT, missing claim, no fallback path applicable), **When** the function attempts a user-scoped query, **Then** RLS naturally blocks the read (no `tenant_id` claim → no rows match) and the function returns a 401/403 with a clear `TENANT_REQUIRED` error code.

---

### Journey 4 — Verifier extension + regression suite (Priority: P4)

Extend `pnpm verify:rls` so the 28 scoped tables are required to have RLS enabled (not just allowlisted as exempt). Run the existing `pnpm verify:feature` suite against FR-130, FR-161, FR-106 to confirm the previously-released features still pass without code edits.

**Why this priority**: Defense in depth — codifies the rule going forward and certifies the existing-feature regression. Ships last because it's the verification of the prior three journeys.

**Independent Test**: Drop RLS on one scoped table manually, run `pnpm verify:rls` — exit code is non-zero. Re-enable, run again — exit code is 0. Run `pnpm verify:feature FR-130 --stage test` (and FR-161 / FR-106) — all return exit 0.

**Acceptance Scenarios**:

1. **Given** all 28 scoped tables have RLS enabled, **When** `pnpm verify:rls` runs, **Then** exit code is 0 and the report lists all 28 tables as protected.
2. **Given** RLS is administratively disabled on any one scoped table, **When** `pnpm verify:rls` runs, **Then** exit code is non-zero and the report names the offending table.
3. **Given** FR-162 is fully shipped, **When** `pnpm verify:feature FR-130 --stage test`, `FR-161 --stage test`, and `FR-106 --stage test` run, **Then** all three return exit 0 with no application code in those features edited.

---

### Edge Cases

- **Pipeline-fixing feature working on its own pipeline**: FR-162 modifies the same tables that the pipeline reads from to track FR-162's own progress (test_cases, test_runs, implementation_task_items). Per [feedback_pipeline_bootstrap.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_pipeline_bootstrap.md), the journeys must each leave the system in a coherent state — partial application must not break Ideation/Spec/Build/Test/UAT/Deploy. J1 (column-only) and J2 (RLS-on, fallback covers existing flows) must each be independently revertable.
- **GitHub App webhook (FR-147) with no JWT**: explicit fallback path in J3 — `get_default_tenant_id()` returns OwnYourGig. Once FR-163 lands, webhooks must carry a tenant claim in the installation metadata.
- **Service-role admin scripts**: `verify-feature-state.ts`, `sync:roadmap`, deploy gate — all use the service role key. Postgres' service role naturally bypasses RLS; J2's policies must NOT add `RESTRICTIVE` clauses that constrain the service role.
- **Cross-tenant operations (out of scope here)**: future audit/billing reports across tenants are FR-167's concern, not FR-162's. FR-162 documents service role as the elevation path; productisation comes later.
- **Tenant identifier collision**: `tenants.code` is UNIQUE; the seed inserts `'ownyourgig'`. Future tenant onboarding (FR-168) inserts new codes; collisions raise a constraint violation by design.
- **Migration replay safety**: per [feedback_migration_replay_safety.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_migration_replay_safety.md), J1 uses `ADD COLUMN IF NOT EXISTS`, conditional NOT NULL escalation, and `ON CONFLICT DO NOTHING` for the seed. J2's policies use `DROP POLICY IF EXISTS` before `CREATE POLICY`.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-162-1**: A `tenants` table MUST exist with `id (uuid PK)`, `code (text UNIQUE NOT NULL)`, `name (text NOT NULL)`, `created_at (timestamptz default now())`. The migration MUST seed one row with `code='ownyourgig'`, `name='OwnYourGig App'`.
- **FR-162-2**: A SQL helper function `public.get_default_tenant_id()` MUST return the OwnYourGig tenant's UUID. Used by Edge Function fallbacks and backfill migrations.
- **FR-162-3**: Every table in the 28-table DevPilot scope set (enumerated in plan.md) MUST carry a `tenant_id uuid NOT NULL REFERENCES tenants(id)` column with an index on `(tenant_id)`.
- **FR-162-4**: Existing rows in every scoped table MUST be backfilled to the OwnYourGig tenant id. Post-migration, `SELECT count(*) FROM <table> WHERE tenant_id IS NULL` returns 0 for every scoped table.
- **FR-162-5**: RLS MUST be enabled on every scoped table with SELECT/INSERT/UPDATE/DELETE policies keyed off `current_setting('request.jwt.claim.tenant_id', true)::uuid`. Service role's native bypass MUST be preserved.
- **FR-162-6**: Every authenticated Edge Function MUST resolve `tenant_id` from the calling JWT or API key claim and call `set_config('request.jwt.claim.tenant_id', <uuid>, true)` before user-scoped queries.
- **FR-162-7**: Edge Functions invoked without a tenant claim (GitHub App webhooks, ops scripts, anonymous reads) MUST fall back to `get_default_tenant_id()` so single-tenant flows continue working during the foundation phase.
- **FR-162-8**: `pnpm verify:rls` MUST report zero unprotected tables across the 28-table scope set; the check fails CI with a non-zero exit code if any scoped table has RLS disabled.
- **FR-162-9**: After FR-162 ships, `pnpm verify:feature` for FR-130, FR-161, FR-106 (`--stage test`) MUST return exit 0 with no application code in those features edited.

### Key Entities

- **`tenants`**: new table, holds the catalogue of tenants. v1.0 seeds only OwnYourGig. FR-168 (Self-Service Onboarding) will populate it for paying customers.
- **`tenant_id` column**: added to 28 existing tables. Single source of truth for which tenant owns each row.
- **`get_default_tenant_id()`**: new SQL function. The contract that anchors backfill, Edge Function fallbacks, and any future "is this an internal/legacy row?" check.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: Across the 28 scoped tables, `count(*) FILTER (WHERE tenant_id IS NULL) = 0` after migration. Verified once via SQL post-deploy.
- **SC-002**: `pnpm verify:rls` reports 28/28 protected tables; CI green.
- **SC-003**: After FR-162 ships, the OwnYourGig kanban renders in ≤ 2s (existing performance budget) — RLS adds no perceptible latency. Spot-check via the existing test pill smoke after deploy.
- **SC-004**: Existing-feature regression: `pnpm verify:feature` returns exit 0 for FR-130, FR-161, FR-106 across all stages without any application code change inside those features.
- **SC-005**: GitHub App webhook (FR-147) continues to process push and pull_request events post-deploy — verified by triggering one synthetic PR and confirming `pipeline_runs` rows land with `tenant_id` set.
