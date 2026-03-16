-- ============================================
-- Recipe Fork – Add Authentication
-- Adds user_id to recipes, locks down RLS
-- ============================================

-- 1. Add user_id column (nullable for now – backfill after first signup)
ALTER TABLE recipes ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- 2. Drop the old "allow everything" policies
DROP POLICY "Allow all on recipes" ON recipes;
DROP POLICY "Allow all on tags" ON tags;
DROP POLICY "Allow all on recipe_tags" ON recipe_tags;

-- 3. Recipes – users can only CRUD their own
CREATE POLICY "Users see own recipes"
  ON recipes FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own recipes"
  ON recipes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own recipes"
  ON recipes FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own recipes"
  ON recipes FOR DELETE
  USING (auth.uid() = user_id);

-- 4. Tags – shared read/write for authenticated users
CREATE POLICY "Authenticated read tags"
  ON tags FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated insert tags"
  ON tags FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 5. Recipe tags – scoped to recipes the user owns
CREATE POLICY "Users read own recipe_tags"
  ON recipe_tags FOR SELECT
  USING (recipe_id IN (SELECT id FROM recipes WHERE user_id = auth.uid()));

CREATE POLICY "Users insert own recipe_tags"
  ON recipe_tags FOR INSERT
  WITH CHECK (recipe_id IN (SELECT id FROM recipes WHERE user_id = auth.uid()));

CREATE POLICY "Users delete own recipe_tags"
  ON recipe_tags FOR DELETE
  USING (recipe_id IN (SELECT id FROM recipes WHERE user_id = auth.uid()));

-- 6. Index for fast user-scoped queries
CREATE INDEX idx_recipes_user_id ON recipes(user_id);

-- ============================================
-- AFTER FIRST SIGNUP: Run these manually
-- ============================================
-- UPDATE recipes SET user_id = 'YOUR-UUID-HERE';
-- ALTER TABLE recipes ALTER COLUMN user_id SET NOT NULL;
