-- FR-149 v1.1: Add feature_version_id to pipeline tables for version-aware pipeline
-- Nullable FK — NULL = implicit v1.0 (pre-versioning), no data migration needed

ALTER TABLE spec_reviews ADD COLUMN IF NOT EXISTS feature_version_id TEXT REFERENCES feature_versions(id);
ALTER TABLE implementation_requests ADD COLUMN IF NOT EXISTS feature_version_id TEXT REFERENCES feature_versions(id);
ALTER TABLE test_cases ADD COLUMN IF NOT EXISTS feature_version_id TEXT REFERENCES feature_versions(id);
ALTER TABLE pipeline_runs ADD COLUMN IF NOT EXISTS feature_version_id TEXT REFERENCES feature_versions(id);

-- Indexes for version-scoped queries
CREATE INDEX IF NOT EXISTS idx_spec_reviews_version ON spec_reviews(feature_version_id);
CREATE INDEX IF NOT EXISTS idx_impl_requests_version ON implementation_requests(feature_version_id);
CREATE INDEX IF NOT EXISTS idx_test_cases_version ON test_cases(feature_version_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_version ON pipeline_runs(feature_version_id);
