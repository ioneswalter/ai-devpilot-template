-- FR-101 J3: Edge Function Server-Timing persistence
-- Creates a dedicated table for per-request latency measurements and a view
-- for p95 aggregation over a 7-day window.
--
-- Note: spec research.md suggested extending usage_logs, but the existing
-- ai_usage_logs table is AI-cost specific. A dedicated table is cleaner for
-- generic Edge Function timing that includes non-AI handlers.

CREATE TABLE IF NOT EXISTS edge_function_timing_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  function_name TEXT NOT NULL,
  status_code INTEGER,
  total_timing_ms INTEGER NOT NULL,
  db_timing_ms INTEGER,
  warm_boot BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Compound index for efficient p95 queries scoped by function + time
CREATE INDEX IF NOT EXISTS idx_edge_fn_timing_fn_created
  ON edge_function_timing_logs (function_name, created_at DESC);

-- Retention: prune rows older than 30 days (matches ai_usage_logs cadence)
COMMENT ON TABLE edge_function_timing_logs IS
  'FR-101: per-request latency samples from Edge Functions. Retention policy: 30 days.';

-- RLS: admins and service role only. Anonymous and authenticated cannot read.
ALTER TABLE edge_function_timing_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "edge_function_timing_logs_admin_read"
  ON edge_function_timing_logs
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM auth.users
      WHERE auth.users.id = auth.uid()
        AND (auth.users.raw_app_meta_data ->> 'role') = 'admin'
    )
  );

-- Service role bypasses RLS automatically; no explicit policy needed.

-- p95 view over trailing 7 days. Includes all samples.
-- Note: warm_boot detection is unreliable across scaled-out worker instances,
-- so filtering on it would exclude most real traffic. The raw column is still
-- recorded for future analysis if a more robust signal becomes available.
CREATE OR REPLACE VIEW edge_function_p95_7d AS
SELECT
  function_name,
  COUNT(*)::INTEGER AS sample_count,
  (percentile_cont(0.50) WITHIN GROUP (ORDER BY total_timing_ms))::INTEGER AS p50_total_ms,
  (percentile_cont(0.95) WITHIN GROUP (ORDER BY total_timing_ms))::INTEGER AS p95_total_ms,
  (percentile_cont(0.95) WITHIN GROUP (ORDER BY db_timing_ms))::INTEGER AS p95_db_ms,
  MAX(total_timing_ms) AS max_total_ms,
  (percentile_cont(0.95) WITHIN GROUP (ORDER BY total_timing_ms) < 500) AS meets_sla
FROM edge_function_timing_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY function_name;

COMMENT ON VIEW edge_function_p95_7d IS
  'FR-101: p95 latency per Edge Function over last 7 days. Includes cold starts.';
