import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Pressable, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Serif } from '@/components/ui';
import { saveTags } from '@/lib/saveTags';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

type Step = 'choose' | 'url' | 'processing' | 'error';

export default function NewRecipeModal() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [step, setStep] = useState<Step>('choose');
  const [url, setUrl] = useState('');
  const [status, setStatus] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  function close() {
    router.back();
  }

  function goManual() {
    router.back();
    setTimeout(() => router.push('/recipe/new'), 250);
  }

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;
    try {
      new URL(trimmed);
    } catch {
      setErrorMsg('Please enter a valid URL (e.g. https://example.com/recipe)');
      setStep('error');
      return;
    }

    setStep('processing');
    setStatus('Checking for duplicates…');
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!userId || !session) throw new Error('Please sign in to import recipes');

      const { data: existing } = await supabase
        .from('recipes')
        .select('id')
        .eq('source_url', trimmed)
        .maybeSingle();
      if (existing) {
        router.back();
        setTimeout(() => router.push({ pathname: '/recipe/[id]', params: { id: existing.id } }), 250);
        return;
      }

      setStatus('Cooking recipe…');
      const { data, error } = await supabase.functions.invoke('import-recipe', {
        body: { url: trimmed },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw new Error(error.message || 'Failed to import recipe');
      if (data?.error) throw new Error(data.error);

      const { recipe, tags } = data;
      setStatus('Saving recipe…');
      const { data: saved, error: saveError } = await supabase
        .from('recipes')
        .insert({ ...recipe, user_id: userId, is_favourite: false })
        .select('id')
        .single();
      if (saveError || !saved) throw new Error(saveError?.message ?? 'Failed to save recipe');

      await saveTags(saved.id, tags ?? []).catch(() => {});
      router.back();
      setTimeout(() => router.push({ pathname: '/recipe/[id]', params: { id: saved.id } }), 250);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong');
      setStep('error');
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.card, paddingTop: 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 16 }}>
      <View style={{ alignItems: 'center', paddingVertical: 6 }}>
        <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: t.border }} />
      </View>

      {step === 'choose' && (
        <>
          <Serif size={20} weight="semi" style={{ textAlign: 'center', marginTop: 8, marginBottom: 20 }}>
            Add a recipe
          </Serif>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            {[
              { icon: 'globe-outline' as const, title: 'From the web', sub: 'Paste a recipe URL', onPress: () => setStep('url') },
              { icon: 'create-outline' as const, title: 'Add manually', sub: 'Type it in yourself', onPress: goManual },
            ].map((opt) => (
              <Pressable
                key={opt.title}
                onPress={opt.onPress}
                style={{
                  flex: 1,
                  alignItems: 'center',
                  gap: 10,
                  paddingVertical: 28,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: t.border,
                }}
              >
                <Ionicons name={opt.icon} size={30} color={t.green} />
                <Serif size={15} weight="semi">
                  {opt.title}
                </Serif>
                <Body size={12} color={t.muted} style={{ textAlign: 'center' }}>
                  {opt.sub}
                </Body>
              </Pressable>
            ))}
          </View>
          <Button label="Cancel" variant="secondary" full onPress={close} style={{ marginTop: 18 }} />
        </>
      )}

      {step === 'url' && (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 16 }}>
            <Pressable onPress={() => setStep('choose')}>
              <Ionicons name="arrow-back" size={20} color={t.muted} />
            </Pressable>
            <Serif size={18} weight="semi">
              Import from URL
            </Serif>
          </View>
          <TextInput
            value={url}
            onChangeText={setUrl}
            placeholder="https://example.com/recipe…"
            placeholderTextColor={t.muted}
            autoCapitalize="none"
            keyboardType="url"
            autoFocus
            onSubmitEditing={handleImport}
            style={{
              borderWidth: 1,
              borderColor: t.border,
              backgroundColor: t.bg,
              borderRadius: 10,
              paddingHorizontal: 14,
              paddingVertical: 13,
              fontSize: 15,
              color: t.text,
              fontFamily: font.sans,
            }}
          />
          <Button
            label="Import recipe"
            variant="filled"
            full
            disabled={!url.trim()}
            onPress={handleImport}
            style={{ marginTop: 12 }}
          />
        </>
      )}

      {step === 'processing' && (
        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 16 }}>
          <ActivityIndicator size="large" color={t.green} />
          <Body size={14} color={t.muted}>
            {status}
          </Body>
        </View>
      )}

      {step === 'error' && (
        <View style={{ paddingVertical: 12 }}>
          <Body size={14} color={t.red} style={{ textAlign: 'center', marginBottom: 8 }}>
            {errorMsg}
          </Body>
          {errorMsg.includes('fetch') && (
            <Body size={12} color={t.muted} style={{ textAlign: 'center', marginBottom: 12 }}>
              Some sites block automated requests. Try the Pie Keeper Chrome extension instead.
            </Body>
          )}
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
            <Button label="Cancel" variant="secondary" onPress={close} style={{ flex: 1 }} />
            <Button label="Try again" variant="filled" onPress={() => setStep('url')} style={{ flex: 1 }} />
          </View>
        </View>
      )}
    </View>
  );
}
