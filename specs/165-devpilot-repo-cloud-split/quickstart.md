# Quickstart — FR-165 Manual Verification Scenarios

## Phase J1 — BSL 1.1 license layer

### J1.1 — `LICENSE-DEVPILOT` exists and parses

```bash
test -f LICENSE-DEVPILOT && head -20 LICENSE-DEVPILOT
```

Expected: file exists; first 20 lines include "Business Source License 1.1", a 4-year change date, and "Licensor: Iones Walter".

### J1.2 — Path enumeration is complete

```bash
grep -c "^  - " LICENSE-DEVPILOT
```

Expected: ≥ 20 enumerated paths (matches the count in `docs/repo-split-plan.md` table).

### J1.3 — Existing root LICENSE unchanged

```bash
git diff HEAD~1 LICENSE
```

Expected: no changes (the root LICENSE governs OwnYourGig, untouched).

## Phase J2 — Readiness gate

### J2.1 — Baseline established

```bash
cat scripts/lib/devpilot-readiness-baseline.json
```

Expected:

```json
{ "wrapped": 3, "total": 35, "last_updated": "2026-05-10T..." }
```

(Or whatever the actual baseline numbers are at ship time.)

### J2.2 — Verifier reports baseline

```bash
pnpm verify:devpilot-readiness
```

Expected stdout: `Readiness: 3/35 (8.6%) — baseline matched. PASS.` exit 0.

### J2.3 — Regression detected

Manually delete a `withApiGateway` import from any wrapped Edge Function (e.g. `usage-rollup/index.ts`) and re-run:

```bash
pnpm verify:devpilot-readiness
```

Expected: `REGRESSION: 2/35 (5.7%) below baseline 3/35`. Exit non-zero. Restore the import after testing.

## Phase J3 — Repo extraction tooling + cutover plan doc

### J3.1 — Plan doc has all 4 sections

```bash
grep "^## " docs/repo-split-plan.md
```

Expected output includes all of:

```
## Path list
## Cutover entrance criteria
## Out of scope for v1.0
## Rollback procedure
```

### J3.2 — Extraction script smoke

```bash
./scripts/extract-devpilot-repo.sh ../ai-devpilot-staging
```

Expected: a sibling directory `../ai-devpilot-staging/` is created, contains `.git/` plus the documented DevPilot files. `cd ../ai-devpilot-staging && git log --oneline | wc -l` reports a non-zero count (history preserved).

### J3.3 — Smoke check — file presence

```bash
test -d ../ai-devpilot-staging/supabase/functions/promote-memory-row
test -f ../ai-devpilot-staging/specs/164-devpilot-memory-isolation/spec.md
test -f ../ai-devpilot-staging/scripts/lib/constitution-merger.ts
```

Expected: all three exit 0.

### J3.4 — Cleanup

```bash
rm -rf ../ai-devpilot-staging
```

(The staging clone is a one-shot dry-run artefact; not committed anywhere.)

## Phase J4 — Staging cloud environment

### J4.1 — Staging Supabase project ID is documented

```bash
grep "ai-devpilot-staging" docs/repo-split-plan.md
```

Expected: at least 2 hits (Supabase project URL + DigitalOcean App slug).

### J4.2 — Migrations replay on staging Supabase

Set `STAGING_DB_URL` in `.env.local` (the staging project's connection string), then:

```bash
PGPASSWORD="$STAGING_DB_PASSWORD" supabase db push --db-url "$STAGING_DB_URL"
```

Expected: all migrations apply cleanly (re-running is idempotent).

### J4.3 — `verify:rls` against staging

```bash
SUPABASE_URL="$STAGING_SUPABASE_URL" SUPABASE_SERVICE_ROLE_KEY="$STAGING_SERVICE_KEY" DATABASE_URL="$STAGING_DB_URL" pnpm verify:rls
```

Expected: 9/9 checks PASS, 35/35 tables protected.

## Phase J5 — SDK indirection

### J5.1 — `devpilot-sdk.ts` exports the three API surfaces

```bash
grep "^export " apps/web/src/lib/devpilot-sdk.ts
```

Expected: export lines for `productApi`, `pipelineApi`, `featureApi`.

### J5.2 — Default base URL behaves backwards-compat

In a fresh shell (no `VITE_DEVPILOT_BASE_URL` set), the dev server runs and the kanban loads identically to before — proving the wrapper is a no-op when env is unset.

### J5.3 — Override flips target

Set `VITE_DEVPILOT_BASE_URL=<staging-url>` in `.env.local`, restart `pnpm dev`. Confirm:

```bash
# In DevTools Network tab, requests to /functions/v1/product-features
# should now hit the staging hostname instead of qxlurzrjgflczvxgpcey.supabase.co
```

(Don't actually do this in v1.0 unless staging migrations are applied — staging will return empty results.)

## Phase J6 — Aggregate verifier

### J6.1 — Single PASS line

```bash
pnpm verify:devpilot-split
```

Expected: stdout ends with `PASS — DevPilot split readiness verified` and exit 0.

### J6.2 — Failure surfacing

Modify `LICENSE-DEVPILOT` to remove a path that's still in `docs/repo-split-plan.md`, re-run:

```bash
pnpm verify:devpilot-split
```

Expected: `FAIL — license-coverage: 1 path missing from LICENSE-DEVPILOT`. Restore after testing.
