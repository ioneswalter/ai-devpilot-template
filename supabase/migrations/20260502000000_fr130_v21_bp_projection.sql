-- FR-130 v2.1 — BP Review UX Projection Layer
-- Adds bp_review_projections table, extends uat_review_decisions, provisions uat-evidence storage bucket.
-- Replay-safe per feedback_migration_replay_safety.md.

-- ── 1. bp_review_projections table ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.bp_review_projections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_item_id text NOT NULL UNIQUE
    REFERENCES public.uat_checklist_items(id) ON DELETE CASCADE,
  plain_english_statement text NOT NULL DEFAULT '',
  how_to_test jsonb NOT NULL DEFAULT '[]'::jsonb,
  expected_outcome text NOT NULL DEFAULT '',
  evidence_required boolean NOT NULL DEFAULT false,
  source text NOT NULL CHECK (source IN ('quickstart_scraped','ai_generated','manually_reviewed')),
  generated_at timestamptz NOT NULL DEFAULT now(),
  criterion_hash text NOT NULL,
  regenerate_requested_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS bp_review_projections_checklist_item_idx
  ON public.bp_review_projections (checklist_item_id);

ALTER TABLE public.bp_review_projections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bp_review_projections_select ON public.bp_review_projections;
CREATE POLICY bp_review_projections_select ON public.bp_review_projections
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS bp_review_projections_service_write ON public.bp_review_projections;
CREATE POLICY bp_review_projections_service_write ON public.bp_review_projections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── 2. Extend uat_review_decisions (additive) ────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uat_review_decisions'
      AND column_name = 'observation_text'
  ) THEN
    ALTER TABLE public.uat_review_decisions
      ADD COLUMN observation_text text NULL CHECK (length(observation_text) <= 500);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uat_review_decisions'
      AND column_name = 'evidence_path'
  ) THEN
    ALTER TABLE public.uat_review_decisions
      ADD COLUMN evidence_path text NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'uat_review_decisions'
      AND column_name = 'ai_caption'
  ) THEN
    ALTER TABLE public.uat_review_decisions
      ADD COLUMN ai_caption text NULL CHECK (length(ai_caption) <= 280);
  END IF;
END $$;

-- ── 3. uat-evidence Storage bucket ────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'uat-evidence',
  'uat-evidence',
  false,
  10485760, -- 10 MiB
  ARRAY['image/png','image/jpeg','image/webp','application/pdf','application/json']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS uat_evidence_read ON storage.objects;
CREATE POLICY uat_evidence_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'uat-evidence');

DROP POLICY IF EXISTS uat_evidence_write ON storage.objects;
CREATE POLICY uat_evidence_write ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'uat-evidence');
