# Research — FR-165 Repo + Cloud Split (BSL 1.1)

## Decision 1 — BSL 1.1 vs other source-available licenses

Considered:

- **BSL 1.1** (MariaDB Corp's standard): source-available, time-bombed change to a permissive license (Apache 2.0) after a fixed period (2-4 years), restricts hosted commercial use during the change-date window.
- **SSPL** (MongoDB's): blocks any hosted commercial use indefinitely; aggressive but harder for fork-friendly developers to accept.
- **Elastic License v2**: also restrictive but less battle-tested in court vs BSL.
- **Apache 2.0**: too permissive — a competitor could fork and host without restriction.

**Decision: BSL 1.1**, 4-year change date, Apache 2.0 fallback. Standard among modern productised open-core companies (Sentry, Materialize, CockroachDB). Patent strategy aligns: the patent itself protects the inventive surface; BSL closes the "host the same code as a service" gap during the patent's pending period.

## Decision 2 — License the subtree, not the whole repo

OwnYourGig the application is its own project with its own (unstated, but presumably proprietary) license. Forcing the whole repo to BSL 1.1 would re-license code that isn't DevPilot. Cleaner to:

1. Keep root `LICENSE` unchanged (governs OwnYourGig-the-application).
2. Add `LICENSE-DEVPILOT` at root that explicitly enumerates the DevPilot-owned paths and applies BSL 1.1 to those paths only.

This pattern is uncommon but legally clean: courts read the most specific applicable license. Future readers see both files at root level and can tell which governs which code by reading the path enumeration in `LICENSE-DEVPILOT`. When the actual repo split happens (post-cutover), `LICENSE-DEVPILOT` becomes the new repo's `LICENSE` (whole-repo), and the OwnYourGig clone retains the original root `LICENSE`.

## Decision 3 — Why apply BSL now, not after the repo split

A naive timeline would be: apply BSL only when the repo splits. Risk: between now and cutover (months, possibly a year+), anyone who clones, forks, or copies the DevPilot subtree does so under whatever the current root LICENSE permits. Even if root LICENSE is "all rights reserved", default copyright + DMCA is weaker than an affirmative source-available license that explicitly says "you may NOT host this commercially."

BSL 1.1 _applied to a subtree of a private repo_ still has effect: people who get access (employees, contractors, future collaborators, M&A diligence) bind to those terms once the file lands. Future contributors' commits to DevPilot paths inherit the license. This is the "lock the door now, not after the move" play.

## Decision 4 — Readiness gate as regression-only, not absolute

A coverage threshold like "≥80% before this verifier passes" sounds correct but breaks the development cycle. Today coverage is ~8%; the verifier would block every push for months. Better: the verifier exits 0 unless coverage **decreased** vs. the most recent successful run.

Implementation: store the coverage baseline in `scripts/lib/devpilot-readiness-baseline.json`. The script reads the current coverage, compares to baseline, fails only if current < baseline. Update baseline by running with `--update-baseline` flag (manual gate during PR review).

The 80% threshold from `docs/repo-split-plan.md` is the **cutover** threshold, checked manually before initiating FR-165 v1.1, not part of CI.

## Decision 5 — Why staging environments without DNS

Provisioning a `-staging` DigitalOcean App + Supabase project costs a few minutes and a few dollars/month at most. Doing it now (vs. at cutover time) means:

- Migrations have been replay-tested against a _real_ fresh database before the cutover-day pressure.
- FR-166 patent-claim-5 work has a real isolated environment to develop against.
- If cutover entrance criteria stay unmet for a year, the staging exists; either it gets used or torn down. The cost of having it idle is bounded.

DNS pointing is the load-bearing decision that turns staging into prod. Keeping DNS unchanged means zero customer impact even if staging goes down.

## Decision 6 — SDK indirection design

Three options:

**A. Drop-in alias.** Re-export `productApi` from a new module. Switching is just `import { productApi } from '@/lib/devpilot-sdk'` instead of `from '@/lib/api/product-api'`. Requires touching every call site.

**B. Conditional base-URL inside the existing apiClient.** Add an env-var check inside `apps/web/src/lib/api/api-client.ts` so all DevPilot-namespaced endpoints route through a different base. Zero call-site churn, but mixes concerns inside an existing module.

**C. Wrapper module that re-exports + injects base URL.** `devpilot-sdk.ts` imports the existing API modules, wraps each call to inject `VITE_DEVPILOT_BASE_URL` as the request prefix when set. Backwards-compatible re-export — existing call sites that don't migrate keep working unchanged.

**Decision: C**, with pragmatic compromise. The wrapper module exists; existing call sites are NOT refactored to import from it (they keep their current imports). The wrapper is the on-ramp for cutover-time migration. v1.0 ships the file with full re-exports + documented usage; the actual migration of call sites is a v1.1 concern.

## Decision 7 — Scope of the path-list-of-truth

`docs/repo-split-plan.md`'s path list is the single source of truth referenced by:

- `LICENSE-DEVPILOT` (enumerates which paths the BSL governs)
- `scripts/extract-devpilot-repo.sh` (the `--paths-from-file` argument)
- `pnpm verify:devpilot-split` (consistency check across both)

Storing the list in markdown (not a `.json` or `.txt`) makes it human-readable for PR review and future contributors, and lets us annotate WHY each path is DevPilot vs. OwnYourGig. The verifier extracts the path list with a regex against the markdown's table format.

## Decision 8 — git filter-repo over git subtree split

`git subtree split --prefix=...` only handles a single subtree path. DevPilot lives across MANY paths (`supabase/functions/`, `apps/web/src/features/roadmap/`, `apps/web/src/features/devpilot/`, `specs/16*`, `scripts/lib/`, etc.). `git filter-repo --paths-from-file` accepts a list of include patterns and is the modern replacement for `git subtree` and `git filter-branch` for this use case. Faster (Rust-based), maintained, and recommended by GitHub.

The script doesn't push the resulting clone — that's a manual gate. The smoke check confirms the file set is correct, full stop.
