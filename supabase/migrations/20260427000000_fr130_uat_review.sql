-- FR-130: Asynchronous UAT Review and Fix-Cycle Routing
-- Adds cycle history, audit log, fix-cycle tasks, and prototype/scenario refs.
-- IDs follow FR-129 pattern (TEXT, not UUID) for FK compatibility.

-- 1. Extend FR-129 uat_checklist_items with prototype/scenario references
ALTER TABLE uat_checklist_items
  ADD COLUMN IF NOT EXISTS prototype_id TEXT,
  ADD COLUMN IF NOT EXISTS scenario_id TEXT;

CREATE INDEX IF NOT EXISTS idx_uat_items_prototype ON uat_checklist_items(prototype_id) WHERE prototype_id IS NOT NULL;

-- 2. uat_review_decisions — per-item decision history per cycle
CREATE TABLE IF NOT EXISTS uat_review_decisions (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  checklist_item_id TEXT NOT NULL REFERENCES uat_checklist_items(id) ON DELETE CASCADE,
  package_id TEXT NOT NULL REFERENCES uat_packages(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL CHECK (cycle_number >= 1),
  decision TEXT NOT NULL CHECK (decision IN ('pass', 'fail', 'defer')),
  feedback TEXT,
  reviewed_by UUID NOT NULL REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_uat_decisions_item_cycle ON uat_review_decisions(checklist_item_id, cycle_number);
CREATE INDEX IF NOT EXISTS idx_uat_decisions_pkg_cycle ON uat_review_decisions(package_id, cycle_number);

ALTER TABLE uat_review_decisions ENABLE ROW LEVEL SECURITY;

-- BP/SE/admin can read decisions for their packages
DROP POLICY IF EXISTS uat_decisions_select_authorized ON uat_review_decisions;
CREATE POLICY uat_decisions_select_authorized ON uat_review_decisions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text
    ) OR EXISTS (
      SELECT 1 FROM delivery_role_assignments dra
        JOIN delivery_role_types drt ON dra.role_type_id = drt.id
       WHERE dra.user_id = auth.uid()::text AND drt.role_code IN ('BP', 'SE', 'BA')
    )
  );

-- Insert via service role (Edge Function) only
DROP POLICY IF EXISTS uat_decisions_insert_service ON uat_review_decisions;
CREATE POLICY uat_decisions_insert_service ON uat_review_decisions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- 3. fix_cycle_tasks — work items routed to SEs on fail
CREATE TABLE IF NOT EXISTS fix_cycle_tasks (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  package_id TEXT NOT NULL REFERENCES uat_packages(id) ON DELETE CASCADE,
  checklist_item_id TEXT NOT NULL REFERENCES uat_checklist_items(id) ON DELETE CASCADE,
  decision_id TEXT NOT NULL REFERENCES uat_review_decisions(id) ON DELETE CASCADE,
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  criterion_text TEXT NOT NULL,
  feedback TEXT NOT NULL,
  prototype_id TEXT,
  assigned_se_id UUID REFERENCES auth.users(id),
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  resolved_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_fix_tasks_pkg ON fix_cycle_tasks(package_id);
CREATE INDEX IF NOT EXISTS idx_fix_tasks_se_status ON fix_cycle_tasks(assigned_se_id, status);
CREATE INDEX IF NOT EXISTS idx_fix_tasks_status_created ON fix_cycle_tasks(status, created_at);
CREATE INDEX IF NOT EXISTS idx_fix_tasks_feature ON fix_cycle_tasks(feature_id);

ALTER TABLE fix_cycle_tasks ENABLE ROW LEVEL SECURITY;

-- SE/BP/admin can read fix-cycle tasks
DROP POLICY IF EXISTS fix_tasks_select_authorized ON fix_cycle_tasks;
CREATE POLICY fix_tasks_select_authorized ON fix_cycle_tasks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text
    ) OR EXISTS (
      SELECT 1 FROM delivery_role_assignments dra
        JOIN delivery_role_types drt ON dra.role_type_id = drt.id
       WHERE dra.user_id = auth.uid()::text AND drt.role_code IN ('SE', 'BP', 'BA')
    )
  );

-- Insert via service role only
DROP POLICY IF EXISTS fix_tasks_insert_service ON fix_cycle_tasks;
CREATE POLICY fix_tasks_insert_service ON fix_cycle_tasks FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- SE can update status of tasks assigned to them; admin can update any
DROP POLICY IF EXISTS fix_tasks_update_se ON fix_cycle_tasks;
CREATE POLICY fix_tasks_update_se ON fix_cycle_tasks FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text)
    OR (assigned_se_id = auth.uid())
    OR (
      assigned_se_id IS NULL AND EXISTS (
        SELECT 1 FROM delivery_role_assignments dra
          JOIN delivery_role_types drt ON dra.role_type_id = drt.id
         WHERE dra.user_id = auth.uid()::text AND drt.role_code = 'SE'
      )
    )
  );

-- 4. uat_review_audit — one row per submit per cycle
CREATE TABLE IF NOT EXISTS uat_review_audit (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  package_id TEXT NOT NULL REFERENCES uat_packages(id) ON DELETE CASCADE,
  cycle_number INTEGER NOT NULL CHECK (cycle_number >= 1),
  submitted_by UUID NOT NULL REFERENCES auth.users(id),
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  prior_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  decisions_summary JSONB NOT NULL,
  UNIQUE (package_id, cycle_number)
);

CREATE INDEX IF NOT EXISTS idx_uat_audit_pkg ON uat_review_audit(package_id);

ALTER TABLE uat_review_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS uat_audit_select_authorized ON uat_review_audit;
CREATE POLICY uat_audit_select_authorized ON uat_review_audit FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM admin_users WHERE user_id = auth.uid()::text
    ) OR EXISTS (
      SELECT 1 FROM delivery_role_assignments dra
        JOIN delivery_role_types drt ON dra.role_type_id = drt.id
       WHERE dra.user_id = auth.uid()::text AND drt.role_code IN ('BP', 'SE', 'BA')
    )
  );

DROP POLICY IF EXISTS uat_audit_insert_service ON uat_review_audit;
CREATE POLICY uat_audit_insert_service ON uat_review_audit FOR INSERT
  WITH CHECK (auth.role() = 'service_role');
