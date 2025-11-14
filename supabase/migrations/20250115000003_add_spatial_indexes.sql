-- Create GIST spatial indexes for efficient geographic queries
-- These indexes dramatically improve performance for radius searches

-- Index for job request locations
CREATE INDEX idx_job_requests_location_gist
ON job_requests USING GIST (location);

-- Index for service provider service areas
CREATE INDEX idx_service_providers_service_area_gist
ON service_providers USING GIST (service_area);

-- Index for customer locations
CREATE INDEX idx_customers_location_gist
ON customers USING GIST (location);

-- Additional indexes for common query patterns
CREATE INDEX idx_service_providers_active_category
ON service_providers (is_active, service_categories)
WHERE is_active = true;

CREATE INDEX idx_job_requests_status_category
ON job_requests (status, service_category);

-- Analyze tables to update statistics
ANALYZE job_requests;
ANALYZE service_providers;
ANALYZE customers;
