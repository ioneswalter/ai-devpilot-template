-- Feature Versioning (Strategic Plan I2-04)
-- Snapshots feature state before each edit to track v1, v2, v3 evolution

CREATE TABLE IF NOT EXISTS feature_versions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  title TEXT NOT NULL,
  description TEXT,
  acceptance_criteria JSONB DEFAULT '[]'::jsonb,
  status TEXT,
  category TEXT,
  change_summary TEXT,
  changed_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for fast lookups by feature
CREATE INDEX IF NOT EXISTS idx_feature_versions_feature_id ON feature_versions(feature_id);
CREATE INDEX IF NOT EXISTS idx_feature_versions_created_at ON feature_versions(created_at DESC);

-- Unique constraint: one version number per feature
CREATE UNIQUE INDEX IF NOT EXISTS idx_feature_versions_unique ON feature_versions(feature_id, version_number);

-- RLS: admins can read/write, authenticated users can read
ALTER TABLE feature_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage feature versions"
  ON feature_versions FOR ALL
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE feature_versions IS 'Tracks historical snapshots of feature specifications for lineage and diff tracking';
