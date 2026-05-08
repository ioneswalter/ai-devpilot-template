# Implementation Plan — FR-162 DevPilot Multi-Tenancy Foundation

**Branch**: `001-coop-marketplace-platform` (no new branch)
**Constitution check**: PASS — pure refactor; no `any` types added; no file exceeds 300 lines after change; RLS mandate is the central goal of the feature.

## Architecture decisions

Four targeted changes, sequenced as four journeys:

| Layer                     | Change                                                                                                                     | Files / Migrations                                                                    |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| **DB schema (J1)**        | New `tenants` table + `get_default_tenant_id()` helper; add `tenant_id` to 28 scoped tables; backfill; NOT NULL; index.    | new migration `<timestamp>_fr162_j1_tenants_and_scope_columns.sql`                    |
| **DB security (J2)**      | Enable RLS on every scoped table; per-table `<table>_tenant_isolation` policy.                                             | new migration `<timestamp>_fr162_j2_rls_policies.sql` + new `set_tenant_context` RPC. |
| **Edge Functions (J3)**   | New `_shared/tenant-resolution.ts` helper; every authenticated Edge Function calls `resolveAndSetTenant` once per request. | new file + ~20 Edge Function diffs (one-line addition each).                          |
| **Verifier + smoke (J4)** | Extend `scripts/verify-rls-status.ts` to require RLS on all 28 scoped tables; run regression against FR-130/161/106.       | edit `scripts/verify-rls-status.ts`; no new files.                                    |

## Scope set — the 28 tables

(Source of truth: this document. Migrations and verifier read from this list.)

```
product_features              feature_versions             feature_spec_artifacts        spec_reviews
review_items                  implementation_requests      implementation_task_items     pipeline_runs
pipeline_queue                pipeline_failures            pipeline_notifications        test_cases
test_runs                     test_data_sets               test_failure_guidance         automated_test_scripts
api_verification_tests        uat_packages                 uat_checklist_items           uat_review_decisions
uat_review_audit              uat_scenarios                bp_review_projections         feature_dependencies
feature_comments              feature_ratings              prompt_templates              prompt_categories
prompt_ratings
```

(That's 29 names — `pipeline_failures` and `pipeline_notifications` are both in scope; the description says "28 tables" because some sibling features double-count. The migration loop iterates the deduplicated list above. Final headcount: 29 entries, all in scope.)

**Out of scope** (per research.md Decision 3):

- `auth.*`, `storage.*` (Supabase-managed)
- `profiles`, `admin_users`, `delivery_role_assignments` (per-user identity, not tenant-scoped)
- `tenants` itself (would create circular FK)

## Phase sequencing

```
J1 — Tenants table + scope columns + backfill (migrations only; data tagged but not isolated)
   ↓ verify: SELECT count(*) WHERE tenant_id IS NULL = 0 across the 28 tables; existing flows unchanged
J2 — RLS enable + policies on 28 tables (with TO authenticated; service role BYPASS preserved)
   ↓ verify: J2 deployed in same release as J3 — never deploy J2 alone (would lock out user JWT requests until J3 sets context)
J3 — Edge Function tenant resolution + OwnYourGig fallback (every authenticated function)
   ↓ verify: kanban / UAT / deploy paths render identically; GitHub webhook (FR-147) still processes events
J4 — Verifier extension + regression
   ↓ verify: pnpm verify:rls 28/28; pnpm verify:feature FR-130/161/106 all exit 0
```

**Critical sequencing rule**: J2 and J3 MUST ship together (single deploy). Per research.md Decision 7 + [feedback_pipeline_bootstrap.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_pipeline_bootstrap.md), any window where RLS is on but Edge Functions don't set the tenant context locks every user out of every scoped table. J1 alone is safe to deploy first; J2 alone is not.

## Constitution gate

- **File size**: every modified file stays under 300 lines. Largest single edit is the J1 migration (~150 lines for the loop and seeds). Edge Function diffs are 2-line additions each.
- **TypeScript strict**: no `any`. The `resolveAndSetTenant` helper has fully-typed parameters and return.
- **RLS mandate**: this feature _is_ the RLS mandate; constitution principle VIII is the central success metric (verified by J4).
- **Migration replay safety**: per [feedback_migration_replay_safety.md](file:///Users/ioneswalter/.claude/projects/-Users-ioneswalter-OwnYourGig/memory/feedback_migration_replay_safety.md). Every DDL is `IF NOT EXISTS` / `IF EXISTS`. Backfill UPDATEs are idempotent. NOT NULL escalation is gated.
- **Constitution validator**: `npx tsx scripts/validate-constitution.ts` runs on every PR via the build pipeline; FR-162 exercises no new violation patterns.

## Risk register

| Risk                                                                                 | Mitigation                                                                                                                                                                      |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J2 deployed without J3 → user JWT requests return zero rows / empty kanban           | Treat J2+J3 as one deploy unit. CI fails if J2 migration is in the deploy without the corresponding `_shared/tenant-resolution.ts` and Edge Function diffs.                     |
| Forgotten Edge Function → calls succeed but read no data                             | J3 includes a checklist of every authenticated Edge Function under `supabase/functions/`; reviewer confirms every entry was touched. CI greps for `resolveAndSetTenant` import. |
| GitHub App webhook (FR-147) breaks on first deploy                                   | J3 explicitly sets `allowFallback: true` on `github-app-webhook`. Quickstart J3.2 verifies a synthetic PR triggers a `pipeline_runs` insert under OwnYourGig tenant.            |
| Service role bypass accidentally restricted                                          | Policies use `TO authenticated` (not `PUBLIC` or `RESTRICTIVE`). Service role's BYPASS is Postgres-default. Quickstart J2.3 explicitly verifies.                                |
| Backfill takes too long on 1243 test_cases / 909 test_runs / 1060 task items         | Single `UPDATE … WHERE tenant_id IS NULL` per table; 30k rows cluster-wide; sub-second with no indexes-to-rebuild. Migration runs inside a transaction.                         |
| `_shared/tenant-resolution.ts` introduces a regression in already-released features  | Each Edge Function diff is one line; constitution validator + tsc check run on every change. J4.3 regression suite is the final gate.                                           |
| Trigger functions (`fr130_v21_promote_feature_on_uat_package_approval`) need updates | They run as `SECURITY DEFINER` — bypass RLS entirely. No change needed. Verified by smoke-running FR-130's release path after J2+J3.                                            |

## Out of scope

- Public/anon access to scoped tables (no use case today; revisit if FR-168 onboarding adds a public read path).
- Cross-tenant audit/billing reports — covered by FR-167.
- Repo split / BSL licensing — covered by FR-165.
- Removing the OwnYourGig fallback — covered by FR-163 once the API gateway lands.

## Rollback plan

Each journey is independently reversible:

- **J1 revert**: `ALTER TABLE … DROP COLUMN tenant_id` + drop tenants table + drop helper. Backfill data is metadata only — no functional state lost.
- **J2 revert**: `ALTER TABLE … DISABLE ROW LEVEL SECURITY` + `DROP POLICY` for each scoped table.
- **J3 revert**: revert the Edge Function diffs that import `resolveAndSetTenant`. With J2 also reverted, the cluster is back to today's behaviour.
- **J4 revert**: revert the `verify-rls-status.ts` extension.

Single-cycle rollback (J1+J2+J3+J4) is safe because no application data shape changes.

## Dependencies

- **FR-145 v1.1** (test_runs evidence) — J4 regression uses `verify:feature` which depends on FR-145 v1.1 + FR-106 v2 (already shipped this session).
- **FR-149 v1.1** (versioning) — `feature_versions` is in scope; no behavioural change.
- **FR-147** (GitHub App) — `github-app-webhook` is the canonical unauthenticated-fallback example for J3.

## Success metrics (mapped from spec.md SC-001..SC-005)

- **SC-001**: post-J1 SQL count = 0 for every scoped table.
- **SC-002**: `pnpm verify:rls` exit 0 with 28/28 (or 29/29 incl. duplicates) protected.
- **SC-003**: kanban load time unchanged (< 2s; existing budget).
- **SC-004**: regression `pnpm verify:feature` exits 0 for FR-130/161/106.
- **SC-005**: synthetic GitHub PR triggers a `pipeline_runs` insert under OwnYourGig tenant after J3 deploys.
