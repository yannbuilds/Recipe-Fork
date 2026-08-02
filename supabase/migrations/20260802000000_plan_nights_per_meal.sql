-- ============================================
-- Recipe Fork – How many nights one cook covers
--
-- Plan mode used to ask two questions: how many meals, and how many people.
-- That misses how the week actually gets cooked here — one pot on Sunday feeds
-- two people on Monday and Thursday. Meals and nights are different numbers.
--
-- plan_nights_per_meal is the default number of nights each cook covers. The
-- batch a cook shops for is plan_default_servings × plan_nights_per_meal, and
-- the nights the week covers is plan_meals_per_week × plan_nights_per_meal.
--
-- Left NULL for everyone who set up before this, which plan mode reads as
-- "not answered yet" and asks the setup questions once more.
-- ============================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_nights_per_meal smallint;

ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_nights_per_meal_check;
ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_nights_per_meal_check
  CHECK (plan_nights_per_meal IS NULL OR (plan_nights_per_meal > 0 AND plan_nights_per_meal <= 7));
