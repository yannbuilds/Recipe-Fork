import { useEffect, useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe } from '@recipe-aggregator/shared';
import RecipeCard from '../components/RecipeCard';

export default function RecipeList() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecipes() {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setRecipes(data as Recipe[]);
      }
      setLoading(false);
    }

    fetchRecipes();
  }, []);

  return (
    <>
      {loading && (
        <p className="text-center text-gray-500">Loading recipes...</p>
      )}

      {error && (
        <p className="text-center text-red-600">Error: {error}</p>
      )}

      {!loading && !error && recipes.length === 0 && (
        <p className="text-center text-gray-500">No recipes found.</p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {recipes.map((recipe) => (
          <RecipeCard key={recipe.id} recipe={recipe} />
        ))}
      </div>
    </>
  );
}
