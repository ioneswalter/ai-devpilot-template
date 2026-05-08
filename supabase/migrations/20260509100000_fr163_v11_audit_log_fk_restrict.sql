-- FR-163 v1.1 — change api_audit_log.api_key_id FK from CASCADE to RESTRICT.
--
-- v1.0 shipped with `api_key_id uuid NOT NULL REFERENCES api_keys(id) ON DELETE
-- CASCADE`. That means deleting an api_keys row wipes its entire audit history,
-- which destroys billing data the moment FR-167 (Usage Metering + Billing)
-- starts reading from api_audit_log.
--
-- v1.1 changes the constraint to ON DELETE RESTRICT — deleting a key with
-- existing audit rows raises a foreign-key violation. Operators must:
--   * leave revoked keys in place (`revoked_at` set; no DELETE), OR
--   * archive audit history first, then DELETE the key.
--
-- This preserves billing data integrity. Soft-delete via `revoked_at` continues
-- to be the supported lifecycle path (no FK impact).
--
-- Replay-safe: the constraint name is deterministic (`api_audit_log_api_key_id_fkey`
-- per Postgres default), and we DROP IF EXISTS before re-adding.

BEGIN;

-- Drop the existing CASCADE constraint
ALTER TABLE public.api_audit_log
  DROP CONSTRAINT IF EXISTS api_audit_log_api_key_id_fkey;

-- Re-add with ON DELETE RESTRICT
ALTER TABLE public.api_audit_log
  ADD CONSTRAINT api_audit_log_api_key_id_fkey
  FOREIGN KEY (api_key_id) REFERENCES public.api_keys(id) ON DELETE RESTRICT;

COMMIT;
