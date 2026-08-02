import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus, X as XIcon, Utensils, Wand2 } from 'lucide-react';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook, Recipe } from '@recipe-aggregator/shared';
import { fSerif, fSans, fMono } from '../styles/pieKeeper';
import { DAY_SHORT, DAY_INDEXES, dayDate, todayIndex } from '../utils/mealPlanDays';

export interface PlanPrefs {
  /** Cooks in the week — pots on the stove, not nights at the table. */
  meals: number;
  /** People at the table on one night. */
  servings: number;
  /** Nights one cook covers. 2 means Sunday's pot also feeds Wednesday. */
  nights: number;
}

export interface PlanPick {
  recipe: Recipe;
  nights: number;
}

/** One night of one pick — the unit that gets placed on a day. */
interface Slot {
  key: string;
  recipeId: string;
  nightIndex: number;
  day: number | null;
}

interface Props {
  open: boolean;
  weekStart: Date;
  /** Days already spoken for by meals in the week. */
  takenDays: Set<number>;
  prefs: PlanPrefs | null;
  onSavePrefs: (prefs: PlanPrefs) => void;
  onCommit: (picks: PlanPick[], slots: { recipeId: string; nightIndex: number; day: number | null }[], servingsPerNight: number) => Promise<void>;
  onClose: () => void;
}

/** Where the picker is reading from. `cookbook:<id>` narrows to one cookbook. */
type Filter = 'suggested' | 'favourites' | 'recent' | 'all' | `cookbook:${string}`;

const COOKBOOK_PREFIX = 'cookbook:';

/**
 * Plan mode. Asks the setup questions once, remembers the answers, and from
 * then on opens straight at picking. Every step after the first is skippable —
 * you can bail at any point and the meals just land in the week unplaced.
 */
export default function PlanWeekModal({
  open,
  weekStart,
  takenDays,
  prefs,
  onSavePrefs,
  onCommit,
  onClose,
}: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [meals, setMeals] = useState(3);
  const [servings, setServings] = useState(2);
  const [nights, setNights] = useState(2);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [lastCooked, setLastCooked] = useState<Record<string, string>>({});
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [cookbookRecipes, setCookbookRecipes] = useState<Record<string, Set<string>>>({});
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState<Filter>('suggested');
  const [search, setSearch] = useState('');
  const [picks, setPicks] = useState<PlanPick[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setStep(prefs ? 2 : 1);
    setMeals(prefs?.meals ?? 3);
    setServings(prefs?.servings ?? 2);
    setNights(prefs?.nights ?? 2);
    setPicks([]);
    setSlots([]);
    setActiveSlot(null);
    setSearch('');
    setFilter('suggested');
    setLoading(true);
    (async () => {
      const [{ data: recipeData }, { data: cookData }, { data: cbData }, { data: cbRecipeData }] =
        await Promise.all([
          supabase.from('recipes').select('*').order('title'),
          supabase.from('recipe_cooks').select('recipe_id, cooked_at'),
          supabase
            .from('cookbooks')
            .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
            .order('sort_order', { ascending: true })
            .order('created_at', { ascending: false }),
          supabase.from('cookbook_recipes').select('cookbook_id, recipe_id'),
        ]);
      setRecipes((recipeData as Recipe[]) ?? []);
      const map: Record<string, string> = {};
      for (const row of (cookData as { recipe_id: string; cooked_at: string }[]) ?? []) {
        if (!map[row.recipe_id] || row.cooked_at > map[row.recipe_id]) map[row.recipe_id] = row.cooked_at;
      }
      setLastCooked(map);
      setCookbooks((cbData as Cookbook[]) ?? []);
      const members: Record<string, Set<string>> = {};
      for (const row of (cbRecipeData as { cookbook_id: string; recipe_id: string }[]) ?? []) {
        (members[row.cookbook_id] ??= new Set()).add(row.recipe_id);
      }
      setCookbookRecipes(members);
      setLoading(false);
    })();
  }, [open, prefs]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  // Cookbooks you can actually pick from — an empty one is just noise here.
  const pickableCookbooks = useMemo(
    () => cookbooks.filter((c) => (cookbookRecipes[c.id]?.size ?? 0) > 0),
    [cookbooks, cookbookRecipes],
  );

  const activeCookbook = filter.startsWith(COOKBOOK_PREFIX)
    ? cookbooks.find((c) => c.id === filter.slice(COOKBOOK_PREFIX.length))
    : undefined;

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = recipes.filter((r) => !q || r.title.toLowerCase().includes(q));
    if (filter === 'favourites') list = list.filter((r) => r.is_favourite);
    if (filter.startsWith(COOKBOOK_PREFIX)) {
      const ids = cookbookRecipes[filter.slice(COOKBOOK_PREFIX.length)];
      list = ids ? list.filter((r) => ids.has(r.id)) : [];
    }
    if (filter === 'recent') {
      list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (filter === 'suggested' || filter.startsWith(COOKBOOK_PREFIX)) {
      // Longest time since you last cooked it, never-cooked first.
      list = [...list].sort((a, b) => (lastCooked[a.id] ?? '').localeCompare(lastCooked[b.id] ?? ''));
    }
    return list.slice(0, 60);
  }, [recipes, search, filter, lastCooked, cookbookRecipes]);

  const totalNights = picks.reduce((sum, p) => sum + p.nights, 0);
  // What the setup answers add up to: cooks × nights each.
  const plannedNights = meals * nights;
  // A pick can always be cycled past the default — the answer is a starting
  // point, not a cap.
  const maxNights = Math.max(3, nights);

  function togglePick(recipe: Recipe) {
    setPicks((prev) => {
      const found = prev.find((p) => p.recipe.id === recipe.id);
      if (found) return prev.filter((p) => p.recipe.id !== recipe.id);
      // Everything starts on the answer from step 1 — most cooks here are meal
      // prep, so 1 night would mean re-tapping every card.
      return [...prev, { recipe, nights }];
    });
  }

  function cycleNights(recipeId: string) {
    setPicks((prev) =>
      prev.map((p) =>
        p.recipe.id === recipeId ? { ...p, nights: p.nights >= maxNights ? 1 : p.nights + 1 } : p,
      ),
    );
  }

  function goToPlacement() {
    const next: Slot[] = [];
    for (const pick of picks) {
      for (let n = 0; n < pick.nights; n++) {
        next.push({ key: `${pick.recipe.id}-${n}`, recipeId: pick.recipe.id, nightIndex: n, day: null });
      }
    }
    setSlots(next);
    setActiveSlot(next[0]?.key ?? null);
    setStep(3);
  }

  function placeOnDay(day: number) {
    if (!activeSlot) return;
    setSlots((prev) => {
      const next = prev.map((s) => (s.key === activeSlot ? { ...s, day } : s));
      const stillOpen = next.find((s) => s.day === null);
      setActiveSlot(stillOpen?.key ?? null);
      return next;
    });
  }

  function autoFill() {
    const today = todayIndex(weekStart);
    const used = new Set<number>([...takenDays, ...slots.filter((s) => s.day !== null).map((s) => s.day as number)]);
    const free = DAY_INDEXES.filter((d) => !used.has(d) && (today === null || d >= today));

    const take = (day: number) => {
      const i = free.indexOf(day);
      if (i >= 0) free.splice(i, 1);
    };

    // Group the open nights by recipe so a meal-prep batch can be spread out
    // rather than landing on two days in a row.
    const byRecipe = new Map<string, Slot[]>();
    for (const s of slots.filter((s) => s.day === null)) {
      const list = byRecipe.get(s.recipeId) ?? [];
      list.push(s);
      byRecipe.set(s.recipeId, list);
    }

    // Longest cooks choose first, so the 90-minute braise gets a weekend.
    const groups = [...byRecipe.entries()].sort((a, b) => minutesFor(b[0]) - minutesFor(a[0]));

    const assigned = new Map<string, number>();
    for (const [recipeId, nights] of groups) {
      nights.sort((a, b) => a.nightIndex - b.nightIndex);
      let prev: number | null = null;
      for (const slot of nights) {
        if (free.length === 0) break;
        let day: number;
        if (prev === null) {
          const weekend = free.filter((d) => d >= 5);
          day = minutesFor(recipeId) >= 45 && weekend.length > 0 ? weekend[0] : free[0];
        } else {
          // Later nights of the same cook want a gap — eating the same thing two
          // nights running is the thing meal prep is trying to avoid.
          const gap = prev;
          const spaced = free.filter((d) => Math.abs(d - gap) >= 2);
          day =
            spaced.length > 0
              ? spaced.reduce((best, d) => (Math.abs(d - gap) < Math.abs(best - gap) ? d : best))
              : free[0];
        }
        take(day);
        assigned.set(slot.key, day);
        prev = day;
      }
    }
    setSlots((prev) => prev.map((s) => (assigned.has(s.key) ? { ...s, day: assigned.get(s.key)! } : s)));
    setActiveSlot(null);
  }

  function minutesFor(recipeId: string): number {
    const r = recipes.find((x) => x.id === recipeId);
    return (r?.prep_time ?? 0) + (r?.cook_time ?? 0);
  }

  function recipeFor(id: string): Recipe | undefined {
    return recipes.find((r) => r.id === id);
  }

  async function commit() {
    setSaving(true);
    await onCommit(
      picks,
      slots.map((s) => ({ recipeId: s.recipeId, nightIndex: s.nightIndex, day: s.day })),
      servings,
    );
    setSaving(false);
    onClose();
  }

  if (!open) return null;

  /**
   * One line of the setup sentence: "I want to cook — 3 — meals". Three stacked
   * dial-sized steppers would read as a form; three sentence rows read as one
   * thought, and take up less room than the two big ones they replace.
   */
  const numberRow = (
    lead: string,
    value: number,
    set: (n: number) => void,
    unit: string,
    min: number,
    max: number,
  ) => {
    const round: React.CSSProperties = {
      width: 30,
      height: 30,
      borderRadius: '50%',
      border: '1px solid var(--border)',
      background: 'var(--paper)',
      color: 'var(--green)',
      cursor: 'pointer',
      display: 'grid',
      placeItems: 'center',
      flexShrink: 0,
      padding: 0,
    };
    return (
      <div
        className="flex items-center"
        style={{
          gap: 10,
          padding: '10px 13px',
          marginBottom: 7,
          border: '1px solid var(--border)',
          borderRadius: 4,
          background: 'var(--card)',
        }}
      >
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontFamily: fSerif,
            fontSize: 16,
            letterSpacing: '-0.01em',
            color: 'var(--text-soft)',
          }}
        >
          {lead}
        </span>
        <button onClick={() => set(Math.max(min, value - 1))} aria-label={`One fewer ${unit}`} style={round}>
          <Minus size={15} strokeWidth={2} />
        </button>
        <span
          style={{
            fontFamily: fSerif,
            fontSize: 27,
            lineHeight: 1,
            letterSpacing: '-0.03em',
            color: 'var(--text)',
            minWidth: 28,
            textAlign: 'center',
            flexShrink: 0,
          }}
        >
          {value}
        </span>
        <button onClick={() => set(Math.min(max, value + 1))} aria-label={`One more ${unit}`} style={round}>
          <Plus size={15} strokeWidth={2} />
        </button>
        <span
          style={{
            fontFamily: fMono,
            fontSize: 9,
            letterSpacing: '0.13em',
            textTransform: 'uppercase',
            color: 'var(--muted)',
            flexShrink: 0,
            minWidth: 42,
          }}
        >
          {unit}
        </span>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="rf-card rf-modal-tall w-full max-w-[640px] mx-3 flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between" style={{ padding: '18px 22px 14px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <span style={{ fontFamily: fMono, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--green)' }}>
              {step === 1
                ? 'Set up · once'
                : step === 2
                  ? `${picks.length} of ${meals} meals · ${totalNights} night${totalNights === 1 ? '' : 's'}`
                  : 'Put them on days'}
            </span>
            <h2 style={{ margin: '6px 0 0', fontFamily: fSerif, fontWeight: 400, fontSize: 23, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              Plan the week
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', lineHeight: 0, padding: 4 }}>
            <XIcon size={19} strokeWidth={1.8} />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ padding: '20px 22px', flex: 1 }}>
          {/* ── Step 1: one sentence, three numbers ───── */}
          {step === 1 && (
            <div>
              <h3 style={{ margin: '0 0 14px', fontFamily: fSerif, fontWeight: 400, fontSize: 20, letterSpacing: '-0.015em', color: 'var(--text)' }}>
                How does a normal week go?
              </h3>

              {numberRow('I want to cook', meals, setMeals, 'meals', 1, 14)}
              {numberRow('for', servings, setServings, 'people', 1, 12)}
              {numberRow('and eat each', nights, setNights, 'nights', 1, 7)}

              {/* The whole point of the sentence: you never do the multiplication. */}
              <div style={{ marginTop: 16, padding: '13px 15px', borderLeft: '2px solid var(--green)', background: 'var(--green-light)', borderRadius: '0 3px 3px 0' }}>
                <p style={{ margin: 0, fontFamily: fSerif, fontSize: 19, letterSpacing: '-0.015em', lineHeight: 1.25, color: 'var(--text)' }}>
                  That's{' '}
                  <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>
                    {plannedNights} night{plannedNights === 1 ? '' : 's'}
                  </em>{' '}
                  of dinner.
                </p>
                <p style={{ margin: '5px 0 0', fontFamily: fSans, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-soft)' }}>
                  {nights === 1
                    ? `Cooked fresh each night — every cook shops for ${servings}.`
                    : `One pot covers ${nights} nights, so each cook shops for ${servings * nights} servings.`}
                  {plannedNights > 7 && ' More than seven nights — you’ll have some spare.'}
                </p>
              </div>

              <p style={{ margin: '12px 0 0', fontFamily: fMono, fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Saved for next time — you'll skip straight to picking
              </p>
            </div>
          )}

          {/* ── Step 2: pick the recipes ─────────────── */}
          {step === 2 && (
            <div>
              <div
                className="flex items-center justify-between"
                style={{ border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', padding: '6px 8px 6px 14px', marginBottom: 14 }}
              >
                <span style={{ fontFamily: fMono, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
                  {meals} × {nights} night{nights === 1 ? '' : 's'} · {servings} per night
                </span>
                <button
                  onClick={() => setStep(1)}
                  style={{ fontFamily: fSans, fontSize: 12, color: 'var(--green)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', background: 'none', cursor: 'pointer' }}
                >
                  Change
                </button>
              </div>

              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search recipes…"
                className="rf-input w-full"
                style={{ marginBottom: 12 }}
              />

              <div className="flex gap-2" style={{ marginBottom: pickableCookbooks.length > 0 ? 12 : 16, flexWrap: 'wrap' }}>
                {([
                  ['suggested', 'Not cooked lately'],
                  ['favourites', 'Favourites'],
                  ['recent', 'Newest'],
                  ['all', 'All'],
                ] as [Filter, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFilter(key)}
                    style={{
                      fontFamily: fMono,
                      fontSize: 9,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      padding: '6px 11px',
                      borderRadius: 999,
                      cursor: 'pointer',
                      border: `1px solid ${filter === key ? 'var(--green-solid)' : 'var(--border)'}`,
                      background: filter === key ? 'var(--green-solid)' : 'transparent',
                      color: filter === key ? '#fff' : 'var(--muted)',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {/* Your shelves, right here — half the week is already decided in a
                  cookbook, so make it pickable without leaving plan mode. */}
              {pickableCookbooks.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontFamily: fMono, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}>
                    From a cookbook
                  </div>
                  {/* One scrolling rail rather than a wrapping block — a big shelf
                      would otherwise push the recipes below the fold. */}
                  <div className="flex gap-2 overflow-x-auto pb-1" style={{ flexWrap: 'nowrap' }}>
                    {pickableCookbooks.map((cb) => {
                      const key: Filter = `${COOKBOOK_PREFIX}${cb.id}`;
                      const on = filter === key;
                      const count = cookbookRecipes[cb.id]?.size ?? 0;
                      return (
                        <button
                          key={cb.id}
                          onClick={() => setFilter(on ? 'suggested' : key)}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            fontFamily: fSans,
                            fontSize: 12,
                            padding: '6px 12px',
                            borderRadius: 999,
                            cursor: 'pointer',
                            border: `1px solid ${on ? 'var(--green-solid)' : 'var(--border)'}`,
                            background: on ? 'var(--green-solid)' : 'transparent',
                            color: on ? '#fff' : 'var(--text-soft)',
                            flexShrink: 0,
                            maxWidth: 220,
                          }}
                        >
                          <span aria-hidden>{cb.emoji || '📗'}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cb.name}</span>
                          <span style={{ fontFamily: fMono, fontSize: 9.5, opacity: on ? 0.85 : 0.6 }}>{count}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {activeCookbook && (
                <p style={{ margin: '0 0 12px', fontFamily: fSans, fontSize: 12.5, color: 'var(--muted)' }}>
                  Showing <strong style={{ color: 'var(--text-soft)' }}>{activeCookbook.name}</strong>, least recently cooked first.{' '}
                  <button
                    onClick={() => setFilter('suggested')}
                    style={{ fontFamily: fSans, fontSize: 12.5, color: 'var(--green)', background: 'none', border: 'none', padding: 0, cursor: 'pointer', textDecoration: 'underline' }}
                  >
                    Show everything
                  </button>
                </p>
              )}

              {loading && (
                <p className="text-center py-6" style={{ fontFamily: fSerif, fontStyle: 'italic', color: 'var(--muted)' }}>Loading…</p>
              )}

              {!loading && visible.length === 0 && (
                <p className="text-center py-6" style={{ fontFamily: fSerif, fontStyle: 'italic', color: 'var(--muted)' }}>
                  {search.trim() ? 'No recipes match that search.' : 'Nothing to pick here yet.'}
                </p>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {visible.map((recipe) => {
                  const pick = picks.find((p) => p.recipe.id === recipe.id);
                  return (
                    <div key={recipe.id} style={{ position: 'relative' }}>
                      <button
                        onClick={() => togglePick(recipe)}
                        style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
                      >
                        <div
                          style={{
                            position: 'relative',
                            aspectRatio: '4 / 3',
                            borderRadius: 4,
                            overflow: 'hidden',
                            background: 'var(--paper3)',
                            boxShadow: pick ? '0 0 0 2px var(--green)' : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                          }}
                        >
                          {recipe.image_url ? (
                            <img src={recipe.image_url} alt="" className="absolute inset-0 w-full h-full object-cover" />
                          ) : (
                            <div className="absolute inset-0 flex items-center justify-center" style={{ color: 'var(--muted)' }}>
                              <Utensils size={22} strokeWidth={1.3} />
                            </div>
                          )}
                          <span
                            style={{
                              position: 'absolute',
                              top: 6,
                              right: 6,
                              width: 22,
                              height: 22,
                              borderRadius: '50%',
                              display: 'grid',
                              placeItems: 'center',
                              background: pick ? 'var(--green-solid)' : 'rgba(31,27,22,0.45)',
                              color: '#fff',
                            }}
                          >
                            {pick ? <Check size={12} strokeWidth={3} /> : <Plus size={12} strokeWidth={2.5} />}
                          </span>
                        </div>
                        <p style={{ margin: '6px 0 0', fontFamily: fSerif, fontSize: 14, lineHeight: 1.2, letterSpacing: '-0.01em', color: 'var(--text)' }}>
                          {recipe.title}
                        </p>
                      </button>

                      {/* Meal prep: one cook, several nights. */}
                      {pick && (
                        <button
                          onClick={() => cycleNights(recipe.id)}
                          title="How many nights this cook covers"
                          style={{
                            marginTop: 5,
                            fontFamily: fMono,
                            fontSize: 9,
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            padding: '4px 9px',
                            borderRadius: 999,
                            border: '1px solid var(--green)',
                            background: 'var(--green-light)',
                            color: 'var(--green)',
                            cursor: 'pointer',
                          }}
                        >
                          {pick.nights} night{pick.nights > 1 ? 's' : ''} · serves {servings * pick.nights}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── Step 3: place them ───────────────────── */}
          {step === 3 && (
            <div>
              <p style={{ margin: '0 0 14px', fontFamily: fSans, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-soft)' }}>
                Pick a night below, then tap a day. Anything you leave sits in the week without a day — that's fine.
              </p>

              {DAY_INDEXES.map((d) => {
                const slot = slots.find((s) => s.day === d);
                const recipe = slot ? recipeFor(slot.recipeId) : undefined;
                const busy = takenDays.has(d);
                const date = dayDate(weekStart, d);
                return (
                  <button
                    key={d}
                    onClick={() => !busy && placeOnDay(d)}
                    disabled={busy}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      width: '100%',
                      textAlign: 'left',
                      padding: '9px 10px',
                      marginBottom: 6,
                      borderRadius: 4,
                      cursor: busy ? 'not-allowed' : 'pointer',
                      border: `1px ${slot || busy ? 'solid' : 'dashed'} ${slot ? 'var(--green)' : 'var(--border)'}`,
                      background: slot ? 'var(--green-light)' : 'var(--card)',
                      opacity: busy ? 0.5 : 1,
                    }}
                  >
                    <span style={{ fontFamily: fMono, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--muted)', width: 46, flexShrink: 0 }}>
                      {DAY_SHORT[d]} {date.getDate()}
                    </span>
                    {recipe ? (
                      <>
                        {recipe.image_url ? (
                          <img src={recipe.image_url} alt="" style={{ width: 32, height: 32, borderRadius: 3, objectFit: 'cover' }} />
                        ) : (
                          <span style={{ width: 32, height: 32, borderRadius: 3, background: 'var(--paper3)' }} />
                        )}
                        <span style={{ flex: 1, fontFamily: fSerif, fontSize: 15, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {recipe.title}
                        </span>
                      </>
                    ) : (
                      <span style={{ flex: 1, fontFamily: fMono, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                        {busy ? 'Already planned' : activeSlot ? 'Tap to place' : 'Free'}
                      </span>
                    )}
                  </button>
                );
              })}

              {/* Nights still waiting for a day */}
              <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
                <div className="flex items-baseline justify-between" style={{ marginBottom: 10 }}>
                  <span style={{ fontFamily: fMono, fontSize: 9, letterSpacing: '0.15em', textTransform: 'uppercase', color: 'var(--muted)' }}>Still to place</span>
                  <span style={{ fontFamily: fMono, fontSize: 10, color: 'var(--muted)' }}>{slots.filter((s) => s.day === null).length}</span>
                </div>
                <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
                  {slots.filter((s) => s.day === null).map((s) => {
                    const recipe = recipeFor(s.recipeId);
                    const isActive = activeSlot === s.key;
                    return (
                      <button
                        key={s.key}
                        onClick={() => setActiveSlot(s.key)}
                        title={recipe?.title}
                        style={{
                          width: 52,
                          height: 52,
                          borderRadius: 3,
                          overflow: 'hidden',
                          background: 'var(--paper3)',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          boxShadow: isActive ? '0 0 0 2px var(--green)' : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                        }}
                      >
                        {recipe?.image_url ? (
                          <img src={recipe.image_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        ) : (
                          <span style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--muted)' }}>
                            <Utensils size={16} strokeWidth={1.3} />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-2" style={{ padding: '14px 22px 18px', borderTop: '1px solid var(--border)' }}>
          {step === 1 && (
            <button
              onClick={() => {
                onSavePrefs({ meals, servings, nights });
                setStep(2);
              }}
              style={primaryBtn}
            >
              Choose recipes →
            </button>
          )}
          {step === 2 && (
            <>
              <button onClick={onClose} style={ghostBtn}>Cancel</button>
              <button onClick={goToPlacement} disabled={picks.length === 0} style={{ ...primaryBtn, opacity: picks.length === 0 ? 0.45 : 1, cursor: picks.length === 0 ? 'not-allowed' : 'pointer' }}>
                {picks.length === 0 ? 'Pick some meals' : `Next — ${totalNights} night${totalNights === 1 ? '' : 's'} →`}
              </button>
            </>
          )}
          {step === 3 && (
            <>
              <button onClick={autoFill} style={ghostBtn}>
                <Wand2 size={14} strokeWidth={1.8} style={{ marginRight: 6, display: 'inline', verticalAlign: -2 }} />
                Fill it in for me
              </button>
              <button onClick={commit} disabled={saving} style={{ ...primaryBtn, opacity: saving ? 0.6 : 1 }}>
                {saving ? 'Adding…' : 'Done'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const primaryBtn: React.CSSProperties = {
  flex: 1,
  padding: '11px 0',
  borderRadius: 999,
  border: '1px solid var(--green)',
  background: 'var(--green-solid)',
  color: '#fff',
  fontFamily: fSans,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

const ghostBtn: React.CSSProperties = {
  flex: 1,
  padding: '11px 0',
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--card)',
  color: 'var(--text)',
  fontFamily: fSans,
  fontSize: 14,
  cursor: 'pointer',
};
