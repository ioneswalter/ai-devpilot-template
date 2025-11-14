-- RLS Policies for Payments and related tables

-- ============================================================================
-- ESCROW PAYMENTS
-- ============================================================================

-- Customers can read their own escrow payments
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

-- Providers can read their own escrow payments
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

-- ============================================================================
-- MEMBERSHIP ENROLLMENTS
-- ============================================================================

-- Providers can read their own membership enrollment
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

-- ============================================================================
-- REVIEWS
-- ============================================================================

-- Users can read reviews where they are the reviewee
CREATE POLICY "Users read reviews about them"
ON reviews FOR SELECT
TO authenticated
USING (
  reviewee_id = auth.uid()
  AND is_published = true
);

-- Users can read reviews they wrote
CREATE POLICY "Users read own reviews"
ON reviews FOR SELECT
TO authenticated
USING (
  reviewer_id = auth.uid()
);

-- Customers can read reviews for providers they're considering
CREATE POLICY "Customers read provider reviews"
ON reviews FOR SELECT
TO authenticated
USING (
  is_published = true
  AND reviewee_id IN (
    SELECT user_id FROM service_providers WHERE is_active = true
  )
);

-- Users can create reviews for completed jobs they were involved in
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

-- ============================================================================
-- MEDIATION CASES
-- ============================================================================

-- Customers can read their own mediation cases
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

-- Providers can read their own mediation cases
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

-- Customers can create mediation cases for their jobs
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

-- Users can update their own mediation cases (add evidence)
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

-- ============================================================================
-- NOTIFICATIONS
-- ============================================================================

-- Users can read their own notifications
CREATE POLICY "Users read own notifications"
ON notifications FOR SELECT
TO authenticated
USING (
  recipient_id = auth.uid()
);

-- Users can update their own notifications (mark as read)
CREATE POLICY "Users update own notifications"
ON notifications FOR UPDATE
TO authenticated
USING (
  recipient_id = auth.uid()
)
WITH CHECK (
  recipient_id = auth.uid()
);
