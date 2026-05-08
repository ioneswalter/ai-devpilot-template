# Implementation Plan — FR-163 DevPilot API Gateway + Customer Auth (Foundation)

**Branch**: `001-coop-marketplace-platform` (no new branch)
**Constitution check**: PASS — no `any` types planned; no file expected to exceed 300 lines; security-engineering principle (VIII) is the central goal; performance budget honoured (sub-ms middleware overhead).

## Architecture decisions

Three targeted layers, sequenced as three journeys:

| Layer                       | Change                                                                                                                                       | Files / Migrations                                                                                             |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| **DB schema (J1)**          | New `api_keys` table with hashed key + prefix + scopes + rate_limit + expiry/revoke. RLS via FR-162 pattern. Indexes per data-model.         | `supabase/migrations/<timestamp>_fr163_j1_api_keys_table.sql`                                                  |
| **Edge middleware (J1)**    | New `_shared/api-gateway.ts` exporting `withApiGateway(handler)`. Detect-and-route in wrapped functions to preserve user-JWT path.           | new file + edits to `supabase/functions/pipeline-status/index.ts` (one wrap)                                   |
| **Admin endpoints (J2)**    | New action handlers under `roadmap-admin-features` Edge Function for `api-key-issue`, `api-key-rotate`, `api-key-revoke`, `api-keys` (list). | edit `supabase/functions/roadmap-admin-features/index.ts` + new `_shared/api-key-helpers.ts` for sha256/prefix |
| **Frontend admin UI (J2)**  | API Keys panel under existing Roadmap admin module + issuance/rotate success modal.                                                          | new components in `apps/web/src/features/roadmap/admin/`                                                       |
| **Audit + rate limit (J3)** | New `api_audit_log` table + integrate FR-063 `_shared/rate-limit.ts` into the gateway middleware.                                            | `supabase/migrations/<timestamp>_fr163_j3_api_audit_log_table.sql` + edit `_shared/api-gateway.ts`             |
| **Verifier extension**      | Add `api_keys` and `api_audit_log` to FR162_SCOPE_TABLES (verify:rls grows from 29 → 31).                                                    | edit `scripts/verify-rls-status.ts`                                                                            |

## Phase sequencing

```
J1 — api_keys table + withApiGateway middleware + pipeline-status pilot wrap
   ↓ verify: synthetic key flows end-to-end (J1.1 quickstart); revoked key 401s (J1.2); legacy user-JWT path unchanged (J1.3)
J2 — Admin UI for issue / rotate / revoke + listing
   ↓ verify: J2.1-J2.4 quickstart; raw key shown ONCE; list endpoint does not leak hash
J3 — api_audit_log + rate limit integration
   ↓ verify: J3.1 (429 + Retry-After), J3.2 (audit captures all 5 calls), J3.3 (exception path still audited)
verifier — extend verify-rls-status.ts to require RLS on the 2 new tables (31/31)
```

J1 is the MVP — the foundation works end-to-end without J2/J3. J2 productises the lifecycle. J3 adds operational visibility.

## Constitution gate

- **File size**: middleware ~100 lines; admin handlers ~80 lines per action; migrations ~60 lines each. All under the 300-line cap.
- **TypeScript strict**: `withApiGateway` is generic-typed; `GatewayHandler` and `GatewayContext` types pinned. No `any`.
- **Security (VIII)**: this feature _is_ the security mandate for external API access. Key hashing, RLS, rate limit, audit — all in scope.
- **Performance (IX)**: middleware overhead budget < 5ms (sha256 + 1 indexed SELECT + 1 GUC set + 1 fire-and-forget INSERT after response). Audit insert is async; not on the critical path.
- **NOT NULL columns ship with DEFAULT** per [feedback_not_null_columns_need_defaults.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_not_null_columns_need_defaults.md). `api_keys.tenant_id` and `api_audit_log.tenant_id` use FR-162's `DEFAULT public.get_default_tenant_id()` pattern.
- **Migration replay safety** per [feedback_migration_replay_safety.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_migration_replay_safety.md). `CREATE TABLE IF NOT EXISTS`, `CREATE INDEX IF NOT EXISTS`, `DROP POLICY IF EXISTS` before `CREATE POLICY`.
- **Prettier before deploy** per [feedback_prettier_before_commit.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_prettier_before_commit.md).

## Risk register

| Risk                                                                | Mitigation                                                                                                                                                                                        |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrapping `pipeline-status` breaks the kanban (legacy user-JWT path) | Detect-and-route via `isApiKey()` heuristic. If header doesn't match the `dp_*` prefix, fall through to the legacy handler unchanged. J1.3 quickstart explicitly verifies the kanban still works. |
| `SUPABASE_JWT_SECRET` not available in Edge Function env            | Fail closed with `503 GATEWAY_NOT_CONFIGURED`. Document in research.md Decision 2. Verified during build.                                                                                         |
| Audit insert latency adds to user request                           | Fire-and-forget after response. Failed audit writes log to console; user request is never blocked. Documented in research.md Decision 4.                                                          |
| Concurrent rotate produces two new keys                             | Wrap rotate in a single SQL transaction with `SELECT ... FOR UPDATE` on the old key. Documented in spec.md edge cases.                                                                            |
| Hash collision (mathematically improbable but covered)              | UNIQUE constraint on `key_hash`. Issuance retries once with a fresh random value on conflict; second collision returns 500.                                                                       |
| Raw key accidentally logged or returned twice                       | Issuance modal shows once and never persists raw value to disk; listing endpoint explicitly omits `raw_key` and `key_hash` fields. J2.4 quickstart explicitly checks the network response.        |
| FR-162's RLS policies fail closed for the gateway-minted JWT        | The minted JWT carries `tenant_id` claim → COALESCE picks it up → RLS scopes correctly. Smoke verified in J1.1.                                                                                   |

## Out of scope

- **Wrapping all 24 Edge Functions** — defer to FR-163 v1.1 or per-feature opt-in over time.
- **OpenAPI publication + auto-generated SDK** — defer to a polish FR.
- **OwnYourGig switchover from Supabase JS client to gateway** — defer to FR-169.
- **Versioned REST routes (`/v1/...`)** — defer; per-function versioning if/when needed.
- **Customer-facing key dashboard** — admin-only in v1.0; FR-168 adds customer-facing views.

## Rollback plan

Each journey is independently revertable:

- **J1 revert**: drop `api_keys` table; revert `pipeline-status` wrap. Existing user-JWT path unaffected.
- **J2 revert**: remove admin UI + admin endpoint actions. The table remains; ops can manage keys via direct SQL until restored.
- **J3 revert**: drop `api_audit_log` table; revert middleware audit/rate-limit calls. Gateway still works without observability.

## Dependencies

- **FR-162** (Multi-Tenancy Foundation) — `tenants` table, RLS policies, `get_default_tenant_id()`, `set_tenant_context`. All shipped.
- **FR-162 v1.1** (JWT-aware DEFAULT) — ensures middleware-minted JWTs carry tenant_id correctly. Shipped.
- **FR-063** (Rate limit) — `rate_limit_log` table + `_shared/rate-limit.ts`. Already in production.
- **FR-145 v1.1** (test_runs evidence) — verify:feature regression for FR-130/161/106 still passes after this lands.

## Success metrics (mapped from spec.md SC-001..SC-005)

- **SC-001**: J1.1 quickstart returns isolated tenant data — verified manually post-deploy.
- **SC-002**: J1.2 returns 401 for revoked, plus J1's negative cases.
- **SC-003**: J3.2 audit query returns one row per call, no missing/duplicates.
- **SC-004**: regression `pnpm verify:feature FR-130/161/106 --stage test` returns exit 0 unchanged.
- **SC-005**: `api_audit_log` and `api_keys` are reachable as data sources for FR-167 (Billing) and FR-168 (Onboarding) without further FR-163 work.
