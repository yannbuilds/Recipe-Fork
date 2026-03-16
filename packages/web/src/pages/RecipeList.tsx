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

  function getTagsForRecipe(recipeId: string): Tag[] {
    const tagIds = recipeTags
      .filter((rt) => rt.recipe_id === recipeId)
      .map((rt) => rt.tag_id);
    return tags.filter((t) => tagIds.includes(t.id));
  }

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
      <div className="flex items-center gap-4 mb-6">
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search recipes by title or ingredient..."
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          onClick={() => setShowFavouritesOnly((prev) => !prev)}
          className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-md border transition-colors ${
            showFavouritesOnly
              ? 'bg-red-50 border-red-300 text-red-500'
              : 'bg-white border-gray-300 text-gray-400 hover:text-red-400 hover:border-red-200'
          }`}
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
        <Link
          to="/new"
          className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Recipe
        </Link>
      </div>

      {usedTags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
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
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                activeTagIds.has(tag.id)
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      {loading && (
        <p className="text-center text-gray-500">Loading recipes...</p>
      )}

      {error && (
        <p className="text-center text-red-600">Error: {error}</p>
      )}

      {!loading && !error && filteredRecipes.length === 0 && (
        <p className="text-center text-gray-500">No recipes found.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredRecipes.map((recipe) => (
          <RecipeCard
            key={recipe.id}
            recipe={recipe}
            tags={getTagsForRecipe(recipe.id)}
            onToggleFavourite={handleToggleFavourite}
          />
        ))}
      </div>
    </>
  );
}
