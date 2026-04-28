-- FR-117: Add complexity_score JSONB column
ALTER TABLE implementation_task_items
  ADD COLUMN IF NOT EXISTS complexity_score JSONB;
