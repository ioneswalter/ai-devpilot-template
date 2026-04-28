-- FR-145 v1.1 hardening: enforce real test_runs evidence for test_cases.passed
--
-- Problem: 1000+ existing test_cases are marked passed=true with zero
-- corresponding test_runs rows. This phantom flag has driven false
-- auto-releases (FR-089 v1.1 on 2026-04-25, FR-145 v1.1, and many others).
-- The auto-release logic in deploy and the validateTestGate in
-- roadmap-admin-features both trust the flag without verifying execution.
--
-- This migration:
--   1. Adds a trigger that rejects INSERT or UPDATE OF passed = true
--      unless at least one test_runs.result='pass' exists for that test_case.
--   2. Targeted backfill: strips phantom flags from FR-145's 10 test_cases
--      and reverts FR-145 parent status from 'released' back to 'in_testing'.
--      Other features keep their (phantom) released status — auto-reverting
--      113 features would be too destructive. The trigger prevents future
--      occurrences and the new gate logic prevents future false releases.
--
-- Pairs with code changes:
--   - validateTestGate in roadmap-admin-features/update-handler.ts
--   - auto-release step in .claude/commands/deploy.md
--   - generate-tests.md (BLOCK gates + coverage)
--   - build.md (test execution required for completion)

BEGIN;

-- 1. Trigger function: require test_runs evidence for passed=true
CREATE OR REPLACE FUNCTION enforce_test_runs_evidence()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.passed IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM test_runs
    WHERE test_case_id = NEW.id
      AND result = 'pass'
  ) THEN
    RAISE EXCEPTION 'test_cases.passed=true requires at least one test_runs row with result=pass for test_case_id %', NEW.id
      USING HINT = 'Run the test via the test runner before marking it passed.',
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS test_cases_require_evidence ON test_cases;

CREATE TRIGGER test_cases_require_evidence
  BEFORE INSERT OR UPDATE OF passed ON test_cases
  FOR EACH ROW
  WHEN (NEW.passed = true)
  EXECUTE FUNCTION enforce_test_runs_evidence();

-- 2. Targeted backfill: clean FR-145's phantom flags + revert parent status.
-- The trigger blocks new phantom passed=true; existing phantoms on other
-- features are grandfathered (would be too destructive to mass-revert 113
-- features). Setting passed = NULL bypasses the trigger (only true is gated).
UPDATE test_cases
SET passed = NULL,
    updated_at = now()
WHERE feature_id = (SELECT id FROM product_features WHERE feature_code = 'FR-145')
  AND passed = true
  AND NOT EXISTS (
    SELECT 1 FROM test_runs WHERE test_case_id = test_cases.id AND result = 'pass'
  );

-- 3. Revert FR-145 parent status — it was auto-released on phantom flags.
-- Move back to in_testing so a real test run can drive the next release.
UPDATE product_features
SET status = 'in_testing',
    updated_at = now()
WHERE feature_code = 'FR-145'
  AND status = 'released';

COMMIT;
