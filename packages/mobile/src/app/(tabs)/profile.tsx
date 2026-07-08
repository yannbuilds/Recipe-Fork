import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Divider, Eyebrow, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

export default function ProfileScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const { user, profile, familyGroup, familyMembers, refreshProfile, signOut } = useAuth();
  const [name, setName] = useState('');
  const [measurement, setMeasurement] = useState<'metric' | 'imperial'>('metric');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

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
    <ScrollView style={{ flex: 1, backgroundColor: t.bg }} contentContainerStyle={{ paddingBottom: 40 }}>
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

        {/* Family */}
        {familyGroup && (
          <View style={{ marginTop: 30 }}>
            <Divider style={{ marginBottom: 20 }} />
            <Eyebrow>The household</Eyebrow>
            <Serif size={22} style={{ marginTop: 8, marginBottom: 12 }}>
              {familyGroup.name}
            </Serif>
            {familyMembers.map((m) => (
              <View
                key={m.id}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 }}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    backgroundColor: t.greenLight,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Body size={14} weight="bold" color={t.greenDeep}>
                    {(m.profile?.display_name ?? '?')[0]?.toUpperCase()}
                  </Body>
                </View>
                <Body size={15} style={{ flex: 1 }}>
                  {m.profile?.display_name ?? 'Member'}
                  {m.user_id === user?.id ? ' (you)' : ''}
                </Body>
                <Mono size={10}>{m.role.toUpperCase()}</Mono>
              </View>
            ))}
          </View>
        )}

        {/* Sign out */}
        <Button
          label="Sign out"
          variant="danger"
          full
          icon={<Ionicons name="log-out-outline" size={16} color={t.red} />}
          onPress={signOut}
          style={{ marginTop: 32 }}
        />
      </View>
    </ScrollView>
  );
}
