# Feature Specification: DevPilot API Gateway + Customer Auth (Foundation)

**Feature Code**: FR-163
**Branch**: `001-coop-marketplace-platform`
**Created**: 2026-05-08
**Status**: Draft
**Input**: API key infrastructure + Edge Function middleware that pins `request.jwt.claim.tenant_id` so FR-162 RLS isolation applies to external callers. Rate limiting reuses FR-063 infra; audit logging via a new `api_audit_log` table; one pilot endpoint (`pipeline-status`) wrapped end-to-end. Deliberately excludes wholesale endpoint rewriting, OpenAPI/SDK, and the OwnYourGig switchover (deferred to FR-163 v1.1 and FR-169 respectively).

## User Scenarios & Testing _(mandatory)_

### Journey 1 — Gateway infrastructure end-to-end (Priority: P1)

An external tenant must be able to call a DevPilot Edge Function with their API key in the `Authorization: Bearer` header and have the request resolve to their tenant's data — nothing else. This journey ships the table, the middleware, and one wrapped endpoint as a complete vertical slice.

**Why this priority**: Nothing else in the FR-162→168 arc works for an external customer until this exists. Until a request can carry "I am tenant X" through to the DB layer, FR-167 (billing) and FR-168 (onboarding) have nothing to bind to. Ships first.

**Independent Test**: Insert an API key for a synthetic test tenant directly via SQL. Call `pipeline-status` with `Authorization: Bearer <raw_key>`. Verify the response contains only that tenant's features (per FR-162 RLS isolation). Try again with a revoked key — get 401. Cleanup.

**Acceptance Scenarios**:

1. **Given** an `api_keys` row exists with `tenant_id = X` and `revoked_at IS NULL`, **When** an external caller hits `pipeline-status` with `Authorization: Bearer <raw_key>`, **Then** the middleware verifies the key against the stored hash, calls `set_config('request.jwt.claim.tenant_id', X, true)`, the wrapped handler runs, and the response contains only tenant X's features.
2. **Given** the same key after `revoked_at` is set, **When** the call is repeated, **Then** the middleware returns `401 INVALID_API_KEY` and the handler is never invoked.
3. **Given** a request with no `Authorization` header (or a key not in the table), **When** the middleware runs, **Then** it returns `401 INVALID_API_KEY` without leaking which case applied.

---

### Journey 2 — Admin UI for API key lifecycle (Priority: P2)

An admin must be able to issue, rotate, and revoke API keys for tenants without dropping into SQL. The raw key is shown ONCE on creation; afterwards only the prefix and metadata are visible.

**Why this priority**: J1's smoke can use direct SQL to seed a key. The admin UI is the productisation step — needed before FR-168 (Self-Service Onboarding) can issue keys to customers. Ships second.

**Independent Test**: Open the admin module's API Keys panel. Click Issue → enter tenant + name → modal shows the raw key with a copy-to-clipboard button and a clear "you will not see this again" notice. Close the modal — the key is now listed by prefix only. Click Rotate → revokes the old, issues a new under the same name. Click Revoke → marks `revoked_at`. Refresh the panel — state persists.

**Acceptance Scenarios**:

1. **Given** an admin clicks Issue on the API Keys panel and submits `{ tenant_id, name }`, **When** the backend creates the key, **Then** the response includes the raw key value AND `key_prefix`. The raw value is displayed once via a modal with a copy-to-clipboard affordance and a non-dismissible "you will not see this again" notice; subsequent panel reads return only the prefix.
2. **Given** an admin clicks Rotate on an existing key, **When** the backend processes the request, **Then** the old key's `revoked_at` is set AND a new key is issued under the same name; the modal shows the new raw value once.
3. **Given** an admin clicks Revoke, **When** the backend processes the request, **Then** `revoked_at` is set and the key listing reflects the revocation immediately. The 401 path in J1's middleware fires for the next call with that key.

---

### Journey 3 — Rate limiting + audit logging (Priority: P3)

Every gateway call is rate-limited per API key (reusing FR-063 `rate_limit_log`) and audited to a new `api_audit_log` table. Operators get visibility into who is calling what, when, and how often.

**Why this priority**: Defense in depth and operational visibility. Doesn't block J1 functionality but is required before FR-167 (Billing) — usage metering reads from `api_audit_log`. Ships third.

**Independent Test**: Issue an API key with `rate_limit_per_minute = 3`. Call the wrapped endpoint 4 times in under a minute — the fourth returns `429 RATE_LIMITED` with `Retry-After`. Query `api_audit_log` for the tenant — it contains rows for all 4 attempts (3 successes, 1 rate-limited). Wait for the window — fifth call succeeds.

**Acceptance Scenarios**:

1. **Given** an API key with `rate_limit_per_minute = N`, **When** more than N calls arrive within 60 seconds, **Then** subsequent calls return `429 RATE_LIMITED` with a `Retry-After` header indicating seconds until the window resets.
2. **Given** any gateway call (success, error, rate-limited), **When** `withApiGateway` finishes processing, **Then** an `api_audit_log` row is written with `tenant_id, api_key_id, endpoint, method, status_code, duration_ms, error_code (nullable), request_id`. RLS scoped per FR-162 means each tenant only sees its own audit entries; service role sees all.
3. **Given** a wrapped handler throws an unhandled exception, **When** the middleware catches it, **Then** an audit row is still written with `status_code=500`, the exception message is captured in `error_code`, and the original exception's response shape is returned (no crash without an audit trail).

---

### Edge Cases

- **Forward-compat with the existing `set_tenant_context` RPC** (created in FR-162's J2 prep but unused in v1.0): the middleware can call it OR set the GUC inline via `supabase.rpc('set_tenant_context', { tenant_id })` — both paths land at the same `set_config`. Document the choice in research.md.
- **Concurrent rotate**: two admins clicking Rotate at the same instant. The endpoint must use `SELECT ... FOR UPDATE` or a unique constraint to ensure only one new key is issued; the second admin sees the already-rotated key.
- **Expired key (`expires_at` past)**: same handling as `revoked_at` — 401 INVALID_API_KEY, no leakage of which case applied.
- **Empty Bearer (`Authorization: Bearer `)**: 401 INVALID_API_KEY (matches existing FR-130 / FR-145 convention; see [feedback_api_test_negative_case_conventions.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_api_test_negative_case_conventions.md) — Supabase's gateway returns 401 first for malformed JWTs).
- **OwnYourGig keeps its existing path**: this feature does NOT change OwnYourGig's Supabase JS client + RLS pathway. AC-5 in the original proposal (OwnYourGig switchover) is deferred to FR-169.
- **Rate-limit storage on `rate_limit_log` is keyed by `identifier`**: pass `api_key_id::text` as the identifier (not IP); the existing `_shared/rate-limit.ts` is identifier-agnostic.
- **Audit row writes can race with handler response**: write the audit row asynchronously (fire-and-forget) so a slow audit insert doesn't add latency. If the audit insert fails, log to console and proceed; do NOT fail the user request.

## Requirements _(mandatory)_

### Functional Requirements

- **FR-163-1**: `api_keys` table per [data-model.md](data-model.md) with hashed key storage, key_prefix for identification, scopes JSONB, per-key rate limit override, expiry/revoke timestamps. RLS scoped per FR-162.
- **FR-163-2**: Admin UI under the existing roadmap/admin module exposes Issue / Rotate / Revoke for API keys. Raw key value shown ONCE on creation via a modal with copy-to-clipboard.
- **FR-163-3**: `supabase/functions/_shared/api-gateway.ts` exports `withApiGateway(handler)` middleware. Verifies Bearer key, sets tenant context via `set_config('request.jwt.claim.tenant_id', <tenant_id>, true)`, returns `401 INVALID_API_KEY` for unknown/revoked/expired keys, updates `last_used_at` on success.
- **FR-163-4**: Rate limiting reuses FR-063 `_shared/rate-limit.ts` keyed off `api_keys.id`. Default 60 req/min; per-key override via `api_keys.rate_limit_per_minute`. Quota exhaustion returns `429` with `Retry-After`.
- **FR-163-5**: `api_audit_log` table per [data-model.md](data-model.md). Indexed on `(tenant_id, created_at DESC)`. Audit rows written by `withApiGateway` for every request (success, error, rate-limited). Failed audit inserts must NOT fail the user request.
- **FR-163-6**: `pipeline-status` Edge Function wraps its handler with `withApiGateway` and accepts API-key-authenticated requests. Existing OwnYourGig user-JWT path remains unchanged (the wrapped function detects key-vs-JWT auth and routes accordingly).

### Key Entities

- **`api_keys`**: new table holding hashed API keys per tenant with lifecycle metadata.
- **`api_audit_log`**: new table holding per-request audit entries.
- **`withApiGateway`**: new Edge Function middleware in `_shared/`.

## Success Criteria _(mandatory)_

### Measurable Outcomes

- **SC-001**: An external tenant with a valid API key can call `pipeline-status` and get only their tenant's features. Verified end-to-end in quickstart J1.
- **SC-002**: Revoked / expired / unknown keys consistently return 401 INVALID_API_KEY with no information leakage about which condition applied.
- **SC-003**: After 5 minutes of synthetic load (configurable rate), `api_audit_log` contains one row per request, no missing rows, no double-writes; rate-limit responses are observable in the audit log.
- **SC-004**: Existing OwnYourGig flows (kanban, UAT, deploy) continue to use their existing user-JWT path and are unaffected by this feature. Verified by `pnpm verify:feature FR-130/161/106 --stage test` returning exit 0 unchanged.
- **SC-005**: FR-167 (Billing) and FR-168 (Onboarding) can read `api_audit_log` for usage metering and `api_keys` for customer key issuance without further FR-163 changes.
