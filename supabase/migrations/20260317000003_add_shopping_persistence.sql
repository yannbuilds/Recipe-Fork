-- Persist shopping list check state and LLM-generated ingredient categories
ALTER TABLE meal_plans ADD COLUMN checked_items jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE meal_plans ADD COLUMN shopping_categories jsonb NOT NULL DEFAULT '{}'::jsonb;
