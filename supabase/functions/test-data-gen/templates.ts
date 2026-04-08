/**
 * Pre-built SQL templates for test data generation.
 * Used instead of AI generation for features with complex schemas
 * where AI-generated SQL consistently fails (wrong columns, FK order, etc.)
 *
 * Each template uses ON CONFLICT DO NOTHING for idempotent re-runs.
 * UUIDs use dd-prefixed patterns (hex-safe) to avoid colliding with seed data.
 */

/** Map of feature_code → array of SQL statements */
const TEMPLATES: Record<string, string[]> = {
  'FR-122': buildFR122(),
  'FR-123': buildFR123(),
};

/** Look up a pre-built template by feature code. Returns null if none exists. */
export function getTemplate(featureCode: string): string[] | null {
  return TEMPLATES[featureCode] ?? null;
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
     VALUES ('${courseId}', 'Landscaping Business Mastery', 'Build and grow a successful landscaping business from quoting to customer retention.', 'landscaping', 'active', NULL)
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
function buildFR123(): string[] {
  // Reference existing seed courses and modules
  const plumbCourse = 'c0000001-0000-0000-0000-000000000001';
  const custCourse = 'c0000001-0000-0000-0000-000000000004';
  const plumbMod1 = 'm0000001-0000-0000-0000-000000000001';
  const plumbMod2 = 'm0000001-0000-0000-0000-000000000002';
  const custMod1 = 'm0000004-0000-0000-0000-000000000001';
  const custMod2 = 'm0000004-0000-0000-0000-000000000002';

  const enroll1 = 'dd000123-0001-0000-0000-000000000001';
  const enroll2 = 'dd000123-0001-0000-0000-000000000002';
  const userId1 = 'dd000123-aaa0-0000-0000-000000000001';
  const userId2 = 'dd000123-aaa0-0000-0000-000000000002';

  return [
    // Enrollments (referencing existing seed courses)
    `INSERT INTO course_enrollments (id, course_id, user_id, user_name, status, enrolled_at)
     VALUES ('${enroll1}', '${plumbCourse}', '${userId1}', 'Lisa Thompson', 'in_progress', '2026-03-01')
     ON CONFLICT ON CONSTRAINT uq_enrollment_user_course DO NOTHING`,
    `INSERT INTO course_enrollments (id, course_id, user_id, user_name, status, enrolled_at, completed_at)
     VALUES ('${enroll2}', '${custCourse}', '${userId2}', 'David Chen', 'completed', '2026-02-15', '2026-03-20')
     ON CONFLICT ON CONSTRAINT uq_enrollment_user_course DO NOTHING`,

    // Module progress
    `INSERT INTO module_progress (id, enrollment_id, module_id, status, completed_at)
     VALUES ('dd000123-0002-0000-0000-000000000001', '${enroll1}', '${plumbMod1}', 'completed', '2026-03-05')
     ON CONFLICT ON CONSTRAINT uq_progress_enrollment_module DO NOTHING`,
    `INSERT INTO module_progress (id, enrollment_id, module_id, status)
     VALUES ('dd000123-0002-0000-0000-000000000002', '${enroll1}', '${plumbMod2}', 'in_progress')
     ON CONFLICT ON CONSTRAINT uq_progress_enrollment_module DO NOTHING`,
    `INSERT INTO module_progress (id, enrollment_id, module_id, status, completed_at)
     VALUES ('dd000123-0002-0000-0000-000000000003', '${enroll2}', '${custMod1}', 'completed', '2026-02-20')
     ON CONFLICT ON CONSTRAINT uq_progress_enrollment_module DO NOTHING`,
    `INSERT INTO module_progress (id, enrollment_id, module_id, status, completed_at)
     VALUES ('dd000123-0002-0000-0000-000000000004', '${enroll2}', '${custMod2}', 'completed', '2026-03-01')
     ON CONFLICT ON CONSTRAINT uq_progress_enrollment_module DO NOTHING`,

    // Module assessments (ensure they exist for the referenced modules)
    `INSERT INTO module_assessments (id, module_id, passing_score, max_retries, cooldown_minutes)
     VALUES ('dd000123-0003-0000-0000-000000000001', '${plumbMod1}', 70, 3, 30)
     ON CONFLICT (module_id) DO NOTHING`,
    `INSERT INTO module_assessments (id, module_id, passing_score, max_retries, cooldown_minutes)
     VALUES ('dd000123-0003-0000-0000-000000000002', '${custMod1}', 60, NULL, NULL)
     ON CONFLICT (module_id) DO NOTHING`,

    // Assessment attempts
    `INSERT INTO assessment_attempts (id, enrollment_id, module_id, score, passed, attempted_at)
     VALUES ('dd000123-0004-0000-0000-000000000001', '${enroll1}', '${plumbMod1}', 55, false, '2026-03-04')
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO assessment_attempts (id, enrollment_id, module_id, score, passed, attempted_at)
     VALUES ('dd000123-0004-0000-0000-000000000002', '${enroll1}', '${plumbMod1}', 85, true, '2026-03-05')
     ON CONFLICT (id) DO NOTHING`,
    `INSERT INTO assessment_attempts (id, enrollment_id, module_id, score, passed, attempted_at)
     VALUES ('dd000123-0004-0000-0000-000000000003', '${enroll2}', '${custMod1}', 90, true, '2026-02-20')
     ON CONFLICT (id) DO NOTHING`,

    // Certificate for completed enrollment
    `INSERT INTO certificates (id, enrollment_id, user_id, user_name, course_title, verification_code, issued_at)
     VALUES ('dd000123-0005-0000-0000-000000000001', '${enroll2}', '${userId2}', 'David Chen', 'Customer Service Excellence', 'CERT-OYG-2026-DCHEN-001', '2026-03-20')
     ON CONFLICT (enrollment_id) DO NOTHING`,

    // Course payment (for a paid course scenario — use HVAC which has no enrollments)
    `INSERT INTO course_payments (id, user_id, course_id, stripe_session_id, stripe_payment_intent, amount_cents, status, created_at, completed_at)
     VALUES ('dd000123-0006-0000-0000-000000000001', '${userId2}', 'c0000001-0000-0000-0000-000000000005', 'cs_test_td123_david_hvac', 'pi_test_td123_david_hvac', 4900, 'completed', '2026-02-14', '2026-02-14')
     ON CONFLICT (stripe_session_id) DO NOTHING`,
  ];
}
