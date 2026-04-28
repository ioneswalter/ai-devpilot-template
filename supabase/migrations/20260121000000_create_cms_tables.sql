-- CMS Tables Migration
-- Creates tables for content management system
-- Run this in Supabase SQL Editor

-- ============================================================================
-- CMS TABLES
-- ============================================================================

-- CMS Page: Represents a page with editable content
CREATE TABLE IF NOT EXISTS cms_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(255) UNIQUE NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_pages_slug ON cms_pages(slug);
CREATE INDEX IF NOT EXISTS idx_cms_pages_is_active ON cms_pages(is_active);

-- CMS Section: A distinct section within a page
CREATE TABLE IF NOT EXISTS cms_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id UUID NOT NULL REFERENCES cms_pages(id) ON DELETE CASCADE,
  section_key VARCHAR(255) NOT NULL,
  title VARCHAR(500),
  subtitle VARCHAR(500),
  "order" INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(page_id, section_key)
);

CREATE INDEX IF NOT EXISTS idx_cms_sections_page_id ON cms_sections(page_id);
CREATE INDEX IF NOT EXISTS idx_cms_sections_order ON cms_sections("order");

-- CMS Content Block: Individual content items within sections
CREATE TABLE IF NOT EXISTS cms_content_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES cms_sections(id) ON DELETE CASCADE,
  content_key VARCHAR(255) NOT NULL,
  content_type VARCHAR(50) NOT NULL, -- 'text', 'rich_text', 'image', 'link', 'list', 'json'
  text_value TEXT,
  image_url VARCHAR(1000),
  link_url VARCHAR(1000),
  link_label VARCHAR(255),
  list_items JSONB,
  json_value JSONB,
  css_class VARCHAR(255),
  icon VARCHAR(100),
  "order" INTEGER DEFAULT 0,
  is_visible BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(section_id, content_key)
);

CREATE INDEX IF NOT EXISTS idx_cms_content_blocks_section_id ON cms_content_blocks(section_id);
CREATE INDEX IF NOT EXISTS idx_cms_content_blocks_order ON cms_content_blocks("order");

-- CMS Global Config: Site-wide settings
CREATE TABLE IF NOT EXISTS cms_global_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(255) UNIQUE NOT NULL,
  config_type VARCHAR(50) NOT NULL, -- 'text', 'image', 'json'
  text_value TEXT,
  image_url VARCHAR(1000),
  json_value JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cms_global_config_key ON cms_global_config(config_key);

-- ============================================================================
-- SEED DATA: GLOBAL CONFIG
-- ============================================================================

INSERT INTO cms_global_config (config_key, config_type, text_value, image_url, json_value)
VALUES
  ('site_name', 'text', 'OwnYourGig', NULL, NULL),
  ('tagline', 'text', 'Workers united. Customers satisfied. Platform shared.', NULL, NULL),
  ('logo_url', 'image', NULL, '/images/ownyourgig-hero.png', NULL),
  ('footer_copyright', 'text', '© 2026 OwnYourGig Platform Cooperative', NULL, NULL),
  ('nav_items', 'json', NULL, NULL, '[
    {"label": "Home", "path": "/", "exact": true},
    {"label": "Manifesto", "path": "/manifesto"},
    {"label": "Membership", "path": "/membership"}
  ]'::jsonb),
  ('nav_items_logged_in', 'json', NULL, NULL, '[
    {"label": "My Jobs", "path": "/customer/dashboard"},
    {"label": "Find Work", "path": "/provider/dashboard"},
    {"label": "Post a Job", "path": "/customer/post-job"}
  ]'::jsonb),
  ('nav_items_cooperative', 'json', NULL, NULL, '[
    {"label": "Roadmap", "path": "/roadmap"},
    {"label": "Architecture", "path": "/architecture"}
  ]'::jsonb)
ON CONFLICT (config_key) DO UPDATE SET
  config_type = EXCLUDED.config_type,
  text_value = EXCLUDED.text_value,
  image_url = EXCLUDED.image_url,
  json_value = EXCLUDED.json_value,
  updated_at = now();

-- ============================================================================
-- SEED DATA: HOME PAGE
-- ============================================================================

-- Create home page
INSERT INTO cms_pages (slug, title, description)
VALUES (
  'home',
  'OwnYourGig — The Gig Platform That''s Actually On Your Side',
  'A platform cooperative marketplace connecting customers with verified service providers.'
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  updated_at = now();

-- Get home page ID
DO $$
DECLARE
  home_page_id UUID;
  hero_section_id UUID;
  customer_section_id UUID;
  provider_section_id UUID;
  how_it_works_section_id UUID;
BEGIN
  SELECT id INTO home_page_id FROM cms_pages WHERE slug = 'home';

  -- Hero Section
  INSERT INTO cms_sections (page_id, section_key, title, "order")
  VALUES (home_page_id, 'hero', 'The Gig Platform That''s Actually On Your Side', 0)
  ON CONFLICT (page_id, section_key) DO UPDATE SET
    title = EXCLUDED.title,
    "order" = EXCLUDED."order",
    updated_at = now()
  RETURNING id INTO hero_section_id;

  -- Hero content blocks
  INSERT INTO cms_content_blocks (section_id, content_key, content_type, text_value, "order")
  VALUES
    (hero_section_id, 'main_description', 'text', 'OwnYourGig is a platform cooperative governed by the workers who deliver excellent quality service to satisfy customers!', 0)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    text_value = EXCLUDED.text_value,
    updated_at = now();

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, image_url, "order")
  VALUES
    (hero_section_id, 'hero_image', 'image', '/images/ownyourgig-hero.png', 1)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    image_url = EXCLUDED.image_url,
    updated_at = now();

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, text_value, "order")
  VALUES
    (hero_section_id, 'benefit_1_title', 'text', 'Fair Fees', 2),
    (hero_section_id, 'benefit_1_description', 'text', 'Lower platform fees than gig economy giants, with member discounts', 3),
    (hero_section_id, 'benefit_2_title', 'text', 'Shared Ownership', 4),
    (hero_section_id, 'benefit_2_description', 'text', 'Members vote on decisions and share in the platform''s success', 5),
    (hero_section_id, 'benefit_3_title', 'text', 'Secure Transactions', 6),
    (hero_section_id, 'benefit_3_description', 'text', 'Escrow payments protect both customers and providers', 7)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    text_value = EXCLUDED.text_value,
    updated_at = now();

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, list_items, "order")
  VALUES
    (hero_section_id, 'trust_indicators', 'list', '["Verified Providers", "Background Checks", "Fast Payouts"]'::jsonb, 8)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    list_items = EXCLUDED.list_items,
    updated_at = now();

  -- Customer Value Section
  INSERT INTO cms_sections (page_id, section_key, title, "order")
  VALUES (home_page_id, 'customer_value', 'Need a Service?', 1)
  ON CONFLICT (page_id, section_key) DO UPDATE SET
    title = EXCLUDED.title,
    "order" = EXCLUDED."order",
    updated_at = now()
  RETURNING id INTO customer_section_id;

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, text_value, "order")
  VALUES
    (customer_section_id, 'description', 'text', 'Post your job request and receive bids from qualified, verified service providers in your area.', 0)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    text_value = EXCLUDED.text_value,
    updated_at = now();

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, list_items, "order")
  VALUES
    (customer_section_id, 'benefits', 'list', '["Verified providers with background checks", "Secure escrow payment protection", "72-hour dispute window"]'::jsonb, 1)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    list_items = EXCLUDED.list_items,
    updated_at = now();

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, link_label, link_url, "order")
  VALUES
    (customer_section_id, 'cta_button', 'link', 'Post a Job Request', '/customer/post-job', 2)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    link_label = EXCLUDED.link_label,
    link_url = EXCLUDED.link_url,
    updated_at = now();

  -- Provider Value Section
  INSERT INTO cms_sections (page_id, section_key, title, "order")
  VALUES (home_page_id, 'provider_value', 'Offer Services?', 2)
  ON CONFLICT (page_id, section_key) DO UPDATE SET
    title = EXCLUDED.title,
    "order" = EXCLUDED."order",
    updated_at = now()
  RETURNING id INTO provider_section_id;

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, text_value, "order")
  VALUES
    (provider_section_id, 'description', 'text', 'Join our cooperative and receive job matches based on your skills, location, and availability.', 0)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    text_value = EXCLUDED.text_value,
    updated_at = now();

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, list_items, "order")
  VALUES
    (provider_section_id, 'benefits', 'list', '["Fair platform fees with member discounts", "Automated matching to qualified jobs", "Fast payouts within 1-3 business days"]'::jsonb, 1)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    list_items = EXCLUDED.list_items,
    updated_at = now();

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, link_label, link_url, "order")
  VALUES
    (provider_section_id, 'cta_button', 'link', 'Become a Provider', '/membership', 2)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    link_label = EXCLUDED.link_label,
    link_url = EXCLUDED.link_url,
    updated_at = now();

  -- How It Works Section
  INSERT INTO cms_sections (page_id, section_key, title, "order")
  VALUES (home_page_id, 'how_it_works', 'How It Works', 3)
  ON CONFLICT (page_id, section_key) DO UPDATE SET
    title = EXCLUDED.title,
    "order" = EXCLUDED."order",
    updated_at = now()
  RETURNING id INTO how_it_works_section_id;

  INSERT INTO cms_content_blocks (section_id, content_key, content_type, json_value, "order")
  VALUES
    (how_it_works_section_id, 'step_1', 'json', '{"number": "1", "title": "Post or Browse", "description": "Customers post jobs, providers receive matches"}'::jsonb, 0),
    (how_it_works_section_id, 'step_2', 'json', '{"number": "2", "title": "Review Bids", "description": "Compare proposals and select the best fit"}'::jsonb, 1),
    (how_it_works_section_id, 'step_3', 'json', '{"number": "3", "title": "Complete & Pay", "description": "Work gets done, payment released securely"}'::jsonb, 2)
  ON CONFLICT (section_id, content_key) DO UPDATE SET
    json_value = EXCLUDED.json_value,
    updated_at = now();

END $$;

-- ============================================================================
-- ENABLE RLS (Row Level Security)
-- ============================================================================

ALTER TABLE cms_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE cms_global_config ENABLE ROW LEVEL SECURITY;

-- Public read access for CMS content
DROP POLICY IF EXISTS "Allow public read access to cms_pages" ON cms_pages;
CREATE POLICY "Allow public read access to cms_pages"
  ON cms_pages FOR SELECT
  USING (is_active = true);

DROP POLICY IF EXISTS "Allow public read access to cms_sections" ON cms_sections;
CREATE POLICY "Allow public read access to cms_sections"
  ON cms_sections FOR SELECT
  USING (is_visible = true);

DROP POLICY IF EXISTS "Allow public read access to cms_content_blocks" ON cms_content_blocks;
CREATE POLICY "Allow public read access to cms_content_blocks"
  ON cms_content_blocks FOR SELECT
  USING (is_visible = true);

DROP POLICY IF EXISTS "Allow public read access to cms_global_config" ON cms_global_config;
CREATE POLICY "Allow public read access to cms_global_config"
  ON cms_global_config FOR SELECT
  USING (true);

-- Service role has full access
DROP POLICY IF EXISTS "Allow service role full access to cms_pages" ON cms_pages;
CREATE POLICY "Allow service role full access to cms_pages"
  ON cms_pages FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role full access to cms_sections" ON cms_sections;
CREATE POLICY "Allow service role full access to cms_sections"
  ON cms_sections FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role full access to cms_content_blocks" ON cms_content_blocks;
CREATE POLICY "Allow service role full access to cms_content_blocks"
  ON cms_content_blocks FOR ALL
  USING (auth.role() = 'service_role');

DROP POLICY IF EXISTS "Allow service role full access to cms_global_config" ON cms_global_config;
CREATE POLICY "Allow service role full access to cms_global_config"
  ON cms_global_config FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================================================
-- TRIGGER: Auto-update updated_at timestamp
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_cms_pages_updated_at
  BEFORE UPDATE ON cms_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cms_sections_updated_at
  BEFORE UPDATE ON cms_sections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cms_content_blocks_updated_at
  BEFORE UPDATE ON cms_content_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_cms_global_config_updated_at
  BEFORE UPDATE ON cms_global_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
