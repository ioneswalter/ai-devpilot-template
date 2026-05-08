# Quickstart — FR-162 Manual Verification

Per-journey hand-verification scenarios. Each maps 1:1 to an acceptance scenario in spec.md.

## J1 — Tenants table + scope-set columns

### J1.1 — Tenants table created and seeded

```sql
SELECT id, code, name, created_at FROM tenants;
-- Expect: 1 row, code='ownyourgig'

SELECT public.get_default_tenant_id();
-- Expect: same UUID as the tenants row above
```

### J1.2 — Every scoped table has tenant_id NOT NULL with FK and index

```sql
WITH scope AS (SELECT unnest(ARRAY['product_features','feature_versions','feature_spec_artifacts','spec_reviews','review_items','implementation_requests','implementation_task_items','pipeline_runs','pipeline_queue','pipeline_failures','pipeline_notifications','test_cases','test_runs','test_data_sets','test_failure_guidance','automated_test_scripts','api_verification_tests','uat_packages','uat_checklist_items','uat_review_decisions','uat_review_audit','uat_scenarios','bp_review_projections','feature_dependencies','feature_comments','feature_ratings','prompt_templates','prompt_categories','prompt_ratings']) AS t)
SELECT s.t,
       (SELECT is_nullable FROM information_schema.columns WHERE table_schema='public' AND table_name=s.t AND column_name='tenant_id') as nullable,
       EXISTS(SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename=s.t AND indexdef ILIKE '%tenant_id%') as has_index
FROM scope s
ORDER BY s.t;
-- Expect: every row has nullable='NO' and has_index=true
```

### J1.3 — Backfill complete (zero NULL counts)

Run [scripts/verify-fr162-backfill.ts] (or ad-hoc):

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { Client } = require('pg');
const c = new Client({ connectionString: process.env.DATABASE_URL });
const SCOPE = ['product_features','feature_versions',...]; // 28 names
(async () => {
  await c.connect();
  for (const t of SCOPE) {
    const r = await c.query('SELECT count(*) FROM ' + t + ' WHERE tenant_id IS NULL');
    console.log(t.padEnd(35), r.rows[0].count);
  }
  await c.end();
})();
"
# Expect: every row reports 0
```

## J2 — RLS isolation

### J2.1 — Authenticated user only sees their own tenant's rows

Create a synthetic second tenant for this test:

```sql
INSERT INTO tenants (code, name) VALUES ('test-isolation', 'Isolation Smoke') RETURNING id;
-- Use the returned UUID as <syn_id> below

INSERT INTO product_features (id, feature_code, title, status, tenant_id)
VALUES (gen_random_uuid(), 'FR-9999', 'Isolation smoke fixture', 'proposed', '<syn_id>');
```

Hit any user-authenticated Edge Function (e.g., `pipeline-status`) with the OwnYourGig admin's JWT:

```bash
curl -s "https://<project>.supabase.co/functions/v1/pipeline-status?feature_ids=..." \
  -H "Authorization: Bearer <admin_jwt>" \
  -H "apikey: $ANON_KEY" | jq '.pipelines | length'
```

- Expect: response includes OwnYourGig features but NOT FR-9999.
- Verify directly: `SELECT count(*) FROM product_features WHERE feature_code='FR-9999';` from a client carrying the admin JWT (via Supabase JS) returns 0; from service role returns 1.

### J2.2 — Cross-tenant write is rejected

From an OwnYourGig user JWT:

```sql
INSERT INTO product_features (id, feature_code, title, status, tenant_id)
VALUES (gen_random_uuid(), 'FR-9998', 'Cross-tenant write attempt', 'proposed', '<syn_id>');
-- Expect: error: new row for relation "product_features" violates row-level security policy
```

### J2.3 — Service role retains BYPASS

```bash
node -e "
require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');
const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
sb.from('product_features').select('feature_code').then(r => console.log('count:', r.data?.length));
"
# Expect: count includes BOTH OwnYourGig features AND FR-9999 (the synthetic one).
```

### Cleanup

```sql
DELETE FROM product_features WHERE feature_code IN ('FR-9998','FR-9999');
DELETE FROM tenants WHERE code = 'test-isolation';
```

## J3 — Edge Function tenant resolution

### J3.1 — Authenticated request sets tenant context

Pick any user-authenticated Edge Function. Invoke with a valid OwnYourGig user JWT.

- **Expect**: response is identical to today's behaviour (kanban renders, UAT modal opens, deploy gate runs).

To verify the helper actually fired, briefly add a `console.log('[FR-162] tenant context set:', tenantId)` in `_shared/tenant-resolution.ts` for one deploy cycle. Edge Function logs in Supabase Dashboard show the tenant id. Remove the log after verification.

### J3.2 — GitHub App webhook (FR-147) falls back to OwnYourGig

Trigger a synthetic PR against the linked GitHub repo (or replay a captured webhook payload). Watch the Edge Function logs for `github-app-webhook`.

- **Expect**: log line `[FR-162] tenant context set: <ownyourgig-uuid>` (after temp logging).
- **Expect**: a new `pipeline_runs` row inserted with `tenant_id` = OwnYourGig id.

### J3.3 — Authenticated request without tenant claim returns TENANT_REQUIRED (when fallback disabled)

For an Edge Function that flips `allowFallback: false` (none today during the foundation phase; this case becomes relevant for FR-163), invoking with a JWT that lacks the claim returns:

```json
{ "error": { "code": "TENANT_REQUIRED", "message": "Tenant context could not be resolved" } }
```

with status 401.

## J4 — Verifier + regression

### J4.1 — `pnpm verify:rls` reports 28 protected tables

```bash
pnpm verify:rls
# Expect: exit 0; report includes "DevPilot scope set: 28/28 tables protected"
```

### J4.2 — Verifier fails when RLS is dropped

```sql
ALTER TABLE test_cases DISABLE ROW LEVEL SECURITY; -- temporary
```

```bash
pnpm verify:rls
# Expect: exit non-zero; report names test_cases as unprotected
```

```sql
ALTER TABLE test_cases ENABLE ROW LEVEL SECURITY; -- restore
```

### J4.3 — Existing-feature regression suite

```bash
pnpm verify:feature FR-130 --stage test
pnpm verify:feature FR-161 --stage test
pnpm verify:feature FR-106 --stage test
# Expect: all three return exit 0
```

The kanban (live in browser) renders the same Test pill counts as before FR-162 shipped (40/40 for FR-130, 11/11 for FR-161, 2/2 for FR-106).
