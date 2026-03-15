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

-- Storage policies
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Authenticated users can upload message attachments') THEN
    CREATE POLICY "Authenticated users can upload message attachments"
    ON storage.objects FOR INSERT
    TO authenticated
    WITH CHECK (bucket_id = 'message-attachments');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Anyone can view message attachments') THEN
    CREATE POLICY "Anyone can view message attachments"
    ON storage.objects FOR SELECT
    TO public
    USING (bucket_id = 'message-attachments');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can delete their own message attachments') THEN
    CREATE POLICY "Users can delete their own message attachments"
    ON storage.objects FOR DELETE
    TO authenticated
    USING (bucket_id = 'message-attachments' AND auth.uid()::text = (storage.foldername(name))[1]);
  END IF;
END $$;
