-- Add last_active_at to customers and service_providers
-- Used by admin dashboard to show online presence (green dot if < 5 min ago)

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

ALTER TABLE service_providers
  ADD COLUMN IF NOT EXISTS last_active_at TIMESTAMPTZ;

-- Indexes for efficient "who is online?" queries
CREATE INDEX IF NOT EXISTS idx_customers_last_active_at
  ON customers (last_active_at DESC);

CREATE INDEX IF NOT EXISTS idx_service_providers_last_active_at
  ON service_providers (last_active_at DESC);
