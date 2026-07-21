import { useEffect, useLayoutEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  CalendarDays,
  ShoppingCart,
  Plus,
  Check,
  X,
  Utensils,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
} from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, MealPlan as MealPlanType, MealPlanEntry } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import AddRecipeModal from '../components/AddRecipeModal';
import { combineIngredients, type IngredientWithRecipe } from '../utils/combineIngredients';
import { categoriseIngredients, CATEGORY_ORDER } from '../utils/categoriseIngredients';
import { scaleIngredientsForServings } from '../utils/scaleQuantity';
import { getMonday, getDefaultWeekStart, isPlanningMode, formatWeekStart, formatWeekLabel, shiftWeek } from '../utils/weekHelpers';
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

// Formats total minutes as a compact label (e.g. 90 → "1h 30m").
function formatMins(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
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
  const [showAddModal, setShowAddModal] = useState(false);
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [categoryMap, setCategoryMap] = useState<Record<string, string>>({});
  const [categorising, setCategorising] = useState(false);
  const [expandedItem, setExpandedItem] = useState<string | null>(null);

  // Debounce timer for persisting checked items
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track plan ID for categorisation effect
  const lastCategorisedRef = useRef<string>('');

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

    // Fetch recipes in this plan
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

  // FLIP animation refs
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const prevRectsRef = useRef<Map<string, DOMRect>>(new Map());

  // Sorted entries: uncooked first, cooked last
  const sortedEntries = useMemo(() => {
    return [...entries].sort((a, b) => {
      if (a.is_cooked === b.is_cooked) return 0;
      return a.is_cooked ? 1 : -1;
    });
  }, [entries]);

  // FLIP animation after reorder
  useLayoutEffect(() => {
    if (prevRectsRef.current.size === 0) return;
    const prevRects = prevRectsRef.current;

    cardRefs.current.forEach((el, id) => {
      const prevRect = prevRects.get(id);
      if (!prevRect) return;
      const currRect = el.getBoundingClientRect();
      const deltaX = prevRect.left - currRect.left;
      const deltaY = prevRect.top - currRect.top;
      if (deltaX === 0 && deltaY === 0) return;

      el.style.transform = `translate(${deltaX}px, ${deltaY}px)`;
      el.style.transition = 'none';

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          el.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.1, 0.25, 1)';
          el.style.transform = '';
        });
      });
    });

    prevRectsRef.current = new Map();
  }, [sortedEntries]);

  // Derived data
  const uncookedEntries = entries.filter((e) => !e.is_cooked);
  // Shop for the servings the user actually saved on the recipe, not the source recipe's yield.
  const allIngredients: IngredientWithRecipe[] = uncookedEntries.flatMap((e) =>
    scaleIngredientsForServings(
      e.recipe?.ingredients || [],
      e.recipe?.servings,
      e.recipe?.custom_servings ?? e.recipe?.servings,
    ).map((ing) => ({
      ...ing,
      _recipeTitle: e.recipe?.title || 'Unknown',
      _recipeId: e.recipe?.id || '',
    }))
  );
  const combined = combineIngredients(allIngredients);
  const cookedCount = entries.filter((e) => e.is_cooked).length;
  const cookedPercentage = entries.length > 0 ? Math.round((cookedCount / entries.length) * 100) : 0;

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

  // Apply categories to combined ingredients
  const categorisedIngredients = combined.map((ing) => ({
    ...ing,
    shoppingCategory: categoryMap[ing.item.toLowerCase().trim()] || 'Other',
  }));

  // Group by category in fixed aisle order
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

  async function handleAddRecipe(recipe: Recipe) {
    if (!plan) return;
    const { data, error } = await supabase
      .from('meal_plan_recipes')
      .insert({ meal_plan_id: plan.id, recipe_id: recipe.id })
      .select('*, recipe:recipes(*)')
      .single();

    if (!error && data) {
      setEntries((prev) => [...prev, data as MealPlanEntry]);
    }
  }

  async function handleRemove(entryId: string) {
    await supabase.from('meal_plan_recipes').delete().eq('id', entryId);
    setEntries((prev) => prev.filter((e) => e.id !== entryId));
  }

  async function handleToggleCooked(entryId: string) {
    const entry = entries.find((e) => e.id === entryId);
    if (!entry) return;

    // FLIP: capture "First" positions before state change
    const prevRects = new Map<string, DOMRect>();
    cardRefs.current.forEach((el, id) => {
      prevRects.set(id, el.getBoundingClientRect());
    });
    prevRectsRef.current = prevRects;

    const next = !entry.is_cooked;
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, is_cooked: next } : e)));
    await supabase.from('meal_plan_recipes').update({ is_cooked: next }).eq('id', entryId);
  }

  const existingRecipeIds = new Set(entries.map((e) => e.recipe_id));
  const isCurrentWeek = formatWeekStart(getMonday(new Date())) === formatWeekStart(weekStart);
  const isNextWeek = formatWeekStart(shiftWeek(getMonday(new Date()), 1)) === formatWeekStart(weekStart);
  const isLastWeek = formatWeekStart(shiftWeek(getMonday(new Date()), -1)) === formatWeekStart(weekStart);
  const showPlanningLabel = isPlanningMode() && isNextWeek;

  // Editorial week status chip (mono). Tone drives colour.
  const weekStatus: { label: string; tone: 'green' | 'muted' } | null = isLastWeek
    ? { label: 'Last week', tone: 'muted' }
    : showPlanningLabel
      ? { label: 'Planning next week', tone: 'green' }
      : isCurrentWeek
        ? { label: 'This week', tone: 'green' }
        : isNextWeek
          ? { label: 'Next week', tone: 'green' }
          : null;

  // Masthead subtitle — mirrors the copy voice of the other editorial pages.
  const subtitle = loading
    ? 'Loading your week…'
    : entries.length === 0
      ? 'Nothing planned yet — add recipes to build your week.'
      : `${entries.length} meal${entries.length !== 1 ? 's' : ''} planned · ${cookedCount} cooked.`;

  // Shared editorial circular nav button (prev / next week).
  const weekNavButton = (dir: -1 | 1) => (
    <button
      onClick={() => setWeekStart((prev) => shiftWeek(prev, dir))}
      aria-label={dir === -1 ? 'Previous week' : 'Next week'}
      className="flex items-center justify-center rounded-full transition-colors shrink-0"
      style={{ width: 38, height: 38, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--muted)' }}
      onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--green)'; e.currentTarget.style.color = 'var(--green)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--muted)'; }}
    >
      {dir === -1 ? <ChevronLeft size={17} strokeWidth={1.8} /> : <ChevronRight size={17} strokeWidth={1.8} />}
    </button>
  );

  return (
    <div>
      {/* ── Masthead ─────────────────────────────────────── */}
      <div className="mb-5" style={{ animation: 'fadeUp 0.4s ease both' }}>
        <Eyebrow>The plan</Eyebrow>
        <h1
          style={{
            margin: '12px 0 0',
            fontFamily: fSerif,
            fontWeight: 400,
            fontSize: 'clamp(30px, 8vw, 38px)',
            lineHeight: 1.02,
            letterSpacing: '-0.026em',
            color: 'var(--text)',
          }}
        >
          Meal <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>Plan</em>
        </h1>
        <p
          style={{
            margin: '12px 0 0',
            fontFamily: fSans,
            fontSize: 14.5,
            lineHeight: 1.45,
            color: 'var(--text-soft)',
            minHeight: '1.25rem',
          }}
        >
          {subtitle}
        </p>
      </div>

      {/* ── Week switcher rail ───────────────────────────── */}
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 4,
          background: 'var(--card)',
          padding: '14px 16px',
          marginBottom: 20,
          animation: 'fadeUp 0.4s ease 0.05s both',
        }}
      >
        <div className="flex items-center justify-between gap-3">
          {weekNavButton(-1)}

          <div className="text-center" style={{ minWidth: 0 }}>
            <div
              style={{
                fontFamily: fSerif,
                fontSize: 19,
                letterSpacing: '-0.015em',
                color: 'var(--text)',
                whiteSpace: 'nowrap',
              }}
            >
              Week of {formatWeekLabel(weekStart)}
            </div>
            {weekStatus && (
              <div
                style={{
                  marginTop: 5,
                  fontFamily: fMono,
                  fontSize: 9.5,
                  fontWeight: 500,
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  color: weekStatus.tone === 'green' ? 'var(--green)' : 'var(--muted)',
                }}
              >
                {weekStatus.label}
              </div>
            )}
          </div>

          {weekNavButton(1)}
        </div>

        {/* Progress bar */}
        {entries.length > 0 && (
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid var(--rule-hair)' }}>
            <div
              className="flex justify-between"
              style={{ fontFamily: fMono, fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}
            >
              <span>{cookedCount} of {entries.length} cooked</span>
              <span>{cookedPercentage}%</span>
            </div>
            <div className="overflow-hidden" style={{ height: 4, borderRadius: 9999, background: 'var(--warm)' }}>
              <div
                className="rf-progress-fill"
                style={{ height: '100%', borderRadius: 9999, background: 'var(--green)', width: `${cookedPercentage}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Editorial tabs ───────────────────────────────── */}
      <div
        style={{ display: 'flex', gap: 28, borderBottom: '1px solid var(--border)', marginBottom: 22, animation: 'fadeUp 0.4s ease 0.1s both' }}
      >
        {([
          ['meals', 'Meals', entries.length],
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
        <p
          className="text-center py-8"
          style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 15, color: 'var(--muted)' }}
        >
          Loading…
        </p>
      )}

      {/* ── Meals tab ────────────────────────────────────── */}
      {!loading && tab === 'meals' && (
        <div>
          {entries.length === 0 && (
            <div
              className="text-center py-14"
              style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}
            >
              <div className="flex justify-center" style={{ color: 'var(--muted)' }}>
                <CalendarDays size={40} strokeWidth={1.2} />
              </div>
              <p
                className="mt-4"
                style={{ fontFamily: fSerif, fontSize: 21, letterSpacing: '-0.015em', color: 'var(--text)' }}
              >
                Nothing planned yet
              </p>
              <p className="mt-1" style={{ fontFamily: fSans, fontSize: 14, color: 'var(--muted)' }}>
                Add some recipes to build your week.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-8">
            {sortedEntries.map((entry, index) => {
              const cooked = entry.is_cooked;
              const meta: string[] = [];
              if (entry.recipe?.prep_time != null) meta.push(`Prep ${formatMins(entry.recipe.prep_time)}`);
              if (entry.recipe?.cook_time != null) meta.push(`Cook ${formatMins(entry.recipe.cook_time)}`);
              const plannedServings = entry.recipe?.custom_servings ?? entry.recipe?.servings;
              if (plannedServings != null) meta.push(`Serves ${plannedServings}`);
              return (
                <div
                  key={entry.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(entry.id, el);
                    else cardRefs.current.delete(entry.id);
                  }}
                  style={{
                    opacity: cooked ? 0.72 : 1,
                    transition: 'opacity 0.3s, filter 0.4s',
                    animation: 'fadeUp 0.4s ease both',
                    animationDelay: `${Math.min(0.15 + index * 0.05, 0.4)}s`,
                  }}
                >
                  {/* Photo */}
                  <div
                    style={{
                      position: 'relative',
                      aspectRatio: '4 / 3',
                      borderRadius: 4,
                      overflow: 'hidden',
                      background: 'var(--paper3)',
                    }}
                  >
                    {entry.recipe?.image_url ? (
                      <img
                        src={entry.recipe.image_url}
                        alt={entry.recipe?.title}
                        className="absolute inset-0 w-full h-full object-cover"
                        style={{
                          filter: cooked ? 'grayscale(100%)' : 'saturate(0.92) contrast(1.02)',
                          transition: 'filter 0.4s ease',
                        }}
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex items-center justify-center"
                        style={{ color: 'var(--muted)', filter: cooked ? 'grayscale(100%)' : 'none' }}
                      >
                        <Utensils size={34} strokeWidth={1.2} />
                      </div>
                    )}

                    {/* Hairline border */}
                    <div style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)', pointerEvents: 'none' }} />

                    {/* Remove button */}
                    <button
                      onClick={() => handleRemove(entry.id)}
                      className="absolute flex items-center justify-center rounded-full rf-glass-dark text-white transition-colors"
                      style={{ top: 10, right: 10, width: 28, height: 28 }}
                      title="Remove from meal plan"
                    >
                      <X size={15} strokeWidth={2} />
                    </button>

                    {/* Cooked chip */}
                    {cooked && (
                      <div
                        className="absolute flex items-center gap-1.5"
                        style={{
                          top: 10,
                          left: 10,
                          padding: '4px 8px',
                          background: 'rgba(251,248,241,0.92)',
                          backdropFilter: 'blur(6px)',
                          WebkitBackdropFilter: 'blur(6px)',
                          fontFamily: fMono,
                          fontSize: 9,
                          letterSpacing: '0.1em',
                          textTransform: 'uppercase',
                          color: 'var(--green-deep)',
                        }}
                      >
                        <Check size={11} strokeWidth={3} />
                        Cooked
                      </div>
                    )}
                  </div>

                  {/* Caption */}
                  <div style={{ marginTop: 12 }}>
                    <h3
                      style={{
                        margin: 0,
                        fontFamily: fSerif,
                        fontWeight: 400,
                        fontSize: 19,
                        lineHeight: 1.15,
                        letterSpacing: '-0.015em',
                        color: 'var(--text)',
                        textDecoration: cooked ? 'line-through' : 'none',
                      }}
                    >
                      {entry.recipe?.title}
                    </h3>
                    {meta.length > 0 && (
                      <div
                        style={{
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 10,
                          marginTop: 6,
                          fontFamily: fMono,
                          fontSize: 10,
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                          color: 'var(--muted)',
                        }}
                      >
                        {meta.map((m) => (
                          <span key={m}>{m}</span>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2" style={{ marginTop: 12 }}>
                      <button
                        onClick={() => handleToggleCooked(entry.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 transition-colors"
                        style={{
                          padding: '9px 0',
                          borderRadius: 999,
                          fontFamily: fSans,
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer',
                          border: cooked ? '1px solid var(--green)' : '1px solid var(--border)',
                          background: cooked ? 'var(--green-light)' : 'var(--card)',
                          color: cooked ? 'var(--green)' : 'var(--text)',
                        }}
                      >
                        {cooked && <Check size={14} strokeWidth={2.5} />}
                        {cooked ? 'Cooked' : 'Mark cooked'}
                      </button>
                      <button
                        onClick={() => navigate(`/recipe/${entry.recipe_id}`)}
                        className="flex-1 text-center transition-colors"
                        style={{
                          padding: '9px 0',
                          borderRadius: 999,
                          fontFamily: fSans,
                          fontSize: 13,
                          fontWeight: 500,
                          cursor: 'pointer',
                          border: '1px solid var(--border)',
                          background: 'var(--card)',
                          color: 'var(--text)',
                        }}
                        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--warm)'; }}
                        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--card)'; }}
                      >
                        View recipe
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Add recipe — dashed editorial row */}
          <button
            onClick={() => setShowAddModal(true)}
            style={{
              width: '100%',
              textAlign: 'left',
              marginTop: entries.length > 0 ? 24 : 0,
              padding: '16px 18px',
              border: '1px dashed var(--green)',
              borderRadius: 4,
              background: 'transparent',
              color: 'var(--green)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              cursor: 'pointer',
              animation: 'fadeUp 0.4s ease both',
              animationDelay: `${Math.min(0.15 + entries.length * 0.05 + 0.05, 0.45)}s`,
            }}
          >
            <Plus size={18} strokeWidth={1.6} />
            <span style={{ fontFamily: fSerif, fontSize: 16, fontStyle: 'italic' }}>Add a recipe</span>
          </button>
        </div>
      )}

      {/* ── Shopping list tab ────────────────────────────── */}
      {!loading && tab === 'shopping' && (
        <div>
          {/* Empty state */}
          {combined.length === 0 && (
            <div
              className="text-center py-14"
              style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}
            >
              <div className="flex justify-center" style={{ color: 'var(--muted)' }}>
                <ShoppingCart size={40} strokeWidth={1.2} />
              </div>
              <p
                className="mt-4"
                style={{ fontFamily: fSerif, fontSize: 21, letterSpacing: '-0.015em', color: 'var(--text)' }}
              >
                {entries.length === 0 ? 'No meals added yet' : 'All meals cooked'}
              </p>
              <p className="mt-1" style={{ fontFamily: fSans, fontSize: 14, color: 'var(--muted)' }}>
                {entries.length === 0
                  ? 'Add some meals to generate a shopping list.'
                  : 'All meals are marked as cooked — nothing to shop for.'}
              </p>
            </div>
          )}

          {/* Progress summary */}
          {combined.length > 0 && (
            <div
              className="flex items-baseline justify-between"
              style={{
                paddingBottom: 14,
                marginBottom: 22,
                borderBottom: '1px solid var(--border)',
                animation: 'fadeUp 0.4s ease 0.15s both',
              }}
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
            <p
              className="text-center py-2 mb-2"
              style={{ fontFamily: fSerif, fontStyle: 'italic', fontSize: 14, color: 'var(--green)' }}
            >
              Categorising ingredients…
            </p>
          )}

          {/* Category groups */}
          {groupedByCategory.map((group, groupIndex) => (
            <div
              key={group.category}
              style={{
                marginBottom: 26,
                animation: 'fadeUp 0.4s ease both',
                animationDelay: `${Math.min(0.2 + groupIndex * 0.05, 0.45)}s`,
              }}
            >
              {/* Editorial category header: roman numeral + serif name + mono count */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  paddingBottom: 8,
                  borderBottom: '1px solid var(--border)',
                  marginBottom: 2,
                }}
              >
                <span style={{ fontFamily: fSerif, fontStyle: 'italic', color: 'var(--green)', fontSize: 13 }}>
                  {toRoman(groupIndex + 1)}.
                </span>
                <h3
                  style={{
                    margin: 0,
                    fontFamily: fSerif,
                    fontSize: 18,
                    fontWeight: 400,
                    letterSpacing: '-0.015em',
                    color: 'var(--text)',
                    flex: 1,
                  }}
                >
                  {group.category}
                </h3>
                <span style={{ fontFamily: fMono, fontSize: 11, color: 'var(--muted)' }}>
                  {group.items.length}
                </span>
              </div>

              {/* Items — hairline-divided rows on the paper */}
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
                      {/* Square editorial checkbox */}
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

                      {/* Item name (serif) */}
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

                      {/* Quantity (mono) */}
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

                      {/* Chevron — tap to expand, does not tick */}
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
                          style={{
                            transition: 'transform 0.2s ease',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            display: 'block',
                          }}
                        />
                      </button>
                    </div>

                    {/* Expanded recipe sources */}
                    {isExpanded && (
                      <div style={{ padding: '2px 0 12px 59px' }}>
                        {ing.sources.map((src, si) => (
                          <div
                            key={`${src.recipeId}-${si}`}
                            className="flex items-center justify-between py-1.5"
                          >
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

      <AddRecipeModal
        open={showAddModal}
        existingRecipeIds={existingRecipeIds}
        onAdd={(recipe) => {
          handleAddRecipe(recipe);
        }}
        onClose={() => setShowAddModal(false)}
      />
    </div>
  );
}
