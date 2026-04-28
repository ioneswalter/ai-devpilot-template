-- FR-145 v1.2: deploy the test validation gates as DB triggers (deterministic
-- enforcement) instead of relying on AI prompt instructions alone.
--
-- The v1.1 criteria described AI-behavior gates that ran during \generate-tests.
-- Those gates are advisory — they help Claude produce well-formed scripts but
-- can't block bad scripts that bypass the prompt. This migration deploys the
-- same rules as PG triggers so any INSERT or UPDATE is enforced at the DB
-- layer regardless of which code path produced it.
--
-- Pairs with new Edge Function `fr145-validation-probe` that exposes these
-- triggers as a testable HTTP surface (since exec_sql RPC is unavailable in
-- prod, tests can't run direct SQL — they POST a candidate to the probe and
-- assert on the rejection code).
--
-- Cleanup: deletes 72 historical api_verification_tests rows with malformed
-- endpoints + 3 automated_test_scripts rows with banned strategies / bad
-- structure. These rows pre-date the gates and would block the new triggers.

BEGIN;

-- 1. Cleanup malformed historical rows (so the new triggers can be enforced).
DELETE FROM api_verification_tests
WHERE endpoint IS NULL
   OR endpoint = ''
   OR endpoint = 'n/a'
   OR endpoint NOT LIKE '/%'
   OR method NOT IN ('GET','POST','PUT','PATCH','DELETE');

DELETE FROM automated_test_scripts
WHERE jsonb_typeof(script_steps) <> 'array'
   OR jsonb_array_length(script_steps) < 1
   OR jsonb_array_length(script_steps) > 15
   OR (script_steps->0->>'action') <> 'navigate'
   OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(script_steps) AS step
     WHERE step->'target'->>'strategy' IN ('role:button', 'role:textbox', 'role')
   )
   OR EXISTS (
     SELECT 1 FROM jsonb_array_elements(script_steps) AS step
     WHERE step->>'action' <> 'wait'
       AND COALESCE((step->>'timeout_ms')::INT, 0) < 3000
   );

-- 2. Trigger function: enforce automated_test_scripts structural rules.
CREATE OR REPLACE FUNCTION validate_automated_test_script()
RETURNS TRIGGER AS $$
DECLARE
  step_count INT;
  step JSONB;
  step_idx INT := 0;
  banned_strategy TEXT;
BEGIN
  IF jsonb_typeof(NEW.script_steps) <> 'array' THEN
    RAISE EXCEPTION 'script_steps must be a JSONB array, got %', jsonb_typeof(NEW.script_steps)
      USING ERRCODE = 'check_violation', HINT = 'Wrap steps in a top-level array, not an object.';
  END IF;
  step_count := jsonb_array_length(NEW.script_steps);
  IF step_count < 1 OR step_count > 15 THEN
    RAISE EXCEPTION 'script_steps must have 1-15 steps, got %', step_count
      USING ERRCODE = 'check_violation';
  END IF;
  IF (NEW.script_steps->0->>'action') <> 'navigate' THEN
    RAISE EXCEPTION 'first step action must be ''navigate'', got %', (NEW.script_steps->0->>'action')
      USING ERRCODE = 'check_violation';
  END IF;
  FOR step IN SELECT * FROM jsonb_array_elements(NEW.script_steps) LOOP
    step_idx := step_idx + 1;
    IF step->>'step_number' IS NULL OR step->>'action' IS NULL OR step->'target' IS NULL OR step->>'timeout_ms' IS NULL THEN
      RAISE EXCEPTION 'step % missing required field (step_number/action/target/timeout_ms)', step_idx
        USING ERRCODE = 'check_violation';
    END IF;
    banned_strategy := step->'target'->>'strategy';
    IF banned_strategy IN ('role:button', 'role:textbox', 'role') THEN
      RAISE EXCEPTION 'step % uses banned strategy %', step_idx, banned_strategy
        USING ERRCODE = 'check_violation', HINT = 'Use text/placeholder/testid strategies instead.';
    END IF;
    IF step->>'action' <> 'wait' AND COALESCE((step->>'timeout_ms')::INT, 0) < 3000 THEN
      RAISE EXCEPTION 'step % timeout_ms must be >= 3000 (non-wait actions)', step_idx
        USING ERRCODE = 'check_violation';
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS automated_test_scripts_validate ON automated_test_scripts;
CREATE TRIGGER automated_test_scripts_validate
  BEFORE INSERT OR UPDATE OF script_steps ON automated_test_scripts
  FOR EACH ROW EXECUTE FUNCTION validate_automated_test_script();

-- 3. Trigger function: enforce api_verification_tests structural rules.
CREATE OR REPLACE FUNCTION validate_api_verification_test()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.endpoint IS NULL OR NEW.endpoint = '' OR NEW.endpoint = 'n/a' THEN
    RAISE EXCEPTION 'endpoint must be a non-empty path (got %)', COALESCE(NEW.endpoint, '<NULL>')
      USING ERRCODE = 'check_violation', HINT = 'Read the actual handler in supabase/functions/ to find the endpoint.';
  END IF;
  IF NEW.endpoint NOT LIKE '/%' THEN
    RAISE EXCEPTION 'endpoint must start with /, got %', NEW.endpoint
      USING ERRCODE = 'check_violation';
  END IF;
  IF NEW.method NOT IN ('GET','POST','PUT','PATCH','DELETE') THEN
    RAISE EXCEPTION 'method must be GET/POST/PUT/PATCH/DELETE, got %', COALESCE(NEW.method, '<NULL>')
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS api_verification_tests_validate ON api_verification_tests;
CREATE TRIGGER api_verification_tests_validate
  BEFORE INSERT OR UPDATE ON api_verification_tests
  FOR EACH ROW EXECUTE FUNCTION validate_api_verification_test();

COMMIT;
