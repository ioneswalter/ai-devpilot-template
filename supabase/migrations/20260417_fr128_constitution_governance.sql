/**
 * Migration: FR-128 Versioned Constitution with Propagation
 * Creates constitution_versions, constitution_rules, constitution_audit_log,
 * and template_bindings tables with RLS policies.
 */

-- Constitution Versions
CREATE TABLE IF NOT EXISTS constitution_versions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    version TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'active', 'archived')),
    summary_of_changes TEXT,
    created_by UUID NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_constitution_versions_status
  ON constitution_versions(status);
CREATE INDEX IF NOT EXISTS idx_constitution_versions_version
  ON constitution_versions(version);

-- Constitution Rules
CREATE TABLE IF NOT EXISTS constitution_rules (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    version_id UUID NOT NULL REFERENCES constitution_versions(id) ON DELETE CASCADE,
    rule_number TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT,
    is_non_negotiable BOOLEAN DEFAULT false,
    sort_order INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    UNIQUE(version_id, rule_number)
);

CREATE INDEX IF NOT EXISTS idx_constitution_rules_version_id
  ON constitution_rules(version_id);
CREATE INDEX IF NOT EXISTS idx_constitution_rules_sort_order
  ON constitution_rules(sort_order);

-- Constitution Audit Log
CREATE TABLE IF NOT EXISTS constitution_audit_log (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    version_from_id UUID REFERENCES constitution_versions(id) ON DELETE SET NULL,
    version_to_id UUID NOT NULL REFERENCES constitution_versions(id) ON DELETE CASCADE,
    rule_number TEXT NOT NULL,
    field_changed TEXT NOT NULL,
    old_value TEXT,
    new_value TEXT,
    changed_by UUID NOT NULL,
    changed_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_constitution_audit_log_version_to
  ON constitution_audit_log(version_to_id);
CREATE INDEX IF NOT EXISTS idx_constitution_audit_log_changed_at
  ON constitution_audit_log(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_constitution_audit_log_rule
  ON constitution_audit_log(rule_number);

-- Template Bindings
CREATE TABLE IF NOT EXISTS template_bindings (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    template_name TEXT NOT NULL UNIQUE,
    template_path TEXT NOT NULL,
    last_synced_version_id UUID NOT NULL REFERENCES constitution_versions(id),
    last_synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_template_bindings_version
  ON template_bindings(last_synced_version_id);

-- RLS Policies (T005)
ALTER TABLE constitution_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE constitution_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE constitution_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE template_bindings ENABLE ROW LEVEL SECURITY;

-- Authenticated users can read all constitution data
DROP POLICY IF EXISTS "authenticated_read_constitution_versions" ON constitution_versions;
CREATE POLICY "authenticated_read_constitution_versions"
  ON constitution_versions FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_read_constitution_rules" ON constitution_rules;
CREATE POLICY "authenticated_read_constitution_rules"
  ON constitution_rules FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_read_constitution_audit_log" ON constitution_audit_log;
CREATE POLICY "authenticated_read_constitution_audit_log"
  ON constitution_audit_log FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "authenticated_read_template_bindings" ON template_bindings;
CREATE POLICY "authenticated_read_template_bindings"
  ON template_bindings FOR SELECT
  TO authenticated
  USING (true);

-- Only admin (via service role) can write
-- Edge Functions use service_role key which bypasses RLS
-- These policies block direct client writes
DROP POLICY IF EXISTS "deny_client_insert_constitution_versions" ON constitution_versions;
CREATE POLICY "deny_client_insert_constitution_versions"
  ON constitution_versions FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_update_constitution_versions" ON constitution_versions;
CREATE POLICY "deny_client_update_constitution_versions"
  ON constitution_versions FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_client_delete_constitution_versions" ON constitution_versions;
CREATE POLICY "deny_client_delete_constitution_versions"
  ON constitution_versions FOR DELETE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_client_insert_constitution_rules" ON constitution_rules;
CREATE POLICY "deny_client_insert_constitution_rules"
  ON constitution_rules FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_update_constitution_rules" ON constitution_rules;
CREATE POLICY "deny_client_update_constitution_rules"
  ON constitution_rules FOR UPDATE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_client_delete_constitution_rules" ON constitution_rules;
CREATE POLICY "deny_client_delete_constitution_rules"
  ON constitution_rules FOR DELETE
  TO authenticated
  USING (false);

DROP POLICY IF EXISTS "deny_client_insert_audit_log" ON constitution_audit_log;
CREATE POLICY "deny_client_insert_audit_log"
  ON constitution_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_insert_template_bindings" ON template_bindings;
CREATE POLICY "deny_client_insert_template_bindings"
  ON template_bindings FOR INSERT
  TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_update_template_bindings" ON template_bindings;
CREATE POLICY "deny_client_update_template_bindings"
  ON template_bindings FOR UPDATE
  TO authenticated
  USING (false);
