import { Link } from 'react-router-dom';
import type { Recipe } from '@recipe-aggregator/shared';
import FavouriteButton from './FavouriteButton';

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavourite?: (recipeId: string, newValue: boolean) => void;
  index?: number;
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function RecipeCard({ recipe, onToggleFavourite, index = 0 }: RecipeCardProps) {
  const totalTime =
    recipe.prep_time != null && recipe.cook_time != null
      ? recipe.prep_time + recipe.cook_time
      : recipe.prep_time ?? recipe.cook_time ?? null;

  return (
    <Link
      to={`/recipe/${recipe.id}`}
      className="block overflow-hidden rf-card-hover"
      style={{
        background: 'var(--card)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-md)',
        animation: 'fadeUp 0.4s ease both',
        animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
      }}
    >
      {/* Image area with overlays */}
      <div className="relative" style={{ aspectRatio: '4 / 3' }}>
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0 flex items-center justify-center text-5xl"
            style={{
              background: 'linear-gradient(135deg, var(--warm) 0%, var(--warm-dark) 100%)',
            }}
          >
            🍴
          </div>
        )}

        {/* Gradient scrim */}
        <div className="rf-scrim absolute inset-0" />

        {/* Favourite button: top-right */}
        {onToggleFavourite && (
          <div className="absolute top-3 right-3">
            <FavouriteButton
              recipeId={recipe.id}
              isFavourite={recipe.is_favourite}
              onToggle={(val) => onToggleFavourite(recipe.id, val)}
            />
          </div>
        )}

        {/* Meta pills: top-left */}
        <div className="absolute top-3 left-3 flex gap-1.5">
          {totalTime != null && (
            <span
              className="rf-glass-dark rounded-full text-white"
              style={{ padding: '3px 10px', fontSize: 11 }}
            >
              ⏱ {formatTime(totalTime)}
            </span>
          )}
          {recipe.servings != null && (
            <span
              className="rf-glass-dark rounded-full text-white"
              style={{ padding: '3px 10px', fontSize: 11 }}
            >
              🍽 {recipe.servings}
            </span>
          )}
        </div>

      </div>

      {/* Title & description below image */}
      <div style={{ padding: '10px 12px' }}>
        <h2
          className="rf-heading font-semibold leading-snug"
          style={{ fontSize: 15, color: 'var(--text)' }}
        >
          {recipe.title}
        </h2>
        {recipe.description && (
          <p
            className="line-clamp-2 mt-0.5"
            style={{ fontSize: 12, color: 'var(--muted)' }}
          >
            {recipe.description}
          </p>
        )}
      </div>
    </Link>
  );
}
