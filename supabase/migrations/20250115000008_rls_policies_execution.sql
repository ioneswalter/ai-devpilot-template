-- RLS Policies for Job Execution and related tables

-- ============================================================================
-- JOB EXECUTIONS
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'job_executions') THEN

    -- Providers can read their own job executions
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_executions' AND policyname = 'Providers read own executions') THEN
      CREATE POLICY "Providers read own executions"
      ON job_executions FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = job_executions.provider_id
        )
      );
    END IF;

    -- Providers can update their own job executions
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_executions' AND policyname = 'Providers update own executions') THEN
      CREATE POLICY "Providers update own executions"
      ON job_executions FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = job_executions.provider_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM service_providers
          WHERE service_providers.user_id = auth.uid()
          AND service_providers.id = job_executions.provider_id
        )
      );
    END IF;

    -- Customers can read executions for their jobs
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_executions' AND policyname = 'Customers read own job executions') THEN
      CREATE POLICY "Customers read own job executions"
      ON job_executions FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM job_requests jr
          INNER JOIN customers c ON c.id = jr.customer_id
          WHERE c.user_id = auth.uid()
          AND jr.id = job_executions.job_id
        )
      );
    END IF;

    -- Customers can update execution status (confirm completion)
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_executions' AND policyname = 'Customers update job execution status') THEN
      CREATE POLICY "Customers update job execution status"
      ON job_executions FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM job_requests jr
          INNER JOIN customers c ON c.id = jr.customer_id
          WHERE c.user_id = auth.uid()
          AND jr.id = job_executions.job_id
        )
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM job_requests jr
          INNER JOIN customers c ON c.id = jr.customer_id
          WHERE c.user_id = auth.uid()
          AND jr.id = job_executions.job_id
        )
      );
    END IF;

  END IF;
END $$;

-- ============================================================================
-- EXECUTION MESSAGES
-- ============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'execution_messages') THEN

    -- Users can read messages for executions they're involved in
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'execution_messages' AND policyname = 'Users read own execution messages') THEN
      CREATE POLICY "Users read own execution messages"
      ON execution_messages FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM job_executions je
          INNER JOIN job_requests jr ON jr.id = je.job_id
          INNER JOIN customers c ON c.id = jr.customer_id
          WHERE je.id = execution_messages.execution_id
          AND (c.user_id = auth.uid() OR je.provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
          ))
        )
      );
    END IF;

    -- Users can create messages for executions they're involved in
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'execution_messages' AND policyname = 'Users create execution messages') THEN
      CREATE POLICY "Users create execution messages"
      ON execution_messages FOR INSERT
      TO authenticated
      WITH CHECK (
        sender_id = auth.uid()
        AND EXISTS (
          SELECT 1 FROM job_executions je
          INNER JOIN job_requests jr ON jr.id = je.job_id
          INNER JOIN customers c ON c.id = jr.customer_id
          WHERE je.id = execution_messages.execution_id
          AND (c.user_id = auth.uid() OR je.provider_id IN (
            SELECT id FROM service_providers WHERE user_id = auth.uid()
          ))
        )
      );
    END IF;

  END IF;
END $$;
