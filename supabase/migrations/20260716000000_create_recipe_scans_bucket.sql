-- Short-lived, private uploads used while OCRing photographed recipes.
-- Clients can only upload/remove objects inside their own user-id folder.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'recipe-scans',
  'recipe-scans',
  false,
  20971520,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own recipe scans"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-scans'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY "Users can remove their own recipe scans"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'recipe-scans'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY "Users can read their own recipe scan metadata"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'recipe-scans'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
