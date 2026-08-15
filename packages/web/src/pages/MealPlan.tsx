import { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  ShoppingCart,
  Plus,
  Check,
  X,
  Utensils,
  Flame,
  ChevronDown,
  Store,
  Zap,
  MoreHorizontal,
  Sparkles,
  CalendarDays,
  Eye,
  EyeOff,
  Trash2,
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  DndContext,
  DragOverlay,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SUB_RECIPE_SELECT,
  customItemKey,
  expandIngredientsForEntry,
  hasSubRecipes,
  makeCustomItem,
  makesComponents,
  parseShoppingLine,
  subRecipeIdsIn,
  supabase,
} from '@recipe-aggregator/shared';
import type {
  CustomShoppingItem,
  Recipe,
  MealPlan as MealPlanType,
  MealPlanEntry,
  SubRecipe,
  SubRecipeMap,
} from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import AddRecipeModal from '../components/AddRecipeModal';
import SubRecipePrompt from '../components/SubRecipePrompt';
import RateCookModal from '../components/RateCookModal';
import DayOptionsModal from '../components/DayOptionsModal';
import PlanWeekModal, { type PlanPrefs, type PlanPick } from '../components/PlanWeekModal';
import { DraggableMealRow, MealDropZone, dayFromDropId, dropId } from '../components/MealPlanDnd';
import {
  combineIngredients,
  type AggregatedIngredient,
  type IngredientWithRecipe,
} from '../utils/combineIngredients';
import { categoriseIngredients, CATEGORY_ORDER } from '../utils/categoriseIngredients';
import { getSunday, getDefaultWeekStart, isPlanningMode, formatWeekStart, formatWeekLabel, shiftWeek } from '../utils/weekHelpers';
import {
  DAY_SHORT,
  DAY_INDEXES,
  dayDate,
  todayIndex,
  entriesForDay,
  unplacedEntries,
  shoppingSourceEntries,
  entryServings,
  planServings,
  plannedMealCount,
  formatMins,
} from '../utils/mealPlanDays';
import IngredientIcon from '../components/IngredientIcon';
import { fSerif, fSans, fMono } from '../styles/pieKeeper';
import { Eyebrow } from '../components/pieKeeper/PieKeeperBits';

type Tab = 'meals' | 'shopping';
type MoveToast = { key: number; text: string; kind: 'success' | 'error' };

/** How a recipe-derived grocery line is identified in `checked_items`. */
const itemKey = (ing: { item: string; unit: string }) => `${ing.item}-${ing.unit}`;

/*
 * A line on the shopping list, whichever way it got there. `customId` is set
 * only on the ones added by hand — it's what makes a line editable, deletable,
 * and identified by id rather than by name, so renaming it keeps its tick.
 */
type ShoppingRow = AggregatedIngredient & { customId?: string };

const rowKey = (row: ShoppingRow) =>
  row.customId ? customItemKey(row.customId) : itemKey(row);

/** A hand-added line as a single editable string, the way it was typed. */
const rowText = (c: CustomShoppingItem) =>
  [c.quantity, c.unit, c.item].filter(Boolean).join(' ');

// How long a newly added item stays highlighted after it lands in its aisle.
const LANDED_MS = 1600;

// A ticked item holds its struck-through place for a beat so the tick reads,
// then collapses out of the list. Shopping is about what's left to buy.
const SETTLE_HOLD_MS = 2000;
const SETTLE_OUT_MS = 380;

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

export default function MealPlan() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => getDefaultWeekStart());
  const [plan, setPlan] = useState<MealPlanType | null>(null);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>(() => searchParams.get('tab') === 'shopping' ? 'shopping' : 'meals');

  useEffect(() => {
    setTab(searchParams.get('tab') === 'shopping' ? 'shopping' : 'meals');
  }, [searchParams]);

  // Adding a recipe: `addTarget` remembers which day the picker was opened for
  // (null = straight into the week with no day).
  const [showAddModal, setShowAddModal] = useState(false);
  const [addTarget, setAddTarget] = useState<number | null>(null);
  const [daySheet, setDaySheet] = useState<number | null>(null);
  const [entryMenu, setEntryMenu] = useState<MealPlanEntry | null>(null);
  const [movePicker, setMovePicker] = useState<MealPlanEntry | null>(null);
  const [moving, setMoving] = useState<string | null>(null);
  const [moveToast, setMoveToast] = useState<MoveToast | null>(null);
  // The meal currently being dragged onto a day.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [weekMenuOpen, setWeekMenuOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [prefs, setPrefs] = useState<PlanPrefs | null>(null);
  // Recipes used as an ingredient of something in the week, and the recipe
  // waiting on a "making it or buying it?" answer before it gets added.
  const [subRecipes, setSubRecipes] = useState<SubRecipeMap>({});
  const [pendingAdd, setPendingAdd] = useState<{ recipe: Recipe; dayIndex: number | null } | null>(null);
  // Post-cook rating popup: set when marking a meal cooked logs a recipe_cooks row.
  const [rateCook, setRateCook] = useState<{ cookId: string; recipeId: string; title?: string } | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [categorising, setCategorising] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);
  // Ticked groceries leave the list by default. `showCompleted` brings them
  // back (Apple Reminders style); `settling` holds the ones ticked just now and
  // still on screen — 'resting' struck through, 'leaving' while collapsing out.
  const [showCompleted, setShowCompleted] = useState(false);
  const [settling, setSettling] = useState<Record<string, 'resting' | 'leaving'>>({});
  const settleTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>[]>>({});

  // Items you added yourself. `composerOpen` is the empty row at the foot of
  // the list you type into; `editingCustom` is an existing one opened for
  // editing in place. `landed` briefly marks the item that just flew up into
  // its aisle, so you can see where it went.
  const [customItems, setCustomItems] = useState<CustomShoppingItem[]>([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [editingCustom, setEditingCustom] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [landed, setLanded] = useState<string | null>(null);
  const landedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCategorisedRef = useRef<string>('');
  const weekMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moveToast) return;
    const timer = setTimeout(() => setMoveToast(null), 2600);
    return () => clearTimeout(timer);
  }, [moveToast]);

  // Plan-mode answers live on the profile, not in context — only this screen
  // needs them, and only when the user opens plan mode.
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('plan_meals_per_week, plan_default_servings, plan_nights_per_meal')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        // All three or none. Anyone who set up before nights existed gets asked
        // the (now shorter) setup sentence once more rather than a silent guess.
        if (data?.plan_meals_per_week && data?.plan_default_servings && data?.plan_nights_per_meal) {
          setPrefs({
            meals: data.plan_meals_per_week,
            servings: data.plan_default_servings,
            nights: data.plan_nights_per_meal,
          });
        }
      });
  }, [user]);

  useEffect(() => {
    if (!weekMenuOpen) return;
    function handleClick(e: MouseEvent) {
      if (weekMenuRef.current && !weekMenuRef.current.contains(e.target as Node)) setWeekMenuOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [weekMenuOpen]);

  const loadPlan = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const weekStr = formatWeekStart(weekStart);

    // Get or create meal plan for this week (RLS returns own + family plans)
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

    const planData = existing as MealPlanType;
    setPlan(planData);
    setCheckedItems(new Set(planData.checked_items || []));
    setCategoryMap(planData.shopping_categories || {});
    setCustomItems(planData.custom_items || []);

    const { data: mprData } = await supabase
      .from('meal_plan_recipes')
      .select('*, recipe:recipes(*)')
      .eq('meal_plan_id', existing.id);

    const loaded = (mprData as MealPlanEntry[]) || [];
    setEntries(loaded);
    await loadSubRecipes(loaded);
    setLoading(false);
  }, [user, weekStart]);

  // Recipes used as an ingredient of something in the week. The shopping list
  // needs their own ingredients to swap in; anything that doesn't come back
  // leaves the parent's line alone.
  async function loadSubRecipes(forEntries: MealPlanEntry[]) {
    const ids = [
      ...new Set(forEntries.flatMap((e) => subRecipeIdsIn(e.recipe?.ingredients))),
    ];
    if (ids.length === 0) {
      setSubRecipes({});
      return;
    }
    const { data } = await supabase.from('recipes').select(SUB_RECIPE_SELECT).in('id', ids);
    setSubRecipes(
      data ? Object.fromEntries((data as SubRecipe[]).map((r) => [r.id, r])) : {},
    );
  }

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // ── Derived ─────────────────────────────────────────
  const today = todayIndex(weekStart);

  // Only saved-recipe cooks buy ingredients; quick meals, eating out and
  // legacy batch rows buy nothing.
  // A linked sub-recipe you're making swaps its line for its own ingredients.
  const uncookedCooks = shoppingSourceEntries(entries).filter((e) => !e.is_cooked);
  const allIngredients: IngredientWithRecipe[] = uncookedCooks.flatMap((e) =>
    expandIngredientsForEntry(e, entryServings(e), subRecipes),
  );
  const combined = combineIngredients(allIngredients);

  // Recipe lines first, then the ones you added. Hand-added items stay in the
  // order they were typed rather than sorting into the alphabetical run, so a
  // new one lands where you'd look for it: the bottom of its aisle.
  const shoppingRows: ShoppingRow[] = [
    ...combined,
    ...customItems.map((c) => ({
      item: c.item,
      quantity: c.quantity,
      unit: c.unit,
      sources: [],
      customId: c.id,
    })),
  ];

  const mealEntries = entries.filter((e) => e.entry_type === 'cook' || e.entry_type === 'quick');
  const cookedCount = mealEntries.filter((e) => e.is_cooked).length;
  const unplaced = unplacedEntries(entries);
  const takenDays = useMemo(
    () => new Set(entries.filter((e) => e.entry_type !== 'batch' && e.day_index != null).map((e) => e.day_index as number)),
    [entries],
  );

  // Run categorisation when ingredients change
  useEffect(() => {
    if (!plan || shoppingRows.length === 0) return;

    const fingerprint = `${plan.id}-${shoppingRows.map((c) => c.item).sort().join(',')}`;
    if (fingerprint === lastCategorisedRef.current) return;

    const hasUncategorised = shoppingRows.some(
      (ing) => !categoryMap[ing.item.toLowerCase().trim()]
    );
    if (!hasUncategorised) {
      lastCategorisedRef.current = fingerprint;
      return;
    }

    let cancelled = false;
    lastCategorisedRef.current = fingerprint;

    async function runCategorise() {
      setCategorising(true);
      const updated = await categoriseIngredients(shoppingRows, categoryMap);
      if (cancelled) return;
      setCategoryMap(updated);
      setCategorising(false);

      const { error } = await supabase
        .from('meal_plans')
        .update({ shopping_categories: updated })
        .eq('id', plan!.id);
      if (error) console.error('Failed to persist shopping categories:', JSON.stringify(error));
    }

    runCategorise();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan?.id, combined.length, customItems.length, entries.length]);

  const categorisedIngredients = shoppingRows.map((ing) => ({
    ...ing,
    shoppingCategory: categoryMap[ing.item.toLowerCase().trim()] || 'Other',
  }));

  // What's still to buy — the number that matters when you're in the shop.
  const remainingCount = shoppingRows.filter((ing) => !checkedItems.has(rowKey(ing))).length;
  const doneCount = shoppingRows.length - remainingCount;

  // A ticked item stays rendered only while `showCompleted` is on or while it's
  // still settling out; a category with nothing left to show goes with it.
  const groupedByCategory = CATEGORY_ORDER
    .map((cat) => {
      const items = categorisedIngredients.filter((ing) => ing.shoppingCategory === cat);
      return {
        category: cat,
        items,
        remaining: items.filter((ing) => !checkedItems.has(rowKey(ing))).length,
        visible: items.filter((ing) => {
          const key = rowKey(ing);
          // The row being edited stays put even if it's ticked — losing it
          // mid-keystroke would be its own kind of bug.
          return (
            !checkedItems.has(key) ||
            showCompleted ||
            settling[key] !== undefined ||
            (ing.customId != null && editingCustom === ing.customId)
          );
        }),
      };
    })
    .filter((group) => group.visible.length > 0);

  // Timers are per item, so a second tick never cancels the first one's exit.
  function clearSettleTimers(key: string) {
    settleTimersRef.current[key]?.forEach(clearTimeout);
    delete settleTimersRef.current[key];
  }

  function clearAllSettleTimers() {
    Object.values(settleTimersRef.current).flat().forEach(clearTimeout);
    settleTimersRef.current = {};
  }

  // Nothing is mid-settle in a week you've just switched to, and nothing should
  // be left ticking after the screen goes away.
  useEffect(() => {
    Object.values(settleTimersRef.current).flat().forEach(clearTimeout);
    settleTimersRef.current = {};
    setSettling({});
  }, [plan?.id]);

  useEffect(() => () => {
    Object.values(settleTimersRef.current).flat().forEach(clearTimeout);
    if (landedTimerRef.current) clearTimeout(landedTimerRef.current);
  }, []);

  // A different week is a different list: close anything half-typed.
  useEffect(() => {
    setComposerOpen(false);
    setDraft('');
    setEditingCustom(null);
    setLanded(null);
  }, [plan?.id]);

  function toggleShowCompleted() {
    const next = !showCompleted;
    // Showing them again means nothing is on its way out any more.
    if (next) {
      clearAllSettleTimers();
      setSettling({});
    }
    setShowCompleted(next);
  }

  function persistCheckedItems(next: Set<string>) {
    if (!plan) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      supabase
        .from('meal_plans')
        .update({ checked_items: [...next] })
        .eq('id', plan.id)
        .then(({ error }) => {
          if (error) console.error('Failed to persist checked items:', JSON.stringify(error));
        });
    }, 300);
  }

  function toggleShoppingItem(key: string) {
    const wasChecked = checkedItems.has(key);
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistCheckedItems(next);
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
    setExpandedItem((cur) => (cur === key ? null : cur));
    setSettling((prev) => ({ ...prev, [key]: 'resting' }));
    settleTimersRef.current[key] = [
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
        delete settleTimersRef.current[key];
      }, SETTLE_HOLD_MS + SETTLE_OUT_MS),
    ];
  }

  // ── Your own items ──────────────────────────────────
  // Written straight through rather than debounced like the tick state: adding,
  // renaming and deleting are deliberate one-off acts, and a debounce here is
  // just a window in which the last one can be lost.
  function saveCustomItems(next: CustomShoppingItem[]) {
    setCustomItems(next);
    if (!plan) return;
    supabase
      .from('meal_plans')
      .update({ custom_items: next })
      .eq('id', plan.id)
      .then(({ error }) => {
        if (error) console.error('Failed to persist custom items:', JSON.stringify(error));
      });
  }

  /** Commit whatever's in the composer. Returns false for an empty line, which
   *  is how blurring an untouched row closes it instead of adding nothing. */
  function commitDraft(): boolean {
    const created = makeCustomItem(draft);
    setDraft('');
    if (!created) return false;

    saveCustomItems([...customItems, created]);

    // It sorts itself into an aisle the moment it's added, so mark where it
    // went for a beat.
    const key = customItemKey(created.id);
    if (landedTimerRef.current) clearTimeout(landedTimerRef.current);
    setLanded(key);
    landedTimerRef.current = setTimeout(
      () => setLanded((cur) => (cur === key ? null : cur)),
      LANDED_MS,
    );
    return true;
  }

  function removeCustomItem(id: string) {
    const key = customItemKey(id);
    saveCustomItems(customItems.filter((c) => c.id !== id));
    setEditingCustom((cur) => (cur === id ? null : cur));
    clearSettleTimers(key);
    // Its tick would otherwise sit in checked_items forever with nothing to tick.
    if (checkedItems.has(key)) {
      setCheckedItems((prev) => {
        const next = new Set(prev);
        next.delete(key);
        persistCheckedItems(next);
        return next;
      });
    }
  }

  function startEditingCustom(c: CustomShoppingItem) {
    setComposerOpen(false);
    setDraft('');
    setEditingCustom(c.id);
    setEditDraft(rowText(c));
  }

  /** Emptying an item deletes it — the same gesture Reminders uses. */
  function commitEdit(id: string) {
    setEditingCustom(null);
    const { item, quantity, unit } = parseShoppingLine(editDraft);
    if (!item) {
      removeCustomItem(id);
      return;
    }
    saveCustomItems(
      customItems.map((c) => (c.id === id ? { ...c, item, quantity, unit } : c)),
    );
  }

  // ── Entry mutations ─────────────────────────────────
  async function addCook(
    recipe: Recipe,
    dayIndex: number | null,
    servings?: number,
    makeComponents?: boolean,
  ) {
    if (!plan) return;
    const { data, error } = await supabase
      .from('meal_plan_recipes')
      .insert({
        meal_plan_id: plan.id,
        recipe_id: recipe.id,
        day_index: dayIndex,
        entry_type: 'cook',
        servings: servings ?? null,
        planned_nights: 1,
        ...(makeComponents === undefined ? {} : { make_components: makeComponents }),
      })
      .select('*, recipe:recipes(*)')
      .single();

    if (!error && data) {
      const entry = data as MealPlanEntry;
      setEntries((prev) => [...prev, entry]);
      // The new meal may bring linked recipes the list hasn't fetched yet.
      if (hasSubRecipes(entry.recipe)) loadSubRecipes([...entries, entry]);
    }
  }

  /** Picked a recipe to cook. Ask about its sub-recipes first, if it has any. */
  function startAddCook(recipe: Recipe, dayIndex: number | null) {
    if (hasSubRecipes(recipe)) {
      setPendingAdd({ recipe, dayIndex });
      return;
    }
    addCook(recipe, dayIndex, prefs?.servings);
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

    if (error) {
      console.error('Failed to update meals covered:', JSON.stringify(error));
      return;
    }

    // Clear any legacy child rows an older mobile build may have created.
    await supabase.from('meal_plan_recipes').delete().eq('parent_id', cook.id).eq('entry_type', 'batch');

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
    const { data, error } = await supabase
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

    if (!error && data) setEntries((prev) => [...prev, data as MealPlanEntry]);
    setDaySheet(null);
  }

  async function addQuickMeal(dayIndex: number, name: string) {
    if (!plan || !name.trim()) return;
    const { data, error } = await supabase
      .from('meal_plan_recipes')
      .insert({ meal_plan_id: plan.id, recipe_id: null, day_index: dayIndex, entry_type: 'quick', note: name.trim() })
      .select('*, recipe:recipes(*)')
      .single();
    if (!error && data) setEntries((prev) => [...prev, data as MealPlanEntry]);
    setDaySheet(null);
  }

  async function moveEntry(entryId: string, dayIndex: number | null) {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, day_index: dayIndex } : e)));
    setMoving(null);
    await supabase.from('meal_plan_recipes').update({ day_index: dayIndex }).eq('id', entryId);
  }

  /** Carry an uncooked recipe or quick meal into the following plan. */
  async function moveToNextWeek(entryId: string) {
    if (!user) return;
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || !['cook', 'quick'].includes(entry.entry_type) || entry.is_cooked) return;

    const nextWeekStart = formatWeekStart(shiftWeek(weekStart, 1));
    const { data: existingPlans, error: lookupError } = await supabase
      .from('meal_plans')
      .select('id')
      .eq('week_start', nextWeekStart)
      .order('created_at', { ascending: true });
    if (lookupError) {
      console.error('Failed to find next week:', JSON.stringify(lookupError));
      setMoveToast({ key: Date.now(), text: 'Couldn’t move recipe — try again', kind: 'error' });
      return;
    }

    let targetPlanId = existingPlans?.[0]?.id as string | undefined;
    if (!targetPlanId) {
      const { data: created, error: createError } = await supabase
        .from('meal_plans')
        .insert({ user_id: user.id, week_start: nextWeekStart })
        .select('id')
        .single();
      if (createError || !created) {
        console.error('Failed to create next week:', JSON.stringify(createError));
        setMoveToast({ key: Date.now(), text: 'Couldn’t move recipe — try again', kind: 'error' });
        return;
      }
      targetPlanId = created.id;
    }

    const { error } = await supabase
      .from('meal_plan_recipes')
      .update({ meal_plan_id: targetPlanId, day_index: null, include_in_shopping: false })
      .eq('id', entryId);
    if (error) {
      console.error('Failed to move meal to next week:', JSON.stringify(error));
      setMoveToast({ key: Date.now(), text: 'Couldn’t move recipe — try again', kind: 'error' });
      return;
    }

    // planned_nights replaced these old leftover rows; don't strand one in the
    // original week if this account still has pre-migration data.
    await supabase.from('meal_plan_recipes').delete().eq('parent_id', entryId).eq('entry_type', 'batch');
    setEntries((prev) => prev.filter((e) => e.id !== entryId && e.parent_id !== entryId));
    setEntryMenu(null);
    setMovePicker(null);
    setMoveToast({
      key: Date.now(),
      text: `${entry.recipe?.title ?? entry.note ?? 'Quick meal'} moved to next week`,
      kind: 'success',
    });
  }

  async function handleRemove(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    // Removing a cook also clears any legacy batch children.
    const alsoGone = entry?.entry_type === 'cook'
      ? entries.filter((e) => e.parent_id === entryId).map((e) => e.id)
      : [];
    setEntries((prev) => prev.filter((e) => e.id !== entryId && !alsoGone.includes(e.id)));
    setEntryMenu(null);
    await supabase.from('meal_plan_recipes').delete().eq('id', entryId);
  }

  async function handleToggleCooked(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    const next = !entry.is_cooked;
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

  /** Flip a planned meal between cooking its sub-recipes and buying them. */
  async function setMakeComponents(entryId: string, next: boolean) {
    const { error } = await supabase
      .from('meal_plan_recipes')
      .update({ make_components: next })
      .eq('id', entryId);
    if (error) {
      console.error('Failed to update sub-recipe choice:', JSON.stringify(error));
      return;
    }
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, make_components: next } : e)));
    setEntryMenu((prev) => (prev?.id === entryId ? { ...prev, make_components: next } : prev));
  }

  // ── Week label ──────────────────────────────────────
  const isCurrentWeek = formatWeekStart(getSunday(new Date())) === formatWeekStart(weekStart);
  const isNextWeek = formatWeekStart(shiftWeek(getSunday(new Date()), 1)) === formatWeekStart(weekStart);
  const isLastWeek = formatWeekStart(shiftWeek(getSunday(new Date()), -1)) === formatWeekStart(weekStart);

  const weekLabel = isCurrentWeek
    ? 'This week'
    : isNextWeek
      ? 'Next week'
      : isLastWeek
        ? 'Last week'
        : `Week of ${formatWeekLabel(weekStart)}`;

  const subtitle = loading
    ? 'Loading your week…'
    : mealEntries.length === 0
      ? 'Nothing planned yet — plan the week, or add meals as you go.'
      : `${mealEntries.length} meal${mealEntries.length !== 1 ? 's' : ''} planned · ${cookedCount} cooked · drag a meal to any day.`;

  const existingRecipeIds = new Set(entries.map((e) => e.recipe_id).filter(Boolean) as string[]);

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
    navigate(`/recipe/${entry.recipe_id}?cook=1&entry=${entry.id}`);
  }

  // ── Drag a meal onto a day ──────────────────────────
  // Same whole-row gesture as cookbook reorder: a small drag distance with a
  // mouse, and a short hold on touch so normal taps and scrolling still win.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
  );

  const draggedEntry = entries.find((e) => e.id === draggingId) ?? null;
  const suppressNextClickRef = useRef(false);

  // A browser may synthesize a click after a touch drag. Swallow that one
  // click so dropping a meal never opens the recipe or one of its row actions.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!suppressNextClickRef.current) return;
      suppressNextClickRef.current = false;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  function handleDragStart(event: DragStartEvent) {
    suppressNextClickRef.current = true;
    setDraggingId(String(event.active.id));
    // The tap-to-move banner and a live drag would be two answers to the same
    // question — the drag wins.
    setMoving(null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 300);
    const { active, over } = event;
    if (!over) return;

    const entry = entries.find((e) => e.id === active.id);
    if (!entry) return;

    const target = dayFromDropId(String(over.id));
    const from = entry.day_index ?? null;
    if (from === target) return;

    moveEntry(entry.id, target);
  }

  function handleDragCancel() {
    setDraggingId(null);
    setTimeout(() => {
      suppressNextClickRef.current = false;
    }, 300);
  }

  // ── Row rendering ───────────────────────────────────
  function renderEntryRow(entry: MealPlanEntry, isToday: boolean) {
    const cooked = entry.is_cooked;
    const mealCount = plannedMealCount(entry, entries);

    if (entry.entry_type === 'out') {
      return (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            style={{ width: 58, height: 58, borderRadius: 4, border: '1px dashed var(--border)', background: 'var(--card)', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--muted)' }}
          >
            <Store size={16} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 15, color: 'var(--text-soft)' }}>Eating out</div>
            {entry.note && (
              <div style={{ fontFamily: fMono, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 3 }}>
                {entry.note}
              </div>
            )}
          </div>
        </div>
      );
    }

    if (entry.entry_type === 'quick') {
      return (
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div style={{ width: 58, height: 58, borderRadius: 4, background: 'var(--green-light)', display: 'grid', placeItems: 'center', flexShrink: 0, color: 'var(--green)' }}>
            <Zap size={16} strokeWidth={1.5} />
          </div>
          <div className="min-w-0 flex-1">
            <div style={{ fontFamily: fSerif, fontSize: 15, color: cooked ? 'var(--muted)' : 'var(--text)', textDecoration: cooked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{entry.note}</div>
            <div style={{ fontFamily: fMono, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--muted)', marginTop: 3 }}>Quick meal</div>
          </div>
          {cooked && <span className="inline-flex items-center gap-1" style={{ padding: '4px 9px', borderRadius: 999, background: 'var(--green-light)', color: 'var(--green)', fontFamily: fMono, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}><Check size={10} strokeWidth={3} />Cooked</span>}
        </div>
      );
    }

    const meta: string[] = [];
    const mins = (entry.recipe?.prep_time ?? 0) + (entry.recipe?.cook_time ?? 0);
    if (mins > 0) meta.push(formatMins(mins));
    if (mealCount > 1) meta.push(`Covers ${mealCount} meals`);
    if (entryServings(entry) != null) meta.push(`Serves ${entryServings(entry)}`);

    return (
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <button
          onClick={() => entry.recipe_id && navigate(`/recipe/${entry.recipe_id}`)}
          style={{ position: 'relative', width: 58, height: 58, borderRadius: 4, overflow: 'hidden', background: 'var(--paper3)', flexShrink: 0, border: 'none', padding: 0, cursor: 'pointer' }}
        >
          {entry.recipe?.image_url ? (
            <img
              src={entry.recipe.image_url}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: cooked ? 'grayscale(100%)' : 'none' }}
            />
          ) : (
            <span style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>
              <Utensils size={16} strokeWidth={1.3} />
            </span>
          )}
          {mealCount > 1 && (
            <span
              aria-label={`Covers ${mealCount} meals`}
              style={{ position: 'absolute', top: 5, right: 5, minWidth: 25, height: 21, padding: '0 6px', borderRadius: 999, display: 'grid', placeItems: 'center', background: 'rgba(31, 27, 22, 0.82)', color: '#fff', fontFamily: fMono, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.02em' }}
            >
              {mealCount}×
            </span>
          )}
        </button>

        <div className="min-w-0 flex-1">
          <button
            onClick={() => entry.recipe_id && navigate(`/recipe/${entry.recipe_id}`)}
            style={{
              display: 'block',
              maxWidth: '100%',
              background: 'none',
              border: 'none',
              padding: 0,
              textAlign: 'left',
              cursor: 'pointer',
              fontFamily: fSerif,
              fontSize: 15,
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
              color: cooked ? 'var(--muted)' : 'var(--text)',
              textDecoration: cooked ? 'line-through' : 'none',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.recipe?.title}
          </button>
          {meta.length > 0 && (
            <div
              className="flex items-center gap-1.5"
              style={{ fontFamily: fMono, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: mealCount > 1 ? 'var(--green)' : 'var(--muted)', marginTop: 4 }}
            >
              {meta.join(' · ')}
            </div>
          )}
        </div>

        {/* Any planned cook can start now. Today gets the labelled primary
            button; the rest get a quiet flame so the hierarchy still reads. */}
        {canCook(entry) && (
          <button
            onClick={() => startCooking(entry)}
            aria-label={isToday ? undefined : `Cook ${entry.recipe?.title} now`}
            title={isToday ? undefined : 'Cook now'}
            className="inline-flex items-center justify-center gap-1.5"
            style={
              isToday
                ? { padding: '6px 13px', borderRadius: 999, border: '1px solid var(--green-solid)', background: 'var(--green-solid)', color: '#fff', fontFamily: fSans, fontSize: 12.5, fontWeight: 500, cursor: 'pointer', flexShrink: 0 }
                : { width: 30, height: 30, borderRadius: 999, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--green)', cursor: 'pointer', flexShrink: 0, padding: 0 }
            }
          >
            <Flame size={isToday ? 12 : 13} strokeWidth={isToday ? 2 : 1.8} />
            {isToday && 'Cook'}
          </button>
        )}
        {cooked && (
          <span
            className="inline-flex items-center gap-1"
            style={{ padding: '4px 9px', borderRadius: 999, background: 'var(--green-light)', color: 'var(--green)', fontFamily: fMono, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', flexShrink: 0 }}
          >
            <Check size={10} strokeWidth={3} />
            Cooked
          </span>
        )}
      </div>
    );
  }

  return (
    <div>
      {/* ── Masthead: one line, plus the week control ────── */}
      {/* The fadeUp animation gives every block its own stacking context, so the
          masthead has to be lifted or the week menu opens behind the banner. */}
      <div
        className="flex items-start justify-between gap-3 mb-1"
        style={{ animation: 'fadeUp 0.4s ease both', position: 'relative', zIndex: 20 }}
      >
        <div>
          <Eyebrow>The plan</Eyebrow>
          <h1
            style={{
              margin: '8px 0 0',
              fontFamily: fSerif,
              fontWeight: 400,
              fontSize: 'clamp(24px, 6vw, 28px)',
              lineHeight: 1.05,
              letterSpacing: '-0.024em',
              color: 'var(--text)',
            }}
          >
            The <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>week</em>
          </h1>
        </div>

        {/* Week pill — says where you are and is also how you move. */}
        <div className="relative shrink-0" ref={weekMenuRef} style={{ marginTop: 4 }}>
          <button
            onClick={() => setWeekMenuOpen((v) => !v)}
            className="inline-flex items-center gap-1.5"
            style={{
              padding: '7px 13px',
              borderRadius: 999,
              border: `1px solid ${isCurrentWeek || isNextWeek ? 'var(--green)' : 'var(--border)'}`,
              background: isCurrentWeek || isNextWeek ? 'var(--green-light)' : 'var(--card)',
              color: isCurrentWeek || isNextWeek ? 'var(--green)' : 'var(--text)',
              fontFamily: fMono,
              fontSize: 9.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {weekLabel}
            <ChevronDown size={12} strokeWidth={2} />
          </button>

          {weekMenuOpen && (
            <div
              style={{
                position: 'absolute',
                right: 0,
                top: 'calc(100% + 6px)',
                zIndex: 30,
                minWidth: 210,
                border: '1px solid var(--border)',
                borderRadius: 4,
                background: 'var(--card)',
                boxShadow: '0 12px 32px rgba(31,27,22,0.14)',
                padding: 6,
              }}
            >
              {[-1, 0, 1, 2, 3].map((offset) => {
                const target = shiftWeek(getSunday(new Date()), offset);
                const active = formatWeekStart(target) === formatWeekStart(weekStart);
                const name = offset === -1 ? 'Last week' : offset === 0 ? 'This week' : offset === 1 ? 'Next week' : `In ${offset} weeks`;
                return (
                  <button
                    key={offset}
                    onClick={() => {
                      setWeekStart(target);
                      setWeekMenuOpen(false);
                    }}
                    className="flex items-center justify-between w-full"
                    style={{
                      padding: '9px 10px',
                      borderRadius: 3,
                      border: 'none',
                      background: active ? 'var(--green-light)' : 'none',
                      color: active ? 'var(--green)' : 'var(--text)',
                      fontFamily: fSans,
                      fontSize: 13.5,
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span>{name}</span>
                    <span style={{ fontFamily: fMono, fontSize: 9.5, color: 'var(--muted)' }}>{formatWeekLabel(target)}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <p style={{ margin: '10px 0 18px', fontFamily: fSans, fontSize: 14, lineHeight: 1.45, color: 'var(--text-soft)', minHeight: '1.25rem' }}>
        {subtitle}
      </p>

      {/* Fri–Sun is when the week ahead usually gets planned. Offer the jump
          rather than making it — you always land on this week. */}
      {isPlanningMode() && isCurrentWeek && (
        <div
          className="flex items-center gap-2 flex-wrap"
          style={{
            padding: '10px 13px',
            marginBottom: 18,
            border: '1px solid var(--border)',
            borderLeft: '2px solid var(--green)',
            borderRadius: '0 3px 3px 0',
            background: 'var(--green-light)',
            animation: 'fadeUp 0.4s ease 0.05s both',
          }}
        >
          <CalendarDays size={14} strokeWidth={1.6} color="var(--green)" />
          <span style={{ fontFamily: fSans, fontSize: 12.5, color: 'var(--text-soft)' }}>
            It's the weekend — good time to sort the week ahead.
          </span>
          <button
            onClick={() => setWeekStart(shiftWeek(getSunday(new Date()), 1))}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: fSans, fontSize: 12.5, fontWeight: 500, color: 'var(--green)' }}
          >
            Plan next week →
          </button>
        </div>
      )}

      {/* ── Editorial tabs ───────────────────────────────── */}
      <div
        style={{ display: 'flex', gap: 28, borderBottom: '1px solid var(--border)', marginBottom: 20, animation: 'fadeUp 0.4s ease 0.1s both' }}
      >
        {([
          ['meals', 'Meals', mealEntries.length],
          // The groceries count is what's left to buy, not the whole list.
          ['shopping', 'Groceries', remainingCount],
        ] as const).map(([key, label, count]) => {
          const active = tab === key;
          return (
            <button
              key={key}
              onClick={() => setTab(key)}
              style={{
                background: 'none',
                border: 'none',
                padding: 0,
                paddingBottom: 12,
                marginBottom: -1,
                cursor: 'pointer',
                fontFamily: fSerif,
                fontSize: 19,
                letterSpacing: '-0.01em',
                color: active ? 'var(--text)' : 'var(--muted)',
                borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
              }}
            >
              {label}{' '}
              <span style={{ fontFamily: fMono, fontSize: 11, color: 'var(--muted)' }}>· {count}</span>
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="text-center py-8" style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 15, color: 'var(--muted)' }}>
          Loading…
        </p>
      )}

      {/* ── Meals tab: the week grid ─────────────────────── */}
      {!loading && tab === 'meals' && (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          onDragCancel={handleDragCancel}
        >
        <div style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}>
          {moving && (
            <div
              className="flex items-center justify-between gap-3"
              style={{ padding: '10px 13px', marginBottom: 12, borderRadius: 3, background: 'var(--green-light)', border: '1px solid var(--green)' }}
            >
              <span style={{ fontFamily: fSans, fontSize: 12.5, color: 'var(--green)' }}>Tap a day to move it there.</span>
              <button
                onClick={() => setMoving(null)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: fSans, fontSize: 12.5, color: 'var(--muted)' }}
              >
                Cancel
              </button>
            </div>
          )}

          {DAY_INDEXES.map((d) => {
            const dayEntries = entriesForDay(entries, d);
            const isToday = today === d;
            const date = dayDate(weekStart, d);
            return (
              <MealDropZone key={d} id={dropId(d)}>
                {({ isOver, dragging }) => (
              <div
                style={{
                  display: 'flex',
                  gap: 12,
                  alignItems: dayEntries.length > 0 ? 'flex-start' : 'center',
                  minHeight: 76,
                  padding: isToday || isOver ? '10px 10px' : '9px 0',
                  margin: isToday || isOver ? '4px -10px' : 0,
                  borderRadius: isToday || isOver ? 4 : 0,
                  background: isOver ? 'var(--green-light)' : isToday ? 'var(--card)' : 'transparent',
                  boxShadow: isOver
                    ? 'inset 0 0 0 1px var(--green)'
                    : isToday
                      ? 'inset 2px 0 0 var(--green)'
                      : 'none',
                  borderBottom: isToday || isOver ? 'none' : '1px solid var(--rule-hair)',
                  transition: 'background 0.15s ease, box-shadow 0.15s ease',
                }}
              >
                <button
                  onClick={() => (moving ? moveEntry(moving, d) : setDaySheet(d))}
                  style={{
                    width: 38,
                    flexShrink: 0,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textAlign: 'left',
                    fontFamily: fMono,
                    fontSize: 9,
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                    lineHeight: 1.3,
                    color: isToday || isOver ? 'var(--green)' : 'var(--muted)',
                    fontWeight: isToday ? 600 : 400,
                    marginTop: dayEntries.length > 0 ? 20 : 0,
                  }}
                >
                  {DAY_SHORT[d]}
                  <br />
                  {date.getDate()}
                </button>

                <div className="flex-1 min-w-0">
                  {dayEntries.length === 0 ? (
                    <button
                      onClick={() => (moving ? moveEntry(moving, d) : setDaySheet(d))}
                      className="flex items-center gap-2 w-full"
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '15px 0',
                        cursor: 'pointer',
                        opacity: moving || dragging ? 1 : 0.6,
                        fontFamily: fMono,
                        fontSize: 9,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        color: moving || dragging ? 'var(--green)' : 'var(--muted)',
                      }}
                    >
                      <span
                        style={{ width: 18, height: 18, borderRadius: '50%', border: `1px solid ${moving || dragging ? 'var(--green)' : 'var(--border)'}`, display: 'grid', placeItems: 'center' }}
                      >
                        <Plus size={11} strokeWidth={2} />
                      </span>
                      {isOver ? 'Drop here' : moving ? 'Move here' : dragging ? 'Free' : 'Nothing yet'}
                    </button>
                  ) : (
                    dayEntries.map((entry, i) => (
                      <DraggableMealRow
                        key={entry.id}
                        id={entry.id}
                        style={{ paddingTop: i === 0 ? 0 : 8, marginTop: i === 0 ? 0 : 8, borderTop: i === 0 ? 'none' : '1px solid var(--rule-hair)' }}
                      >
                        {renderEntryRow(entry, isToday)}
                        <button
                          onClick={() => setEntryMenu(entry)}
                          aria-label="Meal options"
                          style={{ background: 'none', border: 'none', padding: 4, margin: -4, cursor: 'pointer', color: 'var(--muted)', lineHeight: 0, flexShrink: 0 }}
                        >
                          <MoreHorizontal size={16} strokeWidth={1.8} />
                        </button>
                      </DraggableMealRow>
                    ))
                  )}
                </div>
              </div>
                )}
              </MealDropZone>
            );
          })}

          {/* Meals in the week without a day. A real place, not a to-do list —
              and while a meal is in the air it's also where you drop it to take
              it back off the calendar. */}
          <MealDropZone id={dropId(null)}>
            {({ isOver, dragging }) =>
              unplaced.length === 0 && !dragging ? (
                <div />
              ) : (
                <div
                  style={{
                    marginTop: 22,
                    padding: isOver ? '8px 10px' : 0,
                    margin: isOver ? '14px -10px 0' : '22px 0 0',
                    borderRadius: isOver ? 4 : 0,
                    background: isOver ? 'var(--green-light)' : 'transparent',
                    boxShadow: isOver ? 'inset 0 0 0 1px var(--green)' : 'none',
                    transition: 'background 0.15s ease, box-shadow 0.15s ease',
                  }}
                >
                  <div
                    className="flex items-baseline justify-between"
                    style={{ paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}
                  >
                    <span style={{ fontFamily: fMono, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: isOver ? 'var(--green)' : 'var(--muted)' }}>
                      Not on a day yet
                    </span>
                    <span style={{ fontFamily: fMono, fontSize: 10, color: 'var(--muted)' }}>{unplaced.length}</span>
                  </div>

                  {unplaced.length === 0 ? (
                    <div
                      className="flex items-center gap-2"
                      style={{ padding: '10px 0', fontFamily: fMono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: isOver ? 'var(--green)' : 'var(--muted)' }}
                    >
                      <span style={{ width: 18, height: 18, borderRadius: '50%', border: `1px dashed ${isOver ? 'var(--green)' : 'var(--border)'}`, display: 'grid', placeItems: 'center' }}>
                        <X size={10} strokeWidth={2} />
                      </span>
                      {isOver ? 'Drop to take off the day' : 'Drop here for no day'}
                    </div>
                  ) : (
                    unplaced.map((entry) => (
                      <DraggableMealRow key={entry.id} id={entry.id} style={{ padding: '9px 0', borderBottom: '1px solid var(--rule-hair)' }}>
                        {renderEntryRow(entry, false)}
                        <button
                          onClick={() => setEntryMenu(entry)}
                          aria-label="Meal options"
                          style={{ background: 'none', border: 'none', padding: 4, margin: -4, cursor: 'pointer', color: 'var(--muted)', lineHeight: 0, flexShrink: 0 }}
                        >
                          <MoreHorizontal size={16} strokeWidth={1.8} />
                        </button>
                      </DraggableMealRow>
                    ))
                  )}
                </div>
              )
            }
          </MealDropZone>

          {/* Plan mode + a plain add, side by side. */}
          <div className="flex flex-col sm:flex-row gap-2" style={{ marginTop: 22 }}>
            <button
              onClick={() => setPlanOpen(true)}
              className="flex items-center justify-center gap-2 flex-1"
              style={{
                padding: '14px 18px',
                border: '1px solid var(--green-solid)',
                borderRadius: 4,
                background: 'var(--green-solid)',
                color: '#fff',
                cursor: 'pointer',
                fontFamily: fSerif,
                fontSize: 16,
                fontStyle: 'italic',
              }}
            >
              <Sparkles size={16} strokeWidth={1.6} />
              Plan the week
            </button>
            <button
              onClick={() => {
                setAddTarget(null);
                setShowAddModal(true);
              }}
              className="flex items-center justify-center gap-2 flex-1"
              style={{
                padding: '14px 18px',
                border: '1px dashed var(--green)',
                borderRadius: 4,
                background: 'transparent',
                color: 'var(--green)',
                cursor: 'pointer',
                fontFamily: fSerif,
                fontSize: 16,
                fontStyle: 'italic',
              }}
            >
              <Plus size={16} strokeWidth={1.6} />
              Add one meal
            </button>
          </div>
        </div>

        {/* The meal in the air. dnd-kit springs this back into the row's new
            slot on drop, which is what makes the move read as a snap. */}
        <DragOverlay dropAnimation={{ duration: 240, easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.15)' }}>
          {draggedEntry ? (
            <div
              className="flex items-center gap-2"
              style={{
                padding: '9px 12px',
                borderRadius: 4,
                background: 'var(--card)',
                border: '1px solid var(--green)',
                boxShadow: '0 18px 40px rgba(31,27,22,0.22)',
                cursor: 'grabbing',
                transform: 'rotate(-0.6deg)',
              }}
            >
              {renderEntryRow(draggedEntry, false)}
            </div>
          ) : null}
        </DragOverlay>
        </DndContext>
      )}

      {/* ── Shopping list tab ────────────────────────────── */}
      {!loading && tab === 'shopping' && (
        <div>
          {shoppingRows.length === 0 && (
            <div className="text-center py-14" style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}>
              <div className="flex justify-center" style={{ color: 'var(--muted)' }}>
                <ShoppingCart size={40} strokeWidth={1.2} />
              </div>
              <p className="mt-4" style={{ fontFamily: fSerif, fontSize: 21, letterSpacing: '-0.015em', color: 'var(--text)' }}>
                {mealEntries.length === 0 ? 'Nothing on the list' : 'All meals cooked'}
              </p>
              <p className="mt-1" style={{ fontFamily: fSans, fontSize: 14, color: 'var(--muted)' }}>
                {mealEntries.length === 0
                  ? 'Add some meals, or add what you need below.'
                  : 'Nothing left to shop for — add your own below.'}
              </p>
            </div>
          )}

          {shoppingRows.length > 0 && (
            <div
              className="flex items-baseline justify-between gap-3"
              style={{ paddingBottom: 14, marginBottom: 22, borderBottom: '1px solid var(--border)', animation: 'fadeUp 0.4s ease 0.15s both' }}
            >
              <span style={{ fontFamily: fMono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Shopping list
                <span style={{ color: 'var(--text)' }}>
                  {' · '}
                  {remainingCount === 0 ? 'all ticked' : `${remainingCount} to buy`}
                </span>
              </span>
              {doneCount > 0 && (
                <button
                  onClick={toggleShowCompleted}
                  className="shrink-0"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    fontFamily: fMono,
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--green)',
                  }}
                >
                  {showCompleted ? <EyeOff size={12} strokeWidth={2} /> : <Eye size={12} strokeWidth={2} />}
                  {showCompleted ? 'Hide' : 'Show'} completed · {doneCount}
                </button>
              )}
            </div>
          )}

          {/* Everything ticked, and the completed rows are hidden. */}
          {shoppingRows.length > 0 && groupedByCategory.length === 0 && (
            <div className="text-center py-10" style={{ animation: 'fadeUp 0.4s ease both' }}>
              <div className="flex justify-center" style={{ color: 'var(--green)' }}>
                <Check size={34} strokeWidth={1.4} />
              </div>
              <p className="mt-3" style={{ fontFamily: fSerif, fontSize: 20, letterSpacing: '-0.015em', color: 'var(--text)' }}>
                That's the lot
              </p>
              <p className="mt-1" style={{ fontFamily: fSans, fontSize: 14, color: 'var(--muted)' }}>
                All {shoppingRows.length} items ticked off.
              </p>
            </div>
          )}

          {categorising && shoppingRows.length > 0 && (
            <p className="text-center py-2 mb-2" style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 14, color: 'var(--green)' }}>
              Categorising ingredients…
            </p>
          )}

          {groupedByCategory.map((group, groupIndex) => (
            <div
              key={group.category}
              style={{ marginBottom: 26, animation: 'fadeUp 0.4s ease both', animationDelay: `${Math.min(0.2 + groupIndex * 0.05, 0.45)}s` }}
            >
              <div
                style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 2 }}
              >
                <span style={{ fontFamily: fSerif, fontStyle: 'italic', color: 'var(--green)', fontSize: 13 }}>
                  {toRoman(groupIndex + 1)}.
                </span>
                <h3 style={{ margin: 0, fontFamily: fSerif, fontSize: 18, fontWeight: 400, letterSpacing: '-0.015em', color: 'var(--text)', flex: 1 }}>
                  {group.category}
                </h3>
                <span style={{ fontFamily: fMono, fontSize: 11, color: 'var(--muted)' }}>
                  {showCompleted ? group.items.length : group.remaining}
                </span>
              </div>

              {group.visible.map((ing, i) => {
                const key = rowKey(ing);
                const checked = checkedItems.has(key);
                const leaving = settling[key] === 'leaving';
                const isExpanded = expandedItem === key;
                const qty = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`.trim();
                const custom = ing.customId
                  ? customItems.find((c) => c.id === ing.customId)
                  : undefined;
                const isEditing = custom != null && editingCustom === custom.id;
                const justLanded = landed === key;
                return (
                  <div
                    key={key}
                    style={{
                      // 1fr → 0fr collapses the row to nothing without having to
                      // measure it, so ticked items slide the list closed.
                      display: 'grid',
                      gridTemplateRows: leaving ? '0fr' : '1fr',
                      opacity: leaving ? 0 : 1,
                      borderBottom:
                        leaving || i >= group.visible.length - 1 ? 'none' : '1px solid var(--rule-hair)',
                      transition: `grid-template-rows ${SETTLE_OUT_MS}ms ease, opacity ${SETTLE_OUT_MS}ms ease`,
                    }}
                  >
                    <div style={{ overflow: 'hidden', opacity: checked && !leaving ? 0.5 : 1, transition: 'opacity 0.3s' }}>
                    <div
                      className="flex items-center gap-3 select-none"
                      style={{
                        padding: '12px 0',
                        cursor: isEditing ? 'default' : 'pointer',
                        // A just-added item sorts straight into its aisle, so
                        // it glows for a beat to show where it went. Background
                        // only — the settling wrapper clips anything outside
                        // the row's own box.
                        background: justLanded ? 'var(--paper3)' : 'transparent',
                        transition: 'background 0.45s ease',
                      }}
                      onClick={isEditing ? undefined : () => toggleShoppingItem(key)}
                    >
                      <span
                        className="shrink-0"
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 5,
                          border: `1.5px solid ${checked ? 'var(--green)' : 'var(--border)'}`,
                          background: checked ? 'var(--green)' : 'transparent',
                          display: 'grid',
                          placeItems: 'center',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {checked && <Check size={13} strokeWidth={3} color="#fbf8f1" />}
                      </span>

                      <IngredientIcon item={ing.item} />

                      {isEditing ? (
                        <input
                          autoFocus
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              commitEdit(custom!.id);
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              setEditingCustom(null);
                            }
                          }}
                          onBlur={() => commitEdit(custom!.id)}
                          className="flex-1 min-w-0"
                          style={{
                            fontFamily: fSerif,
                            fontSize: 16,
                            letterSpacing: '-0.01em',
                            color: 'var(--text)',
                            background: 'transparent',
                            border: 'none',
                            outline: 'none',
                            padding: 0,
                          }}
                        />
                      ) : (
                        <span
                          className="flex-1"
                          style={{
                            fontFamily: fSerif,
                            fontSize: 16,
                            letterSpacing: '-0.01em',
                            color: checked ? 'var(--muted)' : 'var(--text)',
                            textDecoration: checked ? 'line-through' : 'none',
                            cursor: custom ? 'text' : 'inherit',
                          }}
                          // Tapping the words of your own item edits it; tapping
                          // anywhere else on the row still ticks it off.
                          onClick={
                            custom
                              ? (e) => {
                                  e.stopPropagation();
                                  startEditingCustom(custom);
                                }
                              : undefined
                          }
                        >
                          {ing.item}
                        </span>
                      )}

                      {qty && !isEditing && (
                        <span
                          style={{
                            fontFamily: fMono,
                            fontSize: 11,
                            letterSpacing: '0.04em',
                            color: 'var(--muted)',
                            flexShrink: 0,
                            textDecoration: checked ? 'line-through' : 'none',
                          }}
                        >
                          {qty}
                        </span>
                      )}

                      {isEditing && (
                        <button
                          style={{ padding: 4, margin: -4, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0 }}
                          aria-label={`Delete ${ing.item}`}
                          // Fires before the input's blur can commit the edit.
                          onMouseDown={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            removeCustomItem(custom!.id);
                          }}
                        >
                          <Trash2 size={15} strokeWidth={2} color="var(--muted)" style={{ display: 'block' }} />
                        </button>
                      )}

                      {!custom && (
                        <button
                          style={{ padding: 4, margin: -4, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', lineHeight: 0 }}
                          aria-label="Show recipes"
                          onClick={(e) => {
                            e.stopPropagation();
                            setExpandedItem(isExpanded ? null : key);
                          }}
                        >
                          <ChevronDown
                            size={15}
                            strokeWidth={2}
                            color="var(--muted)"
                            style={{ transition: 'transform 0.2s ease', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)', display: 'block' }}
                          />
                        </button>
                      )}
                    </div>

                    {isExpanded && (
                      <div style={{ padding: '2px 0 12px 59px' }}>
                        {ing.sources.map((src, si) => (
                          <div key={`${src.recipeId}-${si}`} className="flex items-center justify-between py-1.5">
                            <span
                              className="cursor-pointer"
                              style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 14, color: 'var(--green)' }}
                              onClick={(e) => {
                                e.stopPropagation();
                                navigate(`/recipe/${src.recipeId}`);
                              }}
                            >
                              {src.recipeTitle}
                            </span>
                            <span style={{ fontFamily: fMono, fontSize: 10.5, letterSpacing: '0.04em', color: 'var(--muted)' }}>
                              {src.quantity} {src.unit}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}

          {/* ── Your own items ───────────────────────────────
              An always-there empty row at the foot of the list. Return banks
              the line and leaves you on a fresh one, so a whole shop can be
              typed without touching the mouse; an empty return closes it. */}
          <div style={{ animation: 'fadeUp 0.4s ease 0.2s both' }}>
            <div
              className="flex items-center gap-3"
              style={{
                padding: '12px 0',
                cursor: composerOpen ? 'default' : 'pointer',
                borderTop: groupedByCategory.length > 0 ? '1px solid var(--rule-hair)' : 'none',
              }}
              onClick={() => {
                if (composerOpen) return;
                setEditingCustom(null);
                setComposerOpen(true);
              }}
            >
              <span
                className="shrink-0"
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 5,
                  border: '1.5px dashed var(--border)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                <Plus size={12} strokeWidth={2.5} color="var(--muted)" />
              </span>

              {/* Keeps the text on the same line as every other row's name. */}
              <span className="shrink-0" style={{ width: 36 }} />

              {composerOpen ? (
                <input
                  autoFocus
                  value={draft}
                  placeholder="Milk, 2 avocados, 500g pasta…"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (!commitDraft()) setComposerOpen(false);
                    } else if (e.key === 'Escape') {
                      e.preventDefault();
                      setDraft('');
                      setComposerOpen(false);
                    }
                  }}
                  onBlur={() => {
                    commitDraft();
                    setComposerOpen(false);
                  }}
                  className="flex-1 min-w-0"
                  style={{
                    fontFamily: fSerif,
                    fontSize: 16,
                    letterSpacing: '-0.01em',
                    color: 'var(--text)',
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    padding: 0,
                  }}
                />
              ) : (
                <span
                  className="flex-1"
                  style={{ fontFamily: fSerif, fontSize: 16, letterSpacing: '-0.01em', color: 'var(--muted)' }}
                >
                  Add item
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Per-meal menu ────────────────────────────────── */}
      {entryMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEntryMenu(null)}>
          <div className="rf-card w-full max-w-[380px] mx-3" style={{ padding: '20px 22px 22px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 2px', fontFamily: fSerif, fontWeight: 400, fontSize: 20, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              {entryMenu.entry_type === 'out' ? 'Eating out' : entryMenu.entry_type === 'quick' ? entryMenu.note : entryMenu.recipe?.title}
            </h2>
            <p style={{ margin: '0 0 8px', fontFamily: fMono, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              {entryMenu.day_index != null ? DAY_SHORT[entryMenu.day_index] : 'No day yet'}
            </p>

            {entryMenu.entry_type === 'cook' && (
              <div className="flex items-center justify-between gap-3" style={{ padding: '13px 4px', borderTop: '1px solid var(--rule-hair)' }}>
                <div>
                  <div style={{ fontFamily: fSerif, fontSize: 16, color: 'var(--text)' }}>Meals this cook covers</div>
                  <div style={{ marginTop: 2, fontFamily: fSans, fontSize: 12, color: 'var(--muted)' }}>Only the cooking day appears</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updatePlannedNights(entryMenu.id, Math.max(1, plannedMealCount(entryMenu, entries) - 1))}
                    disabled={plannedMealCount(entryMenu, entries) <= 1}
                    aria-label="Cover one fewer meal"
                    style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--green)', cursor: 'pointer', opacity: plannedMealCount(entryMenu, entries) <= 1 ? 0.4 : 1 }}
                  >−</button>
                  <span style={{ minWidth: 30, textAlign: 'center', fontFamily: fMono, fontSize: 12, color: 'var(--green)', fontWeight: 700 }}>
                    {plannedMealCount(entryMenu, entries)}×
                  </span>
                  <button
                    onClick={() => updatePlannedNights(entryMenu.id, Math.min(7, plannedMealCount(entryMenu, entries) + 1))}
                    disabled={plannedMealCount(entryMenu, entries) >= 7}
                    aria-label="Cover one more meal"
                    style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--green)', cursor: 'pointer', opacity: plannedMealCount(entryMenu, entries) >= 7 ? 0.4 : 1 }}
                  >+</button>
                </div>
              </div>
            )}

            {entryMenu.entry_type === 'cook' && hasSubRecipes(entryMenu.recipe) && (
              <div className="flex items-center justify-between gap-3" style={{ padding: '13px 4px', borderTop: '1px solid var(--rule-hair)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: fSerif, fontSize: 16, color: 'var(--text)' }}>
                    {makesComponents(entryMenu) ? 'Making the sub-recipes' : 'Buying the sub-recipes'}
                  </div>
                  <div style={{ marginTop: 2, fontFamily: fSans, fontSize: 12, color: 'var(--muted)' }}>
                    {makesComponents(entryMenu)
                      ? 'Shopping for their ingredients'
                      : 'Shopping for them ready made'}
                  </div>
                </div>
                <button
                  onClick={() => setMakeComponents(entryMenu.id, !makesComponents(entryMenu))}
                  aria-label={makesComponents(entryMenu) ? 'Buy the sub-recipes instead' : 'Make the sub-recipes instead'}
                  style={{
                    flexShrink: 0,
                    width: 46,
                    height: 26,
                    borderRadius: 13,
                    border: '1px solid var(--border)',
                    background: makesComponents(entryMenu) ? 'var(--green)' : 'var(--warm)',
                    position: 'relative',
                    cursor: 'pointer',
                    transition: 'background 0.15s ease',
                  }}
                >
                  <span
                    style={{
                      position: 'absolute',
                      top: 2,
                      left: makesComponents(entryMenu) ? 22 : 2,
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: 'var(--card)',
                      boxShadow: 'var(--shadow-sm)',
                      transition: 'left 0.15s ease',
                    }}
                  />
                </button>
              </div>
            )}

            {[
              canCook(entryMenu)
                ? { label: 'Cook now', run: () => { setEntryMenu(null); startCooking(entryMenu); }, primary: true }
                : null,
              entryMenu.recipe_id
                ? { label: 'View recipe', run: () => { setEntryMenu(null); navigate(`/recipe/${entryMenu.recipe_id}`); } }
                : null,
              !entryMenu.is_cooked && (entryMenu.entry_type === 'cook' || entryMenu.entry_type === 'quick')
                ? { label: 'Mark cooked', run: () => { handleToggleCooked(entryMenu.id); setEntryMenu(null); } }
                : null,
              entryMenu.is_cooked
                ? { label: 'Not cooked after all', run: () => { handleToggleCooked(entryMenu.id); setEntryMenu(null); } }
                : null,
              { label: 'Move…', run: () => { setMovePicker(entryMenu); setEntryMenu(null); } },
              { label: 'Remove from the week', run: () => handleRemove(entryMenu.id), danger: true },
            ]
              .filter(Boolean)
              .map((action) => {
                const a = action as { label: string; run: () => void; danger?: boolean; primary?: boolean };
                return (
                  <button
                    key={a.label}
                    onClick={a.run}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      padding: '13px 4px',
                      background: 'none',
                      border: 'none',
                      borderTop: '1px solid var(--rule-hair)',
                      cursor: 'pointer',
                      fontFamily: fSerif,
                      fontSize: 16,
                      fontStyle: a.primary ? 'italic' : 'normal',
                      color: a.danger ? 'var(--red)' : a.primary ? 'var(--green)' : 'var(--text)',
                    }}
                  >
                    {a.primary && <Flame size={13} strokeWidth={2} style={{ display: 'inline', marginRight: 7, verticalAlign: -1 }} />}
                    {a.label}
                  </button>
                );
              })}
          </div>
        </div>
      )}

      {movePicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setMovePicker(null)}>
          <div className="rf-card w-full max-w-[440px] mx-3" style={{ padding: '20px 22px 24px' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between" style={{ marginBottom: 16 }}>
              <div style={{ minWidth: 0 }}>
                <h2 style={{ margin: 0, fontFamily: fSerif, fontWeight: 400, fontSize: 22, color: 'var(--text)' }}>Move meal</h2>
                <p style={{ margin: '3px 0 0', fontFamily: fSans, fontSize: 12.5, color: 'var(--muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {movePicker.recipe?.title ?? movePicker.note ?? 'Meal'}
                </p>
              </div>
              <button onClick={() => setMovePicker(null)} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', lineHeight: 0, padding: 4 }}>
                <X size={18} strokeWidth={1.8} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
              {DAY_INDEXES.map((d) => {
                const selected = movePicker.day_index === d;
                return (
                  <button
                    key={d}
                    onClick={() => { moveEntry(movePicker.id, d); setMovePicker(null); }}
                    aria-label={`Move to ${DAY_SHORT[d]}`}
                    style={{ padding: '9px 2px', borderRadius: 5, border: `1px solid ${selected ? 'var(--green)' : 'var(--border)'}`, background: selected ? 'var(--green-light)' : 'var(--card)', color: selected ? 'var(--green)' : 'var(--text)', cursor: 'pointer' }}
                  >
                    <span style={{ display: 'block', fontFamily: fMono, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{DAY_SHORT[d].slice(0, 2)}</span>
                    <span style={{ display: 'block', marginTop: 4, fontFamily: fSerif, fontSize: 17 }}>{dayDate(weekStart, d).getDate()}</span>
                  </button>
                );
              })}
            </div>

            <button onClick={() => { moveEntry(movePicker.id, null); setMovePicker(null); }} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', marginTop: 15, padding: '13px 4px', border: 'none', borderTop: '1px solid var(--rule-hair)', background: 'none', color: 'var(--text)', cursor: 'pointer', textAlign: 'left' }}>
              <CalendarDays size={18} strokeWidth={1.5} color="var(--muted)" />
              <span style={{ flex: 1, fontFamily: fSerif, fontSize: 16 }}>No day yet</span>
              {movePicker.day_index === null && <Check size={15} color="var(--green)" />}
            </button>

            {(movePicker.entry_type === 'cook' || movePicker.entry_type === 'quick') && !movePicker.is_cooked && (
              <button onClick={() => moveToNextWeek(movePicker.id)} style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 4px', border: 'none', borderTop: '1px solid var(--rule-hair)', background: 'none', color: 'var(--green)', cursor: 'pointer', textAlign: 'left' }}>
                <CalendarDays size={18} strokeWidth={1.5} />
                <span style={{ flex: 1 }}>
                  <span style={{ display: 'block', fontFamily: fSerif, fontSize: 16 }}>Next week</span>
                  <span style={{ display: 'block', marginTop: 1, fontFamily: fSans, fontSize: 12, color: 'var(--muted)' }}>Move there with no day assigned</span>
                </span>
                <span style={{ color: 'var(--muted)' }}>›</span>
              </button>
            )}
          </div>
        </div>
      )}

      <DayOptionsModal
        open={daySheet !== null}
        dayIndex={daySheet}
        weekStart={weekStart}
        onCook={() => {
          setAddTarget(daySheet);
          setDaySheet(null);
          setShowAddModal(true);
        }}
        onEatingOut={(note) => daySheet !== null && addEatingOut(daySheet, note)}
        onQuickMeal={(name) => daySheet !== null && addQuickMeal(daySheet, name)}
        onClose={() => setDaySheet(null)}
      />

      <PlanWeekModal
        open={planOpen}
        weekStart={weekStart}
        takenDays={takenDays}
        prefs={prefs}
        onSavePrefs={savePrefs}
        onCommit={commitPlan}
        onClose={() => setPlanOpen(false)}
      />

      <AddRecipeModal
        open={showAddModal}
        existingRecipeIds={existingRecipeIds}
        existingLabel="In the week"
        // Plan mode's order, because this is plan mode's job in miniature:
        // what haven't I cooked in a while?
        defaultSort="suggested"
        eyebrow={addTarget !== null ? `${DAY_SHORT[addTarget]} · one meal` : 'Add one meal'}
        title={addTarget !== null ? `Cook something on ${DAY_SHORT[addTarget]}` : 'Add a meal to the week'}
        onAdd={(recipe) => {
          startAddCook(recipe, addTarget);
          setShowAddModal(false);
        }}
        onClose={() => setShowAddModal(false)}
      />

      <SubRecipePrompt
        open={pendingAdd !== null}
        recipeTitle={pendingAdd?.recipe.title ?? ''}
        ingredients={pendingAdd?.recipe.ingredients ?? []}
        alreadyPlannedIds={
          new Set(
            uncookedCooks
              .map((e) => e.recipe_id)
              .filter((rid): rid is string => !!rid),
          )
        }
        onAnswer={(makeComponents) => {
          if (pendingAdd) {
            addCook(pendingAdd.recipe, pendingAdd.dayIndex, prefs?.servings, makeComponents);
          }
          setPendingAdd(null);
        }}
        onClose={() => setPendingAdd(null)}
      />

      <RateCookModal
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

      {moveToast && (
        <div
          key={moveToast.key}
          role="status"
          aria-live="polite"
          style={{
            position: 'fixed',
            left: '50%',
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
            zIndex: 80,
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            maxWidth: 'min(88vw, 440px)',
            padding: '10px 16px',
            borderRadius: 999,
            background: moveToast.kind === 'success' ? 'var(--green-solid)' : 'var(--red)',
            color: '#fff',
            boxShadow: 'var(--shadow-md)',
            fontFamily: fSans,
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            pointerEvents: 'none',
            animation: 'fadeUp 0.25s ease both',
          }}
        >
          {moveToast.kind === 'success' ? <Check size={16} aria-hidden /> : '⚠'}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{moveToast.text}</span>
        </div>
      )}
    </div>
  );
}
