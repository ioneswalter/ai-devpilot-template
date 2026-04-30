-- FR-141: UAT Scenario Builder — AI-drafted scenarios curated by the BP at Ideation time.
-- Replay-safe: idempotent across re-applies (uses DROP POLICY guards and IF-NOT-EXISTS table guards).

-- 1. Table
CREATE TABLE IF NOT EXISTS uat_scenarios (
  id                  TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id     TEXT NOT NULL REFERENCES ideation_conversations(id) ON DELETE CASCADE,
  feature_id          TEXT REFERENCES product_features(id) ON DELETE SET NULL,
  scenario_type       TEXT NOT NULL CHECK (scenario_type IN ('happy_path', 'edge_case')),
  title               TEXT NOT NULL,
  trigger_condition   TEXT,
  steps               JSONB NOT NULL DEFAULT '[]'::jsonb
                        CHECK (jsonb_typeof(steps) = 'array' AND jsonb_array_length(steps) <= 50),
  expected_behavior   TEXT,
  sort_order          INTEGER NOT NULL DEFAULT 0,
  review_status       TEXT NOT NULL DEFAULT 'draft'
                        CHECK (review_status IN ('draft', 'curated')),
  ai_provenance       JSONB,
  created_by          TEXT NOT NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  curated_at          TIMESTAMPTZ
);

-- 2. Indexes (replay-safe)
CREATE INDEX IF NOT EXISTS uat_scenarios_conversation_id_idx ON uat_scenarios(conversation_id);
CREATE INDEX IF NOT EXISTS uat_scenarios_created_by_idx ON uat_scenarios(created_by);
CREATE INDEX IF NOT EXISTS uat_scenarios_feature_id_curated_idx
  ON uat_scenarios(feature_id)
  WHERE feature_id IS NOT NULL AND review_status = 'curated';

-- 3. updated_at trigger (reuses existing helper)
DROP TRIGGER IF EXISTS uat_scenarios_set_updated_at ON uat_scenarios;
CREATE TRIGGER uat_scenarios_set_updated_at
  BEFORE UPDATE ON uat_scenarios
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 4. RLS — owner OR admin (mirrors existing FR-130 / job_requests pattern)
ALTER TABLE uat_scenarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uat_scenarios_owner_select ON uat_scenarios;
CREATE POLICY uat_scenarios_owner_select
  ON uat_scenarios FOR SELECT
  TO authenticated
  USING (
    created_by = auth.uid()::text
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS uat_scenarios_owner_insert ON uat_scenarios;
CREATE POLICY uat_scenarios_owner_insert
  ON uat_scenarios FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid()::text);

DROP POLICY IF EXISTS uat_scenarios_owner_update ON uat_scenarios;
CREATE POLICY uat_scenarios_owner_update
  ON uat_scenarios FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()::text
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  )
  WITH CHECK (
    created_by = auth.uid()::text
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS uat_scenarios_owner_delete ON uat_scenarios;
CREATE POLICY uat_scenarios_owner_delete
  ON uat_scenarios FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()::text
    OR EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS uat_scenarios_service_role_all ON uat_scenarios;
CREATE POLICY uat_scenarios_service_role_all
  ON uat_scenarios FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
