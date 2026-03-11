-- ============================================
-- Recipe Fork – Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- 1. Recipes table – the main table
create table recipes (
  id          uuid          primary key default gen_random_uuid(),
  title       text          not null,
  description text,
  ingredients jsonb         not null default '[]'::jsonb,
  steps       jsonb         not null default '[]'::jsonb,
  source_url  text,
  image_url   text,
  servings    integer,
  prep_time   integer,       -- in minutes
  cook_time   integer,       -- in minutes
  created_at  timestamptz   not null default now(),
  updated_at  timestamptz   not null default now()
);

-- 2. Tags table – for categorising recipes
create table tags (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- 3. Join table – links recipes to tags (many-to-many)
create table recipe_tags (
  recipe_id uuid not null references recipes(id) on delete cascade,
  tag_id    uuid not null references tags(id)    on delete cascade,
  primary key (recipe_id, tag_id)
);

-- 4. Auto-update the updated_at timestamp whenever a recipe is edited
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger recipes_updated_at
  before update on recipes
  for each row
  execute function update_updated_at();

-- 5. Enable Row Level Security (tables are locked down by default)
--    For now we allow all operations – you'll tighten this in Phase 5 when you add auth.
alter table recipes     enable row level security;
alter table tags        enable row level security;
alter table recipe_tags enable row level security;

-- Temporary "allow everything" policies (safe while it's just you)
create policy "Allow all on recipes"     on recipes     for all using (true) with check (true);
create policy "Allow all on tags"        on tags        for all using (true) with check (true);
create policy "Allow all on recipe_tags" on recipe_tags for all using (true) with check (true);
