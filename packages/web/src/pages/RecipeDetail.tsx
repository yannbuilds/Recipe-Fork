import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, Tag } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import WeekPickerModal from '../components/WeekPickerModal';
import FavouriteButton from '../components/FavouriteButton';
import { INGREDIENT_EMOJI_MAP } from '../utils/ingredientEmojis';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getIngredientEmoji(item: string): string {
  const lower = item.toLowerCase();
  for (const [key, emoji] of Object.entries(INGREDIENT_EMOJI_MAP)) {
    if (lower.includes(key)) return emoji;
  }
  return '🥘';
}

function scaleQuantity(
  quantity: string,
  originalServings: number | null,
  currentServings: number,
): string {
  if (!originalServings || originalServings === 0) return quantity;
  const parsed = parseFloat(quantity);
  if (isNaN(parsed)) return quantity;
  const scaled = parsed * (currentServings / originalServings);
  return scaled % 1 === 0 ? String(scaled) : scaled.toFixed(1);
}

function formatTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}min` : `${h}h`;
}

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'Source';
  }
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [currentServings, setCurrentServings] = useState<number>(1);

  useEffect(() => {
    async function fetchRecipe() {
      const [recipeResult, tagsResult] = await Promise.all([
        supabase.from('recipes').select('*').eq('id', id!).single(),
        supabase.from('recipe_tags').select('tags(*)').eq('recipe_id', id!),
      ]);

      if (recipeResult.error) {
        setError(recipeResult.error.message);
      } else {
        const data = recipeResult.data as Recipe;
        setRecipe(data);
        if (data.servings) setCurrentServings(data.servings);
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
    setShowDeleteModal(false);
    const { error } = await supabase.from('recipes').delete().eq('id', id!);
    if (error) {
      setError(error.message);
    } else {
      navigate('/');
    }
  }


  /* Loading / error states */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--muted)' }}>Loading recipe...</p>
      </div>
    );
  }

  if (error || !recipe) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--bg)' }}>
        <p style={{ color: 'var(--red)' }}>{error ?? 'Recipe not found.'}</p>
        <Link to="/" style={{ color: 'var(--green)' }} className="hover:underline text-sm">
          &larr; Back to recipes
        </Link>
      </div>
    );
  }

  /* Grouping logic (preserved) */
  const sortedSteps = [...recipe.steps].sort((a, b) => a.order - b.order);

  const hasIngredientCategories = recipe.ingredients.some((ing) => ing.category);
  const ingredientGroups: { category: string; items: typeof recipe.ingredients }[] = [];
  if (hasIngredientCategories) {
    for (const ing of recipe.ingredients) {
      const cat = ing.category || '';
      const existing = ingredientGroups.find((g) => g.category === cat);
      if (existing) {
        existing.items.push(ing);
      } else {
        ingredientGroups.push({ category: cat, items: [ing] });
      }
    }
  }

  const hasStepCategories = sortedSteps.some((s) => s.category);
  const stepGroups: { category: string; items: typeof sortedSteps }[] = [];
  if (hasStepCategories) {
    for (const step of sortedSteps) {
      const cat = step.category || '';
      const existing = stepGroups.find((g) => g.category === cat);
      if (existing) {
        existing.items.push(step);
      } else {
        stepGroups.push({ category: cat, items: [step] });
      }
    }
  }

  const allIngredients = hasIngredientCategories
    ? ingredientGroups
    : [{ category: '', items: recipe.ingredients }];

  const allSteps = hasStepCategories
    ? stepGroups
    : [{ category: '', items: sortedSteps }];

  /* Total time */
  const totalTime =
    recipe.prep_time != null && recipe.cook_time != null
      ? recipe.prep_time + recipe.cook_time
      : recipe.prep_time ?? recipe.cook_time ?? null;

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* ── Sticky nav ─────────────────────────────────────────────── */}
      <nav
        className="sticky top-0 z-50"
        style={{
          height: 56,
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          borderBottom: '1px solid var(--border)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        <div
          className="mx-auto h-full flex items-center justify-between"
          style={{ maxWidth: 1100, padding: '0 24px' }}
        >
          <Link
            to="/"
            className="text-sm hover:underline"
            style={{ color: 'var(--muted)' }}
          >
            &larr; Back to recipes
          </Link>
          <span
            className="text-sm font-bold"
            style={{ fontFamily: "'Lora', serif", color: 'var(--text)' }}
          >
            Recipe Fork
          </span>
        </div>
      </nav>

      {/* ── Page wrapper ───────────────────────────────────────────── */}
      <div
        className="mx-auto"
        style={{ maxWidth: 1100, padding: '28px 24px 64px' }}
      >
        {/* ── Hero ───────────────────────────────────────────────── */}
        <div
          className="relative overflow-hidden"
          style={{
            height: 400,
            borderRadius: 'var(--radius)',
            animation: 'fadeUp 0.4s ease both',
          }}
        >
          {/* Image or placeholder */}
          {recipe.image_url ? (
            <img
              src={recipe.image_url}
              alt={recipe.title}
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, var(--warm) 0%, var(--warm-dark) 100%)' }}
            >
              <span className="text-6xl">🍴</span>
            </div>
          )}

          {/* Gradient scrim */}
          <div
            className="absolute inset-0"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.15) 50%, transparent 100%)',
            }}
          />

          {/* Top-right: source badge + favourite */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white px-3 py-1.5 rounded-full"
                style={{
                  background: 'rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(12px)',
                  WebkitBackdropFilter: 'blur(12px)',
                }}
              >
                {getDomain(recipe.source_url)}
              </a>
            )}
            <FavouriteButton
              recipeId={recipe.id}
              isFavourite={recipe.is_favourite}
              onToggle={(val) =>
                setRecipe((prev) => (prev ? { ...prev, is_favourite: val } : prev))
              }
              size="md"
            />
          </div>

          {/* Bottom overlay: title card + meta cards */}
          <div className="absolute bottom-5 left-5 right-5 flex items-end justify-between gap-4">
            {/* Title card */}
            <div
              className="px-5 py-4"
              style={{
                background: 'rgba(255,255,255,0.93)',
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: 10,
                maxWidth: '55%',
              }}
            >
              <h1
                className="font-bold leading-snug"
                style={{ fontFamily: "'Lora', serif", fontSize: 20, color: 'var(--text)' }}
              >
                {recipe.title}
              </h1>
              {recipe.description && (
                <p
                  className="text-xs mt-1 line-clamp-2"
                  style={{ color: 'var(--muted)' }}
                >
                  {recipe.description}
                </p>
              )}
            </div>

            {/* Meta cards */}
            <div className="flex gap-2 shrink-0">
              {totalTime != null && (
                <div
                  className="text-center px-3 py-2"
                  style={{
                    background: 'rgba(255,255,255,0.93)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: 10,
                  }}
                >
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>
                    ⏱ Prep time
                  </div>
                  <div
                    className="text-sm font-bold mt-0.5"
                    style={{ color: 'var(--text)' }}
                  >
                    {formatTime(totalTime)}
                  </div>
                </div>
              )}
              {recipe.servings != null && (
                <div
                  className="text-center px-3 py-2"
                  style={{
                    background: 'rgba(255,255,255,0.93)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: 10,
                  }}
                >
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>
                    🍽 Servings
                  </div>
                  <div
                    className="text-sm font-bold mt-0.5"
                    style={{ color: 'var(--text)' }}
                  >
                    {recipe.servings}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Tags row ───────────────────────────────────────────── */}
        {tags.length > 0 && (
          <div
            className="flex flex-wrap gap-2 mt-5"
            style={{ animation: 'fadeUp 0.4s ease 0.1s both' }}
          >
            {tags.map((tag) => (
              <span
                key={tag.id}
                className="text-xs px-3 py-1 rounded-full"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--border)',
                  color: 'var(--muted)',
                }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}

        {/* ── Action buttons ─────────────────────────────────────── */}
        <div
          className="flex flex-wrap gap-3 mt-5"
          style={{ animation: 'fadeUp 0.4s ease 0.15s both' }}
        >
          <button
            onClick={() => setShowWeekPicker(true)}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--green)',
              color: 'var(--green)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--green-light)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--card)';
            }}
          >
            + Meal Plan
          </button>
          <Link
            to={`/recipe/${id}/edit`}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              background: 'var(--card)',
              border: '1px solid var(--border)',
              color: 'var(--text)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--warm)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--card)';
            }}
          >
            Edit
          </Link>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
            style={{
              background: 'var(--card)',
              border: '1px solid #f5c6c0',
              color: 'var(--red)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#fef2f0';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'var(--card)';
            }}
          >
            Delete
          </button>
        </div>

        {/* ── Two-column body ────────────────────────────────────── */}
        <div
          className="rd-grid mt-6"
          style={{ animation: 'fadeUp 0.4s ease 0.2s both' }}
        >
          {/* ─ Left: Ingredients sidebar ───────────────────────── */}
          <aside className="self-start" style={{ position: 'sticky', top: 72 }}>
            <div
              style={{
                background: 'var(--card)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-md)',
                padding: 20,
              }}
            >
              {/* Heading row */}
              <div className="mb-2">
                <h2
                  className="text-lg font-bold"
                  style={{ fontFamily: "'Lora', serif" }}
                >
                  Ingredients
                </h2>
              </div>

              {/* Serving row */}
              {recipe.servings != null && (
                <div className="flex items-center justify-between mb-4">
                  <span
                    className="text-sm font-semibold"
                    style={{ color: 'var(--green)' }}
                  >
                    {currentServings} serving{currentServings !== 1 ? 's' : ''}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        setCurrentServings((s) => Math.max(1, s - 1))
                      }
                      className="flex items-center justify-center text-sm font-bold transition-colors"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--muted)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--green)';
                        e.currentTarget.style.color = 'var(--green)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.color = 'var(--muted)';
                      }}
                    >
                      −
                    </button>
                    <button
                      onClick={() => setCurrentServings((s) => s + 1)}
                      className="flex items-center justify-center text-sm font-bold transition-colors"
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 8,
                        border: '1px solid var(--border)',
                        background: 'var(--card)',
                        color: 'var(--muted)',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = 'var(--green)';
                        e.currentTarget.style.color = 'var(--green)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = 'var(--border)';
                        e.currentTarget.style.color = 'var(--muted)';
                      }}
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* Ingredient rows */}
              {allIngredients.map((group) => (
                <div key={group.category} className="mb-3 last:mb-0">
                  {group.category && (
                    <h3
                      className="text-sm font-bold mb-2"
                      style={{ color: 'var(--text)' }}
                    >
                      {group.category}
                    </h3>
                  )}
                  {group.items.map((ing, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-3 py-2 px-1 rounded-md transition-colors"
                      style={{
                        borderBottom:
                          i < group.items.length - 1
                            ? '1px solid var(--border)'
                            : undefined,
                        cursor: 'default',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'var(--warm)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'transparent';
                      }}
                    >
                      {/* Emoji icon */}
                      <span
                        className="flex items-center justify-center shrink-0 rounded-md text-sm"
                        style={{
                          width: 28,
                          height: 28,
                          background: 'var(--warm)',
                        }}
                      >
                        {getIngredientEmoji(ing.item)}
                      </span>
                      {/* Name */}
                      <span className="flex-1 text-sm">{ing.item}</span>
                      {/* Quantity + unit */}
                      {(ing.quantity || ing.unit) && (
                        <span className="text-sm font-bold shrink-0" style={{ color: 'var(--text)' }}>
                          {scaleQuantity(ing.quantity, recipe.servings, currentServings)}
                          {ing.unit ? ` ${ing.unit}` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          {/* ─ Right: About + Directions ──────────────────────── */}
          <div className="space-y-5">
            {/* About card */}
            <div
              style={{
                background: 'var(--card)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-md)',
                padding: 24,
              }}
            >
              <h2
                className="text-lg font-bold mb-3"
                style={{ fontFamily: "'Lora', serif" }}
              >
                About this recipe
              </h2>
              {recipe.description && (
                <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                  {recipe.description}
                </p>
              )}

              {/* Original creator attribution */}
              {(recipe.creator_name || recipe.source_url) && (
                <div className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
                  {recipe.creator_name && (
                    <span>
                      👤 Original recipe by <strong style={{ color: 'var(--text)' }}>{recipe.creator_name}</strong>
                    </span>
                  )}
                  {recipe.source_url && (
                    <a
                      href={recipe.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline block mt-1"
                      style={{ color: 'var(--green)' }}
                    >
                      View original recipe ↗
                    </a>
                  )}
                </div>
              )}

              {/* Stats tiles */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {recipe.prep_time != null && (
                  <div
                    className="rounded-lg p-3 text-center"
                    style={{ background: 'var(--warm)' }}
                  >
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      Prep time
                    </div>
                    <div className="text-sm font-bold mt-1">
                      {formatTime(recipe.prep_time)}
                    </div>
                  </div>
                )}
                {recipe.cook_time != null && (
                  <div
                    className="rounded-lg p-3 text-center"
                    style={{ background: 'var(--warm)' }}
                  >
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      Cook time
                    </div>
                    <div className="text-sm font-bold mt-1">
                      {formatTime(recipe.cook_time)}
                    </div>
                  </div>
                )}
                {recipe.servings != null && (
                  <div
                    className="rounded-lg p-3 text-center"
                    style={{ background: 'var(--warm)' }}
                  >
                    <div className="text-xs" style={{ color: 'var(--muted)' }}>
                      Servings
                    </div>
                    <div className="text-sm font-bold mt-1">
                      {recipe.servings}
                    </div>
                  </div>
                )}
              </div>

              {/* Attribution removed – now shown under description */}
            </div>

            {/* Directions card */}
            <div
              style={{
                background: 'var(--card)',
                borderRadius: 'var(--radius)',
                boxShadow: 'var(--shadow-md)',
                padding: 24,
              }}
            >
              <h2
                className="text-lg font-bold mb-5"
                style={{ fontFamily: "'Lora', serif" }}
              >
                Directions
              </h2>

              {allSteps.map((group) => {
                // Flatten a global step counter per group for display
                return (
                  <div key={group.category} className="mb-5 last:mb-0">
                    {group.category && (
                      <h3
                        className="uppercase tracking-wide text-xs font-bold mb-3"
                        style={{ color: 'var(--muted)' }}
                      >
                        {group.category}
                      </h3>
                    )}
                    {group.items.map((step, i) => (
                      <div key={step.order} className="flex gap-4">
                        {/* Number column with connecting line */}
                        <div className="flex flex-col items-center shrink-0">
                          <div
                            className="flex items-center justify-center rounded-full text-xs font-bold text-white shrink-0"
                            style={{
                              width: 32,
                              height: 32,
                              background: 'var(--green)',
                              boxShadow: '0 0 0 4px var(--green-light)',
                            }}
                          >
                            {i + 1}
                          </div>
                          {i < group.items.length - 1 && (
                            <div
                              className="flex-1"
                              style={{
                                width: 2,
                                background: 'var(--green-light)',
                                minHeight: 20,
                              }}
                            />
                          )}
                        </div>
                        {/* Step text */}
                        <div
                          className="text-sm pt-1.5 pb-5"
                          style={{ color: 'var(--text)' }}
                        >
                          {step.instruction}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Video card (preserved) */}
            {recipe.video_url &&
              (() => {
                const match = recipe.video_url!.match(
                  /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
                );
                const videoId = match?.[1];
                if (!videoId) return null;
                return (
                  <div
                    style={{
                      background: 'var(--card)',
                      borderRadius: 'var(--radius)',
                      boxShadow: 'var(--shadow-md)',
                      padding: 24,
                    }}
                  >
                    <h2
                      className="text-lg font-bold mb-4"
                      style={{ fontFamily: "'Lora', serif" }}
                    >
                      Video
                    </h2>
                    <div
                      className="relative w-full overflow-hidden rounded-lg"
                      style={{ paddingBottom: '56.25%' }}
                    >
                      <iframe
                        className="absolute inset-0 w-full h-full"
                        src={`https://www.youtube.com/embed/${videoId}`}
                        title={`${recipe.title} video`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                      />
                    </div>
                  </div>
                );
              })()}
          </div>
        </div>
      </div>

      <ConfirmModal
        open={showDeleteModal}
        title="Delete recipe"
        message="Are you sure you want to delete this recipe? This can't be undone."
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setShowDeleteModal(false)}
      />

      {user && id && recipe && (
        <WeekPickerModal
          open={showWeekPicker}
          recipeId={id}
          recipeTitle={recipe.title}
          userId={user.id}
          onClose={() => setShowWeekPicker(false)}
        />
      )}
    </div>
  );
}
