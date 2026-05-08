# Contract — Tenant Resolution in Edge Functions (J3)

## Purpose

Every authenticated Edge Function must resolve the calling tenant before any user-scoped query, so RLS policies (J2) actually apply. This contract defines the resolution order, the fallback path, and the RPC interface.

## Resolution order

1. **JWT custom claim**: if the Authorization header carries a JWT with a `tenant_id` claim (or `app_metadata.tenant_id`), use it.
2. **API key claim**: if the request carries an API key (FR-163 territory; documented here for forward-compat), look up the API key's `tenant_id` from a `api_keys` table that FR-163 will introduce.
3. **OwnYourGig fallback**: if neither claim is present (GitHub App webhook, anonymous public read, ops script), call `get_default_tenant_id()`.
4. **Reject**: if a tenant claim was expected but malformed (e.g., JWT present but no `tenant_id` claim and the route is not whitelisted for fallback), return 401 with `{ error: { code: 'TENANT_REQUIRED', message: 'Tenant context could not be resolved' } }`.

## RPC interface

```sql
public.set_tenant_context(tenant_id uuid) RETURNS void
```

Wraps `set_config('request.jwt.claim.tenant_id', tenant_id::text, true)` so Edge Functions can call it via the Supabase client without raw-SQL access.

## Edge Function helper

```ts
// supabase/functions/_shared/tenant-resolution.ts
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

export async function resolveAndSetTenant(
  supabase: SupabaseClient,
  req: Request,
  options?: { allowFallback?: boolean }
): Promise<{ tenantId: string } | Response> {
  const allowFallback = options?.allowFallback ?? true;

  // 1. JWT custom claim
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.substring(7);
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const claim = payload?.tenant_id || payload?.app_metadata?.tenant_id;
      if (claim) {
        await supabase.rpc('set_tenant_context', { tenant_id: claim });
        return { tenantId: claim };
      }
    } catch {
      /* malformed token — fall through */
    }
  }

  // 2. API key claim — TBD (FR-163)

  // 3. Fallback
  if (allowFallback) {
    const { data, error } = await supabase.rpc('get_default_tenant_id');
    if (!error && data) {
      await supabase.rpc('set_tenant_context', { tenant_id: data });
      return { tenantId: data as string };
    }
  }

  // 4. Reject
  return new Response(
    JSON.stringify({
      error: { code: 'TENANT_REQUIRED', message: 'Tenant context could not be resolved' },
    }),
    { status: 401, headers: { 'Content-Type': 'application/json' } }
  );
}
```

Every Edge Function imports `resolveAndSetTenant` and calls it once near the top of its handler:

```ts
const tenantResult = await resolveAndSetTenant(supabase, req);
if (tenantResult instanceof Response) return tenantResult;
const { tenantId } = tenantResult;
```

## Per-function fallback policy

| Function                                                                                           | `allowFallback`          | Reason                                                                                  |
| -------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------------------------------------------------------------------- |
| `pipeline-status`, `uat-get-review-context`, `roadmap-admin-features`, … (admin/UI Edge Functions) | true (during foundation) | OwnYourGig user JWT carries claim today; fallback covers anonymous readers if any exist |
| `github-app-webhook` (FR-147)                                                                      | true (during foundation) | Webhook has no JWT; HMAC signature is the auth surface                                  |
| `test-automation/execute-suite`                                                                    | true                     | Service-role-callable; no user context                                                  |
| `uat-submit-review`, `uat-submit-decision`                                                         | true                     | BP submits via UI; user JWT is present with claim                                       |

Once FR-163 (API Gateway + Customer Auth) ships, `allowFallback` defaults flip to `false` for endpoints serving customer traffic; admin/system endpoints retain `true`.

## Side effects

- `set_tenant_context` only affects the current transaction (`set_config(..., true)`). Concurrent requests do not cross-contaminate.
- Service role calls that go through the admin Supabase client (used by ops scripts, batch jobs, and the `roadmap-admin-features` deploy gate at `update-handler.ts:200`) bypass RLS regardless of whether `set_tenant_context` was called — Postgres' service role BYPASS is the dominant rule.

## Failure modes

| Mode                                 | Behaviour                                                                                                                                                                     |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Malformed JWT                        | Falls through to fallback (or 401 with `TENANT_REQUIRED` if fallback disabled)                                                                                                |
| `tenants` table missing              | `set_tenant_context` succeeds (it's a pure `set_config`), but downstream queries fail with FK violations on subsequent inserts. Migration ordering prevents this in practice. |
| `set_tenant_context` RPC unreachable | Edge Function returns 500 with the underlying RPC error                                                                                                                       |
| Concurrent requests                  | `set_config(..., true)` is transaction-scoped; no leakage                                                                                                                     |
