-- RLS Policies for Customers table

-- Customers can read their own profile
CREATE POLICY "Customers read own profile"
ON customers FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Customers can update their own profile
CREATE POLICY "Customers update own profile"
ON customers FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Customers can insert their own profile (during registration)
CREATE POLICY "Customers create own profile"
ON customers FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Service providers can read customer profiles for jobs they're matched to
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
