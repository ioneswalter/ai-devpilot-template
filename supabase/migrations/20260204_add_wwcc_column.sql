-- Add working_with_children_check_url column to service_providers
-- FR-024: Identity Verification and Background Checks
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_providers') THEN
    ALTER TABLE service_providers
      ADD COLUMN IF NOT EXISTS working_with_children_check_url TEXT;
  END IF;
END $$;
