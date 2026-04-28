-- FR-119: Parallel Multi-Feature Implementation
-- Pipeline queue for concurrency management + deploy mutex

-- Pipeline Queue table
CREATE TABLE IF NOT EXISTS pipeline_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID,
  feature_id UUID NOT NULL,
  request_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'cancelled', 'failed')),
  position INTEGER NOT NULL DEFAULT 0,
  max_concurrent INTEGER NOT NULL DEFAULT 3,
  queued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pipeline_queue_status ON pipeline_queue(status);
CREATE INDEX IF NOT EXISTS idx_pipeline_queue_queued ON pipeline_queue(status, position) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_pipeline_queue_feature ON pipeline_queue(feature_id);

-- Deploy Locks table (mutex for migrations)
CREATE TABLE IF NOT EXISTS deploy_locks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL UNIQUE,
  feature_id UUID NOT NULL,
  acquired_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes')
);

CREATE INDEX IF NOT EXISTS idx_deploy_locks_pipeline ON deploy_locks(pipeline_id);

-- Extend pipeline_runs with queue and conflict columns
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS queue_entry_id UUID;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS conflict_report JSONB;
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS waiting_for_deploy BOOLEAN NOT NULL DEFAULT false;

-- Add 'queued' to status check if not present (extend the check constraint)
-- Note: pipeline_runs status already allows free text in most setups, but update current_stage
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_current_stage_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_current_stage_check
  CHECK (current_stage IN ('implementing', 'idle', 'build_check', 'build_passed', 'build_failed', 'deploying', 'deployed', 'deploy_failed', 'readying', 'tested', 'waiting_for_deploy', 'ready_for_testing'));

-- Extend notification types for queue events
ALTER TABLE pipeline_notifications DROP CONSTRAINT IF EXISTS pipeline_notifications_type_check;
ALTER TABLE pipeline_notifications ADD CONSTRAINT pipeline_notifications_type_check
  CHECK (type IN ('test_ready', 'readiness_failed', 'queue_promoted', 'queue_position_changed'));

-- RLS policies
ALTER TABLE pipeline_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE deploy_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on pipeline_queue" ON pipeline_queue;
CREATE POLICY "Service role full access on pipeline_queue"
  ON pipeline_queue FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access on deploy_locks" ON deploy_locks;
CREATE POLICY "Service role full access on deploy_locks"
  ON deploy_locks FOR ALL USING (true) WITH CHECK (true);
