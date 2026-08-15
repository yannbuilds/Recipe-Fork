import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Minus, Plus, Clock, Flame, Users, Globe, FileText, Pencil, Trash2 } from 'lucide-react';
import { useParams, Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  SUB_RECIPE_SELECT,
  resolveSubRecipe,
  scaleIngredientsForServings,
  subRecipeIdsIn,
  supabase,
} from '@recipe-aggregator/shared';
import type { Recipe, SubRecipe, SubRecipeMap, Tag, Ingredient } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import ConfirmModal from '../components/ConfirmModal';
import WeekPickerModal from '../components/WeekPickerModal';
import FavouriteButton from '../components/FavouriteButton';
import IngredientIcon from '../components/IngredientIcon';
import VideoPlayer from '../components/VideoPlayer';
import MyNotesModal from '../components/MyNotesModal';
import AddToCookbookSheet from '../components/AddToCookbookSheet';
import NutritionPanel from '../components/NutritionPanel';
import RateCookModal from '../components/RateCookModal';
import { scaleQuantity } from '../utils/scaleQuantity';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

// Tracks whether the viewport is at or below the mobile breakpoint. Drives the
// tabbed ingredients/steps layout (mobile) vs the side-by-side grid (desktop).
function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint}px)`;
  const [isMobile, setIsMobile] = useState(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  );
  useEffect(() => {
    const mq = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    setIsMobile(mq.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [query]);
  return isMobile;
}

// Lowercase roman numeral for editorial group labels (i, ii, iii …).
function toRoman(n: number): string {
  const map: [number, string][] = [[10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i']];
  let out = '';
  for (const [v, s] of map) {
    while (n >= v) {
      out += s;
      n -= v;
    }
  }
  return out;
}

// Compact date for the cooked-history line: "12 Jul", with the year added
// once it's no longer this year ("12 Jul 2025").
function formatCookDate(iso: string): string {
  const d = new Date(iso);
  const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-AU', opts);
}

// Renders a title with its last word italic-accented in green — an editorial
// flourish from the mock. Single-word titles fall back to plain text.
function renderAccentedTitle(title: string): React.ReactNode {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return title;
  const last = words[words.length - 1];
  const head = words.slice(0, -1).join(' ');
  return (
    <>
      {head}{' '}
      <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>{last}</em>
    </>
  );
}

// Editorial meta card (Prep / Cook / Serves) — mono label + line icon, serif value.
function MetaCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div
      style={{
        flex: 1,
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '12px 14px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
          fontSize: 9.5,
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        {icon}
        {label}
      </div>
      <div style={{ fontFamily: '"Newsreader", Georgia, serif', fontSize: 22, color: 'var(--text)', marginTop: 4 }}>
        {value}
      </div>
    </div>
  );
}

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

/* Inline icons (no emoji) so the two primary actions read at a glance. */
function CalendarPlusIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
      <line x1="19" y1="16" x2="19" y2="22" />
      <line x1="16" y1="19" x2="22" y2="19" />
    </svg>
  );
}

function BookIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2" />
      <path d="M12 20v2" />
      <path d="m4.93 4.93 1.41 1.41" />
      <path d="m17.66 17.66 1.41 1.41" />
      <path d="M2 12h2" />
      <path d="M20 12h2" />
      <path d="m6.34 17.66-1.41 1.41" />
      <path d="m19.07 4.93-1.41 1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function RecipeDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  // Cook mode: arrived via the plan's "Cook recipe" button. Auto-enables the
  // screen-on toggle and shows a floating "Mark as cooked" action; `entry` is
  // the meal_plan_recipes row to flip when done.
  const [searchParams] = useSearchParams();
  const cookMode = searchParams.get('cook') === '1';
  const cookEntryId = searchParams.get('entry');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showWeekPicker, setShowWeekPicker] = useState(false);
  const [currentServings, setCurrentServings] = useState<number>(1);
  const [usedIngredients, setUsedIngredients] = useState<Set<string>>(new Set());
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());
  // Recipes used as an ingredient of this one, and which of those rows are
  // expanded to show their ingredients inline.
  const [subRecipes, setSubRecipes] = useState<SubRecipeMap>({});
  const [expandedSubs, setExpandedSubs] = useState<Set<string>>(new Set());
  const [mobileTab, setMobileTab] = useState<'ingredients' | 'steps'>('ingredients');
  const isMobile = useIsMobile();
  const [showAuthorNotes, setShowAuthorNotes] = useState(false);
  const [showMyNotes, setShowMyNotes] = useState(false);
  const [showAddToCookbook, setShowAddToCookbook] = useState(false);
  const [myNotesSaveStatus, setMyNotesSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [savedServings, setSavedServings] = useState<number>(1);
  const saveNotesRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Cooking history + post-cook rating ────────────────────
  const [cookHistory, setCookHistory] = useState<{ count: number; last: string | null }>({ count: 0, last: null });
  const [markingCooked, setMarkingCooked] = useState(false);
  const [rateCookId, setRateCookId] = useState<string | null>(null);

  // ── Wake Lock (keep screen on while cooking) ──────────────
  const supportsWakeLock = 'wakeLock' in navigator;
  // Cook mode starts with the screen-on toggle already on.
  const [isAwake, setIsAwake] = useState(cookMode && supportsWakeLock);
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
      const [recipeResult, tagsResult, cooksResult] = await Promise.all([
        supabase.from('recipes').select('*').eq('id', id!).single(),
        supabase.from('recipe_tags').select('tags(*)').eq('recipe_id', id!),
        supabase
          .from('recipe_cooks')
          .select('cooked_at')
          .eq('recipe_id', id!)
          .order('cooked_at', { ascending: false }),
      ]);

      if (!cooksResult.error && cooksResult.data) {
        setCookHistory({
          count: cooksResult.data.length,
          last: cooksResult.data[0]?.cooked_at ?? null,
        });
      }

      if (recipeResult.error) {
        setError(recipeResult.error.message);
      } else {
        const data = recipeResult.data as Recipe;
        setRecipe(data);
        const initialServings = data.custom_servings ?? data.servings ?? 1;
        setCurrentServings(initialServings);
        setSavedServings(initialServings);

        // Recipes used as an ingredient here. Anything that doesn't come back —
        // deleted, or outside the family group — simply renders as a plain line.
        const subIds = subRecipeIdsIn(data.ingredients).filter((rid) => rid !== data.id);
        if (subIds.length > 0) {
          const { data: subs } = await supabase
            .from('recipes')
            .select(SUB_RECIPE_SELECT)
            .in('id', subIds);
          if (subs) {
            setSubRecipes(
              Object.fromEntries((subs as SubRecipe[]).map((r) => [r.id, r])),
            );
          }
        }
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

  // Cook-mode completion: flip the plan entry to cooked, log the cook in the
  // recipe's history, then ask how it went. Closing the rating modal (save or
  // skip) lands back on the meal plan.
  async function handleMarkCooked() {
    if (!user || !id || markingCooked) return;
    setMarkingCooked(true);
    if (cookEntryId) {
      await supabase.from('meal_plan_recipes').update({ is_cooked: true }).eq('id', cookEntryId);
    }
    const { data: cook } = await supabase
      .from('recipe_cooks')
      .insert({ recipe_id: id, user_id: user.id, meal_plan_recipe_id: cookEntryId })
      .select('id')
      .single();
    setMarkingCooked(false);
    if (cook) {
      setCookHistory((prev) => ({ count: prev.count + 1, last: new Date().toISOString() }));
      setRateCookId(cook.id);
    } else {
      navigate('/meal-plan');
    }
  }

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

  const ingredientCount = recipe.ingredients.length;
  const stepCount = sortedSteps.length;

  /* Steps list — shared between the desktop column and the mobile "Steps" tab. */
  const renderStepGroups = () =>
    allSteps.map((group) => (
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
              <div className="flex flex-col items-center shrink-0">
                <div
                  className="flex items-center justify-center rounded-full text-xs font-bold text-white shrink-0 transition-colors"
                  style={{
                    width: 32,
                    height: 32,
                    background: isDone ? 'var(--muted)' : 'var(--green)',
                    boxShadow: isDone ? '0 0 0 4px var(--warm)' : '0 0 0 4px var(--green-light)',
                  }}
                >
                  {isDone ? '✓' : i + 1}
                </div>
                {i < group.items.length - 1 && (
                  <div className="flex-1" style={{ width: 2, background: 'var(--green-light)', minHeight: 20 }} />
                )}
              </div>
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
    ));

  /* Video — shared between desktop column and the mobile layout. `flat` (mobile)
     drops the card wrapper so it sits directly on the paper like the mock; desktop
     keeps the card to match its Directions card. */
  const renderVideo = (flat = false) => {
    if (!recipe.video_url) return null;
    const match = recipe.video_url.match(
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    );
    const videoId = match?.[1];
    if (!videoId) return null;

    const player = <VideoPlayer videoId={videoId} title={recipe.title} />;

    if (flat) {
      return (
        <div>
          <div className="rf-eyebrow" style={{ marginBottom: 6, display: 'block' }}>Watch</div>
          <h2
            style={{
              fontFamily: '"Newsreader", Georgia, serif',
              fontSize: 24,
              fontWeight: 400,
              letterSpacing: '-0.02em',
              color: 'var(--text)',
              margin: '0 0 14px',
            }}
          >
            Video
          </h2>
          {player}
        </div>
      );
    }

    return (
      <div
        style={{
          background: 'var(--card)',
          borderRadius: 'var(--radius)',
          boxShadow: 'var(--shadow-md)',
          padding: 24,
        }}
      >
        <div className="rf-eyebrow" style={{ marginBottom: 8, display: 'block' }}>Watch</div>
        <h2 className="text-lg mb-4" style={{ fontFamily: '"Newsreader", Georgia, serif' }}>
          Video
        </h2>
        {player}
      </div>
    );
  };

  /* Ingredient checklist for the mobile "Ingredients" tab — roman-numeral group
     headers + square checkboxes with right-aligned quantities. */
  const renderMobileIngredients = () =>
    allIngredients.map((group, gi) => (
      <div key={group.category || gi} style={{ marginBottom: 24 }}>
        {group.category && (
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: 10,
              paddingBottom: 8,
              borderBottom: '1px solid var(--border)',
              marginBottom: 4,
            }}
          >
            <span style={{ fontFamily: '"Newsreader", Georgia, serif', fontStyle: 'italic', color: 'var(--green)', fontSize: 13 }}>
              {toRoman(gi + 1)}.
            </span>
            <h3
              style={{
                margin: 0,
                fontFamily: '"Newsreader", Georgia, serif',
                fontSize: 18,
                fontWeight: 400,
                letterSpacing: '-0.015em',
                color: 'var(--text)',
                flex: 1,
              }}
            >
              {group.category}
            </h3>
          </div>
        )}
        {group.items.map((ing, i) => {
          const ingKey = `${group.category}::${i}`;
          const isUsed = usedIngredients.has(ingKey);
          const name = ing.item || ing.original_text || '';
          const qty =
            ing.quantity || ing.unit
              ? `${scaleQuantity(ing.quantity, recipe.servings, currentServings)}${ing.unit ? ` ${ing.unit}` : ''}`.trim()
              : '';
          // This ingredient is another recipe — the pastry in a pie. Its own
          // ingredients can be opened inline so you don't lose your check-offs
          // walking off to a second page mid-cook.
          const sub = resolveSubRecipe(ing, subRecipes, recipe.id);
          const isExpanded = sub != null && expandedSubs.has(ingKey);
          const subIngredients =
            sub && isExpanded
              ? scaleIngredientsForServings(
                  sub.ingredients,
                  sub.custom_servings ?? sub.servings,
                  (sub.custom_servings ?? sub.servings ?? 0) *
                    (recipe.servings ? currentServings / recipe.servings : 1),
                )
              : [];
          return (
            <div
              key={i}
              style={{
                borderBottom: i < group.items.length - 1 ? '1px solid var(--rule-hair)' : 'none',
              }}
            >
              <div
                className="select-none"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 0',
                  cursor: 'pointer',
                }}
                onClick={() => {
                  setUsedIngredients((prev) => {
                    const next = new Set(prev);
                    if (next.has(ingKey)) next.delete(ingKey);
                    else next.add(ingKey);
                    return next;
                  });
                }}
              >
                <span
                  style={{
                    width: 22,
                    height: 22,
                    borderRadius: 5,
                    flexShrink: 0,
                    border: `1.5px solid ${isUsed ? 'var(--green)' : 'var(--border)'}`,
                    background: isUsed ? 'var(--green)' : 'transparent',
                    display: 'grid',
                    placeItems: 'center',
                  }}
                >
                  {isUsed && <Check size={13} strokeWidth={3} color="#fbf8f1" />}
                </span>
                {sub ? (
                  sub.image_url ? (
                    <img
                      src={sub.image_url}
                      alt=""
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 6,
                        flexShrink: 0,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 16,
                        background: 'var(--green-light)',
                      }}
                    >
                      🍴
                    </span>
                  )
                ) : (
                  <IngredientIcon item={ing.item || ''} />
                )}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span
                    style={{
                      fontFamily: '"Newsreader", Georgia, serif',
                      fontSize: 16,
                      letterSpacing: '-0.01em',
                      color: isUsed ? 'var(--muted)' : 'var(--text)',
                      textDecoration: isUsed ? 'line-through' : 'none',
                    }}
                  >
                    {name}
                  </span>
                  {sub && (
                    <span
                      style={{
                        marginLeft: 8,
                        padding: '1px 6px',
                        borderRadius: 3,
                        fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
                        fontSize: 8,
                        letterSpacing: '0.12em',
                        textTransform: 'uppercase',
                        background: 'var(--green-light)',
                        color: 'var(--green)',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Recipe
                    </span>
                  )}
                </span>
                {qty && (
                  <span
                    style={{
                      fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
                      fontSize: 11,
                      letterSpacing: '0.04em',
                      color: 'var(--muted)',
                      flexShrink: 0,
                    }}
                  >
                    {qty}
                  </span>
                )}
                {sub && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedSubs((prev) => {
                        const next = new Set(prev);
                        if (next.has(ingKey)) next.delete(ingKey);
                        else next.add(ingKey);
                        return next;
                      });
                    }}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? `Hide ${sub.title} ingredients` : `Show ${sub.title} ingredients`}
                    style={{
                      flexShrink: 0,
                      display: 'grid',
                      placeItems: 'center',
                      width: 26,
                      height: 26,
                      color: 'var(--green)',
                      transform: isExpanded ? 'rotate(180deg)' : 'none',
                      transition: 'transform 0.2s ease',
                    }}
                  >
                    <ChevronDown size={16} strokeWidth={2} />
                  </button>
                )}
              </div>
              {sub && isExpanded && (
                <div
                  style={{
                    paddingLeft: 34,
                    paddingBottom: 12,
                    borderLeft: '2px solid var(--green-light)',
                    marginLeft: 10,
                  }}
                >
                  {subIngredients.map((subIng, j) => {
                    const subKey = `${ingKey}::sub::${j}`;
                    const subUsed = usedIngredients.has(subKey);
                    const subQty = [subIng.quantity, subIng.unit].filter(Boolean).join(' ').trim();
                    return (
                      <div
                        key={j}
                        className="select-none"
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '7px 0',
                          cursor: 'pointer',
                        }}
                        onClick={() => {
                          setUsedIngredients((prev) => {
                            const next = new Set(prev);
                            if (next.has(subKey)) next.delete(subKey);
                            else next.add(subKey);
                            return next;
                          });
                        }}
                      >
                        <span
                          style={{
                            width: 16,
                            height: 16,
                            borderRadius: 4,
                            flexShrink: 0,
                            border: `1.5px solid ${subUsed ? 'var(--green)' : 'var(--border)'}`,
                            background: subUsed ? 'var(--green)' : 'transparent',
                            display: 'grid',
                            placeItems: 'center',
                          }}
                        >
                          {subUsed && <Check size={10} strokeWidth={3} color="#fbf8f1" />}
                        </span>
                        <span
                          style={{
                            flex: 1,
                            fontFamily: '"Newsreader", Georgia, serif',
                            fontSize: 14,
                            color: subUsed ? 'var(--muted)' : 'var(--text)',
                            textDecoration: subUsed ? 'line-through' : 'none',
                          }}
                        >
                          {subIng.item || subIng.original_text || ''}
                        </span>
                        {subQty && (
                          <span
                            style={{
                              fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
                              fontSize: 10,
                              letterSpacing: '0.04em',
                              color: 'var(--muted)',
                              flexShrink: 0,
                            }}
                          >
                            {subQty}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <Link
                    to={`/recipe/${sub.id}`}
                    style={{
                      display: 'inline-block',
                      marginTop: 6,
                      fontFamily: '"Newsreader", Georgia, serif',
                      fontStyle: 'italic',
                      fontSize: 14,
                      color: 'var(--green)',
                    }}
                  >
                    Open {sub.title} &rarr;
                  </Link>
                </div>
              )}
            </div>
          );
        })}
      </div>
    ));

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  // The two primary "save" actions, rendered together so it's obvious which
  // adds to a meal plan (green) and which adds to a cookbook (orange). Shared
  // between the desktop hero column and the mobile action row.
  // fullWidth = mobile: two equal pills spanning the row (mock). Desktop passes
  // false so the pills stay inline/auto-width in the hero column.
  const renderPrimaryActions = (fullWidth = false) => (
    <div className="flex items-center gap-3" style={{ width: fullWidth ? '100%' : undefined }}>
      <button
        onClick={() => setShowWeekPicker(true)}
        className="inline-flex items-center justify-center gap-2 text-sm font-medium text-white transition-all"
        style={{
          flex: fullWidth ? 1 : undefined,
          padding: fullWidth ? '14px' : '11px 18px',
          borderRadius: 999,
          background: 'var(--green)',
          border: '1px solid var(--green)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.93)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
      >
        <CalendarPlusIcon />
        Add to plan
      </button>
      <button
        onClick={() => setShowAddToCookbook(true)}
        className="inline-flex items-center justify-center gap-2 text-sm font-medium text-white transition-all"
        style={{
          flex: fullWidth ? 1 : undefined,
          padding: fullWidth ? '14px' : '11px 18px',
          borderRadius: 999,
          background: 'var(--orange)',
          border: '1px solid var(--orange)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.filter = 'brightness(0.93)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.filter = 'none'; }}
      >
        <BookIcon />
        Add to cookbook
      </button>
    </div>
  );

  // Quiet mono line under the meta cards: how often this recipe has been
  // cooked and when it last was. Grows into a richer history view later.
  const renderCookedHistory = () =>
    cookHistory.count > 0 ? (
      <div
        className="flex items-center gap-1.5 mt-3"
        style={{
          fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
          fontSize: 10,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--muted)',
        }}
      >
        <Flame size={11} strokeWidth={1.6} />
        <span>
          Cooked {cookHistory.count}&times;
          {cookHistory.last ? ` · last ${formatCookDate(cookHistory.last)}` : ''}
        </span>
      </div>
    ) : null;

  // Wake-lock toggle, overlaid on the top-left of the hero image so it doesn't
  // take a row of its own below the action buttons. Styled as a glass pill to
  // stay legible over any photo.
  const renderScreenOnToggle = () =>
    supportsWakeLock ? (
      <div className="absolute top-4 left-4 z-10">
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
          aria-pressed={isAwake}
          aria-label="Keep screen on"
          className="flex items-center gap-2 text-xs font-semibold rounded-full px-3 py-1.5"
          style={{
            color: '#1f1b16',
            background: 'rgba(251,248,241,0.9)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            border: '1px solid rgba(31,27,22,0.08)',
            cursor: 'pointer',
          }}
        >
          {isAwake ? <SunIcon /> : <MoonIcon />}
          <span>Keep screen on</span>
          {/* Toggle track */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              width: 38,
              height: 22,
              borderRadius: 11,
              background: isAwake ? 'var(--green)' : 'rgba(31,27,22,0.15)',
              transition: 'background 0.25s ease',
              padding: 2,
              flexShrink: 0,
            }}
          >
            {/* Toggle thumb */}
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: '#fff',
                boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                transform: isAwake ? 'translateX(16px)' : 'translateX(0)',
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
              left: 0,
            }}
          >
            Screen will stay on while you cook. This may use more battery.
          </div>
        )}
      </div>
    ) : null;

  return (
    <div>
        {/* Glowing yellow halo around the whole screen while keep-awake is on */}
        {isAwake && <div className="rd-screen-on-frame" aria-hidden="true" />}

        {/* ── Hero (mobile) ──────────────────────────────────────── */}
        {isMobile && (
          <div style={{ animation: 'fadeUp 0.4s ease both' }}>
            {/* Clean photo with screen-on toggle + favourite overlaid */}
            <div
              className="relative overflow-hidden"
              style={{ marginLeft: -24, marginRight: -24, marginTop: -28, height: 320, background: 'var(--paper3)' }}
            >
              {recipe.image_url ? (
                <img src={recipe.image_url} alt={recipe.title} className="absolute inset-0 w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--muted)' }}>
                  <Flame size={40} strokeWidth={1.2} />
                </div>
              )}
              {/* Soft top scrim (keeps overlay controls legible) + bottom fade into
                  the page ground so the photo dissolves into the body — matches the mock. */}
              <div
                className="absolute inset-0 pointer-events-none"
                style={{
                  background:
                    'linear-gradient(180deg, rgba(31,27,22,0.28) 0%, rgba(31,27,22,0) 32%, rgba(236,228,211,0) 60%, var(--bg) 100%)',
                }}
              />
              {renderScreenOnToggle()}
              <div className="absolute top-4 right-4">
                <FavouriteButton
                  recipeId={recipe.id}
                  isFavourite={recipe.is_favourite}
                  onToggle={(val) => setRecipe((prev) => (prev ? { ...prev, is_favourite: val } : prev))}
                  size="md"
                />
              </div>
            </div>

            {/* Editorial paper header */}
            <div className="mt-5">
              {tags.length > 0 && (
                <div className="rf-eyebrow" style={{ marginBottom: 10, display: 'block' }}>
                  {tags.slice(0, 3).map((t) => t.name).join(' · ')}
                </div>
              )}
              <h1
                className="rf-heading"
                style={{ fontSize: 'clamp(30px, 8vw, 38px)', lineHeight: 1.05, letterSpacing: '-0.02em', color: 'var(--text)' }}
              >
                {renderAccentedTitle(recipe.title)}
              </h1>

              {recipe.description && (
                <div className="mt-3">
                  <p
                    style={{
                      color: 'var(--text-soft)',
                      fontSize: 15,
                      lineHeight: 1.5,
                      display: '-webkit-box',
                      WebkitLineClamp: descExpanded ? 'unset' : 3,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}
                  >
                    {recipe.description}
                  </p>
                  {recipe.description.length > 130 && (
                    <button
                      onClick={() => setDescExpanded((v) => !v)}
                      style={{ color: 'var(--green)', textDecoration: 'underline', textUnderlineOffset: 2, fontSize: 14, marginTop: 4, cursor: 'pointer' }}
                    >
                      {descExpanded ? 'show less' : 'show more'}
                    </button>
                  )}
                </div>
              )}

              {/* Meta cards */}
              {(recipe.prep_time != null || recipe.cook_time != null || recipe.servings != null) && (
                <div className="flex gap-2.5 mt-5">
                  {recipe.prep_time != null && (
                    <MetaCard icon={<Clock size={12} strokeWidth={1.6} />} label="Prep" value={formatTime(recipe.prep_time)} />
                  )}
                  {recipe.cook_time != null && (
                    <MetaCard icon={<Flame size={12} strokeWidth={1.6} />} label="Cook" value={formatTime(recipe.cook_time)} />
                  )}
                  {recipe.servings != null && (
                    <MetaCard icon={<Users size={12} strokeWidth={1.6} />} label="Serves" value={String(recipe.servings)} />
                  )}
                </div>
              )}
              {renderCookedHistory()}

              {/* Byline */}
              {(recipe.creator_name || recipe.source_url) && (
                <div className="flex items-center gap-2 flex-wrap mt-5" style={{ fontSize: 14, color: 'var(--muted)' }}>
                  {recipe.creator_name && (
                    <span>
                      Recipe by{' '}
                      <em style={{ fontFamily: '"Newsreader", Georgia, serif', fontStyle: 'italic', color: 'var(--text)' }}>
                        {recipe.creator_name}
                      </em>
                    </span>
                  )}
                  {recipe.creator_name && recipe.source_url && <span style={{ color: 'var(--border)' }}>·</span>}
                  {recipe.source_url && (
                    <a
                      href={recipe.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5"
                      style={{ color: 'var(--green)' }}
                    >
                      <Globe size={13} strokeWidth={1.6} />
                      {getDomain(recipe.source_url)} ↗
                    </a>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={() => setShowMyNotes(true)}
                  className="inline-flex items-center gap-1.5"
                  style={{ fontSize: 14, color: 'var(--text)', cursor: 'pointer' }}
                >
                  <FileText size={15} strokeWidth={1.6} style={{ color: 'var(--orange)' }} /> My notes
                </button>
                {recipe.author_notes && (
                  <button
                    onClick={() => setShowAuthorNotes(true)}
                    className="inline-flex items-center gap-1.5"
                    style={{ fontSize: 14, color: 'var(--muted)', cursor: 'pointer' }}
                  >
                    <FileText size={15} strokeWidth={1.6} /> Author's notes
                  </button>
                )}
              </div>

              {/* Primary actions */}
              <div className="mt-5" style={{ position: 'relative', zIndex: 10 }}>
                {renderPrimaryActions(true)}
              </div>
            </div>
          </div>
        )}

        {/* ── Hero (desktop) ─────────────────────────────────────── */}
        {!isMobile && (
        <div
          className="rd-hero-split"
          style={{ animation: 'fadeUp 0.4s ease both' }}
        >
          {/* Desktop-only left column: title + description + attribution (top), meal plan + screen on (bottom) */}
          <div className="rd-hero-text">
            {/* Top group — centred in available space */}
            <div className="rd-hero-top-group">
              {tags.length > 0 && (
                <div className="rf-eyebrow" style={{ marginBottom: 12, display: 'block' }}>
                  {tags.slice(0, 4).map((t) => t.name).join(' · ')}
                </div>
              )}
              <h1
                className="rf-heading"
                style={{ lineHeight: 1.06, letterSpacing: '-0.02em', color: 'var(--text)' }}
              >
                {renderAccentedTitle(recipe.title)}
              </h1>
              {recipe.description && (
                <p
                  ref={descRef}
                  className="rd-hero-desc mt-3"
                  style={{ color: 'var(--text-soft)', fontSize: 15, lineHeight: 1.55 }}
                >
                  {recipe.description}
                </p>
              )}

              {/* Meta cards (moved off the image into the editorial text flow) */}
              {(recipe.prep_time != null || recipe.cook_time != null || recipe.servings != null) && (
                <div className="flex gap-2.5 mt-5">
                  {recipe.prep_time != null && (
                    <MetaCard icon={<Clock size={12} strokeWidth={1.6} />} label="Prep" value={formatTime(recipe.prep_time)} />
                  )}
                  {recipe.cook_time != null && (
                    <MetaCard icon={<Flame size={12} strokeWidth={1.6} />} label="Cook" value={formatTime(recipe.cook_time)} />
                  )}
                  {recipe.servings != null && (
                    <MetaCard icon={<Users size={12} strokeWidth={1.6} />} label="Serves" value={String(recipe.servings)} />
                  )}
                </div>
              )}
              {renderCookedHistory()}

              {/* Byline */}
              {(recipe.creator_name || recipe.source_url) && (
                <div className="flex items-center gap-2 flex-wrap mt-5" style={{ fontSize: 14, color: 'var(--muted)' }}>
                  {recipe.creator_name && (
                    <span>
                      Recipe by{' '}
                      <em style={{ fontFamily: '"Newsreader", Georgia, serif', fontStyle: 'italic', color: 'var(--text)' }}>
                        {recipe.creator_name}
                      </em>
                    </span>
                  )}
                  {recipe.creator_name && recipe.source_url && <span style={{ color: 'var(--border)' }}>·</span>}
                  {recipe.source_url && (
                    <a
                      href={recipe.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5"
                      style={{ color: 'var(--green)' }}
                    >
                      <Globe size={13} strokeWidth={1.6} />
                      {getDomain(recipe.source_url)} ↗
                    </a>
                  )}
                </div>
              )}

              {/* Notes */}
              <div className="flex items-center gap-4 mt-3">
                <button
                  onClick={() => setShowMyNotes(true)}
                  className="inline-flex items-center gap-1.5"
                  style={{ fontSize: 14, color: 'var(--text)', cursor: 'pointer' }}
                >
                  <FileText size={15} strokeWidth={1.6} style={{ color: 'var(--orange)' }} /> My notes
                </button>
                {recipe.author_notes && (
                  <button
                    onClick={() => setShowAuthorNotes(true)}
                    className="inline-flex items-center gap-1.5"
                    style={{ fontSize: 14, color: 'var(--muted)', cursor: 'pointer' }}
                  >
                    <FileText size={15} strokeWidth={1.6} /> Author's notes
                  </button>
                )}
              </div>
            </div>

            {/* Bottom group: primary actions (desktop only). Screen-on toggle
                now overlays the hero image instead of taking a row here. */}
            <div className="flex items-center flex-wrap gap-3" style={{ position: 'relative', zIndex: 10 }}>
              {renderPrimaryActions()}
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
                <Flame size={48} strokeWidth={1.2} style={{ color: 'var(--muted)' }} />
              </div>
            )}

            {/* Editorial gradient: soft top scrim keeps the overlaid controls
                legible, then the photo dissolves into the page ground at the
                bottom edge — the same fade-down treatment as the mobile hero. */}
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'linear-gradient(180deg, rgba(31,27,22,0.30) 0%, rgba(31,27,22,0) 26%, rgba(236,228,211,0) 78%, var(--bg) 100%)',
              }}
            />

            {/* Top-right: favourite (source now lives in the byline) */}
            <div className="absolute top-4 right-4">
              <FavouriteButton
                recipeId={recipe.id}
                isFavourite={recipe.is_favourite}
                onToggle={(val) =>
                  setRecipe((prev) => (prev ? { ...prev, is_favourite: val } : prev))
                }
                size="md"
              />
            </div>

            {/* Top-left: keep-screen-on toggle overlay */}
            {renderScreenOnToggle()}
          </div>
        </div>
        )}

        {/* ── Two-column body (desktop) ──────────────────────────── */}
        {!isMobile && (
        <div
          className="rd-grid mt-6"
          style={{ animation: 'fadeUp 0.4s ease 0.2s both' }}
        >
          {/* ─ Left: Ingredients sidebar ───────────────────────── */}
          <aside className="rd-ingredients self-start">
            <div className="rd-panel">
              {/* Heading + serving control */}
              <div className="rf-eyebrow" style={{ marginBottom: 6, display: 'block' }}>What you need</div>
              <div
                className="flex items-end justify-between gap-3"
                style={{ borderBottom: '1px solid var(--border)', paddingBottom: 14, marginBottom: 18 }}
              >
                <h2 className="rf-heading" style={{ fontSize: 24, color: 'var(--text)' }}>
                  Ingredients
                </h2>
                {recipe.servings != null && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                      border: '1px solid var(--border)',
                      borderRadius: 999,
                      padding: 3,
                      background: 'var(--card)',
                    }}
                  >
                    <button
                      onClick={() => updateServings(Math.max(1, currentServings - 1))}
                      aria-label="Fewer servings"
                      style={{
                        width: 26, height: 26, borderRadius: 999,
                        border: '1px solid var(--border)', background: 'var(--card)',
                        color: 'var(--muted)', display: 'grid', placeItems: 'center', cursor: 'pointer',
                      }}
                    >
                      <Minus size={13} strokeWidth={2} />
                    </button>
                    <span style={{ minWidth: 34, textAlign: 'center' }}>
                      <span style={{ fontFamily: '"Newsreader", Georgia, serif', fontSize: 15, color: 'var(--text)' }}>
                        {currentServings}
                      </span>
                      <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace', fontSize: 9.5, color: 'var(--muted)' }}>
                        {' '}sv
                      </span>
                    </span>
                    <button
                      onClick={() => updateServings(currentServings + 1)}
                      aria-label="More servings"
                      style={{
                        width: 26, height: 26, borderRadius: 999,
                        border: '1px solid var(--green)', background: 'var(--green)',
                        color: '#fbf8f1', display: 'grid', placeItems: 'center', cursor: 'pointer',
                      }}
                    >
                      <Plus size={13} strokeWidth={2} />
                    </button>
                  </div>
                )}
              </div>

              {/* Save adjusted servings */}
              {recipe.servings != null && currentServings !== savedServings && (
                <div className="flex justify-end" style={{ marginTop: -6, marginBottom: 16 }}>
                  <button
                    onClick={saveServings}
                    className="cursor-pointer"
                    style={{
                      color: 'var(--green)', background: 'var(--green-light)',
                      border: '1px solid var(--green)', borderRadius: 20,
                      padding: '2px 10px', font: 'inherit', fontSize: '0.8em',
                      fontWeight: 600, lineHeight: 1.6,
                    }}
                  >
                    Save serving size
                  </button>
                </div>
              )}

              {/* Ingredient checklist (shared editorial treatment with mobile) */}
              {renderMobileIngredients()}
            </div>
          </aside>

          {/* ─ Right: Directions + Video ──────────────────────── */}
          <div className="rd-steps">
            {/* Directions */}
            <div className="rd-panel">
              <div className="rf-eyebrow" style={{ marginBottom: 6, display: 'block' }}>Method</div>
              <h2
                className="rf-heading"
                style={{
                  fontSize: 24,
                  color: 'var(--text)',
                  borderBottom: '1px solid var(--border)',
                  paddingBottom: 14,
                  marginBottom: 20,
                }}
              >
                Directions
              </h2>

              {renderStepGroups()}
            </div>

            {/* Video (flat editorial treatment, matching mobile) */}
            {recipe.video_url && <div style={{ marginTop: 20 }}>{renderVideo(true)}</div>}
          </div>
        </div>
        )}

        {/* ── Tabbed body (mobile) ───────────────────────────────── */}
        {isMobile && (
          <div className="mt-6" style={{ animation: 'fadeUp 0.4s ease 0.2s both' }}>
            {/* Tab bar + serving stepper */}
            <div
              style={{
                display: 'flex',
                alignItems: 'flex-end',
                justifyContent: 'space-between',
                gap: 12,
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ display: 'flex', gap: 24 }}>
                {([
                  ['ingredients', 'Ingredients', ingredientCount],
                  ['steps', 'Steps', stepCount],
                ] as const).map(([key, label, count]) => {
                  const active = mobileTab === key;
                  return (
                    <button
                      key={key}
                      onClick={() => setMobileTab(key)}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        paddingBottom: 12,
                        marginBottom: -1,
                        cursor: 'pointer',
                        fontFamily: '"Newsreader", Georgia, serif',
                        fontSize: 18,
                        letterSpacing: '-0.01em',
                        color: active ? 'var(--text)' : 'var(--muted)',
                        borderBottom: active ? '2px solid var(--green)' : '2px solid transparent',
                      }}
                    >
                      {label}{' '}
                      <span
                        style={{
                          fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace',
                          fontSize: 11,
                          color: 'var(--muted)',
                        }}
                      >
                        · {count}
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Serving stepper (ingredients only) */}
              {recipe.servings != null && mobileTab === 'ingredients' && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    marginBottom: 8,
                    border: '1px solid var(--border)',
                    borderRadius: 999,
                    padding: 3,
                    background: 'var(--card)',
                  }}
                >
                  <button
                    onClick={() => updateServings(Math.max(1, currentServings - 1))}
                    aria-label="Fewer servings"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      border: '1px solid var(--border)',
                      background: 'var(--card)',
                      color: 'var(--muted)',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Minus size={13} strokeWidth={2} />
                  </button>
                  <span style={{ minWidth: 34, textAlign: 'center' }}>
                    <span style={{ fontFamily: '"Newsreader", Georgia, serif', fontSize: 15, color: 'var(--text)' }}>
                      {currentServings}
                    </span>
                    <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, Menlo, monospace', fontSize: 9.5, color: 'var(--muted)' }}>
                      {' '}sv
                    </span>
                  </span>
                  <button
                    onClick={() => updateServings(currentServings + 1)}
                    aria-label="More servings"
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 999,
                      border: '1px solid var(--green)',
                      background: 'var(--green)',
                      color: '#fbf8f1',
                      display: 'grid',
                      placeItems: 'center',
                      cursor: 'pointer',
                    }}
                  >
                    <Plus size={13} strokeWidth={2} />
                  </button>
                </div>
              )}
            </div>

            {/* Save adjusted servings */}
            {mobileTab === 'ingredients' && currentServings !== savedServings && (
              <div className="flex justify-end mt-3">
                <button
                  onClick={saveServings}
                  style={{
                    color: 'var(--green)',
                    background: 'var(--green-light)',
                    border: '1px solid var(--green)',
                    borderRadius: 20,
                    padding: '2px 10px',
                    fontSize: '0.8em',
                    fontWeight: 600,
                    lineHeight: 1.6,
                    cursor: 'pointer',
                  }}
                >
                  Save serving size
                </button>
              </div>
            )}

            {/* Active panel */}
            <div className="mt-4 rd-panel">
              {mobileTab === 'ingredients' ? renderMobileIngredients() : renderStepGroups()}
            </div>

            {/* Video below the tabs */}
            {recipe.video_url && <div className="mt-8">{renderVideo(true)}</div>}
          </div>
        )}

        {/* ── Nutrition (only when the source published it) ──────── */}
        <NutritionPanel
          nutrition={recipe.nutrition}
          sourceLabel={recipe.source_url ? getDomain(recipe.source_url) : null}
        />

        {/* ── Edit / Delete ──────────────────────────────────────── */}
        {recipe.original_paste && (
          <details
            className="rf-card"
            style={{ padding: 18, marginTop: 28 }}
          >
            <summary className="cursor-pointer text-sm font-semibold" style={{ color: 'var(--text)' }}>
              Original paste
            </summary>
            <pre
              className="whitespace-pre-wrap mt-4 text-sm"
              style={{ color: 'var(--muted)', fontFamily: 'inherit', lineHeight: 1.6 }}
            >
              {recipe.original_paste}
            </pre>
          </details>
        )}

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 32 }} />
        <div
          className="rd-actions flex flex-wrap gap-3 mt-6"
          style={{ position: 'relative', zIndex: 1 }}
        >
          <Link
            to={`/recipe/${id}/edit`}
            className="rd-action-btn inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors"
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
            <Pencil size={15} strokeWidth={1.7} /> Edit
          </Link>
          <button
            onClick={() => setShowDeleteModal(true)}
            className="rd-action-btn inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition-colors"
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
            <Trash2 size={15} strokeWidth={1.7} /> Delete
          </button>
        </div>

        {/* ── Footer ─────────────────────────────────────────────── */}
        <p
          className="text-center mt-6"
          style={{ fontFamily: '"Newsreader", Georgia, serif', fontStyle: 'italic', fontSize: 13, color: 'var(--muted)' }}
        >
          {recipe.source_url ? `Saved from ${getDomain(recipe.source_url)}` : 'Saved'}
          {recipe.created_at
            ? ` · ${new Date(recipe.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}`
            : ''}
        </p>

        {id && (
          <AddToCookbookSheet
            open={showAddToCookbook}
            recipeId={id}
            onClose={() => setShowAddToCookbook(false)}
          />
        )}

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
              style={{ fontFamily: '"Newsreader", Georgia, serif', fontSize: 18, color: 'var(--text)' }}
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
          ingredients={recipe.ingredients}
          userId={user.id}
          onClose={() => setShowWeekPicker(false)}
        />
      )}

      {/* ── Cook mode: floating "Mark as cooked" ─────────────── */}
      {cookMode && !rateCookId && (
        <div
          // The bottom nav sits at the foot of the viewport on every size, not
          // just mobile, so this has to clear it everywhere — at a desktop-only
          // 28px the nav painted straight over the button.
          className="fixed left-0 right-0 z-40 flex justify-center pointer-events-none"
          style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}
        >
          <button
            onClick={handleMarkCooked}
            disabled={markingCooked}
            className="pointer-events-auto inline-flex items-center gap-2 transition-transform"
            style={{
              padding: '13px 26px',
              borderRadius: 999,
              border: 'none',
              background: 'var(--green)',
              color: '#fff',
              fontFamily: '"DM Sans", system-ui, sans-serif',
              fontSize: 15,
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: '0 6px 20px rgba(0,0,0,0.25)',
              opacity: markingCooked ? 0.7 : 1,
              animation: 'fadeUp 0.4s ease both',
            }}
          >
            <Check size={17} strokeWidth={2.5} />
            {markingCooked ? 'Saving…' : 'Mark as cooked'}
          </button>
        </div>
      )}

      {/* Post-cook rating — closing (save or skip) returns to the plan. */}
      <RateCookModal
        open={rateCookId !== null}
        cookId={rateCookId}
        recipeId={recipe?.id ?? null}
        recipeTitle={recipe?.title}
        onAutoFavourite={() => {
          setRecipe((prev) => (prev ? { ...prev, is_favourite: true } : prev));
        }}
        onClose={() => {
          setRateCookId(null);
          navigate('/meal-plan');
        }}
      />
    </div>
  );
}
