# Feature Specification — FR-165 DevPilot Repo + Cloud Split (BSL 1.1)

**Feature Code**: FR-165
**Theme**: `devpilot-split`
**Priority**: P1
**Status**: reviewed → in spec
**Branch**: `001-coop-marketplace-platform`
**Depends on**: FR-163 (DevPilot API Gateway — released)
**Unblocks**: FR-166 (Per-Tenant Provisioning, Patent Claim 5)

## Overview

DevPilot today lives inside the OwnYourGig monorepo: same git history, same DigitalOcean App, same Supabase project, same root LICENSE file. To productise DevPilot as a hosted SaaS (per the patent strategy and `project_devpilot_split_plan.md` memory), it eventually needs its own repo, its own infrastructure, and its own license terms. The naive end-state — a single irreversible cutover — is high-risk: 33 RLS-scoped tables, the entire roadmap UI, and ~50 Edge Functions would all need to migrate at once, while only 3 of those routes today flow through the FR-163 gateway.

FR-165 v1.0 instead lays the **non-destructive groundwork**:

1. **Legal protection now** — apply BSL 1.1 to the DevPilot-owned paths in the existing repo, not after a future cutover. A fork attempt today is unlicensed.
2. **Measurable readiness gate** — a verifier counts gateway-wrapped routes vs total DevPilot routes so "ready for cutover" is a number, not a feeling.
3. **Staged infrastructure** — a sibling `ai-devpilot-staging` repo and a `-staging`-suffixed DigitalOcean + Supabase project, provisioned but never DNS-pointed. Lets FR-166 patent-claim-5 work proceed against a real environment.
4. **SDK indirection** — `apps/web/src/lib/devpilot-sdk.ts` wraps the existing API exports behind a configurable base URL so OwnYourGig can flip targets via a single env change later.

The destructive cutover (stripping DevPilot from OwnYourGig, pointing prod at the new app, dropping tables) is **explicitly out of scope**. It will land as FR-165 v1.1 (or a successor FR) once the entrance criteria documented in J3 below are met — most importantly, ≥1 paying pilot via FR-168.

## Phases

### Phase J1 (P1) — BSL 1.1 license layer

Add `LICENSE-DEVPILOT` at repo root. Apply Business Source License 1.1 with a 4-year change date and Apache 2.0 fallback to the enumerated DevPilot-owned paths. The existing root `LICENSE` continues to govern the OwnYourGig-specific code.

**Why first**: legal protection is decoupled from the repo split. Anyone forking the repo today operates under whatever the current root LICENSE permits — applying BSL specifically to the DevPilot subtree binds future forks regardless of when the actual repo split happens.

**Acceptance criteria covered**: AC#1

### Phase J2 (P2) — API readiness gate

`scripts/devpilot-readiness.ts` produces a coverage report: how many DevPilot Edge Functions route through the FR-163 `withApiGateway` middleware, vs total DevPilot Edge Functions. Initial baseline (~3/35 ≈ 8%) is documented in stdout. The verifier runs as `pnpm verify:devpilot-readiness` and exits non-zero **only on regression** — i.e., a previously-wrapped route losing its wrapper. It does not block on an absolute coverage threshold (the threshold is for cutover, not for regular development).

**Acceptance criteria covered**: AC#2

### Phase J3 (P3) — Repo extraction tooling + cutover plan doc

`docs/repo-split-plan.md` — single source of truth for:

- The git filter-repo path list (which files belong to DevPilot)
- Cutover entrance criteria (≥1 paying pilot via FR-168, ≥80% gateway coverage, data-migration dry-run green, rollback rehearsed)
- Explicit "out of scope for v1.0" statement
- Step-by-step rollback procedure

`scripts/extract-devpilot-repo.sh` reads that path list and runs `git filter-repo --paths-from-file` to produce a sibling `../ai-devpilot-staging/` clone. History preserved, no commits to the new repo published. Smoke check: resulting clone contains the documented Edge Functions + migrations + roadmap kanban UI files.

**Acceptance criteria covered**: AC#3, AC#4

### Phase J4 (P4) — Staging cloud environment

New DigitalOcean App + Supabase project provisioned with `-staging` suffix in their slugs. Migrations replay end-to-end against the new Supabase project; `pnpm verify:rls` reports 35/35 there. **No public DNS, no traffic routed.** Project IDs and URLs documented in `docs/repo-split-plan.md`.

**Acceptance criteria covered**: AC#5

### Phase J5 (P5) — SDK indirection

`apps/web/src/lib/devpilot-sdk.ts` re-exports the existing `productApi`, `pipelineApi`, `featureApi` symbols, but routes their `apiClient` calls through a base URL read from `import.meta.env.VITE_DEVPILOT_BASE_URL`. Default value preserves the current behaviour (in-monorepo Edge Functions). Setting the env var to the staging DO App URL is a one-flag swap. **No existing call sites are refactored** — the SDK module re-exports backward-compatibly, so it costs zero churn elsewhere.

**Acceptance criteria covered**: AC#6

### Phase J6 (P6) — Aggregate verifier

`pnpm verify:devpilot-split` runs:

1. The readiness check from J2
2. A LICENSE coverage check that confirms `LICENSE-DEVPILOT` exists and references the same path list as the extraction script
3. The extraction dry-run from J3 (does the git filter-repo command succeed against the documented path list — without actually pushing anything)

Reports a single PASS/FAIL summary; wired into the deploy gate alongside `pnpm verify:rls`.

**Acceptance criteria covered**: AC#7

## Out of scope (v1.0)

- **Destructive cutover** — pointing prod traffic at the staging DO App, dropping DevPilot tables from OwnYourGig's Supabase project, removing the in-monorepo Edge Functions. All of this lives in a follow-up FR after the entrance criteria from J3 are met.
- **Refactoring OwnYourGig's frontend to consume DevPilot via API only.** Today the kanban UI fetches via direct Supabase client; making it pure-API is its own multi-week project.
- **Public publication of `ai-devpilot-staging` repo.** The repo is staged as a local artefact only. Pushing to a public GitHub org is part of the cutover.

## Edge cases & assumptions

- **Path list maintenance**: as new DevPilot Edge Functions land (e.g. FR-166), the path list in `docs/repo-split-plan.md` and the BSL coverage check in J6 must be kept in sync. The aggregate verifier catches drift.
- **BSL 1.1 path enumeration**: the path list in `LICENSE-DEVPILOT` is per-folder, not per-file. New files inside enumerated folders inherit the license. The list is `supabase/functions/{...}`, `apps/web/src/features/{roadmap,devpilot}/`, `specs/{162..167}-*`, `scripts/lib/constitution-merger.ts`, and a few helper modules.
- **filter-repo determinism**: `git filter-repo --paths-from-file` is deterministic given the same input. The smoke check confirms the resulting clone has the expected file count, but the script does NOT push to a remote — that's a manual operator step gated by the cutover plan.
- **Staging Supabase project cost**: a second Supabase project incurs free-tier-only usage during the staging window. Document the project IDs so they can be torn down if cutover is deferred indefinitely.
- **Readiness regression detection**: the J2 verifier catches a route losing its `withApiGateway` wrapper. It does NOT detect a NEW unwrapped DevPilot Edge Function — that's a manual review item during code review.

## Success criteria

- `LICENSE-DEVPILOT` exists, lists ≥10 DevPilot path globs, has BSL 1.1 + 4-year change date + Apache 2.0 fallback.
- `pnpm verify:devpilot-readiness` reports the baseline coverage (3/35 routes ≈ 8%) and exits 0.
- `docs/repo-split-plan.md` exists with all 4 documented sections.
- `scripts/extract-devpilot-repo.sh` runs locally, produces a sibling clone, smoke check passes.
- `-staging` Supabase project exists with 35/35 RLS-protected tables; URLs in repo-split-plan.md.
- `apps/web/src/lib/devpilot-sdk.ts` exports the three API surfaces, `pnpm tsc -b` clean.
- `pnpm verify:devpilot-split` exits 0 with a single PASS summary line.
