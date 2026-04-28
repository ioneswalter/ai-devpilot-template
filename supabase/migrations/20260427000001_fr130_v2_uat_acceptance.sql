-- FR-130 v2.0 — UAT Acceptance as a First-Class Pipeline Stage
--
-- Adds:
--   1. uat_packages.due_at TIMESTAMPTZ — SLA timestamp computed from priority at insert time
--   2. uat_review_audit.event_type TEXT — discriminates lifecycle events (review_submitted, reviewer_reassigned, auto_approved, …)
--   3. uat_review_audit.source TEXT — 'ui' | 'cli' (default 'ui') so CLI-driven actions are auditable
--   4. fr130_promote_feature_on_uat_package_insert() — trigger function
--   5. trg_uat_package_promotes_feature — AFTER INSERT trigger on uat_packages
--   6. Backfill UPDATE — promotes in_testing features whose latest UAT package is in_review
--
-- Idempotent: every DDL uses IF NOT EXISTS / OR REPLACE; backfill is naturally idempotent
-- because it filters to status = 'in_testing'.
--
-- Rollback: DROP TRIGGER, DROP FUNCTION, ALTER TABLE … DROP COLUMN IF EXISTS.

BEGIN;

-- 1. uat_packages.due_at
ALTER TABLE public.uat_packages
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ;

COMMENT ON COLUMN public.uat_packages.due_at IS
  'SLA deadline computed at package generation time from feature.priority (P1=+1bd, P2=+3bd, P3=+5bd; weekends excluded). NULL on rows created before FR-130 v2.0.';

-- 2 & 3. uat_review_audit columns
ALTER TABLE public.uat_review_audit
  ADD COLUMN IF NOT EXISTS event_type TEXT NOT NULL DEFAULT 'review_submitted';

ALTER TABLE public.uat_review_audit
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'ui';

COMMENT ON COLUMN public.uat_review_audit.event_type IS
  'Lifecycle event discriminator: review_submitted | auto_approved | rejected_via_cli | reviewer_reassigned. Application-enforced enum.';

COMMENT ON COLUMN public.uat_review_audit.source IS
  'Origin of the event: ui (BP review surface) | cli (\\uat-review command). Used to attribute CLI-driven actions in the audit log.';

-- 4. Trigger function — promotes feature in_testing → in_acceptance when a UAT package is inserted as in_review.
CREATE OR REPLACE FUNCTION public.fr130_promote_feature_on_uat_package_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_review' THEN
    UPDATE public.product_features
    SET status = 'in_acceptance', updated_at = NOW()
    WHERE id = NEW.feature_id
      AND status = 'in_testing';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fr130_promote_feature_on_uat_package_insert() IS
  'FR-130 v2.0 / J6: when a UAT package is inserted as in_review, atomically promote the corresponding feature from in_testing to in_acceptance. No-op for any other source status (idempotent, never regresses a released feature).';

-- 5. Trigger
DROP TRIGGER IF EXISTS trg_uat_package_promotes_feature ON public.uat_packages;
CREATE TRIGGER trg_uat_package_promotes_feature
  AFTER INSERT ON public.uat_packages
  FOR EACH ROW
  EXECUTE FUNCTION public.fr130_promote_feature_on_uat_package_insert();

-- 6. Backfill — promote in_testing features whose LATEST UAT package is in_review.
UPDATE public.product_features pf
SET status = 'in_acceptance', updated_at = NOW()
FROM (
  SELECT DISTINCT ON (feature_id) feature_id, status
  FROM public.uat_packages
  ORDER BY feature_id, created_at DESC
) latest
WHERE pf.id = latest.feature_id
  AND latest.status = 'in_review'
  AND pf.status = 'in_testing';

-- 7. Trigger function — when an SE claims a fix-cycle task (status open → in_progress),
--    transition the parent feature in_testing → in_development. No-op for any other transition.
CREATE OR REPLACE FUNCTION public.fr130_promote_feature_on_fix_task_claim()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'in_progress' AND OLD.status = 'open' THEN
    UPDATE public.product_features
    SET status = 'in_development', updated_at = NOW()
    WHERE id = NEW.feature_id
      AND status = 'in_testing';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.fr130_promote_feature_on_fix_task_claim() IS
  'FR-130 v2.0 / J6 (FR-015): when a fix_cycle_task transitions open → in_progress (SE claim), atomically promote the parent feature from in_testing to in_development. Guarded so released/in_acceptance/in_development features are not regressed.';

-- 8. Trigger
DROP TRIGGER IF EXISTS trg_fix_task_claim_promotes_feature ON public.fix_cycle_tasks;
CREATE TRIGGER trg_fix_task_claim_promotes_feature
  AFTER UPDATE OF status ON public.fix_cycle_tasks
  FOR EACH ROW
  EXECUTE FUNCTION public.fr130_promote_feature_on_fix_task_claim();

COMMIT;
