-- Prompt Library (Strategic Plan Phase 3)
-- Institutional memory: proven prompts, learnings, and SDLC shortcuts

-- 1. Prompt categories (task types)
CREATE TABLE IF NOT EXISTS prompt_categories (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. Prompt library (proven system prompts)
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category_id TEXT NOT NULL REFERENCES prompt_categories(id) ON DELETE CASCADE,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  user_prompt_template TEXT,
  model_recommendation TEXT DEFAULT 'claude-sonnet-4-5-20250514',
  max_tokens INTEGER DEFAULT 4096,
  temperature DOUBLE PRECISION DEFAULT 1.0,
  source_function TEXT,
  tags TEXT[] DEFAULT '{}',
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  avg_quality_score DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_category ON prompt_templates(category_id);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_slug ON prompt_templates(slug);
CREATE INDEX IF NOT EXISTS idx_prompt_templates_active ON prompt_templates(is_active) WHERE is_active = true;

-- 3. Prompt effectiveness ratings (per-use feedback)
CREATE TABLE IF NOT EXISTS prompt_ratings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  prompt_template_id TEXT NOT NULL REFERENCES prompt_templates(id) ON DELETE CASCADE,
  quality_score INTEGER NOT NULL CHECK (quality_score BETWEEN 1 AND 5),
  was_useful BOOLEAN NOT NULL DEFAULT true,
  feedback TEXT,
  input_tokens INTEGER,
  output_tokens INTEGER,
  latency_ms INTEGER,
  model_used TEXT,
  feature_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_prompt_ratings_template ON prompt_ratings(prompt_template_id);

-- 4. AI learnings (failure corrections and validated patterns)
CREATE TABLE IF NOT EXISTS ai_learnings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  category_id TEXT REFERENCES prompt_categories(id) ON DELETE SET NULL,
  learning_type TEXT NOT NULL CHECK (learning_type IN ('correction', 'pattern', 'constraint', 'tip')),
  title TEXT NOT NULL,
  context TEXT NOT NULL,
  correction TEXT NOT NULL,
  applies_to TEXT[] DEFAULT '{}',
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_learnings_category ON ai_learnings(category_id);
CREATE INDEX IF NOT EXISTS idx_ai_learnings_type ON ai_learnings(learning_type);
CREATE INDEX IF NOT EXISTS idx_ai_learnings_active ON ai_learnings(is_active) WHERE is_active = true;

-- 5. SDLC shortcuts (command → expanded prompt)
CREATE TABLE IF NOT EXISTS sdlc_shortcuts (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  command TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  expanded_prompt TEXT NOT NULL,
  category_id TEXT REFERENCES prompt_categories(id) ON DELETE SET NULL,
  prompt_template_id TEXT REFERENCES prompt_templates(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  usage_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_sdlc_shortcuts_command ON sdlc_shortcuts(command);

-- RLS policies
ALTER TABLE prompt_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE prompt_ratings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_learnings ENABLE ROW LEVEL SECURITY;
ALTER TABLE sdlc_shortcuts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read for prompt categories" ON prompt_categories;
CREATE POLICY "Public read for prompt categories" ON prompt_categories FOR SELECT USING (true);
DROP POLICY IF EXISTS "Admin manage prompt categories" ON prompt_categories;
CREATE POLICY "Admin manage prompt categories" ON prompt_categories FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read for active prompts" ON prompt_templates;
CREATE POLICY "Public read for active prompts" ON prompt_templates FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Admin manage prompts" ON prompt_templates;
CREATE POLICY "Admin manage prompts" ON prompt_templates FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Authenticated users can rate" ON prompt_ratings;
CREATE POLICY "Authenticated users can rate" ON prompt_ratings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read active learnings" ON ai_learnings;
CREATE POLICY "Public read active learnings" ON ai_learnings FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Admin manage learnings" ON ai_learnings;
CREATE POLICY "Admin manage learnings" ON ai_learnings FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public read active shortcuts" ON sdlc_shortcuts;
CREATE POLICY "Public read active shortcuts" ON sdlc_shortcuts FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS "Admin manage shortcuts" ON sdlc_shortcuts;
CREATE POLICY "Admin manage shortcuts" ON sdlc_shortcuts FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE prompt_categories IS 'Categories for organizing AI prompt templates by task type';
COMMENT ON TABLE prompt_templates IS 'Proven system prompts with effectiveness tracking';
COMMENT ON TABLE prompt_ratings IS 'Per-use feedback on prompt quality and usefulness';
COMMENT ON TABLE ai_learnings IS 'Corrections and validated patterns from AI failures and successes';
COMMENT ON TABLE sdlc_shortcuts IS 'Simple command → expanded prompt mappings for SDLC workflows';
