-- ============================================
-- Recipe Fork – Day-aware meal plans
--
-- A week stops being an unordered bag of recipes. Entries can now sit on a
-- specific day, spread one cook across several nights (meal prep — a recipe
-- that yields 4 feeds a household of 2 on Monday and Thursday), or hold a night
-- you're eating out. Placing a meal on a day stays entirely optional:
-- day_index NULL means "in the week, not on a day yet", which is exactly what
-- every existing row becomes.
-- ============================================

-- 1. The same recipe can now appear more than once in a week — Monday and
--    Thursday off one Sunday cook are two rows pointing at the same recipe.
ALTER TABLE meal_plan_recipes
  DROP CONSTRAINT IF EXISTS meal_plan_recipes_meal_plan_id_recipe_id_key;

-- 2. "Eating out" fills a day without a recipe behind it.
ALTER TABLE meal_plan_recipes
  ALTER COLUMN recipe_id DROP NOT NULL;

-- 3. New columns. All nullable or defaulted, so existing rows stay valid and
--    read back as plain unplaced cooks.
ALTER TABLE meal_plan_recipes
  ADD COLUMN IF NOT EXISTS day_index  smallint,
  ADD COLUMN IF NOT EXISTS entry_type text NOT NULL DEFAULT 'cook',
  ADD COLUMN IF NOT EXISTS parent_id  uuid REFERENCES meal_plan_recipes(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS servings   smallint,
  ADD COLUMN IF NOT EXISTS note       text;

-- 4. Shape rules.
--    0 = Monday … 6 = Sunday, NULL = not on a day.
ALTER TABLE meal_plan_recipes
  DROP CONSTRAINT IF EXISTS meal_plan_recipes_day_index_check;
ALTER TABLE meal_plan_recipes
  ADD CONSTRAINT meal_plan_recipes_day_index_check
  CHECK (day_index IS NULL OR (day_index >= 0 AND day_index <= 6));

--    'cook'  – the night it gets cooked. Its `servings` covers the whole batch,
--              so a 2-person household eating it twice shops for 4.
--    'batch' – another night off that same cook. Buys nothing; ticks off on its
--              own so you can eat Monday and Thursday independently.
--    'out'   – eating out. No recipe, no shopping.
ALTER TABLE meal_plan_recipes
  DROP CONSTRAINT IF EXISTS meal_plan_recipes_entry_type_check;
ALTER TABLE meal_plan_recipes
  ADD CONSTRAINT meal_plan_recipes_entry_type_check
  CHECK (entry_type IN ('cook', 'batch', 'out'));

ALTER TABLE meal_plan_recipes
  DROP CONSTRAINT IF EXISTS meal_plan_recipes_shape_check;
ALTER TABLE meal_plan_recipes
  ADD CONSTRAINT meal_plan_recipes_shape_check CHECK (
    (entry_type = 'cook'  AND recipe_id IS NOT NULL AND parent_id IS NULL)
    OR (entry_type = 'batch' AND recipe_id IS NOT NULL AND parent_id IS NOT NULL)
    OR (entry_type = 'out'   AND recipe_id IS NULL     AND parent_id IS NULL)
  );

ALTER TABLE meal_plan_recipes
  DROP CONSTRAINT IF EXISTS meal_plan_recipes_servings_check;
ALTER TABLE meal_plan_recipes
  ADD CONSTRAINT meal_plan_recipes_servings_check
  CHECK (servings IS NULL OR (servings > 0 AND servings <= 99));

-- 5. The grid reads a whole week ordered by day.
CREATE INDEX IF NOT EXISTS idx_meal_plan_recipes_day
  ON meal_plan_recipes(meal_plan_id, day_index);

-- 6. Plan mode asks "how many meals" and "cooking for how many" once, then
--    remembers the answers here. plan_default_servings is the household size —
--    what one night needs — not the size of a batch.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_meals_per_week   smallint,
  ADD COLUMN IF NOT EXISTS plan_default_servings smallint;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_meals_per_week_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_meals_per_week_check
  CHECK (plan_meals_per_week IS NULL OR (plan_meals_per_week > 0 AND plan_meals_per_week <= 21));

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_default_servings_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_default_servings_check
  CHECK (plan_default_servings IS NULL OR (plan_default_servings > 0 AND plan_default_servings <= 99));
