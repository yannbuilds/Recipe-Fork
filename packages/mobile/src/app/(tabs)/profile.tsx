import type { FamilyInvitation, FamilyMember } from '@recipe-aggregator/shared';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Body, Button, Divider, Eyebrow, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { useOnboarding } from '@/context/OnboardingContext';
import { useCookBarOffset } from '@/lib/cookBar';
import { supabase } from '@/lib/supabase';
import { font, useTheme, useThemePreference, type ThemePreference } from '@/lib/theme';

export default function ProfileScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  // Keep the last row clear of the cooking bar when something's on the stove.
  const cookBarOffset = useCookBarOffset();
  const {
    user,
    profile,
    familyGroup,
    familyMembers,
    familyInvitations,
    refreshProfile,
    refreshFamily,
    signOut,
    deleteAccount,
  } = useAuth();
  const router = useRouter();
  const { reset: resetOnboarding } = useOnboarding();
  const [name, setName] = useState('');
  const [measurement, setMeasurement] = useState<'metric' | 'imperial'>('metric');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);

  useEffect(() => {
    if (profile) {
      setName(profile.display_name ?? '');
      setMeasurement(profile.measurement_preference ?? 'metric');
    }
  }, [profile]);

  const dirty =
    profile != null &&
    (name.trim() !== (profile.display_name ?? '') || measurement !== profile.measurement_preference);

  async function save() {
    if (!user) return;
    setSaving(true);
    await supabase
      .from('profiles')
      .update({ display_name: name.trim(), measurement_preference: measurement })
      .eq('id', user.id);
    await refreshProfile();
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  }

  function openExternalUrl(url: string) {
    Linking.openURL(url).catch(() => {
      Alert.alert('Unable to open link', 'Please try again or email hello@pompon.com.au.');
    });
  }

  function confirmAccountDeletion() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, recipes, cookbooks, meal plans and notes. It cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete account',
          style: 'destructive',
          onPress: async () => {
            setDeletingAccount(true);
            try {
              await deleteAccount();
            } catch (error) {
              setDeletingAccount(false);
              Alert.alert(
                'Account not deleted',
                error instanceof Error
                  ? error.message
                  : 'Something went wrong. Please try again.',
              );
            }
          },
        },
      ],
    );
  }

  const inputStyle = {
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: t.text,
    fontFamily: font.sans,
  } as const;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 + cookBarOffset }}>
      <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 16 }}>
        <Eyebrow>Your account</Eyebrow>
        <Serif size={34} style={{ marginTop: 10, lineHeight: 36 }}>
          Profile
        </Serif>
        <Body size={14.5} color={t.textSoft} style={{ marginTop: 10 }}>
          {user?.email}
        </Body>

        {/* Display name */}
        <Body size={12} color={t.muted} style={{ marginTop: 26, marginBottom: 6 }}>
          Display name
        </Body>
        <TextInput value={name} onChangeText={setName} placeholder="Your name" placeholderTextColor={t.muted} style={inputStyle} />

        {/* Measurement preference */}
        <Body size={12} color={t.muted} style={{ marginTop: 18, marginBottom: 6 }}>
          Measurements
        </Body>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {(['metric', 'imperial'] as const).map((m) => {
            const active = measurement === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMeasurement(m)}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: active ? t.green : t.border,
                  backgroundColor: active ? t.greenLight : t.card,
                }}
              >
                <Body size={14} weight={active ? 'semi' : 'regular'} color={active ? t.green : t.text}>
                  {m === 'metric' ? 'Metric' : 'Imperial'}
                </Body>
              </Pressable>
            );
          })}
        </View>

        {dirty && (
          <Button
            label={saving ? 'Saving…' : 'Save changes'}
            variant="filled"
            full
            loading={saving}
            onPress={save}
            style={{ marginTop: 16 }}
          />
        )}
        {saved && (
          <Body size={13} color={t.green} style={{ marginTop: 10, textAlign: 'center' }}>
            ✓ Saved
          </Body>
        )}

        {/* Appearance */}
        <AppearanceSection />

        {/* Family sharing */}
        {user && (
          <FamilySection
            familyGroupName={familyGroup?.name ?? null}
            hasGroup={!!familyGroup}
            familyMembers={familyMembers}
            familyInvitations={familyInvitations}
            currentUserId={user.id}
            refreshFamily={refreshFamily}
          />
        )}

        {/* Invite a friend */}
        {user && <FriendInviteSection />}

        {/* Support and policies must remain available inside the app for App Review. */}
        <View style={{ marginTop: 30 }}>
          <Divider style={{ marginBottom: 20 }} />
          <Eyebrow>Help & privacy</Eyebrow>
          {[
            {
              label: 'Help and support',
              icon: 'help-circle-outline' as const,
              url: 'https://piekeeper.com/support',
            },
            {
              label: 'Privacy policy',
              icon: 'shield-checkmark-outline' as const,
              url: 'https://piekeeper.com/privacy',
            },
          ].map((item) => (
            <Pressable
              key={item.label}
              accessibilityRole="link"
              onPress={() => openExternalUrl(item.url)}
              style={({ pressed }) => ({
                minHeight: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                opacity: pressed ? 0.65 : 1,
                borderBottomWidth: 1,
                borderBottomColor: t.border,
              })}
            >
              <Ionicons name={item.icon} size={20} color={t.green} />
              <Body size={14.5} style={{ flex: 1 }}>
                {item.label}
              </Body>
              <Ionicons name="open-outline" size={17} color={t.muted} />
            </Pressable>
          ))}
        </View>

        {/* Sign out */}
        <Button
          label="Sign out"
          variant="secondary"
          full
          icon={<Ionicons name="log-out-outline" size={16} color={t.text} />}
          onPress={() => {
            signOut().catch(() =>
              Alert.alert('Could not sign out', 'Please check your connection and try again.'),
            );
          }}
          style={{ marginTop: 32 }}
        />

        <Button
          label={deletingAccount ? 'Deleting account…' : 'Delete account'}
          variant="danger"
          full
          loading={deletingAccount}
          icon={<Ionicons name="trash-outline" size={16} color={t.red} />}
          onPress={confirmAccountDeletion}
          style={{ marginTop: 12 }}
        />
        <Body
          size={11.5}
          color={t.muted}
          style={{ marginTop: 9, textAlign: 'center', lineHeight: 17 }}
        >
          Permanently removes your Pie Keeper account and its data.
        </Body>

        {/* Dev-only: replay the first-run onboarding carousel. Stripped from
            production builds by __DEV__. */}
        {__DEV__ && (
          <Pressable
            onPress={async () => {
              await resetOnboarding();
              router.push('/onboarding');
            }}
            hitSlop={8}
            style={{ alignItems: 'center', marginTop: 16 }}
          >
            <Mono size={10} color={t.muted}>
              DEV · REPLAY ONBOARDING
            </Mono>
          </Pressable>
        )}
      </View>
    </ScrollView>
  );
}

/* ================================================================
   Appearance / Theme
   ================================================================ */

function AppearanceSection() {
  const t = useTheme();
  const { preference, setPreference } = useThemePreference();

  const options: { value: ThemePreference; label: string }[] = [
    { value: 'auto', label: 'System' },
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
  ];

  return (
    <View style={{ marginTop: 30 }}>
      <Divider style={{ marginBottom: 20 }} />
      <Eyebrow>Appearance</Eyebrow>
      <Serif size={22} style={{ marginTop: 8, marginBottom: 6 }}>
        Theme
      </Serif>
      <Body size={12.5} color={t.muted} style={{ marginBottom: 14, lineHeight: 18 }}>
        System follows your phone. Pick Light or Dark to keep one look.
      </Body>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        {options.map((opt) => {
          const active = preference === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setPreference(opt.value)}
              style={{
                flex: 1,
                alignItems: 'center',
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: active ? t.green : t.border,
                backgroundColor: active ? t.greenLight : t.card,
              }}
            >
              <Body size={14} weight={active ? 'semi' : 'regular'} color={active ? t.green : t.text}>
                {opt.label}
              </Body>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/* ================================================================
   Family sharing
   ================================================================ */

function FamilySection({
  familyGroupName,
  hasGroup,
  familyMembers,
  familyInvitations,
  currentUserId,
  refreshFamily,
}: {
  familyGroupName: string | null;
  hasGroup: boolean;
  familyMembers: FamilyMember[];
  familyInvitations: FamilyInvitation[];
  currentUserId: string;
  refreshFamily: () => Promise<void>;
}) {
  const t = useTheme();
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);

  const isOwner = familyMembers.find((m) => m.user_id === currentUserId)?.role === 'owner';

  const inputStyle = {
    flex: 1,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: t.text,
    fontFamily: font.sans,
  } as const;

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setSending(true);
    setError(null);
    setMessage(null);

    const { data, error: fnError } = await supabase.functions.invoke('send-family-invite', {
      body: { email: inviteEmail.trim() },
    });

    setSending(false);

    if (fnError) {
      let msg = 'Failed to send invite';
      try {
        if (fnError.context instanceof Response) {
          const body = await fnError.context.clone().json();
          msg = body?.error || msg;
        } else if (fnError.message) {
          msg = fnError.message;
        }
      } catch {
        msg = fnError.message || msg;
      }
      setError(msg);
      return;
    }

    if (data?.error) {
      setError(data.error);
      return;
    }

    setMessage(data?.message || 'Invite sent!');
    setInviteEmail('');
    await refreshFamily();
  }

  function handleRemoveMember(memberId: string, memberName: string) {
    Alert.alert('Remove member', `Remove ${memberName} from the family group?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('family_members').delete().eq('id', memberId);
          if (!error) await refreshFamily();
        },
      },
    ]);
  }

  function handleCancelInvite(inv: FamilyInvitation) {
    Alert.alert('Cancel invitation', `Cancel invitation to ${inv.invited_email}?`, [
      { text: 'Keep', style: 'cancel' },
      {
        text: 'Cancel invite',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('family_invitations').delete().eq('id', inv.id);
          if (error) {
            Alert.alert('Error', 'Failed to cancel invitation');
            return;
          }
          await refreshFamily();
        },
      },
    ]);
  }

  function handleLeaveGroup() {
    Alert.alert('Leave family group', 'You will no longer see shared recipes.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Leave',
        style: 'destructive',
        onPress: async () => {
          setLeaving(true);
          const myMembership = familyMembers.find((m) => m.user_id === currentUserId);
          if (myMembership) {
            await supabase.from('family_members').delete().eq('id', myMembership.id);
          }
          setLeaving(false);
          await refreshFamily();
        },
      },
    ]);
  }

  return (
    <View style={{ marginTop: 30 }}>
      <Divider style={{ marginBottom: 20 }} />
      <Eyebrow>{hasGroup ? 'The household' : 'Family sharing'}</Eyebrow>
      <Serif size={22} style={{ marginTop: 8, marginBottom: 6 }}>
        {hasGroup ? familyGroupName ?? 'Family sharing' : 'Family sharing'}
      </Serif>
      <Body size={12.5} color={t.muted} style={{ marginBottom: 16, lineHeight: 18 }}>
        Share your recipe collection with a partner or family member. You'll both see and edit the same recipes.
      </Body>

      {/* Members + pending invites */}
      {familyMembers.map((m) => {
        const name = m.profile?.display_name ?? 'Member';
        const isMe = m.user_id === currentUserId;
        return (
          <View
            key={m.id}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
          >
            <View
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                backgroundColor: isMe ? t.green : t.greenLight,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Body size={14} weight="bold" color={isMe ? t.onGreen : t.greenDeep}>
                {name[0]?.toUpperCase() ?? '?'}
              </Body>
            </View>
            <View style={{ flex: 1 }}>
              <Body size={15}>
                {name}
                {isMe ? ' (you)' : ''}
              </Body>
              <Mono size={10}>{m.role.toUpperCase()}</Mono>
            </View>
            {isOwner && !isMe && (
              <Pressable
                onPress={() => handleRemoveMember(m.id, name)}
                hitSlop={8}
                style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: t.redLight }}
              >
                <Body size={12} weight="medium" color={t.red}>
                  Remove
                </Body>
              </Pressable>
            )}
          </View>
        );
      })}

      {familyInvitations.map((inv) => (
        <View
          key={inv.id}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 18,
              backgroundColor: t.warmDark,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Body size={14} weight="bold" color={t.muted}>
              {inv.invited_email[0]?.toUpperCase() ?? '?'}
            </Body>
          </View>
          <View style={{ flex: 1 }}>
            <Body size={15} color={t.textSoft} numberOfLines={1}>
              {inv.invited_email}
            </Body>
            <Mono size={10} color={t.orange}>
              PENDING
            </Mono>
          </View>
          {isOwner && (
            <Pressable
              onPress={() => handleCancelInvite(inv)}
              hitSlop={8}
              style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 7, backgroundColor: t.redLight }}
            >
              <Body size={12} weight="medium" color={t.red}>
                Cancel
              </Body>
            </Pressable>
          )}
        </View>
      ))}

      {/* Invite form — shown when no group yet, or to the owner of a group */}
      {(!hasGroup || isOwner) && (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 14, alignItems: 'center' }}>
          <TextInput
            value={inviteEmail}
            onChangeText={setInviteEmail}
            placeholder="Invite by email"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            keyboardType="email-address"
            style={inputStyle}
          />
          <Button label={sending ? '…' : 'Invite'} variant="filled" loading={sending} onPress={handleInvite} />
        </View>
      )}

      {error && (
        <Body size={12.5} color={t.red} style={{ marginTop: 8 }}>
          {error}
        </Body>
      )}
      {message && (
        <Body size={12.5} color={t.green} style={{ marginTop: 8 }}>
          {message}
        </Body>
      )}

      {/* Leave group — members only */}
      {hasGroup && !isOwner && (
        <Button
          label={leaving ? 'Leaving…' : 'Leave family group'}
          variant="secondary"
          full
          loading={leaving}
          onPress={handleLeaveGroup}
          style={{ marginTop: 14 }}
        />
      )}
    </View>
  );
}

/* ================================================================
   Invite a friend
   ================================================================ */

function FriendInviteSection() {
  const t = useTheme();
  const [friendEmail, setFriendEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const inputStyle = {
    flex: 1,
    borderWidth: 1,
    borderColor: t.border,
    backgroundColor: t.card,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: t.text,
    fontFamily: font.sans,
  } as const;

  async function handleSend() {
    if (!friendEmail.trim()) return;
    setSending(true);
    setError(null);
    setMessage(null);

    const { data, error: fnError } = await supabase.functions.invoke('send-friend-invite', {
      body: { email: friendEmail.trim() },
    });

    setSending(false);

    if (fnError) {
      let msg = 'Failed to send invite';
      try {
        if (fnError.context instanceof Response) {
          const body = await fnError.context.clone().json();
          msg = body?.error || msg;
        } else if (fnError.message) {
          msg = fnError.message;
        }
      } catch {
        msg = fnError.message || msg;
      }
      setError(msg);
      return;
    }

    if (data?.error) {
      setError(data.error);
      return;
    }

    setMessage(data?.message || 'Invite sent!');
    setFriendEmail('');
  }

  return (
    <View style={{ marginTop: 30 }}>
      <Divider style={{ marginBottom: 20 }} />
      <Eyebrow>Spread the word</Eyebrow>
      <Serif size={22} style={{ marginTop: 8, marginBottom: 6 }}>
        Invite a friend
      </Serif>
      <Body size={12.5} color={t.muted} style={{ marginBottom: 14, lineHeight: 18 }}>
        Know someone who'd love Pie Keeper? Send them an invite to create an account.
      </Body>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <TextInput
          value={friendEmail}
          onChangeText={setFriendEmail}
          placeholder="Email address"
          placeholderTextColor={t.muted}
          autoCapitalize="none"
          keyboardType="email-address"
          style={inputStyle}
        />
        <Button label={sending ? '…' : 'Send'} variant="filled" loading={sending} onPress={handleSend} />
      </View>
      {error && (
        <Body size={12.5} color={t.red} style={{ marginTop: 8 }}>
          {error}
        </Body>
      )}
      {message && (
        <Body size={12.5} color={t.green} style={{ marginTop: 8 }}>
          {message}
        </Body>
      )}
    </View>
  );
}
