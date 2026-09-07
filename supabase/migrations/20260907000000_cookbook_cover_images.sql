-- A user-uploaded cookbook cover takes priority over the selected recipe
-- photo. The URL is public so web and native clients can render it directly.
ALTER TABLE cookbooks
  ADD COLUMN IF NOT EXISTS cover_image_url text;

COMMENT ON COLUMN cookbooks.cover_image_url IS
  'Public URL of a user-uploaded cookbook cover. Null uses the selected or automatic recipe photo.';

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'cookbook-covers',
  'cookbook-covers',
  true,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Signed-in clients keep every object under their own user-id directory.
CREATE POLICY "Users upload their own cookbook covers"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'cookbook-covers'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY "Users update their own cookbook covers"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'cookbook-covers'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'cookbook-covers'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY "Users delete their own cookbook covers"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'cookbook-covers'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
