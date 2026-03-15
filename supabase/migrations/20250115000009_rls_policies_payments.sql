-- RLS Policies for Payments and related tables

-- ============================================================================
-- ESCROW PAYMENTS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'escrow_payments') THEN

    -- Customers can read their own escrow payments
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'escrow_payments' AND policyname = 'Customers read own escrow payments') THEN
      CREATE POLICY "Customers read own escrow payments"
      ON escrow_payments FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM customers
          WHERE customers.user_id = auth.uid()
          AND customers.id = escrow_payments.customer_id
        )
      );
    END IF;

    -- Providers can read their own escrow payments
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'escrow_payments' AND policyname = 'Providers read own escrow payments') THEN
      CREATE POLICY "Providers read own escrow payments"
      ON escrow_payments FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = escrow_payments.provider_id
        )
      );
    END IF;

  END IF;
END $$;

-- ============================================================================
-- MEMBERSHIP ENROLLMENTS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'membership_enrollments') THEN

    -- Providers can read their own membership enrollment
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'membership_enrollments' AND policyname = 'Providers read own enrollment') THEN
      CREATE POLICY "Providers read own enrollment"
      ON membership_enrollments FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = membership_enrollments.provider_id
        )
      );
    END IF;

  END IF;
END $$;

-- ============================================================================
-- REVIEWS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') THEN

    -- Users can read reviews where they are the reviewee
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'Users read reviews about them') THEN
      CREATE POLICY "Users read reviews about them"
      ON reviews FOR SELECT
      TO authenticated
      USING (
        reviewee_id = auth.uid()
        AND is_published = true
      );
    END IF;

    -- Users can read reviews they wrote
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'Users read own reviews') THEN
      CREATE POLICY "Users read own reviews"
      ON reviews FOR SELECT
      TO authenticated
      USING (
        reviewer_id = auth.uid()
      );
    END IF;

    -- Customers can read reviews for providers they're considering
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'Customers read provider reviews') THEN
      CREATE POLICY "Customers read provider reviews"
      ON reviews FOR SELECT
      TO authenticated
      USING (
        is_published = true
        AND reviewee_id IN (
          SELECT user_id FROM service_providers WHERE is_active = true
        )
      );
    END IF;

    -- Users can create reviews for completed jobs they were involved in
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'reviews' AND policyname = 'Users create reviews') THEN
      CREATE POLICY "Users create reviews"
      ON reviews FOR INSERT
      TO authenticated
      WITH CHECK (
        reviewer_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM job_executions je
          WHERE je.job_id = reviews.job_id
          AND je.status = 'CONFIRMED_COMPLETE'
          AND (
            je.provider_id IN (SELECT id FROM service_providers WHERE user_id = auth.uid())
            OR je.job_id IN (
              SELECT id FROM job_requests jr
              INNER JOIN customers c ON c.id = jr.customer_id
              WHERE c.user_id = auth.uid()
            )
          )
        )
      );
    END IF;

  END IF;
END $$;

-- ============================================================================
-- MEDIATION CASES
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'mediation_cases') THEN

    -- Customers can read their own mediation cases
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mediation_cases' AND policyname = 'Customers read own mediation cases') THEN
      CREATE POLICY "Customers read own mediation cases"
      ON mediation_cases FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM customers
          WHERE customers.user_id = auth.uid()
          AND customers.id = mediation_cases.customer_id
        )
      );
    END IF;

    -- Providers can read their own mediation cases
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mediation_cases' AND policyname = 'Providers read own mediation cases') THEN
      CREATE POLICY "Providers read own mediation cases"
      ON mediation_cases FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = mediation_cases.provider_id
        )
      );
    END IF;

    -- Customers can create mediation cases for their jobs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mediation_cases' AND policyname = 'Customers create mediation cases') THEN
      CREATE POLICY "Customers create mediation cases"
      ON mediation_cases FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM customers
          WHERE customers.user_id = auth.uid()
          AND customers.id = mediation_cases.customer_id
        )
      );
    END IF;

    -- Users can update their own mediation cases (add evidence)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mediation_cases' AND policyname = 'Users update own mediation cases') THEN
      CREATE POLICY "Users update own mediation cases"
      ON mediation_cases FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM customers
          WHERE customers.user_id = auth.uid()
          AND customers.id = mediation_cases.customer_id
        )
        OR EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = mediation_cases.provider_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM customers
          WHERE customers.user_id = auth.uid()
          AND customers.id = mediation_cases.customer_id
        )
        OR EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = mediation_cases.provider_id
        )
      );
    END IF;

  END IF;
END $$;

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'notifications') THEN

    -- Users can read their own notifications
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users read own notifications') THEN
      CREATE POLICY "Users read own notifications"
      ON notifications FOR SELECT
      TO authenticated
      USING (
        recipient_id = auth.uid()
      );
    END IF;

    -- Users can update their own notifications (mark as read)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'notifications' AND policyname = 'Users update own notifications') THEN
      CREATE POLICY "Users update own notifications"
      ON notifications FOR UPDATE
      TO authenticated
      USING (
        recipient_id = auth.uid()
      )
      WITH CHECK (
        recipient_id = auth.uid()
      );
    END IF;

  END IF;
END $$;
