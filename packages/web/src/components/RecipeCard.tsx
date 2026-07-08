import { Link } from 'react-router-dom';
import { Clock, Utensils } from 'lucide-react';
import type { Recipe } from '@recipe-aggregator/shared';
import FavouriteButton from './FavouriteButton';
import { PK, fSerif, fMono } from '../styles/pieKeeper';

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

// Editorial recipe card — photo with hairline border, serif caption below.
export default function RecipeCard({ recipe, onToggleFavourite, index = 0, ownerName }: RecipeCardProps) {
  const totalTime =
    recipe.prep_time != null && recipe.cook_time != null
      ? recipe.prep_time + recipe.cook_time
      : recipe.prep_time ?? recipe.cook_time ?? null;

  return (
    <Link
      to={`/recipe/${recipe.id}`}
      className="block"
      style={{
        color: PK.ink,
        textDecoration: 'none',
        animation: 'fadeUp 0.4s ease both',
        animationDelay: `${Math.min(index * 0.05, 0.3)}s`,
      }}
    >
      {/* Photo */}
      <div
        style={{
          position: 'relative',
          aspectRatio: '4 / 5',
          borderRadius: 4,
          overflow: 'hidden',
          background: PK.paper3,
        }}
      >
        {recipe.image_url ? (
          <img
            src={recipe.image_url}
            alt={recipe.title}
            loading={index < 4 ? 'eager' : 'lazy'}
            fetchPriority={index < 4 ? 'high' : 'auto'}
            decoding="async"
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              filter: 'saturate(0.92) contrast(1.02)',
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: PK.inkMute,
            }}
          >
            <Utensils size={34} strokeWidth={1.2} />
          </div>
        )}

        {/* Hairline border */}
        <div
          style={{ position: 'absolute', inset: 0, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)', pointerEvents: 'none' }}
        />

        {/* Family member badge: top-left */}
        {ownerName && (
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 10,
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '4px 8px',
              background: 'rgba(251,248,241,0.92)',
              backdropFilter: 'blur(6px)',
              fontFamily: fMono,
              fontSize: 9,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: PK.ink,
            }}
          >
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 15,
                height: 15,
                borderRadius: 999,
                background: PK.greenSoft,
                color: PK.greenDeep,
                fontSize: 8,
                fontWeight: 700,
              }}
            >
              {ownerName[0]?.toUpperCase()}
            </span>
            {ownerName}
          </div>
        )}

        {/* Favourite button: top-right */}
        {onToggleFavourite && (
          <div style={{ position: 'absolute', top: 10, right: 10 }}>
            <FavouriteButton
              recipeId={recipe.id}
              isFavourite={recipe.is_favourite}
              onToggle={(val) => onToggleFavourite(recipe.id, val)}
              size="sm"
            />
          </div>
        )}
      </div>

      {/* Caption */}
      <div style={{ marginTop: 10 }}>
        <h3
          className="rf-heading line-clamp-2"
          style={{ margin: 0, fontFamily: fSerif, fontWeight: 400, fontSize: 18, lineHeight: 1.15, letterSpacing: '-0.015em', color: PK.ink }}
        >
          {recipe.title}
        </h3>
        {(totalTime != null || recipe.servings != null) && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              marginTop: 6,
              fontFamily: fMono,
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: PK.inkMute,
            }}
          >
            {totalTime != null && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                <Clock size={11} strokeWidth={1.6} /> {formatTime(totalTime)}
              </span>
            )}
            {totalTime != null && recipe.servings != null && <span>·</span>}
            {recipe.servings != null && <span>{recipe.servings} serves</span>}
          </div>
        )}
      </div>
    </Link>
  );
}
