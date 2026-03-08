-- Add verification_review_reason column to store AI/manual review explanation
ALTER TABLE service_providers
ADD COLUMN IF NOT EXISTS verification_review_reason TEXT;
