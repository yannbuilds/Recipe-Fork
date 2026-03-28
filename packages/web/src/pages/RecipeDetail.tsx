import React, { useEffect, useRef, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import type { Recipe, Tag, Ingredient } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import WeekPickerModal from '../components/WeekPickerModal';
import FavouriteButton from '../components/FavouriteButton';
import IngredientIcon from '../components/IngredientIcon';
import VideoPlayer from '../components/VideoPlayer';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function parseFraction(q: string): number | null {
  const parts = q.trim().split(/\s+/);
  let total = 0;
  let parsedAny = false;
  for (const p of parts) {
    if (p.includes('/')) {
      const [num, den] = p.split('/').map(Number);
      if (isNaN(num) || isNaN(den) || den === 0) break;
      total += num / den;
      parsedAny = true;
    } else {
      const n = Number(p);
      if (isNaN(n)) break; // stop at non-numeric parts (e.g. unit text)
      total += n;
      parsedAny = true;
    }
  }
  return parsedAny ? total : null;
}

const COMMON_FRACTIONS: [number, string][] = [
  [0.125, '1/8'], [0.25, '1/4'], [0.333, '1/3'], [0.5, '1/2'],
  [0.667, '2/3'], [0.75, '3/4'],
];

function formatQuantity(value: number): string {
  const whole = Math.floor(value);
  const frac = value - whole;

  for (const [target, label] of COMMON_FRACTIONS) {
    if (Math.abs(frac - target) < 0.02) {
      return whole > 0 ? `${whole} ${label}` : label;
    }
  }

  if (value % 1 === 0) return String(value);
  return value.toFixed(1);
}

function scaleQuantity(
  quantity: string,
  originalServings: number | null,
  currentServings: number,
): string {
  if (!originalServings || originalServings === 0) return quantity;
  const parsed = parseFraction(quantity);
  if (parsed === null) return quantity;
  const scaled = parsed * (currentServings / originalServings);
  return formatQuantity(scaled);
}

function renderOriginalText(
  ing: Ingredient,
  originalServings: number | null,
  currentServings: number,
): React.JSX.Element {
  const text = ing.original_text!;
  const qty = ing.quantity;
  const unit = ing.unit;

  // If there's no meaningful quantity, just show the original text as-is
  if (!qty || qty === '0') {
    return <>{text}</>;
  }

  // Build a regex to locate the quantity+unit portion in the original text
  const escapedQty = qty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedUnit = unit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = unit
    ? new RegExp(`(${escapedQty}\\s*${escapedUnit})`)
    : new RegExp(`(${escapedQty})`);

  const match = text.match(pattern);
  if (!match || match.index === undefined) {
    // Fallback: show original text without bolding
    return <>{text}</>;
  }

  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const scaledQty = scaleQuantity(qty, originalServings, currentServings);
  const boldPart = unit ? `${scaledQty} ${unit}` : scaledQty;

  return (
    <>
      {before}<strong>{boldPart}</strong>{after}
    </>
  );
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
  const [usedIngredients, setUsedIngredients] = useState<Set<string>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  // ── Wake Lock (keep screen on while cooking) ──────────────
  const supportsWakeLock = 'wakeLock' in navigator;
  const [isAwake, setIsAwake] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [showAwakeTooltip, setShowAwakeTooltip] = useState(false);

  // ── Description expand/collapse ─────────────────────────
  const [descExpanded, setDescExpanded] = useState(false);
  const [descTruncated, setDescTruncated] = useState(false);
  const descRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (!supportsWakeLock) return;

    async function acquire() {
      try {
        wakeLockRef.current = await navigator.wakeLock.request('screen');
        wakeLockRef.current.addEventListener('release', () => {
          wakeLockRef.current = null;
        });
      } catch {
        // Wake lock request can fail if tab isn't visible yet –
        // the visibilitychange handler will re-acquire when it is.
      }
    }

    if (isAwake) {
      acquire();
    } else {
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    }

    return () => {
      wakeLockRef.current?.release();
      wakeLockRef.current = null;
    };
  }, [isAwake, supportsWakeLock]);

  // Re-acquire wake lock when tab becomes visible again
  useEffect(() => {
    if (!supportsWakeLock) return;

    const handleVisibility = async () => {
      if (document.visibilityState === 'visible' && isAwake && !wakeLockRef.current) {
        try {
          wakeLockRef.current = await navigator.wakeLock.request('screen');
        } catch {
          // ignore
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [isAwake, supportsWakeLock]);

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

  // Check if description is truncated (needs "more" button)
  useEffect(() => {
    const el = descRef.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
    setDescTruncated(el.scrollHeight > lh * 2 + 2);
  }, [recipe?.description]);

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

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div>
        {/* ── Hero ───────────────────────────────────────────────── */}
        <div
          className={`rd-hero relative overflow-hidden${descExpanded ? ' rd-hero-expanded' : ''}`}
          style={{
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
          <div
            className="absolute bottom-0 left-0 right-0 rf-glass flex items-end justify-between gap-4"
            style={{ padding: '32px 20px 20px' }}
          >
            {/* Title card */}
            <div className="rd-hero-title">
              <h1
                className="font-bold leading-snug"
                style={{ fontFamily: "'Lora', serif", fontSize: 20, color: 'var(--text)' }}
              >
                {recipe.title}
              </h1>
              {recipe.description && (
                <>
                  <div
                    className="relative mt-1"
                    style={{ overflow: 'hidden', maxHeight: descExpanded ? 'none' : '2rem' }}
                  >
                    <p
                      ref={descRef}
                      className="text-xs"
                      style={{ color: 'var(--muted)' }}
                    >
                      {recipe.description}
                    </p>
                    {!descExpanded && descTruncated && (
                      <button
                        onClick={() => setDescExpanded(true)}
                        className="absolute text-xs cursor-pointer"
                        style={{
                          bottom: 0,
                          right: 0,
                          color: 'var(--muted)',
                          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.92) 35%)',
                          border: 'none',
                          paddingLeft: '2rem',
                          paddingRight: 0,
                          textDecoration: 'underline',
                          textUnderlineOffset: 2,
                        }}
                      >
                        more
                      </button>
                    )}
                  </div>
                  {descExpanded && (
                    <button
                      onClick={() => setDescExpanded(false)}
                      className="text-xs mt-0.5 cursor-pointer"
                      style={{
                        color: 'var(--muted)',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        textDecoration: 'underline',
                        textUnderlineOffset: 2,
                      }}
                    >
                      less
                    </button>
                  )}
                </>
              )}
            </div>

            {/* Meta cards */}
            <div className="rd-hero-meta flex gap-2 shrink-0">
              {recipe.prep_time != null && (
                <div
                  className="text-center px-3 py-2"
                  style={{
                    background: 'rgba(255,255,255,0.78)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: 10,
                  }}
                >
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>⏱ Prep</div>
                  <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>
                    {formatTime(recipe.prep_time)}
                  </div>
                </div>
              )}
              {recipe.cook_time != null && (
                <div
                  className="text-center px-3 py-2"
                  style={{
                    background: 'rgba(255,255,255,0.78)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: 10,
                  }}
                >
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>🔥 Cook</div>
                  <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>
                    {formatTime(recipe.cook_time)}
                  </div>
                </div>
              )}
              {recipe.servings != null && (
                <div
                  className="text-center px-3 py-2"
                  style={{
                    background: 'rgba(255,255,255,0.78)',
                    backdropFilter: 'blur(12px)',
                    WebkitBackdropFilter: 'blur(12px)',
                    borderRadius: 10,
                  }}
                >
                  <div className="text-xs" style={{ color: 'var(--muted)' }}>🍽 Servings</div>
                  <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>
                    {recipe.servings}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── Mobile meta row (hidden on desktop) ─────────────────── */}
        {(recipe.prep_time != null || recipe.cook_time != null || recipe.servings != null) && (
          <div className="rd-meta-row">
            {recipe.prep_time != null && (
              <div
                className="text-center px-3 py-2 flex-1"
                style={{ background: 'var(--card)', borderRadius: 10, boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="text-xs" style={{ color: 'var(--muted)' }}>⏱ Prep</div>
                <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>
                  {formatTime(recipe.prep_time)}
                </div>
              </div>
            )}
            {recipe.cook_time != null && (
              <div
                className="text-center px-3 py-2 flex-1"
                style={{ background: 'var(--card)', borderRadius: 10, boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="text-xs" style={{ color: 'var(--muted)' }}>🔥 Cook</div>
                <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>
                  {formatTime(recipe.cook_time)}
                </div>
              </div>
            )}
            {recipe.servings != null && (
              <div
                className="text-center px-3 py-2 flex-1"
                style={{ background: 'var(--card)', borderRadius: 10, boxShadow: 'var(--shadow-sm)' }}
              >
                <div className="text-xs" style={{ color: 'var(--muted)' }}>🍽 Servings</div>
                <div className="text-sm font-bold mt-0.5" style={{ color: 'var(--text)' }}>
                  {recipe.servings}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Attribution ─────────────────────────────────────────── */}
        {(recipe.creator_name || recipe.source_url) && (
          <div
            className="flex items-center gap-2 mt-4 text-sm flex-wrap"
            style={{ color: 'var(--muted)' }}
          >
            {recipe.creator_name && (
              <span>
                👤 Recipe by <strong style={{ color: 'var(--text)' }}>{recipe.creator_name}</strong>
              </span>
            )}
            {recipe.creator_name && recipe.source_url && (
              <span style={{ color: 'var(--border)' }}>·</span>
            )}
            {recipe.source_url && (
              <a
                href={recipe.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:underline"
                style={{ color: 'var(--green)' }}
              >
                View original ↗
              </a>
            )}
          </div>
        )}

        {/* ── Meal Plan + Screen On row ─────────────────────────── */}
        <div
          className="flex items-center justify-between flex-wrap gap-3 mt-6"
          style={{ position: 'relative', zIndex: 10 }}
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

          {supportsWakeLock && (
            <div className="relative flex items-center gap-2">
              <button
                onClick={() => {
                  const next = !isAwake;
                  setIsAwake(next);
                  if (next) {
                    setShowAwakeTooltip(true);
                    setTimeout(() => setShowAwakeTooltip(false), 4000);
                  } else {
                    setShowAwakeTooltip(false);
                  }
                }}
                className="flex items-center gap-2 text-sm font-semibold"
                style={{ color: isAwake ? 'var(--green)' : 'var(--muted)', cursor: 'pointer', background: 'none', border: 'none', padding: 0 }}
              >
                <span>{isAwake ? '⚡' : '💤'} Screen on</span>
                {/* Toggle track */}
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    width: 44,
                    height: 24,
                    borderRadius: 12,
                    background: isAwake ? 'var(--green)' : 'var(--border)',
                    transition: 'background 0.25s ease',
                    padding: 2,
                    flexShrink: 0,
                  }}
                >
                  {/* Toggle thumb */}
                  <span
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: '50%',
                      background: '#fff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
                      transform: isAwake ? 'translateX(20px)' : 'translateX(0)',
                      transition: 'transform 0.25s ease',
                    }}
                  />
                </span>
              </button>

              {/* Tooltip */}
              {showAwakeTooltip && (
                <div
                  onClick={() => setShowAwakeTooltip(false)}
                  className="absolute rd-awake-tooltip top-full mt-2 rounded-lg px-4 py-3 text-xs shadow-md"
                  style={{
                    background: 'var(--text)',
                    color: 'var(--card)',
                    width: 220,
                    animation: 'fadeUp 0.2s ease both',
                    cursor: 'pointer',
                    zIndex: 9999,
                    right: 0,
                  }}
                >
                  Screen will stay on while you cook. This may use more battery.
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Two-column body ────────────────────────────────────── */}
        <div
          className="rd-grid mt-6"
          style={{ animation: 'fadeUp 0.4s ease 0.2s both' }}
        >
          {/* ─ Left: Ingredients sidebar ───────────────────────── */}
          <aside className="rd-ingredients self-start">
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
                  {group.items.map((ing, i) => {
                    const ingKey = `${group.category}::${i}`;
                    const isUsed = usedIngredients.has(ingKey);
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-3 py-2 px-1 rounded-md transition-colors select-none"
                        style={{
                          borderBottom:
                            i < group.items.length - 1
                              ? '1px solid var(--border)'
                              : undefined,
                          cursor: 'pointer',
                          opacity: isUsed ? 0.45 : 1,
                        }}
                        onClick={() => {
                          setUsedIngredients((prev) => {
                            const next = new Set(prev);
                            if (next.has(ingKey)) next.delete(ingKey);
                            else next.add(ingKey);
                            return next;
                          });
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.background = 'var(--warm)';
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.background = 'transparent';
                        }}
                      >
                        <IngredientIcon item={ing.item} />
                        {ing.original_text ? (
                          /* Full original text with quantity+unit bolded */
                          <span
                            className="flex-1 text-sm"
                            style={{ textDecoration: isUsed ? 'line-through' : 'none' }}
                          >
                            {renderOriginalText(ing, recipe.servings, currentServings)}
                          </span>
                        ) : (
                          <>
                            {/* Legacy: Name */}
                            <span
                              className="flex-1 text-sm"
                              style={{ textDecoration: isUsed ? 'line-through' : 'none' }}
                            >
                              {ing.item}
                            </span>
                            {/* Legacy: Quantity + unit */}
                            {(ing.quantity || ing.unit) && (
                              <span
                                className="text-sm font-bold shrink-0"
                                style={{
                                  color: 'var(--text)',
                                  textDecoration: isUsed ? 'line-through' : 'none',
                                }}
                              >
                                {scaleQuantity(ing.quantity, recipe.servings, currentServings)}
                                {ing.unit ? ` ${ing.unit}` : ''}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </aside>

          {/* ─ Right: Directions + Video ──────────────────────── */}
          <div className="rd-steps space-y-5">
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
                    {group.items.map((step, i) => {
                      const isDone = completedSteps.has(step.order);
                      return (
                        <div
                          key={step.order}
                          className="flex gap-4 rounded-md transition-colors select-none"
                          style={{ cursor: 'pointer' }}
                          onClick={() => {
                            setCompletedSteps((prev) => {
                              const next = new Set(prev);
                              if (next.has(step.order)) next.delete(step.order);
                              else next.add(step.order);
                              return next;
                            });
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.background = 'var(--warm)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.background = 'transparent';
                          }}
                        >
                          {/* Number column with connecting line */}
                          <div className="flex flex-col items-center shrink-0">
                            <div
                              className="flex items-center justify-center rounded-full text-xs font-bold text-white shrink-0 transition-colors"
                              style={{
                                width: 32,
                                height: 32,
                                background: isDone ? 'var(--muted)' : 'var(--green)',
                                boxShadow: isDone
                                  ? '0 0 0 4px var(--warm)'
                                  : '0 0 0 4px var(--green-light)',
                              }}
                            >
                              {isDone ? '✓' : i + 1}
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
                            style={{
                              color: 'var(--text)',
                              textDecoration: isDone ? 'line-through' : 'none',
                              opacity: isDone ? 0.45 : 1,
                            }}
                          >
                            {step.instruction}
                          </div>
                        </div>
                      );
                    })}
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
                    <VideoPlayer videoId={videoId} title={recipe.title} />
                  </div>
                );
              })()}
          </div>
        </div>

        {/* ── Tags row ───────────────────────────────────────────── */}
        {tags.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-8">
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
          className="rd-actions flex flex-wrap gap-3 mt-4"
          style={{ position: 'relative', zIndex: 1 }}
        >
          <Link
            to={`/recipe/${id}/edit`}
            className="rd-action-btn rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
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
            className="rd-action-btn rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
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

      <ConfirmModal
        open={showDeleteModal}
        title="Delete recipe"
        message="Are you sure you want to delete this recipe? This can't be undone."
        confirmLabel="Delete"
        confirmWord="delete"
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
