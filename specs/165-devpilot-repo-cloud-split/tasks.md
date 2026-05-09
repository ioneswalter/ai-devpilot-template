# Tasks — FR-165 DevPilot Repo + Cloud Split (BSL 1.1)

**Branch**: `001-coop-marketplace-platform`
**Total tasks**: 12 (J1: 1, J2: 2, J3: 3, J4: 2, J5: 2, J6: 1, verifier: 1)

## Phase J1 — BSL 1.1 license layer (Priority: P1)

- [x] T001 [J1] Create `LICENSE-DEVPILOT` at repo root with verbatim BSL 1.1 text (Licensor: Iones Walter, Change Date: 2030-05-10, Change License: Apache 2.0) and an enumeration of the DevPilot-owned paths derived from `docs/repo-split-plan.md` (next phase).

## Phase J2 — API readiness gate (Priority: P2)

- [x] T002 [J2] Create `scripts/devpilot-readiness.ts`: scans the DevPilot Edge Function dirs (under `supabase/functions/`), counts how many import `withApiGateway` from `_shared/api-gateway.ts`, compares to baseline JSON, exits non-zero on regression. Supports `--update-baseline` flag.
- [x] T003 [J2] Create `scripts/lib/devpilot-readiness-baseline.json` with the initial baseline (`{ wrapped: <actual>, total: <actual>, last_updated: ISO }`). Wire `pnpm verify:devpilot-readiness` script in `package.json`.

## Phase J3 — Cutover plan + extraction tooling (Priority: P3)

- [x] T004 [J3] Create `docs/repo-split-plan.md` with the four required sections: Path list (markdown table), Cutover entrance criteria, Out of scope for v1.0, Rollback procedure. Path list enumerates ALL DevPilot-owned files/dirs (≥20 entries) with rationale per entry.
- [x] T005 [J3] Create `scripts/extract-devpilot-repo.sh`: parses `docs/repo-split-plan.md` → derives `scripts/devpilot-split-paths.txt` → runs `git filter-repo --paths-from-file scripts/devpilot-split-paths.txt` against a fresh clone in `../ai-devpilot-staging/`. Includes binary check (`git filter-repo` installed) and usage docs.
- [x] T006 [J3] Update `LICENSE-DEVPILOT` from T001 to mirror the path enumeration in `docs/repo-split-plan.md` (cross-reference; this closes the loop with the verifier from J6).

## Phase J4 — Staging cloud environment (Priority: P4)

- [x] T007 [J4] Provision new DigitalOcean App with slug `ai-devpilot-staging` (region SYD1; no public DNS). App settings + ID documented in `docs/repo-split-plan.md`. [DOCS-ONLY SHIP — operator dashboard action required; see `docs/repo-split-plan.md` § "Manual provisioning steps for J4 (operator action) → J4.2"]
- [x] T008 [J4] Provision new Supabase project (slug `-staging`); replay all migrations end-to-end (`supabase db push --db-url <staging>`); confirm `pnpm verify:rls` reports 35/35 against staging. Project URL + anon key + service role key documented in `docs/repo-split-plan.md` (service role key elided in the docs; full value only in `.env.staging`). [DOCS-ONLY SHIP — operator dashboard action required; see `docs/repo-split-plan.md` § "Manual provisioning steps for J4 (operator action) → J4.1"]

## Phase J5 — SDK indirection (Priority: P5)

- [x] T009 [J5] Create `apps/web/src/lib/devpilot-sdk.ts`: re-exports `productApi`, `pipelineApi`, `featureApi`. Reads `VITE_DEVPILOT_BASE_URL` from `import.meta.env`; if set, overrides each API call's base URL via the existing `apiClient` interface.
- [x] T010 [J5] Add `VITE_DEVPILOT_BASE_URL` to `.env.example` with comment documenting its purpose. Backwards-compat default behaviour confirmed by running the kanban locally without setting the var.

## Phase J6 — Aggregate verifier (Priority: P6)

- [x] T011 [J6] Create `scripts/verify-devpilot-split.ts`: runs (1) `verify:devpilot-readiness` (regression check), (2) `verify:license-coverage` (LICENSE-DEVPILOT vs `docs/repo-split-plan.md` consistency), (3) `verify:extraction-dryrun` (`git filter-repo --analyze` against a tmp clone). Reports single PASS/FAIL summary; exit non-zero if any sub-check fails. Wire `pnpm verify:devpilot-split` in `package.json`.

## Verifier extension

- [x] T012 Run `pnpm verify:devpilot-split` end-to-end after all J1-J6 land. Run regression check `pnpm verify:feature FR-130/161/106/162/163/164/167 --stage test` — all exit 0.

## Verification gate (mandatory)

After all 12 tasks complete: `pnpm verify:feature FR-165 --stage build` returns exit 0. Constitution compliance report in [checklists/constitution-compliance.md](checklists/constitution-compliance.md).
