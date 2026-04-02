-- FR-122: Default course templates

-- Template 1: Safety Fundamentals (4 modules)
WITH t1 AS (
  INSERT INTO course_templates (name, description, category)
  VALUES ('Safety Fundamentals', 'Standard safety training structure for trade services', 'Safety')
  RETURNING id
)
INSERT INTO template_modules (template_id, title, description, sort_order)
SELECT t1.id, m.title, m.description, m.sort_order
FROM t1, (VALUES
  ('Introduction to Safety', 'Overview of workplace safety principles and regulations', 0),
  ('Hazard Identification', 'Recognising and assessing common workplace hazards', 1),
  ('Safe Work Practices', 'Procedures and techniques for safe task execution', 2),
  ('Emergency Response', 'Emergency protocols, first aid basics, and incident reporting', 3)
) AS m(title, description, sort_order);

-- Template 2: Technical Skills (5 modules)
WITH t2 AS (
  INSERT INTO course_templates (name, description, category)
  VALUES ('Technical Skills', 'Hands-on technical training structure for trade professionals', 'Technical')
  RETURNING id
)
INSERT INTO template_modules (template_id, title, description, sort_order)
SELECT t2.id, m.title, m.description, m.sort_order
FROM t2, (VALUES
  ('Foundations', 'Core concepts and terminology', 0),
  ('Tools and Equipment', 'Proper selection, use, and maintenance of tools', 1),
  ('Techniques and Methods', 'Step-by-step procedures for common tasks', 2),
  ('Troubleshooting', 'Diagnosing and resolving common issues', 3),
  ('Best Practices', 'Industry standards and quality assurance', 4)
) AS m(title, description, sort_order);

-- Template 3: Customer Service (3 modules)
WITH t3 AS (
  INSERT INTO course_templates (name, description, category)
  VALUES ('Customer Service Excellence', 'Communication and service skills for client-facing professionals', 'Business')
  RETURNING id
)
INSERT INTO template_modules (template_id, title, description, sort_order)
SELECT t3.id, m.title, m.description, m.sort_order
FROM t3, (VALUES
  ('Professional Communication', 'Effective communication with clients and team members', 0),
  ('Service Delivery', 'Managing expectations, timelines, and quality standards', 1),
  ('Handling Difficult Situations', 'Conflict resolution, complaints, and recovery strategies', 2)
) AS m(title, description, sort_order);
