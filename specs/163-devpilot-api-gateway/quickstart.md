# Quickstart — FR-163 Manual Verification

Per-journey hand-verification scenarios.

## J1 — Gateway infrastructure end-to-end

### J1.1 — Issue a key, call the wrapped endpoint, verify isolation

1. Seed a synthetic test tenant + an API key via SQL (skip the admin UI for J1; that's J2):

   ```sql
   INSERT INTO tenants (id, code, name) VALUES
     ('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', 'syn-test-163', 'Synthetic FR-163 Tenant');

   -- Issue a raw key via Node helper (sha256 + prefix split):
   --   raw_key = 'dp_test_a1b2c3d4e5f6...32-byte-random...'
   --   key_hash = sha256(raw_key) hex
   --   key_prefix = first 8 chars of raw_key
   ```

   (See [scripts/issue-test-api-key.ts] for the helper, or run inline node.)

2. Call `pipeline-status` with the raw key:

   ```bash
   curl -s "$VITE_SUPABASE_URL/functions/v1/pipeline-status?feature_ids=..." \
     -H "Authorization: Bearer $RAW_KEY" \
     -H "apikey: $VITE_SUPABASE_ANON_KEY" | jq '.pipelines | length'
   ```

3. **Expect**: response is `{ "pipelines": [] }` because the synthetic tenant owns no features. (FR-162 RLS scopes the read to that tenant.)

4. Insert a fixture for the synthetic tenant:

   ```sql
   INSERT INTO product_features (id, feature_code, title, description, feature_type, priority, status, tenant_id)
   VALUES (gen_random_uuid(), 'FR-9999-API', 'API gateway smoke fixture', 'desc', 'functional_requirement', 'P3', 'proposed',
           'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
   ```

5. Re-call `pipeline-status` — **expect** the response now contains exactly 1 pipeline (the FR-9999-API fixture) and zero OwnYourGig features.

6. Cleanup: delete the fixture, the API key, the synthetic tenant.

### J1.2 — Revoked key returns 401

1. Mark the seeded key revoked:

   ```sql
   UPDATE api_keys SET revoked_at = now() WHERE id = '<key_id>';
   ```

2. Re-call `pipeline-status` with the same raw key.
3. **Expect**: `401 INVALID_API_KEY` and the response body's `error.message` is generic ("API key is invalid, revoked, or expired") — no leak about which case applied.

### J1.3 — Existing OwnYourGig user-JWT path unchanged

1. Open the kanban in the browser as the existing OwnYourGig admin.
2. **Expect**: the kanban renders identically (Test pill counts unchanged for FR-130/161/106/162; UAT modal opens; deploy gate runs).
3. Confirms the detect-and-route logic in the wrapped `pipeline-status` doesn't break the legacy path.

## J2 — Admin UI for API key lifecycle

### J2.1 — Issue a new API key from the admin UI

1. Navigate to Roadmap → Admin → API Keys panel.
2. Click "Issue New API Key".
3. Fill the modal: `tenant = OwnYourGig`, `name = "Quickstart smoke"`, `rate_limit_per_minute = 60`, `expires_at = null`.
4. Submit.
5. **Expect**: a modal opens displaying the raw key in a copy-to-clipboard `<input readonly>` with a clear "**This key value will not be shown again. Save it now.**" notice. Only an "I've saved it" button closes the modal (no X, no Esc).
6. Click the copy button — clipboard now contains the raw key.
7. Click "I've saved it" — modal closes; the key appears in the listing as `dp_<prefix>` with name "Quickstart smoke".
8. Refresh the page — the listing persists; the raw key is NOT in the response.

### J2.2 — Rotate

1. Click Rotate next to the J2.1 key.
2. Confirm the rotate dialog.
3. **Expect**: the issuance success modal reappears with a NEW raw key. The old key now shows `revoked_at` set in the listing.

### J2.3 — Revoke

1. Click Revoke next to any key.
2. Confirm.
3. **Expect**: `revoked_at` is set; the key remains in the listing as a tombstone (audit trail). Calling `pipeline-status` with the (formerly-valid) raw key now returns 401.

### J2.4 — List does not leak raw keys

1. Open browser DevTools → Network → reload the API Keys panel.
2. Inspect the `?action=api-keys&tenant_id=...` response.
3. **Expect**: no field named `raw_key`, `key_hash`, or `key_value` appears in the JSON. Only `key_prefix` is present.

## J3 — Rate limiting + audit logging

### J3.1 — Rate limit fires

1. Issue a synthetic key with `rate_limit_per_minute = 3`.
2. Call `pipeline-status` 4 times in under 60 seconds (bash loop).
3. **Expect**: calls 1–3 return 200; call 4 returns `429 RATE_LIMITED` with `Retry-After: <seconds>` header.
4. Wait for the window to reset (≤ 60 seconds).
5. Re-call — **expect** 200.

### J3.2 — Audit log captures every call

1. Query `api_audit_log` for the test tenant:

   ```sql
   SELECT endpoint, method, status_code, error_code, duration_ms
     FROM api_audit_log
    WHERE tenant_id = '<syn_tenant>'
    ORDER BY created_at;
   ```

2. **Expect**: 4 rows from J3.1 (3 with `status_code = 200, error_code = NULL`; 1 with `status_code = 429, error_code = 'RATE_LIMITED'`). Plus 1 row for the J3.1-step-5 success (status 200).

### J3.3 — Audit row written even on handler exception

1. Construct a request that the wrapped handler will reject internally (e.g., malformed `feature_ids` query param).
2. Call `pipeline-status` with the synthetic key + the bad params.
3. **Expect**: the response is whatever the handler returned (probably 400 or 500). `api_audit_log` contains a row for this call with `status_code` matching and `error_code` set if the handler raised an exception.

## Cleanup (after all journeys)

```sql
DELETE FROM api_audit_log WHERE tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
DELETE FROM api_keys WHERE tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
DELETE FROM product_features WHERE tenant_id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
DELETE FROM tenants WHERE id = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
```
