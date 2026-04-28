-- Add is_recurring column to marketplace_posts
-- Recurring posts stay ACTIVE in the marketplace even after a deal is made
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'marketplace_posts') THEN
    ALTER TABLE marketplace_posts ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN NOT NULL DEFAULT false;
  END IF;
END $$;
