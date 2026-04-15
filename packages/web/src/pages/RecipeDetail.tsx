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
import MyNotesModal from '../components/MyNotesModal';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&ndash;/g, '–')
    .replace(/&mdash;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&Prime;/g, '″')
    .replace(/&prime;/g, '′')
    .replace(/&deg;/g, '°')
    .replace(/&frac12;/g, '½')
    .replace(/&frac14;/g, '¼')
    .replace(/&frac34;/g, '¾')
    .replace(/&#\d+;/g, (m) => String.fromCharCode(parseInt(m.slice(2, -1), 10)));
}

function formatAuthorNotes(raw: string): React.ReactNode {
  const decoded = decodeHtmlEntities(raw);

  // Split into numbered sections (e.g. "1. Herbs – ...")
  const sections = decoded.split(/(?=\n?\d+\.\s)/);

  return sections.map((section, i) => {
    const trimmed = section.trim();
    if (!trimmed) return null;

    // Check if this section starts with a numbered point
    const numberedMatch = trimmed.match(/^(\d+\.\s*)(.+)/s);
    if (numberedMatch) {
      const [, num, rest] = numberedMatch;
      // Bold up to the first colon, or the first 5 words if no colon in first line
      const firstLine = rest.split('\n')[0];
      const colonIdx = firstLine.indexOf(':');
      let boldPart: string;
      let remainderInLine: string;
      if (colonIdx !== -1 && colonIdx < 60) {
        boldPart = firstLine.slice(0, colonIdx + 1);
        remainderInLine = firstLine.slice(colonIdx + 1);
      } else {
        const words = firstLine.split(/\s+/);
        boldPart = words.slice(0, 4).join(' ');
        remainderInLine = words.length > 4 ? ' ' + words.slice(4).join(' ') : '';
      }
      const afterFirstLine = rest.includes('\n') ? '\n' + rest.split('\n').slice(1).join('\n') : '';

      return (
        <div key={i} style={{ marginBottom: 16 }}>
          <span style={{ fontWeight: 700 }}>{num}{boldPart}</span>
          {remainderInLine}
          {afterFirstLine && (
            <span style={{ whiteSpace: 'pre-wrap' }}>{afterFirstLine}</span>
          )}
        </div>
      );
    }

    // Non-numbered block (e.g. introductory text)
    return (
      <div key={i} style={{ whiteSpace: 'pre-wrap', marginBottom: 12 }}>
        {trimmed}
      </div>
    );
  });
}

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
      if (!isNaN(n)) {
        total += n;
        parsedAny = true;
      } else {
        // Try extracting leading digits (e.g. "750g" → 750)
        const leading = p.match(/^(\d+(?:\.\d+)?)/);
        if (leading) {
          total += Number(leading[1]);
          parsedAny = true;
        }
        break; // stop after first non-pure-numeric token
      }
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
  // Preserve trailing unit suffix glued to the number (e.g. "750g" → "1500g")
  const suffixMatch = quantity.match(/[a-zA-Z]+$/);
  const suffix = suffixMatch ? suffixMatch[0] : '';
  return formatQuantity(scaled) + suffix;
}

function renderOriginalText(
  ing: Ingredient,
  originalServings: number | null,
  currentServings: number,
): React.JSX.Element {
  const text = ing.original_text!;
  const qty = ing.quantity;
  const unit = ing.unit;

  // Try to locate and scale the quantity in the original text.
  // First attempt: use the stored quantity+unit fields from the DB.
  // Fallback: parse the leading number directly from the original text.
  let matchedQty = qty;
  let matchedUnit = unit;
  let match: RegExpMatchArray | null = null;

  if (matchedQty && matchedQty !== '0') {
    const escapedQty = matchedQty.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedUnit = matchedUnit.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = matchedUnit
      ? new RegExp(`(${escapedQty}\\s*${escapedUnit})`)
      : new RegExp(`(${escapedQty})`);
    match = text.match(pattern);

    // If qty+unit didn't match, try just the quantity
    if (!match && matchedUnit) {
      match = text.match(new RegExp(`(${escapedQty})`));
      if (match) matchedUnit = '';
    }
  }

  // Fallback: parse leading number from original text when qty is missing or regex failed
  if (!match) {
    const leadingMatch = text.match(/^([\d]+(?:\s+\d+\/\d+|\s*\/\s*\d+)?(?:\.\d+)?)/);
    if (leadingMatch) {
      matchedQty = leadingMatch[1];
      matchedUnit = '';
      match = leadingMatch;
    }
  }

  if (!match || match.index === undefined) {
    return <>{text}</>;
  }

  const before = text.slice(0, match.index);
  const after = text.slice(match.index + match[0].length);
  const scaledQty = scaleQuantity(matchedQty, originalServings, currentServings);
  const boldPart = matchedUnit ? `${scaledQty} ${matchedUnit}` : scaledQty;

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
  const [showAuthorNotes, setShowAuthorNotes] = useState(false);
  const [showMyNotes, setShowMyNotes] = useState(false);
  const [myNotesSaveStatus, setMyNotesSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedServings, setSavedServings] = useState<number>(1);
  const saveNotesRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Wake Lock (keep screen on while cooking) ──────────────
  const supportsWakeLock = 'wakeLock' in navigator;
  const [isAwake, setIsAwake] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [showAwakeTooltip, setShowAwakeTooltip] = useState(false);

  // ── Description expand/collapse ─────────────────────────
  const [descExpanded, setDescExpanded] = useState(false);
  const [descTruncated, setDescTruncated] = useState(false);
  const [heroMinHeight, setHeroMinHeight] = useState(0);
  const descRef = useRef<HTMLParagraphElement>(null);
  const descRefMobile = useRef<HTMLParagraphElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

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
        const initialServings = data.custom_servings ?? data.servings ?? 1;
        setCurrentServings(initialServings);
        setSavedServings(initialServings);
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

  function updateServings(newServings: number) {
    setCurrentServings(newServings);
  }

  async function saveServings() {
    await supabase.from('recipes').update({ custom_servings: currentServings }).eq('id', id!);
    setSavedServings(currentServings);
  }

  function handleNotesUpdate(html: string) {
    clearTimeout(saveNotesRef.current);
    clearTimeout(savedTimerRef.current);
    setMyNotesSaveStatus('idle');
    saveNotesRef.current = setTimeout(async () => {
      setMyNotesSaveStatus('saving');
      const cleanHtml = html === '<p></p>' ? null : html;
      await supabase.from('recipes').update({ user_notes: cleanHtml }).eq('id', id!);
      setRecipe(prev => prev ? { ...prev, user_notes: cleanHtml } : prev);
      setMyNotesSaveStatus('saved');
      savedTimerRef.current = setTimeout(() => setMyNotesSaveStatus('idle'), 1500);
    }, 2000);
  }

  // Check if description is truncated (needs "more" button)
  // Uses two refs: descRef (desktop) and descRefMobile (mobile overlay).
  // Only the visible one will have non-zero dimensions.
  useEffect(() => {
    const el = descRef.current?.scrollHeight ? descRef.current : descRefMobile.current;
    if (!el) return;
    const lh = parseFloat(getComputedStyle(el).lineHeight) || 16;
    setDescTruncated(el.scrollHeight > lh * 2 + 2);
  }, [recipe?.description]);

  // On mobile: grow the hero to fit the overlay when description is expanded
  useEffect(() => {
    if (typeof window === 'undefined' || window.innerWidth > 768) return;
    if (!overlayRef.current) return;
    if (!descExpanded) {
      setHeroMinHeight(0);
      return;
    }
    // Give the DOM a frame to finish reflow before measuring
    requestAnimationFrame(() => {
      if (!overlayRef.current) return;
      const overlayH = overlayRef.current.getBoundingClientRect().height;
      setHeroMinHeight(Math.max(360, overlayH + 20));
    });
  }, [descExpanded]);

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
          className="rd-hero-split"
          style={{ animation: 'fadeUp 0.4s ease both' }}
        >
          {/* Desktop-only left column: title + description + attribution (top), meal plan + screen on (bottom) */}
          <div className="rd-hero-text">
            {/* Top group — centred in available space */}
            <div className="rd-hero-top-group">
              {tags.length > 0 && (
                <div className="hidden md:flex flex-wrap gap-2 mb-3">
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
              <h1
                className="font-bold leading-snug"
                style={{ fontFamily: "'Lora', serif", fontSize: 26, color: 'var(--text)' }}
              >
                {recipe.title}
              </h1>
              {recipe.description && (
                <p
                  ref={descRef}
                  className="rd-hero-desc mt-2"
                  style={{ color: 'var(--muted)', fontSize: 14 }}
                >
                  {recipe.description}
                </p>
              )}
              {(recipe.creator_name || recipe.source_url) && (
                <div
                  className="flex items-center gap-2 text-sm flex-wrap mt-6"
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
                  {recipe.author_notes && (
                    <>
                      <span style={{ color: 'var(--border)' }}>·</span>
                      <button
                        onClick={() => setShowAuthorNotes(true)}
                        className="cursor-pointer"
                        style={{
                          color: 'var(--green)',
                          background: 'var(--green-light)',
                          border: '1px solid var(--green)',
                          borderRadius: 20,
                          padding: '2px 10px',
                          font: 'inherit',
                          fontSize: '0.8em',
                          fontWeight: 600,
                          lineHeight: 1.6,
                        }}
                      >
                        📝 Author's Notes
                      </button>
                    </>
                  )}
                  <span style={{ color: 'var(--border)' }}>·</span>
                  <button
                    onClick={() => setShowMyNotes(true)}
                    className="cursor-pointer"
                    style={{
                      color: 'var(--green)',
                      background: 'var(--green-light)',
                      border: '1px solid var(--green)',
                      borderRadius: 20,
                      padding: '2px 10px',
                      font: 'inherit',
                      fontSize: '0.8em',
                      fontWeight: 600,
                      lineHeight: 1.6,
                    }}
                  >
                    📒 My Notes
                  </button>
                </div>
              )}
            </div>

            {/* Bottom group: meal plan + screen on (desktop only) */}
            <div className="flex items-center justify-between" style={{ position: 'relative', zIndex: 10 }}>
              <button
                onClick={() => setShowWeekPicker(true)}
                className="rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  background: 'var(--card)',
                  border: '1px solid var(--green)',
                  color: 'var(--green)',
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--green-light)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--card)'; }}
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
          </div>

          {/* Image (right column on desktop, full-width on mobile) */}
          <div
            className={`rd-hero relative overflow-hidden${descExpanded ? ' rd-hero-expanded' : ''}`}
            style={heroMinHeight > 0 ? { minHeight: heroMinHeight } : undefined}
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

            {/* Bottom overlay: title card (mobile only) + meta cards */}
            <div
              ref={overlayRef}
              className="rd-hero-bottom-overlay absolute bottom-0 left-0 right-0 rf-glass flex items-end justify-between gap-4"
              style={{ padding: '20px' }}
            >
              {/* Title card – visible on mobile, hidden on desktop via CSS */}
              <div className="rd-hero-title rd-hero-title-overlay">
                <h1
                  className="font-bold leading-snug"
                  style={{ fontFamily: "'Lora', serif", fontSize: 20, color: '#fff', textWrap: 'balance' }}
                >
                  {recipe.title}
                </h1>
                {recipe.description && (
                  <div className="relative mt-1">
                    <div
                      style={{ overflow: 'hidden', maxHeight: descExpanded ? 'none' : 'calc(2rem + 4px)', paddingRight: descExpanded && descTruncated ? '2.5rem' : 0 }}
                    >
                      <p
                        ref={descRefMobile}
                        className="text-xs rd-mobile-desc"
                        style={{ color: 'rgba(255,255,255,0.75)' }}
                      >
                        {recipe.description}
                      </p>
                    </div>
                    {descTruncated && (
                      <button
                        onClick={() => setDescExpanded(v => !v)}
                        className="absolute text-xs cursor-pointer"
                        style={{
                          bottom: -4,
                          right: 0,
                          color: 'rgba(255,255,255,0.75)',
                          background: descExpanded ? 'none' : `linear-gradient(to right, transparent, rgba(0,0,0,0.5) 35%)`,
                          border: 'none',
                          paddingLeft: '2rem',
                          paddingRight: 0,
                          textDecoration: 'underline',
                          textUnderlineOffset: 2,
                        }}
                      >
                        {descExpanded ? 'show less' : 'show more'}
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Meta cards */}
              <div className="rd-hero-meta flex gap-2 shrink-0">
                {recipe.prep_time != null && (
                  <div
                    className="text-center px-3 py-2"
                    style={{
                      background: 'var(--glass-card)',
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
                      background: 'var(--glass-card)',
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
                      background: 'var(--glass-card)',
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

        {/* ── Attribution (mobile only — desktop version is in the hero text column) */}
        {(recipe.creator_name || recipe.source_url) && (
          <div
            className="rd-attribution flex items-center gap-2 mt-4 text-sm flex-wrap"
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
            {recipe.author_notes && (
              <>
                <span style={{ color: 'var(--border)' }}>·</span>
                <button
                  onClick={() => setShowAuthorNotes(true)}
                  className="cursor-pointer"
                  style={{
                    color: 'var(--green)',
                    background: 'var(--green-light)',
                    border: '1px solid var(--green)',
                    borderRadius: 20,
                    padding: '2px 10px',
                    font: 'inherit',
                    fontSize: '0.8em',
                    fontWeight: 600,
                    lineHeight: 1.6,
                  }}
                >
                  📝 Author's Notes
                </button>
              </>
            )}
            <span style={{ color: 'var(--border)' }}>·</span>
            <button
              onClick={() => setShowMyNotes(true)}
              className="cursor-pointer"
              style={{
                color: 'var(--green)',
                background: 'var(--green-light)',
                border: '1px solid var(--green)',
                borderRadius: 20,
                padding: '2px 10px',
                font: 'inherit',
                fontSize: '0.8em',
                fontWeight: 600,
                lineHeight: 1.6,
              }}
            >
              📒 My Notes
            </button>
          </div>
        )}

        {/* ── Meal Plan + Screen On row (mobile only — desktop version is in the hero text column) */}
        <div
          className="rd-meal-plan-row flex items-center justify-between flex-wrap gap-3 mt-6"
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
                      background: 'var(--card)',
                      boxShadow: 'var(--shadow-sm)',
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
                <div className="mb-4">
                  <div className="flex items-center justify-between">
                    <span
                      className="text-sm font-semibold"
                      style={{ color: 'var(--green)' }}
                    >
                      {currentServings} serving{currentServings !== 1 ? 's' : ''}
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() =>
                          updateServings(Math.max(1, currentServings - 1))
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
                        onClick={() => updateServings(currentServings + 1)}
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
                  {currentServings !== savedServings && (
                    <div className="flex justify-end mt-2">
                      <button
                        onClick={saveServings}
                        className="cursor-pointer"
                        style={{
                          color: 'var(--green)',
                          background: 'var(--green-light)',
                          border: '1px solid var(--green)',
                          borderRadius: 20,
                          padding: '2px 10px',
                          font: 'inherit',
                          fontSize: '0.8em',
                          fontWeight: 600,
                          lineHeight: 1.6,
                        }}
                      >
                        Save
                      </button>
                    </div>
                  )}
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
          <div className="flex md:hidden flex-wrap gap-2 mt-8">
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
              border: '1px solid var(--red-border)',
              color: 'var(--red)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--red-light)';
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

      {/* ── Author's Notes modal ─────────────────────────────── */}
      {showAuthorNotes && recipe?.author_notes && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 50 }}
        >
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowAuthorNotes(false)}
          />
          <div
            className="rf-card relative w-full"
            style={{ maxWidth: 520, maxHeight: '80vh', overflow: 'auto', padding: 24, zIndex: 1 }}
          >
            <h2
              className="font-bold mb-4"
              style={{ fontFamily: "'Lora', serif", fontSize: 18, color: 'var(--text)' }}
            >
              Author's Notes
            </h2>
            <div className="text-sm leading-relaxed" style={{ color: 'var(--text)' }}>
              {formatAuthorNotes(recipe.author_notes)}
            </div>
            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowAuthorNotes(false)}
                className="rf-btn-secondary rounded-lg px-4 py-2 text-sm font-semibold"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── My Notes modal ──────────────────────────────────── */}
      {recipe && (
        <MyNotesModal
          open={showMyNotes}
          content={recipe.user_notes}
          onSave={handleNotesUpdate}
          onClose={() => setShowMyNotes(false)}
          saveStatus={myNotesSaveStatus}
        />
      )}

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
