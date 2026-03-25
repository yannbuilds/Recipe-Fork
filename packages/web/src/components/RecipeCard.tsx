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
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow-md)',
        animation: 'fadeUp 0.4s ease both',
        animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
      }}
    >
      <div className="relative" style={{ aspectRatio: '3 / 4' }}>
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
          <div className="absolute top-2 right-2">
            <FavouriteButton
              recipeId={recipe.id}
              isFavourite={recipe.is_favourite}
              onToggle={(val) => onToggleFavourite(recipe.id, val)}
              size="sm"
            />
          </div>
        )}

        {/* Title + meta overlay at bottom */}
        <div
          className="absolute bottom-0 left-0 right-0 rf-glass flex flex-col"
          style={{
            padding: '10px 12px',
            minHeight: 76,
            borderRadius: '0 0 var(--radius) var(--radius)',
          }}
        >
          <h2
            className="rf-heading font-semibold leading-snug"
            style={{ fontSize: 14, color: 'var(--text)' }}
          >
            {recipe.title}
          </h2>
          {(totalTime != null || recipe.servings != null) && (
            <div className="flex items-center gap-3 mt-auto" style={{ fontSize: 12, color: 'var(--muted)' }}>
              {totalTime != null && (
                <span className="flex items-center gap-1">
                  🕐 {formatTime(totalTime)}
                </span>
              )}
              {recipe.servings != null && (
                <span className="flex items-center gap-1">
                  🍽 {recipe.servings} serves
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
