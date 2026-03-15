-- Create GIST spatial indexes for efficient geographic queries
-- Wrapped in IF EXISTS checks so migrations work before Prisma tables are created

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_job_requests_location_gist') THEN
      CREATE INDEX idx_job_requests_location_gist ON job_requests USING GIST (location);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_job_requests_status_category') THEN
      CREATE INDEX idx_job_requests_status_category ON job_requests (status, service_category);
    END IF;
    ANALYZE job_requests;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'service_providers') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_service_providers_service_area_gist') THEN
      CREATE INDEX idx_service_providers_service_area_gist ON service_providers USING GIST (service_area);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_service_providers_active_category') THEN
      CREATE INDEX idx_service_providers_active_category ON service_providers (is_active, service_categories) WHERE is_active = true;
    END IF;
    ANALYZE service_providers;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customers_location_gist') THEN
      CREATE INDEX idx_customers_location_gist ON customers USING GIST (location);
    END IF;
    ANALYZE customers;
  END IF;
END $$;
