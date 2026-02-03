-- Add database-level defaults for membership_enrollments table
-- Same pattern applied to all other tables for Supabase client compatibility

ALTER TABLE membership_enrollments
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN created_at SET DEFAULT now();
