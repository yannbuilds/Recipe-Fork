-- Fix "permission denied for table users" error.
-- The "Invitee reads own invitations" policy queries auth.users directly,
-- which the authenticated role cannot access. Use auth.email() instead.

DROP POLICY IF EXISTS "Invitee reads own invitations" ON family_invitations;

CREATE POLICY "Invitee reads own invitations"
  ON family_invitations FOR SELECT
  USING (lower(invited_email) = lower(auth.email()));
