-- FR-145 v1.3 hotfix: enforce_test_runs_evidence trigger checked result='pass'
-- but the canonical DB value written by execute-scripts.ts and execute-api-tests.ts
-- is 'passed' (707 rows globally vs 18 legacy 'pass' rows). The typo blocked all
-- legitimate passed=true updates for any test_case whose evidence used 'passed'.
--
-- Replace the function to accept both values. Idempotent via CREATE OR REPLACE.

CREATE OR REPLACE FUNCTION public.enforce_test_runs_evidence()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.passed IS NOT TRUE THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM test_runs
    WHERE test_case_id = NEW.id
      AND result IN ('passed', 'pass')
  ) THEN
    RAISE EXCEPTION 'test_cases.passed=true requires at least one test_runs row with result IN (passed,pass) for test_case_id %', NEW.id
      USING HINT = 'Run the test via the test runner before marking it passed.',
            ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;
