# Contract — `withApiGateway` Middleware

## Purpose

Wrap an existing Edge Function handler so external callers can authenticate via API key, with tenant context pinned for FR-162 RLS, rate limiting reused from FR-063, and audit logging to `api_audit_log`.

## Signature

```ts
// supabase/functions/_shared/api-gateway.ts
export type GatewayHandler = (req: Request, ctx: GatewayContext) => Promise<Response>;

export interface GatewayContext {
  tenantId: string;
  apiKeyId: string;
  requestId: string;
  /** Supabase client with the minted session JWT applied — wrapped handlers use this for any user-scoped queries. */
  supabase: SupabaseClient;
}

export function withApiGateway(handler: GatewayHandler): (req: Request) => Promise<Response>;
```

## Flow per request

1. **Detect auth surface**. If `Authorization: Bearer` is missing, return `401 INVALID_API_KEY`. (No info leak: same response for "no header", "wrong scheme", "unknown key", "revoked key", "expired key".)
2. **Hash + look up**. Compute `sha256(rawKey)`. SELECT `id, tenant_id, rate_limit_per_minute, revoked_at, expires_at` from `api_keys` where `key_hash = $1`. If 0 rows OR `revoked_at IS NOT NULL` OR `expires_at < now()`, return `401 INVALID_API_KEY`.
3. **Rate limit check**. Call `checkRateLimit(api_key_id, rate_limit_per_minute)` (FR-063 helper). On exhaustion, return `429 RATE_LIMITED` with `Retry-After: <seconds>` header AND audit row.
4. **Mint session JWT**. Build a JWT with claims `{ role: "authenticated", sub: "<api_key_id>", tenant_id: "<tenant_id>", exp: <now + 60s> }`, signed with `SUPABASE_JWT_SECRET`. If the secret is missing, return `503 GATEWAY_NOT_CONFIGURED`.
5. **Build context**. Create a Supabase client using the minted JWT as the auth token. This client's queries hit PostgREST with `auth.jwt() -> 'tenant_id' = X` available; FR-162 RLS isolation applies.
6. **Invoke handler**. `await handler(req, { tenantId, apiKeyId, requestId, supabase })`. Catch any exception.
7. **Audit + last_used_at**. After the handler returns (or throws):
   - Fire-and-forget `INSERT INTO api_audit_log (...)` with status_code, duration_ms, error_code (if any), request_id.
   - Fire-and-forget `UPDATE api_keys SET last_used_at = now() WHERE id = $1`.
8. **Return**. Pass the handler's `Response` through to the caller. On exception, return `500 INTERNAL_ERROR` with the captured error code in the audit row but a generic message in the response body.

## Detect-and-route: API key vs user JWT

Existing Edge Functions (e.g., `pipeline-status`) accept user JWTs from the OwnYourGig kanban. Wrapping them with `withApiGateway` must NOT break that path.

The wrapped function structure:

```ts
Deno.serve(async (req) => {
  const auth = req.headers.get('Authorization') ?? '';
  if (auth.startsWith('Bearer ') && isApiKey(auth.substring(7))) {
    return withApiGateway(handler)(req);
  }
  // Existing user-JWT path (unchanged).
  return handler(req /* legacy context */);
});
```

`isApiKey(raw)` is a simple heuristic check: does the string match the `dp_*` prefix shape we use for keys? If yes → gateway. If no (looks like a JWT, three dot-separated base64 segments) → legacy path.

## Response shapes

### Success (`status_code: 2xx`)

The wrapped handler's response is returned verbatim. Headers added by the middleware:

- `X-Request-Id: <uuid>`
- `X-Tenant-Id: <tenant_id>` (only on success — gives the caller a check that they hit the right tenant)

### `401 INVALID_API_KEY`

```json
{ "error": { "code": "INVALID_API_KEY", "message": "API key is invalid, revoked, or expired" } }
```

No detail about which case applied. No `X-Request-Id` header (no audit row written? actually we DO write an audit row with `api_key_id = NULL` — wait, that violates the FK). Audit row is only written when an actual key was matched but failed downstream (rate limit, etc.).

### `429 RATE_LIMITED`

```json
{
  "error": {
    "code": "RATE_LIMITED",
    "message": "Quota exceeded. Try again in <N> seconds.",
    "retry_after_seconds": 30
  }
}
```

Headers: `Retry-After: 30`. Audit row written.

### `500 INTERNAL_ERROR` (handler exception)

```json
{
  "error": {
    "code": "INTERNAL_ERROR",
    "message": "An internal error occurred. Reference: <request_id>"
  }
}
```

Audit row written with `error_code = "<exception class name>"`. The exception message is NOT in the user response (might leak internals).

### `503 GATEWAY_NOT_CONFIGURED`

```json
{
  "error": {
    "code": "GATEWAY_NOT_CONFIGURED",
    "message": "API gateway is missing required configuration. Contact support."
  }
}
```

Returned only if `SUPABASE_JWT_SECRET` is unavailable in the Edge Function env. Should never happen in production; safety net.

## Failure modes

| Mode                                               | Behaviour                                                                                                                                                                                                  |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Audit insert fails                                 | Log to console, return user response normally. Audit gap is acceptable; user request must succeed.                                                                                                         |
| `last_used_at` update fails                        | Same — log, ignore, proceed.                                                                                                                                                                               |
| `SUPABASE_JWT_SECRET` missing                      | `503 GATEWAY_NOT_CONFIGURED`. Fail closed.                                                                                                                                                                 |
| Hash collision (two keys produce same sha256)      | UNIQUE constraint on `key_hash` prevents at insert time. Mathematically negligible at 32-byte random keys.                                                                                                 |
| Concurrent rate-limit decrement race               | FR-063 helper handles this; treated the same way as it always has.                                                                                                                                         |
| Wrapped handler invokes the legacy supabase client | Audit row still written, but the queries in the handler bypass the minted JWT — RLS uses whatever path was current. The detect-and-route step above ensures only the gateway path enters `withApiGateway`. |

## Test coverage

Per quickstart.md scenarios J1.1, J1.2, J1.3, J3.1, J3.2, J3.3.
