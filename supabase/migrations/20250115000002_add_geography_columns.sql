-- Add PostGIS geography columns for spatial queries
-- These columns are generated from lat/lng columns in the Prisma schema
-- Wrapped in IF EXISTS checks so migrations work before Prisma tables are created

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'job_requests') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'job_requests' AND column_name = 'location') THEN
      ALTER TABLE job_requests
      ADD COLUMN location geography(Point, 4326)
      GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(location_lng, location_lat), 4326)) STORED;
      COMMENT ON COLUMN job_requests.location IS 'PostGIS geography point generated from location_lat/location_lng';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'service_providers') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'service_providers' AND column_name = 'service_area') THEN
      ALTER TABLE service_providers
      ADD COLUMN service_area geography(Point, 4326)
      GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(service_area_lng, service_area_lat), 4326)) STORED;
      COMMENT ON COLUMN service_providers.service_area IS 'PostGIS geography point generated from service_area_lat/service_area_lng';
    END IF;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customers') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'location') THEN
      ALTER TABLE customers
      ADD COLUMN location geography(Point, 4326)
      GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(location_lng, location_lat), 4326)) STORED;
      COMMENT ON COLUMN customers.location IS 'PostGIS geography point generated from location_lat/location_lng';
    END IF;
  END IF;
END $$;
