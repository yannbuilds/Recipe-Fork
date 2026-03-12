import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, Tag } from '@recipe-aggregator/shared';

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchRecipe() {
      const [recipeResult, tagsResult] = await Promise.all([
        supabase.from('recipes').select('*').eq('id', id!).single(),
        supabase.from('recipe_tags').select('tags(*)').eq('recipe_id', id!),
      ]);

      if (recipeResult.error) {
        setError(recipeResult.error.message);
      } else {
        setRecipe(recipeResult.data as Recipe);
      }

      if (!tagsResult.error && tagsResult.data) {
        const tagList = tagsResult.data
          .map((rt: any) => rt.tags)
          .filter(Boolean) as Tag[];
        setTags(tagList);
      }

      setLoading(false);
    }

    fetchRecipe();
  }, [id]);

  async function handleDelete() {
    if (!window.confirm('Are you sure you want to delete this recipe?')) return;

    const { error } = await supabase.from('recipes').delete().eq('id', id!);
    if (error) {
      setError(error.message);
    } else {
      navigate('/');
    }
  }

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
        <div className="flex items-center justify-between">
          <Link
            to="/"
            className="inline-flex items-center text-blue-600 hover:underline text-sm"
          >
            &larr; Back to recipes
          </Link>
          <div className="flex gap-3">
            <Link
              to={`/recipe/${id}/edit`}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              Edit
            </Link>
            <button
              onClick={handleDelete}
              className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
            >
              Delete
            </button>
          </div>
        </div>

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

        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-block bg-blue-100 text-blue-700 text-sm px-3 py-1 rounded-full"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

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
