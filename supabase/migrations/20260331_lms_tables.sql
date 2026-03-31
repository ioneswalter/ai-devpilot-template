-- FR-104: LMS Admin Monitoring Dashboard — 4 tables
-- Tables: lms_courses, course_modules, course_enrollments, module_progress

-- ── lms_courses ──
CREATE TABLE IF NOT EXISTS lms_courses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  service_category text NOT NULL,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lms_courses_category ON lms_courses (service_category);
CREATE INDEX idx_lms_courses_status ON lms_courses (status);

ALTER TABLE lms_courses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_lms_courses" ON lms_courses FOR ALL USING (true) WITH CHECK (true);

-- ── course_modules ──
CREATE TABLE IF NOT EXISTS course_modules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  title text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_course_modules_course ON course_modules (course_id);
ALTER TABLE course_modules ADD CONSTRAINT uq_course_module_order UNIQUE (course_id, sort_order);

ALTER TABLE course_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_course_modules" ON course_modules FOR ALL USING (true) WITH CHECK (true);

-- ── course_enrollments ──
CREATE TABLE IF NOT EXISTS course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  status text NOT NULL DEFAULT 'enrolled',
  enrolled_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_enrollments_course ON course_enrollments (course_id);
CREATE INDEX idx_enrollments_course_status ON course_enrollments (course_id, status);
CREATE INDEX idx_enrollments_user ON course_enrollments (user_id);
ALTER TABLE course_enrollments ADD CONSTRAINT uq_enrollment_user_course UNIQUE (course_id, user_id);

ALTER TABLE course_enrollments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_course_enrollments" ON course_enrollments FOR ALL USING (true) WITH CHECK (true);

-- ── module_progress ──
CREATE TABLE IF NOT EXISTS module_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'not_started',
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_progress_enrollment ON module_progress (enrollment_id);
CREATE INDEX idx_progress_module ON module_progress (module_id);
ALTER TABLE module_progress ADD CONSTRAINT uq_progress_enrollment_module UNIQUE (enrollment_id, module_id);

ALTER TABLE module_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all_module_progress" ON module_progress FOR ALL USING (true) WITH CHECK (true);
