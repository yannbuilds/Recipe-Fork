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
  MoreHorizontal,
  Sparkles,
  CalendarDays,
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
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, MealPlan as MealPlanType, MealPlanEntry } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import AddRecipeModal from '../components/AddRecipeModal';
import RateCookModal from '../components/RateCookModal';
import DayOptionsModal from '../components/DayOptionsModal';
import PlanWeekModal, { type PlanPrefs, type PlanPick } from '../components/PlanWeekModal';
import { DraggableMealRow, MealDropZone, dayFromDropId, dropId } from '../components/MealPlanDnd';
import { combineIngredients, type IngredientWithRecipe } from '../utils/combineIngredients';
import { categoriseIngredients, CATEGORY_ORDER } from '../utils/categoriseIngredients';
import { scaleIngredientsForServings } from '../utils/scaleQuantity';
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
  const [moving, setMoving] = useState<string | null>(null);
  // The meal currently being dragged onto a day.
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [weekMenuOpen, setWeekMenuOpen] = useState(false);
  const [planOpen, setPlanOpen] = useState(false);
  const [prefs, setPrefs] = useState<PlanPrefs | null>(null);
  // Post-cook rating popup: set when marking a meal cooked logs a recipe_cooks row.
  const [rateCook, setRateCook] = useState<{ cookId: string; recipeId: string; title?: string } | null>(null);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [categorising, setCategorising] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCategorisedRef = useRef<string>('');
  const weekMenuRef = useRef<HTMLDivElement>(null);

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

    const { data: mprData } = await supabase
      .from('meal_plan_recipes')
      .select('*, recipe:recipes(*)')
      .eq('meal_plan_id', existing.id);

    setEntries((mprData as MealPlanEntry[]) || []);
    setLoading(false);
  }, [user, weekStart]);

  useEffect(() => {
    loadPlan();
  }, [loadPlan]);

  // ── Derived ─────────────────────────────────────────
  const today = todayIndex(weekStart);

  // Only cooks buy ingredients; eating out and legacy batch rows buy nothing.
  const uncookedCooks = shoppingSourceEntries(entries).filter((e) => !e.is_cooked);
  const allIngredients: IngredientWithRecipe[] = uncookedCooks.flatMap((e) =>
    scaleIngredientsForServings(
      e.recipe?.ingredients || [],
      e.recipe?.servings,
      entryServings(e),
    ).map((ing) => ({
      ...ing,
      _recipeTitle: e.recipe?.title || 'Unknown',
      _recipeId: e.recipe?.id || '',
    }))
  );
  const combined = combineIngredients(allIngredients);

  const mealEntries = entries.filter((e) => e.entry_type === 'cook');
  const cookedCount = mealEntries.filter((e) => e.is_cooked).length;
  const unplaced = unplacedEntries(entries);
  const takenDays = useMemo(
    () => new Set(entries.filter((e) => e.entry_type !== 'batch' && e.day_index != null).map((e) => e.day_index as number)),
    [entries],
  );

  // Run categorisation when ingredients change
  useEffect(() => {
    if (!plan || combined.length === 0) return;

    const fingerprint = `${plan.id}-${combined.map((c) => c.item).sort().join(',')}`;
    if (fingerprint === lastCategorisedRef.current) return;

    const hasUncategorised = combined.some(
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
      const updated = await categoriseIngredients(combined, categoryMap);
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
  }, [plan?.id, combined.length, entries.length]);

  const categorisedIngredients = combined.map((ing) => ({
    ...ing,
    shoppingCategory: categoryMap[ing.item.toLowerCase().trim()] || 'Other',
  }));

  const groupedByCategory = CATEGORY_ORDER
    .map((cat) => ({
      category: cat,
      items: categorisedIngredients.filter((ing) => ing.shoppingCategory === cat),
    }))
    .filter((group) => group.items.length > 0);

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
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      persistCheckedItems(next);
      return next;
    });
  }

  // ── Entry mutations ─────────────────────────────────
  async function addCook(recipe: Recipe, dayIndex: number | null, servings?: number) {
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
      })
      .select('*, recipe:recipes(*)')
      .single();

    if (!error && data) setEntries((prev) => [...prev, data as MealPlanEntry]);
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

  async function moveEntry(entryId: string, dayIndex: number | null) {
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, day_index: dayIndex } : e)));
    setMoving(null);
    await supabase.from('meal_plan_recipes').update({ day_index: dayIndex }).eq('id', entryId);
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
        })
        .select('*, recipe:recipes(*)')
        .single();

      if (!cook) continue;
      created.push(cook as MealPlanEntry);
    }

    setEntries((prev) => [...prev, ...created]);
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
      : `${mealEntries.length} cook${mealEntries.length !== 1 ? 's' : ''} planned · ${cookedCount} cooked · drag a meal to any day.`;

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
          ['shopping', 'Groceries', combined.length],
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
          {combined.length === 0 && (
            <div className="text-center py-14" style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}>
              <div className="flex justify-center" style={{ color: 'var(--muted)' }}>
                <ShoppingCart size={40} strokeWidth={1.2} />
              </div>
              <p className="mt-4" style={{ fontFamily: fSerif, fontSize: 21, letterSpacing: '-0.015em', color: 'var(--text)' }}>
                {mealEntries.length === 0 ? 'No meals added yet' : 'All meals cooked'}
              </p>
              <p className="mt-1" style={{ fontFamily: fSans, fontSize: 14, color: 'var(--muted)' }}>
                {mealEntries.length === 0
                  ? 'Add some meals to generate a shopping list.'
                  : 'All meals are marked as cooked — nothing to shop for.'}
              </p>
            </div>
          )}

          {combined.length > 0 && (
            <div
              className="flex items-baseline justify-between"
              style={{ paddingBottom: 14, marginBottom: 22, borderBottom: '1px solid var(--border)', animation: 'fadeUp 0.4s ease 0.15s both' }}
            >
              <span style={{ fontFamily: fMono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Shopping list
              </span>
              <span style={{ fontFamily: fMono, fontSize: 11, letterSpacing: '0.04em', color: 'var(--muted)' }}>
                {checkedItems.size}/{combined.length} ticked
              </span>
            </div>
          )}

          {categorising && combined.length > 0 && (
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
                <span style={{ fontFamily: fMono, fontSize: 11, color: 'var(--muted)' }}>{group.items.length}</span>
              </div>

              {group.items.map((ing, i) => {
                const key = `${ing.item}-${ing.unit}`;
                const checked = checkedItems.has(key);
                const isExpanded = expandedItem === key;
                const qty = `${ing.quantity}${ing.unit ? ` ${ing.unit}` : ''}`.trim();
                return (
                  <div
                    key={key}
                    style={{
                      borderBottom: i < group.items.length - 1 ? '1px solid var(--rule-hair)' : 'none',
                      opacity: checked ? 0.5 : 1,
                      transition: 'opacity 0.3s',
                    }}
                  >
                    <div
                      className="flex items-center gap-3 select-none"
                      style={{ padding: '12px 0', cursor: 'pointer' }}
                      onClick={() => toggleShoppingItem(key)}
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

                      <span
                        className="flex-1"
                        style={{
                          fontFamily: fSerif,
                          fontSize: 16,
                          letterSpacing: '-0.01em',
                          color: checked ? 'var(--muted)' : 'var(--text)',
                          textDecoration: checked ? 'line-through' : 'none',
                        }}
                      >
                        {ing.item}
                      </span>

                      {qty && (
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
                );
              })}
            </div>
          ))}
        </div>
      )}

      {/* ── Per-meal menu ────────────────────────────────── */}
      {entryMenu && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setEntryMenu(null)}>
          <div className="rf-card w-full max-w-[380px] mx-3" style={{ padding: '20px 22px 22px' }} onClick={(e) => e.stopPropagation()}>
            <h2 style={{ margin: '0 0 2px', fontFamily: fSerif, fontWeight: 400, fontSize: 20, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              {entryMenu.entry_type === 'out' ? 'Eating out' : entryMenu.recipe?.title}
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

            {[
              canCook(entryMenu)
                ? { label: 'Cook now', run: () => { setEntryMenu(null); startCooking(entryMenu); }, primary: true }
                : null,
              entryMenu.recipe_id
                ? { label: 'View recipe', run: () => { setEntryMenu(null); navigate(`/recipe/${entryMenu.recipe_id}`); } }
                : null,
              !entryMenu.is_cooked && entryMenu.entry_type === 'cook'
                ? { label: 'Mark cooked', run: () => { handleToggleCooked(entryMenu.id); setEntryMenu(null); } }
                : null,
              entryMenu.is_cooked
                ? { label: 'Not cooked after all', run: () => { handleToggleCooked(entryMenu.id); setEntryMenu(null); } }
                : null,
              { label: 'Move to another day', run: () => { setMoving(entryMenu.id); setEntryMenu(null); setTab('meals'); } },
              entryMenu.day_index != null
                ? { label: 'Take off the day', run: () => { moveEntry(entryMenu.id, null); setEntryMenu(null); } }
                : null,
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
        title={addTarget !== null ? `Cook something on ${DAY_SHORT[addTarget]}` : 'Add a meal to the week'}
        onAdd={(recipe) => {
          addCook(recipe, addTarget, prefs?.servings);
          setShowAddModal(false);
        }}
        onClose={() => setShowAddModal(false)}
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
    </div>
  );
}
