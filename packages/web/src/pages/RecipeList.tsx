import { useEffect, useRef, useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, Tag } from '@recipe-aggregator/shared';
import RecipeCard from '../components/RecipeCard';

interface RecipeTagRow {
  recipe_id: string;
  tag_id: string;
}

const CATEGORIES = [
  { label: 'Dinner', emoji: '🍽️', tag: 'dinner' },
  { label: 'Quick', emoji: '⚡', tag: 'quick' },
  { label: 'Healthy', emoji: '🥗', tag: 'healthy' },
  { label: 'Vegetarian', emoji: '🌱', tag: 'vegetarian' },
  { label: 'Pasta', emoji: '🍝', tag: 'pasta' },
  { label: 'Chicken', emoji: '🍗', tag: 'chicken' },
  { label: 'Seafood', emoji: '🐟', tag: 'seafood' },
  { label: 'Dessert', emoji: '🍰', tag: 'dessert' },
  { label: 'Baking', emoji: '🧁', tag: 'baking' },
  { label: 'Breakfast', emoji: '🥞', tag: 'breakfast' },
  { label: 'Snack', emoji: '🥜', tag: 'snack' },
  { label: 'Soup', emoji: '🍲', tag: 'soup' },
];

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return "What's for lunch";
  return "What's for dinner";
}

type SortOption = 'newest' | 'oldest' | 'a-z' | 'z-a';

export default function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recipeTags, setRecipeTags] = useState<RecipeTagRow[]>([]);
  const [activeCategories, setActiveCategories] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterOpen, setFilterOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function fetchData() {
      const [recipesResult, tagsResult, recipeTagsResult] = await Promise.all([
        supabase.from('recipes').select('*').order('created_at', { ascending: false }),
        supabase.from('tags').select('*').order('name'),
        supabase.from('recipe_tags').select('recipe_id, tag_id'),
      ]);

      if (recipesResult.error) {
        setError(recipesResult.error.message);
      } else {
        setRecipes(recipesResult.data as Recipe[]);
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
  }, []);

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

  // Build a map from tag name -> tag id for category filtering
  const tagNameToId = new Map(tags.map((t) => [t.name.toLowerCase(), t.id]));

  function handleToggleFavourite(recipeId: string, newValue: boolean) {
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipeId ? { ...r, is_favourite: newValue } : r))
    );
  }

  function toggleCategory(tagName: string) {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(tagName)) next.delete(tagName);
      else next.add(tagName);
      return next;
    });
  }

  // Convert active category names to tag IDs for filtering
  const activeTagIds = new Set(
    [...activeCategories].map((name) => tagNameToId.get(name)).filter(Boolean) as string[]
  );

  let filteredRecipes = recipes.filter((r) => {
    if (showFavouritesOnly && !r.is_favourite) return false;
    if (activeTagIds.size > 0) {
      const recipeTagIds = recipeTags.filter((rt) => rt.recipe_id === r.id).map((rt) => rt.tag_id);
      const hasAllTags = [...activeTagIds].every((tagId) => recipeTagIds.includes(tagId));
      if (!hasAllTags) return false;
    }
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const titleMatch = r.title.toLowerCase().includes(q);
      const ingredientMatch = r.ingredients.some((ing) => ing.item.toLowerCase().includes(q));
      if (!titleMatch && !ingredientMatch) return false;
    }
    return true;
  });

  // Sort
  filteredRecipes = [...filteredRecipes].sort((a, b) => {
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

  const hasActiveFilters = showFavouritesOnly || sortBy !== 'newest';

  return (
    <>
      {/* Greeting header */}
      <div style={{ animation: 'fadeUp 0.4s ease both' }} className="mb-5">
        <h1
          className="rf-heading font-bold"
          style={{ color: 'var(--text)', fontSize: 26 }}
        >
          {getGreeting()}, Yann?
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
          You have {recipes.length} recipe{recipes.length !== 1 ? 's' : ''} saved.
        </p>
      </div>

      {/* Search bar + filter icon */}
      <div
        className="flex items-center gap-3 mb-4"
        style={{ animation: 'fadeUp 0.4s ease 0.08s both' }}
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
                    ? { background: '#fef2f0', color: 'var(--red)' }
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

      {/* Category bubbles */}
      <div
        className="rf-category-scroll mb-6"
        style={{ animation: 'fadeUp 0.4s ease 0.16s both' }}
      >
        {CATEGORIES.map((cat) => (
          <button
            key={cat.tag}
            onClick={() => toggleCategory(cat.tag)}
            className={`rf-category-bubble ${activeCategories.has(cat.tag) ? 'rf-category-active' : ''}`}
          >
            <span className="rf-category-icon">{cat.emoji}</span>
            <span className="rf-category-label">{cat.label}</span>
          </button>
        ))}
      </div>

      {/* Loading */}
      {loading && (
        <p className="text-center text-sm py-12" style={{ color: 'var(--muted)' }}>
          Loading recipes...
        </p>
      )}

      {/* Error */}
      {error && (
        <p className="text-center text-sm py-4" style={{ color: 'var(--red)' }}>
          Error: {error}
        </p>
      )}

      {/* Empty state */}
      {!loading && !error && filteredRecipes.length === 0 && (
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
      {!loading && !error && filteredRecipes.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {filteredRecipes.map((recipe, index) => (
            <RecipeCard
              key={recipe.id}
              recipe={recipe}
              onToggleFavourite={handleToggleFavourite}
              index={index}
            />
          ))}
        </div>
      )}
    </>
  );
}
