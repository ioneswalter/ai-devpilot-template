-- Add PostGIS geography columns for spatial queries
-- These columns are generated from lat/lng columns in the Prisma schema

-- Job Request locations (for matching providers)
ALTER TABLE job_requests
ADD COLUMN location geography(Point, 4326)
GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(location_lng, location_lat), 4326)) STORED;

-- Service Provider service areas (for radius matching)
ALTER TABLE service_providers
ADD COLUMN service_area geography(Point, 4326)
GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(service_area_lng, service_area_lat), 4326)) STORED;

-- Customer locations (for future features)
ALTER TABLE customers
ADD COLUMN location geography(Point, 4326)
GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(location_lng, location_lat), 4326)) STORED;

-- Add comments for documentation
COMMENT ON COLUMN job_requests.location IS 'PostGIS geography point generated from location_lat/location_lng';
COMMENT ON COLUMN service_providers.service_area IS 'PostGIS geography point generated from service_area_lat/service_area_lng';
COMMENT ON COLUMN customers.location IS 'PostGIS geography point generated from location_lat/location_lng';
