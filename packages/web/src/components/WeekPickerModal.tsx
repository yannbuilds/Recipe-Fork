import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@recipe-aggregator/shared';
import { getWeekOptions } from '../utils/weekHelpers';

type ModalStep = 'pick' | 'adding' | 'done' | 'confirm-remove' | 'removing' | 'removed';

interface WeekPickerModalProps {
  open: boolean;
  recipeId: string;
  recipeTitle: string;
  userId: string;
  onClose: () => void;
}

export default function WeekPickerModal({
  open,
  recipeId,
  recipeTitle,
  userId,
  onClose,
}: WeekPickerModalProps) {
  const [step, setStep] = useState<ModalStep>('pick');
  const [displayStep, setDisplayStep] = useState<ModalStep>('pick');
  const [fading, setFading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>('');
  const [selectedLabel, setSelectedLabel] = useState<string>('');
  const [addedWeeks, setAddedWeeks] = useState<Set<string>>(new Set());
  const closeRef = useRef<HTMLButtonElement>(null);

  // Reset state and fetch added weeks when modal opens
  useEffect(() => {
    if (open) {
      setStep('pick');
      setDisplayStep('pick');
      setFading(false);
      setSelectedWeek('');
      setSelectedLabel('');
      setTimeout(() => closeRef.current?.focus(), 50);

      // Fetch which weeks already have this recipe
      (async () => {
        const { data } = await supabase
          .from('meal_plan_recipes')
          .select('meal_plan_id, meal_plans!inner(week_start)')
          .eq('recipe_id', recipeId)
          .eq('meal_plans.user_id', userId);

        if (data) {
          const weeks = new Set(
            data.map((r: any) => r.meal_plans.week_start as string),
          );
          setAddedWeeks(weeks);
        }
      })();
    }
  }, [open, recipeId, userId]);

  // Crossfade transition between steps
  useEffect(() => {
    if (step !== displayStep) {
      setFading(true);
      const t = setTimeout(() => {
        setDisplayStep(step);
        setFading(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [step, displayStep]);

  // Escape key
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const weeks = getWeekOptions(4);

  async function addToWeek(weekStart: string, label: string) {
    setSelectedWeek(weekStart);
    setSelectedLabel(label);
    setStep('adding');

    let { data: plan } = await supabase
      .from('meal_plans')
      .select('id')
      .eq('user_id', userId)
      .eq('week_start', weekStart)
      .maybeSingle();

    if (!plan) {
      const { data: created } = await supabase
        .from('meal_plans')
        .insert({ user_id: userId, week_start: weekStart })
        .select('id')
        .single();
      plan = created;
    }

    if (!plan) {
      setStep('pick');
      return;
    }

    const { error } = await supabase
      .from('meal_plan_recipes')
      .insert({ meal_plan_id: plan.id, recipe_id: recipeId });

    if (error) {
      setStep('pick');
    } else {
      setAddedWeeks((prev) => new Set([...prev, weekStart]));
      setStep('done');
    }
  }

  function handleWeekClick(weekStart: string, label: string) {
    setSelectedWeek(weekStart);
    setSelectedLabel(label);

    if (addedWeeks.has(weekStart)) {
      setStep('confirm-remove');
    } else {
      addToWeek(weekStart, label);
    }
  }

  async function handleRemove() {
    setStep('removing');

    const { data: plan } = await supabase
      .from('meal_plans')
      .select('id')
      .eq('user_id', userId)
      .eq('week_start', selectedWeek)
      .maybeSingle();

    if (!plan) {
      setStep('pick');
      return;
    }

    const { error } = await supabase
      .from('meal_plan_recipes')
      .delete()
      .eq('meal_plan_id', plan.id)
      .eq('recipe_id', recipeId);

    if (error) {
      setStep('pick');
    } else {
      setAddedWeeks((prev) => {
        const next = new Set(prev);
        next.delete(selectedWeek);
        return next;
      });
      setStep('removed');
    }
  }

  const heading =
    displayStep === 'pick' || displayStep === 'adding'
      ? 'Add to Meal Plan'
      : displayStep === 'done'
        ? 'Added!'
        : displayStep === 'confirm-remove' || displayStep === 'removing'
          ? 'Remove from Meal Plan?'
          : 'Removed';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.5)', animation: 'fadeIn 0.2s ease' }}
      onClick={onClose}
    >
      <div
        className="rounded-xl shadow-lg w-full mx-4"
        style={{
          maxWidth: 400,
          background: 'var(--card)',
          animation: 'fadeUp 0.3s ease both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--text)', fontFamily: "'Lora', serif" }}
          >
            {heading}
          </h2>
          <button
            ref={closeRef}
            onClick={onClose}
            className="text-xl leading-none px-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: 'var(--muted)' }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>

        {/* Content with crossfade */}
        <div
          className="px-5 pb-5"
          style={{
            opacity: fading ? 0 : 1,
            transition: 'opacity 0.2s ease',
            minHeight: 200,
          }}
        >
          {/* ── Pick state ── */}
          {(displayStep === 'pick' || displayStep === 'adding') && (
            <div className="flex flex-col gap-2 pt-2">
              <p className="text-sm mb-1" style={{ color: 'var(--muted)' }}>
                Choose a week for <strong style={{ color: 'var(--text)' }}>{recipeTitle}</strong>
              </p>
              {weeks.map((week) => {
                const isAdding = displayStep === 'adding' && selectedWeek === week.weekStart;
                const isAdded = addedWeeks.has(week.weekStart);
                return (
                  <button
                    key={week.weekStart}
                    onClick={() => handleWeekClick(week.weekStart, week.label)}
                    disabled={displayStep === 'adding'}
                    className="w-full text-left rounded-lg px-4 py-3 transition-all"
                    style={{
                      background: week.isCurrent ? 'var(--green-light)' : 'var(--bg)',
                      border: week.isCurrent
                        ? '2px solid var(--green)'
                        : '1px solid var(--border)',
                      opacity: displayStep === 'adding' && !isAdding ? 0.5 : 1,
                      cursor: displayStep === 'adding' ? 'default' : 'pointer',
                    }}
                    onMouseEnter={(e) => {
                      if (displayStep !== 'adding') {
                        e.currentTarget.style.background = week.isCurrent
                          ? 'var(--green-light)'
                          : 'var(--warm)';
                      }
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = week.isCurrent
                        ? 'var(--green-light)'
                        : 'var(--bg)';
                    }}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <div className="flex items-center gap-2 shrink-0">
                        {week.isCurrent && (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{ background: 'var(--green)', color: '#fff' }}
                          >
                            This week
                          </span>
                        )}
                        {isAdded && (
                          <span
                            className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                            style={{
                              background: 'var(--green-light)',
                              color: 'var(--green)',
                              border: '1px solid var(--green)',
                            }}
                          >
                            ✓ Added
                          </span>
                        )}
                      </div>
                      <span
                        className="text-sm font-medium"
                        style={{ color: week.isCurrent ? 'var(--green)' : 'var(--text)' }}
                      >
                        {isAdding ? 'Adding...' : week.label}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Done state ── */}
          {displayStep === 'done' && (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                style={{ background: 'var(--green-light)', color: 'var(--green)' }}
              >
                ✓
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  {recipeTitle}
                </p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                  {selectedLabel}
                </p>
              </div>
              <div className="flex gap-3 mt-2 w-full">
                <Link
                  to="/meal-plan"
                  className="flex-1 text-center rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                  }}
                  onClick={onClose}
                >
                  View Meal Plan
                </Link>
                <button
                  onClick={onClose}
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  style={{
                    background: 'var(--green)',
                    color: '#fff',
                    border: 'none',
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          )}

          {/* ── Confirm remove state ── */}
          {(displayStep === 'confirm-remove' || displayStep === 'removing') && (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                style={{ background: 'var(--warm)', color: 'var(--muted)' }}
              >
                ?
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  Remove {recipeTitle}?
                </p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                  {selectedLabel}
                </p>
              </div>
              <div className="flex gap-3 mt-2 w-full">
                <button
                  onClick={() => setStep('pick')}
                  disabled={displayStep === 'removing'}
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  style={{
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    color: 'var(--text)',
                    opacity: displayStep === 'removing' ? 0.5 : 1,
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleRemove}
                  disabled={displayStep === 'removing'}
                  className="flex-1 rounded-lg px-4 py-2 text-sm font-semibold transition-colors"
                  style={{
                    background: 'var(--red)',
                    color: '#fff',
                    border: 'none',
                    opacity: displayStep === 'removing' ? 0.5 : 1,
                  }}
                >
                  {displayStep === 'removing' ? 'Removing...' : 'Remove'}
                </button>
              </div>
            </div>
          )}

          {/* ── Removed state ── */}
          {displayStep === 'removed' && (
            <div className="flex flex-col items-center text-center gap-3 py-4">
              <div
                className="w-12 h-12 rounded-full flex items-center justify-center text-xl"
                style={{ background: 'var(--warm)', color: 'var(--muted)' }}
              >
                ✓
              </div>
              <div>
                <p className="text-sm font-semibold" style={{ color: 'var(--text)' }}>
                  Removed from meal plan
                </p>
                <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                  {recipeTitle} &middot; {selectedLabel}
                </p>
              </div>
              <button
                onClick={onClose}
                className="mt-2 rounded-lg px-6 py-2 text-sm font-semibold transition-colors"
                style={{
                  background: 'var(--bg)',
                  border: '1px solid var(--border)',
                  color: 'var(--text)',
                }}
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
