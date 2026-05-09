# Implementation Plan — FR-165

## Architecture summary

Pure tooling + infrastructure FR. **No schema changes.** Six phases, each landing standalone artefacts:

| Phase | What lands                                                                 | Files                                                                                                     |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| J1    | `LICENSE-DEVPILOT` (BSL 1.1, 4-year change date, Apache 2.0 fallback)      | `LICENSE-DEVPILOT`                                                                                        |
| J2    | Readiness verifier with baseline-regression detection                      | `scripts/devpilot-readiness.ts`, `scripts/lib/devpilot-readiness-baseline.json`                           |
| J3    | Cutover plan doc + git filter-repo extraction script                       | `docs/repo-split-plan.md`, `scripts/extract-devpilot-repo.sh`, derived `scripts/devpilot-split-paths.txt` |
| J4    | Staging DigitalOcean App + Supabase project provisioned (ops, no code)     | URLs documented in `docs/repo-split-plan.md`                                                              |
| J5    | `devpilot-sdk.ts` wrapper module with `VITE_DEVPILOT_BASE_URL` indirection | `apps/web/src/lib/devpilot-sdk.ts`                                                                        |
| J6    | Aggregate verifier `pnpm verify:devpilot-split` + package.json script      | `scripts/verify-devpilot-split.ts`, `package.json`                                                        |

## Constitution gates

- **TypeScript strict**: all new TS files (devpilot-readiness, devpilot-sdk, verify-devpilot-split) explicit-typed; no `any`. `pnpm tsc -b` clean.
- **File size**: every new file is well under 300 lines (devpilot-readiness ≤ 120, devpilot-sdk ≤ 80, verify-devpilot-split ≤ 150, extraction shell script ≤ 50, plan doc readable but multi-section markdown).
- **No new RLS-scoped tables**: nothing for `pnpm verify:rls` to react to. Verifier scope set stays at 35.
- **API-First**: contracts defined for the three sub-verifiers before implementation, in `contracts/license-coverage-contract.md`.

## Order rationale

- J1 first — legal protection independent of all other work; ships if the rest is delayed.
- J2 second — readiness gate informs all subsequent phases (do we have enough coverage for FR-165 v1.1 yet?).
- J3 third — depends on J2's path enumeration being stable.
- J4 fourth — operational, can run in parallel with J5 once J3's path list is final.
- J5 fifth — wrapper module is small; depends on existing API modules being stable (no FR-165 changes to them).
- J6 last — aggregate verifier requires J1, J2, J3 outputs to exist.

## Constitution-compliance approach

Every new TS file is greenfield-small; following the FR-164 pattern of explicit interfaces + small functions:

```typescript
interface ReadinessReport {
  wrapped: number;
  total: number;
  pct: number;
  baseline: { wrapped: number; total: number };
  status: 'pass' | 'regression';
  routes: Array<{ name: string; wrapped: boolean }>;
}
```

The shell extraction script is pure bash — no clever logic, just `git filter-repo` invocation with documented args.

## Risk register

| Risk                                                                           | Mitigation                                                                                                                      |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| BSL 1.1 path enumeration drifts from reality as new DevPilot files land        | `verify:license-coverage` sub-check fails the deploy gate when the LICENSE file and `repo-split-plan.md` diverge                |
| `git filter-repo` not installed locally                                        | Extraction script checks for the binary, prints install instructions if missing (`brew install git-filter-repo`)                |
| Staging Supabase project bills indefinitely if cutover stalls                  | Document the project IDs prominently in `repo-split-plan.md`; tear-down command included in the rollback section                |
| Readiness verifier baseline becomes stale if no PR updates it                  | Acceptable — regression-only mode means stale baseline only blocks if coverage _decreases_, never on stale-but-correct baseline |
| `devpilot-sdk.ts` introduces an import cycle when wrapped APIs use `apiClient` | Wrapper imports the API modules directly and overrides their base-URL at runtime, no circular ref                               |
| BSL 1.1 wording legally insufficient                                           | Use the verbatim BSL 1.1 template from mariadb.com/bsl11/; only fill in the parameters (Licensor, Change Date, Change License)  |

## Done definition

- All 6 phase artefacts created.
- `pnpm verify:devpilot-readiness` reports baseline (3/35 ≈ 8%) and exits 0.
- `pnpm verify:devpilot-split` reports a single PASS line and exits 0.
- Staging Supabase project has 35/35 RLS-protected tables (verified by running `pnpm verify:rls` against the staging connection string).
- `pnpm verify:feature FR-165 --stage build` exits 0.
- Constitution compliance check exit 0 on all new files.

## Out of scope (re-iterated)

- Refactoring existing kanban call sites to import from `devpilot-sdk.ts` (this is a v1.1+ migration).
- Pushing the `ai-devpilot-staging` clone to a public GitHub org.
- Pointing prod DNS at the staging DigitalOcean App.
- Dropping DevPilot tables from the OwnYourGig Supabase project.
