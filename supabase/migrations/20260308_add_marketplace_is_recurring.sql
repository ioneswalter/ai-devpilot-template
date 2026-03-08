-- Add is_recurring column to marketplace_posts
-- Recurring posts stay ACTIVE in the marketplace even after a deal is made
ALTER TABLE marketplace_posts ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;
