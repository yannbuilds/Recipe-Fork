import { Link } from 'react-router-dom';
import type { Recipe } from '@recipe-aggregator/shared';
import FavouriteButton from './FavouriteButton';

interface RecipeCardProps {
  recipe: Recipe;
  onToggleFavourite?: (recipeId: string, newValue: boolean) => void;
  index?: number;
  ownerName?: string;
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export default function RecipeCard({ recipe, onToggleFavourite, index = 0, ownerName }: RecipeCardProps) {
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
            loading={index < 4 ? 'eager' : 'lazy'}
            fetchPriority={index < 4 ? 'high' : 'auto'}
            decoding="async"
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

        {/* Family member badge: top-left */}
        {ownerName && (
          <div
            className="absolute top-2 left-2 flex items-center gap-1 px-2 py-0.5 rounded-full"
            style={{
              background: 'var(--glass-bg)',
              backdropFilter: 'blur(4px)',
              fontSize: 11,
              color: 'var(--muted)',
              fontWeight: 500,
            }}
          >
            <span
              className="inline-flex items-center justify-center rounded-full"
              style={{
                width: 16,
                height: 16,
                background: 'var(--border)',
                color: 'var(--text)',
                fontSize: 9,
                fontWeight: 600,
              }}
            >
              {ownerName[0]?.toUpperCase()}
            </span>
            {ownerName}
          </div>
        )}

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
          className="absolute bottom-0 left-0 right-0 rf-glass flex flex-col justify-start"
          style={{
            padding: '36px 12px 16px',
            height: 120,
            borderRadius: '0 0 var(--radius) var(--radius)',
          }}
        >
          <h2
            className="rf-heading font-semibold leading-snug line-clamp-2"
            style={{ fontSize: 18, color: 'var(--text)' }}
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
