import { Ionicons } from '@expo/vector-icons';
import type { MealPlan, MealPlanEntry, Recipe } from '@recipe-aggregator/shared';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BottomSheet from '@/components/BottomSheet';
import DayOptionsSheet from '@/components/DayOptionsSheet';
import { DragFloater, DragMealRow, useDragToDay } from '@/components/DragToDay';
import IngredientIcon from '@/components/IngredientIcon';
import PlanWeekSheet, { type PlanPick, type PlanPrefs } from '@/components/PlanWeekSheet';
import RateCookSheet from '@/components/RateCookSheet';
import RecipePickerSheet from '@/components/RecipePickerSheet';
import { Body, CheckSquare, Eyebrow, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { categoriseIngredients, CATEGORY_ORDER } from '@/lib/categoriseIngredients';
import { combineIngredients, type IngredientWithRecipe } from '@/lib/combineIngredients';
import { haptics } from '@/lib/haptics';
import {
  batchPosition,
  batchSiblings,
  DAY_INDEXES,
  DAY_SHORT,
  dayDate,
  entriesForDay,
  entryServings,
  formatMins,
  planServings,
  shoppingSourceEntries,
  todayIndex,
  unplacedEntries,
} from '@/lib/mealPlanDays';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';
import {
  formatWeekLabel,
  formatWeekStart,
  getDefaultWeekStart,
  getMonday,
  isPlanningMode,
  shiftWeek,
} from '@/lib/weekHelpers';
import { scaleIngredientsForServings, toRoman } from '@/lib/recipeFormat';

type Tab = 'meals' | 'shopping';

export default function MealPlanScreen() {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => getDefaultWeekStart());
  const [plan, setPlan] = useState<MealPlan | null>(null);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('meals');
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [showAdd, setShowAdd] = useState(false);
  // Which day the picker was opened for (null = into the week with no day).
  const [addTarget, setAddTarget] = useState<number | null>(null);
  const [daySheet, setDaySheet] = useState<number | null>(null);
  const [entryMenu, setEntryMenu] = useState<MealPlanEntry | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [weekMenu, setWeekMenu] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [prefs, setPrefs] = useState<PlanPrefs | null>(null);
  // Post-cook rating popup: set when marking a meal cooked logs a recipe_cooks row.
  const [rateCook, setRateCook] = useState<{ cookId: string; recipeId: string; title?: string } | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCategorised = useRef('');
  const scrollRef = useRef<ScrollView | null>(null);

  // Drag a meal onto any day — or onto "not on a day yet" to unschedule it.
  const drag = useDragToDay({
    scrollRef,
    onDrop: (entryId, key) => moveEntry(entryId, key === 'none' ? null : key, true),
  });

  // Plan-mode answers live on the profile, not in context — only this screen
  // needs them, and only when the user opens plan mode.
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('plan_meals_per_week, plan_default_servings, plan_nights_per_meal')
        .eq('id', user.id)
        .maybeSingle();
      // All three or none. Anyone who set up before nights existed gets asked
      // the (now shorter) setup sentence once more rather than a silent guess.
      if (data?.plan_meals_per_week && data?.plan_default_servings && data?.plan_nights_per_meal) {
        setPrefs({
          meals: data.plan_meals_per_week,
          servings: data.plan_default_servings,
          nights: data.plan_nights_per_meal,
        });
      }
    })();
  }, [user]);

  const loadPlan = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const weekStr = formatWeekStart(weekStart);
    const { data: existingList } = await supabase
      .from('meal_plans')
      .select('*')
      .eq('week_start', weekStr)
      .order('created_at', { ascending: true });
    let existing = existingList?.[0] ?? null;
    if (!existing) {
      const { data: created } = await supabase
        .from('meal_plans')
        .insert({ user_id: user.id, week_start: weekStr })
        .select()
        .single();
      existing = created;
    }
    if (!existing) {
      setLoading(false);
      return;
    }
    const planData = existing as MealPlan;
    setPlan(planData);
    setCheckedItems(new Set(planData.checked_items || []));
    setCategoryMap(planData.shopping_categories || {});
    const { data: mpr } = await supabase
      .from('meal_plan_recipes')
      .select('*, recipe:recipes(*)')
      .eq('meal_plan_id', existing.id);
    setEntries((mpr as MealPlanEntry[]) || []);
    setLoading(false);
  }, [user, weekStart]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // The Plan tab stays mounted while you're on a recipe screen, so servings saved there
  // wouldn't reach the shopping list. Re-pull the recipes (not the checked state) on focus.
  const planId = plan?.id;
  useFocusEffect(
    useCallback(() => {
      if (!planId) return;
      let cancelled = false;
      (async () => {
        const { data } = await supabase
          .from('meal_plan_recipes')
          .select('*, recipe:recipes(*)')
          .eq('meal_plan_id', planId);
        if (!cancelled && data) setEntries(data as MealPlanEntry[]);
      })();
      return () => {
        cancelled = true;
      };
    }, [planId]),
  );

  // ── Derived ─────────────────────────────────────────
  const today = todayIndex(weekStart);

  // Only cooks buy ingredients — a meal-prep night eats from the same pot and
  // an "eating out" night buys nothing at all.
  const uncookedCooks = shoppingSourceEntries(entries).filter((e) => !e.is_cooked);
  const allIngredients: IngredientWithRecipe[] = uncookedCooks.flatMap((e) =>
    scaleIngredientsForServings(e.recipe?.ingredients || [], e.recipe?.servings, entryServings(e)).map((ing) => ({
      ...ing,
      _recipeTitle: e.recipe?.title || 'Unknown',
      _recipeId: e.recipe?.id || '',
    })),
  );
  const combined = useMemo(() => combineIngredients(allIngredients), [JSON.stringify(allIngredients)]);

  const mealEntries = entries.filter((e) => e.entry_type !== 'out');
  const cookedCount = mealEntries.filter((e) => e.is_cooked).length;
  const unplaced = unplacedEntries(entries);
  const takenDays = useMemo(
    () => new Set(entries.filter((e) => e.day_index != null).map((e) => e.day_index as number)),
    [entries],
  );

  // Categorise ingredients when they change
  useEffect(() => {
    if (!plan || combined.length === 0) return;
    const fingerprint = `${plan.id}-${combined.map((c) => c.item).sort().join(',')}`;
    if (fingerprint === lastCategorised.current) return;
    const hasUncategorised = combined.some((ing) => !categoryMap[ing.item.toLowerCase().trim()]);
    if (!hasUncategorised) {
      lastCategorised.current = fingerprint;
      return;
    }
    lastCategorised.current = fingerprint;
    (async () => {
      const updated = await categoriseIngredients(combined, categoryMap);
      setCategoryMap(updated);
      await supabase.from('meal_plans').update({ shopping_categories: updated }).eq('id', plan.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, combined.length]);

  const grouped = useMemo(() => {
    const withCat = combined.map((ing) => ({
      ...ing,
      shoppingCategory: categoryMap[ing.item.toLowerCase().trim()] || 'Other',
    }));
    return CATEGORY_ORDER.map((cat) => ({
      category: cat,
      items: withCat.filter((ing) => ing.shoppingCategory === cat),
    })).filter((g) => g.items.length > 0);
  }, [combined, categoryMap]);

  function persistChecked(next: Set<string>) {
    if (!plan) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from('meal_plans').update({ checked_items: [...next] }).eq('id', plan.id);
    }, 300);
  }

  function toggleShopping(key: string) {
    haptics.select();
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistChecked(next);
      return next;
    });
  }

  // ── Entry mutations ─────────────────────────────────
  async function addCook(recipe: Pick<Recipe, 'id'>, dayIndex: number | null) {
    if (!plan) return;
    const { data } = await supabase
      .from('meal_plan_recipes')
      .insert({
        meal_plan_id: plan.id,
        recipe_id: recipe.id,
        day_index: dayIndex,
        entry_type: 'cook',
        servings: prefs?.servings ?? null,
      })
      .select('*, recipe:recipes(*)')
      .single();
    if (data) setEntries((prev) => [...prev, data as MealPlanEntry]);
  }

  /**
   * Another night off an existing cook. Buys nothing extra, but bumps the cook's
   * servings so the shopping list covers the additional night.
   */
  async function addBatchNight(cookEntryId: string, dayIndex: number | null) {
    if (!plan) return;
    const cook = entries.find((e) => e.id === cookEntryId);
    if (!cook || !cook.recipe_id) return;

    // Only scale up once we know the household size. Until then the recipe's
    // own yield is assumed to already stretch — which is the whole point of
    // eating the same cook twice.
    const perNight = prefs?.servings ?? null;
    const nights = batchSiblings(cook, entries).length + 1;
    const nextServings = perNight ? perNight * nights : cook.servings;

    const { data } = await supabase
      .from('meal_plan_recipes')
      .insert({
        meal_plan_id: plan.id,
        recipe_id: cook.recipe_id,
        day_index: dayIndex,
        entry_type: 'batch',
        parent_id: cook.id,
      })
      .select('*, recipe:recipes(*)')
      .single();
    if (!data) return;

    if (nextServings && nextServings !== cook.servings) {
      await supabase.from('meal_plan_recipes').update({ servings: nextServings }).eq('id', cook.id);
    }

    haptics.success();
    setEntries((prev) => [
      ...prev.map((e) => (e.id === cook.id && nextServings ? { ...e, servings: nextServings } : e)),
      data as MealPlanEntry,
    ]);
  }

  async function addEatingOut(dayIndex: number, note: string) {
    if (!plan) return;
    const { data } = await supabase
      .from('meal_plan_recipes')
      .insert({
        meal_plan_id: plan.id,
        recipe_id: null,
        day_index: dayIndex,
        entry_type: 'out',
        note: note || null,
      })
      .select('*, recipe:recipes(*)')
      .single();
    if (data) setEntries((prev) => [...prev, data as MealPlanEntry]);
    setDaySheet(null);
  }

  /** `quiet` skips the tick — a drag has already buzzed on landing. */
  async function moveEntry(entryId: string, dayIndex: number | null, quiet = false) {
    if (!quiet) haptics.select();
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, day_index: dayIndex } : e)));
    setMoving(null);
    await supabase.from('meal_plan_recipes').update({ day_index: dayIndex }).eq('id', entryId);
  }

  async function removeEntry(entryId: string) {
    haptics.light();
    const entry = entries.find((e) => e.id === entryId);
    // Removing a cook takes its extra nights with it — the DB cascades, so the
    // local state has to as well.
    const alsoGone =
      entry?.entry_type === 'cook' ? entries.filter((e) => e.parent_id === entryId).map((e) => e.id) : [];
    setEntries((prev) => prev.filter((e) => e.id !== entryId && !alsoGone.includes(e.id)));
    setEntryMenu(null);
    await supabase.from('meal_plan_recipes').delete().eq('id', entryId);
  }

  async function toggleCooked(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;
    const next = !entry.is_cooked;
    // A cooked meal is a small win — celebrate it; un-marking is just a light tick.
    if (next) haptics.success();
    else haptics.select();
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, is_cooked: next } : e)));
    await supabase.from('meal_plan_recipes').update({ is_cooked: next }).eq('id', entryId);

    // Only a real cook goes in the recipe's history. A meal-prep night is the
    // same pot reheated, and eating out isn't cooking at all.
    if (entry.entry_type !== 'cook' || !entry.recipe_id) return;

    if (next && user) {
      const { data: cook } = await supabase
        .from('recipe_cooks')
        .insert({ recipe_id: entry.recipe_id, user_id: user.id, meal_plan_recipe_id: entryId })
        .select('id')
        .single();
      if (cook) {
        setRateCook({ cookId: cook.id, recipeId: entry.recipe_id, title: entry.recipe?.title });
      }
    } else if (!next) {
      await supabase.from('recipe_cooks').delete().eq('meal_plan_recipe_id', entryId);
    }
  }

  async function savePrefs(next: PlanPrefs) {
    setPrefs(next);
    if (!user) return;
    await supabase
      .from('profiles')
      .update({
        plan_meals_per_week: next.meals,
        plan_default_servings: next.servings,
        plan_nights_per_meal: next.nights,
      })
      .eq('id', user.id);
  }

  /** Turn a finished plan-mode session into rows: one cook per pick, one batch row per extra night. */
  async function commitPlan(
    picks: PlanPick[],
    slots: { recipeId: string; nightIndex: number; day: number | null }[],
    servingsPerNight: number,
  ) {
    if (!plan) return;
    const created: MealPlanEntry[] = [];

    for (const pick of picks) {
      const mine = slots
        .filter((s) => s.recipeId === pick.recipe.id)
        .sort((a, b) => a.nightIndex - b.nightIndex);
      const first = mine[0];

      const { data: cook } = await supabase
        .from('meal_plan_recipes')
        .insert({
          meal_plan_id: plan.id,
          recipe_id: pick.recipe.id,
          day_index: first?.day ?? null,
          entry_type: 'cook',
          servings: planServings(pick.recipe, servingsPerNight, pick.nights),
        })
        .select('*, recipe:recipes(*)')
        .single();
      if (!cook) continue;
      created.push(cook as MealPlanEntry);

      for (const slot of mine.slice(1)) {
        const { data: extra } = await supabase
          .from('meal_plan_recipes')
          .insert({
            meal_plan_id: plan.id,
            recipe_id: pick.recipe.id,
            day_index: slot.day,
            entry_type: 'batch',
            parent_id: (cook as MealPlanEntry).id,
          })
          .select('*, recipe:recipes(*)')
          .single();
        if (extra) created.push(extra as MealPlanEntry);
      }
    }

    setEntries((prev) => [...prev, ...created]);
  }

  // ── Week label ──────────────────────────────────────
  const isCurrentWeek = formatWeekStart(getMonday(new Date())) === formatWeekStart(weekStart);
  const isNextWeek = formatWeekStart(shiftWeek(getMonday(new Date()), 1)) === formatWeekStart(weekStart);
  const isLastWeek = formatWeekStart(shiftWeek(getMonday(new Date()), -1)) === formatWeekStart(weekStart);

  const weekLabel = isCurrentWeek
    ? 'THIS WEEK'
    : isNextWeek
      ? 'NEXT WEEK'
      : isLastWeek
        ? 'LAST WEEK'
        : formatWeekLabel(weekStart).toUpperCase();

  const subtitle = loading
    ? 'Loading your week…'
    : mealEntries.length === 0
      ? 'Nothing planned yet — plan the week, or add meals as you go.'
      : `${mealEntries.length} night${mealEntries.length !== 1 ? 's' : ''} planned · ${cookedCount} cooked. Drag a meal to any day.`;

  const existingIds = new Set(entries.map((e) => e.recipe_id).filter(Boolean) as string[]);

  // ── Cooking ─────────────────────────────────────────
  /**
   * A real cook that hasn't happened yet. Leftovers ('batch') nights reheat the
   * same pot and eating out isn't cooking, so neither offers to start a cook.
   */
  function canCook(entry: MealPlanEntry): boolean {
    return entry.entry_type === 'cook' && !entry.is_cooked && !!entry.recipe_id;
  }

  /**
   * Cook mode on the recipe screen: keeps the screen awake, ticks off
   * ingredients and steps, then "Mark as cooked" flips this plan row, logs the
   * cook in the recipe's history and asks how it went.
   */
  function startCooking(entry: MealPlanEntry) {
    if (!entry.recipe_id) return;
    haptics.medium();
    router.push({
      pathname: '/recipe/[id]',
      params: { id: entry.recipe_id, cook: '1', entry: entry.id },
    });
  }

  // ── Row rendering ───────────────────────────────────
  function renderEntry(entry: MealPlanEntry, isToday: boolean) {
    const cooked = entry.is_cooked;

    if (entry.entry_type === 'out') {
      return (
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 38,
              height: 38,
              borderRadius: 3,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: t.border,
              backgroundColor: t.card,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name="storefront-outline" size={16} color={t.muted} />
          </View>
          <View style={{ flex: 1 }}>
            <Serif size={15} italic color={t.textSoft}>
              Eating out
            </Serif>
            {entry.note ? (
              <Mono size={8.5} style={{ marginTop: 3, letterSpacing: 0.8 }}>
                {entry.note.toUpperCase()}
              </Mono>
            ) : null}
          </View>
        </View>
      );
    }

    const batch = batchPosition(entry, entries);
    const meta: string[] = [];
    const mins = (entry.recipe?.prep_time ?? 0) + (entry.recipe?.cook_time ?? 0);
    if (mins > 0) meta.push(formatMins(mins));
    if (batch) meta.push(`Meal prep ${batch.index}/${batch.total}`);
    else if (entryServings(entry) != null) meta.push(`Serves ${entryServings(entry)}`);

    const openRecipe = () => {
      if (entry.recipe_id) router.push({ pathname: '/recipe/[id]', params: { id: entry.recipe_id } });
    };

    return (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={openRecipe}>
          <View style={{ width: 38, height: 38, borderRadius: 3, overflow: 'hidden', backgroundColor: t.paper3 }}>
            {entry.recipe?.image_url ? (
              <Image
                source={{ uri: entry.recipe.image_url }}
                style={{ width: '100%', height: '100%', opacity: cooked ? 0.5 : 1 }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={entry.recipe.id}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name="restaurant-outline" size={16} color={t.muted} />
              </View>
            )}
          </View>
        </Pressable>

        <Pressable onPress={openRecipe} style={{ flex: 1 }}>
          <Serif
            size={15}
            numberOfLines={1}
            color={cooked ? t.muted : t.text}
            style={{ textDecorationLine: cooked ? 'line-through' : 'none' }}
          >
            {entry.recipe?.title}
          </Serif>
          {meta.length > 0 && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 3 }}>
              {batch && <Ionicons name="repeat-outline" size={10} color={t.green} />}
              <Mono size={8.5} color={batch ? t.green : t.muted} style={{ letterSpacing: 0.8 }}>
                {meta.join(' · ').toUpperCase()}
              </Mono>
            </View>
          )}
        </Pressable>

        {/* Any night can be cooked right now — the pot doesn't care what the
            calendar says. Today gets the labelled primary button; the rest get
            a quiet flame so the hierarchy still reads. Leftovers nights get
            nothing: there's nothing to cook, only to reheat. */}
        {canCook(entry) ? (
          <Pressable
            onPress={() => startCooking(entry)}
            hitSlop={6}
            style={
              isToday
                ? {
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 5,
                    paddingHorizontal: 13,
                    paddingVertical: 6,
                    borderRadius: 999,
                    backgroundColor: t.greenSolid,
                  }
                : {
                    width: 32,
                    height: 32,
                    borderRadius: 999,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: t.border,
                    backgroundColor: t.card,
                  }
            }
          >
            <Ionicons
              name={isToday ? 'flame' : 'flame-outline'}
              size={isToday ? 12 : 15}
              color={isToday ? t.onGreen : t.green}
            />
            {isToday ? (
              <Body size={12.5} weight="medium" color={t.onGreen}>
                Cook
              </Body>
            ) : null}
          </Pressable>
        ) : null}

        {cooked ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 3,
              paddingHorizontal: 9,
              paddingVertical: 4,
              borderRadius: 999,
              backgroundColor: t.greenLight,
            }}
          >
            <Ionicons name="checkmark" size={10} color={t.green} />
            <Mono size={8.5} color={t.green} style={{ letterSpacing: 1 }}>
              {entry.entry_type === 'batch' ? 'ATE' : 'COOKED'}
            </Mono>
          </View>
        ) : null}
      </View>
    );
  }

  const menuActions = entryMenu
    ? ([
        canCook(entryMenu)
          ? {
              label: 'Cook now',
              primary: true,
              run: () => {
                const e = entryMenu;
                setEntryMenu(null);
                startCooking(e);
              },
            }
          : null,
        entryMenu.recipe_id
          ? {
              label: 'View recipe',
              run: () => {
                const id = entryMenu.recipe_id as string;
                setEntryMenu(null);
                router.push({ pathname: '/recipe/[id]', params: { id } });
              },
            }
          : null,
        !entryMenu.is_cooked && entryMenu.entry_type !== 'out'
          ? {
              label: entryMenu.entry_type === 'batch' ? 'Mark eaten' : 'Mark cooked',
              run: () => {
                toggleCooked(entryMenu.id);
                setEntryMenu(null);
              },
            }
          : null,
        entryMenu.is_cooked
          ? {
              label: entryMenu.entry_type === 'batch' ? 'Not eaten after all' : 'Not cooked after all',
              run: () => {
                toggleCooked(entryMenu.id);
                setEntryMenu(null);
              },
            }
          : null,
        entryMenu.entry_type === 'cook'
          ? {
              label: 'Add another night',
              run: () => {
                addBatchNight(entryMenu.id, null);
                setEntryMenu(null);
              },
            }
          : null,
        {
          label: 'Move to another day',
          run: () => {
            setMoving(entryMenu.id);
            setEntryMenu(null);
            setTab('meals');
          },
        },
        entryMenu.day_index != null
          ? {
              label: 'Take off the day',
              run: () => {
                moveEntry(entryMenu.id, null);
                setEntryMenu(null);
              },
            }
          : null,
        { label: 'Remove from the week', run: () => removeEntry(entryMenu.id), danger: true },
      ].filter(Boolean) as {
        label: string;
        run: () => void;
        danger?: boolean;
        primary?: boolean;
      }[])
    : [];

  const draggedEntry = entries.find((e) => e.id === drag.activeId) ?? null;
  const unplacedOver = drag.dragging && drag.hover === 'none';

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }} ref={drag.rootRef}>
      <ScrollView
        ref={scrollRef}
        // Frozen mid-drag; the list scrolls itself when the finger nears an
        // edge. Before the row's hold activates, normal scrolling still wins.
        scrollEnabled={!drag.dragging}
        scrollEventThrottle={16}
        onScroll={(e) => drag.handleScroll(e.nativeEvent.contentOffset.y)}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 32 }}
      >
        {/* ── Masthead: one line, plus the week control ── */}
        <View
          style={{
            paddingHorizontal: 16,
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 10,
          }}
        >
          <View style={{ flex: 1 }}>
            <Eyebrow>The plan</Eyebrow>
            <Serif size={28} style={{ marginTop: 8 }}>
              The{' '}
              <Serif size={28} italic color={t.green}>
                week
              </Serif>
            </Serif>
          </View>

          {/* Week pill — says where you are and is also how you move. */}
          <Pressable
            onPress={() => {
              haptics.select();
              setWeekMenu(true);
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 13,
              paddingVertical: 7,
              borderRadius: 999,
              marginTop: 4,
              borderWidth: 1,
              borderColor: isCurrentWeek || isNextWeek ? t.green : t.border,
              backgroundColor: isCurrentWeek || isNextWeek ? t.greenLight : t.card,
            }}
          >
            <Mono size={9.5} color={isCurrentWeek || isNextWeek ? t.green : t.text} style={{ letterSpacing: 1 }}>
              {weekLabel}
            </Mono>
            <Ionicons name="chevron-down" size={12} color={isCurrentWeek || isNextWeek ? t.green : t.muted} />
          </Pressable>
        </View>

        <Body size={14} color={t.textSoft} style={{ paddingHorizontal: 16, marginTop: 10, marginBottom: 16 }}>
          {subtitle}
        </Body>

        {/* Fri–Sun is when the week ahead usually gets planned. Offer the jump
            rather than making it — you always land on this week. */}
        {isPlanningMode() && isCurrentWeek && (
          <View
            style={{
              marginHorizontal: 16,
              marginBottom: 16,
              padding: 11,
              borderWidth: 1,
              borderLeftWidth: 2,
              borderColor: t.border,
              borderLeftColor: t.green,
              borderRadius: 3,
              backgroundColor: t.greenLight,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Ionicons name="calendar-outline" size={14} color={t.green} />
            <Body size={12.5} color={t.textSoft} style={{ flex: 1 }}>
              It's the weekend — good time to sort the week ahead.
            </Body>
            <Pressable
              onPress={() => {
                haptics.select();
                setWeekStart(shiftWeek(getMonday(new Date()), 1));
              }}
            >
              <Body size={12.5} weight="medium" color={t.green}>
                Next week →
              </Body>
            </Pressable>
          </View>
        )}

        {/* Tabs */}
        <View
          style={{
            flexDirection: 'row',
            gap: 28,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: t.border,
            marginBottom: 18,
          }}
        >
          {(
            [
              ['meals', 'Meals', mealEntries.length],
              ['shopping', 'Groceries', combined.length],
            ] as const
          ).map(([key, label, count]) => {
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

        {/* ── Meals tab: the week grid ─────────────────── */}
        {tab === 'meals' && (
          <View style={{ paddingHorizontal: 16 }}>
            {moving && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: 11,
                  marginBottom: 12,
                  borderRadius: 3,
                  borderWidth: 1,
                  borderColor: t.green,
                  backgroundColor: t.greenLight,
                }}
              >
                <Body size={12.5} color={t.green}>
                  Tap a day to move it there.
                </Body>
                <Pressable onPress={() => setMoving(null)}>
                  <Body size={12.5} color={t.muted}>
                    Cancel
                  </Body>
                </Pressable>
              </View>
            )}

            {DAY_INDEXES.map((d) => {
              const dayEntries = entriesForDay(entries, d);
              const isToday = today === d;
              const date = dayDate(weekStart, d);
              const isOver = drag.dragging && drag.hover === d;
              const lit = isToday || isOver;
              return (
                <View
                  key={d}
                  ref={drag.zoneRef(d)}
                  style={{
                    flexDirection: 'row',
                    gap: 12,
                    alignItems: dayEntries.length > 0 ? 'flex-start' : 'center',
                    paddingHorizontal: lit ? 9 : 0,
                    paddingVertical: 9,
                    marginHorizontal: lit ? -9 : 0,
                    marginVertical: isToday ? 4 : 0,
                    borderRadius: lit ? 4 : 0,
                    backgroundColor: isOver ? t.greenLight : isToday ? t.card : 'transparent',
                    borderLeftWidth: lit ? 2 : 0,
                    borderLeftColor: t.green,
                    // Height must not change mid-drag or the measured zones drift.
                    borderBottomWidth: isToday ? 0 : 1,
                    borderBottomColor: t.ruleHair,
                  }}
                >
                  <Pressable
                    onPress={() => (moving ? moveEntry(moving, d) : setDaySheet(d))}
                    style={{ width: 34, marginTop: dayEntries.length > 0 ? 10 : 0 }}
                  >
                    <Mono size={9} color={lit ? t.green : t.muted} style={{ letterSpacing: 0.6, lineHeight: 12 }}>
                      {DAY_SHORT[d].toUpperCase()}
                      {'\n'}
                      {date.getDate()}
                    </Mono>
                  </Pressable>

                  <View style={{ flex: 1 }}>
                    {dayEntries.length === 0 ? (
                      <Pressable
                        onPress={() => (moving ? moveEntry(moving, d) : setDaySheet(d))}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                          paddingVertical: 5,
                          opacity: moving || drag.dragging ? 1 : 0.6,
                        }}
                      >
                        <View
                          style={{
                            width: 18,
                            height: 18,
                            borderRadius: 9,
                            borderWidth: 1,
                            borderColor: moving || drag.dragging ? t.green : t.border,
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}
                        >
                          <Ionicons
                            name="add"
                            size={11}
                            color={moving || drag.dragging ? t.green : t.muted}
                          />
                        </View>
                        <Mono
                          size={9}
                          color={moving || drag.dragging ? t.green : t.muted}
                          style={{ letterSpacing: 1.2 }}
                        >
                          {isOver ? 'DROP HERE' : moving ? 'MOVE HERE' : drag.dragging ? 'FREE' : 'NOTHING YET'}
                        </Mono>
                      </Pressable>
                    ) : (
                      dayEntries.map((entry, i) => (
                        <DragMealRow
                          key={entry.id}
                          makeResponder={drag.makeResponder}
                          entryId={entry.id}
                          from={d}
                          active={drag.activeId === entry.id}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            paddingTop: i === 0 ? 0 : 8,
                            marginTop: i === 0 ? 0 : 8,
                            borderTopWidth: i === 0 ? 0 : 1,
                            borderTopColor: t.ruleHair,
                            opacity: drag.activeId === entry.id ? 0.28 : 1,
                          }}
                        >
                          {renderEntry(entry, isToday)}
                          <Pressable
                            onPress={() => {
                              haptics.select();
                              setEntryMenu(entry);
                            }}
                            hitSlop={8}
                          >
                            <Ionicons name="ellipsis-horizontal" size={16} color={t.muted} />
                          </Pressable>
                        </DragMealRow>
                      ))
                    )}
                  </View>
                </View>
              );
            })}

            {/* Meals in the week without a day. A real place, not a to-do list —
                and while a meal is in the air it's also where you drop it to
                take it back off the calendar. */}
            {(unplaced.length > 0 || drag.dragging) && (
              <View
                ref={drag.zoneRef('none')}
                style={{
                  marginTop: 22,
                  paddingHorizontal: unplacedOver ? 9 : 0,
                  marginHorizontal: unplacedOver ? -9 : 0,
                  paddingVertical: unplacedOver ? 6 : 0,
                  borderRadius: unplacedOver ? 4 : 0,
                  backgroundColor: unplacedOver ? t.greenLight : 'transparent',
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingBottom: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: t.border,
                    marginBottom: 4,
                  }}
                >
                  <Mono size={9} color={unplacedOver ? t.green : t.muted} style={{ letterSpacing: 1.5 }}>
                    NOT ON A DAY YET
                  </Mono>
                  <Mono size={10}>{unplaced.length}</Mono>
                </View>

                {unplaced.length === 0 ? (
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingVertical: 10,
                    }}
                  >
                    <View
                      style={{
                        width: 18,
                        height: 18,
                        borderRadius: 9,
                        borderWidth: 1,
                        borderStyle: 'dashed',
                        borderColor: unplacedOver ? t.green : t.border,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Ionicons name="close" size={11} color={unplacedOver ? t.green : t.muted} />
                    </View>
                    <Mono size={9} color={unplacedOver ? t.green : t.muted} style={{ letterSpacing: 1.2 }}>
                      {unplacedOver ? 'DROP TO TAKE OFF THE DAY' : 'DROP HERE FOR NO DAY'}
                    </Mono>
                  </View>
                ) : (
                  unplaced.map((entry) => (
                    <DragMealRow
                      key={entry.id}
                      makeResponder={drag.makeResponder}
                      entryId={entry.id}
                      from="none"
                      active={drag.activeId === entry.id}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 9,
                        borderBottomWidth: 1,
                        borderBottomColor: t.ruleHair,
                        opacity: drag.activeId === entry.id ? 0.28 : 1,
                      }}
                    >
                      {renderEntry(entry, false)}
                      <Pressable
                        onPress={() => {
                          haptics.select();
                          setEntryMenu(entry);
                        }}
                        hitSlop={8}
                      >
                        <Ionicons name="ellipsis-horizontal" size={16} color={t.muted} />
                      </Pressable>
                    </DragMealRow>
                  ))
                )}
              </View>
            )}

            {/* Plan mode + a plain add. */}
            <Pressable
              onPress={() => {
                haptics.medium();
                setPlanOpen(true);
              }}
              style={{
                marginTop: 22,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 14,
                borderRadius: 4,
                backgroundColor: t.greenSolid,
              }}
            >
              <Ionicons name="sparkles-outline" size={16} color={t.onGreen} />
              <Serif size={16} italic color={t.onGreen}>
                Plan the week
              </Serif>
            </Pressable>

            <Pressable
              onPress={() => {
                setAddTarget(null);
                setShowAdd(true);
              }}
              style={{
                marginTop: 8,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                paddingVertical: 14,
                borderRadius: 4,
                borderWidth: 1,
                borderStyle: 'dashed',
                borderColor: t.green,
              }}
            >
              <Ionicons name="add" size={16} color={t.green} />
              <Serif size={16} italic color={t.green}>
                Add one meal
              </Serif>
            </Pressable>
          </View>
        )}

        {/* Shopping tab */}
        {tab === 'shopping' && (
          <View style={{ paddingHorizontal: 16 }}>
            {combined.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Ionicons name="cart-outline" size={40} color={t.muted} />
                <Serif size={21} style={{ marginTop: 14 }}>
                  {mealEntries.length === 0 ? 'No meals added yet' : 'All meals cooked'}
                </Serif>
                <Body size={14} color={t.muted} style={{ marginTop: 4, textAlign: 'center' }}>
                  {mealEntries.length === 0
                    ? 'Add some meals to generate a shopping list.'
                    : 'Nothing left to shop for.'}
                </Body>
              </View>
            )}

            {combined.length > 0 && (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  paddingBottom: 14,
                  marginBottom: 18,
                  borderBottomWidth: 1,
                  borderBottomColor: t.border,
                }}
              >
                <Mono size={10} style={{ letterSpacing: 1.4 }}>
                  SHOPPING LIST
                </Mono>
                <Mono size={11}>
                  {checkedItems.size}/{combined.length} TICKED
                </Mono>
              </View>
            )}

            {grouped.map((group, gi) => (
              <View key={group.category} style={{ marginBottom: 22 }}>
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'baseline',
                    gap: 10,
                    paddingBottom: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: t.border,
                    marginBottom: 2,
                  }}
                >
                  <Serif size={13} italic color={t.green}>
                    {toRoman(gi + 1)}.
                  </Serif>
                  <Serif size={18} style={{ flex: 1 }}>
                    {group.category}
                  </Serif>
                  <Mono size={11}>{group.items.length}</Mono>
                </View>
                {group.items.map((ing, i) => {
                  const key = `${ing.item}-${ing.unit}`;
                  const checked = checkedItems.has(key);
                  const qty = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`.trim();
                  return (
                    <Pressable
                      key={key}
                      onPress={() => toggleShopping(key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 12,
                        paddingVertical: 12,
                        borderBottomWidth: i < group.items.length - 1 ? 1 : 0,
                        borderBottomColor: t.ruleHair,
                        opacity: checked ? 0.5 : 1,
                      }}
                    >
                      <CheckSquare checked={checked} />
                      <IngredientIcon item={ing.item} />
                      <Serif
                        size={16}
                        style={{ flex: 1, textDecorationLine: checked ? 'line-through' : 'none' }}
                        color={checked ? t.muted : t.text}
                      >
                        {ing.item}
                      </Serif>
                      {qty ? <Mono size={11}>{qty}</Mono> : null}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* The meal in the air. Springs onto the day it lands on, then dissolves. */}
      <DragFloater drag={drag}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <View style={{ width: 38, height: 38, borderRadius: 3, overflow: 'hidden', backgroundColor: t.paper3 }}>
            {draggedEntry?.recipe?.image_url ? (
              <Image
                source={{ uri: draggedEntry.recipe.image_url }}
                style={{ width: '100%', height: '100%' }}
                contentFit="cover"
                cachePolicy="memory-disk"
                recyclingKey={draggedEntry.recipe.id}
              />
            ) : (
              <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons
                  name={draggedEntry?.entry_type === 'out' ? 'storefront-outline' : 'restaurant-outline'}
                  size={16}
                  color={t.muted}
                />
              </View>
            )}
          </View>
          <View style={{ flex: 1 }}>
            <Serif size={15} numberOfLines={1}>
              {draggedEntry?.entry_type === 'out' ? 'Eating out' : draggedEntry?.recipe?.title}
            </Serif>
            <Mono size={8.5} color={t.green} style={{ marginTop: 3, letterSpacing: 0.8 }}>
              {drag.hover === 'none'
                ? 'NO DAY'
                : typeof drag.hover === 'number'
                  ? DAY_SHORT[drag.hover].toUpperCase()
                  : 'DRAG TO A DAY'}
            </Mono>
          </View>
          <Ionicons name="reorder-two-outline" size={17} color={t.green} />
        </View>
      </DragFloater>

      {/* ── Week switcher ────────────────────────────── */}
      <BottomSheet open={weekMenu} onClose={() => setWeekMenu(false)}>
        <View style={{ paddingHorizontal: 20 }}>
          <Serif size={20}>Which week?</Serif>
          <View style={{ marginTop: 12 }}>
            {[-1, 0, 1, 2, 3].map((offset) => {
              const target = shiftWeek(getMonday(new Date()), offset);
              const active = formatWeekStart(target) === formatWeekStart(weekStart);
              const name =
                offset === -1
                  ? 'Last week'
                  : offset === 0
                    ? 'This week'
                    : offset === 1
                      ? 'Next week'
                      : `In ${offset} weeks`;
              return (
                <Pressable
                  key={offset}
                  onPress={() => {
                    haptics.select();
                    setWeekStart(target);
                    setWeekMenu(false);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingVertical: 13,
                    paddingHorizontal: 12,
                    borderRadius: 4,
                    backgroundColor: active ? t.greenLight : 'transparent',
                  }}
                >
                  <Serif size={16} color={active ? t.green : t.text}>
                    {name}
                  </Serif>
                  <Mono size={9.5}>{formatWeekLabel(target).toUpperCase()}</Mono>
                </Pressable>
              );
            })}
          </View>
        </View>
      </BottomSheet>

      {/* ── Per-meal menu ────────────────────────────── */}
      <BottomSheet open={entryMenu !== null} onClose={() => setEntryMenu(null)}>
        <View style={{ paddingHorizontal: 20 }}>
          <Serif size={20} numberOfLines={1}>
            {entryMenu?.entry_type === 'out' ? 'Eating out' : entryMenu?.recipe?.title}
          </Serif>
          <Mono size={9} style={{ marginTop: 3, letterSpacing: 1.4 }}>
            {entryMenu?.day_index != null ? DAY_SHORT[entryMenu.day_index].toUpperCase() : 'NO DAY YET'}
          </Mono>
          <View style={{ marginTop: 10 }}>
            {menuActions.map((a) => (
              <Pressable
                key={a.label}
                onPress={a.run}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 7,
                  paddingVertical: 13,
                  borderTopWidth: 1,
                  borderTopColor: t.ruleHair,
                }}
              >
                {a.primary ? <Ionicons name="flame" size={14} color={t.green} /> : null}
                <Serif size={16} italic={a.primary} color={a.danger ? t.red : a.primary ? t.green : t.text}>
                  {a.label}
                </Serif>
              </Pressable>
            ))}
          </View>
        </View>
      </BottomSheet>

      <DayOptionsSheet
        open={daySheet !== null}
        dayIndex={daySheet}
        weekStart={weekStart}
        entries={entries}
        onCook={() => {
          setAddTarget(daySheet);
          setDaySheet(null);
          setShowAdd(true);
        }}
        onAnotherNight={(cookId) => {
          addBatchNight(cookId, daySheet);
          setDaySheet(null);
        }}
        onEatingOut={(note) => daySheet !== null && addEatingOut(daySheet, note)}
        onClose={() => setDaySheet(null)}
      />

      <PlanWeekSheet
        open={planOpen}
        weekStart={weekStart}
        takenDays={takenDays}
        prefs={prefs}
        onSavePrefs={savePrefs}
        onCommit={commitPlan}
        onClose={() => setPlanOpen(false)}
      />

      <RecipePickerSheet
        open={showAdd}
        title={addTarget !== null ? `Cook something on ${DAY_SHORT[addTarget]}` : 'Add a meal to the week'}
        existingIds={existingIds}
        onPick={(r) => {
          addCook(r, addTarget);
          setShowAdd(false);
        }}
        onClose={() => setShowAdd(false)}
      />

      <RateCookSheet
        open={rateCook !== null}
        cookId={rateCook?.cookId ?? null}
        recipeId={rateCook?.recipeId ?? null}
        recipeTitle={rateCook?.title}
        onAutoFavourite={() => {
          const recipeId = rateCook?.recipeId;
          if (!recipeId) return;
          setEntries((prev) =>
            prev.map((entry) =>
              entry.recipe?.id === recipeId
                ? { ...entry, recipe: { ...entry.recipe, is_favourite: true } }
                : entry,
            ),
          );
        }}
        onClose={() => setRateCook(null)}
      />
    </View>
  );
}
