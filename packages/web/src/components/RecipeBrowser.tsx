import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Heart, Plus, SlidersHorizontal, Utensils } from 'lucide-react';
import type { Recipe } from '@recipe-aggregator/shared';
import CookbookCard from './CookbookCard';
import RecipeFilterBar from './RecipeFilterBar';
import useRecipeFilters from '../hooks/useRecipeFilters';
import type { RecipeBrowserData } from '../hooks/useRecipeBrowserData';
import { useAuth } from '../context/AuthContext';
import { fSerif, fSans, fMono } from '../styles/pieKeeper';

/**
 * Home's four sort options plus the one a picker cares about most: what you
 * haven't cooked in a while. That's the default — the whole point of browsing
 * the collection is to get last month's recipes back in front of you.
 */
export type BrowseSort = 'suggested' | 'newest' | 'oldest' | 'a-z' | 'z-a';

const SORT_LABELS: [BrowseSort, string][] = [
  ['suggested', 'Not cooked lately'],
  ['newest', 'Newest first'],
  ['oldest', 'Oldest first'],
  ['a-z', 'A – Z'],
  ['z-a', 'Z – A'],
];

interface Props {
  /** Drives the reset — every time the modal opens you start fresh. */
  open: boolean;
  data: RecipeBrowserData;
  /** Recipes drawn as already chosen. */
  selectedIds?: Set<string>;
  /** Recipes left out of the list entirely. */
  excludeIds?: Set<string>;
  onSelect: (recipe: Recipe) => void;
  /** An extra line under a card — plan mode's meals pill, the picker's hint. */
  renderCardExtra?: (recipe: Recipe) => ReactNode;
  /** Sits above the All recipes / Cookbooks switch — plan mode's prefs recap. */
  topSlot?: ReactNode;
  defaultSort?: BrowseSort;
  emptyLabel?: string;
  /** Put the cursor in the search box on open. The picker wants it — you often
   *  arrive knowing the name. Plan mode doesn't; you arrive there to browse. */
  autoFocusSearch?: boolean;
}

/**
 * The one way to browse the collection from inside a modal: your whole library
 * or your cookbook shelves, the home page's search and filters over the top,
 * and a grid of plates you click to choose. Plan mode and the add-a-recipe
 * picker both render this, so they show the same thing and can never drift.
 */
export default function RecipeBrowser({
  open,
  data,
  selectedIds,
  excludeIds,
  onSelect,
  renderCardExtra,
  topSlot,
  defaultSort = 'suggested',
  emptyLabel = 'Nothing to pick here yet.',
  autoFocusSearch = false,
}: Props) {
  const { user } = useAuth();
  const {
    recipes,
    uniqueRecipes,
    tags,
    recipeTags,
    lastCooked,
    cookbooks,
    cookbookRecipes,
    pickableCookbooks,
    cookbookCovers,
    loading,
  } = data;

  const [sortBy, setSortBy] = useState<BrowseSort>(defaultSort);
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  // Two ways to look at the same collection: the whole list, or your shelves.
  // Not a filter — a mode. Cookbooks get the shelf treatment they have on the
  // Cookbook page, because browsing them is half the reason they exist.
  const [browse, setBrowse] = useState<'all' | 'cookbooks'>('all');
  const [cookbookId, setCookbookId] = useState<string | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [search, setSearch] = useState('');
  const filterRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // Same filtering the home page runs on: search across titles and ingredients,
  // owner, and the tag-category facets.
  const filters = useRecipeFilters({
    recipes: showFavouritesOnly ? uniqueRecipes.filter((r) => r.is_favourite) : uniqueRecipes,
    tags,
    recipeTags,
    userId: user?.id,
    searchQuery: search,
  });

  useEffect(() => {
    if (!open) return;
    setSortBy(defaultSort);
    setShowFavouritesOnly(false);
    setBrowse('all');
    setCookbookId(null);
    setFilterOpen(false);
    setSearch('');
    filters.resetFilters();
    if (autoFocusSearch) setTimeout(() => searchRef.current?.focus(), 50);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close the filter dropdown on an outside click, same as the home page.
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    }
    if (filterOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterOpen]);

  const activeCookbook = cookbookId ? cookbooks.find((c) => c.id === cookbookId) : undefined;

  // Everything that matches — no cap. If you have 200 recipes you see 200;
  // narrowing is the filters' job, not a silent truncation's.
  const visible = useMemo(() => {
    const hidden = (r: Recipe) => excludeIds?.has(r.id) ?? false;
    // Inside a shelf you get the shelf, least recently cooked first — the
    // recipe filters belong to the all-recipes mode and are reset on the way in.
    if (browse === 'cookbooks') {
      if (!cookbookId) return [];
      const ids = cookbookRecipes[cookbookId];
      const list = ids ? recipes.filter((r) => ids.has(r.id) && !hidden(r)) : [];
      return [...list].sort((a, b) => (lastCooked[a.id] ?? '').localeCompare(lastCooked[b.id] ?? ''));
    }
    return filters.filteredRecipes.filter((r) => !hidden(r)).sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'oldest':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'a-z':
          return a.title.localeCompare(b.title);
        case 'z-a':
          return b.title.localeCompare(a.title);
        default:
          // Longest time since you last cooked it, never-cooked first.
          return (lastCooked[a.id] ?? '').localeCompare(lastCooked[b.id] ?? '');
      }
    });
  }, [browse, cookbookId, recipes, filters.filteredRecipes, cookbookRecipes, sortBy, lastCooked, excludeIds]);

  const hasActiveFilters =
    showFavouritesOnly || filters.ownerFilter !== 'all' || sortBy !== defaultSort;
  const isNarrowed = hasActiveFilters || filters.activeCategories.size > 0 || search.trim() !== '';

  function resetAllFilters() {
    filters.resetFilters();
    setSearch('');
    setShowFavouritesOnly(false);
    setSortBy(defaultSort);
  }

  /** Switching mode is a clean slate — the other mode's controls don't linger. */
  function setMode(next: 'all' | 'cookbooks') {
    setBrowse(next);
    setCookbookId(null);
    setFilterOpen(false);
    resetAllFilters();
  }

  return (
    <div>
      {topSlot}

      {/* Two ways in: the whole collection, or your shelves. */}
      <div
        className="flex"
        style={{ gap: 4, padding: 3, marginBottom: 14, border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)' }}
      >
        {([
          ['all', 'All recipes', uniqueRecipes.length],
          ['cookbooks', 'Cookbooks', pickableCookbooks.length],
        ] as const).map(([value, label, count]) => {
          const on = browse === value;
          return (
            <button
              key={value}
              onClick={() => setMode(value)}
              style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 7,
                padding: '8px 0',
                borderRadius: 999,
                border: 'none',
                cursor: 'pointer',
                background: on ? 'var(--green-solid)' : 'transparent',
                color: on ? '#fff' : 'var(--muted)',
                fontFamily: fMono,
                fontSize: 9.5,
                letterSpacing: '0.13em',
                textTransform: 'uppercase',
              }}
            >
              {label}
              <span style={{ opacity: on ? 0.75 : 0.6 }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* ── All recipes: search + the home page's filters ───── */}
      {browse === 'all' && (
        <div className="flex items-center gap-3 relative" style={{ marginBottom: 12 }}>
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search recipes…"
            className="rf-input flex-1"
          />
          <div className="relative shrink-0" ref={filterRef}>
            <button
              onClick={() => setFilterOpen((prev) => !prev)}
              className="flex items-center justify-center w-10 h-10 rounded-xl"
              style={
                filterOpen || hasActiveFilters
                  ? { background: 'var(--green-light)', border: '1px solid var(--green)', color: 'var(--green)', cursor: 'pointer' }
                  : { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)', cursor: 'pointer' }
              }
              aria-label="Filters"
              title="Filters"
            >
              <SlidersHorizontal size={17} strokeWidth={1.8} />
            </button>

            {filterOpen && (
              <div className="rf-filter-dropdown">
                <p className="px-3 py-1 text-xs font-semibold" style={{ color: 'var(--muted)' }}>Show</p>
                {(['all', 'mine', 'shared'] as const).map((value) => {
                  const label = value === 'all' ? 'All recipes' : value === 'mine' ? 'Mine' : 'Shared';
                  return (
                    <button
                      key={value}
                      onClick={() => filters.setOwnerFilter(value)}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm"
                      style={
                        filters.ownerFilter === value
                          ? { background: 'var(--green-light)', color: 'var(--green)', fontWeight: 600, cursor: 'pointer' }
                          : { color: 'var(--text)', cursor: 'pointer' }
                      }
                    >
                      {label}
                    </button>
                  );
                })}

                <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />

                <button
                  onClick={() => setShowFavouritesOnly((prev) => !prev)}
                  className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm"
                  style={
                    showFavouritesOnly
                      ? { background: 'var(--red-light)', color: 'var(--red)', cursor: 'pointer' }
                      : { color: 'var(--text)', cursor: 'pointer' }
                  }
                >
                  <Heart size={15} strokeWidth={2} fill={showFavouritesOnly ? 'currentColor' : 'none'} />
                  Favourites only
                </button>

                <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />

                <p className="px-3 py-1 text-xs font-semibold" style={{ color: 'var(--muted)' }}>Sort by</p>
                {SORT_LABELS.map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setSortBy(value)}
                    className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm"
                    style={
                      sortBy === value
                        ? { background: 'var(--green-light)', color: 'var(--green)', fontWeight: 600, cursor: 'pointer' }
                        : { color: 'var(--text)', cursor: 'pointer' }
                    }
                  >
                    {label}
                  </button>
                ))}

                {isNarrowed && (
                  <>
                    <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />
                    <button
                      onClick={resetAllFilters}
                      className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm"
                      style={{ color: 'var(--red)', cursor: 'pointer' }}
                    >
                      Reset all filters
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {browse === 'all' && <RecipeFilterBar {...filters} />}

      {/* Always say how much of the collection you're looking at — the picker
          used to quietly stop at 60 and there was no way to tell. */}
      {browse === 'all' && !loading && (
        <p style={{ margin: '0 0 12px', fontFamily: fSans, fontSize: 12.5, color: 'var(--muted)' }}>
          {isNarrowed ? (
            <>
              Showing <strong style={{ color: 'var(--text-soft)' }}>{visible.length}</strong> of {uniqueRecipes.length} recipe
              {uniqueRecipes.length === 1 ? '' : 's'}.{' '}
              <button
                onClick={resetAllFilters}
                style={{ fontFamily: fSans, fontSize: 12.5, color: 'var(--green)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Show everything
              </button>
            </>
          ) : (
            `All ${uniqueRecipes.length} recipe${uniqueRecipes.length === 1 ? '' : 's'}${sortBy === 'suggested' ? ', least recently cooked first.' : '.'}`
          )}
        </p>
      )}

      {/* ── Cookbooks: the shelf, as it looks on the Cookbook page ───── */}
      {browse === 'cookbooks' && !activeCookbook && !loading && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {pickableCookbooks.length === 0 ? (
            <p className="text-center py-6" style={{ fontFamily: fSerif, fontStyle: 'italic', color: 'var(--muted)' }}>
              No cookbooks with recipes in them yet.
            </p>
          ) : (
            pickableCookbooks.map((cb, i) => (
              <CookbookCard
                key={cb.id}
                cookbook={cb}
                recipeCount={cookbookRecipes[cb.id]?.size ?? 0}
                coverImages={cookbookCovers[cb.id] ?? []}
                index={i}
                onSelect={() => setCookbookId(cb.id)}
              />
            ))
          )}
        </div>
      )}

      {/* Inside a shelf — back out the way you came in. */}
      {browse === 'cookbooks' && activeCookbook && (
        <div style={{ marginBottom: 14 }}>
          <button
            onClick={() => setCookbookId(null)}
            style={{ fontFamily: fMono, fontSize: 9.5, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--green)', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            ← Cookbooks
          </button>
          <h3 style={{ margin: '8px 0 0', fontFamily: fSerif, fontWeight: 400, fontSize: 22, letterSpacing: '-0.018em', color: 'var(--text)' }}>
            <span aria-hidden style={{ marginRight: 8 }}>{activeCookbook.emoji || '📗'}</span>
            {activeCookbook.name}
          </h3>
          <p style={{ margin: '5px 0 0', fontFamily: fSans, fontSize: 12.5, color: 'var(--muted)' }}>
            {visible.length} recipe{visible.length === 1 ? '' : 's'}, least recently cooked first
            {activeCookbook.description ? ` · ${activeCookbook.description}` : ''}
          </p>
        </div>
      )}

      {loading && (
        <p className="text-center py-6" style={{ fontFamily: fSerif, fontStyle: 'italic', color: 'var(--muted)' }}>Loading…</p>
      )}

      {!loading && visible.length === 0 && browse === 'all' && (
        <p className="text-center py-6" style={{ fontFamily: fSerif, fontStyle: 'italic', color: 'var(--muted)' }}>
          {isNarrowed ? 'No recipes match those filters.' : emptyLabel}
        </p>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {visible.map((recipe) => {
          const picked = selectedIds?.has(recipe.id) ?? false;
          return (
            <div key={recipe.id} style={{ position: 'relative' }}>
              <button
                onClick={() => onSelect(recipe)}
                style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
              >
                <div
                  style={{
                    position: 'relative',
                    aspectRatio: '4 / 3',
                    borderRadius: 4,
                    overflow: 'hidden',
                    background: 'var(--paper3)',
                    boxShadow: picked ? '0 0 0 2px var(--green)' : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                  }}
                >
                  {recipe.image_url ? (
                    <img src={recipe.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--muted)' }}>
                      <Utensils size={22} strokeWidth={1.3} />
                    </div>
                  )}
                  <span
                    style={{
                      position: 'absolute',
                      top: 6,
                      right: 6,
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      display: 'grid',
                      placeItems: 'center',
                      background: picked ? 'var(--green-solid)' : 'rgba(31,27,22,0.45)',
                      color: '#fff',
                    }}
                  >
                    {picked ? <Check size={12} strokeWidth={3} /> : <Plus size={12} strokeWidth={2.5} />}
                  </span>
                </div>
                <p style={{ margin: '6px 0 0', fontFamily: fSerif, fontSize: 14, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                  {recipe.title}
                </p>
              </button>

              {renderCardExtra?.(recipe)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
