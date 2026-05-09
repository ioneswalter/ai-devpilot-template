# Data Model — FR-165

FR-165 v1.0 ships **no schema changes**. It's an infrastructure + tooling FR.

The new DevPilot Supabase project will eventually receive the same 35 RLS-scoped tables that exist in the OwnYourGig project, but that's accomplished by replaying existing migrations — not by adding new tables.

## Files added (not tables)

| Artefact                                       | Type               | Purpose                                                                                                |
| ---------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------ |
| `LICENSE-DEVPILOT`                             | repo-root file     | BSL 1.1 license applied to enumerated DevPilot paths                                                   |
| `docs/repo-split-plan.md`                      | docs               | Path list of truth + cutover entrance criteria + rollback procedure                                    |
| `scripts/devpilot-readiness.ts`                | script (ts)        | Reports gateway-coverage % across DevPilot Edge Functions; regression-only failure mode                |
| `scripts/lib/devpilot-readiness-baseline.json` | baseline file      | Stores last-known-good coverage so the verifier can detect regressions                                 |
| `scripts/extract-devpilot-repo.sh`             | shell script       | Wraps `git filter-repo --paths-from-file` to produce sibling staging clone                             |
| `scripts/devpilot-split-paths.txt`             | path list          | Generated FROM `docs/repo-split-plan.md` by the script — passed to `git filter-repo --paths-from-file` |
| `scripts/verify-devpilot-split.ts`             | aggregate verifier | Runs readiness + LICENSE coverage + extraction dry-run; single PASS/FAIL                               |
| `apps/web/src/lib/devpilot-sdk.ts`             | TypeScript module  | Re-exports productApi/pipelineApi/featureApi with `VITE_DEVPILOT_BASE_URL` indirection                 |

## Configuration / env vars

| Var                      | Default                             | Purpose                                                                |
| ------------------------ | ----------------------------------- | ---------------------------------------------------------------------- |
| `VITE_DEVPILOT_BASE_URL` | `import.meta.env.VITE_SUPABASE_URL` | Override target for DevPilot SDK; cutover flips this to staging DO App |

## Staging cloud resources

| Resource            | Naming                            | Notes                                                                        |
| ------------------- | --------------------------------- | ---------------------------------------------------------------------------- |
| DigitalOcean App    | `ai-devpilot-staging`             | New region (SYD1 to match prod), no public DNS                               |
| Supabase project    | `<project-id>` w/ slug `-staging` | Migrations replayed; service role key + URL documented in repo-split-plan.md |
| Supabase auth users | none seeded                       | Empty until cutover                                                          |

## Path list of truth (excerpt — full list in repo-split-plan.md)

```
supabase/functions/_shared/api-gateway.ts
supabase/functions/_shared/api-key-helpers.ts
supabase/functions/_shared/learning-logger.ts
supabase/functions/_shared/prompt-library.ts
supabase/functions/admin-dashboard/                     # AI DevPilot operator section only — NOT the full file
supabase/functions/implement-feature/
supabase/functions/product-features/
supabase/functions/promote-memory-row/
supabase/functions/usage-rollup/
supabase/functions/pipeline-status/
supabase/functions/pipeline-orchestrator/
supabase/functions/roadmap-admin-features/
supabase/functions/test-data-gen/
supabase/functions/guided-testing/
supabase/functions/dedup-check/
supabase/functions/devpilot-chat/
supabase/functions/claude-stream/
supabase/migrations/2026*_fr16*.sql                     # All FR-162..168 migrations
apps/web/src/features/roadmap/
apps/web/src/features/devpilot/
apps/web/src/lib/api/product-api.ts
apps/web/src/lib/api/feature-api.ts
apps/web/src/lib/api/pipeline-api.ts
apps/web/src/lib/parse-constitution.ts
specs/162-devpilot-multi-tenancy/
specs/163-devpilot-api-gateway/
specs/164-devpilot-memory-isolation/
specs/165-devpilot-repo-cloud-split/
specs/167-devpilot-usage-rollup/
.specify/memory/constitution.md
scripts/lib/constitution-merger.ts
scripts/verify-rls-status.ts
scripts/verify-feature-state.ts
```

## Verifier semantics

### `pnpm verify:devpilot-readiness`

```
input: scan supabase/functions/<name>/index.ts for imports of withApiGateway from _shared/api-gateway.ts
baseline: scripts/lib/devpilot-readiness-baseline.json — { wrapped: number, total: number, last_updated: string }
output: stdout — "Readiness: X/Y (Z%) — baseline X/Y (Z%) — PASS|REGRESSION"
exit: 0 if current >= baseline; non-zero if regression
```

### `pnpm verify:devpilot-split`

```
runs:
  1. verify:devpilot-readiness (regression check)
  2. verify:license-coverage — confirms LICENSE-DEVPILOT path enumeration matches the docs/repo-split-plan.md path list
  3. verify:extraction-dryrun — runs `git filter-repo --paths-from-file ... --analyze-only` against a temp dir, asserts the documented path count was reachable
output: single "PASS — DevPilot split readiness verified" or "FAIL — N issues found" line, then per-check details
exit: 0 if all three pass, non-zero otherwise
```

## No FR162 scope-set changes

`scripts/verify-rls-status.ts` `FR162_SCOPE_TABLES` is unchanged at 35. FR-165 introduces no new RLS-scoped tables.
