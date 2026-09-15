-- One cross-device cooking session per account. The client keeps an offline
-- copy and sends its mutation time; the RPC only accepts a newer snapshot so a
-- device reconnecting with stale progress cannot roll the kitchen backwards.
CREATE TABLE cooking_sessions (
  user_id           uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  state             jsonb       NOT NULL DEFAULT '{"cooks":[],"activeRecipeId":null}'::jsonb,
  client_updated_at timestamptz NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE cooking_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own cooking session"
  ON cooking_sessions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users create own cooking session"
  ON cooking_sessions FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own cooking session"
  ON cooking_sessions FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION sync_cooking_session(
  p_state jsonb,
  p_client_updated_at timestamptz
)
RETURNS TABLE(state jsonb, client_updated_at timestamptz)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  INSERT INTO cooking_sessions AS current_session (
    user_id,
    state,
    client_updated_at,
    updated_at
  ) VALUES (
    auth.uid(),
    p_state,
    p_client_updated_at,
    now()
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    state = EXCLUDED.state,
    client_updated_at = EXCLUDED.client_updated_at,
    updated_at = now()
  WHERE current_session.client_updated_at < EXCLUDED.client_updated_at;

  RETURN QUERY
  SELECT cooking_sessions.state, cooking_sessions.client_updated_at
  FROM cooking_sessions
  WHERE user_id = auth.uid();
END;
$$;

REVOKE ALL ON FUNCTION sync_cooking_session(jsonb, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sync_cooking_session(jsonb, timestamptz) TO authenticated;

-- Realtime delivers INSERT/UPDATE snapshots to the user's other open devices.
ALTER PUBLICATION supabase_realtime ADD TABLE cooking_sessions;
