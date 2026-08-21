import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { supabase } from '@recipe-aggregator/shared';
import type { MealPlanEntry, Recipe } from '@recipe-aggregator/shared';
import { useCookSession } from '../context/CookSessionContext';
import { formatWeekStart, getSunday } from '../utils/weekHelpers';
import { fMono, fSerif } from '../styles/pieKeeper';

/*
 * "Cook another recipe" — reached from the + on the cooking bar.
 *
 * This week's uncooked planned meals sit at the top, because that's where a
 * second cook almost always comes from, and picking one there carries its plan
 * row along so finishing it still ticks the meal off. Everything else in the
 * collection is searchable underneath, for the nights when the second dish was
 * never planned at all.
 */

interface Props {
  open: boolean;
  onClose: () => void;
}

interface PlannedOption {
  entryId: string;
  recipe: Recipe;
}

export default function AddToCookSheet({ open, onClose }: Props) {
  const { cooks, startCook } = useCookSession();
  const navigate = useNavigate();
  const [planned, setPlanned] = useState<PlannedOption[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);

  const cookingIds = useMemo(() => new Set(cooks.map((c) => c.recipeId)), [cooks]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    let cancelled = false;

    async function load() {
      setLoading(true);
      const weekStr = formatWeekStart(getSunday(new Date()));
      const { data: plans } = await supabase
        .from('meal_plans')
        .select('id')
        .eq('week_start', weekStr)
        .order('created_at', { ascending: true });

      const planIds = ((plans ?? []) as { id: string }[]).map((p) => p.id);
      const [entriesResult, recipesResult] = await Promise.all([
        planIds.length
          ? supabase
              .from('meal_plan_recipes')
              .select('*, recipe:recipes(*)')
              .in('meal_plan_id', planIds)
          : Promise.resolve({ data: [] as MealPlanEntry[] }),
        supabase.from('recipes').select('*').order('created_at', { ascending: false }),
      ]);

      if (cancelled) return;

      const entries = ((entriesResult.data ?? []) as MealPlanEntry[]).filter(
        (e) => e.entry_type === 'cook' && !e.is_cooked && e.recipe,
      );
      // A recipe planned twice in a week shouldn't appear twice in the list.
      const seen = new Set<string>();
      setPlanned(
        entries.reduce<PlannedOption[]>((acc, e) => {
          if (!e.recipe || seen.has(e.recipe.id)) return acc;
          seen.add(e.recipe.id);
          acc.push({ entryId: e.id, recipe: e.recipe });
          return acc;
        }, []),
      );
      setRecipes((recipesResult.data as Recipe[]) ?? []);
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  function pick(recipe: Recipe, entryId: string | null) {
    startCook({
      recipeId: recipe.id,
      mealPlanEntryId: entryId,
      title: recipe.title,
      imageUrl: recipe.image_url,
      stepCount: recipe.steps?.length ?? 0,
    });
    onClose();
    navigate(`/recipe/${recipe.id}`);
  }

  const q = query.trim().toLowerCase();
  const plannedShown = planned.filter(
    (p) => !cookingIds.has(p.recipe.id) && (!q || p.recipe.title.toLowerCase().includes(q)),
  );
  const plannedIds = new Set(plannedShown.map((p) => p.recipe.id));
  const otherShown = recipes
    .filter(
      (r) =>
        !cookingIds.has(r.id) &&
        !plannedIds.has(r.id) &&
        (!q || r.title.toLowerCase().includes(q)),
    )
    // Without a search the whole collection would bury the plan list, and this
    // is a "grab the next thing" sheet, not a browser.
    .slice(0, q ? 40 : 8);

  const row = (recipe: Recipe, entryId: string | null, key: string) => (
    <button
      key={key}
      onClick={() => pick(recipe, entryId)}
      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left"
      style={{ background: 'transparent', border: '1px solid transparent' }}
    >
      {recipe.image_url ? (
        <img
          src={recipe.image_url}
          alt=""
          className="shrink-0 object-cover"
          style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border)' }}
        />
      ) : (
        <span
          className="shrink-0 flex items-center justify-center"
          style={{
            width: 40,
            height: 40,
            borderRadius: 8,
            border: '1px solid var(--border)',
            color: 'var(--green)',
            fontFamily: fSerif,
            fontSize: 18,
            fontStyle: 'italic',
          }}
        >
          {(recipe.title.trim()[0] ?? '?').toUpperCase()}
        </span>
      )}
      <span className="flex-1 min-w-0">
        <span className="block text-sm font-semibold truncate" style={{ color: 'var(--text)' }}>
          {recipe.title}
        </span>
        {recipe.steps?.length > 0 && (
          <span style={{ display: 'block', fontFamily: fMono, fontSize: 10, color: 'var(--muted)', marginTop: 2 }}>
            {recipe.steps.length} steps
          </span>
        )}
      </span>
    </button>
  );

  const heading = (text: string) => (
    <div
      className="rf-eyebrow"
      style={{ display: 'block', margin: '10px 0 4px', paddingLeft: 12 }}
    >
      {text}
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.15s ease both' }}
    >
      <div
        className="rf-card max-w-md w-full sm:mx-4 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] sm:pb-5"
        style={{
          paddingTop: 20,
          paddingLeft: 20,
          paddingRight: 20,
          borderRadius: '20px 20px 0 0',
          animation: 'slideUp 0.2s ease both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="rf-heading text-base font-semibold" style={{ color: 'var(--text)' }}>
            Cook another recipe
          </h2>
          <button onClick={onClose} style={{ color: 'var(--muted)', fontSize: 20, lineHeight: 1 }} aria-label="Close">
            ×
          </button>
        </div>

        <div className="relative">
          <Search
            size={15}
            strokeWidth={2}
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--muted)' }}
          />
          <input
            className="rf-input w-full"
            style={{ paddingLeft: 34 }}
            placeholder="Search your recipes"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
        </div>

        {loading ? (
          <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
            Loading…
          </p>
        ) : (
          <div className="max-h-[46vh] overflow-y-auto -mx-2 px-2 mt-1">
            {plannedShown.length > 0 && (
              <>
                {heading('This week’s plan')}
                {plannedShown.map((p) => row(p.recipe, p.entryId, `plan-${p.entryId}`))}
              </>
            )}
            {otherShown.length > 0 && (
              <>
                {plannedShown.length > 0 && heading('All recipes')}
                {otherShown.map((r) => row(r, null, `all-${r.id}`))}
              </>
            )}
            {plannedShown.length === 0 && otherShown.length === 0 && (
              <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
                {q ? 'No recipes match that.' : 'Nothing left to cook.'}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
