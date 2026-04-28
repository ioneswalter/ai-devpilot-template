-- FR-131: Three-Role Delivery Team Definition and Admin Assignment
-- Creates delivery_role_types, delivery_role_assignments, role_change_log

-- 1. delivery_role_types (reference table)
CREATE TABLE IF NOT EXISTS delivery_role_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_code text NOT NULL UNIQUE CHECK (role_code IN ('BP', 'BA', 'SE')),
  role_name text NOT NULL,
  governance_tier text NOT NULL CHECK (governance_tier IN ('L1', 'L2', 'L3')),
  allowed_actions jsonb NOT NULL DEFAULT '[]'::jsonb,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Seed data
INSERT INTO delivery_role_types (role_code, role_name, governance_tier, allowed_actions, description)
VALUES
  ('BP', 'Business Partner', 'L1', '["ideation", "uat_approval", "view_roadmap"]'::jsonb, 'Strategic direction and UAT approval'),
  ('BA', 'Business Analyst', 'L2', '["spec_review", "test_review", "view_pipeline", "view_roadmap"]'::jsonb, 'Specification review and test oversight'),
  ('SE', 'Software Engineer', 'L3', '["build", "test", "deploy", "fix_build", "fix_test", "view_pipeline", "view_roadmap"]'::jsonb, 'Implementation, testing, and deployment')
ON CONFLICT (role_code) DO NOTHING;

-- RLS for delivery_role_types
ALTER TABLE delivery_role_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read role types" ON delivery_role_types;
CREATE POLICY "Authenticated users can read role types"
  ON delivery_role_types FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin can manage role types" ON delivery_role_types;
CREATE POLICY "Admin can manage role types"
  ON delivery_role_types FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text)
  );

-- 2. delivery_role_assignments (junction table)
CREATE TABLE IF NOT EXISTS delivery_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  role_type_id uuid NOT NULL REFERENCES delivery_role_types(id),
  assigned_by text NOT NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role_type_id)
);

CREATE INDEX IF NOT EXISTS idx_role_assignments_user ON delivery_role_assignments(user_id);
CREATE INDEX IF NOT EXISTS idx_role_assignments_role ON delivery_role_assignments(role_type_id);

-- RLS for delivery_role_assignments
ALTER TABLE delivery_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can read role assignments" ON delivery_role_assignments;
CREATE POLICY "Authenticated users can read role assignments"
  ON delivery_role_assignments FOR SELECT
  TO authenticated USING (true);

DROP POLICY IF EXISTS "Admin can manage role assignments" ON delivery_role_assignments;
CREATE POLICY "Admin can manage role assignments"
  ON delivery_role_assignments FOR ALL
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text)
  );

-- 3. role_change_log (audit trail)
CREATE TABLE IF NOT EXISTS role_change_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL,
  action text NOT NULL CHECK (action IN ('assign', 'remove')),
  role_code text NOT NULL,
  changed_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_role_change_log_user ON role_change_log(user_id, created_at DESC);

-- RLS for role_change_log
ALTER TABLE role_change_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admin can read role change log" ON role_change_log;
CREATE POLICY "Admin can read role change log"
  ON role_change_log FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Service role can write role change log" ON role_change_log;
CREATE POLICY "Service role can write role change log"
  ON role_change_log FOR INSERT
  TO authenticated WITH CHECK (true);
