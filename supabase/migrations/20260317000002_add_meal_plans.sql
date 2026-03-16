-- ============================================
-- Recipe Fork – Meal Plans
-- Weekly meal planning with ingredient aggregation
-- ============================================

-- 1. Meal plans table (one per user per week)
CREATE TABLE meal_plans (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id),
  week_start  date        NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, week_start)
);

-- 2. Join table: recipes in a meal plan
CREATE TABLE meal_plan_recipes (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_plan_id  uuid        NOT NULL REFERENCES meal_plans(id) ON DELETE CASCADE,
  recipe_id     uuid        NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  is_cooked     boolean     NOT NULL DEFAULT false,
  added_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (meal_plan_id, recipe_id)
);

-- 3. RLS
ALTER TABLE meal_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE meal_plan_recipes ENABLE ROW LEVEL SECURITY;

-- Meal plans: users own their plans
CREATE POLICY "Users see own meal_plans"
  ON meal_plans FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own meal_plans"
  ON meal_plans FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own meal_plans"
  ON meal_plans FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own meal_plans"
  ON meal_plans FOR DELETE
  USING (auth.uid() = user_id);

-- Meal plan recipes: scoped to plans the user owns
CREATE POLICY "Users read own meal_plan_recipes"
  ON meal_plan_recipes FOR SELECT
  USING (meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid()));

CREATE POLICY "Users insert own meal_plan_recipes"
  ON meal_plan_recipes FOR INSERT
  WITH CHECK (meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid()));

CREATE POLICY "Users update own meal_plan_recipes"
  ON meal_plan_recipes FOR UPDATE
  USING (meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid()));

CREATE POLICY "Users delete own meal_plan_recipes"
  ON meal_plan_recipes FOR DELETE
  USING (meal_plan_id IN (SELECT id FROM meal_plans WHERE user_id = auth.uid()));

-- 4. Indexes
CREATE INDEX idx_meal_plans_user_week ON meal_plans(user_id, week_start);
CREATE INDEX idx_meal_plan_recipes_plan ON meal_plan_recipes(meal_plan_id);
