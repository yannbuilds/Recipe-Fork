import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe } from '@recipe-aggregator/shared';

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecipe() {
      const { data, error } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', id!)
        .single();

      if (error) {
        setError(error.message);
      } else {
        setRecipe(data as Recipe);
      }
      setLoading(false);
    }

    fetchRecipe();
  }, [id]);

  if (loading) {
    return <p className="text-center text-gray-500 py-12">Loading recipe...</p>;
  }

  if (error || !recipe) {
    return (
      <div className="text-center py-12 space-y-4">
        <p className="text-red-600">
          {error ?? 'Recipe not found.'}
        </p>
        <Link to="/" className="text-blue-600 hover:underline">
          &larr; Back to recipes
        </Link>
      </div>
    );
  }

  const sortedSteps = [...recipe.steps].sort((a, b) => a.order - b.order);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <Link
          to="/"
          className="inline-flex items-center text-blue-600 hover:underline text-sm"
        >
          &larr; Back to recipes
        </Link>

        {recipe.image_url && (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="w-full h-64 object-cover rounded-lg"
          />
        )}

        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">{recipe.title}</h1>
          {recipe.description && (
            <p className="text-gray-600">{recipe.description}</p>
          )}
        </div>

        <div className="flex gap-6 text-sm text-gray-500">
          {recipe.prep_time != null && <span>Prep: {recipe.prep_time}m</span>}
          {recipe.cook_time != null && <span>Cook: {recipe.cook_time}m</span>}
          {recipe.servings != null && <span>Serves {recipe.servings}</span>}
        </div>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Ingredients</h2>
          <ul className="list-disc list-inside space-y-1 text-gray-700">
            {recipe.ingredients.map((ing, i) => (
              <li key={i}>
                {ing.quantity} {ing.unit} {ing.item}
              </li>
            ))}
          </ul>
        </section>

        <section className="space-y-3">
          <h2 className="text-xl font-semibold text-gray-900">Steps</h2>
          <ol className="list-decimal list-inside space-y-2 text-gray-700">
            {sortedSteps.map((step) => (
              <li key={step.order}>{step.instruction}</li>
            ))}
          </ol>
        </section>

        {recipe.source_url && (
          <a
            href={recipe.source_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block text-sm text-blue-600 hover:underline"
          >
            View original source
          </a>
        )}
      </div>
    </div>
  );
}
