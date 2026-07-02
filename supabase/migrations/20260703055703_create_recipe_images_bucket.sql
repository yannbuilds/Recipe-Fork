-- ============================================
-- Recipe Fork – Recipe Images Bucket
-- Public-read bucket for re-hosted recipe hero images.
--
-- Some source sites (e.g. marionskitchen.com) hotlink-protect their images
-- via Cloudflare, blocking any <img> request whose Referer isn't the source
-- site itself. The import-recipe function downloads the image server-side
-- (with the source page as Referer) and re-hosts it here so the web app can
-- display it without being blocked.
-- ============================================

INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true);

CREATE POLICY "Public read recipe images"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'recipe-images');
