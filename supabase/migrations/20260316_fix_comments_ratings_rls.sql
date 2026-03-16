-- Fix: Add service role bypass policies for feature_comments and feature_ratings
-- These tables had RLS enabled but no service_role policy, causing 500 errors
-- when edge functions (which use service_role key) tried to read/write them.

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feature_comments' AND policyname = 'Service role full access to feature_comments') THEN
    CREATE POLICY "Service role full access to feature_comments" ON feature_comments FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'feature_ratings' AND policyname = 'Service role full access to feature_ratings') THEN
    CREATE POLICY "Service role full access to feature_ratings" ON feature_ratings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Fix: Add database-level defaults for id and updated_at columns
-- Prisma's @default(uuid()) and @updatedAt only work at the Prisma client level.
-- Edge functions use the Supabase JS client, which bypasses Prisma, so these
-- columns need database-level defaults to avoid NOT NULL violations on insert.

ALTER TABLE feature_comments ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE feature_comments ALTER COLUMN updated_at SET DEFAULT now();

ALTER TABLE feature_ratings ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE feature_ratings ALTER COLUMN updated_at SET DEFAULT now();
