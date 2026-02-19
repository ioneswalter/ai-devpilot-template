-- FR-058: Public Bidding System - Create marketplace_bids table

CREATE TABLE IF NOT EXISTS marketplace_bids (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Post reference
  post_id UUID NOT NULL REFERENCES marketplace_posts(id) ON DELETE CASCADE,

  -- Bidder info (references auth.users directly)
  bidder_id UUID NOT NULL,
  bidder_type VARCHAR(20) NOT NULL CHECK (bidder_type IN ('customer', 'provider')),

  -- Bid details
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  message TEXT,

  -- Counter-bid threading
  parent_bid_id UUID REFERENCES marketplace_bids(id) ON DELETE SET NULL,
  thread_root_id UUID REFERENCES marketplace_bids(id) ON DELETE SET NULL,

  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn', 'expired')),

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_post_id ON marketplace_bids(post_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_bidder_id ON marketplace_bids(bidder_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_status ON marketplace_bids(status);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_thread_root ON marketplace_bids(thread_root_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_parent_bid ON marketplace_bids(parent_bid_id);
CREATE INDEX IF NOT EXISTS idx_marketplace_bids_created_at ON marketplace_bids(created_at DESC);

-- Enable RLS
ALTER TABLE marketplace_bids ENABLE ROW LEVEL SECURITY;

-- RLS Policies

-- Anyone can read bids (public marketplace - bids are visible to all)
DROP POLICY IF EXISTS "Public read access for bids" ON marketplace_bids;
CREATE POLICY "Public read access for bids" ON marketplace_bids
  FOR SELECT
  USING (true);

-- Authenticated users can create bids (bidder_id must match auth.uid())
DROP POLICY IF EXISTS "Authenticated users can create bids" ON marketplace_bids;
CREATE POLICY "Authenticated users can create bids" ON marketplace_bids
  FOR INSERT
  WITH CHECK (auth.uid() = bidder_id);

-- Bidders can update their own bids (for withdraw)
DROP POLICY IF EXISTS "Bidders can update own bids" ON marketplace_bids;
CREATE POLICY "Bidders can update own bids" ON marketplace_bids
  FOR UPDATE
  USING (auth.uid() = bidder_id);

-- Post owners can update bids on their posts (for accept/decline)
-- Customers who own customer_posts can update bids
DROP POLICY IF EXISTS "Customer post owners can update bids" ON marketplace_bids;
CREATE POLICY "Customer post owners can update bids" ON marketplace_bids
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_posts p
      WHERE p.id = marketplace_bids.post_id
      AND p.customer_id = auth.uid()::text
    )
  );

-- Providers who own provider_offers can update bids
DROP POLICY IF EXISTS "Provider post owners can update bids" ON marketplace_bids;
CREATE POLICY "Provider post owners can update bids" ON marketplace_bids
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM marketplace_posts p
      JOIN service_providers sp ON sp.id = p.provider_id
      WHERE p.id = marketplace_bids.post_id
      AND sp.user_id = auth.uid()::text
    )
  );

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_marketplace_bids_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_marketplace_bids_updated_at ON marketplace_bids;
CREATE TRIGGER trigger_marketplace_bids_updated_at
  BEFORE UPDATE ON marketplace_bids
  FOR EACH ROW
  EXECUTE FUNCTION update_marketplace_bids_updated_at();

-- Comment for documentation
COMMENT ON TABLE marketplace_bids IS 'FR-058: Public Bidding System - Stores bids on marketplace posts with counter-bid threading support';
COMMENT ON COLUMN marketplace_bids.bidder_type IS 'customer = bidding on provider_offer, provider = bidding on customer_post';
COMMENT ON COLUMN marketplace_bids.parent_bid_id IS 'For counter-bids: references the bid being countered';
COMMENT ON COLUMN marketplace_bids.thread_root_id IS 'For threading: all bids in a thread share the same root';
