-- ============================================
-- Recipe Fork – Cookbooks
-- User-curated collections of recipes,
-- shared with family (same RLS as recipes).
-- ============================================

CREATE TABLE cookbooks (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        text        NOT NULL,
  description text,
  emoji       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE cookbook_recipes (
  cookbook_id uuid        NOT NULL REFERENCES cookbooks(id) ON DELETE CASCADE,
  recipe_id   uuid        NOT NULL REFERENCES recipes(id)   ON DELETE CASCADE,
  added_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (cookbook_id, recipe_id)
);

CREATE INDEX cookbook_recipes_recipe_idx   ON cookbook_recipes(recipe_id);
CREATE INDEX cookbook_recipes_cookbook_idx ON cookbook_recipes(cookbook_id);
CREATE INDEX cookbooks_user_idx            ON cookbooks(user_id);

ALTER TABLE cookbooks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE cookbook_recipes ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Cookbooks: self + family
-- ============================================

CREATE POLICY "cookbooks_select"
  ON cookbooks FOR SELECT
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

CREATE POLICY "cookbooks_insert"
  ON cookbooks FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "cookbooks_update"
  ON cookbooks FOR UPDATE
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

CREATE POLICY "cookbooks_delete"
  ON cookbooks FOR DELETE
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

-- ============================================
-- Cookbook recipes: anyone who can see the cookbook
-- can manage its recipes
-- ============================================

CREATE POLICY "cookbook_recipes_select"
  ON cookbook_recipes FOR SELECT
  USING (cookbook_id IN (SELECT id FROM cookbooks));

CREATE POLICY "cookbook_recipes_insert"
  ON cookbook_recipes FOR INSERT
  WITH CHECK (cookbook_id IN (SELECT id FROM cookbooks));

CREATE POLICY "cookbook_recipes_delete"
  ON cookbook_recipes FOR DELETE
  USING (cookbook_id IN (SELECT id FROM cookbooks));
