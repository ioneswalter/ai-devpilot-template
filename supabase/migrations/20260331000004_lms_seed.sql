-- FR-104: LMS Seed Data — sample courses, modules, enrollments, and progress

-- ── Courses ──
INSERT INTO lms_courses (id, title, description, service_category, status) VALUES
  ('c0000001-0000-0000-0000-000000000001', 'Plumbing Safety Fundamentals', 'Essential safety practices for plumbing professionals covering hazard identification, PPE, and emergency procedures.', 'plumbing', 'active'),
  ('c0000001-0000-0000-0000-000000000002', 'Electrical Code Compliance', 'Comprehensive guide to Australian electrical standards and code compliance requirements.', 'electrical', 'active'),
  ('c0000001-0000-0000-0000-000000000003', 'Carpentry Best Practices', 'Modern carpentry techniques focusing on sustainable materials and building codes.', 'carpentry', 'active'),
  ('c0000001-0000-0000-0000-000000000004', 'Customer Service Excellence', 'Improve client communication, manage expectations, and build lasting customer relationships.', 'general', 'active'),
  ('c0000001-0000-0000-0000-000000000005', 'HVAC Maintenance Essentials', 'Core maintenance procedures for heating, ventilation, and air conditioning systems.', 'hvac', 'active'),
  ('c0000001-0000-0000-0000-000000000006', 'Advanced Painting Techniques', 'Professional-grade painting techniques for residential and commercial projects.', 'painting', 'draft');

-- ── Modules ──
-- Plumbing Safety (6 modules)
INSERT INTO course_modules (id, course_id, title, sort_order) VALUES
  ('m0000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', 'Introduction to Safety', 1),
  ('m0000001-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000001', 'Hazard Identification', 2),
  ('m0000001-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000001', 'Personal Protective Equipment', 3),
  ('m0000001-0000-0000-0000-000000000004', 'c0000001-0000-0000-0000-000000000001', 'Emergency Procedures', 4),
  ('m0000001-0000-0000-0000-000000000005', 'c0000001-0000-0000-0000-000000000001', 'Workplace Ergonomics', 5),
  ('m0000001-0000-0000-0000-000000000006', 'c0000001-0000-0000-0000-000000000001', 'Safety Compliance Checklist', 6);

-- Electrical Code (4 modules)
INSERT INTO course_modules (id, course_id, title, sort_order) VALUES
  ('m0000002-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000002', 'AS/NZS 3000 Overview', 1),
  ('m0000002-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000002', 'Wiring Rules', 2),
  ('m0000002-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000002', 'Testing & Verification', 3),
  ('m0000002-0000-0000-0000-000000000004', 'c0000001-0000-0000-0000-000000000002', 'Compliance Documentation', 4);

-- Carpentry (3 modules)
INSERT INTO course_modules (id, course_id, title, sort_order) VALUES
  ('m0000003-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000003', 'Sustainable Materials', 1),
  ('m0000003-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000003', 'Building Code Essentials', 2),
  ('m0000003-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000003', 'Joinery Techniques', 3);

-- Customer Service (5 modules)
INSERT INTO course_modules (id, course_id, title, sort_order) VALUES
  ('m0000004-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000004', 'Communication Fundamentals', 1),
  ('m0000004-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000004', 'Setting Expectations', 2),
  ('m0000004-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000004', 'Handling Complaints', 3),
  ('m0000004-0000-0000-0000-000000000004', 'c0000001-0000-0000-0000-000000000004', 'Building Trust', 4),
  ('m0000004-0000-0000-0000-000000000005', 'c0000001-0000-0000-0000-000000000004', 'Follow-Up Best Practices', 5);

-- HVAC (4 modules)
INSERT INTO course_modules (id, course_id, title, sort_order) VALUES
  ('m0000005-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000005', 'System Components', 1),
  ('m0000005-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000005', 'Preventive Maintenance', 2),
  ('m0000005-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000005', 'Troubleshooting', 3),
  ('m0000005-0000-0000-0000-000000000004', 'c0000001-0000-0000-0000-000000000005', 'Refrigerant Handling', 4);

-- Advanced Painting has NO modules (edge case: "Not Configured")

-- ── Enrollments ──
-- Plumbing Safety: 3 enrollments (1 completed, 1 in_progress, 1 enrolled)
INSERT INTO course_enrollments (id, course_id, user_id, user_name, status, enrolled_at, completed_at) VALUES
  ('e0000001-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011', 'Sarah Mitchell', 'completed', '2026-01-15', '2026-02-28'),
  ('e0000001-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012', 'James Cooper', 'in_progress', '2026-02-01', NULL),
  ('e0000001-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', 'Maria Garcia', 'enrolled', '2026-03-20', NULL);

-- Electrical Code: 2 enrollments
INSERT INTO course_enrollments (id, course_id, user_id, user_name, status, enrolled_at, completed_at) VALUES
  ('e0000002-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000011', 'Sarah Mitchell', 'in_progress', '2026-02-10', NULL),
  ('e0000002-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000014', 'Tom Nguyen', 'completed', '2026-01-05', '2026-02-15');

-- Customer Service: 4 enrollments
INSERT INTO course_enrollments (id, course_id, user_id, user_name, status, enrolled_at, completed_at) VALUES
  ('e0000004-0000-0000-0000-000000000001', 'c0000001-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000011', 'Sarah Mitchell', 'completed', '2026-01-01', '2026-01-20'),
  ('e0000004-0000-0000-0000-000000000002', 'c0000001-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000012', 'James Cooper', 'in_progress', '2026-03-01', NULL),
  ('e0000004-0000-0000-0000-000000000003', 'c0000001-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000013', 'Maria Garcia', 'in_progress', '2026-03-05', NULL),
  ('e0000004-0000-0000-0000-000000000004', 'c0000001-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000014', 'Tom Nguyen', 'enrolled', '2026-03-25', NULL);

-- HVAC has zero enrollments (edge case)

-- ── Module Progress ──
-- Sarah Mitchell — Plumbing Safety: all 6 completed
INSERT INTO module_progress (enrollment_id, module_id, status, completed_at) VALUES
  ('e0000001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000001', 'completed', '2026-01-20'),
  ('e0000001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000002', 'completed', '2026-01-25'),
  ('e0000001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000003', 'completed', '2026-02-01'),
  ('e0000001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000004', 'completed', '2026-02-10'),
  ('e0000001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000005', 'completed', '2026-02-20'),
  ('e0000001-0000-0000-0000-000000000001', 'm0000001-0000-0000-0000-000000000006', 'completed', '2026-02-28');

-- James Cooper — Plumbing Safety: 3 completed, 1 in_progress, 2 not_started
INSERT INTO module_progress (enrollment_id, module_id, status, completed_at) VALUES
  ('e0000001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000001', 'completed', '2026-02-05'),
  ('e0000001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000002', 'completed', '2026-02-12'),
  ('e0000001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000003', 'completed', '2026-02-20'),
  ('e0000001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000004', 'in_progress', NULL),
  ('e0000001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000005', 'not_started', NULL),
  ('e0000001-0000-0000-0000-000000000002', 'm0000001-0000-0000-0000-000000000006', 'not_started', NULL);

-- Sarah Mitchell — Electrical Code: 2 completed, 1 in_progress, 1 not_started
INSERT INTO module_progress (enrollment_id, module_id, status, completed_at) VALUES
  ('e0000002-0000-0000-0000-000000000001', 'm0000002-0000-0000-0000-000000000001', 'completed', '2026-02-15'),
  ('e0000002-0000-0000-0000-000000000001', 'm0000002-0000-0000-0000-000000000002', 'completed', '2026-02-22'),
  ('e0000002-0000-0000-0000-000000000001', 'm0000002-0000-0000-0000-000000000003', 'in_progress', NULL),
  ('e0000002-0000-0000-0000-000000000001', 'm0000002-0000-0000-0000-000000000004', 'not_started', NULL);

-- Tom Nguyen — Electrical Code: all 4 completed
INSERT INTO module_progress (enrollment_id, module_id, status, completed_at) VALUES
  ('e0000002-0000-0000-0000-000000000002', 'm0000002-0000-0000-0000-000000000001', 'completed', '2026-01-12'),
  ('e0000002-0000-0000-0000-000000000002', 'm0000002-0000-0000-0000-000000000002', 'completed', '2026-01-20'),
  ('e0000002-0000-0000-0000-000000000002', 'm0000002-0000-0000-0000-000000000003', 'completed', '2026-02-01'),
  ('e0000002-0000-0000-0000-000000000002', 'm0000002-0000-0000-0000-000000000004', 'completed', '2026-02-15');

-- Sarah Mitchell — Customer Service: all 5 completed
INSERT INTO module_progress (enrollment_id, module_id, status, completed_at) VALUES
  ('e0000004-0000-0000-0000-000000000001', 'm0000004-0000-0000-0000-000000000001', 'completed', '2026-01-05'),
  ('e0000004-0000-0000-0000-000000000001', 'm0000004-0000-0000-0000-000000000002', 'completed', '2026-01-08'),
  ('e0000004-0000-0000-0000-000000000001', 'm0000004-0000-0000-0000-000000000003', 'completed', '2026-01-12'),
  ('e0000004-0000-0000-0000-000000000001', 'm0000004-0000-0000-0000-000000000004', 'completed', '2026-01-16'),
  ('e0000004-0000-0000-0000-000000000001', 'm0000004-0000-0000-0000-000000000005', 'completed', '2026-01-20');

-- James Cooper — Customer Service: 2 completed, 1 in_progress, 2 not_started
INSERT INTO module_progress (enrollment_id, module_id, status, completed_at) VALUES
  ('e0000004-0000-0000-0000-000000000002', 'm0000004-0000-0000-0000-000000000001', 'completed', '2026-03-05'),
  ('e0000004-0000-0000-0000-000000000002', 'm0000004-0000-0000-0000-000000000002', 'completed', '2026-03-10'),
  ('e0000004-0000-0000-0000-000000000002', 'm0000004-0000-0000-0000-000000000003', 'in_progress', NULL),
  ('e0000004-0000-0000-0000-000000000002', 'm0000004-0000-0000-0000-000000000004', 'not_started', NULL),
  ('e0000004-0000-0000-0000-000000000002', 'm0000004-0000-0000-0000-000000000005', 'not_started', NULL);

-- Maria Garcia — Customer Service: 1 completed, 1 in_progress, 3 not_started
INSERT INTO module_progress (enrollment_id, module_id, status, completed_at) VALUES
  ('e0000004-0000-0000-0000-000000000003', 'm0000004-0000-0000-0000-000000000001', 'completed', '2026-03-10'),
  ('e0000004-0000-0000-0000-000000000003', 'm0000004-0000-0000-0000-000000000002', 'in_progress', NULL),
  ('e0000004-0000-0000-0000-000000000003', 'm0000004-0000-0000-0000-000000000003', 'not_started', NULL),
  ('e0000004-0000-0000-0000-000000000003', 'm0000004-0000-0000-0000-000000000004', 'not_started', NULL),
  ('e0000004-0000-0000-0000-000000000003', 'm0000004-0000-0000-0000-000000000005', 'not_started', NULL);
