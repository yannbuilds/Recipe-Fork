-- ============================================
-- Recipe Fork – Sub-recipes
--
-- Some recipes use another recipe as an ingredient: the pastry in a pie, the
-- pesto in a pasta. An ingredient line can now point at one, via a `recipe_id`
-- key inside the existing recipes.ingredients jsonb array. No column is needed
-- for the link itself — ingredient lines have no stable identity (every
-- check-off key in the app is an array index, and both edit forms rebuild the
-- array wholesale), so storing it inside the element is the only shape that
-- survives reordering, inserting and deleting rows.
--
-- make_components is the shopping-list answer for one planned cook: are we
-- making the sub-recipe, or buying it ready made?
--   true  – swap "500g shortcrust pastry" for that recipe's own flour and
--           butter. You shop for the parts.
--   false – leave the line alone. You shop for the finished thing.
-- Either way it gets bought exactly once.
--
-- Left NULL deliberately rather than defaulting to true. NULL means nobody was
-- ever asked — a row written before this migration, one from an older phone
-- build, or the bulk "plan the week" flow which doesn't interrupt to ask. The
-- app resolves NULL to "making it" in one place (`makesComponents()` in
-- packages/shared/src/ingredients.ts), so that default can change later without
-- a data migration and without losing track of which answers were deliberate.
--
-- No change to meal_plan_recipes_shape_check: make_components is meaningless on
-- an 'out' row but harmless there, and that constraint has enough rules in it
-- already.
-- ============================================

ALTER TABLE meal_plan_recipes
  ADD COLUMN IF NOT EXISTS make_components boolean;

COMMENT ON COLUMN meal_plan_recipes.make_components IS
  'Cook this recipe''s linked sub-recipes from scratch (true) or buy them ready made (false). NULL = never asked, read as true.';

-- Makes "which recipes use this one?" answerable:
--   .contains('ingredients', [{ recipe_id: '<id>' }])
-- Nothing queries it yet. It exists so a future "used in 3 recipes" badge, a
-- warning before deleting a recipe something depends on, or a script to clean
-- up links left dangling by a delete, is a single indexed query rather than a
-- full table scan.
CREATE INDEX IF NOT EXISTS idx_recipes_ingredients_gin
  ON recipes USING gin (ingredients jsonb_path_ops);
