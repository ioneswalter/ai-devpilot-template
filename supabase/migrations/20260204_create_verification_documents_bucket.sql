-- Create the verification-documents storage bucket (PRIVATE)
-- FR-024: Identity Verification and Background Checks
-- Stores sensitive PII documents: government IDs, WWCC, professional licenses

-- Insert the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'verification-documents',
  'verification-documents',
  false,  -- Private bucket — requires signed URLs to view
  10485760,  -- 10MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/pdf', 'application/pdf']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/pdf', 'application/pdf']::text[];

-- Policy: Authenticated users can upload to their own folder ({user_id}/*)
CREATE POLICY IF NOT EXISTS "Providers can upload verification documents"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'verification-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can only view their own documents
CREATE POLICY IF NOT EXISTS "Providers can view own verification documents"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Policy: Users can delete their own documents
CREATE POLICY IF NOT EXISTS "Providers can delete own verification documents"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'verification-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);
