import type { FamilyGroup, FamilyInvitation, FamilyMember } from '@recipe-aggregator/shared';
import type { Session, User } from '@supabase/supabase-js';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { supabase } from '@/lib/supabase';

export interface Profile {
  display_name: string;
  measurement_preference: 'metric' | 'imperial';
}

interface AuthContextValue {
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

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  profile: null,
  loading: true,
  familyGroup: null,
  familyMembers: [],
  familyInvitations: [],
  refreshProfile: async () => {},
  refreshFamily: async () => {},
  signOut: async () => {},
});

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
      setProfile(data as Profile);
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
      .upsert({ id: userId, display_name: displayName, measurement_preference: 'metric' })
      .select('display_name, measurement_preference')
      .maybeSingle();

    setProfile((upserted as Profile) ?? { display_name: displayName, measurement_preference: 'metric' });
  }, []);

  const fetchFamily = useCallback(async (userId: string) => {
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

    const { data: group } = await supabase
      .from('family_groups')
      .select('*')
      .eq('id', membership.group_id)
      .single();
    setFamilyGroup((group as FamilyGroup) ?? null);

    const { data: members } = await supabase
      .from('family_members')
      .select('*')
      .eq('group_id', membership.group_id);

    const memberList = members ?? [];
    const userIds = memberList.map((m) => m.user_id);

    const { data: profiles } =
      userIds.length > 0
        ? await supabase.from('profiles').select('id, display_name').in('id', userIds)
        : { data: [] };

    const profileMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    setFamilyMembers(
      memberList.map((m) => ({ ...m, profile: profileMap.get(m.user_id) ?? null })) as FamilyMember[],
    );

    // Pending invitations are only visible to (and actionable by) the owner.
    if (membership.role === 'owner') {
      const { data: invites } = await supabase
        .from('family_invitations')
        .select('*')
        .eq('group_id', membership.group_id)
        .eq('status', 'pending');
      setFamilyInvitations((invites as FamilyInvitation[]) ?? []);
    } else {
      setFamilyInvitations([]);
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    if (user) await fetchProfile(user.id, user);
  }, [user, fetchProfile]);

  const refreshFamily = useCallback(async () => {
    if (user) await fetchFamily(user.id);
  }, [user, fetchFamily]);

  useEffect(() => {
    const hydrate = (s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        Promise.all([fetchProfile(s.user.id, s.user), fetchFamily(s.user.id)]).finally(() =>
          setLoading(false),
        );
      } else {
        setProfile(null);
        setFamilyGroup(null);
        setFamilyMembers([]);
        setFamilyInvitations([]);
        setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data }) => hydrate(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => hydrate(s));
    return () => sub.subscription.unsubscribe();
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
  return useContext(AuthContext);
}
