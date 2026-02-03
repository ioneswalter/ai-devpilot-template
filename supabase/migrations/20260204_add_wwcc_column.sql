-- Add working_with_children_check_url column to service_providers
-- FR-024: Identity Verification and Background Checks

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS working_with_children_check_url TEXT;
