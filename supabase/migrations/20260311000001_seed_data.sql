-- ============================================
-- Recipe Fork – Seed Data (3 sample recipes)
-- Run this AFTER the migration (01_create_tables.sql)
-- ============================================

-- Insert tags first
insert into tags (name) values
  ('dinner'),
  ('quick'),
  ('vegetarian'),
  ('pasta'),
  ('chicken'),
  ('healthy');

-- Recipe 1: Spaghetti Bolognese
insert into recipes (title, description, ingredients, steps, servings, prep_time, cook_time, source_url)
values (
  'Spaghetti Bolognese',
  'A classic meat sauce with spaghetti. Simple weeknight staple.',
  '[
    { "item": "spaghetti", "quantity": "400", "unit": "g" },
    { "item": "beef mince", "quantity": "500", "unit": "g" },
    { "item": "onion", "quantity": "1", "unit": "large" },
    { "item": "garlic cloves", "quantity": "3", "unit": "" },
    { "item": "tinned tomatoes", "quantity": "400", "unit": "g" },
    { "item": "tomato paste", "quantity": "2", "unit": "tbsp" },
    { "item": "olive oil", "quantity": "1", "unit": "tbsp" },
    { "item": "salt and pepper", "quantity": "", "unit": "to taste" }
  ]'::jsonb,
  '[
    { "order": 1, "instruction": "Dice the onion and mince the garlic." },
    { "order": 2, "instruction": "Heat olive oil in a large pan over medium heat. Cook onion until soft (about 5 min)." },
    { "order": 3, "instruction": "Add garlic and cook for 1 minute." },
    { "order": 4, "instruction": "Add beef mince and brown, breaking it up with a spoon." },
    { "order": 5, "instruction": "Stir in tomato paste, then add tinned tomatoes. Season with salt and pepper." },
    { "order": 6, "instruction": "Simmer on low for 20 minutes, stirring occasionally." },
    { "order": 7, "instruction": "Meanwhile, cook spaghetti in salted boiling water according to packet directions. Drain." },
    { "order": 8, "instruction": "Serve sauce over spaghetti." }
  ]'::jsonb,
  4,
  10,
  30,
  null
);

-- Recipe 2: Chicken Stir-Fry
insert into recipes (title, description, ingredients, steps, servings, prep_time, cook_time, source_url)
values (
  'Quick Chicken Stir-Fry',
  'Fast and healthy weeknight stir-fry. Ready in under 20 minutes.',
  '[
    { "item": "chicken breast", "quantity": "500", "unit": "g" },
    { "item": "broccoli", "quantity": "1", "unit": "head" },
    { "item": "capsicum", "quantity": "1", "unit": "large" },
    { "item": "soy sauce", "quantity": "3", "unit": "tbsp" },
    { "item": "sesame oil", "quantity": "1", "unit": "tbsp" },
    { "item": "garlic cloves", "quantity": "2", "unit": "" },
    { "item": "ginger", "quantity": "1", "unit": "tbsp, grated" },
    { "item": "rice", "quantity": "2", "unit": "cups" }
  ]'::jsonb,
  '[
    { "order": 1, "instruction": "Cook rice according to packet directions." },
    { "order": 2, "instruction": "Slice chicken into thin strips. Chop broccoli into florets and slice capsicum." },
    { "order": 3, "instruction": "Heat sesame oil in a wok or large frypan over high heat." },
    { "order": 4, "instruction": "Cook chicken for 4–5 minutes until golden. Remove and set aside." },
    { "order": 5, "instruction": "Add garlic and ginger, stir for 30 seconds." },
    { "order": 6, "instruction": "Add broccoli and capsicum. Stir-fry for 3–4 minutes until just tender." },
    { "order": 7, "instruction": "Return chicken to the wok. Add soy sauce and toss everything together." },
    { "order": 8, "instruction": "Serve over rice." }
  ]'::jsonb,
  4,
  10,
  10,
  null
);

-- Recipe 3: Caprese Salad
insert into recipes (title, description, ingredients, steps, servings, prep_time, cook_time, source_url)
values (
  'Caprese Salad',
  'Fresh and simple Italian salad. No cooking required.',
  '[
    { "item": "ripe tomatoes", "quantity": "4", "unit": "large" },
    { "item": "fresh mozzarella", "quantity": "250", "unit": "g" },
    { "item": "fresh basil leaves", "quantity": "1", "unit": "bunch" },
    { "item": "extra virgin olive oil", "quantity": "2", "unit": "tbsp" },
    { "item": "balsamic glaze", "quantity": "1", "unit": "tbsp" },
    { "item": "salt flakes", "quantity": "", "unit": "to taste" }
  ]'::jsonb,
  '[
    { "order": 1, "instruction": "Slice tomatoes and mozzarella into rounds about 5mm thick." },
    { "order": 2, "instruction": "Arrange alternating slices of tomato and mozzarella on a plate." },
    { "order": 3, "instruction": "Tuck basil leaves between the slices." },
    { "order": 4, "instruction": "Drizzle with olive oil and balsamic glaze. Season with salt flakes." }
  ]'::jsonb,
  2,
  10,
  0,
  null
);

-- Link recipes to tags
-- (We need to reference the UUIDs, so we use subqueries to look them up by name/title)

insert into recipe_tags (recipe_id, tag_id) values
  ((select id from recipes where title = 'Spaghetti Bolognese'), (select id from tags where name = 'dinner')),
  ((select id from recipes where title = 'Spaghetti Bolognese'), (select id from tags where name = 'pasta')),
  ((select id from recipes where title = 'Quick Chicken Stir-Fry'), (select id from tags where name = 'dinner')),
  ((select id from recipes where title = 'Quick Chicken Stir-Fry'), (select id from tags where name = 'quick')),
  ((select id from recipes where title = 'Quick Chicken Stir-Fry'), (select id from tags where name = 'chicken')),
  ((select id from recipes where title = 'Quick Chicken Stir-Fry'), (select id from tags where name = 'healthy')),
  ((select id from recipes where title = 'Caprese Salad'), (select id from tags where name = 'vegetarian')),
  ((select id from recipes where title = 'Caprese Salad'), (select id from tags where name = 'quick')),
  ((select id from recipes where title = 'Caprese Salad'), (select id from tags where name = 'healthy'));
