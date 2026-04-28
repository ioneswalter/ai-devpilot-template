-- Feature Spec Artifacts: Stores SpecKit file contents for AI DevPilot
-- Allows Edge Functions to access spec.md, plan.md, tasks.md, data-model.md, contracts/ etc.

CREATE TABLE IF NOT EXISTS feature_spec_artifacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id    UUID NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  artifact_type TEXT NOT NULL, -- spec, plan, tasks, data_model, contract, research, quickstart
  file_name     TEXT NOT NULL, -- e.g., "spec.md", "plan.md", "contracts/api.yaml"
  content       TEXT NOT NULL,
  synced_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (feature_id, artifact_type, file_name)
);

CREATE INDEX idx_feature_spec_artifacts_feature_id ON feature_spec_artifacts(feature_id);
CREATE INDEX idx_feature_spec_artifacts_type ON feature_spec_artifacts(artifact_type);

-- RLS: Only admins can read/write spec artifacts
ALTER TABLE feature_spec_artifacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage spec artifacts"
  ON feature_spec_artifacts
  FOR ALL
  USING (
    auth.uid()::text IN (SELECT user_id FROM admin_users)
  )
  WITH CHECK (
    auth.uid()::text IN (SELECT user_id FROM admin_users)
  );

-- Service role bypass for Edge Functions
CREATE POLICY "Service role full access to spec artifacts"
  ON feature_spec_artifacts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
