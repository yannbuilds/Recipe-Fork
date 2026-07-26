import { Ionicons } from '@expo/vector-icons';
import type { Recipe, Tag } from '@recipe-aggregator/shared';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AddToCookbookSheet from '@/components/AddToCookbookSheet';
import BottomSheet from '@/components/BottomSheet';
import ConfirmModal from '@/components/ConfirmModal';
import FavouriteButton from '@/components/FavouriteButton';
import IngredientIcon from '@/components/IngredientIcon';
import MyNotesModal from '@/components/MyNotesModal';
import RateCookSheet from '@/components/RateCookSheet';
import { ScreenOnGlow } from '@/components/ScreenOnGlow';
import { Body, Button, CheckSquare, Divider, Eyebrow, Mono, Serif } from '@/components/ui';
import WeekPickerSheet from '@/components/WeekPickerSheet';
import { useAuth } from '@/context/AuthContext';
import { haptics } from '@/lib/haptics';
import { accentTitle, formatTime, getDomain, scaleQuantity } from '@/lib/recipeFormat';
import { supabase } from '@/lib/supabase';
import { stripHtml } from '@/lib/text';
import { useTheme } from '@/lib/theme';

interface RecipeData {
  recipe: Recipe;
  tags: Tag[];
  /** Cooking-history summary for the quiet "COOKED 3× · LAST …" line. */
  cooks: { count: number; last: string | null };
}

// Compact date for the cooked-history line: "12 Jul", with the year added
// once it's no longer this year ("12 Jul 2025").
function formatCookDate(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-AU', opts);
}

// Lowercase roman numeral for editorial group labels (i, ii, iii …).
function toRoman(n: number): string {
  const map: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

// Group ingredients/steps by their category, preserving order and each item's
// original index (check-off state stays keyed by that index). Items without a
// category all land in a single '' group, mirroring the web app.
function groupByCategory<T extends { category?: string | null }>(
  items: T[],
): { category: string; items: { value: T; index: number }[] }[] {
  const groups: { category: string; items: { value: T; index: number }[] }[] = [];
  items.forEach((value, index) => {
    const category = value.category || '';
    const existing = groups.find((g) => g.category === category);
    if (existing) existing.items.push({ value, index });
    else groups.push({ category, items: [{ value, index }] });
  });
  return groups;
}

async function fetchRecipe(id: string): Promise<RecipeData> {
  const [recipeRes, tagsRes, cooksRes] = await Promise.all([
    supabase.from('recipes').select('*').eq('id', id).single(),
    supabase.from('recipe_tags').select('tags(*)').eq('recipe_id', id),
    supabase
      .from('recipe_cooks')
      .select('cooked_at')
      .eq('recipe_id', id)
      .order('cooked_at', { ascending: false }),
  ]);
  if (recipeRes.error) throw new Error(recipeRes.error.message);
  const tags = ((tagsRes.data ?? []) as any[]).map((rt) => rt.tags).filter(Boolean) as Tag[];
  const cookRows = cooksRes.data ?? [];
  return {
    recipe: recipeRes.data as Recipe,
    tags,
    cooks: { count: cookRows.length, last: cookRows[0]?.cooked_at ?? null },
  };
}

function MetaCard({
  icon,
  label,
  value,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
}) {
  const t = useTheme();
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: t.card,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 4,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Ionicons name={icon} size={11} color={t.muted} />
        <Mono size={9} style={{ letterSpacing: 1 }}>
          {label.toUpperCase()}
        </Mono>
      </View>
      <Serif size={21} style={{ marginTop: 3 }}>
        {value}
      </Serif>
    </View>
  );
}

function AuthorNotesModal({
  open,
  notes,
  onClose,
}: {
  open: boolean;
  notes: string | null;
  onClose: () => void;
}) {
  const t = useTheme();
  if (!notes) return null;
  return (
    <BottomSheet open={open} onClose={onClose}>
      <View style={{ paddingHorizontal: 20, paddingTop: 4 }}>
        <Serif size={18} weight="semi" style={{ marginBottom: 12 }}>
          Author&apos;s notes
        </Serif>
        <ScrollView style={{ maxHeight: 420 }}>
          <Body size={14} color={t.text} style={{ lineHeight: 22 }}>
            {stripHtml(notes)}
          </Body>
        </ScrollView>
        <Button label="Close" variant="secondary" full style={{ marginTop: 16 }} onPress={onClose} />
      </View>
    </BottomSheet>
  );
}

export default function RecipeDetailScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, session, loading: authLoading } = useAuth();
  // Cook mode: arrived via the plan's "Cook recipe" button. Auto-enables
  // keep-awake and shows a floating "Mark as cooked" action; `entry` is the
  // meal_plan_recipes row to flip when done.
  const { id, cook, entry } = useLocalSearchParams<{ id: string; cook?: string; entry?: string }>();
  const cookMode = cook === '1';

  const [tab, setTab] = useState<'ingredients' | 'steps'>('ingredients');
  const [usedIngredients, setUsedIngredients] = useState<Set<string>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  const [currentServings, setCurrentServings] = useState(1);
  const [savedServings, setSavedServings] = useState(1);
  const [descExpanded, setDescExpanded] = useState(false);
  // Cook mode starts with the screen-on toggle already on.
  const [isAwake, setIsAwake] = useState(cookMode);
  const [markingCooked, setMarkingCooked] = useState(false);
  const [rateCookId, setRateCookId] = useState<string | null>(null);
  const [isFav, setIsFav] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [showNotes, setShowNotes] = useState(false);
  const [showAuthorNotes, setShowAuthorNotes] = useState(false);
  const [showCookbook, setShowCookbook] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [notesSaving, setNotesSaving] = useState(false);
  const [localNotes, setLocalNotes] = useState<string | null>(null);
  const notesTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const { data, isPending, error } = useQuery({
    queryKey: ['recipe', id],
    queryFn: () => fetchRecipe(id),
    enabled: !!session && !!id,
  });

  const recipe = data?.recipe;
  const tags = data?.tags ?? [];

  useEffect(() => {
    if (recipe) {
      const s = recipe.custom_servings ?? recipe.servings ?? 1;
      setCurrentServings(s);
      setSavedServings(s);
      setIsFav(recipe.is_favourite);
      setLocalNotes(recipe.user_notes);
    }
  }, [recipe]);

  // "Keep screen on" is per-recipe and momentary: each recipe screen owns its
  // own toggle (defaults off), and the lock is only held while this screen is
  // focused and the toggle is on — a per-recipe tag keeps two mounted recipe
  // screens from clobbering each other's lock.
  useFocusEffect(
    useCallback(() => {
      if (!isAwake) return;
      const tag = `recipe-${id}`;
      activateKeepAwakeAsync(tag).catch(() => {});
      return () => deactivateKeepAwake(tag);
    }, [isAwake, id]),
  );

  // Leaving the recipe (back, or pushing another recipe) switches the toggle
  // back off, so it never lingers on when you return. Empty deps keep this
  // callback stable so the cleanup fires on blur only — not on every toggle.
  useFocusEffect(
    useCallback(() => {
      return () => setIsAwake(false);
    }, []),
  );

  const steps = useMemo(
    () => (recipe ? [...recipe.steps].sort((a, b) => a.order - b.order) : []),
    [recipe],
  );

  // Cook-mode completion: flip the plan entry to cooked, log the cook in the
  // recipe's history, then ask how it went. Closing the rating sheet (save or
  // skip) lands back on the meal plan.
  async function handleMarkCooked() {
    if (!user || !id || markingCooked) return;
    setMarkingCooked(true);
    if (entry) {
      await supabase.from('meal_plan_recipes').update({ is_cooked: true }).eq('id', entry);
    }
    const { data: cook } = await supabase
      .from('recipe_cooks')
      .insert({ recipe_id: id, user_id: user.id, meal_plan_recipe_id: entry ?? null })
      .select('id')
      .single();
    setMarkingCooked(false);
    queryClient.invalidateQueries({ queryKey: ['recipe', id] });
    if (cook) {
      haptics.success();
      setRateCookId(cook.id);
    } else {
      router.back();
    }
  }

  if (!authLoading && !session) return <Redirect href="/sign-in" />;

  if (isPending || authLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={t.green} />
      </View>
    );
  }

  if (error || !recipe) {
    return (
      <View
        style={{ flex: 1, backgroundColor: t.bg, alignItems: 'center', justifyContent: 'center', padding: 24 }}
      >
        <Body color={t.red} style={{ textAlign: 'center' }}>
          {error?.message ?? 'Recipe not found.'}
        </Body>
      </View>
    );
  }

  const { head, last } = accentTitle(recipe.title);
  const notesText = stripHtml(localNotes ?? '');
  const videoId = recipe.video_url?.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
  )?.[1];

  function saveNotes(text: string) {
    setLocalNotes(text);
    clearTimeout(notesTimer.current);
    setNotesSaving(true);
    notesTimer.current = setTimeout(async () => {
      const clean = text.trim() === '' ? null : text;
      await supabase.from('recipes').update({ user_notes: clean }).eq('id', id);
      setNotesSaving(false);
    }, 1200);
  }

  async function saveServings() {
    haptics.success();
    await supabase.from('recipes').update({ custom_servings: currentServings }).eq('id', id);
    setSavedServings(currentServings);
  }

  async function handleDelete() {
    setShowDelete(false);
    haptics.success();
    await supabase.from('recipes').delete().eq('id', id);
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + (cookMode ? 110 : 40) }}>
        {/* Hero */}
        <View style={{ height: 340, backgroundColor: t.paper3 }}>
          {recipe.image_url ? (
            <Image
              source={{ uri: recipe.image_url }}
              style={{ width: '100%', height: '100%' }}
              contentFit="cover"
              cachePolicy="memory-disk"
              recyclingKey={recipe.id}
            />
          ) : (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="flame-outline" size={44} color={t.muted} />
            </View>
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.34)', 'rgba(0,0,0,0)', 'rgba(0,0,0,0)', t.bg]}
            locations={[0, 0.28, 0.62, 1]}
            style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
            pointerEvents="none"
          />

          <Pressable
            onPress={() => router.back()}
            style={{
              position: 'absolute',
              top: insets.top + 6,
              left: 12,
              width: 38,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'rgba(251,248,241,0.9)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="arrow-back" size={20} color="#1f1b16" />
          </Pressable>

          <Pressable
            onPress={() => {
              haptics.light();
              setIsAwake(!isAwake);
            }}
            style={{
              position: 'absolute',
              top: insets.top + 6,
              left: 58,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              height: 38,
              borderRadius: 19,
              backgroundColor: 'rgba(251,248,241,0.9)',
            }}
          >
            <Ionicons name={isAwake ? 'sunny' : 'moon'} size={14} color="#1f1b16" />
            <Body size={12} weight="semi" color="#1f1b16">
              Screen on
            </Body>
            <View
              style={{
                width: 34,
                height: 20,
                borderRadius: 10,
                padding: 2,
                backgroundColor: isAwake ? t.green : 'rgba(31,27,22,0.15)',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: 8,
                  backgroundColor: '#fff',
                  transform: [{ translateX: isAwake ? 14 : 0 }],
                }}
              />
            </View>
          </Pressable>

          <View style={{ position: 'absolute', top: insets.top + 6, right: 12 }}>
            <FavouriteButton recipeId={recipe.id} isFavourite={isFav} onToggle={setIsFav} size="md" />
          </View>
        </View>

        {/* Editorial header */}
        <View style={{ paddingHorizontal: 20, marginTop: 8 }}>
          {tags.length > 0 && (
            <Eyebrow style={{ marginBottom: 10 }}>
              {tags.slice(0, 3).map((tg) => tg.name).join('  ·  ')}
            </Eyebrow>
          )}
          <Serif size={32} style={{ lineHeight: 34 }}>
            {last ? (
              <>
                {head}{' '}
                <Serif size={32} italic color={t.green}>
                  {last}
                </Serif>
              </>
            ) : (
              recipe.title
            )}
          </Serif>

          {recipe.description && (
            <View style={{ marginTop: 12 }}>
              <Body
                size={15}
                color={t.textSoft}
                numberOfLines={descExpanded ? undefined : 3}
                style={{ lineHeight: 22 }}
              >
                {recipe.description}
              </Body>
              {recipe.description.length > 130 && (
                <Pressable onPress={() => setDescExpanded((v) => !v)}>
                  <Body size={14} color={t.green} style={{ marginTop: 4, textDecorationLine: 'underline' }}>
                    {descExpanded ? 'show less' : 'show more'}
                  </Body>
                </Pressable>
              )}
            </View>
          )}

          {(recipe.prep_time != null || recipe.cook_time != null || recipe.servings != null) && (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
              {recipe.prep_time != null && (
                <MetaCard icon="time-outline" label="Prep" value={formatTime(recipe.prep_time)} />
              )}
              {recipe.cook_time != null && (
                <MetaCard icon="flame-outline" label="Cook" value={formatTime(recipe.cook_time)} />
              )}
              {recipe.servings != null && (
                <MetaCard icon="people-outline" label="Serves" value={String(recipe.servings)} />
              )}
            </View>
          )}

          {/* Quiet cooked-history line — grows into a richer view later. */}
          {(data?.cooks?.count ?? 0) > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 12 }}>
              <Ionicons name="flame-outline" size={11} color={t.muted} />
              <Mono size={10} style={{ letterSpacing: 1 }}>
                COOKED {data!.cooks.count}&times;
                {data!.cooks.last ? ` · LAST ${formatCookDate(data!.cooks.last).toUpperCase()}` : ''}
              </Mono>
            </View>
          )}

          {(recipe.creator_name || recipe.source_url) && (
            <View
              style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginTop: 18 }}
            >
              {recipe.creator_name && (
                <Body size={14} color={t.muted}>
                  Recipe by{' '}
                  <Serif size={14} italic>
                    {recipe.creator_name}
                  </Serif>
                </Body>
              )}
              {recipe.source_url && (
                <Pressable
                  onPress={() => Linking.openURL(recipe.source_url)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  <Ionicons name="globe-outline" size={13} color={t.green} />
                  <Body size={14} color={t.green}>
                    {getDomain(recipe.source_url)} ↗
                  </Body>
                </Pressable>
              )}
            </View>
          )}

          <View style={{ flexDirection: 'row', gap: 18, marginTop: 14 }}>
            <Pressable
              onPress={() => setShowNotes(true)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Ionicons name="document-text-outline" size={15} color={t.orange} />
              <Body size={14}>My notes{notesText ? ' •' : ''}</Body>
            </Pressable>
            {recipe.author_notes && (
              <Pressable
                onPress={() => setShowAuthorNotes(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Ionicons name="document-text-outline" size={15} color={t.muted} />
                <Body size={14} color={t.muted}>
                  Author&apos;s notes
                </Body>
              </Pressable>
            )}
          </View>

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 18 }}>
            <Button
              label="Add to plan"
              variant="filled"
              style={{ flex: 1, backgroundColor: t.green, borderColor: t.green }}
              icon={<Ionicons name="calendar-outline" size={16} color={t.onGreen} />}
              onPress={() => setShowWeekPicker(true)}
            />
            <Button
              label="Add to cookbook"
              variant="filled"
              style={{ flex: 1, backgroundColor: t.orange, borderColor: t.orange }}
              icon={<Ionicons name="book-outline" size={16} color={t.onGreen} />}
              onPress={() => setShowCookbook(true)}
            />
          </View>
        </View>

        {/* Tabs */}
        <View style={{ paddingHorizontal: 20, marginTop: 26 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-end',
              justifyContent: 'space-between',
              borderBottomWidth: 1,
              borderBottomColor: t.border,
            }}
          >
            <View style={{ flexDirection: 'row', gap: 24 }}>
              {([
                ['ingredients', 'Ingredients', recipe.ingredients.length],
                ['steps', 'Steps', steps.length],
              ] as const).map(([key, label, count]) => {
                const active = tab === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => {
                      haptics.select();
                      setTab(key);
                    }}
                    style={{
                      paddingBottom: 12,
                      marginBottom: -1,
                      borderBottomWidth: 2,
                      borderBottomColor: active ? t.green : 'transparent',
                    }}
                  >
                    <Serif size={18} color={active ? t.text : t.muted}>
                      {label} <Mono size={11}>· {count}</Mono>
                    </Serif>
                  </Pressable>
                );
              })}
            </View>

            {recipe.servings != null && tab === 'ingredients' && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: t.border,
                  borderRadius: 999,
                  padding: 3,
                  backgroundColor: t.card,
                }}
              >
                <Pressable
                  onPress={() => {
                    haptics.select();
                    setCurrentServings((s) => Math.max(1, s - 1));
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: t.border,
                  }}
                >
                  <Ionicons name="remove" size={14} color={t.muted} />
                </Pressable>
                <View style={{ minWidth: 30, alignItems: 'center' }}>
                  <Serif size={15}>
                    {currentServings}
                    <Mono size={9}> sv</Mono>
                  </Serif>
                </View>
                <Pressable
                  onPress={() => {
                    haptics.select();
                    setCurrentServings((s) => s + 1);
                  }}
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: t.green,
                  }}
                >
                  <Ionicons name="add" size={14} color={t.onGreen} />
                </Pressable>
              </View>
            )}
          </View>

          {tab === 'ingredients' && currentServings !== savedServings && (
            <View style={{ alignItems: 'flex-end', marginTop: 10 }}>
              <Pressable
                onPress={saveServings}
                style={{
                  borderWidth: 1,
                  borderColor: t.green,
                  backgroundColor: t.greenLight,
                  borderRadius: 20,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                }}
              >
                <Body size={12} weight="semi" color={t.green}>
                  Save serving size
                </Body>
              </Pressable>
            </View>
          )}

          <View
            style={{
              marginTop: 16,
              backgroundColor: t.paper,
              borderWidth: 1,
              borderColor: t.ruleHair,
              borderRadius: 8,
              padding: 16,
            }}
          >
            {tab === 'ingredients'
              ? groupByCategory(recipe.ingredients).map((group, gi) => (
                  <View key={group.category || `group-${gi}`} style={{ marginTop: gi > 0 ? 20 : 0 }}>
                    {group.category ? (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'baseline',
                          gap: 10,
                          paddingBottom: 8,
                          marginBottom: 4,
                          borderBottomWidth: 1,
                          borderBottomColor: t.border,
                        }}
                      >
                        <Serif size={13} italic color={t.green}>
                          {toRoman(gi + 1)}.
                        </Serif>
                        <Serif size={18} style={{ flex: 1 }}>
                          {group.category}
                        </Serif>
                      </View>
                    ) : null}
                    {group.items.map(({ value: ing, index }, i) => {
                      const key = `${index}`;
                      const used = usedIngredients.has(key);
                      const name = ing.item || ing.original_text || '';
                      const qty =
                        ing.quantity || ing.unit
                          ? `${scaleQuantity(ing.quantity, recipe.servings, currentServings)}${ing.unit ? ` ${ing.unit}` : ''}`.trim()
                          : '';
                      return (
                        <Pressable
                          key={index}
                          onPress={() => {
                            haptics.select();
                            setUsedIngredients((prev) => {
                              const next = new Set(prev);
                              if (next.has(key)) next.delete(key);
                              else next.add(key);
                              return next;
                            });
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 12,
                            paddingVertical: 12,
                            borderBottomWidth: i < group.items.length - 1 ? 1 : 0,
                            borderBottomColor: t.ruleHair,
                          }}
                        >
                          <CheckSquare checked={used} />
                          <IngredientIcon item={ing.item || ''} />
                          <Serif
                            size={16}
                            color={used ? t.muted : t.text}
                            style={{ flex: 1, textDecorationLine: used ? 'line-through' : 'none' }}
                          >
                            {name}
                          </Serif>
                          {qty ? <Mono size={11}>{qty}</Mono> : null}
                        </Pressable>
                      );
                    })}
                  </View>
                ))
              : groupByCategory(steps).map((group, gi) => (
                  <View key={group.category || `group-${gi}`} style={{ marginTop: gi > 0 ? 8 : 0 }}>
                    {group.category ? (
                      <Eyebrow style={{ marginBottom: 12 }}>{group.category}</Eyebrow>
                    ) : null}
                    {group.items.map(({ value: step }, i) => {
                      const done = completedSteps.has(step.order);
                      return (
                        <Pressable
                          key={step.order}
                          onPress={() => {
                            haptics.select();
                            setCompletedSteps((prev) => {
                              const next = new Set(prev);
                              if (next.has(step.order)) next.delete(step.order);
                              else next.add(step.order);
                              return next;
                            });
                          }}
                          style={{ flexDirection: 'row', gap: 12, paddingBottom: 20 }}
                        >
                          <View style={{ alignItems: 'center' }}>
                            <View
                              style={{
                                width: 30,
                                height: 30,
                                borderRadius: 15,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: done ? t.muted : t.green,
                              }}
                            >
                              <Body size={13} weight="bold" color={t.onGreen}>
                                {done ? '✓' : i + 1}
                              </Body>
                            </View>
                            {i < group.items.length - 1 && (
                              <View style={{ flex: 1, width: 2, backgroundColor: t.greenLight, marginTop: 2 }} />
                            )}
                          </View>
                          <Body
                            size={15}
                            color={done ? t.muted : t.text}
                            style={{
                              flex: 1,
                              lineHeight: 22,
                              paddingTop: 4,
                              textDecorationLine: done ? 'line-through' : 'none',
                            }}
                          >
                            {step.instruction}
                          </Body>
                        </Pressable>
                      );
                    })}
                  </View>
                ))}
          </View>

          {videoId && (
            <View style={{ marginTop: 24 }}>
              <Eyebrow>Watch</Eyebrow>
              <Serif size={22} style={{ marginTop: 6, marginBottom: 12 }}>
                Video
              </Serif>
              <Pressable
                onPress={() => Linking.openURL(recipe.video_url!)}
                style={{ borderRadius: 8, overflow: 'hidden', aspectRatio: 16 / 9, backgroundColor: t.paper3 }}
              >
                <Image
                  source={{ uri: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg` }}
                  style={{ width: '100%', height: '100%' }}
                  contentFit="cover"
                  cachePolicy="memory-disk"
                />
                <View
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <View
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 28,
                      backgroundColor: 'rgba(0,0,0,0.55)',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="play" size={26} color="#fff" />
                  </View>
                </View>
              </Pressable>
            </View>
          )}

          <Divider style={{ marginTop: 30 }} />
          <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
            <Button
              label="Edit"
              variant="secondary"
              icon={<Ionicons name="pencil" size={15} color={t.text} />}
              onPress={() => router.push({ pathname: '/recipe/[id]/edit', params: { id } })}
              style={{ flex: 1 }}
            />
            <Button
              label="Delete"
              variant="danger"
              icon={<Ionicons name="trash-outline" size={15} color={t.red} />}
              onPress={() => setShowDelete(true)}
              style={{ flex: 1 }}
            />
          </View>

          <Serif italic size={13} color={t.muted} style={{ textAlign: 'center', marginTop: 22 }}>
            {recipe.source_url ? `Saved from ${getDomain(recipe.source_url)}` : 'Saved'}
            {recipe.created_at
              ? ` · ${new Date(recipe.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`
              : ''}
          </Serif>
        </View>
      </ScrollView>

      {/* Full-screen halo while keep-awake is on (green→orange, breathing) */}
      <ScreenOnGlow active={isAwake} />

      {/* Cook mode: floating "Mark as cooked" */}
      {cookMode && !rateCookId && (
        <View
          pointerEvents="box-none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: insets.bottom + 16,
            alignItems: 'center',
          }}
        >
          <Pressable
            onPress={handleMarkCooked}
            disabled={markingCooked}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingVertical: 13,
              paddingHorizontal: 26,
              borderRadius: 999,
              backgroundColor: t.greenSolid,
              opacity: markingCooked ? 0.7 : 1,
              shadowColor: '#000',
              shadowOpacity: 0.25,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 4 },
              elevation: 6,
            }}
          >
            <Ionicons name="checkmark" size={17} color={t.onGreen} />
            <Body size={15} weight="semi" color={t.onGreen}>
              {markingCooked ? 'Saving…' : 'Mark as cooked'}
            </Body>
          </Pressable>
        </View>
      )}

      <ConfirmModal
        open={showDelete}
        title="Delete recipe"
        message="Are you sure you want to delete this recipe? This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
      <MyNotesModal
        open={showNotes}
        content={localNotes}
        saving={notesSaving}
        onSave={saveNotes}
        onClose={() => setShowNotes(false)}
      />
      <AuthorNotesModal
        open={showAuthorNotes}
        notes={recipe.author_notes}
        onClose={() => setShowAuthorNotes(false)}
      />
      <AddToCookbookSheet open={showCookbook} recipeId={recipe.id} onClose={() => setShowCookbook(false)} />
      {user && (
        <WeekPickerSheet
          open={showWeekPicker}
          recipeId={recipe.id}
          recipeTitle={recipe.title}
          userId={user.id}
          onClose={() => setShowWeekPicker(false)}
        />
      )}

      {/* Post-cook rating — closing (save or skip) returns to the plan. */}
      <RateCookSheet
        open={rateCookId !== null}
        cookId={rateCookId}
        recipeId={recipe.id}
        recipeTitle={recipe.title}
        onAutoFavourite={() => {
          setIsFav(true);
          queryClient.invalidateQueries({ queryKey: ['recipes'] });
        }}
        onClose={() => {
          setRateCookId(null);
          router.back();
        }}
      />
    </View>
  );
}
