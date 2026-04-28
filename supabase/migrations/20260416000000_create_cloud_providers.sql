-- FR-143: Cloud Provider Management
-- Creates cloud_providers table with RLS policies and seed data

CREATE TABLE IF NOT EXISTS cloud_providers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'not_configured'
    CHECK (status IN ('connected', 'not_configured', 'error')),
  is_primary boolean DEFAULT false,
  region text,
  region_display text,
  resource_tier text CHECK (resource_tier IS NULL OR resource_tier IN ('basic', 'professional', 'enterprise')),
  vault_secret_id uuid,
  app_name text,
  last_deploy_at timestamptz,
  last_test_at timestamptz,
  error_message text,
  config_metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cloud_providers_is_primary ON cloud_providers (is_primary) WHERE is_primary = true;

-- RLS
ALTER TABLE cloud_providers ENABLE ROW LEVEL SECURITY;

-- SELECT: Admin users only
DROP POLICY IF EXISTS cloud_providers_select ON cloud_providers;
CREATE POLICY cloud_providers_select ON cloud_providers
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

-- INSERT: Admin users only
DROP POLICY IF EXISTS cloud_providers_insert ON cloud_providers;
CREATE POLICY cloud_providers_insert ON cloud_providers
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

-- UPDATE: Admin users only
DROP POLICY IF EXISTS cloud_providers_update ON cloud_providers;
CREATE POLICY cloud_providers_update ON cloud_providers
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

-- No DELETE policy — providers are never deleted

-- Seed data: four default providers
INSERT INTO cloud_providers (provider_name, display_name, status, is_primary, region, region_display, resource_tier, app_name)
VALUES
  ('digitalocean', 'DigitalOcean', 'connected', true, 'syd1', 'Sydney', 'professional', 'ownyourgig-platform'),
  ('aws', 'AWS', 'not_configured', false, NULL, NULL, NULL, NULL),
  ('azure', 'Azure', 'not_configured', false, NULL, NULL, NULL, NULL),
  ('gcloud', 'Google Cloud', 'not_configured', false, NULL, NULL, NULL, NULL)
ON CONFLICT (provider_name) DO NOTHING;

-- Updated_at trigger
CREATE OR REPLACE FUNCTION update_cloud_providers_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cloud_providers_updated_at ON cloud_providers;
CREATE TRIGGER cloud_providers_updated_at
  BEFORE UPDATE ON cloud_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_cloud_providers_updated_at();
