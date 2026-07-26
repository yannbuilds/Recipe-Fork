import { Ionicons } from '@expo/vector-icons';
import type { Cookbook, Recipe } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Body, Button, Mono, Serif } from '@/components/ui';
import { haptics } from '@/lib/haptics';
import { DAY_INDEXES, DAY_SHORT, dayDate, todayIndex } from '@/lib/mealPlanDays';
import { supabase } from '@/lib/supabase';
import { font, useTheme } from '@/lib/theme';

export interface PlanPrefs {
  meals: number;
  servings: number;
}

export interface PlanPick {
  recipe: Recipe;
  nights: number;
}

/** One night of one pick — the unit that gets placed on a day. */
interface Slot {
  key: string;
  recipeId: string;
  nightIndex: number;
  day: number | null;
}

interface Props {
  open: boolean;
  weekStart: Date;
  takenDays: Set<number>;
  prefs: PlanPrefs | null;
  onSavePrefs: (prefs: PlanPrefs) => void;
  onCommit: (
    picks: PlanPick[],
    slots: { recipeId: string; nightIndex: number; day: number | null }[],
    servingsPerNight: number,
  ) => Promise<void>;
  onClose: () => void;
}

/** Where the picker is reading from. `cookbook:<id>` narrows to one cookbook. */
type Filter = 'suggested' | 'favourites' | 'recent' | 'all' | `cookbook:${string}`;

const COOKBOOK_PREFIX = 'cookbook:';

/**
 * Plan mode. Asks the two setup questions once, remembers the answers, and from
 * then on opens straight at picking. Every step after the first is skippable —
 * you can bail at any point and the meals just land in the week unplaced.
 */
export default function PlanWeekSheet({
  open,
  weekStart,
  takenDays,
  prefs,
  onSavePrefs,
  onCommit,
  onClose,
}: Props) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [meals, setMeals] = useState(4);
  const [servings, setServings] = useState(2);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lastCooked, setLastCooked] = useState<Record<string, string>>({});
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [cookbookRecipes, setCookbookRecipes] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('suggested');
  const [search, setSearch] = useState('');
  const [picks, setPicks] = useState<PlanPick[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(prefs ? 2 : 1);
    setMeals(prefs?.meals ?? 4);
    setServings(prefs?.servings ?? 2);
    setPicks([]);
    setSlots([]);
    setActiveSlot(null);
    setSearch('');
    setFilter('suggested');
    setLoading(true);
    (async () => {
      const [{ data: recipeData }, { data: cookData }, { data: cbData }, { data: cbRecipeData }] =
        await Promise.all([
          supabase.from('recipes').select('*').order('title'),
          supabase.from('recipe_cooks').select('recipe_id, cooked_at'),
          supabase
            .from('cookbooks')
            .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false }),
          supabase.from('cookbook_recipes').select('cookbook_id, recipe_id'),
        ]);
      setRecipes((recipeData as Recipe[]) ?? []);
      const map: Record<string, string> = {};
      for (const r of (cookData as { recipe_id: string; cooked_at: string }[]) ?? []) {
        if (!map[r.recipe_id] || r.cooked_at > map[r.recipe_id]) map[r.recipe_id] = r.cooked_at;
      }
      setLastCooked(map);
      setCookbooks((cbData as Cookbook[]) ?? []);
      const members: Record<string, Set<string>> = {};
      for (const row of (cbRecipeData as { cookbook_id: string; recipe_id: string }[]) ?? []) {
        (members[row.cookbook_id] ??= new Set()).add(row.recipe_id);
      }
      setCookbookRecipes(members);
      setLoading(false);
    })();
  }, [open, prefs]);

  // Cookbooks you can actually pick from — an empty one is just noise here.
  const pickableCookbooks = useMemo(
    () => cookbooks.filter((c) => (cookbookRecipes[c.id]?.size ?? 0) > 0),
    [cookbooks, cookbookRecipes],
  );

  const activeCookbook = filter.startsWith(COOKBOOK_PREFIX)
    ? cookbooks.find((c) => c.id === filter.slice(COOKBOOK_PREFIX.length))
    : undefined;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = recipes.filter((r) => !q || r.title.toLowerCase().includes(q));
    if (filter === 'favourites') list = list.filter((r) => r.is_favourite);
    if (filter.startsWith(COOKBOOK_PREFIX)) {
      const ids = cookbookRecipes[filter.slice(COOKBOOK_PREFIX.length)];
      list = ids ? list.filter((r) => ids.has(r.id)) : [];
    }
    if (filter === 'recent') {
      list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (filter === 'suggested' || filter.startsWith(COOKBOOK_PREFIX)) {
      // Longest time since you last cooked it, never-cooked first.
      list = [...list].sort((a, b) => (lastCooked[a.id] ?? '').localeCompare(lastCooked[b.id] ?? ''));
    }
    return list.slice(0, 60);
  }, [recipes, search, filter, lastCooked, cookbookRecipes]);

  const totalNights = picks.reduce((sum, p) => sum + p.nights, 0);

  function togglePick(recipe: Recipe) {
    haptics.select();
    setPicks((prev) => {
      const found = prev.find((p) => p.recipe.id === recipe.id);
      if (found) return prev.filter((p) => p.recipe.id !== recipe.id);
      return [...prev, { recipe, nights: 1 }];
    });
  }

  function cycleNights(recipeId: string) {
    haptics.light();
    setPicks((prev) =>
      prev.map((p) => (p.recipe.id === recipeId ? { ...p, nights: p.nights >= 3 ? 1 : p.nights + 1 } : p)),
    );
  }

  function minutesFor(recipeId: string): number {
    const r = recipes.find((x) => x.id === recipeId);
    return (r?.prep_time ?? 0) + (r?.cook_time ?? 0);
  }

  function recipeFor(id: string): Recipe | undefined {
    return recipes.find((r) => r.id === id);
  }

  function goToPlacement() {
    const next: Slot[] = [];
    for (const pick of picks) {
      for (let n = 0; n < pick.nights; n++) {
        next.push({ key: `${pick.recipe.id}-${n}`, recipeId: pick.recipe.id, nightIndex: n, day: null });
      }
    }
    setSlots(next);
    setActiveSlot(next[0]?.key ?? null);
    setStep(3);
  }

  function placeOnDay(day: number) {
    if (!activeSlot) return;
    haptics.select();
    setSlots((prev) => {
      const next = prev.map((s) => (s.key === activeSlot ? { ...s, day } : s));
      const stillOpen = next.find((s) => s.day === null);
      setActiveSlot(stillOpen?.key ?? null);
      return next;
    });
  }

  function autoFill() {
    haptics.success();
    const today = todayIndex(weekStart);
    const used = new Set<number>([
      ...takenDays,
      ...slots.filter((s) => s.day !== null).map((s) => s.day as number),
    ]);
    const free = DAY_INDEXES.filter((d) => !used.has(d) && (today === null || d >= today));

    const take = (day: number) => {
      const i = free.indexOf(day);
      if (i >= 0) free.splice(i, 1);
    };

    // Group the open nights by recipe so a meal-prep batch can be spread out
    // rather than landing on two days in a row.
    const byRecipe = new Map<string, Slot[]>();
    for (const s of slots.filter((s) => s.day === null)) {
      const list = byRecipe.get(s.recipeId) ?? [];
      list.push(s);
      byRecipe.set(s.recipeId, list);
    }

    // Longest cooks choose first, so the 90-minute braise gets a weekend.
    const groups = [...byRecipe.entries()].sort((a, b) => minutesFor(b[0]) - minutesFor(a[0]));

    const assigned = new Map<string, number>();
    for (const [recipeId, nights] of groups) {
      nights.sort((a, b) => a.nightIndex - b.nightIndex);
      let prev: number | null = null;
      for (const slot of nights) {
        if (free.length === 0) break;
        let day: number;
        if (prev === null) {
          const weekend = free.filter((d) => d >= 5);
          day = minutesFor(recipeId) >= 45 && weekend.length > 0 ? weekend[0] : free[0];
        } else {
          // Later nights of the same cook want a gap — eating the same thing two
          // nights running is the thing meal prep is trying to avoid.
          const gap = prev;
          const spaced = free.filter((d) => Math.abs(d - gap) >= 2);
          day =
            spaced.length > 0
              ? spaced.reduce((best, d) => (Math.abs(d - gap) < Math.abs(best - gap) ? d : best))
              : free[0];
        }
        take(day);
        assigned.set(slot.key, day);
        prev = day;
      }
    }
    setSlots((prev) => prev.map((s) => (assigned.has(s.key) ? { ...s, day: assigned.get(s.key)! } : s)));
    setActiveSlot(null);
  }

  async function commit() {
    setSaving(true);
    await onCommit(
      picks,
      slots.map((s) => ({ recipeId: s.recipeId, nightIndex: s.nightIndex, day: s.day })),
      servings,
    );
    setSaving(false);
    haptics.success();
    onClose();
  }

  const stepper = (value: number, set: (n: number) => void, unit: string, min: number, max: number) => (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 26,
        paddingVertical: 16,
        borderWidth: 1,
        borderColor: t.border,
        borderRadius: 4,
        backgroundColor: t.card,
      }}
    >
      <Pressable
        onPress={() => {
          haptics.select();
          set(Math.max(min, value - 1));
        }}
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          borderWidth: 1,
          borderColor: t.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="remove" size={18} color={t.green} />
      </Pressable>
      <View style={{ alignItems: 'center', minWidth: 70 }}>
        <Serif size={42} style={{ lineHeight: 46 }}>
          {value}
        </Serif>
        <Mono size={9} style={{ letterSpacing: 1.6, marginTop: 4 }}>
          {unit.toUpperCase()}
        </Mono>
      </View>
      <Pressable
        onPress={() => {
          haptics.select();
          set(Math.min(max, value + 1));
        }}
        style={{
          width: 42,
          height: 42,
          borderRadius: 21,
          borderWidth: 1,
          borderColor: t.border,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons name="add" size={18} color={t.green} />
      </Pressable>
    </View>
  );

  return (
    // Full screen, not `pageSheet`. A page sheet is laid out by UIKit at a
    // height React Native doesn't reliably know about, so the pinned footer —
    // the only way forward through the flow — ended up below the sheet's
    // visible edge and untappable. Full screen means the flex layout here and
    // the visible screen are the same box, so the footer is always reachable.
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="fullScreen"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: t.bg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: insets.top + 12,
            paddingBottom: 14,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
          }}
        >
          <View>
            <Mono size={9.5} color={t.green} style={{ letterSpacing: 1.6 }}>
              {step === 1
                ? 'SET UP · ONCE'
                : step === 2
                  ? `${totalNights} OF ${meals} NIGHTS`
                  : 'PUT THEM ON DAYS'}
            </Mono>
            <Serif size={23} style={{ marginTop: 6 }}>
              Plan the week
            </Serif>
          </View>
          <Pressable onPress={onClose} hitSlop={10} style={{ paddingTop: 4 }}>
            <Ionicons name="close" size={22} color={t.muted} />
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={{ padding: 20, paddingBottom: 30 }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* ── Step 1: the two questions ────────────── */}
          {step === 1 && (
            <View>
              <Serif size={20} style={{ marginBottom: 12 }}>
                How many meals do you want to cook?
              </Serif>
              {stepper(meals, setMeals, 'meals', 1, 14)}

              <Serif size={20} style={{ marginTop: 24, marginBottom: 12 }}>
                Cooking for how many?
              </Serif>
              {stepper(servings, setServings, 'per night', 1, 12)}

              <View
                style={{
                  marginTop: 20,
                  padding: 13,
                  borderLeftWidth: 2,
                  borderLeftColor: t.green,
                  backgroundColor: t.greenLight,
                  borderRadius: 3,
                }}
              >
                <Body size={12.5} color={t.textSoft} style={{ lineHeight: 19 }}>
                  Saved for next time — you'll skip straight to picking. A meal set to two nights shops for{' '}
                  {servings * 2} servings, so one cook covers both.
                </Body>
              </View>
            </View>
          )}

          {/* ── Step 2: pick the recipes ─────────────── */}
          {step === 2 && (
            <View>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderWidth: 1,
                  borderColor: t.border,
                  borderRadius: 999,
                  backgroundColor: t.card,
                  paddingLeft: 14,
                  paddingRight: 6,
                  paddingVertical: 6,
                  marginBottom: 14,
                }}
              >
                <Mono size={9.5} color={t.textSoft} style={{ letterSpacing: 1 }}>
                  {meals} MEALS · SERVES {servings}
                </Mono>
                <Pressable
                  onPress={() => setStep(1)}
                  style={{ borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}
                >
                  <Body size={12} color={t.green}>
                    Change
                  </Body>
                </Pressable>
              </View>

              <TextInput
                value={search}
                onChangeText={setSearch}
                placeholder="Search recipes…"
                placeholderTextColor={t.muted}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: t.border,
                  borderRadius: 10,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  color: t.text,
                  fontFamily: font.sans,
                  fontSize: 15,
                  backgroundColor: t.card,
                  marginBottom: 12,
                }}
              />

              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  gap: 6,
                  marginBottom: pickableCookbooks.length > 0 ? 14 : 16,
                }}
              >
                {(
                  [
                    ['suggested', 'Not cooked lately'],
                    ['favourites', 'Favourites'],
                    ['recent', 'Newest'],
                    ['all', 'All'],
                  ] as [Filter, string][]
                ).map(([key, label]) => {
                  const on = filter === key;
                  return (
                    <Pressable
                      key={key}
                      onPress={() => {
                        haptics.select();
                        setFilter(key);
                      }}
                      style={{
                        paddingHorizontal: 11,
                        paddingVertical: 6,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: on ? t.greenSolid : t.border,
                        backgroundColor: on ? t.greenSolid : 'transparent',
                      }}
                    >
                      <Mono size={9} color={on ? t.onGreen : t.muted} style={{ letterSpacing: 1 }}>
                        {label.toUpperCase()}
                      </Mono>
                    </Pressable>
                  );
                })}
              </View>

              {/* Your shelves, right here — half the week is already decided in a
                  cookbook, so make it pickable without leaving plan mode. */}
              {pickableCookbooks.length > 0 && (
                <View style={{ marginBottom: 14 }}>
                  <Mono size={9} style={{ letterSpacing: 1.5, marginBottom: 8 }}>
                    FROM A COOKBOOK
                  </Mono>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={{ marginHorizontal: -20 }}
                    contentContainerStyle={{ paddingHorizontal: 20, gap: 6 }}
                  >
                    {pickableCookbooks.map((cb) => {
                      const key: Filter = `${COOKBOOK_PREFIX}${cb.id}`;
                      const on = filter === key;
                      const count = cookbookRecipes[cb.id]?.size ?? 0;
                      return (
                        <Pressable
                          key={cb.id}
                          onPress={() => {
                            haptics.select();
                            setFilter(on ? 'suggested' : key);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            maxWidth: 210,
                            paddingHorizontal: 12,
                            paddingVertical: 7,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: on ? t.greenSolid : t.border,
                            backgroundColor: on ? t.greenSolid : 'transparent',
                          }}
                        >
                          <Body size={12}>{cb.emoji || '📗'}</Body>
                          <Body size={12} numberOfLines={1} color={on ? t.onGreen : t.textSoft} style={{ flexShrink: 1 }}>
                            {cb.name}
                          </Body>
                          <Mono size={9} color={on ? t.onGreen : t.muted}>
                            {count}
                          </Mono>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {activeCookbook && (
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}
                >
                  <Body size={12.5} color={t.muted} style={{ flexShrink: 1, lineHeight: 18 }}>
                    Showing {activeCookbook.name}, least recently cooked first.
                  </Body>
                  <Pressable
                    hitSlop={8}
                    onPress={() => {
                      haptics.select();
                      setFilter('suggested');
                    }}
                  >
                    <Body size={12.5} color={t.green}>
                      Show everything
                    </Body>
                  </Pressable>
                </View>
              )}

              {loading && <ActivityIndicator color={t.green} style={{ marginVertical: 28 }} />}

              {!loading && visible.length === 0 && (
                <Body size={14} color={t.muted} style={{ paddingVertical: 24, textAlign: 'center' }}>
                  {search.trim() ? 'No recipes match that search.' : 'Nothing to pick here yet.'}
                </Body>
              )}

              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 11 }}>
                {visible.map((recipe) => {
                  const pick = picks.find((p) => p.recipe.id === recipe.id);
                  return (
                    <View key={recipe.id} style={{ width: '47.5%' }}>
                      <Pressable onPress={() => togglePick(recipe)}>
                        <View
                          style={{
                            aspectRatio: 4 / 3,
                            borderRadius: 4,
                            overflow: 'hidden',
                            backgroundColor: t.paper3,
                            borderWidth: pick ? 2 : 1,
                            borderColor: pick ? t.greenSolid : t.border,
                          }}
                        >
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
                              <Ionicons name="restaurant-outline" size={22} color={t.muted} />
                            </View>
                          )}
                          <View
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              width: 24,
                              height: 24,
                              borderRadius: 12,
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: pick ? t.greenSolid : 'rgba(0,0,0,0.45)',
                            }}
                          >
                            <Ionicons name={pick ? 'checkmark' : 'add'} size={14} color="#fff" />
                          </View>
                        </View>
                        <Serif size={14} numberOfLines={2} style={{ marginTop: 6, lineHeight: 17 }}>
                          {recipe.title}
                        </Serif>
                      </Pressable>

                      {/* Meal prep: one cook, several nights. */}
                      {pick && (
                        <Pressable
                          onPress={() => cycleNights(recipe.id)}
                          style={{
                            alignSelf: 'flex-start',
                            marginTop: 5,
                            paddingHorizontal: 9,
                            paddingVertical: 4,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: t.green,
                            backgroundColor: t.greenLight,
                          }}
                        >
                          <Mono size={9} color={t.green} style={{ letterSpacing: 0.8 }}>
                            {pick.nights} NIGHT{pick.nights > 1 ? 'S' : ''} · SERVES {servings * pick.nights}
                          </Mono>
                        </Pressable>
                      )}
                    </View>
                  );
                })}
              </View>
            </View>
          )}

          {/* ── Step 3: place them ───────────────────── */}
          {step === 3 && (
            <View>
              <Body size={13.5} color={t.textSoft} style={{ lineHeight: 20, marginBottom: 14 }}>
                Pick a night below, then tap a day. Anything you leave sits in the week without a day — that's fine.
              </Body>

              {DAY_INDEXES.map((d) => {
                const slot = slots.find((s) => s.day === d);
                const recipe = slot ? recipeFor(slot.recipeId) : undefined;
                const busy = takenDays.has(d);
                const date = dayDate(weekStart, d);
                return (
                  <Pressable
                    key={d}
                    onPress={() => !busy && placeOnDay(d)}
                    disabled={busy}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 12,
                      paddingHorizontal: 10,
                      paddingVertical: 9,
                      marginBottom: 6,
                      borderRadius: 4,
                      borderWidth: 1,
                      borderStyle: slot || busy ? 'solid' : 'dashed',
                      borderColor: slot ? t.green : t.border,
                      backgroundColor: slot ? t.greenLight : t.card,
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <Mono size={9.5} style={{ width: 46, letterSpacing: 0.6 }}>
                      {DAY_SHORT[d].toUpperCase()} {date.getDate()}
                    </Mono>
                    {recipe ? (
                      <>
                        {recipe.image_url ? (
                          <Image
                            source={{ uri: recipe.image_url }}
                            style={{ width: 32, height: 32, borderRadius: 3 }}
                            contentFit="cover"
                            cachePolicy="memory-disk"
                            recyclingKey={recipe.id}
                          />
                        ) : (
                          <View style={{ width: 32, height: 32, borderRadius: 3, backgroundColor: t.paper3 }} />
                        )}
                        <Serif size={15} numberOfLines={1} style={{ flex: 1 }}>
                          {recipe.title}
                        </Serif>
                      </>
                    ) : (
                      <Mono size={9} style={{ flex: 1, letterSpacing: 1.2 }}>
                        {busy ? 'ALREADY PLANNED' : activeSlot ? 'TAP TO PLACE' : 'FREE'}
                      </Mono>
                    )}
                  </Pressable>
                );
              })}

              <View style={{ marginTop: 18, paddingTop: 14, borderTopWidth: 1, borderTopColor: t.border }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Mono size={9} style={{ letterSpacing: 1.5 }}>
                    STILL TO PLACE
                  </Mono>
                  <Mono size={10}>{slots.filter((s) => s.day === null).length}</Mono>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {slots
                    .filter((s) => s.day === null)
                    .map((s) => {
                      const recipe = recipeFor(s.recipeId);
                      const isActive = activeSlot === s.key;
                      return (
                        <Pressable
                          key={s.key}
                          onPress={() => {
                            haptics.select();
                            setActiveSlot(s.key);
                          }}
                          style={{
                            width: 52,
                            height: 52,
                            borderRadius: 3,
                            overflow: 'hidden',
                            backgroundColor: t.paper3,
                            borderWidth: isActive ? 2 : 1,
                            borderColor: isActive ? t.greenSolid : t.border,
                          }}
                        >
                          {recipe?.image_url ? (
                            <Image
                              source={{ uri: recipe.image_url }}
                              style={{ width: '100%', height: '100%' }}
                              contentFit="cover"
                              cachePolicy="memory-disk"
                              recyclingKey={recipe.id}
                            />
                          ) : (
                            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="restaurant-outline" size={16} color={t.muted} />
                            </View>
                          )}
                        </Pressable>
                      );
                    })}
                </View>
              </View>
            </View>
          )}
        </ScrollView>

        {/* Footer — always on screen, never behind the tab bar or the keyboard. */}
        <View
          style={{
            flexDirection: 'row',
            gap: 8,
            paddingHorizontal: 20,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 12) + 12,
            borderTopWidth: 1,
            borderTopColor: t.border,
            backgroundColor: t.card,
          }}
        >
          {step === 1 && (
            <Button
              label="Choose recipes"
              onPress={() => {
                haptics.success();
                onSavePrefs({ meals, servings });
                setStep(2);
              }}
              style={{ flex: 1 }}
            />
          )}
          {step === 2 && (
            <>
              <Button label="Cancel" variant="secondary" onPress={onClose} style={{ flex: 1 }} />
              <Button
                label={picks.length === 0 ? 'Pick some meals' : `Next — ${totalNights} night${totalNights === 1 ? '' : 's'}`}
                onPress={goToPlacement}
                disabled={picks.length === 0}
                style={{ flex: 1.4 }}
              />
            </>
          )}
          {step === 3 && (
            <>
              <Button label="Fill it in for me" variant="secondary" onPress={autoFill} style={{ flex: 1 }} />
              <Button label={saving ? 'Adding…' : 'Done'} onPress={commit} disabled={saving} style={{ flex: 1 }} />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
