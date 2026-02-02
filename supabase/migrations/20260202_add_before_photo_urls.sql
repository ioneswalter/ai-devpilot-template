-- Add before_photo_urls column to job_executions for FR-013
-- Separates "before" photos (taken at job start) from progress and completion photos
ALTER TABLE job_executions
ADD COLUMN IF NOT EXISTS before_photo_urls TEXT[] DEFAULT '{}';
