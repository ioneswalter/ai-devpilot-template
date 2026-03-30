-- FR-116: Dev Release & Test Readiness
-- Adds readiness_results column to pipeline_runs and creates pipeline_notifications table

-- 1. Add readiness_results JSONB column
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS readiness_results JSONB;

-- 2. Extend current_stage CHECK constraint to include readiness stages
ALTER TABLE pipeline_runs DROP CONSTRAINT IF EXISTS pipeline_runs_current_stage_check;
ALTER TABLE pipeline_runs ADD CONSTRAINT pipeline_runs_current_stage_check
  CHECK (current_stage IN (
    'idle', 'implementing', 'build_check', 'build_passed', 'build_failed',
    'deploying', 'deployed', 'deploy_failed',
    'readying', 'ready_for_testing', 'readiness_partial'
  ));

-- 3. Create pipeline_notifications table
CREATE TABLE IF NOT EXISTS pipeline_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT NOT NULL REFERENCES product_features(id),
  pipeline_id UUID NOT NULL REFERENCES pipeline_runs(id),
  type TEXT NOT NULL CHECK (type IN ('test_ready', 'readiness_failed')),
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4. Enable RLS on pipeline_notifications
ALTER TABLE pipeline_notifications ENABLE ROW LEVEL SECURITY;

-- 5. RLS policy: admins can read all notifications
CREATE POLICY "Admins can read notifications" ON pipeline_notifications
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = (auth.uid())::text
    )
  );

-- 6. RLS policy: admins can update (mark read)
CREATE POLICY "Admins can update notifications" ON pipeline_notifications
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = (auth.uid())::text
    )
  );

-- 7. RLS policy: service role can insert (pipeline creates notifications)
CREATE POLICY "Service can insert notifications" ON pipeline_notifications
  FOR INSERT WITH CHECK (true);

-- 8. Index for efficient querying
CREATE INDEX IF NOT EXISTS idx_pipeline_notifications_unread
  ON pipeline_notifications(read, created_at DESC)
  WHERE read = false;
