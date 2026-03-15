-- RLS Policies for Customers table

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN

    -- Customers can read their own profile
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Customers read own profile') THEN
      CREATE POLICY "Customers read own profile"
      ON customers FOR SELECT
      TO authenticated
      USING (auth.uid() = user_id);
    END IF;

    -- Customers can update their own profile
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Customers update own profile') THEN
      CREATE POLICY "Customers update own profile"
      ON customers FOR UPDATE
      TO authenticated
      USING (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
    END IF;

    -- Customers can insert their own profile (during registration)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Customers create own profile') THEN
      CREATE POLICY "Customers create own profile"
      ON customers FOR INSERT
      TO authenticated
      WITH CHECK (auth.uid() = user_id);
    END IF;

    -- Service providers can read customer profiles for jobs they're matched to
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'customers' AND policyname = 'Providers read matched customer profiles') THEN
      CREATE POLICY "Providers read matched customer profiles"
      ON customers FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM job_matches jm
          INNER JOIN service_providers sp ON sp.id = jm.provider_id
          INNER JOIN job_requests jr ON jr.id = jm.job_id
          WHERE sp.user_id = auth.uid()
          AND jr.customer_id = customers.id
        )
      );
    END IF;

  END IF;
END $$;
