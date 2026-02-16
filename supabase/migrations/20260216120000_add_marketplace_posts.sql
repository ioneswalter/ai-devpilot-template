-- FR-054: Marketplace Gallery - Create marketplace_posts table

CREATE TABLE IF NOT EXISTS marketplace_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_type VARCHAR(50) NOT NULL CHECK (post_type IN ('customer_post', 'provider_offer')),

  -- Author
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES service_providers(id) ON DELETE CASCADE,

  -- Content
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  service_category VARCHAR(100) NOT NULL,
  photo_urls TEXT[] DEFAULT '{}',

  -- Location
  location_address VARCHAR(255) NOT NULL,
  location_lat DOUBLE PRECISION NOT NULL,
  location_lng DOUBLE PRECISION NOT NULL,
  service_radius_km INTEGER DEFAULT 50,

  -- Pricing
  price_type VARCHAR(20) DEFAULT 'QUOTE' CHECK (price_type IN ('FIXED', 'HOURLY', 'QUOTE', 'RANGE')),
  price_min INTEGER,
  price_max INTEGER,
  price_description VARCHAR(255),

  -- Availability
  available_from TIMESTAMP WITH TIME ZONE,
  available_to TIMESTAMP WITH TIME ZONE,

  -- Service checklist
  service_checklist JSONB,

  -- Status
  status VARCHAR(20) DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'PAUSED', 'DEAL_PENDING', 'COMPLETED', 'EXPIRED')),
  bid_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expires_at TIMESTAMP WITH TIME ZONE,

  -- Constraints
  CONSTRAINT valid_author CHECK (
    (post_type = 'customer_post' AND customer_id IS NOT NULL AND provider_id IS NULL) OR
    (post_type = 'provider_offer' AND provider_id IS NOT NULL AND customer_id IS NULL)
  )
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_marketplace_posts_post_type ON marketplace_posts(post_type);
CREATE INDEX IF NOT EXISTS idx_marketplace_posts_service_category ON marketplace_posts(service_category);
CREATE INDEX IF NOT EXISTS idx_marketplace_posts_status ON marketplace_posts(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_posts_customer_id ON marketplace_posts(customer_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_posts_provider_id ON marketplace_posts(provider_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_posts_created_at ON marketplace_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_marketplace_posts_location ON marketplace_posts(location_lat, location_lng);

-- Enable RLS
ALTER TABLE marketplace_posts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Anyone can read active posts (public marketplace)
DROP POLICY IF EXISTS "Public read access" ON marketplace_posts;
CREATE POLICY "Public read access" ON marketplace_posts
  FOR SELECT
  USING (status = 'ACTIVE');

-- Authors can manage their own posts
DROP POLICY IF EXISTS "Customers can manage own posts" ON marketplace_posts;
CREATE POLICY "Customers can manage own posts" ON marketplace_posts
  FOR ALL
  USING (auth.uid() = customer_id);

DROP POLICY IF EXISTS "Providers can manage own posts" ON marketplace_posts;
CREATE POLICY "Providers can manage own posts" ON marketplace_posts
  FOR ALL
  USING (
    provider_id IN (
      SELECT id FROM service_providers WHERE user_id = auth.uid()
    )
  );

-- Comment for documentation
COMMENT ON TABLE marketplace_posts IS 'FR-054: Unified table for Customer Posts (job requests) and Provider Offers (service ads) in the Marketplace Gallery';
