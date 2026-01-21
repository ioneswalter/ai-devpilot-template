-- Create the message-attachments storage bucket
-- This bucket stores image attachments for bid messages (FR-008)

-- Insert the bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  true,  -- Public bucket so images can be displayed
  5242880,  -- 5MB file size limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']::text[];

-- Policy: Authenticated users can upload files
CREATE POLICY IF NOT EXISTS "Authenticated users can upload message attachments"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'message-attachments');

-- Policy: Anyone can view files (public bucket)
CREATE POLICY IF NOT EXISTS "Anyone can view message attachments"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'message-attachments');

-- Policy: Users can delete their own uploads (based on path containing their user id)
CREATE POLICY IF NOT EXISTS "Users can delete their own message attachments"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'message-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
