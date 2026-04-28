-- FR-123: Learner Enrollment and Course Delivery
-- Extends lms_courses, module_assessments; creates assessment_attempts, certificates, course_payments

-- 1. Extend lms_courses with price_cents (null = free)
ALTER TABLE lms_courses ADD COLUMN IF NOT EXISTS price_cents integer DEFAULT NULL;

-- 2. Extend module_assessments with retry configuration
ALTER TABLE module_assessments ADD COLUMN IF NOT EXISTS max_retries integer DEFAULT NULL;
ALTER TABLE module_assessments ADD COLUMN IF NOT EXISTS cooldown_minutes integer DEFAULT NULL;

-- 3. Create assessment_attempts table
CREATE TABLE IF NOT EXISTS assessment_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
  module_id uuid NOT NULL REFERENCES course_modules(id) ON DELETE CASCADE,
  score integer NOT NULL,
  passed boolean NOT NULL,
  answers_json jsonb,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_assessment_attempts_enrollment_module
  ON assessment_attempts(enrollment_id, module_id);
CREATE INDEX IF NOT EXISTS idx_assessment_attempts_attempted_at
  ON assessment_attempts(attempted_at);

ALTER TABLE assessment_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own assessment attempts" ON assessment_attempts;
CREATE POLICY "Users read own assessment attempts"
  ON assessment_attempts FOR SELECT
  USING (auth.uid() = (SELECT user_id FROM course_enrollments WHERE id = enrollment_id));

DROP POLICY IF EXISTS "Users insert own assessment attempts" ON assessment_attempts;
CREATE POLICY "Users insert own assessment attempts"
  ON assessment_attempts FOR INSERT
  WITH CHECK (auth.uid() = (SELECT user_id FROM course_enrollments WHERE id = enrollment_id));

DROP POLICY IF EXISTS "Service role full access assessment_attempts" ON assessment_attempts;
CREATE POLICY "Service role full access assessment_attempts"
  ON assessment_attempts FOR ALL
  USING (auth.role() = 'service_role');

-- 4. Create certificates table
CREATE TABLE IF NOT EXISTS certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL UNIQUE REFERENCES course_enrollments(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_name text NOT NULL,
  course_title text NOT NULL,
  verification_code text NOT NULL UNIQUE,
  pdf_url text,
  issued_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_certificates_user_id ON certificates(user_id);
CREATE INDEX IF NOT EXISTS idx_certificates_verification_code ON certificates(verification_code);

ALTER TABLE certificates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own certificates" ON certificates;
CREATE POLICY "Users read own certificates"
  ON certificates FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Public read certificates by verification code" ON certificates;
CREATE POLICY "Public read certificates by verification code"
  ON certificates FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "Service role full access certificates" ON certificates;
CREATE POLICY "Service role full access certificates"
  ON certificates FOR ALL
  USING (auth.role() = 'service_role');

-- 5. Create course_payments table
CREATE TABLE IF NOT EXISTS course_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL REFERENCES lms_courses(id) ON DELETE CASCADE,
  stripe_session_id text NOT NULL UNIQUE,
  stripe_payment_intent text,
  amount_cents integer NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_course_payments_user_id ON course_payments(user_id);
CREATE INDEX IF NOT EXISTS idx_course_payments_course_id ON course_payments(course_id);

ALTER TABLE course_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own course payments" ON course_payments;
CREATE POLICY "Users read own course payments"
  ON course_payments FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Service role full access course_payments" ON course_payments;
CREATE POLICY "Service role full access course_payments"
  ON course_payments FOR ALL
  USING (auth.role() = 'service_role');

-- 6. Create certificates storage bucket (public read)
INSERT INTO storage.buckets (id, name, public)
VALUES ('certificates', 'certificates', true)
ON CONFLICT (id) DO NOTHING;
