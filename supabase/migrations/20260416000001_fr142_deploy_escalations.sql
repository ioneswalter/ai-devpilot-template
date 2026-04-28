-- FR-142: Deploy Escalations table for SE intervention tracking
-- Tracks deployment failures that require manual SE resolution

CREATE TABLE IF NOT EXISTS deploy_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  step_type TEXT NOT NULL CHECK (step_type IN ('migration', 'function')),
  step_artifact TEXT NOT NULL,
  error_message TEXT NOT NULL,
  fix_attempts_count INTEGER NOT NULL DEFAULT 0,
  fix_attempts_detail JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'acknowledged', 'resolved')),
  acknowledged_by UUID REFERENCES auth.users(id),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_deploy_escalations_pipeline ON deploy_escalations(pipeline_id);
CREATE INDEX IF NOT EXISTS idx_deploy_escalations_status ON deploy_escalations(status);

-- RLS
ALTER TABLE deploy_escalations ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated admins only
CREATE POLICY deploy_escalations_select ON deploy_escalations
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text)
  );

-- UPDATE: authenticated admins only (acknowledge/resolve)
CREATE POLICY deploy_escalations_update ON deploy_escalations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text)
  );

-- INSERT: service_role only (orchestrator creates escalations)
-- No policy needed — service_role bypasses RLS
