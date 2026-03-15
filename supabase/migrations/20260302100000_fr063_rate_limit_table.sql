-- FR-063: Rate Limiting Table
-- Stores request logs for DB-backed rate limiting on public API endpoints.
-- Used by _shared/rate-limit.ts helper.

CREATE TABLE IF NOT EXISTS rate_limit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  identifier TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast lookups by identifier + endpoint + time window
CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup
  ON rate_limit_log (identifier, endpoint, created_at DESC);

-- Enable RLS (constitution requirement: RLS on ALL tables)
ALTER TABLE rate_limit_log ENABLE ROW LEVEL SECURITY;

-- Only service_role can access (Edge Functions only)
DROP POLICY IF EXISTS "Service role full access to rate_limit_log" ON rate_limit_log;
CREATE POLICY "Service role full access to rate_limit_log"
  ON rate_limit_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Auto-cleanup: delete entries older than 1 hour
-- This function is called periodically to prevent table bloat
CREATE OR REPLACE FUNCTION cleanup_rate_limit_log()
RETURNS void AS $$
BEGIN
  DELETE FROM rate_limit_log
  WHERE created_at < NOW() - INTERVAL '1 hour';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
