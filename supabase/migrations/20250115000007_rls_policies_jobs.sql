-- RLS Policies for Job Requests and related tables

-- ============================================================================
-- JOB REQUESTS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_requests') THEN

    -- Customers can read their own job requests
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_requests' AND policyname = 'Customers read own jobs') THEN
      CREATE POLICY "Customers read own jobs"
      ON job_requests FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM customers
          WHERE customers.user_id = auth.uid()
          AND customers.id = job_requests.customer_id
        )
      );
    END IF;

    -- Customers can create job requests
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_requests' AND policyname = 'Customers create jobs') THEN
      CREATE POLICY "Customers create jobs"
      ON job_requests FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM customers
          WHERE customers.user_id = auth.uid()
          AND customers.id = job_requests.customer_id
        )
      );
    END IF;

    -- Customers can update their own job requests (before bid accepted)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_requests' AND policyname = 'Customers update own jobs') THEN
      CREATE POLICY "Customers update own jobs"
      ON job_requests FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM customers
          WHERE customers.user_id = auth.uid()
          AND customers.id = job_requests.customer_id
        )
        AND status IN ('POSTED', 'WAITING_BIDS')
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM customers
          WHERE customers.user_id = auth.uid()
          AND customers.id = job_requests.customer_id
        )
      );
    END IF;

    -- Providers can read jobs they're matched to
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_requests' AND policyname = 'Providers read matched jobs') THEN
      CREATE POLICY "Providers read matched jobs"
      ON job_requests FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM job_matches jm
          INNER JOIN service_providers sp ON sp.id = jm.provider_id
          WHERE sp.user_id = auth.uid()
          AND jm.job_id = job_requests.id
        )
      );
    END IF;

  END IF;
END $$;

-- ============================================================================
-- JOB MATCHES
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_matches') THEN

    -- Providers can read their own job matches
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_matches' AND policyname = 'Providers read own matches') THEN
      CREATE POLICY "Providers read own matches"
      ON job_matches FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = job_matches.provider_id
        )
      );
    END IF;

    -- Providers can update their own job matches (mark as viewed, pass on job)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_matches' AND policyname = 'Providers update own matches') THEN
      CREATE POLICY "Providers update own matches"
      ON job_matches FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = job_matches.provider_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = job_matches.provider_id
        )
      );
    END IF;

  END IF;
END $$;

-- ============================================================================
-- BIDS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bids') THEN

    -- Providers can read their own bids
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bids' AND policyname = 'Providers read own bids') THEN
      CREATE POLICY "Providers read own bids"
      ON bids FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = bids.provider_id
        )
      );
    END IF;

    -- Providers can create bids for matched jobs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bids' AND policyname = 'Providers create bids') THEN
      CREATE POLICY "Providers create bids"
      ON bids FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM service_providers sp
          INNER JOIN job_matches jm ON jm.provider_id = sp.id
          WHERE sp.user_id = auth.uid()
          AND jm.job_id = bids.job_id
          AND sp.id = bids.provider_id
        )
      );
    END IF;

    -- Customers can read bids for their jobs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bids' AND policyname = 'Customers read bids for own jobs') THEN
      CREATE POLICY "Customers read bids for own jobs"
      ON bids FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM job_requests jr
          INNER JOIN customers c ON c.id = jr.customer_id
          WHERE c.user_id = auth.uid()
          AND jr.id = bids.job_id
        )
      );
    END IF;

  END IF;
END $$;

-- ============================================================================
-- BID MESSAGES
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'bid_messages') THEN

    -- Users can read messages for bids they're involved in
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bid_messages' AND policyname = 'Users read own bid messages') THEN
      CREATE POLICY "Users read own bid messages"
      ON bid_messages FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM bids b
          INNER JOIN job_requests jr ON jr.id = b.job_id
          INNER JOIN customers c ON c.id = jr.customer_id
          WHERE b.id = bid_messages.bid_id
          AND (c.user_id = auth.uid() OR b.provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
          ))
        )
      );
    END IF;

    -- Users can create messages for bids they're involved in
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bid_messages' AND policyname = 'Users create bid messages') THEN
      CREATE POLICY "Users create bid messages"
      ON bid_messages FOR INSERT
      TO authenticated
      WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM bids b
          INNER JOIN job_requests jr ON jr.id = b.job_id
          INNER JOIN customers c ON c.id = jr.customer_id
          WHERE b.id = bid_messages.bid_id
          AND (c.user_id = auth.uid() OR b.provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
          ))
        )
      );
    END IF;

  END IF;
END $$;
