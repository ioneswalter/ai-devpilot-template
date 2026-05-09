# Research — FR-164 Cross-Tenant Memory Isolation

## Decision 1 — Why patch `ai_learnings` and `ideation_conversations` rather than rebuild

Both tables exist with live data (`ai_learnings` is written every codegen cycle by `learning-logger.ts`; `ideation_conversations` has 36 rows from the BP using ideation). Rebuilding under new names would orphan the existing references in `prompt-library.ts`, `learning-logger.ts`, and the ideation Edge Functions. The FR-162 v1.1 pattern (add `tenant_id` with the JWT-aware `DEFAULT` so existing INSERT writers keep working unchanged) was proven on 31 tables and is the safest path here.

## Decision 2 — Visibility column on which tables?

Decision: **only `prompt_templates` and `ai_learnings`**. Not `ideation_conversations`.

A conversation is a per-tenant artefact by definition — anonymising and promoting an entire chat thread is risky (turns may name the tenant, the user, real product names) and the value is low (a learning extracted from the conversation IS the durable form). Conversations stay tenant-private always; the things that get promoted are the learnings/prompts derived from them.

## Decision 3 — Union RLS pattern

Two patterns considered:

**A. Two policies, one for private, one for shared:**

```sql
CREATE POLICY private_isolation ON x FOR SELECT USING (visibility='private' AND tenant_id = ...);
CREATE POLICY shared_visible    ON x FOR SELECT USING (visibility='shared');
```

Postgres OR-combines policies for the same role+command, so this works. But it doubles the policy count and FR-162's 18-policy permissive-policy purge made us cautious about policy multiplication.

**B. One policy with OR in the predicate:**

```sql
CREATE POLICY tenant_visibility ON x USING (
  visibility='shared' OR tenant_id = COALESCE(...)
);
```

Decision: **B**. Single policy, simpler reasoning, the `verify-rls-status.ts` scope-set verifier already counts policy presence per-table (not per-policy), so neither pattern affects the verifier output.

WITH CHECK clause uses just `tenant_id = COALESCE(...)` — INSERT/UPDATE always writes to the caller's tenant; promoting to `shared` doesn't change `tenant_id`, only `visibility`.

## Decision 4 — Promotion as UPDATE, not COPY

Promoting could either (a) copy the row to a new shared row (different UUID) or (b) flip the existing row's visibility in place. Both pros/cons:

**Copy:**

- Pros: source row preserved verbatim if anonymisation is bad later.
- Cons: existing references (e.g., `prompt_ratings.template_id`) point to the source private row, not the shared copy. UI / metrics fragmentation.

**In-place flip:**

- Pros: single row, all references survive, simpler.
- Cons: source tenant's row is now `visibility='shared'` so the source tenant's `created_by` value loses meaning. Mitigated by nulling `created_by` during anonymisation — the row becomes "DevPilot shared", not "Acme's prompt".

Decision: **in-place flip**. The audit trail captures the diff — if a promotion was wrong, an admin can roll it back by SETting `visibility='private'` on the target row (audit row stays as historical record).

## Decision 5 — Constitution overrides as a layered map, not a forked file

Three options for tenant-scoped constitutions:

1. Copy `constitution.md` per tenant into the DB. Heavy: reproduces ~500 lines per tenant, drift over time.
2. A single `tenant_constitution_overrides` table keyed on `(tenant_id, principle_key)`. Lightweight; only delta is stored.
3. A whole-file override (`tenant_constitution.md` per tenant). Same drift problem as #1, with no machine-readable diff.

Decision: **option 2**. `principle_key` is the slug that already exists in `constitution.md` headings (`typescript-strict`, `file-size-limits`, etc.). At codegen time the merger reads the shared file, parses it into `Map<key, text>`, then overlays the tenant's overrides. NON-NEGOTIABLE principles are flagged in the source markdown and the merger refuses to weaken them — only additive strengthening is allowed.

## Decision 6 — Anonymisation algorithm scope

For v1.0 this is intentionally simple:

1. Look up the source tenant's `slug` and `name` from `tenants`.
2. For each text column in the row (`context`, `user_prompt_template`, `system_prompt` if present, `description`), do a case-insensitive single-pass `String.replaceAll(slug, '{{tenant}}')` + `replaceAll(name, '{{tenant}}')`.
3. Null `created_by`.
4. Record the diff in `anonymisation_diff` JSON: `{column: string, before_excerpt: string, after_excerpt: string, replacements: number}[]`.

What this does NOT catch: paraphrased identifiers ("the gig platform" instead of "OwnYourGig"), product feature names, internal terminology. v1.0 ships with a flag in the audit row called `requires_human_review: true` whenever any text column had >2 replacements OR the `context` column is non-empty after replacement — operators are expected to scan these before treating them as durable shared learnings.

## Decision 7 — Edge Function path naming

`POST /promote-memory-row` (singular). The body looks like:

```json
{ "source_table": "prompt_templates", "source_id": "<uuid>" }
```

Returns the audit row UUID and the post-anonymisation values. Detect-and-route follows the same pattern as `usage-rollup`: API-key callers route through `withApiGateway`, JWT callers go through service-role admin path with caller `auth.uid()` enforcement.

## Decision 8 — Why NOT a UI in v1.0

Per the DevPilot split plan, FR-164 is a foundation feature. A "Memory" UI page (browse private + shared learnings, click "Promote" on a row) would be its own FR (let's call it FR-169 if/when needed). Holding it out of scope keeps FR-164 small enough to ship in one pass, and the API contract is stable enough that UI can land later without churn.
