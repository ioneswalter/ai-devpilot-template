-- FR-167 J2 — usage_rollups table + compute_usage_rollup SECURITY DEFINER function.
--
-- Per-tenant per-month aggregate of AI tokens, raw cost, billable cost (2× markup
-- rounded up to cent), and gateway request count. The compute function aggregates
-- ai_usage_logs (raw cost frozen at write-time per ai_models cost-per-token) and
-- api_audit_log (gateway calls), then UPSERTs into usage_rollups keyed on
-- (tenant_id, period_start). Idempotent — re-running for the same tenant+period
-- overwrites the same row.
--
-- ai_billable_cost = ceil(ai_raw_cost × 200) / 100
--   (2× markup, rounded up to cent in operator's favour per the documented
--    business model; numeric(12,4) avoids floating-point drift)

BEGIN;

-- 1. Table
CREATE TABLE IF NOT EXISTS public.usage_rollups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL DEFAULT public.get_default_tenant_id() REFERENCES public.tenants(id),
  period_start date NOT NULL,
  period_end date NOT NULL,
  ai_input_tokens bigint NOT NULL DEFAULT 0,
  ai_output_tokens bigint NOT NULL DEFAULT 0,
  ai_raw_cost numeric(12, 4) NOT NULL DEFAULT 0,
  ai_billable_cost numeric(12, 4) NOT NULL DEFAULT 0,
  gateway_calls int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, period_start)
);

CREATE INDEX IF NOT EXISTS usage_rollups_tenant_id_idx ON public.usage_rollups (tenant_id);
CREATE INDEX IF NOT EXISTS usage_rollups_period_idx ON public.usage_rollups (period_start);

-- 2. RLS — FR-162 COALESCE pattern
ALTER TABLE public.usage_rollups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS usage_rollups_tenant_isolation ON public.usage_rollups;
CREATE POLICY usage_rollups_tenant_isolation ON public.usage_rollups
  FOR ALL
  TO authenticated
  USING (
    tenant_id = COALESCE(
      NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid,
      public.get_default_tenant_id()
    )
  )
  WITH CHECK (
    tenant_id = COALESCE(
      NULLIF(auth.jwt() ->> 'tenant_id', '')::uuid,
      public.get_default_tenant_id()
    )
  );

-- 3. compute_usage_rollup — aggregates + UPSERTs
CREATE OR REPLACE FUNCTION public.compute_usage_rollup(
  p_tenant_id uuid,
  p_period_start date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $func$
DECLARE
  v_period_end date;
  v_input_tokens bigint;
  v_output_tokens bigint;
  v_raw_cost numeric(12, 4);
  v_billable_cost numeric(12, 4);
  v_gateway_calls int;
  v_rollup_id uuid;
BEGIN
  v_period_end := (p_period_start + interval '1 month' - interval '1 day')::date;

  SELECT
    COALESCE(SUM(input_tokens), 0),
    COALESCE(SUM(output_tokens), 0),
    COALESCE(SUM(total_cost), 0)
  INTO v_input_tokens, v_output_tokens, v_raw_cost
  FROM public.ai_usage_logs
  WHERE tenant_id = p_tenant_id
    AND created_at >= p_period_start
    AND created_at < (v_period_end + interval '1 day');

  SELECT COUNT(*) INTO v_gateway_calls
  FROM public.api_audit_log
  WHERE tenant_id = p_tenant_id
    AND created_at >= p_period_start
    AND created_at < (v_period_end + interval '1 day');

  -- 2× markup, rounded up to cent
  v_billable_cost := CEIL(v_raw_cost * 200) / 100;

  INSERT INTO public.usage_rollups (
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
$func$;

COMMENT ON FUNCTION public.compute_usage_rollup(uuid, date) IS
  'FR-167 J2 — aggregate ai_usage_logs + api_audit_log for the tenant + month-window; UPSERT into usage_rollups. Idempotent. ai_billable_cost = ceil(ai_raw_cost × 200) / 100.';

GRANT EXECUTE ON FUNCTION public.compute_usage_rollup(uuid, date) TO authenticated, service_role;

COMMIT;
