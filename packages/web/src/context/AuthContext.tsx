import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@recipe-aggregator/shared';
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
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [familyGroup, setFamilyGroup] = useState<FamilyGroup | null>(null);
  const [familyMembers, setFamilyMembers] = useState<FamilyMember[]>([]);
  const [familyInvitations, setFamilyInvitations] = useState<FamilyInvitation[]>([]);

  const fetchProfile = useCallback(async (userId: string, authUser?: User | null) => {
    const { data } = await supabase
      .from('profiles')
      .select('display_name, measurement_preference')
      .eq('id', userId)
      .maybeSingle();

    if (data) {
      setProfile(data);
      return;
    }

    if (!authUser) {
      setProfile(null);
      return;
    }

    const meta = (authUser.user_metadata ?? {}) as Record<string, unknown>;
    const displayName =
      (typeof meta.full_name === 'string' && meta.full_name) ||
      (typeof meta.name === 'string' && meta.name) ||
      authUser.email?.split('@')[0] ||
      '';

    const { data: upserted } = await supabase
      .from('profiles')
      .upsert({
        id: userId,
        display_name: displayName,
        measurement_preference: 'metric',
      })
      .select('display_name, measurement_preference')
      .maybeSingle();

    setProfile(upserted ?? { display_name: displayName, measurement_preference: 'metric' });
  }, []);

  const fetchFamily = useCallback(async (userId: string) => {
    // Check if user is in a family group
    const { data: membership } = await supabase
      .from('family_members')
      .select('group_id, role')
      .eq('user_id', userId)
      .maybeSingle();

    if (!membership) {
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

      setFamilyInvitations(invites ?? []);
    } else {
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

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        Promise.all([
          fetchProfile(session.user.id, session.user),
          fetchFamily(session.user.id),
        ]).finally(() => {
          clearTimeout(timeout);
          setLoading(false);
        });
      } else {
        clearTimeout(timeout);
        setLoading(false);
      }
    }).catch(() => {
      clearTimeout(timeout);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        Promise.all([
          fetchProfile(session.user.id, session.user),
          fetchFamily(session.user.id),
        ]).finally(() => setLoading(false));
      } else {
        setProfile(null);
        setFamilyGroup(null);
        setFamilyMembers([]);
        setFamilyInvitations([]);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, [fetchProfile, fetchFamily]);

  const signOut = async () => {
    await supabase.auth.signOut();
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
