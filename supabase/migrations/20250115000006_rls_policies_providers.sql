-- RLS Policies for Service Providers table

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_providers') THEN

    -- Providers can read their own profile
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_providers' AND policyname = 'Providers read own profile') THEN
      CREATE POLICY "Providers read own profile"
      ON service_providers FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
    END IF;

    -- Providers can update their own profile
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_providers' AND policyname = 'Providers update own profile') THEN
      CREATE POLICY "Providers update own profile"
      ON service_providers FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
    END IF;

    -- Providers can insert their own profile (during onboarding)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_providers' AND policyname = 'Providers create own profile') THEN
      CREATE POLICY "Providers create own profile"
      ON service_providers FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
    END IF;

    -- Customers can read provider profiles (for public directory and bids)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'service_providers' AND policyname = 'Customers read provider profiles') THEN
      CREATE POLICY "Customers read provider profiles"
      ON service_providers FOR SELECT
      TO authenticated
      USING (
        is_active = true -- Only show active providers
        AND identity_verified = true -- Only show verified providers
      );
    END IF;

  END IF;
END $$;

-- Note: Sensitive fields like government_id_url, background_check_status
-- should be filtered at application level or use separate views
