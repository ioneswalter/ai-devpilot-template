-- Create verification-documents storage bucket (private) for provider document uploads
-- Used by FR-085 Provider Validation & Document Upload
-- Path convention: {user_id}/{document_type}/{uuid}.{ext}

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents',
  'verification-documents',
  false,
  10485760,  -- 10 MB
  ARRAY['application/pdf', 'image/jpeg', 'image/png']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Storage policies — user-scoped paths (first folder = auth.uid())
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Providers can upload verification documents') THEN
    CREATE POLICY "Providers can upload verification documents"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (
      bucket_id = 'verification-documents'
      AND (auth.uid())::text = (storage.foldername(name))[1]
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Providers can view own verification documents') THEN
    CREATE POLICY "Providers can view own verification documents"
    ON storage.objects FOR SELECT
    TO authenticated
    USING (
      bucket_id = 'verification-documents'
      AND (auth.uid())::text = (storage.foldername(name))[1]
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Providers can update own verification documents') THEN
    CREATE POLICY "Providers can update own verification documents"
    ON storage.objects FOR UPDATE
    TO authenticated
    USING (
      bucket_id = 'verification-documents'
      AND (auth.uid())::text = (storage.foldername(name))[1]
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Providers can delete own verification documents') THEN
    CREATE POLICY "Providers can delete own verification documents"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (
      bucket_id = 'verification-documents'
      AND (auth.uid())::text = (storage.foldername(name))[1]
    );
  END IF;
END $$;
