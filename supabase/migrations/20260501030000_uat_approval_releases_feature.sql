-- FR-130 v2.1 housekeeping: auto-release feature when its UAT package transitions
-- to approved. Closes the gap where features got stuck at in_acceptance after
-- UAT sign-off because no path promoted them to released.
--
-- Existing chain (pre-this-migration):
--   in_testing → trg_uat_package_promotes_feature (INSERT in_review)
--   → in_acceptance → uat-submit-review UPDATE pkg.status='approved'
--   → ??? (gap — feature stays in_acceptance forever)
--
-- This migration adds:
--   trg_uat_package_approval_releases_feature → in_acceptance → released
--
-- Idempotent: every DDL uses IF NOT EXISTS / OR REPLACE; backfill filters to
-- status = 'in_acceptance' so it never regresses already-released features.

BEGIN;

-- 1. Trigger function — when a UAT package status flips to 'approved' on UPDATE,
--    atomically promote the corresponding feature from in_acceptance to released.
--    Guarded so released/in_testing/in_development features are not regressed.
CREATE OR REPLACE FUNCTION public.fr130_v21_promote_feature_on_uat_package_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS NULL OR OLD.status != 'approved') THEN
    UPDATE public.product_features
       SET status = 'released', updated_at = NOW()
     WHERE id = NEW.feature_id
       AND status = 'in_acceptance';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fr130_v21_promote_feature_on_uat_package_approval() IS
  'FR-130 v2.1 housekeeping: when a UAT package transitions to approved (UPDATE), atomically promote the corresponding feature from in_acceptance to released. No-op for any other source status (idempotent, never regresses a released feature; never advances a feature that was rolled back to in_development for fix-cycles).';

-- 2. Trigger — AFTER UPDATE on uat_packages. Pairs with the existing
--    AFTER INSERT trigger (trg_uat_package_promotes_feature) which handles
--    in_testing → in_acceptance on package creation.
DROP TRIGGER IF EXISTS trg_uat_package_approval_releases_feature ON public.uat_packages;
CREATE TRIGGER trg_uat_package_approval_releases_feature
  AFTER UPDATE ON public.uat_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.fr130_v21_promote_feature_on_uat_package_approval();

-- 3. Backfill — promote any in_acceptance feature whose LATEST UAT package is
--    already 'approved'. FR-159 was already manually flipped before this
--    migration; this UPDATE is a no-op for it but catches anything else stuck.
UPDATE public.product_features pf
   SET status = 'released', updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (feature_id) feature_id, status
      FROM public.uat_packages
     ORDER BY feature_id, created_at DESC
  ) latest
 WHERE pf.id = latest.feature_id
   AND latest.status = 'approved'
   AND pf.status = 'in_acceptance';

COMMIT;
