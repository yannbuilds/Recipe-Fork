import { useEffect, useState } from 'react';
import { Minus, Plus, X as XIcon, Utensils, Wand2 } from 'lucide-react';
import type { Recipe } from '@recipe-aggregator/shared';
import RecipeBrowser from './RecipeBrowser';
import useRecipeBrowserData from '../hooks/useRecipeBrowserData';
import { fSerif, fSans, fMono } from '../styles/pieKeeper';
import { DAY_SHORT, DAY_INDEXES, dayDate, todayIndex, planServings } from '../utils/mealPlanDays';

export interface PlanPrefs {
  /** Cooks in the week — pots on the stove, not nights at the table. */
  meals: number;
  /** People eating one meal. */
  servings: number;
  /** Meals one cook covers, without assigning the later meals to dates. */
  nights: number;
}

export interface PlanPick {
  recipe: Recipe;
  nights: number;
}

/** One cook — the only unit that gets placed on a day. */
interface Slot {
  key: string;
  recipeId: string;
  day: number | null;
}

interface Props {
  open: boolean;
  weekStart: Date;
  /** Days already spoken for by meals in the week. */
  takenDays: Set<number>;
  prefs: PlanPrefs | null;
  onSavePrefs: (prefs: PlanPrefs) => void;
  onCommit: (picks: PlanPick[], slots: { recipeId: string; day: number | null }[], servingsPerMeal: number) => Promise<void>;
  onClose: () => void;
}

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
  const [picks, setPicks] = useState<PlanPick[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [activeSlot, setActiveSlot] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // The collection, its cookbooks and the cooking history — the same data the
  // add-a-recipe picker browses.
  const data = useRecipeBrowserData(open);

  useEffect(() => {
    if (!open) return;
    setStep(prefs ? 2 : 1);
    setMeals(prefs?.meals ?? 3);
    setServings(prefs?.servings ?? 2);
    setNights(prefs?.nights ?? 2);
    setPicks([]);
    setSlots([]);
    setActiveSlot(null);
  }, [open, prefs]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const totalMeals = picks.reduce((sum, p) => sum + p.nights, 0);
  // What the setup answers add up to: cooks × meals covered by each batch.
  const plannedMeals = meals * nights;
  // A pick can always be cycled past the default — the answer is a starting
  // point, not a cap.
  const maxNights = Math.max(3, nights);
  const pickedIds = new Set(picks.map((p) => p.recipe.id));

  function togglePick(recipe: Recipe) {
    setPicks((prev) => {
      const found = prev.find((p) => p.recipe.id === recipe.id);
      if (found) return prev.filter((p) => p.recipe.id !== recipe.id);
      // Everything starts on the answer from step 1 — most cooks here are meal
      // prep, so 1 meal would mean re-tapping every card.
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
    const next: Slot[] = picks.map((pick) => ({
      key: pick.recipe.id,
      recipeId: pick.recipe.id,
      day: null,
    }));
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

    // Longest cooks choose first, so the 90-minute braise gets a weekend.
    const open = slots
      .filter((s) => s.day === null)
      .sort((a, b) => minutesFor(b.recipeId) - minutesFor(a.recipeId));

    const assigned = new Map<string, number>();
    for (const slot of open) {
      if (free.length === 0) break;
      const weekend = free.filter((d) => d === 0 || d === 6);
      const day = minutesFor(slot.recipeId) >= 45 && weekend.length > 0 ? weekend[0] : free[0];
      take(day);
      assigned.set(slot.key, day);
    }
    setSlots((prev) => prev.map((s) => (assigned.has(s.key) ? { ...s, day: assigned.get(s.key)! } : s)));
    setActiveSlot(null);
  }

  function minutesFor(recipeId: string): number {
    const r = data.recipes.find((x) => x.id === recipeId);
    return (r?.prep_time ?? 0) + (r?.cook_time ?? 0);
  }

  function recipeFor(id: string): Recipe | undefined {
    return data.recipes.find((r) => r.id === id);
  }

  /**
   * What one pick gets shopped for, and whether the recipe — not the maths —
   * set that number. `asWritten` is the case worth labelling: the recipe already
   * makes more than people × meals, so it's planned whole instead of scaled down.
   */
  function servingsFor(pick: PlanPick): { total: number; asWritten: boolean } {
    const total = planServings(pick.recipe, servings, pick.nights);
    return { total, asWritten: total > servings * pick.nights };
  }

  async function commit() {
    setSaving(true);
    await onCommit(
      picks,
      slots.map((s) => ({ recipeId: s.recipeId, day: s.day })),
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

  /** Prefs recap — sits above the browser's mode switch, so the answers you
   *  gave are always in sight and always one click from being changed. */
  const prefsRecap = (
    <div
      className="flex items-center justify-between"
      style={{ border: '1px solid var(--border)', borderRadius: 999, background: 'var(--card)', padding: '6px 8px 6px 14px', marginBottom: 14 }}
    >
      <span style={{ fontFamily: fMono, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-soft)' }}>
        {meals} cooks × {nights} meal{nights === 1 ? '' : 's'} · {servings} people
      </span>
      <button
        onClick={() => setStep(1)}
        style={{ fontFamily: fSans, fontSize: 12, color: 'var(--green)', border: '1px solid var(--border)', borderRadius: 999, padding: '4px 12px', background: 'none', cursor: 'pointer' }}
      >
        Change
      </button>
    </div>
  );

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
                  ? `${picks.length} of ${meals} cooks · ${totalMeals} meal${totalMeals === 1 ? '' : 's'}`
                  : 'Choose cooking days'}
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

              {numberRow('I want to cook', meals, setMeals, 'recipes', 1, 14)}
              {numberRow('for', servings, setServings, 'people', 1, 12)}
              {numberRow('each batch covers', nights, setNights, 'meals', 1, 7)}

              {/* The whole point of the sentence: you never do the multiplication. */}
              <div style={{ marginTop: 16, padding: '13px 15px', borderLeft: '2px solid var(--green)', background: 'var(--green-light)', borderRadius: '0 3px 3px 0' }}>
                <p style={{ margin: 0, fontFamily: fSerif, fontSize: 19, letterSpacing: '-0.015em', lineHeight: 1.25, color: 'var(--text)' }}>
                  That's{' '}
                  <em style={{ fontStyle: 'italic', color: 'var(--green)' }}>
                    {plannedMeals} meal{plannedMeals === 1 ? '' : 's'}
                  </em>{' '}
                  covered.
                </p>
                <p style={{ margin: '5px 0 0', fontFamily: fSans, fontSize: 12.5, lineHeight: 1.5, color: 'var(--text-soft)' }}>
                  {nights === 1
                    ? `Each cook shops for ${servings} serving${servings === 1 ? '' : 's'}.`
                    : `One cook covers ${nights} meals, so each batch shops for ${servings * nights} servings.`}
                  {plannedMeals > 7 && ' That covers more than seven dinners, so you’ll have some spare.'}
                  {' '}A recipe already written for more than that is planned whole, never scaled down.
                </p>
              </div>

              <p style={{ margin: '12px 0 0', fontFamily: fMono, fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase', color: 'var(--muted)' }}>
                Saved for next time — you'll skip straight to picking
              </p>
            </div>
          )}

          {/* ── Step 2: pick the recipes ─────────────── */}
          {step === 2 && (
            <RecipeBrowser
              open={open}
              data={data}
              selectedIds={pickedIds}
              onSelect={togglePick}
              topSlot={prefsRecap}
              renderCardExtra={(recipe) => {
                // One cook can cover several flexible meals.
                const pick = picks.find((p) => p.recipe.id === recipe.id);
                if (!pick) return null;
                const { total, asWritten } = servingsFor(pick);
                return (
                  <button
                    onClick={() => cycleNights(recipe.id)}
                    title={
                      asWritten
                        ? `How many meals this cook covers. This recipe already makes ${total}, so it's planned as written rather than scaled down to ${servings * pick.nights}.`
                        : 'How many meals this cook covers'
                    }
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
                    {pick.nights}× · {asWritten ? 'makes' : 'serves'} {total}
                  </button>
                );
              }}
            />
          )}

          {/* ── Step 3: place them ───────────────────── */}
          {step === 3 && (
            <div>
              <p style={{ margin: '0 0 14px', fontFamily: fSans, fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-soft)' }}>
                Pick a recipe below, then tap the day you plan to cook it. Later meals from the batch stay flexible.
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

              {/* Cooks still waiting for a day */}
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
                {picks.length === 0 ? 'Pick some recipes' : `Next — place ${picks.length} cook${picks.length === 1 ? '' : 's'} →`}
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
