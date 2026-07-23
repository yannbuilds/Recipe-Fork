import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { supabase } from '@recipe-aggregator/shared';
import { fSerif, fSans, fMono } from '../styles/pieKeeper';

/**
 * Post-cook rating modal: "How did you find it?" with three separate
 * 1–5 star scales (Taste / Ease / Value). Shown right after a recipe is
 * marked cooked; saving writes onto the recipe_cooks row that logged the
 * cook, skipping keeps the cook logged with no ratings.
 */

const ASPECTS = [
  { key: 'taste', label: 'Taste', hint: 'How good did it taste?' },
  { key: 'ease', label: 'Ease', hint: 'How easy was it to make?' },
  { key: 'value', label: 'Value', hint: 'Worth the cost & effort?' },
] as const;

type AspectKey = (typeof ASPECTS)[number]['key'];

interface RateCookModalProps {
  open: boolean;
  /** id of the recipe_cooks row to attach ratings to */
  cookId: string | null;
  recipeTitle?: string;
  /** Called after save or skip — the cook itself is already logged. */
  onClose: () => void;
}

function StarRow({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n === value ? 0 : n)}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          style={{
            background: 'none',
            border: 'none',
            padding: 3,
            cursor: 'pointer',
            lineHeight: 0,
            color: n <= value ? 'var(--orange)' : 'var(--border)',
            transition: 'color 0.15s ease, transform 0.15s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.transform = 'none'; }}
        >
          <Star size={26} strokeWidth={1.5} fill={n <= value ? 'currentColor' : 'none'} />
        </button>
      ))}
    </div>
  );
}

export default function RateCookModal({ open, cookId, recipeTitle, onClose }: RateCookModalProps) {
  const [ratings, setRatings] = useState<Record<AspectKey, number>>({ taste: 0, ease: 0, value: 0 });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setRatings({ taste: 0, ease: 0, value: 0 });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  const hasAny = ratings.taste > 0 || ratings.ease > 0 || ratings.value > 0;

  async function handleSave() {
    if (!cookId || !hasAny) {
      onClose();
      return;
    }
    setSaving(true);
    await supabase
      .from('recipe_cooks')
      .update({
        rating_taste: ratings.taste || null,
        rating_ease: ratings.ease || null,
        rating_value: ratings.value || null,
      })
      .eq('id', cookId);
    setSaving(false);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="rf-card max-w-sm w-full mx-4"
        style={{ padding: 28 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            fontFamily: fMono,
            fontSize: 10,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'var(--green)',
          }}
        >
          Cooked · nice one
        </div>
        <h2
          style={{
            margin: '10px 0 0',
            fontFamily: fSerif,
            fontWeight: 400,
            fontSize: 26,
            lineHeight: 1.1,
            letterSpacing: '-0.015em',
            color: 'var(--text)',
          }}
        >
          How did you find it?
        </h2>
        {recipeTitle && (
          <p className="mt-1" style={{ fontFamily: fSans, fontSize: 13, color: 'var(--muted)' }}>
            {recipeTitle}
          </p>
        )}

        <div className="mt-5 space-y-4">
          {ASPECTS.map((a) => (
            <div key={a.key} className="flex items-center justify-between gap-4">
              <div>
                <div
                  style={{
                    fontFamily: fMono,
                    fontSize: 10,
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--text)',
                  }}
                >
                  {a.label}
                </div>
                <div style={{ fontFamily: fSans, fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>
                  {a.hint}
                </div>
              </div>
              <StarRow
                value={ratings[a.key]}
                onChange={(v) => setRatings((prev) => ({ ...prev, [a.key]: v }))}
              />
            </div>
          ))}
        </div>

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            className="flex-1 transition-colors"
            style={{
              padding: '10px 0',
              borderRadius: 999,
              fontFamily: fSans,
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
              border: '1px solid var(--border)',
              background: 'var(--card)',
              color: 'var(--muted)',
            }}
          >
            Skip
          </button>
          <button
            onClick={handleSave}
            disabled={!hasAny || saving}
            className="flex-1 transition-colors"
            style={{
              padding: '10px 0',
              borderRadius: 999,
              fontFamily: fSans,
              fontSize: 13,
              fontWeight: 500,
              cursor: hasAny ? 'pointer' : 'default',
              border: '1px solid var(--green)',
              background: hasAny ? 'var(--green)' : 'var(--green-light)',
              color: hasAny ? '#fff' : 'var(--green)',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving…' : 'Save rating'}
          </button>
        </div>
      </div>
    </div>
  );
}
