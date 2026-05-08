# Data Model — FR-163 DevPilot API Gateway + Customer Auth

Two new tables: `api_keys` and `api_audit_log`. No changes to existing tables.

## `api_keys` (new)

```sql
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.get_default_tenant_id() REFERENCES public.tenants(id),
  key_hash text NOT NULL UNIQUE,
  key_prefix text NOT NULL,
  name text NOT NULL,
  scopes jsonb NOT NULL DEFAULT '[]'::jsonb,
  rate_limit_per_minute int NOT NULL DEFAULT 60,
  expires_at timestamptz NULL,
  revoked_at timestamptz NULL,
  last_used_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS api_keys_tenant_id_idx ON public.api_keys (tenant_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash_idx ON public.api_keys (key_hash);
CREATE INDEX IF NOT EXISTS api_keys_active_idx
  ON public.api_keys (tenant_id, revoked_at)
  WHERE revoked_at IS NULL;
```

### Field semantics

| Column                  | Notes                                                                                                                                  |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `id`                    | Used as the rate-limit identifier and the audit-log foreign key.                                                                       |
| `tenant_id`             | FR-162-style FK; default to OwnYourGig for ops scripts; admin issuance always passes the explicit tenant.                              |
| `key_hash`              | `sha256(raw_key)` hex string. UNIQUE across all tenants — prevents accidental collisions between issued keys.                          |
| `key_prefix`            | First 8 chars of the raw key (e.g., `dp_a1b2c3` from a `dp_a1b2c3d4e5f6...` raw value). Shown in admin UI for human identification.    |
| `name`                  | Human-readable label ("OwnYourGig prod kanban poller"). Set on issuance; preserved through Rotate.                                     |
| `scopes`                | JSONB array of endpoint scopes (e.g., `["pipeline:read", "uat:write"]`). Empty = full access for the tenant. v1.0 ships empty-default. |
| `rate_limit_per_minute` | Default 60; admin can override per-key for power users.                                                                                |
| `expires_at`            | Optional hard expiry. NULL = never expires.                                                                                            |
| `revoked_at`            | Set by Revoke or Rotate (rotate's old key). Once set, the key is immediately invalid; not recoverable.                                 |
| `last_used_at`          | Updated by `withApiGateway` on every successful auth. Useful for "find unused keys" queries.                                           |

### RLS policies

```sql
ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_keys_tenant_isolation ON public.api_keys
  FOR ALL TO authenticated
  USING (tenant_id = COALESCE(NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid, public.get_default_tenant_id()))
  WITH CHECK (tenant_id = COALESCE(NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid, public.get_default_tenant_id()));
```

Service role bypasses RLS — admin issuance via the service-role-authed Edge Function works.

## `api_audit_log` (new)

```sql
CREATE TABLE IF NOT EXISTS public.api_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.get_default_tenant_id() REFERENCES public.tenants(id),
  api_key_id uuid NOT NULL REFERENCES public.api_keys(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  method text NOT NULL,
  status_code int NOT NULL,
  duration_ms int NOT NULL,
  error_code text NULL,
  request_id uuid NOT NULL DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS api_audit_log_tenant_created_idx
  ON public.api_audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS api_audit_log_api_key_idx
  ON public.api_audit_log (api_key_id, created_at DESC);
```

### Field semantics

| Column        | Notes                                                                                                                                     |
| ------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `tenant_id`   | Denormalised from `api_keys.tenant_id` for query speed (per-tenant audit views are common). FR-162 RLS scoped.                            |
| `api_key_id`  | FK to `api_keys`. ON DELETE CASCADE so revoked-and-purged keys take their audit history with them (operator decision; revisit if needed). |
| `endpoint`    | Function name, e.g., `pipeline-status` (not the full URL — strip query string).                                                           |
| `method`      | HTTP verb.                                                                                                                                |
| `status_code` | Final response code seen by the caller. 401/429/500 all captured.                                                                         |
| `duration_ms` | End-to-end (gateway middleware in → response out).                                                                                        |
| `error_code`  | Application-level error code if the response was an error (e.g., `INVALID_API_KEY`, `RATE_LIMITED`, `TENANT_REQUIRED`). NULL on 2xx.      |
| `request_id`  | Per-request correlation id. Useful for tracing across logs.                                                                               |

### RLS policies

```sql
ALTER TABLE public.api_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY api_audit_log_tenant_isolation ON public.api_audit_log
  FOR ALL TO authenticated
  USING (tenant_id = COALESCE(NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid, public.get_default_tenant_id()))
  WITH CHECK (tenant_id = COALESCE(NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid, public.get_default_tenant_id()));
```

## FR-162 scope-set update

Both new tables are added to `FR162_SCOPE_TABLES` in `scripts/verify-rls-status.ts` so the verifier asserts RLS on them too. Total grows from 29 → 31.

## Migration files

- `supabase/migrations/<timestamp>_fr163_j1_api_keys_table.sql` — `api_keys` table + RLS + indexes.
- `supabase/migrations/<timestamp>_fr163_j3_api_audit_log_table.sql` — `api_audit_log` table + RLS + indexes.

(Two migrations, applied in order. J1 ships first as part of Journey 1; J3 ships with audit + rate limit work.)

## Read paths

- **Middleware key lookup**: `SELECT id, tenant_id, rate_limit_per_minute, revoked_at, expires_at FROM api_keys WHERE key_hash = $1`. Indexed on `key_hash`. Sub-ms latency.
- **Admin key listing**: `SELECT id, key_prefix, name, rate_limit_per_minute, expires_at, revoked_at, last_used_at, created_at FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`. Indexed on `tenant_id`.
- **Per-tenant audit query**: `SELECT * FROM api_audit_log WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 100`. Indexed on `(tenant_id, created_at DESC)`.

## Write paths

- **Issuance**: Edge Function generates 32-byte random raw key, computes `sha256(raw)` and `prefix = raw.slice(0, 8)`, inserts row. Returns raw to client ONCE.
- **Rotate**: in a single transaction — `UPDATE api_keys SET revoked_at = now() WHERE id = $1; INSERT INTO api_keys (...same name, same scopes, new hash...) RETURNING raw`. Modal shows the new raw value once.
- **Revoke**: `UPDATE api_keys SET revoked_at = now() WHERE id = $1`.
- **last_used_at update**: `UPDATE api_keys SET last_used_at = now() WHERE id = $1` after successful auth (fire-and-forget; not in the critical path).
- **Audit write**: `INSERT INTO api_audit_log (...)` after the wrapped handler returns. Fire-and-forget.
