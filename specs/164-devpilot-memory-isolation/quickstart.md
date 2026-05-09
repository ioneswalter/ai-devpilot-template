# Quickstart — FR-164 Manual Verification Scenarios

These are manual smokes the operator runs after each phase ships. Automation lives in `\generate-tests` later.

## Phase J1 — `ai_learnings` and `ideation_conversations` get `tenant_id`

### J1.1 — Backfill is correct

```bash
source .env.local && PGPASSWORD="$DB_PASSWORD" psql -h aws-0-ap-southeast-2.pooler.supabase.com -U postgres.cydgbvvvtwymilhjroqj -p 6543 -d postgres -c "
  SELECT 'ai_learnings' AS t, COUNT(*) FILTER (WHERE tenant_id IS NULL) AS null_count, COUNT(*) AS total FROM public.ai_learnings
  UNION ALL
  SELECT 'ideation_conversations', COUNT(*) FILTER (WHERE tenant_id IS NULL), COUNT(*) FROM public.ideation_conversations;
"
```

Expected: both rows show `null_count = 0`.

### J1.2 — `verify:rls` advances to 35/35

```bash
pnpm verify:rls
```

Expected: stdout reports `35/35 protected` (was `33/33` after FR-167).

### J1.3 — Existing writers still work

`learning-logger.ts` is called by 6+ Edge Functions. Trigger any one (e.g., complete an ideation conversation that fires a learning insert) and confirm:

```sql
SELECT id, tenant_id, learning_type, title FROM ai_learnings ORDER BY created_at DESC LIMIT 1;
```

Expected: a row exists with `tenant_id` set to the OwnYourGig tenant (no JWT in Edge Function context → DEFAULT path applies).

## Phase J2 — Visibility tier with union RLS

### J2.1 — Two-tenant private isolation

```sql
-- as service role
INSERT INTO tenants (slug, name) VALUES ('quickstart-acme', 'Quickstart Acme');
INSERT INTO tenants (slug, name) VALUES ('quickstart-beta', 'Quickstart Beta');

-- get the new tenant ids
SELECT id, slug FROM tenants WHERE slug LIKE 'quickstart-%';

-- insert one private row in each tenant via service role (bypasses RLS)
INSERT INTO prompt_templates (slug, name, description, system_prompt, user_prompt_template, tenant_id, visibility)
VALUES ('qs-acme-prompt', 'ACME-only', 'private to ACME', 'system', 'user', '<acme-uuid>', 'private');
INSERT INTO prompt_templates (slug, name, description, system_prompt, user_prompt_template, tenant_id, visibility)
VALUES ('qs-beta-prompt', 'BETA-only', 'private to BETA', 'system', 'user', '<beta-uuid>', 'private');

-- query as ACME (using a JWT minted with tenant_id=acme):
SET request.jwt.claim.tenant_id = '<acme-uuid>';
SELECT slug FROM prompt_templates WHERE slug LIKE 'qs-%';
```

Expected: only `qs-acme-prompt` returned. Beta's private row must NOT appear.

### J2.2 — Shared rows visible to both tenants

```sql
UPDATE prompt_templates SET visibility = 'shared' WHERE slug = 'qs-beta-prompt';

-- as ACME again
SELECT slug FROM prompt_templates WHERE slug LIKE 'qs-%';
```

Expected: now BOTH `qs-acme-prompt` AND `qs-beta-prompt` returned (Beta's row is shared).

## Phase J3 — Promotion workflow

### J3.1 — Admin can promote, audit row written

```bash
source .env.local
curl -sS -X POST -H "Authorization: Bearer $ADMIN_JWT" -H "Content-Type: application/json" \
  -d '{"source_table":"prompt_templates","source_id":"<acme-uuid>"}' \
  "$VITE_SUPABASE_URL/functions/v1/promote-memory-row" | jq
```

Expected: `200 OK`, response includes `audit_id`, `anonymisation_diff` array with at least one entry where `replacements > 0`. Source row is now `visibility='shared'`.

### J3.2 — Idempotency on already-shared row

Re-run J3.1. Expected: `200 OK` with `already_shared: true`, `audit_id: null`, no new audit row in `memory_promotion_audit`.

### J3.3 — Non-admin user gets 403

```bash
curl -sS -X POST -H "Authorization: Bearer $NON_ADMIN_JWT" -d '{"source_table":"prompt_templates","source_id":"<some-uuid>"}' \
  "$VITE_SUPABASE_URL/functions/v1/promote-memory-row"
```

Expected: `403 FORBIDDEN`, `error.code = 'FORBIDDEN'`.

### J3.4 — Cross-tenant promotion attempt blocked

```bash
# ACME admin tries to promote BETA's row
curl -sS -X POST -H "Authorization: Bearer $ACME_ADMIN_JWT" -d '{"source_table":"prompt_templates","source_id":"<beta-uuid>"}' \
  "$VITE_SUPABASE_URL/functions/v1/promote-memory-row"
```

Expected: `403 TENANT_MISMATCH` or `404 SOURCE_NOT_FOUND` (depending on whether ACME can see BETA's row under RLS — both are correct outcomes, both block the promotion).

## Phase J4 — Constitution overrides

### J4.1 — Tenant override layered at codegen

Insert a tenant override:

```sql
INSERT INTO tenant_constitution_overrides (tenant_id, principle_key, override_text, created_by)
VALUES ('<acme-uuid>', 'file-size-limits', 'Files must be under 200 lines (stricter than the shared 300).', '<acme-admin-uuid>');
```

Trigger a `\spec` or `\build` run for an FR owned by ACME tenant. Expected: the constitution check uses the 200-line limit, not 300.

### J4.2 — Non-negotiable principle cannot be weakened

Try to override `typescript-strict` (NON-NEGOTIABLE) with a weaker rule:

```sql
INSERT INTO tenant_constitution_overrides (tenant_id, principle_key, override_text, non_negotiable_strengthen_only, created_by)
VALUES ('<acme-uuid>', 'typescript-strict', 'TypeScript loose mode allowed for prototypes.', true, '<acme-admin-uuid>');
```

Expected: insert succeeds, but at codegen time the merger logs a warning and IGNORES the override (because `typescript-strict` is flagged NON-NEGOTIABLE in the source markdown and the override has `non_negotiable_strengthen_only=true`). The shared rule still applies.
