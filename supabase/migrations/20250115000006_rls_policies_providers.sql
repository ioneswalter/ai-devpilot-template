-- RLS Policies for Service Providers table

-- Providers can read their own profile
CREATE POLICY "Providers read own profile"
ON service_providers FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Providers can update their own profile
CREATE POLICY "Providers update own profile"
ON service_providers FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Providers can insert their own profile (during onboarding)
CREATE POLICY "Providers create own profile"
ON service_providers FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Customers can read provider profiles (for public directory and bids)
CREATE POLICY "Customers read provider profiles"
ON service_providers FOR SELECT
TO authenticated
USING (
  is_active = true -- Only show active providers
  AND identity_verified = true -- Only show verified providers
);

-- Note: Sensitive fields like government_id_url, background_check_status
-- should be filtered at application level or use separate views
