-- FR-149 v1.1 hardening: backfill phantom rows + enforce NOT NULL on version_label
--
-- Background: snapshotFeatureVersion (legacy v1.0 audit-trail in
-- roadmap-admin-features) was inserting feature_versions rows with
-- version_label IS NULL on every admin edit. Postgres unique constraints
-- treat NULL as distinct, so the existing UNIQUE(feature_id, version_label)
-- did not block these phantom rows. They subsequently broke
-- bumpFeatureVersion / getInFlightVersion by appearing as "latest".
--
-- This migration:
--   1. Deletes existing phantom rows (label IS NULL AND audit-trail summary).
--   2. Asserts no remaining NULL labels exist (fail fast if any unexpected
--      legitimate NULL rows are present so an operator can investigate).
--   3. Adds NOT NULL constraint on version_label as a defense-in-depth check —
--      any future code path attempting to insert a NULL-label row now fails
--      at the database layer regardless of application-level guards.
--
-- Pairs with the code change that removes snapshotFeatureVersion entirely
-- from update-handler.ts. Code change must deploy before this migration runs;
-- otherwise legacy admin edits would hit the new NOT NULL and 500.

BEGIN;

-- 1. Delete phantom rows produced by the deprecated snapshotFeatureVersion.
--    Pattern: NULL label AND change_summary follows the legacy "Fields updated: …"
--    format. We deliberately do NOT delete by NULL label alone — some legitimate
--    rows could theoretically have null labels for other reasons; the change_summary
--    pattern is the unique fingerprint of the deprecated path.
DELETE FROM feature_versions
WHERE version_label IS NULL
  AND change_summary LIKE 'Fields updated:%';

-- 2. Fail loudly if any other NULL-label rows remain. An operator must clean
--    these up by hand before re-running the migration. Idempotent: if no rows
--    remain (the expected case), this is a no-op.
DO $$
DECLARE
  remaining INT;
BEGIN
  SELECT COUNT(*) INTO remaining FROM feature_versions WHERE version_label IS NULL;
  IF remaining > 0 THEN
    RAISE EXCEPTION 'feature_versions still has % rows with NULL version_label after backfill. Inspect them before re-running.', remaining;
  END IF;
END $$;

-- 3. Lock the door: future inserts cannot omit version_label.
ALTER TABLE feature_versions
  ALTER COLUMN version_label SET NOT NULL;

COMMIT;
