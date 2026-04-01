-- Enable RLS on tables flagged by Supabase Security Advisor
-- Constitution principle #8: RLS on ALL tables (NON-NEGOTIABLE)

-- 1. ai_models — public read, admin-only write
ALTER TABLE public.ai_models ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY ai_models_read_all ON public.ai_models FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY ai_models_admin_write ON public.ai_models FOR ALL USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE user_id = auth.uid()::text)
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. _prisma_migrations — no public access (internal use only)
ALTER TABLE public._prisma_migrations ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY prisma_migrations_deny_all ON public._prisma_migrations FOR ALL USING (false);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. spatial_ref_sys — PostGIS extension-owned system table.
-- Cannot ALTER (owned by superuser/extension). This is a read-only reference table
-- with no user data. Acknowledged as safe in Security Advisor.
-- If you have superuser access, run: ALTER TABLE public.spatial_ref_sys ENABLE ROW LEVEL SECURITY;
