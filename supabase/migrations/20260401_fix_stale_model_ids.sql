-- Hotfix: Update stale Claude model IDs after Anthropic deprecated old model names
-- claude-sonnet-4-5-20250514 → claude-sonnet-4-6
-- Also add claude-opus-4-6 alongside existing claude-opus-4-1-20250805

-- 1. Update ai_models table: replace deprecated Sonnet, add new Opus
UPDATE ai_models SET
  id = 'claude-sonnet-4-6',
  name = 'Claude Sonnet 4.6',
  version = '4.6',
  updated_at = NOW()
WHERE id = 'claude-sonnet-4-5-20250514';

INSERT INTO ai_models (id, name, provider, version, input_cost_per_token, output_cost_per_token, context_window, is_active)
VALUES ('claude-opus-4-6', 'Claude Opus 4.6', 'anthropic', '4.6', 0.000015, 0.000075, 200000, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  version = EXCLUDED.version,
  input_cost_per_token = EXCLUDED.input_cost_per_token,
  output_cost_per_token = EXCLUDED.output_cost_per_token,
  is_active = true,
  updated_at = NOW();

-- Add Haiku if missing
INSERT INTO ai_models (id, name, provider, version, input_cost_per_token, output_cost_per_token, context_window, is_active)
VALUES ('claude-haiku-4-5-20251001', 'Claude Haiku 4.5', 'anthropic', '20251001', 0.0000008, 0.000004, 200000, true)
ON CONFLICT (id) DO NOTHING;

-- 2. Update prompt_library default model recommendation
ALTER TABLE prompt_templates ALTER COLUMN model_recommendation SET DEFAULT 'claude-sonnet-4-6';

UPDATE prompt_templates
SET model_recommendation = 'claude-sonnet-4-6'
WHERE model_recommendation = 'claude-sonnet-4-5-20250514';

-- 3. Update any ai_usage_logs referencing old model ID (for historical consistency)
UPDATE ai_usage_logs
SET model_id = 'claude-sonnet-4-6'
WHERE model_id IN ('claude-sonnet-4-5-20250514', 'claude-sonnet-4-20250514');
