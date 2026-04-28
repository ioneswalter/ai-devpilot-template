-- FR-144: Third-Party Integrations Management
-- Creates integrations and integration_test_results tables

-- integrations table
CREATE TABLE IF NOT EXISTS integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_name text NOT NULL,
  service_type text NOT NULL CHECK (service_type IN ('supabase','stripe','github','twilio','godaddy','custom')),
  is_built_in boolean NOT NULL DEFAULT true,
  status text NOT NULL DEFAULT 'not_configured' CHECK (status IN ('connected','not_configured','expired','error')),
  credentials jsonb,
  config jsonb DEFAULT '{}',
  metadata jsonb DEFAULT '{}',
  last_verified_at timestamptz,
  expires_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integrations_service_type ON integrations(service_type);
CREATE INDEX IF NOT EXISTS idx_integrations_status ON integrations(status);

-- integration_test_results table
CREATE TABLE IF NOT EXISTS integration_test_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  integration_id uuid NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  success boolean NOT NULL,
  response_time_ms integer,
  status_code integer,
  error_message text,
  tested_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_integration_test_results_integration_id ON integration_test_results(integration_id);
CREATE INDEX IF NOT EXISTS idx_integration_test_results_created_at ON integration_test_results(created_at DESC);

-- Enable RLS
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_test_results ENABLE ROW LEVEL SECURITY;

-- RLS policies for integrations (admin-only via admin_users table)
-- admin_users.user_id is text, auth.uid() returns uuid — cast to match
CREATE POLICY integrations_select ON integrations
  FOR SELECT USING (auth.uid()::text IN (SELECT user_id FROM admin_users));

CREATE POLICY integrations_insert ON integrations
  FOR INSERT WITH CHECK (auth.uid()::text IN (SELECT user_id FROM admin_users));

CREATE POLICY integrations_update ON integrations
  FOR UPDATE USING (auth.uid()::text IN (SELECT user_id FROM admin_users));

CREATE POLICY integrations_delete ON integrations
  FOR DELETE USING (auth.uid()::text IN (SELECT user_id FROM admin_users));

-- RLS policies for integration_test_results (admin-only)
CREATE POLICY integration_test_results_select ON integration_test_results
  FOR SELECT USING (auth.uid()::text IN (SELECT user_id FROM admin_users));

CREATE POLICY integration_test_results_insert ON integration_test_results
  FOR INSERT WITH CHECK (auth.uid()::text IN (SELECT user_id FROM admin_users));

-- Seed built-in integrations
INSERT INTO integrations (service_name, service_type, is_built_in, status)
VALUES
  ('Supabase', 'supabase', true, 'not_configured'),
  ('Stripe', 'stripe', true, 'not_configured'),
  ('GitHub', 'github', true, 'not_configured'),
  ('Twilio', 'twilio', true, 'not_configured'),
  ('GoDaddy', 'godaddy', true, 'not_configured')
ON CONFLICT DO NOTHING;
