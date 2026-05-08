# Data Model — FR-167

## `ai_usage_logs` (existing, modified)

Adds `tenant_id` to align with FR-162 multi-tenancy. No other column changes.

```sql
ALTER TABLE public.ai_usage_logs
  ADD COLUMN IF NOT EXISTS tenant_id uuid NOT NULL DEFAULT public.get_default_tenant_id()
    REFERENCES public.tenants(id);

CREATE INDEX IF NOT EXISTS ai_usage_logs_tenant_id_idx ON public.ai_usage_logs (tenant_id);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_usage_logs_tenant_isolation ON public.ai_usage_logs;
CREATE POLICY ai_usage_logs_tenant_isolation ON public.ai_usage_logs
  FOR ALL TO authenticated
  USING (tenant_id = COALESCE(NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid, public.get_default_tenant_id()))
  WITH CHECK (tenant_id = COALESCE(NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid, public.get_default_tenant_id()));
```

Backfill is implicit via the DEFAULT (existing rows already inserted before this migration get NULL until backfilled). Migration includes:

```sql
UPDATE public.ai_usage_logs SET tenant_id = public.get_default_tenant_id() WHERE tenant_id IS NULL;
```

`scripts/verify-rls-status.ts` is updated: `FR162_SCOPE_TABLES` grows from 31 to 32 with the addition of `'ai_usage_logs'`.

## `usage_rollups` (new)

Per-tenant per-month aggregate of AI tokens, raw cost, billable cost, and gateway request count.

```sql
CREATE TABLE IF NOT EXISTS public.usage_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.get_default_tenant_id() REFERENCES public.tenants(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  ai_input_tokens bigint NOT NULL DEFAULT 0,
  ai_output_tokens bigint NOT NULL DEFAULT 0,
  ai_raw_cost numeric(12,4) NOT NULL DEFAULT 0,
  ai_billable_cost numeric(12,4) NOT NULL DEFAULT 0,
  gateway_calls int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start)
);

CREATE INDEX IF NOT EXISTS usage_rollups_tenant_id_idx ON public.usage_rollups (tenant_id);
CREATE INDEX IF NOT EXISTS usage_rollups_period_idx ON public.usage_rollups (period_start);

ALTER TABLE public.usage_rollups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS usage_rollups_tenant_isolation ON public.usage_rollups;
CREATE POLICY usage_rollups_tenant_isolation ON public.usage_rollups
  FOR ALL TO authenticated
  USING (tenant_id = COALESCE(NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid, public.get_default_tenant_id()))
  WITH CHECK (tenant_id = COALESCE(NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid, public.get_default_tenant_id()));
```

`FR162_SCOPE_TABLES` grows again to 33 with `'usage_rollups'`.

### Field semantics

| Column                                 | Notes                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `period_start` / `period_end`          | Calendar-month boundaries (date type, not timestamptz). `period_end = period_start + interval '1 month' - interval '1 day'`.   |
| `ai_input_tokens` / `ai_output_tokens` | SUM from `ai_usage_logs` for the period. bigint to safely accommodate millions of tokens per tenant.                           |
| `ai_raw_cost`                          | SUM of `ai_usage_logs.total_cost` for the period (cost-at-time-of-call frozen in the source rows; not re-computed from rates). |
| `ai_billable_cost`                     | `ceil(ai_raw_cost × 200) / 100` — 2× markup, rounded up to cent in operator's favour per the documented business model.        |
| `gateway_calls`                        | COUNT of `api_audit_log` rows for the tenant in the period.                                                                    |

## `compute_usage_rollup` SQL function (new)

```sql
CREATE OR REPLACE FUNCTION public.compute_usage_rollup(
  p_tenant_id uuid,
  p_period_start date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_period_end date;
  v_input_tokens bigint;
  v_output_tokens bigint;
  v_raw_cost numeric(12,4);
  v_billable_cost numeric(12,4);
  v_gateway_calls int;
  v_rollup_id uuid;
BEGIN
  -- Calendar-month boundaries
  v_period_end := (p_period_start + interval '1 month' - interval '1 day')::date;

  -- Aggregate ai_usage_logs for the tenant + period
  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(total_cost), 0)
  INTO v_input_tokens, v_output_tokens, v_raw_cost
  FROM ai_usage_logs
  WHERE tenant_id = p_tenant_id
    AND created_at >= p_period_start
    AND created_at < (v_period_end + interval '1 day');

  -- Aggregate api_audit_log for the same window
  SELECT COUNT(*) INTO v_gateway_calls
  FROM api_audit_log
  WHERE tenant_id = p_tenant_id
    AND created_at >= p_period_start
    AND created_at < (v_period_end + interval '1 day');

  -- 2× markup, rounded up to cent in operator's favour
  v_billable_cost := ceil(v_raw_cost * 200) / 100;

  -- UPSERT
  INSERT INTO usage_rollups (
    tenant_id, period_start, period_end,
    ai_input_tokens, ai_output_tokens, ai_raw_cost, ai_billable_cost, gateway_calls
  )
  VALUES (
    p_tenant_id, p_period_start, v_period_end,
    v_input_tokens, v_output_tokens, v_raw_cost, v_billable_cost, v_gateway_calls
  )
  ON CONFLICT (tenant_id, period_start) DO UPDATE
    SET ai_input_tokens = EXCLUDED.ai_input_tokens,
        ai_output_tokens = EXCLUDED.ai_output_tokens,
        ai_raw_cost = EXCLUDED.ai_raw_cost,
        ai_billable_cost = EXCLUDED.ai_billable_cost,
        gateway_calls = EXCLUDED.gateway_calls,
        period_end = EXCLUDED.period_end,
        updated_at = now()
  RETURNING id INTO v_rollup_id;

  RETURN v_rollup_id;
END;
$$;

COMMENT ON FUNCTION public.compute_usage_rollup(uuid, date) IS
  'FR-167 — aggregate ai_usage_logs + api_audit_log for the tenant + month; UPSERT into usage_rollups. Idempotent.';

GRANT EXECUTE ON FUNCTION public.compute_usage_rollup(uuid, date) TO authenticated, service_role;
```

## Migrations

- `supabase/migrations/<timestamp>_fr167_j1_ai_usage_logs_tenant_id.sql` — column add + backfill + index + RLS policy.
- `supabase/migrations/<timestamp>_fr167_j2_usage_rollups_table.sql` — new table + RLS + indexes + `compute_usage_rollup` function.

## Read paths

- Tenant dashboard query (via `usage-rollup` Edge Function): `SELECT * FROM usage_rollups WHERE tenant_id = $1 AND period_start = date_trunc('month', now())::date`. If no row → call `compute_usage_rollup(tenant_id, period_start)` then re-SELECT.
- Admin all-tenants query: `SELECT t.code, t.name, ur.* FROM tenants t LEFT JOIN usage_rollups ur ON ur.tenant_id = t.id AND ur.period_start = $1 ORDER BY ur.ai_billable_cost DESC NULLS LAST`. Service-role-only.
