-- Track whether generated code has been applied to the codebase
ALTER TABLE implementation_requests ADD COLUMN IF NOT EXISTS code_applied BOOLEAN DEFAULT FALSE;
ALTER TABLE implementation_requests ADD COLUMN IF NOT EXISTS code_applied_at TIMESTAMPTZ DEFAULT NULL;
