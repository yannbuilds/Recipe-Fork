import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, MealPlan as MealPlanType, MealPlanEntry } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import AddRecipeModal from '../components/AddRecipeModal';
import { combineIngredients } from '../utils/combineIngredients';
import { categoriseIngredients, CATEGORY_ORDER } from '../utils/categoriseIngredients';

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatWeekStart(date: Date): string {
  return date.toISOString().split('T')[0];
}

function formatWeekLabel(date: Date): string {
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

function shiftWeek(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

type Tab = 'meals' | 'shopping';

export default function MealPlan() {
  const { user } = useAuth();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [plan, setPlan] = useState<MealPlanType | null>(null);
  const [entries, setEntries] = useState<MealPlanEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('meals');
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

  // Run categorisation when ingredients change
  useEffect(() => {
    if (!plan || combined.length === 0) return;

    // Build a fingerprint to avoid re-running unnecessarily
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

      // Persist to DB
      await supabase
        .from('meal_plans')
        .update({ shopping_categories: updated })
        .eq('id', plan!.id);
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
        .then(() => {});
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
    <div className="space-y-6">
      {/* Week navigator */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setWeekStart((prev) => shiftWeek(prev, -1))}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          &larr; Prev week
        </button>
        <div className="text-center">
          <h2 className="text-xl font-bold text-gray-900">Meal Plan</h2>
          <p className="text-sm text-gray-500">
            Week of {formatWeekLabel(weekStart)}
            {isCurrentWeek && <span className="ml-2 text-blue-600 font-medium">This week</span>}
          </p>
        </div>
        <button
          onClick={() => setWeekStart((prev) => shiftWeek(prev, 1))}
          className="text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          Next week &rarr;
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
        <button
          onClick={() => setTab('meals')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'meals' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Meals ({entries.length})
        </button>
        <button
          onClick={() => setTab('shopping')}
          className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${
            tab === 'shopping' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
          }`}
        >
          Shopping List ({combined.length})
        </button>
      </div>

      {loading && <p className="text-center text-gray-500 py-8">Loading...</p>}

      {/* Meals tab */}
      {!loading && tab === 'meals' && (
        <div className="space-y-4">
          {entries.length === 0 && (
            <p className="text-center text-gray-500 py-8">No meals planned for this week yet.</p>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className={`bg-white rounded-lg shadow-md overflow-hidden transition-opacity ${
                  entry.is_cooked ? 'opacity-60' : ''
                }`}
              >
                <div className="relative">
                  {entry.recipe?.image_url && (
                    <img
                      src={entry.recipe.image_url}
                      alt={entry.recipe?.title}
                      className="w-full h-36 object-cover"
                    />
                  )}
                </div>
                <div className="p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className={`font-semibold text-gray-900 ${entry.is_cooked ? 'line-through' : ''}`}>
                      {entry.recipe?.title}
                    </h3>
                    <button
                      onClick={() => handleRemove(entry.id)}
                      className="text-gray-400 hover:text-red-500 text-lg leading-none shrink-0"
                      title="Remove from meal plan"
                    >
                      &times;
                    </button>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    {entry.recipe?.prep_time != null && <span>Prep: {entry.recipe.prep_time}m</span>}
                    {entry.recipe?.cook_time != null && <span>Cook: {entry.recipe.cook_time}m</span>}
                    {entry.recipe?.servings != null && <span>Serves {entry.recipe.servings}</span>}
                  </div>
                  <button
                    onClick={() => handleToggleCooked(entry.id)}
                    className={`w-full text-center py-1.5 rounded-md text-sm font-medium transition-colors ${
                      entry.is_cooked
                        ? 'bg-green-100 text-green-700 hover:bg-green-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    {entry.is_cooked ? 'Cooked' : 'Mark as cooked'}
                  </button>
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={() => setShowAddModal(true)}
            className="w-full py-3 rounded-lg border-2 border-dashed border-gray-300 text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors text-sm font-medium"
          >
            + Add Recipe
          </button>
        </div>
      )}

      {/* Shopping list tab */}
      {!loading && tab === 'shopping' && (
        <div className="space-y-4">
          {combined.length === 0 && (
            <p className="text-center text-gray-500 py-8">
              {entries.length === 0
                ? 'Add some meals to generate a shopping list.'
                : 'All meals are marked as cooked.'}
            </p>
          )}

          {categorising && combined.length > 0 && (
            <p className="text-center text-sm text-blue-600 py-2">Categorising ingredients...</p>
          )}

          {groupedByCategory.map((group) => (
            <div key={group.category}>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                {group.category}
              </h3>
              <div className="space-y-1">
                {group.items.map((ing) => {
                  const key = `${ing.item}-${ing.unit}`;
                  const checked = checkedItems.has(key);
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg shadow-sm cursor-pointer transition-opacity ${
                        checked ? 'opacity-50' : ''
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleShoppingItem(key)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className={`text-sm ${checked ? 'line-through text-gray-400' : 'text-gray-700'}`}>
                        {ing.quantity} {ing.unit} <span className="font-medium">{ing.item}</span>
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
