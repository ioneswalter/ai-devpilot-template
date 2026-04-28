-- FR-091: Spec Review and Approval Workflow
-- Creates spec_reviews and review_items tables with RLS policies

-- Enable RLS on spec_reviews
ALTER TABLE IF EXISTS spec_reviews ENABLE ROW LEVEL SECURITY;

-- Enable RLS on review_items
ALTER TABLE IF EXISTS review_items ENABLE ROW LEVEL SECURITY;

-- spec_reviews: Admin-only access
DROP POLICY IF EXISTS "Admin can read spec reviews" ON spec_reviews;
CREATE POLICY "Admin can read spec reviews"
  ON spec_reviews FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Admin can insert spec reviews" ON spec_reviews;
CREATE POLICY "Admin can insert spec reviews"
  ON spec_reviews FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Admin can update spec reviews" ON spec_reviews;
CREATE POLICY "Admin can update spec reviews"
  ON spec_reviews FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

-- review_items: Admin-only access
DROP POLICY IF EXISTS "Admin can read review items" ON review_items;
CREATE POLICY "Admin can read review items"
  ON review_items FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Admin can insert review items" ON review_items;
CREATE POLICY "Admin can insert review items"
  ON review_items FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

DROP POLICY IF EXISTS "Admin can update review items" ON review_items;
CREATE POLICY "Admin can update review items"
  ON review_items FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM admin_users WHERE admin_users.user_id = auth.uid()::text)
  );

-- Service role bypass (for Edge Functions)
DROP POLICY IF EXISTS "Service role full access spec reviews" ON spec_reviews;
CREATE POLICY "Service role full access spec reviews"
  ON spec_reviews FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Service role full access review items" ON review_items;
CREATE POLICY "Service role full access review items"
  ON review_items FOR ALL
  USING (auth.role() = 'service_role');
