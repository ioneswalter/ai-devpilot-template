-- Enable PostGIS extension for geographic queries
-- This must be run before any geography columns are created

CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify extension is installed
SELECT PostGIS_version();
