-- ============================================
-- Auto-delete orphaned tags
-- When a recipe_tags row is deleted, remove the
-- tag if no other recipe still uses it.
-- ============================================

create or replace function cleanup_orphaned_tags()
returns trigger as $$
begin
  delete from tags
  where id = OLD.tag_id
    and not exists (
      select 1 from recipe_tags where tag_id = OLD.tag_id
    );
  return OLD;
end;
$$ language plpgsql;

create trigger trg_cleanup_orphaned_tags
  after delete on recipe_tags
  for each row
  execute function cleanup_orphaned_tags();
