# Research — FR-163 DevPilot API Gateway + Customer Auth (Foundation)

## Decision log

### 1. Key storage — SHA-256 of raw key, prefix shown for identification

**Decision**: Store `key_hash = sha256(raw_key)` (base16, 64 chars). Display `key_prefix` (first 8 chars of the raw key, prefixed with a tenant-friendly tag like `dp_live_` or `dp_test_`) in the admin UI. The raw key is shown ONCE on creation and never again.

**Why**: SHA-256 is a one-way hash — even with DB access, an attacker can't recover the raw key. The prefix lets admins identify keys without exposing them ("dp_live_a1b2c3d4… revoked yesterday"). Bcrypt would be overkill since API keys are 256-bit random tokens, not user passwords; collision/brute-force resistance comes from entropy, not hash slowdown.

**Alternative considered**: Store keys in plaintext. Rejected — any DB compromise leaks all keys for all tenants.

**Alternative considered**: Bcrypt with cost factor 10. Rejected — adds 50-100ms per request to verify, defeats the rate-limit middleware's tight latency budget. SHA-256 verifies in microseconds.

### 2. Tenant context propagation — call existing `set_tenant_context` RPC

**Decision**: `withApiGateway` calls `supabase.rpc('set_tenant_context', { tenant_id })` (the RPC created in FR-162 J2 prep but never wired up). This sets the GUC `request.jwt.claim.tenant_id` for the current transaction, which FR-162's RLS policies read via `auth.jwt() ->> 'tenant_id'` ... NO wait — the RLS policies use `current_setting('request.jwt.claim.tenant_id', true)` directly inside the policy expression, NOT `auth.jwt()`. The COALESCE pattern from FR-162 v1.1 reads the same GUC.

So calling `set_tenant_context` writes to the GUC the policy reads from. They're aligned.

**Why**: Reuses an existing RPC instead of building new SQL. The RPC is `SECURITY DEFINER` so the gateway can call it from a service-role-authed context without privilege issues.

**Caveat**: `set_config(..., true)` is transaction-scoped. PostgREST's connection-per-request model means each subsequent supabase.from(...) call from within the same Edge Function handler is a SEPARATE transaction. So if the handler does `supabase.rpc('set_tenant_context', ...)` then `supabase.from('test_cases').select(...)`, those run in different transactions and the GUC is lost.

**This is the same constraint that defeated FR-162's original J3 approach.** For FR-163 to work end-to-end, the middleware must instead use the FR-162 v1.1 DEFAULT mechanism: don't call `set_tenant_context` at the gateway; instead, ensure the API key's tenant is in the JWT that's passed to PostgREST. That means either:

- (a) Mint a session-scoped JWT containing `tenant_id` claim and pass it through to the wrapped handler's queries, OR
- (b) Pass the `tenant_id` explicitly in every WHERE clause inside the wrapped handler (defeats RLS centralisation).

**Decision (revised)**: The middleware mints a short-lived (60-second) JWT with `tenant_id` baked into the claims, signed with the project's JWT secret. The wrapped handler's `supabase.auth.setSession({ access_token })` (or equivalent) replaces the request's auth context with this minted JWT for the duration of the handler call. PostgREST then sees the `tenant_id` claim in `auth.jwt()` and FR-162's RLS COALESCE picks it up.

**Alternative considered**: Pass `tenant_id` explicitly to every query in the wrapped handler. Rejected — couples handler code to gateway internals; requires refactoring the 24 candidate handlers we're explicitly NOT rewriting in this scope.

**Implementation note**: JWT minting requires `SUPABASE_JWT_SECRET`. If that env var isn't available in the Edge Function context (it usually IS auto-injected for project Edge Functions), this approach fails closed and the gateway returns 503 with a clear error. Verified during build phase.

### 3. Rate limit identifier — `api_keys.id::text`

**Decision**: Pass `api_keys.id::text` to FR-063's `_shared/rate-limit.ts` as the `identifier`. The existing `rate_limit_log` table already has an `identifier` text column; we write `api_key_id` UUIDs as text into it.

**Why**: Per-key limits map cleanly to FR-063's existing model. No new table, no new helper. A noisy customer's keys throttle without affecting other tenants.

**Alternative considered**: New `api_rate_limit_log` table. Rejected — pure duplication of FR-063 infra.

### 4. Audit log write strategy — fire-and-forget after response

**Decision**: After the wrapped handler returns its `Response`, the middleware calls `supabase.from('api_audit_log').insert(...)` without awaiting (or with a short timeout + console.error on failure). The user request is unblocked from the audit write; the audit row is best-effort.

**Why**: Audit reads are operational (debugging, billing reconciliation), not real-time. Adding 20-50ms of round-trip per request to wait for the audit insert is a regression for end-customer latency. If the audit insert fails, log to Edge Function console; ops can backfill from request logs if needed.

**Alternative considered**: Block on the audit write to guarantee atomicity. Rejected — defeats the latency budget.

### 5. Modal-once raw key display — frontend pattern

**Decision**: The admin UI's Issue button opens a modal that:

- Calls the issuance endpoint
- Displays the raw key in a copy-to-clipboard input (`<input readonly>` with a button that runs `navigator.clipboard.writeText`)
- Shows a non-dismissible warning: "**This key value will not be shown again. Save it now.**"
- Has a single "I've saved it" close button (no X / Esc dismissal until that click)

**Why**: Standard pattern from GitHub PATs, Stripe API keys, AWS access keys. Reduces "I lost my key" support tickets.

### 6. Pilot endpoint choice — `pipeline-status`

**Decision**: `pipeline-status` is the first wrapped endpoint.

**Why**:

- Read-only (no risk of corrupting tenant data via a misconfigured wrap)
- Already RLS-protected by FR-162 (authenticated path; the gateway path needs to land at the same RLS gate)
- Single response shape; easy to verify isolation by counting features
- Already exercised heavily by the kanban — instant smoke if it breaks

**Alternative considered**: `uat-get-review-context` (also read-only). Rejected — depends on more upstream tables and surfaces more failure modes; not the cleanest pilot.

## Open questions resolved during build prep

| Question                                                            | Resolution                                                                                                                                                                                                                                   |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does the OwnYourGig kanban break when `pipeline-status` is wrapped? | No — the wrap is detect-and-route. If the request carries an OwnYourGig user JWT (existing path), it's processed as today. If it carries an API key (new path), the gateway intercepts. Two auth surfaces coexist on the same Edge Function. |
| What if the JWT secret isn't accessible to mint session JWTs?       | Fail closed: 503 `GATEWAY_NOT_CONFIGURED`. Verified during T002 of build.                                                                                                                                                                    |
| How do we test rate limiting without burning real-time minutes?     | Quickstart J3 issues a key with `rate_limit_per_minute = 3`, makes 4 quick calls in a loop. Synthetic.                                                                                                                                       |
| Does the pilot endpoint need to expose the API key in audit logs?   | Yes — `api_key_id` is FK'd to `api_keys.id`. The hash is NEVER stored in audit logs. The prefix is fine for log readability.                                                                                                                 |
| When customers eventually get keys, who issues them?                | FR-168 (Self-Service Onboarding) will call the same admin issuance endpoint internally. FR-163 ships the admin UI; FR-168 reuses the backend.                                                                                                |

## Constraints and assumptions

- **Replay-safe migrations** per [feedback_migration_replay_safety.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_migration_replay_safety.md).
- **NOT NULL columns ship with DEFAULT** per [feedback_not_null_columns_need_defaults.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_not_null_columns_need_defaults.md). `api_keys.tenant_id` and `api_audit_log.tenant_id` inherit FR-162's `DEFAULT public.get_default_tenant_id()` pattern (or set explicitly at INSERT via the admin endpoint).
- **No new Edge Functions** — `withApiGateway` is a wrapper around existing handlers; it doesn't create a new function. Admin issuance/rotate/revoke is added to the existing `roadmap-admin-features` Edge Function.
- **OwnYourGig path unchanged** — this feature does NOT modify the kanban/UAT/deploy frontend code. Existing user-JWT + RLS continues to work.
- **Deploy-branch only**: per session policy, all changes land on `001-coop-marketplace-platform`.
