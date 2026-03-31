-- Seed initial AI learnings from known patterns and past failures

INSERT INTO ai_learnings (id, category_id, learning_type, title, context, correction, applies_to, severity, is_active) VALUES
  -- Code Generation learnings
  ('learn-001', 'cat-codegen', 'constraint', 'Max 300 lines per file', 'AI-generated files frequently exceed the 300-line limit from the constitution', 'Always enforce max 300 lines per file (500 for test files and migrations). Split large files into smaller modules.', ARRAY['ai-codegen', 'fix-errors'], 'critical', true),
  ('learn-002', 'cat-codegen', 'constraint', 'Zero any types in TypeScript', 'AI sometimes generates `any` types for convenience, violating strict mode', 'Never use `any` type. Use `unknown` with type guards, or define proper interfaces. This is NON-NEGOTIABLE per constitution.', ARRAY['ai-codegen', 'fix-errors', 'ci-check'], 'critical', true),
  ('learn-003', 'cat-codegen', 'correction', 'Do not overwrite shared files', 'Code generation occasionally overwrites admin-api.ts or schema.prisma entirely', 'Never regenerate shared files: admin-api.ts, RoadmapContent.tsx, schema.prisma, supabase-client.ts. Use task_type "modify" to append.', ARRAY['ai-codegen', 'ai-implementation'], 'critical', true),
  ('learn-004', 'cat-codegen', 'pattern', 'Edge Function CORS headers required', 'AI-generated Edge Functions sometimes miss CORS headers, causing browser errors', 'ALL Edge Function responses must include Access-Control-Allow-Origin, Allow-Headers, and Allow-Methods headers. Handle OPTIONS preflight.', ARRAY['ai-codegen'], 'high', true),

  -- Implementation Planning learnings
  ('learn-005', 'cat-impl', 'pattern', 'Features integrate into Roadmap as modal panels', 'AI sometimes creates standalone route pages for new features', 'New features should integrate into the existing Roadmap board UI as modal panels, not standalone route pages. Only DevPilot-level pages get their own routes.', ARRAY['ai-implementation'], 'high', true),
  ('learn-006', 'cat-impl', 'constraint', 'Use features/ directory not components/', 'AI places feature code in components/ instead of features/<domain>/', 'Feature components go in apps/web/src/features/<domain>/, NOT apps/web/src/components/<feature>/. Colocate hooks and types with features.', ARRAY['ai-implementation', 'ai-codegen'], 'high', true),

  -- Test Guidance learnings
  ('learn-007', 'cat-testing', 'tip', 'Reference actual UI elements from page state', 'Test guidance sometimes references generic selectors instead of actual elements', 'Always reference ACTUAL UI elements from the page state JSON (buttons by text content, inputs by label, links by href). Never guess element selectors.', ARRAY['generate-guidance', 'validate-state'], 'medium', true),
  ('learn-008', 'cat-testing', 'correction', 'Map every step to an acceptance criterion', 'Test steps sometimes miss linking back to specific acceptance criteria', 'Every test step must map to a specific acceptance criterion (AC-1, AC-2, etc.). Unlinked steps reduce traceability and PM confidence.', ARRAY['generate-guidance', 'test-automation'], 'medium', true),

  -- Error Analysis learnings
  ('learn-009', 'cat-error', 'pattern', 'Group errors by file before fixing', 'Fixing errors one-by-one leads to cascading fix conflicts', 'Group all errors by file path, then fix all errors in a single file at once. This prevents one fix from conflicting with another in the same file.', ARRAY['fix-errors', 'ci-check'], 'high', true),

  -- Spec Review learnings
  ('learn-010', 'cat-review', 'tip', 'Check for RLS policy gaps in every feature', 'Features with new tables sometimes ship without RLS policies', 'Every new database table MUST have RLS enabled with appropriate policies. Flag any feature that creates tables without mentioning RLS in its criteria.', ARRAY['spec-enrichment'], 'critical', true)
ON CONFLICT (id) DO NOTHING;
