# Research — FR-162 DevPilot Multi-Tenancy Foundation

## Decision log

### 1. Tenant identifier shape — UUID with a separate human `code`

**Decision**: `tenants.id` is a UUID PK; `tenants.code` is a UNIQUE text slug (`ownyourgig`, future tenants like `acme-corp`). Foreign keys reference `id`, never `code`.

**Why**: UUIDs survive renames (a tenant can change its code without rewriting every FK). The `code` is for human-readable URLs and logs; the `id` is for relational integrity. Same convention as `product_features.id` vs `product_features.feature_code`.

**Alternative considered**: text-only PK using the code. Rejected — every rename would cascade across 28 tables, and nothing in Supabase needs the code embedded in the FK.

### 2. RLS policy expression — `current_setting('request.jwt.claim.tenant_id', ...)`

**Decision**: RLS policies use `current_setting('request.jwt.claim.tenant_id', true)::uuid` to read the tenant context. The `, true` second arg means the function returns NULL instead of erroring when the setting isn't set.

**Why**: This is Supabase's documented pattern for JWT-claim-driven RLS. The `set_config` companion call (J3) populates it from the Edge Function side. NULL handling matters for the unauthenticated-fallback path — when no claim is set and no fallback fired, the cast yields NULL and policies naturally exclude all rows (fail closed).

**Alternative considered**: a session-level GUC set via `ALTER ROLE`. Rejected — that's per-database-role, not per-request, and would force every Edge Function to authenticate as a tenant-specific role (heavyweight).

### 3. Scope set — 28 tables, enumerated explicitly

**Decision**: The scope set is the 28 tables enumerated in plan.md (and AC-2). New DevPilot tables added after FR-162 must include `tenant_id` from creation; the convention is documented in the constitution's "Supabase Backend Platform Standards" principle.

**Why**: Explicit enumeration is auditable. The verifier (J4) reads the same list. Avoids "every DevPilot pipeline table" ambiguity that's bitten earlier features (e.g., FR-106 v2 spec listed tables that didn't exist).

**Tables out of scope**: `auth.*`, `storage.*` (Supabase-managed), `profiles` (per-user, not per-tenant), `admin_users` (system-level), `delivery_role_assignments` (per-user role catalog), `notification_*` (TBD per FR-168), and anything in `private` schema. Docs cross-reference these in plan.md so reviewers don't suspect omission.

### 4. Service role bypass — preserve native Postgres BYPASS

**Decision**: Do NOT add `RESTRICTIVE` clauses to RLS policies. Service role retains its native BYPASS, so admin/ops scripts (`verify-feature-state.ts`, `sync:roadmap`, `update-handler.ts`) keep working.

**Why**: Per [feedback_enforcement_alarms_not_errors.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_enforcement_alarms_not_errors.md), enforcement layers must alarm/warn, never hard-fail legitimate operations. A `RESTRICTIVE` clause that constrains service role would break every batch script. FR-167 (Billing) will introduce a separate "elevated tenant scope" pattern when admin reporting across tenants becomes needed; FR-162 keeps it simple.

### 5. Edge Function tenant resolution — `set_config` per request

**Decision**: Each Edge Function calls `set_config('request.jwt.claim.tenant_id', <uuid>, true)` once per request, before any user-scoped query. The `true` third arg scopes the setting to the local transaction.

**Why**: One source of truth (the JWT) flows into one DB-level setting (the GUC) which all RLS policies read. The third-arg `true` means concurrent connections don't leak each other's tenant — every transaction sees only its own setting.

**Alternative considered**: pass `tenant_id` explicitly into every WHERE clause from the application code. Rejected — every Edge Function would need to be re-audited on every PR; RLS centralises the rule.

### 6. Unauthenticated fallback — `get_default_tenant_id()` not `IF NULL THEN ALL`

**Decision**: Edge Functions that legitimately receive no JWT (GitHub App webhook, anonymous public reads, ops scripts) call `set_config('request.jwt.claim.tenant_id', get_default_tenant_id(), true)` — pinning to OwnYourGig — rather than letting the GUC be NULL.

**Why**: Two reasons. First, NULL would cause RLS policies to exclude all rows (fail-closed default) — the GitHub webhook would silently produce zero-write outcomes. Second, the OwnYourGig fallback is explicit and reviewable: every Edge Function declares its tenant resolution path. FR-163 (API Gateway) will replace the fallback by requiring an installation-scoped tenant claim in webhook payloads.

### 7. Migration phasing — column first, RLS second

**Decision**: J1 ships the column + backfill + indexes WITHOUT enabling RLS. J2 enables RLS in a separate migration after J1 is verified live.

**Why**: Minimises blast radius. After J1, all data carries the right tenant tag and the cluster behaves identically to today (any caller still sees all rows). After J2, isolation kicks in. Each journey is independently revertable. Per [feedback_pipeline_bootstrap.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_pipeline_bootstrap.md), pipeline-modifying features must each leave the system coherent — a single combined migration that did both at once would create a window where the column exists but no Edge Function had been updated yet to call `set_config`, locking out every user.

## Open questions resolved

| Question                                                           | Resolution                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| What about `profiles`, `admin_users`, `delivery_role_assignments`? | Out of scope — these are per-user identity tables, not tenant-scoped data. Documented in research Decision 3.                                                                                                                                        |
| What about `auth.*` and `storage.*`?                               | Supabase-managed; not in the public schema. Out of scope.                                                                                                                                                                                            |
| Does the deploy command's `update-handler.ts` need a tenant claim? | No — runs as service role, BYPASS preserved. Documented in research Decision 4.                                                                                                                                                                      |
| Will the `pipeline-status` endpoint break for the kanban?          | No — the frontend's Supabase client carries the user's JWT; the Edge Function reads `tenant_id` from the JWT and sets it via `set_config`. RLS then scopes all 28 tables to the OwnYourGig tenant. Backwards-compatible for the existing admin user. |
| How do we test cross-tenant isolation without a second tenant?     | Quickstart includes a "synthetic second tenant" insert (a one-off SQL that adds `code='test-isolation'` + a few fixture rows). Cleanup script removes it after verification.                                                                         |
| Will RLS slow down kanban loads?                                   | Negligible — `(tenant_id)` index on every table; the policy is a single equality check. Performance budget < 2s page load (constitution IX) will not be touched.                                                                                     |

## Constraints and assumptions

- **No new tables outside `tenants`**: pure refactor.
- **Replay-safe migrations**: per [feedback_migration_replay_safety.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_migration_replay_safety.md). Idempotent column adds, conditional NOT NULL escalation, ON CONFLICT for seeds, DROP POLICY IF EXISTS before CREATE POLICY.
- **Backwards compatibility**: existing OwnYourGig admin user, all existing Edge Functions, all existing UI flows must work unchanged from the user's perspective.
- **Deploy-branch only**: per session policy, all changes land on `001-coop-marketplace-platform`. No new branch.
- **Pipeline-fix discipline**: per [feedback_pipeline_bootstrap.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_pipeline_bootstrap.md), each journey must leave the system coherent. J1's column-without-RLS state is acceptable. J2's RLS-without-Edge-Function-context state would NOT be acceptable — so J2 and J3 MUST ship together (single deploy), even though they remain separate migrations/code edits internally.
