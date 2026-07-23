-- ============================================
-- Recipe Fork – Cooking history
-- One row per cook: when a recipe was cooked,
-- who cooked it, and optional 1-5 star ratings
-- (taste / ease / value) collected right after.
-- Powers future recommendations + auto planning.
-- ============================================

CREATE TABLE recipe_cooks (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id            uuid        NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
  user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Which meal-plan entry triggered this cook (null once the plan entry is
  -- removed — history outlives the week's plan).
  meal_plan_recipe_id  uuid        REFERENCES meal_plan_recipes(id) ON DELETE SET NULL,
  cooked_at            timestamptz NOT NULL DEFAULT now(),
  rating_taste         smallint    CHECK (rating_taste BETWEEN 1 AND 5),
  rating_ease          smallint    CHECK (rating_ease BETWEEN 1 AND 5),
  rating_value         smallint    CHECK (rating_value BETWEEN 1 AND 5)
);

ALTER TABLE recipe_cooks ENABLE ROW LEVEL SECURITY;

-- Read: own cooks + family cooks (recipes and plans are family-shared, so the
-- cooking history that feeds recommendations should be too).
CREATE POLICY "Users read own or family recipe_cooks"
  ON recipe_cooks FOR SELECT
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

-- Insert: you log cooks as yourself.
CREATE POLICY "Users insert own recipe_cooks"
  ON recipe_cooks FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Update: only your own (ratings are personal).
CREATE POLICY "Users update own recipe_cooks"
  ON recipe_cooks FOR UPDATE
  USING (auth.uid() = user_id);

-- Delete: own or family — un-marking a shared plan entry as cooked should
-- clear the log row no matter which family member marked it.
CREATE POLICY "Users delete own or family recipe_cooks"
  ON recipe_cooks FOR DELETE
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

CREATE INDEX idx_recipe_cooks_recipe ON recipe_cooks(recipe_id, cooked_at DESC);
CREATE INDEX idx_recipe_cooks_user ON recipe_cooks(user_id);
CREATE INDEX idx_recipe_cooks_plan_entry ON recipe_cooks(meal_plan_recipe_id);
