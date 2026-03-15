-- Add verification_review_reason column to store AI/manual review explanation
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_providers') THEN
    ALTER TABLE service_providers
    ADD COLUMN IF NOT EXISTS verification_review_reason TEXT;
  END IF;
END $$;
