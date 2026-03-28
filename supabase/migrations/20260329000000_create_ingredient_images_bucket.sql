-- ============================================
-- Recipe Fork – Ingredient Images Bucket
-- Public-read bucket for ingredient thumbnails
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('ingredient-images', 'ingredient-images', true);

CREATE POLICY "Public read ingredient images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'ingredient-images');
