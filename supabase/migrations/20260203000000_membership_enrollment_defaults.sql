-- Add database-level defaults for membership_enrollments table
-- Same pattern applied to all other tables for Supabase client compatibility
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'membership_enrollments') THEN
    ALTER TABLE membership_enrollments
      ALTER COLUMN id SET DEFAULT gen_random_uuid(),
      ALTER COLUMN created_at SET DEFAULT now();
  END IF;
END $$;
