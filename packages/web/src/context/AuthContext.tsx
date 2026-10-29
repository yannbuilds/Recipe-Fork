import { clearOfflineData } from '../lib/offlineStorage';
import { createContext, useContext, useEffect, useState, useCallback, useRef, type ReactNode } from 'react';
import { supabase, readStoredSession } from '@recipe-aggregator/shared';
import type { User, Session } from '@supabase/supabase-js';
import type { FamilyGroup, FamilyMember, FamilyInvitation } from '@recipe-aggregator/shared';

export interface Profile {
  display_name: string;
  measurement_preference: 'metric' | 'imperial';
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  familyGroup: FamilyGroup | null;
  familyMembers: FamilyMember[];
  familyInvitations: FamilyInvitation[];
  refreshProfile: () => Promise<void>;
  refreshFamily: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [storedSession] = useState(readStoredSession);
  const activeUserId = useRef(storedSession?.user.id ?? null);
  const [user, setUser] = useState<User | null>(storedSession?.user ?? null);
  const [session, setSession] = useState<Session | null>(storedSession);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(!storedSession);
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [familyInvitations, setFamilyInvitations] = useState<FamilyInvitation[]>([]);

  const fetchProfile = useCallback(async (userId: string, authUser?: User | null) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, measurement_preference')
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      console.error('Failed to load profile:', error);
      if (activeUserId.current !== userId) return;
      setProfile(null);
      return;
    }

    if (data) {
      if (activeUserId.current !== userId) return;
      setProfile(data);
      return;
    }

    if (!authUser) {
      if (activeUserId.current !== userId) return;
      setProfile(null);
      return;
    }

    const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const displayName =
      (typeof meta.display_name === 'string' && meta.display_name) ||
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      authUser.email?.split('@')[0] ||
      '';

    // Profile creation is recovery for accounts whose signup trigger did not run.
    // Never upsert here: an auth race or transient read issue must not overwrite
    // a name or preference the user has already chosen.
    const { data: inserted, error: insertError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        display_name: displayName,
        measurement_preference: 'metric',
      })
      .select('display_name, measurement_preference')
      .maybeSingle();

    if (inserted) {
      if (activeUserId.current !== userId) return;
      setProfile(inserted);
      return;
    }

    // A concurrent auth event may have created the row after our first read.
    // Re-read on a duplicate key; importantly, never update the existing row.
    if (insertError?.code === '23505') {
      const { data: existing, error: retryError } = await supabase
        .from('profiles')
        .select('display_name, measurement_preference')
        .eq('id', userId)
        .maybeSingle();

      if (retryError) console.error('Failed to load concurrently created profile:', retryError);
      if (activeUserId.current !== userId) return;
      setProfile(existing ?? null);
      return;
    }

    if (insertError) console.error('Failed to create missing profile:', insertError);
    if (activeUserId.current !== userId) return;
    setProfile(null);
  }, []);

  const fetchFamily = useCallback(async (userId: string) => {
    // Check if user is in a family group
    const { data: membership } = await supabase
      .from('family_members')
      .select('group_id, role')
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
      if (activeUserId.current !== userId) return;
      setFamilyGroup(null);
      setFamilyMembers([]);
      setFamilyInvitations([]);
      return;
    }

    // Fetch group details
    const { data: group } = await supabase
      .from('family_groups')
      .select('*')
      .eq('id', membership.group_id)
      .single();

    if (activeUserId.current !== userId) return;
    setFamilyGroup(group ?? null);

    // Fetch all members then look up profiles separately
    // (family_members.user_id references auth.users, not profiles, so PostgREST can't infer the join)
    const { data: members } = await supabase
      .from('family_members')
      .select('*')
      .eq('group_id', membership.group_id);

    const memberList = members ?? [];
    const userIds = memberList.map((m) => m.user_id);

    const { data: profiles } = userIds.length > 0
      ? await supabase
          .from('profiles')
          .select('id, display_name')
          .in('id', userIds)
      : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));

    if (activeUserId.current !== userId) return;
    setFamilyMembers(
      memberList.map((m) => ({
        ...m,
        profile: profileMap.get(m.user_id) ?? null,
      })),
    );

    // Fetch pending invitations (only if owner)
    if (membership.role === 'owner') {
      const { data: invites } = await supabase
        .from('family_invitations')
        .select('*')
        .eq('group_id', membership.group_id)
        .eq('status', 'pending');

      if (activeUserId.current !== userId) return;
      setFamilyInvitations(invites ?? []);
    } else {
      if (activeUserId.current !== userId) return;
      setFamilyInvitations([]);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id);
  }, [user, fetchProfile]);

  const refreshFamily = useCallback(async () => {
    if (user) await fetchFamily(user.id);
  }, [user, fetchFamily]);

  useEffect(() => {
    const timeout = setTimeout(() => setLoading(false), 10_000);

    let disposed = false;
    const hydrate = (next: Session | null) => {
      if (disposed) return;
      const nextId = next?.user.id ?? null;
      if (activeUserId.current !== nextId) {
        clearOfflineData();
        setProfile(null);
        setFamilyGroup(null);
        setFamilyMembers([]);
        setFamilyInvitations([]);
      }
      activeUserId.current = nextId;
      setSession(next);
      setUser(next?.user ?? null);
      clearTimeout(timeout);
      setLoading(false);
      // Auth callbacks must return before starting further Supabase requests.
      if (next) setTimeout(() => {
        if (!disposed && activeUserId.current === nextId) {
          void Promise.all([fetchProfile(nextId!, next.user), fetchFamily(nextId!)]);
        }
      }, 0);
    };
    supabase.auth.getSession().then(({ data, error }) => {
      if (!error) hydrate(data.session);
      else setLoading(false);
    }).catch(() => {
      clearTimeout(timeout);
      setLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => hydrate(next));

    return () => {
      disposed = true;
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile, fetchFamily]);

  const signOut = async () => {
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) throw error;
    clearOfflineData();
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        profile,
        loading,
        familyGroup,
        familyMembers,
        familyInvitations,
        refreshProfile,
        refreshFamily,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
