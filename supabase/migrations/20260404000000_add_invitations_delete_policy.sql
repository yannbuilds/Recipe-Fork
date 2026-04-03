-- Allow group owners to cancel (delete) pending invitations
CREATE POLICY "Owner deletes group invitations"
  ON family_invitations FOR DELETE
  USING (group_id = my_family_group_id() AND is_family_owner());
