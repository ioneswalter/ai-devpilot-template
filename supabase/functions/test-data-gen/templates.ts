/**
 * Pre-built SQL templates for test data generation.
 * Used instead of AI generation for features with complex schemas
 * where AI-generated SQL consistently fails (wrong columns, FK order, etc.)
 *
 * Each template uses ON CONFLICT DO NOTHING for idempotent re-runs.
 * UUIDs use dd-prefixed patterns (hex-safe) to avoid colliding with seed data.
 *
 * IMPORTANT — Admin user convention:
 * `adminUserId` is the real auth.users ID of the person running the tests.
 * ALL user-scoped data the admin interacts with in the browser (enrollments,
 * progress, attempts, certificates, payments) MUST use `adminUserId`.
 * Fake user IDs are only for background/secondary data the admin never
 * directly interacts with (e.g., other learners' stats in an admin report).
 */

type TemplateFn = (adminUserId: string) => string[];

/** Map of feature_code → template builder (receives the admin's real user ID) */
const TEMPLATES: Record<string, TemplateFn> = {
  'FR-104': () => buildFR104(),
  'FR-122': () => buildFR122(),
  'FR-123': (uid) => buildFR123(uid),
};

/** Look up a pre-built template by feature code. Returns null if none exists. */
export function getTemplate(featureCode: string, adminUserId: string): string[] | null {
  const fn = TEMPLATES[featureCode];
  return fn ? fn(adminUserId) : null;
}

/** FR-104: LMS Admin Monitoring Dashboard — ensures edge-case courses exist for all test scenarios */
function buildFR104(): string[] {
  const zeroCourse = 'dd000104-0000-0000-0000-000000000001';

  return [
    // Active course with zero enrollments (TC-104-007: zero enrollments empty state)
    `INSERT INTO lms_courses (id, title, description, service_category, status)
     VALUES ('${zeroCourse}', 'HVAC Maintenance Fundamentals', 'Introduction to heating, ventilation, and air conditioning maintenance and repair.', 'HVAC', 'active')
     ON CONFLICT (id) DO NOTHING`,

    // Give it modules so "Not Configured" badge doesn't appear on this course
    `INSERT INTO course_modules (id, course_id, title, sort_order)
     VALUES ('dd000104-0001-0000-0000-000000000001', '${zeroCourse}', 'Module 1: HVAC Safety Basics', 1)
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO course_modules (id, course_id, title, sort_order)
     VALUES ('dd000104-0001-0000-0000-000000000002', '${zeroCourse}', 'Module 2: Refrigeration Cycles', 2)
     ON CONFLICT (id) DO NOTHING`,
  ];
}

/** FR-122: Admin Course Builder — courses, modules, quizzes, templates, image prompts */
function buildFR122(): string[] {
  const courseId = 'dd000122-0000-0000-0000-000000000001';
  const courseId2 = 'dd000122-0000-0000-0000-000000000002';
  const mod1 = 'dd000122-0001-0000-0000-000000000001';
  const mod2 = 'dd000122-0001-0000-0000-000000000002';
  const mod3 = 'dd000122-0001-0000-0000-000000000003';
  const mod4 = 'dd000122-0002-0000-0000-000000000001';
  const tplId = 'dd000122-0003-0000-0000-000000000001';

  return [
    // Course 1: published with modules, quizzes, images
    `INSERT INTO lms_courses (id, title, description, service_category, status, price_cents)
     VALUES ('${courseId}', 'Landscaping Business Mastery', 'Build and grow a successful landscaping business from quoting to customer retention.', 'landscaping', 'published', NULL)
     ON CONFLICT (id) DO NOTHING`,

    // Course 2: draft with no modules (edge case)
    `INSERT INTO lms_courses (id, title, description, service_category, status, price_cents)
     VALUES ('${courseId2}', 'Solar Panel Installation Basics', 'Introduction to residential solar panel installation and maintenance.', 'electrical', 'draft', 4900)
     ON CONFLICT (id) DO NOTHING`,

    // Modules for course 1
    `INSERT INTO course_modules (id, course_id, title, sort_order, content, learning_objectives)
     VALUES ('${mod1}', '${courseId}', 'Getting Started with Landscaping', 1, 'This module covers the basics of starting a landscaping business including licensing, insurance, and equipment.', 'Understand licensing requirements; Identify essential equipment; Create a startup budget')
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO course_modules (id, course_id, title, sort_order, content, learning_objectives)
     VALUES ('${mod2}', '${courseId}', 'Quoting and Pricing Jobs', 2, 'Learn how to measure sites, estimate materials, and create professional quotes that win jobs.', 'Calculate material costs; Create competitive quotes; Present estimates to clients')
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO course_modules (id, course_id, title, sort_order, content, learning_objectives)
     VALUES ('${mod3}', '${courseId}', 'Customer Retention Strategies', 3, 'Build a loyal client base through follow-ups, seasonal maintenance plans, and referral programs.', 'Design maintenance plans; Implement referral programs; Handle customer complaints')
     ON CONFLICT (id) DO NOTHING`,

    // Module for course 2
    `INSERT INTO course_modules (id, course_id, title, sort_order, content, learning_objectives)
     VALUES ('${mod4}', '${courseId2}', 'Solar Energy Fundamentals', 1, 'Understanding photovoltaic systems, inverters, and grid-tied vs off-grid setups.', 'Explain PV cell operation; Compare inverter types; Assess roof suitability')
     ON CONFLICT (id) DO NOTHING`,

    // Module assessments
    `INSERT INTO module_assessments (id, module_id, passing_score)
     VALUES ('dd000122-0004-0000-0000-000000000001', '${mod1}', 70)
     ON CONFLICT (module_id) DO NOTHING`,
    `INSERT INTO module_assessments (id, module_id, passing_score)
     VALUES ('dd000122-0004-0000-0000-000000000002', '${mod3}', 80)
     ON CONFLICT (module_id) DO NOTHING`,

    // Quiz questions for module 1
    `INSERT INTO quiz_questions (id, module_id, question_text, options, source, sort_order)
     VALUES ('dd000122-0005-0000-0000-000000000001', '${mod1}', 'What is the minimum public liability insurance required for landscaping in NSW?', '{"choices": [{"text": "$5 million", "correct": false}, {"text": "$10 million", "correct": true}, {"text": "$20 million", "correct": false}, {"text": "$1 million", "correct": false}]}', 'manual', 1)
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO quiz_questions (id, module_id, question_text, options, source, sort_order)
     VALUES ('dd000122-0005-0000-0000-000000000002', '${mod1}', 'Which of the following is NOT essential startup equipment?', '{"choices": [{"text": "Commercial mower", "correct": false}, {"text": "Line trimmer", "correct": false}, {"text": "Excavator", "correct": true}, {"text": "Blower", "correct": false}]}', 'manual', 2)
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO quiz_questions (id, module_id, question_text, options, source, sort_order)
     VALUES ('dd000122-0005-0000-0000-000000000003', '${mod1}', 'What type of ABN do you need for a landscaping business?', '{"choices": [{"text": "Sole trader ABN", "correct": true}, {"text": "Company ABN only", "correct": false}, {"text": "No ABN needed", "correct": false}, {"text": "Trust ABN only", "correct": false}]}', 'ai', 3)
     ON CONFLICT (id) DO NOTHING`,

    // Quiz questions for module 3
    `INSERT INTO quiz_questions (id, module_id, question_text, options, source, sort_order)
     VALUES ('dd000122-0005-0000-0000-000000000004', '${mod3}', 'What is the ideal follow-up timeframe after completing a landscaping job?', '{"choices": [{"text": "1 week", "correct": true}, {"text": "1 month", "correct": false}, {"text": "3 months", "correct": false}, {"text": "Never", "correct": false}]}', 'manual', 1)
     ON CONFLICT (id) DO NOTHING`,

    // Course template
    `INSERT INTO course_templates (id, name, description, category)
     VALUES ('${tplId}', 'Trade Certification Prep', 'Standard template for trade certification preparation courses with safety, theory, and practical modules.', 'trades')
     ON CONFLICT (id) DO NOTHING`,

    // Template modules
    `INSERT INTO template_modules (id, template_id, title, description, sort_order)
     VALUES ('dd000122-0006-0000-0000-000000000001', '${tplId}', 'Safety & Compliance', 'WHS requirements and industry safety standards', 1)
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO template_modules (id, template_id, title, description, sort_order)
     VALUES ('dd000122-0006-0000-0000-000000000002', '${tplId}', 'Theory & Knowledge', 'Core technical knowledge and terminology', 2)
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO template_modules (id, template_id, title, description, sort_order)
     VALUES ('dd000122-0006-0000-0000-000000000003', '${tplId}', 'Practical Application', 'Hands-on exercises and real-world scenarios', 3)
     ON CONFLICT (id) DO NOTHING`,

    // Image prompts for module 1
    `INSERT INTO image_prompts (id, module_id, suggested_filename, position, purpose, description, avoid_list, sort_order)
     VALUES ('dd000122-0007-0000-0000-000000000001', '${mod1}', 'landscaping-startup-equipment.jpg', 'after_heading', 'hero', 'Professional landscaping equipment laid out on a clean trailer: commercial mower, line trimmer, blower, hedge trimmer, and hand tools.', 'No people, no brand logos', 1)
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO image_prompts (id, module_id, suggested_filename, position, purpose, description, avoid_list, sort_order)
     VALUES ('dd000122-0007-0000-0000-000000000002', '${mod1}', 'insurance-certificate.jpg', 'inline', 'illustration', 'A sample Certificate of Currency showing public liability coverage details with blurred personal information.', 'No real company names', 2)
     ON CONFLICT (id) DO NOTHING`,
  ];
}

/** FR-123: Learner Enrollment and Course Delivery — enrollments, progress, assessments, certificates, payments */
function buildFR123(adminUserId: string): string[] {
  // Reference FR-122 test data courses (verified to exist in DB)
  const landscapeCourse = 'dd000122-0000-0000-0000-000000000001'; // Landscaping Business Mastery (active, free)
  const solarCourse = 'dd000122-0000-0000-0000-000000000002';     // Solar Panel Installation Basics (draft, $49)
  const landscapeMod1 = 'dd000122-0001-0000-0000-000000000001';   // Getting Started with Landscaping
  const landscapeMod2 = 'dd000122-0001-0000-0000-000000000002';   // Quoting and Pricing Jobs
  const landscapeMod3 = 'dd000122-0001-0000-0000-000000000003';   // Customer Retention Strategies

  // Admin user — the person running the tests. ALL browser-interactive data uses this ID.
  const adminId = adminUserId;
  const enrollAdmin = 'dd000123-0001-0000-0000-000000000004';
  const assessMod1 = 'dd000122-0004-0000-0000-000000000001'; // Assessment on Landscaping mod1

  // Secondary users — background data only (admin reports, certificate verification demo)
  const userId2 = 'dd000123-aaa0-0000-0000-000000000002';
  const enroll2 = 'dd000123-0001-0000-0000-000000000002';

  return [
    // ── Course setup ──────────────────────────────────────────────
    `UPDATE lms_courses SET status = 'published' WHERE id = '${landscapeCourse}'`,

    // Set max_retries on mod1 assessment so retry-exhausted flow is testable (totalAllowed = 1 + 2 = 3)
    `UPDATE module_assessments SET max_retries = 1 WHERE id = '${assessMod1}'`,

    // ── Admin user enrollment (primary test path) ─────────────────
    // In-progress: mod1 in_progress with exhausted assessment retries, mod2/mod3 locked
    `INSERT INTO course_enrollments (id, course_id, user_id, user_name, status, enrolled_at)
     VALUES ('${enrollAdmin}', '${landscapeCourse}', '${adminId}', 'Test Admin', 'in_progress', '2026-03-25')
     ON CONFLICT ON CONSTRAINT uq_enrollment_user_course DO NOTHING`,

    `INSERT INTO module_progress (id, enrollment_id, module_id, status)
     VALUES ('dd000123-0002-0000-0000-000000000020', '${enrollAdmin}', '${landscapeMod1}', 'in_progress')
     ON CONFLICT ON CONSTRAINT uq_progress_enrollment_module DO NOTHING`,

    // 3 failed assessment attempts on mod1 (exhausts totalAllowed = 3)
    `INSERT INTO assessment_attempts (id, enrollment_id, module_id, score, passed, attempted_at)
     VALUES ('dd000123-0004-0000-0000-000000000020', '${enrollAdmin}', '${landscapeMod1}', 40, false, '2026-03-26')
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO assessment_attempts (id, enrollment_id, module_id, score, passed, attempted_at)
     VALUES ('dd000123-0004-0000-0000-000000000021', '${enrollAdmin}', '${landscapeMod1}', 50, false, '2026-03-27')
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO assessment_attempts (id, enrollment_id, module_id, score, passed, attempted_at)
     VALUES ('dd000123-0004-0000-0000-000000000022', '${enrollAdmin}', '${landscapeMod1}', 55, false, '2026-03-28')
     ON CONFLICT (id) DO NOTHING`,

    // ── Secondary user: David (background data for certificate verification) ──
    `INSERT INTO course_enrollments (id, course_id, user_id, user_name, status, enrolled_at, completed_at)
     VALUES ('${enroll2}', '${landscapeCourse}', '${userId2}', 'David Chen', 'completed', '2026-02-15', '2026-03-20')
     ON CONFLICT ON CONSTRAINT uq_enrollment_user_course DO NOTHING`,

    `INSERT INTO module_progress (id, enrollment_id, module_id, status, completed_at)
     VALUES ('dd000123-0002-0000-0000-000000000003', '${enroll2}', '${landscapeMod1}', 'completed', '2026-02-20')
     ON CONFLICT ON CONSTRAINT uq_progress_enrollment_module DO NOTHING`,
    `INSERT INTO module_progress (id, enrollment_id, module_id, status, completed_at)
     VALUES ('dd000123-0002-0000-0000-000000000004', '${enroll2}', '${landscapeMod2}', 'completed', '2026-03-01')
     ON CONFLICT ON CONSTRAINT uq_progress_enrollment_module DO NOTHING`,
    `INSERT INTO module_progress (id, enrollment_id, module_id, status, completed_at)
     VALUES ('dd000123-0002-0000-0000-000000000005', '${enroll2}', '${landscapeMod3}', 'completed', '2026-03-15')
     ON CONFLICT ON CONSTRAINT uq_progress_enrollment_module DO NOTHING`,

    `INSERT INTO assessment_attempts (id, enrollment_id, module_id, score, passed, attempted_at)
     VALUES ('dd000123-0004-0000-0000-000000000003', '${enroll2}', '${landscapeMod1}', 90, true, '2026-02-20')
     ON CONFLICT (id) DO NOTHING`,

    `INSERT INTO certificates (id, enrollment_id, user_id, user_name, course_title, verification_code, issued_at, pdf_url)
     VALUES ('dd000123-0005-0000-0000-000000000001', '${enroll2}', '${userId2}', 'David Chen', 'Landscaping Business Mastery', 'CERT-OYG-2026-DCHEN-001', '2026-03-20', 'https://storage.example.com/certs/CERT-OYG-2026-DCHEN-001.pdf')
     ON CONFLICT (enrollment_id) DO NOTHING`,

    // ── Payment test data (secondary user) ────────────────────────
    `INSERT INTO course_payments (id, user_id, course_id, stripe_session_id, stripe_payment_intent, amount_cents, status, created_at, completed_at)
     VALUES ('dd000123-0006-0000-0000-000000000001', '${userId2}', '${solarCourse}', 'cs_test_td123_david_solar', 'pi_test_td123_david_solar', 4900, 'completed', '2026-02-14', '2026-02-14')
     ON CONFLICT (stripe_session_id) DO NOTHING`,
  ];
}
