-- ============================================
-- Fix infinite recursion in family RLS policies
-- The family_members and family_groups SELECT
-- policies referenced family_members, causing
-- circular RLS evaluation. Fix by using
-- SECURITY DEFINER helpers that bypass RLS.
-- ============================================

-- Helper: get the current user's group_id (bypasses RLS)
CREATE OR REPLACE FUNCTION my_family_group_id()
RETURNS uuid AS $$
  SELECT group_id FROM family_members WHERE user_id = auth.uid() LIMIT 1
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper: check if current user is the owner of their family group
CREATE OR REPLACE FUNCTION is_family_owner()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM family_members
    WHERE user_id = auth.uid() AND role = 'owner'
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Fix family_groups SELECT
DROP POLICY "Members read own group" ON family_groups;
CREATE POLICY "Members read own group"
  ON family_groups FOR SELECT
  USING (id = my_family_group_id());

-- Fix family_members SELECT
DROP POLICY "Members see own group members" ON family_members;
CREATE POLICY "Members see own group members"
  ON family_members FOR SELECT
  USING (group_id = my_family_group_id());

-- Fix family_members DELETE (remove self, or owner removes others)
DROP POLICY "Remove family members" ON family_members;
CREATE POLICY "Remove family members"
  ON family_members FOR DELETE
  USING (
    user_id = auth.uid()
    OR (group_id = my_family_group_id() AND is_family_owner())
  );
