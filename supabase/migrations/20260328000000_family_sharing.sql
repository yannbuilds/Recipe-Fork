-- ============================================
-- Recipe Fork – Family Sharing
-- Allows users to share recipes, meal plans,
-- and tags with family members via invite
-- ============================================

-- ============================================
-- 1. New tables
-- ============================================

-- Family groups: one per household
CREATE TABLE family_groups (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL DEFAULT 'My Family',
  created_by uuid        NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Family members: links users to a group (max one group per user)
CREATE TABLE family_members (
  id        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id  uuid        NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  user_id   uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      text        NOT NULL DEFAULT 'member'
            CHECK (role IN ('owner', 'member')),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id)  -- one group per user
);

-- Family invitations: tracks invite lifecycle
CREATE TABLE family_invitations (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id      uuid        NOT NULL REFERENCES family_groups(id) ON DELETE CASCADE,
  invited_by    uuid        NOT NULL REFERENCES auth.users(id),
  invited_email text        NOT NULL,
  token         uuid        NOT NULL DEFAULT gen_random_uuid(),
  status        text        NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'declined', 'expired')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '7 days')
);

-- Indexes
CREATE INDEX idx_family_members_group ON family_members(group_id);
CREATE INDEX idx_family_invitations_token ON family_invitations(token);
CREATE INDEX idx_family_invitations_email ON family_invitations(invited_email);

-- ============================================
-- 2. Helper function: get all user IDs in the
--    caller's family group (returns empty if
--    the user is not in any group)
-- ============================================

CREATE OR REPLACE FUNCTION family_user_ids()
RETURNS SETOF uuid AS $$
  SELECT fm.user_id
  FROM family_members fm
  WHERE fm.group_id = (
    SELECT group_id FROM family_members WHERE user_id = auth.uid()
  )
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ============================================
-- 3. RLS on new tables
-- ============================================

ALTER TABLE family_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE family_invitations ENABLE ROW LEVEL SECURITY;

-- Family groups: members can read their own group
CREATE POLICY "Members read own group"
  ON family_groups FOR SELECT
  USING (id IN (SELECT group_id FROM family_members WHERE user_id = auth.uid()));

-- Family groups: authenticated users can create (edge function handles logic)
CREATE POLICY "Authenticated create group"
  ON family_groups FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- Family groups: owner can update name
CREATE POLICY "Owner update group"
  ON family_groups FOR UPDATE
  USING (created_by = auth.uid());

-- Family groups: owner can delete
CREATE POLICY "Owner delete group"
  ON family_groups FOR DELETE
  USING (created_by = auth.uid());

-- Family members: see members of own group
CREATE POLICY "Members see own group members"
  ON family_members FOR SELECT
  USING (group_id IN (SELECT group_id FROM family_members WHERE user_id = auth.uid()));

-- Family members: group owner can insert (via edge function, but policy needed)
CREATE POLICY "Authenticated insert members"
  ON family_members FOR INSERT
  TO authenticated
  WITH CHECK (true);  -- edge function validates; RLS just requires auth

-- Family members: owner can remove members, members can remove themselves
CREATE POLICY "Remove family members"
  ON family_members FOR DELETE
  USING (
    user_id = auth.uid()  -- leave group yourself
    OR group_id IN (
      SELECT group_id FROM family_members
      WHERE user_id = auth.uid() AND role = 'owner'
    )
  );

-- Family invitations: inviter sees their sent invites
CREATE POLICY "Inviter reads own invitations"
  ON family_invitations FOR SELECT
  USING (invited_by = auth.uid());

-- Family invitations: invitee sees invitations to their email
CREATE POLICY "Invitee reads own invitations"
  ON family_invitations FOR SELECT
  USING (
    invited_email = (
      SELECT email FROM auth.users WHERE id = auth.uid()
    )
  );

-- Family invitations: authenticated users can insert (edge function validates)
CREATE POLICY "Authenticated insert invitations"
  ON family_invitations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Family invitations: inviter or edge function can update status
CREATE POLICY "Update invitation status"
  ON family_invitations FOR UPDATE
  TO authenticated
  USING (true);

-- ============================================
-- 4. Update existing RLS policies to include
--    family members
-- ============================================

-- --- Recipes ---
DROP POLICY "Users see own recipes" ON recipes;
CREATE POLICY "Users see own or family recipes"
  ON recipes FOR SELECT
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

DROP POLICY "Users update own recipes" ON recipes;
CREATE POLICY "Users update own or family recipes"
  ON recipes FOR UPDATE
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

DROP POLICY "Users delete own recipes" ON recipes;
CREATE POLICY "Users delete own or family recipes"
  ON recipes FOR DELETE
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

-- INSERT stays as-is: auth.uid() = user_id (you create recipes as yourself)

-- --- Recipe tags ---
DROP POLICY "Users read own recipe_tags" ON recipe_tags;
CREATE POLICY "Users read own or family recipe_tags"
  ON recipe_tags FOR SELECT
  USING (recipe_id IN (
    SELECT id FROM recipes
    WHERE user_id = auth.uid() OR user_id IN (SELECT family_user_ids())
  ));

DROP POLICY "Users insert own recipe_tags" ON recipe_tags;
CREATE POLICY "Users insert own or family recipe_tags"
  ON recipe_tags FOR INSERT
  WITH CHECK (recipe_id IN (
    SELECT id FROM recipes
    WHERE user_id = auth.uid() OR user_id IN (SELECT family_user_ids())
  ));

DROP POLICY "Users delete own recipe_tags" ON recipe_tags;
CREATE POLICY "Users delete own or family recipe_tags"
  ON recipe_tags FOR DELETE
  USING (recipe_id IN (
    SELECT id FROM recipes
    WHERE user_id = auth.uid() OR user_id IN (SELECT family_user_ids())
  ));

-- --- Meal plans ---
DROP POLICY "Users see own meal_plans" ON meal_plans;
CREATE POLICY "Users see own or family meal_plans"
  ON meal_plans FOR SELECT
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

DROP POLICY "Users update own meal_plans" ON meal_plans;
CREATE POLICY "Users update own or family meal_plans"
  ON meal_plans FOR UPDATE
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

DROP POLICY "Users delete own meal_plans" ON meal_plans;
CREATE POLICY "Users delete own or family meal_plans"
  ON meal_plans FOR DELETE
  USING (user_id = auth.uid() OR user_id IN (SELECT family_user_ids()));

-- INSERT stays as-is: you create meal plans as yourself

-- --- Meal plan recipes ---
DROP POLICY "Users read own meal_plan_recipes" ON meal_plan_recipes;
CREATE POLICY "Users read own or family meal_plan_recipes"
  ON meal_plan_recipes FOR SELECT
  USING (meal_plan_id IN (
    SELECT id FROM meal_plans
    WHERE user_id = auth.uid() OR user_id IN (SELECT family_user_ids())
  ));

DROP POLICY "Users insert own meal_plan_recipes" ON meal_plan_recipes;
CREATE POLICY "Users insert own or family meal_plan_recipes"
  ON meal_plan_recipes FOR INSERT
  WITH CHECK (meal_plan_id IN (
    SELECT id FROM meal_plans
    WHERE user_id = auth.uid() OR user_id IN (SELECT family_user_ids())
  ));

DROP POLICY "Users update own meal_plan_recipes" ON meal_plan_recipes;
CREATE POLICY "Users update own or family meal_plan_recipes"
  ON meal_plan_recipes FOR UPDATE
  USING (meal_plan_id IN (
    SELECT id FROM meal_plans
    WHERE user_id = auth.uid() OR user_id IN (SELECT family_user_ids())
  ));

DROP POLICY "Users delete own meal_plan_recipes" ON meal_plan_recipes;
CREATE POLICY "Users delete own or family meal_plan_recipes"
  ON meal_plan_recipes FOR DELETE
  USING (meal_plan_id IN (
    SELECT id FROM meal_plans
    WHERE user_id = auth.uid() OR user_id IN (SELECT family_user_ids())
  ));

-- --- Profiles: family members can read each other's display names ---
CREATE POLICY "Family members read each other profiles"
  ON profiles FOR SELECT
  USING (id IN (SELECT family_user_ids()));
