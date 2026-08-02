import { useEffect, useState } from 'react';
import { Utensils, Store, X as XIcon } from 'lucide-react';
import { fSerif, fSans, fMono } from '../styles/pieKeeper';
import { DAY_FULL, dayDate } from '../utils/mealPlanDays';

interface Props {
  open: boolean;
  dayIndex: number | null;
  weekStart: Date;
  onCook: () => void;
  onEatingOut: (note: string) => void;
  onClose: () => void;
}

/**
 * The single sheet behind every empty day. Three choices, one of which is
 * deliberately "nothing" — a day you haven't decided on is a valid plan.
 */
export default function DayOptionsModal({
  open,
  dayIndex,
  weekStart,
  onCook,
  onEatingOut,
  onClose,
}: Props) {
  const [mode, setMode] = useState<'menu' | 'out'>('menu');
  const [note, setNote] = useState('');

  useEffect(() => {
    if (open) {
      setMode('menu');
      setNote('');
    }
  }, [open, dayIndex]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open || dayIndex === null) return null;

  const date = dayDate(weekStart, dayIndex);
  const dateLabel = date.toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: 14,
    width: '100%',
    padding: '14px 4px',
    background: 'none',
    border: 'none',
    borderTop: '1px solid var(--rule-hair)',
    cursor: 'pointer',
    textAlign: 'left',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="rf-card w-full max-w-[440px] mx-3"
        style={{ padding: '20px 22px 24px' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between" style={{ marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: fSerif, fontWeight: 400, fontSize: 22, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              {mode === 'out' ? 'Eating out' : DAY_FULL[dayIndex]}
            </h2>
            <p style={{ margin: '3px 0 0', fontFamily: fMono, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)' }}>
              {mode === 'menu' ? dateLabel : `${DAY_FULL[dayIndex]} ${dateLabel}`}
            </p>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', lineHeight: 0, padding: 4 }}>
            <XIcon size={18} strokeWidth={1.8} />
          </button>
        </div>

        {mode === 'menu' && (
          <div>
            <button style={rowStyle} onClick={onCook}>
              <Utensils size={19} strokeWidth={1.5} color="var(--green)" />
              <span className="flex-1">
                <span style={{ display: 'block', fontFamily: fSerif, fontSize: 17, color: 'var(--text)' }}>Cook something</span>
                <span style={{ display: 'block', fontFamily: fSans, fontSize: 12.5, color: 'var(--muted)', marginTop: 1 }}>Pick from your recipes</span>
              </span>
              <span style={{ color: 'var(--muted)' }}>›</span>
            </button>

            <button style={rowStyle} onClick={() => setMode('out')}>
              <Store size={19} strokeWidth={1.5} color="var(--green)" />
              <span className="flex-1">
                <span style={{ display: 'block', fontFamily: fSerif, fontSize: 17, color: 'var(--text)' }}>Eating out</span>
                <span style={{ display: 'block', fontFamily: fSans, fontSize: 12.5, color: 'var(--muted)', marginTop: 1 }}>Add a note if you like</span>
              </span>
            </button>

            <button style={rowStyle} onClick={onClose}>
              <XIcon size={19} strokeWidth={1.5} color="var(--muted)" />
              <span className="flex-1">
                <span style={{ display: 'block', fontFamily: fSerif, fontSize: 17, color: 'var(--text)' }}>Leave it open</span>
                <span style={{ display: 'block', fontFamily: fSans, fontSize: 12.5, color: 'var(--muted)', marginTop: 1 }}>Decide later — nothing will nag you</span>
              </span>
            </button>
          </div>
        )}

        {mode === 'out' && (
          <div>
            <label
              htmlFor="rf-out-note"
              style={{ display: 'block', fontFamily: fMono, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 8 }}
            >
              Where? (optional)
            </label>
            <input
              id="rf-out-note"
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') onEatingOut(note.trim());
              }}
              placeholder="Thai place, Mum's, work dinner…"
              className="rf-input w-full"
            />
            <div className="flex gap-2" style={{ marginTop: 16 }}>
              <button
                onClick={() => setMode('menu')}
                style={{ flex: 1, padding: '10px 0', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontFamily: fSans, fontSize: 13.5, cursor: 'pointer' }}
              >
                Back
              </button>
              <button
                onClick={() => onEatingOut(note.trim())}
                style={{ flex: 1, padding: '10px 0', borderRadius: 999, border: '1px solid var(--green-solid)', background: 'var(--green-solid)', color: '#fff', fontFamily: fSans, fontSize: 13.5, fontWeight: 500, cursor: 'pointer' }}
              >
                Set for {DAY_FULL[dayIndex]}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
