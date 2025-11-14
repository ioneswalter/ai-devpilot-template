-- RLS Policies for Job Execution and related tables

-- ============================================================================
-- JOB EXECUTIONS
-- ============================================================================

-- Providers can read their own job executions
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

-- Providers can update their own job executions
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

-- Customers can read executions for their jobs
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

-- Customers can update execution status (confirm completion)
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

-- ============================================================================
-- EXECUTION MESSAGES
-- ============================================================================

-- Users can read messages for executions they're involved in
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

-- Users can create messages for executions they're involved in
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
