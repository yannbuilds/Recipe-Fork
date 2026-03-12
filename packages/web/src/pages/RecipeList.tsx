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
  const [activeTagId, setActiveTagId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
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

  function getTagsForRecipe(recipeId: string): Tag[] {
    const tagIds = recipeTags
      .filter((rt) => rt.recipe_id === recipeId)
      .map((rt) => rt.tag_id);
    return tags.filter((t) => tagIds.includes(t.id));
  }

  const filteredRecipes = recipes.filter((r) => {
    if (activeTagId && !recipeTags.some((rt) => rt.recipe_id === r.id && rt.tag_id === activeTagId)) {
      return false;
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
        <Link
          to="/new"
          className="shrink-0 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          + New Recipe
        </Link>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {tags.map((tag) => (
            <button
              key={tag.id}
              onClick={() => setActiveTagId(activeTagId === tag.id ? null : tag.id)}
              className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                activeTagId === tag.id
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
          <RecipeCard key={recipe.id} recipe={recipe} tags={getTagsForRecipe(recipe.id)} />
        ))}
      </div>
    </>
  );
}
