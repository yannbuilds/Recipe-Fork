-- ============================================
-- Recipe Fork – Add delete_user admin function
-- Lets admins delete a user + all their data
-- from the Supabase SQL editor
-- ============================================

CREATE OR REPLACE FUNCTION public.delete_user_by_id(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- All child tables have ON DELETE CASCADE, so deleting auth.users
  -- cascades to: recipes, recipe_tags, meal_plans, meal_plan_recipes,
  -- profiles, family_members, family_groups, family_invitations
  DELETE FROM auth.users WHERE id = target_user_id;
END;
$$;

-- Only allow the service_role to call this (not anon or authenticated)
REVOKE ALL ON FUNCTION public.delete_user_by_id(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_user_by_id(uuid) FROM authenticated;
REVOKE ALL ON FUNCTION public.delete_user_by_id(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_user_by_id(uuid) TO service_role;
