import { Link } from 'react-router-dom';
import type { Recipe, Tag } from '@recipe-aggregator/shared';

interface RecipeCardProps {
  recipe: Recipe;
  tags?: Tag[];
}

export default function RecipeCard({ recipe, tags }: RecipeCardProps) {
  return (
    <Link
      to={`/recipe/${recipe.id}`}
      className="block bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
    >
      {recipe.image_url && (
        <img
          src={recipe.image_url}
          alt={recipe.title}
          className="w-full h-48 object-cover"
        />
      )}
      <div className="p-4 space-y-2">
        <h2 className="text-xl font-semibold text-gray-900">{recipe.title}</h2>
        {recipe.description && (
          <p className="text-gray-600 text-sm line-clamp-2">{recipe.description}</p>
        )}
        <div className="flex gap-4 text-xs text-gray-500 pt-1">
          {recipe.prep_time != null && <span>Prep: {recipe.prep_time}m</span>}
          {recipe.cook_time != null && <span>Cook: {recipe.cook_time}m</span>}
          {recipe.servings != null && <span>Serves {recipe.servings}</span>}
        </div>
        {tags && tags.length > 0 && (
          <div className="flex flex-wrap gap-1 pt-1">
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="inline-block bg-blue-100 text-blue-700 text-xs px-2 py-0.5 rounded-full"
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </Link>
  );
}
