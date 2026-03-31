-- ============================================
-- Recipe Fork – Add ON DELETE CASCADE to auth.users FKs
-- Allows user deletion from Supabase dashboard
-- without foreign key constraint violations
-- ============================================

-- recipes.user_id
ALTER TABLE recipes
  DROP CONSTRAINT recipes_user_id_fkey,
  ADD CONSTRAINT recipes_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- meal_plans.user_id
ALTER TABLE meal_plans
  DROP CONSTRAINT meal_plans_user_id_fkey,
  ADD CONSTRAINT meal_plans_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- family_groups.created_by
ALTER TABLE family_groups
  DROP CONSTRAINT family_groups_created_by_fkey,
  ADD CONSTRAINT family_groups_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE CASCADE;

-- family_invitations.invited_by
ALTER TABLE family_invitations
  DROP CONSTRAINT family_invitations_invited_by_fkey,
  ADD CONSTRAINT family_invitations_invited_by_fkey
    FOREIGN KEY (invited_by) REFERENCES auth.users(id) ON DELETE CASCADE;
