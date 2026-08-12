-- ============================================
-- Recipe Fork – Your own items on the shopping list
--
-- The shopping list has only ever been derived: every line comes from a recipe
-- planned for the week. But a shop is never only the recipes — bin bags, milk,
-- the thing you ran out of this morning. Those live here.
--
-- Shape of each element:
--   { "id": "<uuid>", "item": "Bin bags", "quantity": "2", "unit": "pack",
--     "created_at": "<iso8601>" }
--
-- Stored as jsonb on the plan rather than as its own table for the same reason
-- checked_items and shopping_categories are: a custom item has no life outside
-- the week it was added to, it is only ever read as a whole list alongside the
-- plan it belongs to, and it inherits the plan's RLS for free.
--
-- `id` is generated client-side and is the item's only stable identity — the
-- check-off key is `custom:<id>`, which is why renaming an item keeps it
-- ticked. Recipe-derived lines keep their existing `<item>-<unit>` keys in
-- checked_items, so nothing already ticked comes unticked.
-- ============================================

ALTER TABLE meal_plans
  ADD COLUMN IF NOT EXISTS custom_items jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN meal_plans.custom_items IS
  'Shopping-list items added by hand for this week: [{ id, item, quantity, unit, created_at }]. Ticked state lives in checked_items under the key custom:<id>.';
