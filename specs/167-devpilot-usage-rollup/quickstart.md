# Quickstart — FR-167 Manual Verification

## J1 — `ai_usage_logs.tenant_id` migration

### J1.1 — Migration applied; existing rows backfilled

```sql
SELECT count(*) FROM ai_usage_logs WHERE tenant_id IS NULL;
-- Expect: 0

SELECT is_nullable FROM information_schema.columns
WHERE table_name = 'ai_usage_logs' AND column_name = 'tenant_id';
-- Expect: 'NO'

SELECT EXISTS (
  SELECT 1 FROM pg_indexes WHERE tablename = 'ai_usage_logs' AND indexdef ILIKE '%tenant_id%'
);
-- Expect: t
```

### J1.2 — `pnpm verify:rls` reports 32/32

```bash
pnpm verify:rls
# Expect: TC-FR162-J4-01 reports "Scoped tables: 32" and "All 32 tables protected"
```

### J1.3 — Existing writers continue working without code change

Pick any Edge Function that writes to `ai_usage_logs` (e.g., `devpilot-chat` via the chat panel). Trigger a write — confirm no error. Query the new row:

```sql
SELECT id, tenant_id, input_tokens, output_tokens FROM ai_usage_logs ORDER BY created_at DESC LIMIT 1;
-- Expect: tenant_id is OwnYourGig's id (from DEFAULT)
```

## J2 — `usage_rollups` + `compute_usage_rollup`

### J2.1 — Synthetic-tenant rollup math

```sql
-- Setup: synthetic tenant + 3 fixture ai_usage_logs rows totalling $1.234 raw cost
INSERT INTO tenants (id, code, name) VALUES
  ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'syn-test-167', 'Synthetic FR-167 Tenant')
ON CONFLICT (id) DO NOTHING;

-- Fixture rows: all in current month
INSERT INTO ai_usage_logs (id, feature_id, admin_id, model_id, operation_type, input_tokens, output_tokens, total_cost, status, tenant_id, created_at)
VALUES
  ('fixture-1', 'feat-X', 'admin-X', (SELECT id FROM ai_models LIMIT 1), 'spec_review',  10000, 5000, 0.500, 'success', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', now()),
  ('fixture-2', 'feat-X', 'admin-X', (SELECT id FROM ai_models LIMIT 1), 'implementation', 8000, 4000, 0.400, 'success', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', now()),
  ('fixture-3', 'feat-X', 'admin-X', (SELECT id FROM ai_models LIMIT 1), 'test_generation', 5000, 2500, 0.334, 'success', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', now());

-- Run the RPC
SELECT compute_usage_rollup(
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  date_trunc('month', now())::date
);

-- Inspect the rollup
SELECT period_start, ai_raw_cost, ai_billable_cost, ai_input_tokens, ai_output_tokens
FROM usage_rollups
WHERE tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
-- Expect: ai_raw_cost = 1.234, ai_billable_cost = 2.47 (ceil(1.234 × 200) / 100 = 247 / 100)
--         ai_input_tokens = 23000, ai_output_tokens = 11500
```

### J2.2 — Idempotent re-run

```sql
-- Run the RPC again — same row, same values
SELECT compute_usage_rollup(
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  date_trunc('month', now())::date
);
SELECT count(*) FROM usage_rollups
WHERE tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
-- Expect: count = 1 (no duplicate)
```

### J2.3 — Late-arriving fixture

```sql
-- Insert a 4th fixture row for the same period
INSERT INTO ai_usage_logs (id, feature_id, admin_id, model_id, operation_type, input_tokens, output_tokens, total_cost, status, tenant_id, created_at)
VALUES ('fixture-4', 'feat-X', 'admin-X', (SELECT id FROM ai_models LIMIT 1), 'code_review', 1000, 500, 0.066, 'success', 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', now());

-- Re-run RPC
SELECT compute_usage_rollup(
  'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'::uuid,
  date_trunc('month', now())::date
);

-- Same row, updated totals
SELECT ai_raw_cost, ai_billable_cost FROM usage_rollups
WHERE tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
-- Expect: ai_raw_cost = 1.300, ai_billable_cost = 2.60
```

### J2.4 — RLS isolation

```sql
-- As the synthetic tenant (set the JWT claim manually for the test)
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","tenant_id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}', true);
SELECT count(*) FROM usage_rollups;
-- Expect: 1 (only synthetic tenant's row)

-- As OwnYourGig user (no claim, COALESCE fallback)
RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', '{"role":"authenticated","sub":"<admin-uuid>"}', true);
SELECT count(*) FROM usage_rollups;
-- Expect: 0 or some — depends on whether OwnYourGig has a rollup; key fact: synthetic tenant's row is invisible.
```

## J3 — `GET /usage-rollup` Edge Function

### J3.1 — API-key path returns isolated rollup

```bash
# Issue an API key for the synthetic tenant via direct SQL or the admin endpoint
# (see FR-163 J1.1 quickstart for the helper script)

curl -s "$VITE_SUPABASE_URL/functions/v1/usage-rollup?period=current" \
  -H "Authorization: Bearer $SYN_RAW_KEY" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" | jq
# Expect:
#   data.ai_billable_cost = 2.60 (post-J2.3 4-row fixture)
#   data.tenant_id matches the synthetic tenant
#   X-Tenant-Id header in response equals tenant_id
#   data.projected_billable_cost > data.ai_billable_cost (mid-period extrapolation)
```

### J3.2 — Admin / service-role path with explicit tenant_id

```bash
curl -s "$VITE_SUPABASE_URL/functions/v1/usage-rollup?period=current&tenant_id=aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "apikey: $VITE_SUPABASE_ANON_KEY" | jq
# Expect: same response as J3.1 (admin can read across tenants)
```

### J3.3 — Empty period (zero-usage tenant)

```sql
INSERT INTO tenants (id, code, name) VALUES
  ('bbbbbbbb-cccc-dddd-eeee-ffffffffffff', 'syn-empty-167', 'Empty FR-167 Tenant');
```

Issue an API key for `bbbb...`, call `/usage-rollup?period=current` — expect a rollup row with all zero values plus `projected_billable_cost = 0`.

### J3.4 — Projection extrapolation

For the synthetic tenant on day 9 of a 31-day month with `ai_billable_cost = 2.60`:

- `fraction_elapsed ≈ 9/31 ≈ 0.290`
- `projected_billable_cost = ceil(2.60 × 100 / 0.290) / 100 = ceil(896.55) / 100 = 8.97`

Confirm the response's `projected_billable_cost ≈ 8.97`.

## Cleanup

```sql
DELETE FROM api_audit_log WHERE tenant_id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
DELETE FROM api_keys WHERE tenant_id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
DELETE FROM usage_rollups WHERE tenant_id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
DELETE FROM ai_usage_logs WHERE tenant_id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
DELETE FROM tenants WHERE id IN ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee','bbbbbbbb-cccc-dddd-eeee-ffffffffffff');
```
