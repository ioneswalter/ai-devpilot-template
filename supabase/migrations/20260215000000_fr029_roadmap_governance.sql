-- FR-029: Roadmap Governance
-- Adds tables for comments, ratings, and admin users

-- Feature Comments table (for comments and replies on features)
CREATE TABLE IF NOT EXISTS feature_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT NOT NULL,  -- References product_features.id (TEXT type)
  user_id UUID NOT NULL,
  parent_id UUID REFERENCES feature_comments(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_name VARCHAR(255),
  author_email VARCHAR(255),
  is_deleted BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_comments_feature_id ON feature_comments(feature_id);
CREATE INDEX IF NOT EXISTS idx_feature_comments_user_id ON feature_comments(user_id);
CREATE INDEX IF NOT EXISTS idx_feature_comments_parent_id ON feature_comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_feature_comments_created_at ON feature_comments(created_at DESC);

-- Feature Ratings table (1-5 star ratings)
CREATE TABLE IF NOT EXISTS feature_ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_id TEXT NOT NULL,  -- References product_features.id (TEXT type)
  user_id UUID NOT NULL,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(feature_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_feature_ratings_feature_id ON feature_ratings(feature_id);
CREATE INDEX IF NOT EXISTS idx_feature_ratings_user_id ON feature_ratings(user_id);

-- Admin Users table
CREATE TABLE IF NOT EXISTS admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,  -- May be null initially, set when user first logs in
  email VARCHAR(255) UNIQUE NOT NULL,
  role VARCHAR(50) DEFAULT 'admin',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);
CREATE INDEX IF NOT EXISTS idx_admin_users_user_id ON admin_users(user_id);

-- Add initial admin user (Iones)
INSERT INTO admin_users (email, role)
VALUES ('ioneswalter@gmail.com', 'super_admin')
ON CONFLICT (email) DO UPDATE SET role = 'super_admin';

-- Enable RLS on new tables
ALTER TABLE feature_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;

-- RLS Policies for feature_comments
-- Anyone can read non-deleted comments
DROP POLICY IF EXISTS "Anyone can read comments" ON feature_comments;
CREATE POLICY "Anyone can read comments" ON feature_comments
  FOR SELECT USING (is_deleted = false);

-- Authenticated users can insert their own comments
DROP POLICY IF EXISTS "Authenticated users can insert comments" ON feature_comments;
CREATE POLICY "Authenticated users can insert comments" ON feature_comments
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Users can update their own comments
DROP POLICY IF EXISTS "Users can update own comments" ON feature_comments;
CREATE POLICY "Users can update own comments" ON feature_comments
  FOR UPDATE USING (auth.uid() = user_id);

-- Users can soft-delete their own comments
DROP POLICY IF EXISTS "Users can delete own comments" ON feature_comments;
CREATE POLICY "Users can delete own comments" ON feature_comments
  FOR DELETE USING (auth.uid() = user_id);

-- RLS Policies for feature_ratings
-- Anyone can read ratings
DROP POLICY IF EXISTS "Anyone can read ratings" ON feature_ratings;
CREATE POLICY "Anyone can read ratings" ON feature_ratings
  FOR SELECT USING (true);

-- Authenticated users can insert/update their own ratings
DROP POLICY IF EXISTS "Authenticated users can manage their ratings" ON feature_ratings;
CREATE POLICY "Authenticated users can manage their ratings" ON feature_ratings
  FOR ALL USING (auth.uid() = user_id);

-- RLS Policies for admin_users
-- Anyone can read admin_users (to check if someone is admin)
DROP POLICY IF EXISTS "Anyone can read admin_users" ON admin_users;
CREATE POLICY "Anyone can read admin_users" ON admin_users
  FOR SELECT USING (true);

-- Add average_rating column to product_features for caching
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'product_features') THEN
    ALTER TABLE product_features ADD COLUMN IF NOT EXISTS average_rating DECIMAL(3,2);
    ALTER TABLE product_features ADD COLUMN IF NOT EXISTS rating_count INTEGER DEFAULT 0;
  END IF;
END $$;
