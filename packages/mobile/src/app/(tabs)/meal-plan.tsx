import { Ionicons } from '@expo/vector-icons';
import {
  SUB_RECIPE_SELECT,
  expandIngredientsForEntry,
  hasSubRecipes,
  makesComponents,
  subRecipeIdsIn,
} from '@recipe-aggregator/shared/ingredients';
import type {
  MealPlan,
  MealPlanEntry,
  Recipe,
  SubRecipe,
  SubRecipeMap,
} from '@recipe-aggregator/shared';
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
import SettlingRow from '@/components/SettlingRow';
import SubRecipePromptSheet from '@/components/SubRecipePromptSheet';
import { Body, CheckSquare, Eyebrow, Mono, Serif } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';
import { categoriseIngredients, CATEGORY_ORDER } from '@/lib/categoriseIngredients';
import { combineIngredients, type IngredientWithRecipe } from '@/lib/combineIngredients';
import { haptics } from '@/lib/haptics';
import {
  DAY_INDEXES,
  DAY_SHORT,
  dayDate,
  entriesForDay,
  entryServings,
  formatMins,
  planServings,
  plannedMealCount,
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
  getSunday,
  isPlanningMode,
  shiftWeek,
} from '@/lib/weekHelpers';
import { toRoman } from '@/lib/recipeFormat';

type Tab = 'meals' | 'shopping';

/** How a grocery line is identified in the plan's `checked_items`. */
const itemKey = (ing: { item: string; unit: string }) => `${ing.item}-${ing.unit}`;

// A ticked item holds its struck-through place for a beat so the tick reads,
// then collapses out of the list. Shopping is about what's left to buy.
const SETTLE_HOLD_MS = 2000;
const SETTLE_OUT_MS = 380;

/** What the recipe picker hands back — enough to add a cook and to know whether
 *  the recipe has sub-recipes worth asking about. */
type PickedRecipe = Pick<Recipe, 'id' | 'title' | 'ingredients'>;

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
  // Ticked groceries leave the list by default. `showCompleted` brings them
  // back (Apple Reminders style); `settling` holds the ones ticked just now and
  // still on screen — 'resting' struck through, 'leaving' while collapsing out.
  const [showCompleted, setShowCompleted] = useState(false);
  const [settling, setSettling] = useState<Record<string, 'resting' | 'leaving'>>({});
  const settleTimers = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});
  const [showAdd, setShowAdd] = useState(false);
  // Which day the picker was opened for (null = into the week with no day).
  const [addTarget, setAddTarget] = useState<number | null>(null);
  const [daySheet, setDaySheet] = useState<number | null>(null);
  const [entryMenu, setEntryMenu] = useState<MealPlanEntry | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [weekMenu, setWeekMenu] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [prefs, setPrefs] = useState<PlanPrefs | null>(null);
  // Recipes used as an ingredient of something in the week, and the recipe
  // waiting on a "making it or buying it?" answer before it gets added.
  const [subRecipes, setSubRecipes] = useState<SubRecipeMap>({});
  const [pendingAdd, setPendingAdd] = useState<{ recipe: PickedRecipe; dayIndex: number | null } | null>(null);
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
    const loaded = (mpr as MealPlanEntry[]) || [];
    setEntries(loaded);
    await loadSubRecipes(loaded);
    setLoading(false);
  }, [user, weekStart]);

  // Recipes used as an ingredient of something in the week. The shopping list
  // needs their own ingredients to swap in; anything that doesn't come back
  // leaves the parent's line alone.
  async function loadSubRecipes(forEntries: MealPlanEntry[]) {
    const ids = [...new Set(forEntries.flatMap((e) => subRecipeIdsIn(e.recipe?.ingredients)))];
    if (ids.length === 0) {
      setSubRecipes({});
      return;
    }
    const { data } = await supabase.from('recipes').select(SUB_RECIPE_SELECT).in('id', ids);
    setSubRecipes(
      data ? Object.fromEntries((data as unknown as SubRecipe[]).map((r) => [r.id, r])) : {},
    );
  }

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
        if (cancelled || !data) return;
        setEntries(data as MealPlanEntry[]);
        await loadSubRecipes(data as MealPlanEntry[]);
      })();
      return () => {
        cancelled = true;
      };
    }, [planId]),
  );

  // ── Derived ─────────────────────────────────────────
  const today = todayIndex(weekStart);

  // Only cooks buy ingredients; eating out and legacy batch rows buy nothing.
  // A linked sub-recipe you're making swaps its line for its own ingredients.
  const uncookedCooks = shoppingSourceEntries(entries).filter((e) => !e.is_cooked);
  const allIngredients: IngredientWithRecipe[] = uncookedCooks.flatMap((e) =>
    expandIngredientsForEntry(e, entryServings(e), subRecipes),
  );
  const combined = useMemo(() => combineIngredients(allIngredients), [JSON.stringify(allIngredients)]);

  const mealEntries = entries.filter((e) => e.entry_type === 'cook');
  const cookedCount = mealEntries.filter((e) => e.is_cooked).length;
  const unplaced = unplacedEntries(entries);
  const takenDays = useMemo(
    () => new Set(entries.filter((e) => e.entry_type !== 'batch' && e.day_index != null).map((e) => e.day_index as number)),
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

  // What's still to buy — the number that matters when you're in the shop.
  const remainingCount = useMemo(
    () => combined.filter((ing) => !checkedItems.has(itemKey(ing))).length,
    [combined, checkedItems],
  );
  const doneCount = combined.length - remainingCount;

  // A ticked item stays rendered only while `showCompleted` is on or while it's
  // still settling out; a category with nothing left to show goes with it.
  const grouped = useMemo(() => {
    const withCat = combined.map((ing) => ({
      ...ing,
      shoppingCategory: categoryMap[ing.item.toLowerCase().trim()] || 'Other',
    }));
    return CATEGORY_ORDER.map((cat) => {
      const items = withCat.filter((ing) => ing.shoppingCategory === cat);
      return {
        category: cat,
        items,
        remaining: items.filter((ing) => !checkedItems.has(itemKey(ing))).length,
        visible: items.filter((ing) => {
          const key = itemKey(ing);
          return !checkedItems.has(key) || showCompleted || settling[key] !== undefined;
        }),
      };
    }).filter((g) => g.visible.length > 0);
  }, [combined, categoryMap, checkedItems, showCompleted, settling]);

  // Timers are per item, so a second tick never cancels the first one's exit.
  function clearSettleTimers(key: string) {
    settleTimers.current[key]?.forEach(clearTimeout);
    delete settleTimers.current[key];
  }

  // Nothing is mid-settle in a week you've just switched to, and nothing should
  // be left ticking after the screen goes away.
  useEffect(() => {
    Object.values(settleTimers.current).flat().forEach(clearTimeout);
    settleTimers.current = {};
    setSettling({});
  }, [plan?.id]);

  useEffect(() => () => {
    Object.values(settleTimers.current).flat().forEach(clearTimeout);
  }, []);

  function toggleShowCompleted() {
    haptics.light();
    const next = !showCompleted;
    // Showing them again means nothing is on its way out any more.
    if (next) {
      Object.values(settleTimers.current).flat().forEach(clearTimeout);
      settleTimers.current = {};
      setSettling({});
    }
    setShowCompleted(next);
  }

  function persistChecked(next: Set<string>) {
    if (!plan) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      supabase.from('meal_plans').update({ checked_items: [...next] }).eq('id', plan.id);
    }, 300);
  }

  function toggleShopping(key: string) {
    haptics.select();
    const wasChecked = checkedItems.has(key);
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistChecked(next);
      return next;
    });

    clearSettleTimers(key);

    // Un-ticking, or ticking while completed items are on show: the row stays
    // where it is either way, so there's nothing to settle.
    if (wasChecked || showCompleted) {
      setSettling((prev) => {
        if (!(key in prev)) return prev;
        const next = { ...prev };
        delete next[key];
        return next;
      });
      return;
    }

    // Just ticked: hold it struck through, then collapse it out of the list.
    setSettling((prev) => ({ ...prev, [key]: 'resting' }));
    settleTimers.current[key] = [
      setTimeout(
        () => setSettling((prev) => (key in prev ? { ...prev, [key]: 'leaving' } : prev)),
        SETTLE_HOLD_MS,
      ),
      setTimeout(() => {
        setSettling((prev) => {
          if (!(key in prev)) return prev;
          const next = { ...prev };
          delete next[key];
          return next;
        });
        delete settleTimers.current[key];
      }, SETTLE_HOLD_MS + SETTLE_OUT_MS),
    ];
  }

  // ── Entry mutations ─────────────────────────────────
  async function addCook(
    recipe: Pick<Recipe, 'id'>,
    dayIndex: number | null,
    makeComponents?: boolean,
  ) {
    if (!plan) return;
    const { data } = await supabase
      .from('meal_plan_recipes')
      .insert({
        meal_plan_id: plan.id,
        recipe_id: recipe.id,
        day_index: dayIndex,
        entry_type: 'cook',
        servings: prefs?.servings ?? null,
        planned_nights: 1,
        ...(makeComponents === undefined ? {} : { make_components: makeComponents }),
      })
      .select('*, recipe:recipes(*)')
      .single();
    if (data) {
      const entry = data as MealPlanEntry;
      setEntries((prev) => [...prev, entry]);
      // The new meal may bring linked recipes the list hasn't fetched yet.
      if (hasSubRecipes(entry.recipe)) loadSubRecipes([...entries, entry]);
    }
  }

  /** Picked a recipe to cook. Ask about its sub-recipes first, if it has any. */
  function startAddCook(recipe: PickedRecipe, dayIndex: number | null) {
    if (hasSubRecipes(recipe)) {
      setPendingAdd({ recipe, dayIndex });
      return;
    }
    addCook(recipe, dayIndex);
  }

  /** Flip a planned meal between cooking its sub-recipes and buying them. */
  async function setMakeComponents(entryId: string, next: boolean) {
    haptics.light();
    const { error } = await supabase
      .from('meal_plan_recipes')
      .update({ make_components: next })
      .eq('id', entryId);
    if (error) return;
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, make_components: next } : e)));
    setEntryMenu((prev) => (prev?.id === entryId ? { ...prev, make_components: next } : prev));
  }

  /** Update how many meals one cook covers without scheduling leftover days. */
  async function updatePlannedNights(cookEntryId: string, plannedNights: number) {
    if (!plan) return;
    const cook = entries.find((e) => e.id === cookEntryId);
    if (!cook || cook.entry_type !== 'cook' || !cook.recipe_id || !cook.recipe) return;

    const perNight = prefs?.servings ?? null;
    const nextServings = perNight ? planServings(cook.recipe, perNight, plannedNights) : cook.servings;

    const { error } = await supabase
      .from('meal_plan_recipes')
      .update({ planned_nights: plannedNights, servings: nextServings })
      .eq('id', cook.id);
    if (error) return;

    await supabase.from('meal_plan_recipes').delete().eq('parent_id', cook.id).eq('entry_type', 'batch');

    haptics.success();
    setEntries((prev) => prev
      .filter((e) => e.parent_id !== cook.id)
      .map((e) => e.id === cook.id
        ? { ...e, planned_nights: plannedNights, servings: nextServings }
        : e));
    setEntryMenu((prev) => prev?.id === cook.id
      ? { ...prev, planned_nights: plannedNights, servings: nextServings }
      : prev);
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
    // Removing a cook also clears any legacy batch children.
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

    // Only a real cook goes in the recipe's history.
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

  /** Turn a finished plan-mode session into one cooking row per recipe. */
  async function commitPlan(
    picks: PlanPick[],
    slots: { recipeId: string; day: number | null }[],
    servingsPerMeal: number,
  ) {
    if (!plan) return;
    const created: MealPlanEntry[] = [];

    for (const pick of picks) {
      const slot = slots.find((s) => s.recipeId === pick.recipe.id);

      const { data: cook } = await supabase
        .from('meal_plan_recipes')
        .insert({
          meal_plan_id: plan.id,
          recipe_id: pick.recipe.id,
          day_index: slot?.day ?? null,
          entry_type: 'cook',
          servings: planServings(pick.recipe, servingsPerMeal, pick.nights),
          planned_nights: pick.nights,
          // Planning a whole week doesn't stop to ask about each sub-recipe —
          // it assumes you're cooking them, which is why you linked them. Flip
          // any of them afterwards from the meal's menu.
          make_components: true,
        })
        .select('*, recipe:recipes(*)')
        .single();
      if (!cook) continue;
      created.push(cook as MealPlanEntry);
    }

    setEntries((prev) => [...prev, ...created]);
    if (created.some((e) => hasSubRecipes(e.recipe))) loadSubRecipes([...entries, ...created]);
  }

  // ── Week label ──────────────────────────────────────
  const isCurrentWeek = formatWeekStart(getSunday(new Date())) === formatWeekStart(weekStart);
  const isNextWeek = formatWeekStart(shiftWeek(getSunday(new Date()), 1)) === formatWeekStart(weekStart);
  const isLastWeek = formatWeekStart(shiftWeek(getSunday(new Date()), -1)) === formatWeekStart(weekStart);

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
      : `${mealEntries.length} cook${mealEntries.length !== 1 ? 's' : ''} planned · ${cookedCount} cooked. Drag a meal to any day.`;

  const existingIds = new Set(entries.map((e) => e.recipe_id).filter(Boolean) as string[]);

  // ── Cooking ─────────────────────────────────────────
  /**
   * A real cook that hasn't happened yet. Eating out and legacy batch rows do
   * not offer to start a cook.
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
              width: 60,
              height: 60,
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

    const mealCount = plannedMealCount(entry, entries);
    const meta: string[] = [];
    const mins = (entry.recipe?.prep_time ?? 0) + (entry.recipe?.cook_time ?? 0);
    if (mins > 0) meta.push(formatMins(mins));
    if (mealCount > 1) meta.push(`Covers ${mealCount} meals`);
    if (entryServings(entry) != null) meta.push(`Serves ${entryServings(entry)}`);

    const openRecipe = () => {
      if (entry.recipe_id) router.push({ pathname: '/recipe/[id]', params: { id: entry.recipe_id } });
    };

    return (
      <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <Pressable onPress={openRecipe}>
          <View style={{ width: 60, height: 60, borderRadius: 4, overflow: 'hidden', backgroundColor: t.paper3 }}>
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
            {mealCount > 1 ? (
              <View
                style={{
                  position: 'absolute',
                  top: 5,
                  right: 5,
                  minWidth: 26,
                  height: 22,
                  paddingHorizontal: 6,
                  borderRadius: 999,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'rgba(31, 27, 22, 0.84)',
                }}
              >
                <Mono size={9.5} color="#fff" style={{ fontWeight: '700' }}>{mealCount}×</Mono>
              </View>
            ) : null}
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
              <Mono size={8.5} color={mealCount > 1 ? t.green : t.muted} style={{ letterSpacing: 0.8 }}>
                {meta.join(' · ').toUpperCase()}
              </Mono>
            </View>
          )}
        </Pressable>

        {/* Any planned cook can start now. Today gets the labelled primary
            button; the rest get a quiet flame so the hierarchy still reads. */}
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
              COOKED
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
        !entryMenu.is_cooked && entryMenu.entry_type === 'cook'
          ? {
              label: 'Mark cooked',
              run: () => {
                toggleCooked(entryMenu.id);
                setEntryMenu(null);
              },
            }
          : null,
        entryMenu.is_cooked
          ? {
              label: 'Not cooked after all',
              run: () => {
                toggleCooked(entryMenu.id);
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
                setWeekStart(shiftWeek(getSunday(new Date()), 1));
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
              // The groceries count is what's left to buy, not the whole list.
              ['shopping', 'Groceries', remainingCount],
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
                    minHeight: 78,
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
                    style={{ width: 38, marginTop: dayEntries.length > 0 ? 21 : 0 }}
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
                          paddingVertical: 16,
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
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 10,
                  paddingBottom: 14,
                  marginBottom: 18,
                  borderBottomWidth: 1,
                  borderBottomColor: t.border,
                }}
              >
                <Mono size={10} style={{ flexShrink: 1, letterSpacing: 1.4 }}>
                  SHOPPING LIST{' '}
                  <Mono size={10} color={t.text} style={{ letterSpacing: 1.4 }}>
                    · {remainingCount === 0 ? 'ALL TICKED' : `${remainingCount} TO BUY`}
                  </Mono>
                </Mono>
                {doneCount > 0 && (
                  <Pressable
                    onPress={toggleShowCompleted}
                    hitSlop={10}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                  >
                    <Ionicons
                      name={showCompleted ? 'eye-off-outline' : 'eye-outline'}
                      size={13}
                      color={t.green}
                    />
                    <Mono size={10} color={t.green} style={{ letterSpacing: 1 }}>
                      {showCompleted ? 'HIDE' : 'SHOW'} DONE · {doneCount}
                    </Mono>
                  </Pressable>
                )}
              </View>
            )}

            {/* Everything ticked, and the completed rows are hidden. */}
            {combined.length > 0 && grouped.length === 0 && (
              <View style={{ alignItems: 'center', paddingVertical: 34 }}>
                <Ionicons name="checkmark-circle-outline" size={38} color={t.green} />
                <Serif size={20} style={{ marginTop: 10 }}>
                  That&apos;s the lot
                </Serif>
                <Body size={14} color={t.muted} style={{ marginTop: 4, textAlign: 'center' }}>
                  All {combined.length} items ticked off.
                </Body>
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
                  <Mono size={11}>{showCompleted ? group.items.length : group.remaining}</Mono>
                </View>
                {group.visible.map((ing, i) => {
                  const key = itemKey(ing);
                  const checked = checkedItems.has(key);
                  const qty = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`.trim();
                  return (
                    <SettlingRow
                      key={key}
                      leaving={settling[key] === 'leaving'}
                      duration={SETTLE_OUT_MS}
                    >
                      <Pressable
                        onPress={() => toggleShopping(key)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingVertical: 12,
                          borderBottomWidth: i < group.visible.length - 1 ? 1 : 0,
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
                    </SettlingRow>
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
              const target = shiftWeek(getSunday(new Date()), offset);
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
          {entryMenu?.entry_type === 'cook' ? (
            <View
              style={{
                marginTop: 12,
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: t.ruleHair,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Serif size={16}>Meals this cook covers</Serif>
                <Body size={12} color={t.muted} style={{ marginTop: 2 }}>Only the cooking day appears</Body>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  onPress={() => updatePlannedNights(entryMenu.id, Math.max(1, plannedMealCount(entryMenu, entries) - 1))}
                  disabled={plannedMealCount(entryMenu, entries) <= 1}
                  style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center', opacity: plannedMealCount(entryMenu, entries) <= 1 ? 0.4 : 1 }}
                >
                  <Ionicons name="remove" size={16} color={t.green} />
                </Pressable>
                <Mono size={12} color={t.green} style={{ minWidth: 30, textAlign: 'center', fontWeight: '700' }}>
                  {plannedMealCount(entryMenu, entries)}×
                </Mono>
                <Pressable
                  onPress={() => updatePlannedNights(entryMenu.id, Math.min(7, plannedMealCount(entryMenu, entries) + 1))}
                  disabled={plannedMealCount(entryMenu, entries) >= 7}
                  style={{ width: 32, height: 32, borderRadius: 16, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center', opacity: plannedMealCount(entryMenu, entries) >= 7 ? 0.4 : 1 }}
                >
                  <Ionicons name="add" size={16} color={t.green} />
                </Pressable>
              </View>
            </View>
          ) : null}
          {entryMenu?.entry_type === 'cook' && hasSubRecipes(entryMenu.recipe) ? (
            <Pressable
              onPress={() => setMakeComponents(entryMenu.id, !makesComponents(entryMenu))}
              accessibilityRole="switch"
              accessibilityState={{ checked: makesComponents(entryMenu) }}
              style={{
                paddingVertical: 12,
                borderTopWidth: 1,
                borderTopColor: t.ruleHair,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
            >
              <View style={{ flex: 1 }}>
                <Serif size={16}>
                  {makesComponents(entryMenu) ? 'Making the sub-recipes' : 'Buying the sub-recipes'}
                </Serif>
                <Body size={12} color={t.muted} style={{ marginTop: 2 }}>
                  {makesComponents(entryMenu)
                    ? 'Shopping for their ingredients'
                    : 'Shopping for them ready made'}
                </Body>
              </View>
              <View
                style={{
                  width: 46,
                  height: 26,
                  borderRadius: 13,
                  borderWidth: 1,
                  borderColor: t.border,
                  backgroundColor: makesComponents(entryMenu) ? t.green : t.warm,
                  justifyContent: 'center',
                  paddingHorizontal: 2,
                  alignItems: makesComponents(entryMenu) ? 'flex-end' : 'flex-start',
                }}
              >
                <View
                  style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.card }}
                />
              </View>
            </Pressable>
          ) : null}
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
        onCook={() => {
          setAddTarget(daySheet);
          setDaySheet(null);
          setShowAdd(true);
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
          startAddCook(r, addTarget);
          setShowAdd(false);
        }}
        onClose={() => setShowAdd(false)}
      />

      <SubRecipePromptSheet
        open={pendingAdd !== null}
        recipeTitle={pendingAdd?.recipe.title ?? ''}
        ingredients={pendingAdd?.recipe.ingredients ?? []}
        alreadyPlannedIds={
          new Set(uncookedCooks.map((e) => e.recipe_id).filter((rid): rid is string => !!rid))
        }
        onAnswer={(makeComponents) => {
          if (pendingAdd) addCook(pendingAdd.recipe, pendingAdd.dayIndex, makeComponents);
          setPendingAdd(null);
        }}
        onClose={() => setPendingAdd(null)}
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
