# Feature Specification — FR-164 DevPilot Cross-Tenant Memory Isolation

**Feature Code**: FR-164
**Theme**: `devpilot-split`
**Priority**: P1
**Status**: reviewed → in spec
**Branch**: `001-coop-marketplace-platform`
**Depends on**: FR-162 (DevPilot Multi-Tenancy Foundation — released)
**Unblocks**: FR-168 (Self-Service Onboarding)

## Overview

DevPilot today carries institutional memory in three places that are tenant-naïve to varying degrees:

| Surface        | Today                                                       | Gap                                                                              |
| -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Prompt library | `prompt_templates` already has `tenant_id` from FR-162 v1.0 | No private/shared tier — every prompt is implicitly per-tenant                   |
| AI learnings   | `ai_learnings` table written by `learning-logger.ts`        | Missing `tenant_id` entirely — FR-162 missed it; no RLS                          |
| Conversations  | `ideation_conversations` (36 rows) drives the ideation chat | Missing `tenant_id` — FR-162 missed it; no RLS                                   |
| Constitution   | Static markdown at `.specify/memory/constitution.md`        | No way for a tenant to override an individual principle without forking the file |

Goal: split memory cleanly into a **tenant-private tier** (`visibility='private'` rows + tenant-scoped conversations) and a **shared tier** (`visibility='shared'` prompts/learnings + the unforked constitution + tenant-layered overrides), with a BP-attributable promotion workflow that anonymises a private row before lifting it to shared. Closes the cross-customer learning loop without leaking any tenant's private prompts or learnings to others.

## Phases

### Phase J1 (P1) — Close the FR-162 gaps

Add `tenant_id` (NOT NULL with the FR-162 v1.1 JWT-aware DEFAULT) and the COALESCE `tenant_isolation` policy to the two memory tables FR-162 missed: `ai_learnings` and `ideation_conversations`. Add `(tenant_id)` indexes. Extend `scripts/verify-rls-status.ts` `FR162_SCOPE_TABLES` from 33 to 35.

**Why this is the MVP**: until these two tables are tenant-scoped, the rest of FR-164 is theoretical. A second tenant created by FR-168 Self-Service Onboarding would immediately see another tenant's ideation conversations and AI learnings.

**Acceptance criteria covered**: AC#1, AC#7

### Phase J2 (P2) — Visibility tier

Add `visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','shared'))` to `prompt_templates` and `ai_learnings`. Replace their existing `tenant_isolation` RLS policy with a **union** policy:

```
USING (
  visibility = 'shared'
  OR tenant_id = COALESCE(NULLIF(auth.jwt() ->> 'tenant_id','')::uuid, get_default_tenant_id())
)
```

Tenant A inserts a private row → tenant B's `SELECT *` does not see it. Tenant A inserts a shared row → tenant B does see it. Verified by a two-tenant integration test.

**Acceptance criteria covered**: AC#2, AC#3

### Phase J3 (P3) — Promotion workflow

`memory_promotion_audit` table (append-only, service-role insert only, BP read of own tenant's rows) records every promotion. `POST /promote-memory-row` Edge Function:

1. Calling user must be `is_admin=true` on the source row's `tenant_id`.
2. Reads the source row from `source_table` ∈ {`prompt_templates`,`ai_learnings`}.
3. Anonymises: nulls `created_by`; replaces tenant-name tokens (the source tenant's `slug` and `name` from `tenants`) in textual columns (`context`, `user_prompt_template`, etc.) with the literal `{{tenant}}` placeholder.
4. Sets `visibility='shared'` (UPDATE; not a copy — same row, same UUID).
5. Inserts a `memory_promotion_audit` row with `anonymisation_diff jsonb` describing what changed.

No service-role-only path exists for AI DevPilot operators to bypass step 1 — every promotion must have a BP-attributable `promoted_by`.

**Acceptance criteria covered**: AC#4, AC#5

### Phase J4 (P4) — Tenant constitution overrides

`tenant_constitution_overrides` table (`tenant_id, principle_key, override_text, created_by, created_at`, UNIQUE on `(tenant_id, principle_key)`). The `\spec` and `\build` skills resolve the constitution at codegen time as: shared `.specify/memory/constitution.md` (parsed to `Map<principle_key, principle_text>`) → layer the calling tenant's overrides on top → run constitution checks against the merged map.

`principle_key` matches the principle slugs already used in `constitution.md` (e.g., `typescript-strict`, `file-size-limits`, `rls-required`).

**Acceptance criteria covered**: AC#6

## Out of scope

- Migrating the file-based auto-memory at `~/.claude/projects/.../memory/*.md` (per-developer, lives outside DevPilot's data plane).
- Promoting `ideation_conversations` to shared. Conversations stay tenant-private always — only `prompt_templates` and `ai_learnings` participate in the visibility tier.
- A UI for browsing or promoting memory. Promotion is API-only in v1.0; a UI lives in a future FR.

## Edge cases & assumptions

- **`ai_learnings` backfill**: existing rows have no `tenant_id`. Backfill to `get_default_tenant_id()` (the OwnYourGig tenant), same as the FR-162 backfill pattern.
- **`ideation_conversations` backfill**: same — backfill to the default tenant.
- **Promotion idempotency**: promoting an already-`shared` row is a no-op (no audit row written, returns 200 with `already_shared: true`).
- **Anonymisation false negatives**: token replacement is best-effort. Operators should review shared rows before relying on them. Anonymisation strategy is a single-pass string replace for the source tenant's slug and name; nested or paraphrased identifiers are not detected.
- **Constitution override conflict**: if a tenant tries to override a principle marked `NON-NEGOTIABLE` (e.g., TypeScript strict mode, RLS-on-all-tables), `\spec` and `\build` must still enforce the original — overrides cannot weaken non-negotiable principles. They can only add new ones or strengthen existing ones.

## Success criteria

- `pnpm verify:rls` advances 33/33 → 35/35 with no regressions.
- Two-tenant integration test: tenant A sees only its own private rows + shared rows on `prompt_templates`/`ai_learnings`. Asserted by `\quickstart.md`.
- Promoting a private learning works for an admin BP, fails for a non-admin user, fails when the source row belongs to a different tenant, and writes an audit row with a non-null `anonymisation_diff`.
- A tenant override for a non-negotiable principle is logged at codegen but does NOT replace the original; an override for a non-negotiable principle that strengthens it (additional rule) is layered.
