import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, Tag } from '@recipe-aggregator/shared';
import RecipeCard from '../components/RecipeCard';
import RecipeCardSkeleton from '../components/RecipeCardSkeleton';
import RecipeFilterBar from '../components/RecipeFilterBar';
import { useAuth } from '../context/AuthContext';
import useRecipeFilters from '../hooks/useRecipeFilters';
import type { RecipeTagRow } from '../constants/tagMeta';

const INITIAL_COUNT = window.innerWidth < 1024 ? 8 : 12;
const PAGE_SIZE = 8;

const RECIPE_SELECT =
  'id, user_id, title, image_url, prep_time, cook_time, servings, is_favourite, created_at, ingredients';

function getGreeting(): { text: string; punctuation: string } {
  const now = new Date();
  const hour = now.getHours();
  const month = now.getMonth(); // 0-indexed
  const dayOfYear = Math.floor(
    (now.getTime() - new Date(now.getFullYear(), 0, 0).getTime()) / 86400000,
  );

  const morning: { text: string; punctuation: string }[] = [
    { text: 'Good morning', punctuation: '!' },
    { text: 'Rise and shine', punctuation: '!' },
    { text: 'Morning', punctuation: '!' },
  ];
  const afternoon: { text: string; punctuation: string }[] = [
    { text: "What's for lunch", punctuation: '?' },
    { text: 'Good afternoon', punctuation: '!' },
    { text: 'Afternoon', punctuation: '!' },
  ];
  const evening: { text: string; punctuation: string }[] = [
    { text: "What's for dinner", punctuation: '?' },
    { text: 'Good evening', punctuation: '!' },
    { text: 'Hungry yet', punctuation: '?' },
  ];

  // Australian seasonal extras
  if (month === 11 || month <= 1) {
    // Summer (Dec–Feb)
    morning.push({ text: "It's BBQ weather", punctuation: '!' });
    afternoon.push({ text: "It's BBQ weather", punctuation: '!' });
  } else if (month >= 5 && month <= 7) {
    // Winter (Jun–Aug)
    evening.push({ text: 'Perfect soup weather', punctuation: '!' });
    afternoon.push({ text: 'Perfect soup weather', punctuation: '!' });
  }

  const pool = hour < 12 ? morning : hour < 17 ? afternoon : evening;
  return pool[dayOfYear % pool.length];
}

type SortOption = 'newest' | 'oldest' | 'a-z' | 'z-a';

export default function RecipeList() {
  const { user, profile, familyMembers, loading: authLoading } = useAuth();

  // All recipes fetched so far (grows as pages load)
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recipeTags, setRecipeTags] = useState<RecipeTagRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pagination state
  const [hasMore, setHasMore] = useState(true);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  // Whether we've fetched the full dataset (needed for client-side filtering)
  const [allLoaded, setAllLoaded] = useState(false);

  const filterRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  // Track how many recipes we've fetched so far for range queries
  const fetchedCountRef = useRef(0);

  const filters = useRecipeFilters({
    recipes: showFavouritesOnly ? recipes.filter((r) => r.is_favourite) : recipes,
    tags,
    recipeTags,
    userId: user?.id,
    searchQuery,
  });

  // Whether any filter/search is active
  const hasAnyFilter =
    filters.hasActiveFilter || searchQuery !== '' || showFavouritesOnly || sortBy !== 'newest';

  // Fetch the full dataset (called when a filter/sort is activated before all recipes are loaded)
  const fetchAllRemaining = useCallback(async () => {
    if (allLoaded) return;
    const from = fetchedCountRef.current;
    const { data, error: err } = await supabase
      .from('recipes')
      .select(RECIPE_SELECT)
      .order('created_at', { ascending: false })
      .range(from, 9999); // large upper bound — fetches everything remaining
    if (!err && data) {
      setRecipes((prev) => [...prev, ...(data as Recipe[])]);
      fetchedCountRef.current += data.length;
      setHasMore(false);
      setAllLoaded(true);
    }
  }, [allLoaded]);

  // Initial data fetch — wait until auth has settled so we don't fire
  // queries before the Supabase session is hydrated (would return nothing
  // under RLS and force a re-fetch).
  useEffect(() => {
    if (authLoading) return;
    async function fetchData() {
      const to = INITIAL_COUNT - 1;
      const [recipesResult, tagsResult, recipeTagsResult, countResult] = await Promise.all([
        supabase
          .from('recipes')
          .select(RECIPE_SELECT)
          .order('created_at', { ascending: false })
          .range(0, to),
        supabase.from('tags').select('*').order('name'),
        supabase.from('recipe_tags').select('recipe_id, tag_id'),
        supabase.from('recipes').select('id', { count: 'exact', head: true }),
      ]);

      if (recipesResult.error) {
        setError(recipesResult.error.message);
      } else {
        const fetched = recipesResult.data as Recipe[];
        setRecipes(fetched);
        fetchedCountRef.current = fetched.length;

        const total = countResult.count ?? null;
        setTotalCount(total);
        const exhausted = total === null || fetched.length >= total;
        setHasMore(!exhausted);
        if (exhausted) setAllLoaded(true);
      }

      if (!tagsResult.error && tagsResult.data) {
        setTags(tagsResult.data as Tag[]);
      }

      if (!recipeTagsResult.error && recipeTagsResult.data) {
        setRecipeTags(recipeTagsResult.data as RecipeTagRow[]);
      }

      setLoading(false);
    }

    fetchData();
  }, [authLoading]);

  // Fetch next page of recipes
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || allLoaded) return;
    setLoadingMore(true);
    const from = fetchedCountRef.current;
    const to = from + PAGE_SIZE - 1;
    const { data, error: err } = await supabase
      .from('recipes')
      .select(RECIPE_SELECT)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (!err && data) {
      setRecipes((prev) => [...prev, ...(data as Recipe[])]);
      fetchedCountRef.current += data.length;
      if (data.length < PAGE_SIZE || (totalCount !== null && fetchedCountRef.current >= totalCount)) {
        setHasMore(false);
        setAllLoaded(true);
      }
    }
    setLoadingMore(false);
  }, [loadingMore, hasMore, allLoaded, totalCount]);

  // IntersectionObserver — trigger loadMore when sentinel enters viewport
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { rootMargin: '200px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  // When a filter or non-default sort is activated, ensure we have all recipes
  useEffect(() => {
    if (hasAnyFilter && !allLoaded && !loading) {
      fetchAllRemaining();
    }
  }, [hasAnyFilter, allLoaded, loading, fetchAllRemaining]);

  // Close filter panel on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    if (filterOpen) document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [filterOpen]);

  function resetAllFilters() {
    filters.resetFilters();
    setSearchQuery('');
    setShowFavouritesOnly(false);
    setSortBy('newest');
  }

  function handleToggleFavourite(recipeId: string, newValue: boolean) {
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipeId ? { ...r, is_favourite: newValue } : r))
    );
  }

  // Sort
  const sortedRecipes = [...filters.filteredRecipes].sort((a, b) => {
    switch (sortBy) {
      case 'oldest':
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      case 'a-z':
        return a.title.localeCompare(b.title);
      case 'z-a':
        return b.title.localeCompare(a.title);
      default:
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    }
  });

  const hasActiveFilters = showFavouritesOnly || filters.ownerFilter !== 'all' || sortBy !== 'newest';
  const greeting = getGreeting();

  // Build a map of family member user_id -> display_name (excludes current user)
  const familyOwnerNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of familyMembers) {
      if (m.user_id !== user?.id && m.profile?.display_name) {
        map.set(m.user_id, m.profile.display_name);
      }
    }
    return map;
  }, [familyMembers, user?.id]);

  // Subtitle: total count (use server count when not all loaded yet)
  const displayTotal = allLoaded ? recipes.length : (totalCount ?? recipes.length);

  return (
    <>
      {/* Greeting header */}
      <div style={{ animation: 'fadeUp 0.4s ease both' }} className="mb-5">
        <h1
          className="rf-heading font-bold"
          style={{ color: 'var(--text)', fontSize: 26 }}
        >
          {greeting.text}{profile?.display_name ? `, ${profile.display_name}` : ''}{greeting.punctuation}
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)', minHeight: '1.25rem' }}>
          {loading
            ? 'Loading your recipes…'
            : hasAnyFilter
              ? `Showing ${sortedRecipes.length} of ${displayTotal} recipe${displayTotal !== 1 ? 's' : ''}.`
              : familyMembers.length > 1
                ? `${displayTotal} recipe${displayTotal !== 1 ? 's' : ''} in your family collection.`
                : `You have ${displayTotal} recipe${displayTotal !== 1 ? 's' : ''} saved.`
          }
        </p>
      </div>

      {/* Search bar + filter icon */}
      <div
        className="flex items-center gap-3 mb-4 relative"
        style={{ animation: 'fadeUp 0.4s ease 0.08s both', zIndex: filterOpen ? 50 : 10 }}
      >
        <div className="relative flex-1">
          <svg
            className="absolute top-1/2 -translate-y-1/2"
            style={{ left: 14, color: 'var(--muted)' }}
            width={16}
            height={16}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recipes..."
            className="rf-input w-full"
            style={{ paddingLeft: 38, background: 'var(--card)', boxShadow: 'var(--shadow-sm)' }}
          />
        </div>

        {/* Filter button */}
        <div className="relative" ref={filterRef}>
          <button
            onClick={() => setFilterOpen((prev) => !prev)}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-xl transition-colors"
            style={
              filterOpen || hasActiveFilters
                ? { background: 'var(--green-light)', border: '1px solid var(--green)', color: 'var(--green)' }
                : { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)', boxShadow: 'var(--shadow-sm)' }
            }
            aria-label="Filters"
            title="Filters"
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="8" y1="12" x2="20" y2="12" />
              <line x1="4" y1="18" x2="20" y2="18" />
              <circle cx="6" cy="6" r="2" fill="currentColor" />
              <circle cx="14" cy="12" r="2" fill="currentColor" />
              <circle cx="8" cy="18" r="2" fill="currentColor" />
            </svg>
          </button>

          {/* Filter dropdown */}
          {filterOpen && (
            <div className="rf-filter-dropdown">
              {/* Favourites toggle */}
              <button
                onClick={() => setShowFavouritesOnly((prev) => !prev)}
                className="flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors"
                style={
                  showFavouritesOnly
                    ? { background: 'var(--red-light)', color: 'var(--red)' }
                    : { color: 'var(--text)' }
                }
              >
                <svg
                  width={16}
                  height={16}
                  viewBox="0 0 24 24"
                  fill={showFavouritesOnly ? 'currentColor' : 'none'}
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
                Favourites only
              </button>

              <div style={{ borderTop: '1px solid var(--border)', margin: '6px 0' }} />

              {/* Sort options */}
              <p className="px-3 py-1 text-xs font-semibold" style={{ color: 'var(--muted)' }}>
                Sort by
              </p>
              {([
                ['newest', 'Newest first'],
                ['oldest', 'Oldest first'],
                ['a-z', 'A – Z'],
                ['z-a', 'Z – A'],
              ] as [SortOption, string][]).map(([value, label]) => (
                <button
                  key={value}
                  onClick={() => setSortBy(value)}
                  className="flex items-center gap-3 w-full px-3 py-2 rounded-lg text-sm transition-colors"
                  style={
                    sortBy === value
                      ? { background: 'var(--green-light)', color: 'var(--green)', fontWeight: 600 }
                      : { color: 'var(--text)' }
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <RecipeFilterBar
        {...filters}
        animated
        showReset={hasAnyFilter}
        onReset={resetAllFilters}
      />

      {/* Loading skeletons */}
      {loading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: INITIAL_COUNT }, (_, i) => (
            <RecipeCardSkeleton key={i} index={i} />
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <p className="text-center text-sm py-4" style={{ color: 'var(--red)' }}>
          Error: {error}
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && sortedRecipes.length === 0 && (
        <div
          className="text-center py-16"
          style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}
        >
          <span className="block text-5xl">🍽</span>
          <p className="rf-heading text-lg font-bold mt-4" style={{ color: 'var(--text)' }}>
            No recipes found
          </p>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            Try adjusting your filters or add a new recipe.
          </p>
        </div>
      )}

      {/* Card grid */}
      {!loading && !error && sortedRecipes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {sortedRecipes.map((recipe, index) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onToggleFavourite={handleToggleFavourite}
              index={index}
              ownerName={familyOwnerNames.get(recipe.user_id)}
            />
          ))}
        </div>
      )}

      {/* Infinite scroll sentinel */}
      {!loading && !error && hasMore && (
        <div ref={sentinelRef} className="h-16 flex items-center justify-center">
          {loadingMore && (
            <div
              className="w-6 h-6 rounded-full border-2 animate-spin"
              style={{ borderColor: 'var(--border)', borderTopColor: 'var(--green)' }}
            />
          )}
        </div>
      )}
    </>
  );
}
