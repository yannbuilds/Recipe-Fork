import { useEffect, useState, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, MealPlan as MealPlanType, MealPlanEntry } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import AddRecipeModal from '../components/AddRecipeModal';
import { combineIngredients } from '../utils/combineIngredients';
import { categoriseIngredients, CATEGORY_ORDER } from '../utils/categoriseIngredients';
import { getMonday, formatWeekStart, formatWeekLabel, shiftWeek } from '../utils/weekHelpers';
import { CATEGORY_EMOJI_MAP } from '../utils/ingredientEmojis';
import IngredientIcon from '../components/IngredientIcon';

type Tab = 'meals' | 'shopping';

export default function MealPlan() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
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

  // Debounce timer for persisting checked items
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Track plan ID for categorisation effect
  const lastCategorisedRef = useRef<string>('');

  const loadPlan = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const weekStr = formatWeekStart(weekStart);

    // Get or create meal plan for this week
    let { data: existing } = await supabase
      .from('meal_plans')
      .select('*')
      .eq('user_id', user.id)
      .eq('week_start', weekStr)
      .maybeSingle();

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

  // Derived data
  const uncookedEntries = entries.filter((e) => !e.is_cooked);
  const allIngredients = uncookedEntries.flatMap((e) => e.recipe?.ingredients || []);
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
    const next = !entry.is_cooked;
    setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, is_cooked: next } : e)));
    await supabase.from('meal_plan_recipes').update({ is_cooked: next }).eq('id', entryId);
  }

  const existingRecipeIds = new Set(entries.map((e) => e.recipe_id));
  const isCurrentWeek = formatWeekStart(getMonday(new Date())) === formatWeekStart(weekStart);

  return (
    <div className="space-y-5">
      {/* ── Week navigator card ──────────────────────────── */}
      <div
        className="rf-card"
        style={{ padding: '20px 24px', animation: 'fadeUp 0.4s ease both' }}
      >
        <div className="flex items-center justify-between">
          {/* Prev week circular button */}
          <button
            onClick={() => setWeekStart((prev) => shiftWeek(prev, -1))}
            className="flex items-center justify-center rounded-full transition-colors shrink-0"
            style={{
              width: 36,
              height: 36,
              border: '1px solid var(--border)',
              color: 'var(--muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--green)';
              e.currentTarget.style.color = 'var(--green)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--muted)';
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>

          <div className="text-center">
            <h2 className="rf-heading text-xl font-bold" style={{ color: 'var(--text)' }}>
              Meal Plan
            </h2>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Week of {formatWeekLabel(weekStart)}
            </p>
            {isCurrentWeek && (
              <span
                className="inline-block mt-1.5 px-3 py-0.5 rounded-full text-xs font-semibold"
                style={{ background: 'var(--green-light)', color: 'var(--green)' }}
              >
                This week
              </span>
            )}
          </div>

          {/* Next week circular button */}
          <button
            onClick={() => setWeekStart((prev) => shiftWeek(prev, 1))}
            className="flex items-center justify-center rounded-full transition-colors shrink-0"
            style={{
              width: 36,
              height: 36,
              border: '1px solid var(--border)',
              color: 'var(--muted)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = 'var(--green)';
              e.currentTarget.style.color = 'var(--green)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--border)';
              e.currentTarget.style.color = 'var(--muted)';
            }}
          >
            <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>

        {/* Progress bar */}
        {entries.length > 0 && (
          <div style={{ marginTop: 16 }}>
            <div className="flex justify-between text-xs mb-1.5" style={{ color: 'var(--muted)' }}>
              <span>{cookedCount} of {entries.length} cooked</span>
              <span>{cookedPercentage}%</span>
            </div>
            <div
              className="overflow-hidden"
              style={{ height: 8, borderRadius: 9999, background: 'var(--warm)' }}
            >
              <div
                className="rf-progress-fill"
                style={{
                  height: '100%',
                  borderRadius: 9999,
                  background: 'var(--green)',
                  width: `${cookedPercentage}%`,
                }}
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Tabs with count badges ───────────────────────── */}
      <div className="rf-tabs" style={{ animation: 'fadeUp 0.4s ease 0.1s both' }}>
        <button
          onClick={() => setTab('meals')}
          className={`rf-tab ${tab === 'meals' ? 'rf-tab-active' : ''}`}
        >
          Meals
          <span
            className="inline-flex items-center justify-center rounded-full ml-1.5"
            style={{
              minWidth: 20,
              height: 20,
              fontSize: 11,
              fontWeight: 700,
              background: tab === 'meals' ? 'var(--green)' : 'var(--border)',
              color: tab === 'meals' ? '#fff' : 'var(--muted)',
            }}
          >
            {entries.length}
          </span>
        </button>
        <button
          onClick={() => setTab('shopping')}
          className={`rf-tab ${tab === 'shopping' ? 'rf-tab-active' : ''}`}
        >
          Shopping List
          <span
            className="inline-flex items-center justify-center rounded-full ml-1.5"
            style={{
              minWidth: 20,
              height: 20,
              fontSize: 11,
              fontWeight: 700,
              background: tab === 'shopping' ? 'var(--green)' : 'var(--border)',
              color: tab === 'shopping' ? '#fff' : 'var(--muted)',
            }}
          >
            {combined.length}
          </span>
        </button>
      </div>

      {loading && (
        <p className="text-center text-sm py-8" style={{ color: 'var(--muted)' }}>Loading...</p>
      )}

      {/* ── Meals tab ────────────────────────────────────── */}
      {!loading && tab === 'meals' && (
        <div className="space-y-4">
          {entries.length === 0 && (
            <div
              className="text-center py-16"
              style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}
            >
              <span className="block text-5xl">🍳</span>
              <p className="rf-heading text-lg font-bold mt-4" style={{ color: 'var(--text)' }}>
                No meals planned yet
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                Add some recipes to plan your week.
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {entries.map((entry, index) => (
              <div
                key={entry.id}
                className="overflow-hidden"
                style={{
                  background: 'var(--card)',
                  borderRadius: 'var(--radius)',
                  boxShadow: 'var(--shadow-md)',
                  opacity: entry.is_cooked ? 0.65 : 1,
                  transition: 'opacity 0.3s, transform 0.2s',
                  animation: 'fadeUp 0.4s ease both',
                  animationDelay: `${Math.min(0.15 + index * 0.05, 0.4)}s`,
                }}
              >
                {/* Image area with overlays */}
                <div className="relative" style={{ height: 200 }}>
                  {entry.recipe?.image_url ? (
                    <img
                      src={entry.recipe.image_url}
                      alt={entry.recipe?.title}
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  ) : (
                    <div
                      className="absolute inset-0 flex items-center justify-center text-3xl"
                      style={{
                        background: 'linear-gradient(135deg, var(--warm) 0%, var(--warm-dark) 100%)',
                      }}
                    >
                      🍴
                    </div>
                  )}

                  {/* Gradient scrim */}
                  <div className="rf-scrim absolute inset-0" />

                  {/* Remove button: frosted circle */}
                  <button
                    onClick={() => handleRemove(entry.id)}
                    className="absolute top-2 right-2 flex items-center justify-center rounded-full rf-glass-dark text-white text-lg leading-none transition-colors"
                    style={{ width: 28, height: 28 }}
                    title="Remove from meal plan"
                  >
                    ×
                  </button>

                  {/* Cooked badge: top-left */}
                  {entry.is_cooked && (
                    <div
                      className="absolute top-2 left-2 px-2.5 py-1 rounded-full text-xs font-semibold text-white"
                      style={{ background: 'var(--green)' }}
                    >
                      ✓ Cooked
                    </div>
                  )}

                  {/* Title overlay: bottom, frosted glass */}
                  <div className="absolute bottom-0 left-0 right-0">
                    <div className="rf-glass" style={{ padding: '8px 12px' }}>
                      <h3
                        className={`rf-heading font-semibold text-sm ${entry.is_cooked ? 'line-through' : ''}`}
                        style={{ color: 'var(--text)' }}
                      >
                        {entry.recipe?.title}
                      </h3>
                      <div className="flex items-center gap-3 text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        {entry.recipe?.prep_time != null && <span>Prep: {entry.recipe.prep_time}m</span>}
                        {entry.recipe?.cook_time != null && <span>Cook: {entry.recipe.cook_time}m</span>}
                        {entry.recipe?.servings != null && <span>Serves {entry.recipe.servings}</span>}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Action buttons */}
                <div className="flex gap-2" style={{ padding: 12 }}>
                  <button
                    onClick={() => handleToggleCooked(entry.id)}
                    className="flex-1 text-center py-2 rounded-lg text-sm font-medium transition-colors"
                    style={
                      entry.is_cooked
                        ? { background: 'var(--green-light)', color: 'var(--green)' }
                        : { background: 'var(--warm)', color: 'var(--muted)' }
                    }
                  >
                    {entry.is_cooked ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Cooked
                      </span>
                    ) : (
                      'Mark as cooked'
                    )}
                  </button>
                  <button
                    onClick={() => navigate(`/recipe/${entry.recipe_id}`)}
                    className="flex-1 text-center py-2 rounded-lg text-sm font-medium transition-colors"
                    style={{ background: 'var(--warm)', color: 'var(--text)' }}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--border)'; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--warm)'; }}
                  >
                    View Recipe
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add recipe button */}
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full py-3 rounded-lg border-2 border-dashed text-sm font-medium transition-colors"
            style={{
              borderColor: 'var(--green)',
              color: 'var(--green)',
              animation: 'fadeUp 0.4s ease both',
              animationDelay: `${Math.min(0.15 + entries.length * 0.05 + 0.05, 0.45)}s`,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--green-light)'; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
          >
            + Add Recipe
          </button>
        </div>
      )}

      {/* ── Shopping list tab ────────────────────────────── */}
      {!loading && tab === 'shopping' && (
        <div className="space-y-4">
          {/* Empty state */}
          {combined.length === 0 && (
            <div
              className="text-center py-16"
              style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}
            >
              <span className="block text-5xl">🛒</span>
              <p className="rf-heading text-lg font-bold mt-4" style={{ color: 'var(--text)' }}>
                {entries.length === 0 ? 'No meals added yet' : 'All meals cooked'}
              </p>
              <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
                {entries.length === 0
                  ? 'Add some meals to generate a shopping list.'
                  : 'All meals are marked as cooked — nothing to shop for.'}
              </p>
            </div>
          )}

          {/* Progress summary */}
          {combined.length > 0 && (
            <div
              className="rf-card flex items-center justify-between"
              style={{ padding: '14px 16px', animation: 'fadeUp 0.4s ease 0.15s both' }}
            >
              <span className="text-sm">
                <span className="font-bold" style={{ color: 'var(--text)' }}>{checkedItems.size}</span>
                <span style={{ color: 'var(--muted)' }}> of {combined.length} items ticked</span>
              </span>
            </div>
          )}

          {categorising && combined.length > 0 && (
            <p className="text-center text-sm py-2" style={{ color: 'var(--green)' }}>
              Categorising ingredients...
            </p>
          )}

          {/* Category groups */}
          {groupedByCategory.map((group, groupIndex) => (
            <div
              key={group.category}
              style={{
                animation: 'fadeUp 0.4s ease both',
                animationDelay: `${Math.min(0.2 + groupIndex * 0.05, 0.45)}s`,
              }}
            >
              {/* Category header with emoji */}
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{CATEGORY_EMOJI_MAP[group.category] || '🛒'}</span>
                <h3
                  className="text-xs font-bold uppercase tracking-wide"
                  style={{ color: 'var(--muted)' }}
                >
                  {group.category}
                </h3>
                <span className="text-xs" style={{ color: 'var(--muted)' }}>
                  ({group.items.length})
                </span>
              </div>

              {/* Items in a single card */}
              <div className="rf-card overflow-hidden">
                {group.items.map((ing, i) => {
                  const key = `${ing.item}-${ing.unit}`;
                  const checked = checkedItems.has(key);
                  return (
                    <label
                      key={key}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer transition-colors"
                      style={{
                        borderBottom: i < group.items.length - 1 ? '1px solid var(--border)' : 'none',
                        opacity: checked ? 0.5 : 1,
                        transition: 'opacity 0.3s, background 0.15s',
                      }}
                      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--warm)'; }}
                      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = ''; }}
                    >
                      {/* Custom checkbox */}
                      <div
                        className="flex items-center justify-center shrink-0"
                        style={{
                          width: 20,
                          height: 20,
                          borderRadius: 6,
                          border: '2px solid',
                          borderColor: checked ? 'var(--green)' : 'var(--border)',
                          background: checked ? 'var(--green)' : 'transparent',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        {checked && (
                          <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </div>
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleShoppingItem(key)}
                        className="sr-only"
                      />

                      <IngredientIcon item={ing.item} />

                      {/* Item text */}
                      <span
                        className={`flex-1 text-sm ${checked ? 'line-through' : ''}`}
                        style={{ color: checked ? 'var(--muted)' : 'var(--text)' }}
                      >
                        {ing.quantity} {ing.unit}{' '}
                        <span className="font-medium">{ing.item}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
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
