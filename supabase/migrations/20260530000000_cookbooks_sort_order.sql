-- ============================================
-- Recipe Fork – Cookbook manual ordering
-- Adds a sort_order column so users can
-- drag-and-drop cookbooks into a custom order.
-- ============================================

ALTER TABLE cookbooks ADD COLUMN sort_order integer;

-- Backfill existing rows to preserve the current display order
-- (previously sorted by created_at DESC, newest first).
WITH ordered AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY user_id ORDER BY created_at DESC) - 1 AS rn
  FROM cookbooks
)
UPDATE cookbooks c
SET sort_order = o.rn
FROM ordered o
WHERE c.id = o.id;

ALTER TABLE cookbooks ALTER COLUMN sort_order SET DEFAULT 0;
ALTER TABLE cookbooks ALTER COLUMN sort_order SET NOT NULL;
