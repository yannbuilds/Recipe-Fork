import { Ionicons } from '@expo/vector-icons';
import { findRecipeWithSameSource, normalizeRecipeSourceUrl } from '@recipe-aggregator/shared';
import { useRouter } from 'expo-router';
import { useShareIntentContext } from 'expo-share-intent';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Eyebrow, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { haptics } from '@/lib/haptics';
import { saveTags } from '@/lib/saveTags';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

type Phase = 'waiting' | 'importing' | 'success' | 'error';

function extractUrl(text: string | null | undefined): string | null {
  if (!text) return null;
  const match = text.match(/https?:\/\/[^\s<>"']+/i);
  return match?.[0]?.replace(/[),.;!?]+$/, '') ?? null;
}

async function findExistingRecipe(sourceUrl: string): Promise<{ id: string; title: string } | undefined> {
  const { data, error } = await supabase.from('recipes').select('id, title, source_url');
  if (error) throw new Error(error.message);
  return findRecipeWithSameSource(data ?? [], sourceUrl);
}

async function functionErrorMessage(
  error: { context?: unknown; message?: string },
  fallback: string,
) {
  try {
    if (error.context instanceof Response) {
      const clone = error.context.clone();
      try {
        const body = await clone.json();
        return body?.error || fallback;
      } catch {
        return (await error.context.text()) || fallback;
      }
    }
    return error.message || fallback;
  } catch {
    return fallback;
  }
}

export default function ShareRecipeScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const { shareIntent, hasShareIntent, resetShareIntent, error: shareError } =
    useShareIntentContext();
  const sourceUrl = useMemo(
    () => shareIntent.webUrl ?? extractUrl(shareIntent.text),
    [shareIntent.text, shareIntent.webUrl],
  );
  const startedForUrl = useRef<string | null>(null);
  const [phase, setPhase] = useState<Phase>('waiting');
  const [status, setStatus] = useState('Opening the shared post…');
  const [error, setError] = useState<string | null>(null);
  const [recipeId, setRecipeId] = useState<string | null>(null);
  const [recipeTitle, setRecipeTitle] = useState<string | null>(null);

  async function importSharedRecipe(url: string) {
    if (!session) return;
    setPhase('importing');
    setError(null);
    setStatus('Reading the caption and video…');

    try {
      const normalizedUrl = normalizeRecipeSourceUrl(url);
      const rawDuplicate = await findExistingRecipe(normalizedUrl);
      if (rawDuplicate) {
        setRecipeId(rawDuplicate.id);
        setRecipeTitle(rawDuplicate.title);
        setPhase('success');
        resetShareIntent();
        haptics.success();
        return;
      }

      const { data, error: invokeError } = await supabase.functions.invoke('import-recipe', {
        body: { url: normalizedUrl },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (invokeError) {
        throw new Error(await functionErrorMessage(invokeError, 'Could not import that post'));
      }
      if (data?.error) throw new Error(data.error);
      if (!data?.recipe) throw new Error('No recipe was found in that post');

      setStatus('Saving it to your recipes…');
      const canonicalUrl = data.recipe.source_url || normalizedUrl;
      const canonicalDuplicate = await findExistingRecipe(canonicalUrl);
      if (canonicalDuplicate) {
        setRecipeId(canonicalDuplicate.id);
        setRecipeTitle(canonicalDuplicate.title);
        setPhase('success');
        resetShareIntent();
        haptics.success();
        return;
      }

      const { data: saved, error: saveError } = await supabase
        .from('recipes')
        .insert({
          ...data.recipe,
          source_url: normalizeRecipeSourceUrl(canonicalUrl),
          user_id: session.user.id,
          is_favourite: false,
        })
        .select('id, title')
        .single();
      if (saveError || !saved) throw new Error(saveError?.message ?? 'Could not save the recipe');

      await saveTags(saved.id, data.tags ?? []).catch(() => {});
      setRecipeId(saved.id);
      setRecipeTitle(saved.title);
      setPhase('success');
      resetShareIntent();
      haptics.success();
    } catch (caught) {
      haptics.error();
      setError(caught instanceof Error ? caught.message : 'Something went wrong');
      setPhase('error');
    }
  }

  useEffect(() => {
    if (authLoading || !session || !sourceUrl || startedForUrl.current === sourceUrl) return;
    startedForUrl.current = sourceUrl;
    void importSharedRecipe(sourceUrl);
  }, [authLoading, session, sourceUrl]);

  function close() {
    resetShareIntent();
    router.replace('/');
  }

  function retry() {
    if (!sourceUrl) return;
    startedForUrl.current = null;
    void importSharedRecipe(sourceUrl);
  }

  const unsupported = !authLoading && hasShareIntent && !sourceUrl;

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.bg,
        paddingTop: insets.top + 12,
        paddingBottom: insets.bottom + 20,
        paddingHorizontal: 24,
      }}
    >
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
        <Pressable onPress={close} hitSlop={12} accessibilityLabel="Close shared recipe import">
          <Ionicons name="close" size={26} color={t.muted} />
        </Pressable>
      </View>

      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <View
          style={{
            width: 84,
            height: 84,
            borderRadius: 26,
            backgroundColor: phase === 'error' ? t.redLight : t.greenLight,
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 26,
          }}
        >
          {phase === 'importing' ? (
            <ActivityIndicator size="large" color={t.green} />
          ) : (
            <Ionicons
              name={phase === 'success' ? 'checkmark' : phase === 'error' ? 'alert' : 'restaurant-outline'}
              size={38}
              color={phase === 'error' ? t.red : t.green}
            />
          )}
        </View>

        <Eyebrow>Shared to Pie Keeper</Eyebrow>
        <Serif size={30} style={{ textAlign: 'center', marginTop: 10, lineHeight: 34 }}>
          {phase === 'success'
            ? recipeTitle || 'Recipe saved'
            : phase === 'error' || unsupported || shareError
              ? 'We couldn’t read that recipe'
              : !authLoading && !session
                ? 'Sign in to save this recipe'
                : 'Saving your recipe'}
        </Serif>

        <Body
          size={15}
          color={phase === 'error' ? t.red : t.muted}
          style={{ textAlign: 'center', lineHeight: 22, marginTop: 14, maxWidth: 330 }}
        >
          {phase === 'success'
            ? 'It’s in your collection and available on mobile and web.'
            : phase === 'error'
              ? error
              : unsupported
                ? 'Share a public Instagram, TikTok, YouTube, Facebook, Pinterest, or recipe webpage link.'
                : shareError
                  ? shareError
                  : !authLoading && !session
                    ? 'Your shared post will stay here while you sign in.'
                    : phase === 'importing'
                      ? status
                      : 'Opening the shared post…'}
        </Body>

        <View style={{ width: '100%', maxWidth: 340, gap: 10, marginTop: 30 }}>
          {!authLoading && !session && (
            <Button label="Sign in" variant="filled" full onPress={() => router.push('/sign-in')} />
          )}
          {phase === 'success' && recipeId && (
            <Button
              label="View recipe"
              variant="filled"
              full
              onPress={() => router.replace({ pathname: '/recipe/[id]', params: { id: recipeId } })}
            />
          )}
          {phase === 'error' && sourceUrl && (
            <Button label="Try again" variant="filled" full onPress={retry} />
          )}
          {(phase === 'success' || phase === 'error' || unsupported || shareError) && (
            <Button label={phase === 'success' ? 'Done' : 'Cancel'} variant="secondary" full onPress={close} />
          )}
        </View>
      </View>
    </View>
  );
}
