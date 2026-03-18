import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, Tag } from '@recipe-aggregator/shared';
import RecipeCard from '../components/RecipeCard';

interface RecipeTagRow {
  recipe_id: string;
  tag_id: string;
}

export default function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [recipeTags, setRecipeTags] = useState<RecipeTagRow[]>([]);
  const [activeTagIds, setActiveTagIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [showFavouritesOnly, setShowFavouritesOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const usedTagIds = new Set(recipeTags.map((rt) => rt.tag_id));
  const usedTags = tags.filter((t) => usedTagIds.has(t.id));

  function handleToggleFavourite(recipeId: string, newValue: boolean) {
    setRecipes((prev) =>
      prev.map((r) => (r.id === recipeId ? { ...r, is_favourite: newValue } : r))
    );
  }

  const filteredRecipes = recipes.filter((r) => {
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

  return (
    <>
      {/* Page header */}
      <div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5"
        style={{ animation: 'fadeUp 0.4s ease both' }}
      >
        <div>
          <h1 className="rf-heading text-2xl font-bold" style={{ color: 'var(--text)' }}>
            My Recipes
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {filteredRecipes.length} recipe{filteredRecipes.length !== 1 ? 's' : ''}
            {showFavouritesOnly && ' · favourites only'}
            {activeTagIds.size > 0 && ` · ${activeTagIds.size} tag${activeTagIds.size !== 1 ? 's' : ''} active`}
          </p>
        </div>
        <Link to="/new" className="rf-btn rf-btn-filled shrink-0">
          + New Recipe
        </Link>
      </div>

      {/* Search + filter card */}
      <div
        className="rf-card mb-6"
        style={{ padding: 16, animation: 'fadeUp 0.4s ease 0.1s both' }}
      >
        <div className="flex items-center gap-3">
          {/* Search input with icon */}
          <div className="relative flex-1">
            <svg
              className="absolute top-1/2 -translate-y-1/2"
              style={{ left: 12, color: 'var(--muted)' }}
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
              placeholder="Search recipes by title or ingredient..."
              className="rf-input w-full"
              style={{ paddingLeft: 36 }}
            />
          </div>

          {/* Favourite toggle */}
          <button
            onClick={() => setShowFavouritesOnly((prev) => !prev)}
            className="shrink-0 flex items-center justify-center w-10 h-10 rounded-lg transition-colors"
            style={
              showFavouritesOnly
                ? { background: '#fef2f0', border: '1px solid #f5c6c0', color: 'var(--red)' }
                : { background: 'var(--card)', border: '1px solid var(--border)', color: 'var(--muted)' }
            }
            aria-label={showFavouritesOnly ? 'Show all recipes' : 'Show favourites only'}
            title={showFavouritesOnly ? 'Show all recipes' : 'Show favourites only'}
          >
            <svg
              width={20}
              height={20}
              viewBox="0 0 24 24"
              fill={showFavouritesOnly ? 'currentColor' : 'none'}
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
          </button>
        </div>

        {/* Tag filters inside card */}
        {usedTags.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 12, paddingTop: 12 }}>
            <div className="flex flex-wrap gap-2">
              {usedTags.map((tag) => (
                <button
                  key={tag.id}
                  onClick={() =>
                    setActiveTagIds((prev) => {
                      const next = new Set(prev);
                      if (next.has(tag.id)) next.delete(tag.id);
                      else next.add(tag.id);
                      return next;
                    })
                  }
                  className={`rf-tag cursor-pointer ${activeTagIds.has(tag.id) ? 'rf-tag-active' : ''}`}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
