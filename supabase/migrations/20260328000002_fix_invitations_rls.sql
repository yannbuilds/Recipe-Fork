-- Allow group owners to read invitations for their group
-- The existing policy only lets the inviter read by invited_by = auth.uid(),
-- but the frontend queries by group_id. Add a policy for owners.
CREATE POLICY "Owner reads group invitations"
  ON family_invitations FOR SELECT
  USING (group_id = my_family_group_id() AND is_family_owner());
