-- ===========================================================================
-- Migration: Bidirectional sync triggers for product_features.status
-- Ensures product_features.status stays consistent with spec_reviews and
-- implementation_requests without allowing backward status transitions.
-- ===========================================================================

-- Status rank helper: returns numeric rank for forward-only comparison
-- proposed=0, approved=1, in_development=2, released=3, deprecated=4
CREATE OR REPLACE FUNCTION product_feature_status_rank(status TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE status
    WHEN 'proposed'       THEN 0
    WHEN 'approved'       THEN 1
    WHEN 'in_development' THEN 2
    WHEN 'released'       THEN 3
    WHEN 'deprecated'     THEN 4
    ELSE -1
  END;
$$;

-- Forward-only status update: only advances status, never goes backward
CREATE OR REPLACE FUNCTION advance_product_feature_status(
  p_feature_id TEXT,
  p_new_status TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_current_status TEXT;
BEGIN
  SELECT status INTO v_current_status
  FROM product_features
  WHERE id = p_feature_id;

  IF v_current_status IS NULL THEN
    RETURN;
  END IF;

  -- Only advance forward (higher rank), never backward
  IF product_feature_status_rank(p_new_status) > product_feature_status_rank(v_current_status) THEN
    UPDATE product_features
    SET status = p_new_status,
        updated_at = NOW()
    WHERE id = p_feature_id;
  END IF;
END;
$$;

-- -----------------------------------------------------------------------
-- Trigger 1: spec_reviews -> product_features.status = 'approved'
-- Fires when a spec review is approved
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_spec_review_sync_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    PERFORM advance_product_feature_status(NEW.feature_id, 'approved');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spec_review_sync_status ON spec_reviews;
CREATE TRIGGER trg_spec_review_sync_status
  AFTER INSERT OR UPDATE OF status ON spec_reviews
  FOR EACH ROW
  WHEN (NEW.status = 'approved')
  EXECUTE FUNCTION trg_fn_spec_review_sync_status();

-- -----------------------------------------------------------------------
-- Trigger 2: implementation_requests -> product_features.status = 'in_development'
-- Fires when an implementation request is created or updated to active state
-- -----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trg_fn_impl_request_sync_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status IN ('pending', 'in_progress', 'completed', 'implemented') THEN
    PERFORM advance_product_feature_status(NEW.feature_id, 'in_development');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_impl_request_sync_status ON implementation_requests;
CREATE TRIGGER trg_impl_request_sync_status
  AFTER INSERT OR UPDATE OF status ON implementation_requests
  FOR EACH ROW
  WHEN (NEW.status IN ('pending', 'in_progress', 'completed', 'implemented'))
  EXECUTE FUNCTION trg_fn_impl_request_sync_status();
