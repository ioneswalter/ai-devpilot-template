-- FR-106 v2 / J1 — UAT auto-release trigger requires test_runs evidence.
--
-- Background: trg_uat_package_approval_releases_feature (FR-130 v2.1, see
-- 20260501030000_uat_approval_releases_feature.sql) auto-promotes a feature
-- from in_acceptance to released when its UAT package status flips to
-- 'approved'. This fires regardless of whether the feature's test_cases have
-- any actual test_runs evidence. The kanban-driven release path
-- (update-handler.ts:200) already enforces FR-145 v1.1's evidence requirement;
-- the trigger path bypassed it.
--
-- This migration replaces the trigger function body to add a test_runs evidence
-- pre-flight before promotion. Bootstrap features (is_pipeline_bootstrap=true)
-- remain exempt — they release via UAT alone with no test_runs requirement.
--
-- The check uses RAISE NOTICE + skip (not RAISE EXCEPTION + rollback) per
-- feedback_enforcement_alarms_not_errors.md — the UAT package's approval write
-- itself is preserved; only the auto-promotion is held back. Operators see
-- the NOTICE in deploy logs and can investigate the missing evidence.
--
-- Idempotent via CREATE OR REPLACE FUNCTION. Trigger binding
-- (trg_uat_package_approval_releases_feature) is unchanged.

BEGIN;

CREATE OR REPLACE FUNCTION public.fr130_v21_promote_feature_on_uat_package_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_bootstrap BOOLEAN;
  missing_count INT;
  missing_codes TEXT;
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    SELECT COALESCE(is_pipeline_bootstrap, false)
      INTO is_bootstrap
      FROM public.product_features
     WHERE id = NEW.feature_id;

    IF NOT is_bootstrap THEN
      SELECT COUNT(*),
             string_agg(tc.test_code, ', ' ORDER BY tc.test_code)
        INTO missing_count, missing_codes
        FROM public.test_cases tc
        LEFT JOIN public.test_runs tr
          ON tr.test_case_id = tc.id
         AND tr.result IN ('passed', 'pass')
       WHERE tc.feature_id = NEW.feature_id
         AND tr.id IS NULL;

      IF missing_count > 0 THEN
        RAISE NOTICE
          'FR-106 v2: skipped UAT auto-release for feature_id % — % test_case(s) lack passing test_runs evidence: %',
          NEW.feature_id, missing_count, COALESCE(missing_codes, '(unnamed)');
        RETURN NEW;
      END IF;
    END IF;

    UPDATE public.product_features
       SET status = 'released', updated_at = NOW()
     WHERE id = NEW.feature_id
       AND status = 'in_acceptance';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fr130_v21_promote_feature_on_uat_package_approval() IS
  'FR-130 v2.1 + FR-106 v2: when a UAT package transitions to approved, atomically promote the corresponding feature from in_acceptance to released. FR-106 v2 adds: pre-flight test_runs evidence check (test_cases without a test_runs.result IN (passed,pass) row block the promotion via NOTICE + skip; bootstrap features remain exempt). No-op for any other source status.';

COMMIT;
