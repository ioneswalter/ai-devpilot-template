-- RLS Policies for Job Requests and related tables

-- ============================================================================
-- JOB REQUESTS
-- ============================================================================

-- Customers can read their own job requests
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

-- Customers can create job requests
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

-- Customers can update their own job requests (before bid accepted)
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

-- Providers can read jobs they're matched to
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

-- ============================================================================
-- JOB MATCHES
-- ============================================================================

-- Providers can read their own job matches
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

-- Providers can update their own job matches (mark as viewed, pass on job)
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

-- ============================================================================
-- BIDS
-- ============================================================================

-- Providers can read their own bids
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

-- Providers can create bids for matched jobs
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

-- Customers can read bids for their jobs
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

-- ============================================================================
-- BID MESSAGES
-- ============================================================================

-- Users can read messages for bids they're involved in
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

-- Users can create messages for bids they're involved in
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
