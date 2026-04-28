-- FR-129: UAT Package Generation
-- New tables: uat_packages, uat_checklist_items

-- 1. uat_packages — one per feature per generation
CREATE TABLE IF NOT EXISTS uat_packages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  feature_id TEXT NOT NULL REFERENCES product_features(id) ON DELETE CASCADE,
  feature_version_id TEXT REFERENCES feature_versions(id),
  status TEXT NOT NULL DEFAULT 'in_review'
    CHECK (status IN ('draft', 'in_review', 'approved', 'rejected')),
  spec_version_at_creation INTEGER NOT NULL DEFAULT 1,
  generated_by TEXT NOT NULL DEFAULT 'auto'
    CHECK (generated_by IN ('auto', 'manual')),
  test_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  known_limitations TEXT[] DEFAULT '{}',
  access_instructions TEXT,
  prototype_refs JSONB DEFAULT '[]'::jsonb,
  reviewer_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_packages_feature ON uat_packages(feature_id);
CREATE INDEX IF NOT EXISTS idx_uat_packages_reviewer ON uat_packages(reviewer_id, status);

-- 2. uat_checklist_items — individual reviewable line items
CREATE TABLE IF NOT EXISTS uat_checklist_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  package_id TEXT NOT NULL REFERENCES uat_packages(id) ON DELETE CASCADE,
  source TEXT NOT NULL DEFAULT 'spec_criterion'
    CHECK (source IN ('spec_criterion', 'ideation_happy_path', 'ideation_edge_case')),
  content TEXT NOT NULL,
  journey_priority TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  decision TEXT NOT NULL DEFAULT 'pending'
    CHECK (decision IN ('pending', 'pass', 'fail', 'defer')),
  feedback TEXT,
  scenario_data JSONB,
  spec_criterion_index INTEGER,
  decided_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_uat_items_package ON uat_checklist_items(package_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_uat_items_decision ON uat_checklist_items(package_id, decision);

-- 3. RLS policies
ALTER TABLE uat_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE uat_checklist_items ENABLE ROW LEVEL SECURITY;

-- Admin full access to packages
CREATE POLICY uat_packages_admin_all ON uat_packages
  FOR ALL USING (true) WITH CHECK (true);

-- Admin full access to checklist items
CREATE POLICY uat_items_admin_all ON uat_checklist_items
  FOR ALL USING (true) WITH CHECK (true);
