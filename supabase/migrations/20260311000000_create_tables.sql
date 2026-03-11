-- Create recipes table
create table recipes (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  description text,
  ingredients jsonb not null default '[]'::jsonb,
  steps       jsonb not null default '[]'::jsonb,
  source_url  text not null,
  image_url   text,
  servings    integer,
  prep_time   integer,
  cook_time   integer,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Create tags table
create table tags (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

-- Create recipe_tags join table
create table recipe_tags (
  recipe_id uuid not null references recipes(id) on delete cascade,
  tag_id    uuid not null references tags(id) on delete cascade,
  primary key (recipe_id, tag_id)
);

-- Auto-update updated_at on recipes
create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_recipes_updated_at
  before update on recipes
  for each row
  execute function update_updated_at_column();

-- Enable Row Level Security
alter table recipes enable row level security;
alter table tags enable row level security;
alter table recipe_tags enable row level security;

-- Permissive RLS policies (allow all operations for now)
create policy "Allow all on recipes" on recipes
  for all using (true) with check (true);

create policy "Allow all on tags" on tags
  for all using (true) with check (true);

create policy "Allow all on recipe_tags" on recipe_tags
  for all using (true) with check (true);

-- Indexes for common queries
create index idx_recipes_created_at on recipes(created_at desc);
create index idx_recipe_tags_recipe_id on recipe_tags(recipe_id);
create index idx_recipe_tags_tag_id on recipe_tags(tag_id);
