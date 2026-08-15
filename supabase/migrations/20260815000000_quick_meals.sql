-- A quick meal is a named planner entry without a saved recipe.
ALTER TABLE meal_plan_recipes
  DROP CONSTRAINT IF EXISTS meal_plan_recipes_entry_type_check;
ALTER TABLE meal_plan_recipes
  ADD CONSTRAINT meal_plan_recipes_entry_type_check
  CHECK (entry_type IN ('cook', 'batch', 'quick', 'out'));

ALTER TABLE meal_plan_recipes
  DROP CONSTRAINT IF EXISTS meal_plan_recipes_shape_check;
ALTER TABLE meal_plan_recipes
  ADD CONSTRAINT meal_plan_recipes_shape_check CHECK (
    (entry_type = 'cook'  AND recipe_id IS NOT NULL AND parent_id IS NULL)
    OR (entry_type = 'batch' AND recipe_id IS NOT NULL AND parent_id IS NOT NULL)
    OR (entry_type = 'quick' AND recipe_id IS NULL AND parent_id IS NULL AND length(trim(note)) > 0)
    OR (entry_type = 'out'   AND recipe_id IS NULL AND parent_id IS NULL)
  );
