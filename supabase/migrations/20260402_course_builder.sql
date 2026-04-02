-- FR-122: Admin Course Builder — Schema extensions + new tables

-- ── Extend lms_courses ──
ALTER TABLE lms_courses
  ADD COLUMN IF NOT EXISTS created_by uuid,
  ADD COLUMN IF NOT EXISTS thumbnail_url text;

-- ── Extend course_modules ──
ALTER TABLE course_modules
  ADD COLUMN IF NOT EXISTS content text,
  ADD COLUMN IF NOT EXISTS image_references jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS learning_objectives text;

-- ── module_assessments ──
CREATE TABLE IF NOT EXISTS module_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE UNIQUE,
  passing_score integer NOT NULL DEFAULT 70,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE module_assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_module_assessments" ON module_assessments FOR ALL USING (true) WITH CHECK (true);

-- ── quiz_questions ──
CREATE TABLE IF NOT EXISTS quiz_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  question_text text NOT NULL,
  options jsonb NOT NULL,
  source text NOT NULL DEFAULT 'manual',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_quiz_questions_module ON quiz_questions (module_id);
CREATE INDEX idx_quiz_questions_order ON quiz_questions (module_id, sort_order);

ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_quiz_questions" ON quiz_questions FOR ALL USING (true) WITH CHECK (true);

-- ── course_templates ──
CREATE TABLE IF NOT EXISTS course_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_templates_category ON course_templates (category);

ALTER TABLE course_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_course_templates" ON course_templates FOR ALL USING (true) WITH CHECK (true);

-- ── template_modules ──
CREATE TABLE IF NOT EXISTS template_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES course_templates(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  UNIQUE (template_id, sort_order)
);

CREATE INDEX idx_template_modules_template ON template_modules (template_id);

ALTER TABLE template_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_template_modules" ON template_modules FOR ALL USING (true) WITH CHECK (true);

-- ── image_prompts ──
CREATE TABLE IF NOT EXISTS image_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_id uuid NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  suggested_filename text NOT NULL,
  position text NOT NULL,
  purpose text NOT NULL,
  description text NOT NULL,
  avoid_list text,
  uploaded_url text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_image_prompts_module ON image_prompts (module_id);

ALTER TABLE image_prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_image_prompts" ON image_prompts FOR ALL USING (true) WITH CHECK (true);
