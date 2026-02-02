-- Add implementing_features column to product_features table
-- For user stories: maps acceptance criterion index to implementing feature codes
-- Example: {"0": ["FR-001"], "1": ["FR-002"], "2": ["FR-002", "FR-003"]}
ALTER TABLE product_features ADD COLUMN IF NOT EXISTS implementing_features JSONB DEFAULT NULL;
