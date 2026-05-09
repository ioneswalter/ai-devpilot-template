# Implementation Plan — FR-164

## Architecture summary

Four sequential phases, each landing in one or two replay-safe migrations plus an optional Edge Function. Total estimate: 4 migrations + 1 Edge Function + 1 codegen merger update + 1 verifier extension.

| Phase | What lands                                                                              | Migration files                                             | Edge Function         |
| ----- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------------------- |
| J1    | `tenant_id` on `ai_learnings`, `ideation_conversations` + COALESCE RLS + verifier 33→35 | `20260510100000_fr164_j1_memory_tables_tenant_id.sql`       | —                     |
| J2    | `visibility` column on `prompt_templates`, `ai_learnings` + union RLS replacement       | `20260510101000_fr164_j2_visibility_union_rls.sql`          | —                     |
| J3    | `memory_promotion_audit` table + `promote-memory-row` Edge Function                     | `20260510102000_fr164_j3_memory_promotion_audit.sql`        | `promote-memory-row/` |
| J4    | `tenant_constitution_overrides` table + codegen merger update                           | `20260510103000_fr164_j4_tenant_constitution_overrides.sql` | —                     |

## Constitution gates

- **TypeScript strict**: Edge Function written in TS strict; types for the request body, response, and audit row are explicit (no `any`).
- **File size**: each migration is well under 300 lines (J1 ≤ 80, J2 ≤ 70, J3 ≤ 110 incl. audit table + RLS + grants, J4 ≤ 50). Edge Function is a single file estimated 180–220 lines (one route handler + helpers); will split if it exceeds 250.
- **RLS-on-all-tables**: J1 adds RLS to two tables that were missing it; J3 adds RLS to a new table with append-only semantics; J4 adds RLS to a new table with COALESCE pattern. Verifier scope set advances 33 → 35.
- **Migration replay safety**: every DDL statement is `IF NOT EXISTS` / `IF EXISTS` / `OR REPLACE` / `DROP POLICY IF EXISTS` before `CREATE POLICY`. NOT NULL escalations use a 3-step pattern (ADD COLUMN with DEFAULT → backfill → ALTER COLUMN SET NOT NULL gated by `EXISTS … WHERE … IS NULL`).

## Migration order rationale

- J1 must land before J2 because J2's union RLS policy on `ai_learnings` depends on the `tenant_id` column J1 adds.
- J3 depends on J2 because the promotion handler updates `visibility` (a J2-introduced column).
- J4 is independent — it could land first, but is sequenced last to keep the diff readable and let `\spec`/`\build` keep using the shared constitution unchanged until the merger update lands.

## Edge Function architecture

`supabase/functions/promote-memory-row/index.ts` (≈ 200 lines):

```
Deno.serve →
  detect bearer → if dp_*  → withApiGateway(handleGatewayPromotion)
                  else      → handleAdminJwtPromotion
  shared:
    1. parse + validate body
    2. SELECT source row (under caller's auth so RLS applies)
    3. enforce admin role on source tenant
    4. if visibility='shared' → return 200 already_shared
    5. anonymise text columns (helper)
    6. UPDATE source row → visibility='shared', null created_by
    7. INSERT memory_promotion_audit row (service role)
    8. return 200 with diff
```

The anonymisation helper is testable in isolation: `(row, tenantSlug, tenantName) => { newRow, diff[] }`. It lives in the same file unless it crosses 50 lines, in which case it moves to `_shared/anonymisation.ts` for reuse.

## Codegen merger update (J4)

The `\spec` and `\build` skills read `.specify/memory/constitution.md` today. The merger is a small TypeScript helper that:

1. Parses the markdown into `Map<string, { text: string, non_negotiable: boolean }>` keyed on heading slugs.
2. Calls Supabase to load `tenant_constitution_overrides` for the calling tenant.
3. For each override, looks up the principle in the parsed map:
   - If `non_negotiable=true` AND the override would weaken it → log warning, skip.
   - Else → replace `text` with the override text.
4. Returns the merged map.

The skills already have access to `SUPABASE_SERVICE_ROLE_KEY` via `.env.local` so no new auth plumbing is needed. This is a code change in `scripts/lib/constitution-merger.ts` (new file) plus a one-line wire-up in the relevant codegen entry points.

## Risk register

| Risk                                                                                             | Mitigation                                                                                                          |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| Existing 6+ Edge Functions writing to `ai_learnings` could break when NOT NULL `tenant_id` lands | DEFAULT is JWT-aware — falls back to `get_default_tenant_id()` when no JWT is in scope (FR-162 v1.1 pattern proven) |
| Anonymisation false negatives leak tenant identifiers into shared rows                           | `requires_human_review` flag + operator review process documented in research.md Decision 6                         |
| Promoting a row in-place loses the source tenant's attribution                                   | `created_by` is nulled deliberately; audit row preserves `source_tenant_id` and `promoted_by` for traceability      |
| Constitution override mistakenly weakens a non-negotiable principle                              | `non_negotiable_strengthen_only` flag (default true); merger refuses to apply weakening overrides                   |
| Two-tenant integration test in J2 verifier is brittle (depends on creating throwaway tenants)    | Use named test tenants prefixed `qs-` and clean up in same migration's COMMIT block; verifier idempotent on re-run  |

## Done definition

- All 4 migrations apply cleanly to a fresh DB.
- `pnpm verify:rls` reports 35/35 protected.
- Two-tenant private+shared isolation test passes (asserted by `verifyVisibilityUnion()`).
- `POST /promote-memory-row` deployed; J3.1–J3.4 quickstart smokes pass.
- A test tenant override on `file-size-limits` is correctly layered at codegen; a weakening override on `typescript-strict` is correctly ignored.
- `pnpm verify:feature FR-164 --stage build` exits 0.
