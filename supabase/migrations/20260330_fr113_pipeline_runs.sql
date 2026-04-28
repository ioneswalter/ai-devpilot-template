-- FR-113: Server-Side Pipeline Orchestration
-- Creates pipeline_runs table for server-side pipeline state tracking

CREATE TABLE IF NOT EXISTS pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  request_id UUID NOT NULL REFERENCES implementation_requests(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'completed', 'failed', 'cancelled', 'timed_out')),
  current_stage TEXT NOT NULL DEFAULT 'implementing'
    CHECK (current_stage IN ('implementing', 'idle')),
  current_task_id UUID REFERENCES implementation_task_items(id),
  total_tasks INT NOT NULL DEFAULT 0,
  completed_tasks INT NOT NULL DEFAULT 0,
  failed_tasks INT NOT NULL DEFAULT 0,
  checkpoint_data JSONB,
  logs JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_feature ON pipeline_runs(feature_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_request ON pipeline_runs(request_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_running ON pipeline_runs(status) WHERE status = 'running';

-- Enable RLS
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;

-- Admin read/write access
CREATE POLICY "Admin can read pipeline runs"
  ON pipeline_runs FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = (auth.uid())::text)
  );

CREATE POLICY "Admin can insert pipeline runs"
  ON pipeline_runs FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = (auth.uid())::text)
  );

CREATE POLICY "Admin can update pipeline runs"
  ON pipeline_runs FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = (auth.uid())::text)
  );

-- Service role bypass (for Edge Functions)
CREATE POLICY "Service role full access pipeline runs"
  ON pipeline_runs FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_pipeline_runs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_pipeline_runs_updated_at ON pipeline_runs;
CREATE TRIGGER set_pipeline_runs_updated_at
  BEFORE UPDATE ON pipeline_runs
  FOR EACH ROW
  EXECUTE FUNCTION update_pipeline_runs_updated_at();
