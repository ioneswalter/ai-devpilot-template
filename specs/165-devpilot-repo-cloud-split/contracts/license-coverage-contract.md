# Contract — `LICENSE-DEVPILOT` ↔ `docs/repo-split-plan.md` consistency

## Path list as the single source of truth

`docs/repo-split-plan.md` contains a "Path list" section formatted as a markdown table with two columns:

```
| Path                                              | Why DevPilot                                |
| ------------------------------------------------- | ------------------------------------------- |
| `supabase/functions/_shared/api-gateway.ts`       | FR-163 gateway middleware                   |
| `supabase/functions/promote-memory-row/`          | FR-164 J3 admin promotion                   |
| ...                                               | ...                                         |
```

`LICENSE-DEVPILOT` references the same paths in its enumeration, e.g.:

```
The Licensed Work covers all files at the following paths within this repository:
  - supabase/functions/_shared/api-gateway.ts
  - supabase/functions/promote-memory-row/
  - ...
(see docs/repo-split-plan.md for the authoritative list and rationale)
```

`scripts/devpilot-split-paths.txt` is a **derived** plain-list version, regenerated from the markdown by the verifier. Never hand-edited.

## Verifier — `verify:license-coverage`

```
1. Parse docs/repo-split-plan.md → extract the path list from the table
2. Parse LICENSE-DEVPILOT → extract the path enumeration
3. Diff the two sets:
   - In docs but not LICENSE → fail (a DevPilot path is unlicensed)
   - In LICENSE but not docs → fail (license claims to govern a path that's not on the manifest)
4. Regenerate scripts/devpilot-split-paths.txt from the markdown table, fail if the on-disk version differs
5. Print "License coverage: N paths verified" on success
```

Failure mode is loud — the markdown is the master, both the LICENSE file and the path-list-text file must be derivable from it.

## Verifier — `verify:devpilot-readiness`

```
1. List all directories under supabase/functions/ that are on the DevPilot path list
2. For each, read index.ts; check whether the file imports withApiGateway from _shared/api-gateway.ts
3. wrapped = count of imports found; total = count of DevPilot Edge Function dirs
4. Read scripts/lib/devpilot-readiness-baseline.json — { wrapped, total, last_updated }
5. If current.wrapped < baseline.wrapped → exit non-zero with regression message
6. If current.wrapped > baseline.wrapped → print congratulations + suggest --update-baseline
7. Otherwise → exit 0 with "Readiness: X/Y (Z%) — baseline matched"
```

`--update-baseline` flag rewrites the baseline JSON. Manual gate during PR review when a new endpoint is intentionally wrapped.

## Verifier — `verify:extraction-dryrun`

```
1. Read the path list from docs/repo-split-plan.md
2. cd to a tmp dir; git clone --no-local file:///<repo> .
3. Run: git filter-repo --analyze --paths-from-file <path-list> --force --refs HEAD
4. Inspect the analysis report — confirms the paths match real files in history
5. Clean up tmp dir
6. Exit 0 if filter-repo's analyze step reports a non-zero file count for every documented path
```

Does NOT push the resulting filtered history anywhere. Pure local dry-run.

## Aggregate — `pnpm verify:devpilot-split`

Runs the three sub-verifiers in order. Single PASS line on success; numbered FAIL list on failure. Wired into the deploy pre-commit gate alongside `verify:rls`.
