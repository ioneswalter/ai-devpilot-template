-- FR-112 Fix: Add RLS, update model pricing, expand operation types
-- Previous migration created tables but missed RLS (constitution violation)

-- Enable RLS on all AI tracking tables
ALTER TABLE ai_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_usage_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_model_selections ENABLE ROW LEVEL SECURITY;

-- Service role full access policies
DROP POLICY IF EXISTS "Service role full access on ai_models" ON ai_models;
CREATE POLICY "Service role full access on ai_models"
  ON ai_models FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access on ai_usage_logs" ON ai_usage_logs;
CREATE POLICY "Service role full access on ai_usage_logs"
  ON ai_usage_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Service role full access on ai_model_selections" ON ai_model_selections;
CREATE POLICY "Service role full access on ai_model_selections"
  ON ai_model_selections FOR ALL USING (true) WITH CHECK (true);

-- Update operation_type check to include ideation and pipeline operations
ALTER TABLE ai_usage_logs DROP CONSTRAINT IF EXISTS ai_usage_logs_operation_type_check;
ALTER TABLE ai_usage_logs ADD CONSTRAINT ai_usage_logs_operation_type_check
  CHECK (operation_type IN ('ideation', 'spec_review', 'code_generation', 'task_splitting', 'learning', 'test_data_gen', 'implementation', 'guided_testing', 'code_review', 'test_generation', 'error_fixing'));

-- Update model pricing to current Claude models (March 2026)
UPDATE ai_models SET is_active = false WHERE id IN ('claude-3-5-sonnet-20241022', 'claude-3-haiku-20240307');

INSERT INTO ai_models (id, name, provider, version, input_cost_per_token, output_cost_per_token, context_window, is_active) VALUES
('claude-opus-4-1-20250805', 'Claude Opus 4.1', 'anthropic', '20250805', 0.000015, 0.000075, 200000, true),
('claude-sonnet-4-5-20250514', 'Claude Sonnet 4.5', 'anthropic', '20250514', 0.000003, 0.000015, 200000, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  input_cost_per_token = EXCLUDED.input_cost_per_token,
  output_cost_per_token = EXCLUDED.output_cost_per_token,
  is_active = EXCLUDED.is_active,
  updated_at = now();
