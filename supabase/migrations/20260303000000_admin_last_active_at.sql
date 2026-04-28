-- Add last_active_at to customers and service_providers
-- Used by admin dashboard to show online presence (green dot if < 5 min ago)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'customers') THEN
    ALTER TABLE customers
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_customers_last_active_at
      ON customers (last_active_at DESC);
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'service_providers') THEN
    ALTER TABLE service_providers
      ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

    CREATE INDEX IF NOT EXISTS idx_service_providers_last_active_at
      ON service_providers (last_active_at DESC);
  END IF;
END $$;
