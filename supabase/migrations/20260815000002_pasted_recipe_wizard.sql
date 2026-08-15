-- Preserve the exact input used by the paste-first manual recipe flow.
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS original_paste text;

COMMENT ON COLUMN recipes.original_paste IS
  'Untouched user-supplied text retained when a recipe is created through the paste-first wizard.';

UPDATE storage.buckets
SET file_size_limit = 20971520,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
WHERE id = 'recipe-images';

-- Manual hero images are written directly by signed-in clients. Keep every
-- object namespaced to its owner so the public bucket does not become a shared
-- write surface.
CREATE POLICY "Users upload their own recipe images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY "Users update their own recipe images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );

CREATE POLICY "Users delete their own recipe images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'recipe-images'
    AND (storage.foldername(name))[1] = (SELECT auth.uid()::text)
  );
