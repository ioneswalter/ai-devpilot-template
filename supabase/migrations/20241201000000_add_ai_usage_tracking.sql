/**
 * Migration: Add AI usage tracking tables for DevPilot cost monitoring
 * Creates tables for model registry, usage logging, and model selections
 */

-- Create ai_models table for dynamic model registry
CREATE TABLE ai_models (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'anthropic',
  version TEXT NOT NULL,
  input_cost_per_token DECIMAL(12,8) NOT NULL,
  output_cost_per_token DECIMAL(12,8) NOT NULL,
  context_window INTEGER NOT NULL DEFAULT 200000,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create ai_usage_logs table for tracking individual API calls
CREATE TABLE ai_usage_logs (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  model_id TEXT NOT NULL REFERENCES ai_models(id),
  operation_type TEXT NOT NULL CHECK (operation_type IN ('spec_review', 'implementation', 'code_review', 'test_generation', 'error_fixing')),
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_cost DECIMAL(10,6) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error', 'partial')),
  error_message TEXT,
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create ai_model_selections table for per-feature-per-admin model choices
CREATE TABLE ai_model_selections (
  id TEXT PRIMARY KEY,
  feature_id TEXT NOT NULL,
  admin_id TEXT NOT NULL,
  model_id TEXT NOT NULL REFERENCES ai_models(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_ai_usage_logs_feature_id ON ai_usage_logs(feature_id);
CREATE INDEX idx_ai_usage_logs_admin_id ON ai_usage_logs(admin_id);
CREATE INDEX idx_ai_usage_logs_created_at ON ai_usage_logs(created_at);
CREATE INDEX idx_ai_usage_logs_model_operation ON ai_usage_logs(model_id, operation_type);
CREATE INDEX idx_ai_usage_logs_feature_operation ON ai_usage_logs(feature_id, operation_type);

CREATE INDEX idx_ai_model_selections_feature_id ON ai_model_selections(feature_id);
CREATE INDEX idx_ai_model_selections_admin_id ON ai_model_selections(admin_id);

-- Composite unique index for model selections (one selection per feature per admin)
CREATE UNIQUE INDEX idx_ai_model_selections_unique ON ai_model_selections(feature_id, admin_id);

-- Create index for active models lookup
CREATE INDEX idx_ai_models_active ON ai_models(is_active) WHERE is_active = true;

-- Insert seed data for current Anthropic models (December 2024 pricing)
INSERT INTO ai_models (id, name, provider, version, input_cost_per_token, output_cost_per_token, context_window, is_active) VALUES
('claude-3-5-sonnet-20241022', 'Claude 3.5 Sonnet', 'anthropic', '20241022', 0.000003, 0.000015, 200000, true),
('claude-3-haiku-20240307', 'Claude 3 Haiku', 'anthropic', '20240307', 0.00000025, 0.00000125, 200000, true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at
CREATE TRIGGER update_ai_models_updated_at 
  BEFORE UPDATE ON ai_models 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_usage_logs_updated_at 
  BEFORE UPDATE ON ai_usage_logs 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_ai_model_selections_updated_at 
  BEFORE UPDATE ON ai_model_selections 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();