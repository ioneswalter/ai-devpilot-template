-- FR-159: Unified Apply Action — schema additions
-- Adds:
--   product_features.is_pipeline_bootstrap (BOOLEAN)
--   implementation_task_items.code_source (TEXT with CHECK)
-- Backfills:
--   is_pipeline_bootstrap=true for the curated pipeline-bootstrap feature list
--   code_source='hand_written' for tasks on bootstrap features that have no generated_code

-- 1) is_pipeline_bootstrap on product_features
ALTER TABLE product_features
  ADD COLUMN IF NOT EXISTS is_pipeline_bootstrap BOOLEAN NOT NULL DEFAULT false;

-- 2) code_source on implementation_task_items
ALTER TABLE implementation_task_items
  ADD COLUMN IF NOT EXISTS code_source TEXT NOT NULL DEFAULT 'ai_generated';

-- 3) CHECK constraint on code_source values
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'implementation_task_items_code_source_check'
  ) THEN
    ALTER TABLE implementation_task_items
      ADD CONSTRAINT implementation_task_items_code_source_check
      CHECK (code_source IN ('ai_generated', 'hand_written', 'mixed'));
  END IF;
END $$;

-- 4) Backfill the curated pipeline-bootstrap feature list.
--    Final list documented in this migration's PR description; auto-includes
--    FR-159 itself (it modifies the Build panel that the AI implementer uses).
UPDATE product_features
   SET is_pipeline_bootstrap = true
 WHERE feature_code IN ('FR-141', 'FR-149', 'FR-156', 'FR-159', 'FR-161');

-- 5) Backfill code_source='hand_written' for tasks on bootstrap features whose
--    generated_code is NULL (i.e. they were hand-implemented out of band).
UPDATE implementation_task_items iti
   SET code_source = 'hand_written'
  FROM implementation_requests ir
  JOIN product_features pf ON pf.id = ir.feature_id
 WHERE iti.request_id = ir.id
   AND pf.is_pipeline_bootstrap = true
   AND iti.generated_code IS NULL;
