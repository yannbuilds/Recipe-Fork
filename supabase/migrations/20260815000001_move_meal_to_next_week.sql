-- A carried-over meal has already been shopped for in its original week, so
-- it must not generate the same grocery lines again in the destination week.
ALTER TABLE meal_plan_recipes
  ADD COLUMN IF NOT EXISTS include_in_shopping boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN meal_plan_recipes.include_in_shopping IS
  'Whether this cook contributes its ingredients to its plan shopping list. False for meals carried to a later week after shopping.';
