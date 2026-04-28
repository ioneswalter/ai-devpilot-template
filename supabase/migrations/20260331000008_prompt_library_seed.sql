-- Seed prompt library with categories and existing proven prompts
-- Categories derived from the 18 AI Edge Functions audit

INSERT INTO prompt_categories (id, slug, name, description, icon, sort_order) VALUES
  ('cat-impl', 'implementation_planning', 'Implementation Planning', 'Task breakdown, architecture decisions, and implementation plans from feature specs', 'code', 1),
  ('cat-codegen', 'code_generation', 'Code Generation', 'TypeScript code generation, task splitting, and test data creation', 'terminal', 2),
  ('cat-review', 'spec_review', 'Spec Review & Enrichment', 'Feature specification analysis, enrichment, and constitution compliance', 'search', 3),
  ('cat-testing', 'test_guidance', 'Test Guidance & Automation', 'Manual QA guidance, visual assertions, exploratory test suggestions', 'check-circle', 4),
  ('cat-error', 'error_analysis', 'Error Analysis & Fixing', 'CI error fixing, browser error analysis, and diagnostic suggestions', 'alert-triangle', 5),
  ('cat-mediation', 'dispute_mediation', 'Dispute Mediation', 'AI Coach dispute resolution between customers and providers', 'scale', 6),
  ('cat-marketplace', 'marketplace_assist', 'Marketplace Assistance', 'Category search, checklist suggestions, and job post helpers', 'shopping-bag', 7),
  ('cat-ideation', 'ideation_chat', 'Ideation & Product Chat', 'Feature brainstorming, proposal generation, and roadmap copilot', 'message-circle', 8)
ON CONFLICT (id) DO NOTHING;

-- Seed prompt templates from existing Edge Functions
INSERT INTO prompt_templates (id, category_id, slug, name, description, model_recommendation, max_tokens, source_function, tags, is_active) VALUES
  -- Implementation Planning
  ('pt-impl-plan', 'cat-impl', 'implementation-plan', 'Feature Implementation Plan', 'Generates structured task breakdown from feature spec with file paths and dependencies', 'claude-sonnet-4-5-20250514', 8192, 'implement-feature/ai-implementation.ts', ARRAY['planning', 'tasks', 'architecture'], true),
  ('pt-task-split', 'cat-impl', 'intelligent-task-split', 'Intelligent Task Splitting', 'Splits complex tasks into 2-5 subtasks based on complexity scoring', 'claude-haiku-4-5-20251001', 2048, 'implement-feature/split-task.ts', ARRAY['splitting', 'complexity', 'subtasks'], true),

  -- Code Generation
  ('pt-codegen', 'cat-codegen', 'code-generation', 'TypeScript Code Generation', 'Generates implementation code using SpecKit artifacts for context', 'claude-sonnet-4-5-20250514', 8192, 'implement-feature/ai-codegen.ts', ARRAY['typescript', 'react', 'supabase'], true),
  ('pt-testdata', 'cat-codegen', 'test-data-generation', 'Test Data SQL Generator', 'Creates realistic SQL INSERT statements for test data seeding', 'claude-sonnet-4-5-20250514', 2048, 'test-data-gen/generate.ts', ARRAY['sql', 'seed-data', 'testing'], true),
  ('pt-test-script', 'cat-codegen', 'test-script-generation', 'Automated Test Script Generator', 'Converts acceptance criteria into automated browser test scripts', 'claude-sonnet-4-5-20250514', 4096, 'test-automation/generate-scripts.ts', ARRAY['automation', 'testing', 'browser'], true),
  ('pt-manual-convert', 'cat-codegen', 'manual-to-automated', 'Manual-to-Automated Test Converter', 'Converts guided testing evidence into reusable automated test scripts', 'claude-sonnet-4-5-20250514', 4096, 'test-automation/convert-manual.ts', ARRAY['automation', 'conversion', 'testing'], true),

  -- Spec Review
  ('pt-enrichment', 'cat-review', 'spec-enrichment', 'Feature Spec Enrichment', 'Analyzes specs against constitution and generates test cases, edge cases, and refined criteria', 'claude-opus-4-1-20250805', 4096, 'spec-review/ai-enrichment.ts', ARRAY['constitution', 'criteria', 'edge-cases'], true),

  -- Test Guidance
  ('pt-guidance', 'cat-testing', 'test-guidance', 'QA Test Guidance Generator', 'Generates step-by-step manual QA test instructions from acceptance criteria and page state', 'claude-sonnet-4-5-20250514', 4096, 'guided-testing/generate-guidance.ts', ARRAY['qa', 'manual-testing', 'steps'], true),
  ('pt-validate', 'cat-testing', 'state-validation', 'Page State Validator', 'Validates actual page state against expected test outcomes', 'claude-sonnet-4-5-20250514', 2048, 'guided-testing/validate-state.ts', ARRAY['validation', 'state', 'assertion'], true),
  ('pt-exploratory', 'cat-testing', 'exploratory-suggestion', 'Exploratory Test Suggester', 'Suggests targeted exploratory tests when a test step fails', 'claude-sonnet-4-5-20250514', 2048, 'guided-testing/suggest-exploratory.ts', ARRAY['exploratory', 'failure-analysis', 'root-cause'], true),
  ('pt-visual', 'cat-testing', 'visual-assertion', 'Visual Screenshot Assertion', 'Uses AI vision to validate screenshots against expected visual outcomes', 'claude-sonnet-4-5-20250514', 2048, 'test-automation/visual-assertion.ts', ARRAY['vision', 'screenshot', 'visual-testing'], true),

  -- Error Analysis
  ('pt-ci-fix', 'cat-error', 'ci-error-fixer', 'CI Pipeline Error Fixer', 'Fixes TypeScript, ESLint, and test errors with multi-stage auto-fix loop', 'claude-sonnet-4-5-20250514', 8192, 'pipeline-orchestrator/ci-check.ts', ARRAY['ci', 'typescript', 'eslint', 'auto-fix'], true),
  ('pt-error-fix', 'cat-error', 'implementation-error-fixer', 'Implementation Error Fixer', 'Fixes errors in generated code files grouped by error type', 'claude-sonnet-4-5-20250514', 8192, 'implement-feature/fix-errors.ts', ARRAY['errors', 'typescript', 'fix'], true),
  ('pt-browser-error', 'cat-error', 'browser-error-analysis', 'Browser Error Analyser', 'Analyses client-side errors with DOM context and suggests fixes', 'claude-sonnet-4-5-20250514', 4096, 'process-error-report/claude-service.ts', ARRAY['browser', 'dom', 'debugging'], true),

  -- Dispute Mediation
  ('pt-mediation', 'cat-mediation', 'dispute-mediation', 'AI Coach Dispute Resolution', 'Reviews disputes and makes binding payment split decisions', 'claude-sonnet-4-5-20250514', 2048, 'disputes-initiate-ai-mediation/index.ts', ARRAY['disputes', 'payments', 'mediation'], true),

  -- Marketplace Assistance
  ('pt-category', 'cat-marketplace', 'category-search', 'Service Category Matcher', 'Semantic matching of service categories with duplicate detection', 'claude-haiku-4-5-20251001', 1024, 'service-categories-search/index.ts', ARRAY['categories', 'matching', 'dedup'], true),
  ('pt-checklist', 'cat-marketplace', 'checklist-suggestion', 'Job Checklist Suggester', 'Generates category-specific checklist items for marketplace job posts', 'claude-haiku-4-5-20251001', 1024, 'marketplace-ai-checklist-suggest/index.ts', ARRAY['checklist', 'marketplace', 'suggestions'], true),

  -- Ideation Chat
  ('pt-devpilot', 'cat-ideation', 'devpilot-chat', 'DevPilot Ideation Chat', 'Interactive feature brainstorming with proposal generation and roadmap context', 'claude-sonnet-4-5-20250514', 8192, 'devpilot-chat/index.ts', ARRAY['ideation', 'proposals', 'brainstorming'], true),
  ('pt-copilot', 'cat-ideation', 'roadmap-copilot', 'Roadmap Admin Copilot', 'Conversational roadmap management with feature CRUD tools', 'claude-sonnet-4-5-20250514', 4096, 'copilot/chat/index.ts', ARRAY['roadmap', 'admin', 'tools'], true)
ON CONFLICT (id) DO NOTHING;

-- Seed initial SDLC shortcuts
INSERT INTO sdlc_shortcuts (id, command, name, description, expanded_prompt, category_id, prompt_template_id, is_active) VALUES
  ('sc-review', '/review', 'Review Feature Spec', 'Quick spec review with AI enrichment suggestions', 'Review this feature specification against our constitution principles. Identify missing acceptance criteria, edge cases, security gaps, and testability issues. Suggest improvements.', 'cat-review', 'pt-enrichment', true),
  ('sc-test', '/test', 'Generate Test Guidance', 'Create step-by-step test instructions for a feature', 'Generate step-by-step QA test instructions for this feature based on its acceptance criteria. Each step should reference specific UI elements and have clear expected outcomes.', 'cat-testing', 'pt-guidance', true),
  ('sc-implement', '/implement', 'Plan Implementation', 'Generate a structured implementation plan', 'Generate a detailed implementation plan for this feature. Break it into dependency-ordered tasks, each targeting a single file. Follow the project constitution and SpecKit workflow.', 'cat-impl', 'pt-impl-plan', true),
  ('sc-fix', '/fix', 'Fix Errors', 'Analyse and fix TypeScript/ESLint errors', 'Analyse these errors and generate corrected code. Fix TypeScript type errors, missing imports, ESLint violations, and test failures. Follow strict TypeScript mode and zero any types.', 'cat-error', 'pt-ci-fix', true),
  ('sc-explore', '/explore', 'Suggest Exploratory Tests', 'Probe failure root causes', 'This test step failed. Analyse the failure context (console errors, network failures, page state) and suggest 1-3 targeted exploratory tests to find the root cause.', 'cat-testing', 'pt-exploratory', true)
ON CONFLICT (id) DO NOTHING;
