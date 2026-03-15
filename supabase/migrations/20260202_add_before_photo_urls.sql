-- Add before_photo_urls column to job_executions for FR-013
-- Separates "before" photos (taken at job start) from progress and completion photos
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_executions') THEN
    ALTER TABLE job_executions
    ADD COLUMN IF NOT EXISTS before_photo_urls TEXT[] DEFAULT '{}';
  END IF;
END $$;
