-- Per-serving nutrition, copied from what the source recipe published
-- (schema.org NutritionInformation). Null when the source publishes none — we
-- never estimate the numbers ourselves.
--
-- jsonb rather than columns: every field is optional and sites publish very
-- different subsets (RecipeTin gives calories only on some recipes and the full
-- macro breakdown on others), so a bag of nullable keys beats a dozen columns.
-- Units are canonical: kcal for energy, grams for macros, mg for sodium and
-- cholesterol.
alter table recipes add column nutrition jsonb;
