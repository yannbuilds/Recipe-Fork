-- Chosen cover recipe for a cookbook — shown as its thumbnail in the
-- save-to-cookbook sheet. Null = automatic (newest recipe photo).
alter table cookbooks
  add column cover_recipe_id uuid references recipes(id) on delete set null;
