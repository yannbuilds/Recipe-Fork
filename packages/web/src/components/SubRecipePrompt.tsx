import { useEffect, useState } from 'react';
import { subRecipeIdsIn, supabase } from '@recipe-aggregator/shared';
import type { Ingredient } from '@recipe-aggregator/shared';

/*
 * "Are you making the pastry, or buying it?"
 *
 * Asked once, when a recipe with a linked sub-recipe goes into a week. The
 * answer decides what the shopping list does with the linked line:
 *   make it → the line is swapped for that recipe's own ingredients
 *   buy it  → the line stays, as a finished thing to put in the trolley
 *
 * The body is exported separately from the modal shell because the week picker
 * shows it as one of its own steps rather than as a second modal on top.
 */

interface Linked {
  id: string;
  title: string;
}

interface BodyProps {
  recipeTitle: string;
  ingredients: Ingredient[];
  /** Recipes already being cooked in this same week, so we can say so. */
  alreadyPlannedIds?: Set<string>;
  onAnswer: (makeComponents: boolean) => void;
  busy?: boolean;
}

export function SubRecipePromptBody({
  recipeTitle,
  ingredients,
  alreadyPlannedIds,
  onAnswer,
  busy = false,
}: BodyProps) {
  const [linked, setLinked] = useState<Linked[] | null>(null);

  const ids = subRecipeIdsIn(ingredients);
  const idKey = [...ids].sort().join(',');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (ids.length === 0) {
        if (!cancelled) setLinked([]);
        return;
      }
      const { data } = await supabase.from('recipes').select('id, title').in('id', ids);
      if (!cancelled) setLinked((data as Linked[] | null) ?? []);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idKey]);

  // Every link is dead — deleted, or owned by someone outside the family group.
  // There's nothing to ask about, so answer for them and get out of the way.
  useEffect(() => {
    if (linked !== null && linked.length === 0) onAnswer(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked]);

  if (linked === null || linked.length === 0) {
    return (
      <p className="text-sm py-6 text-center" style={{ color: 'var(--muted)' }}>
        One moment…
      </p>
    );
  }

  // Already cooking it this week? Then its ingredients are on the list once
  // already, and expanding it again would buy the basil twice.
  const clashes = linked.filter((l) => alreadyPlannedIds?.has(l.id));
  const names = linked.map((l) => l.title);
  const list =
    names.length === 1
      ? names[0]
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

  return (
    <div className="flex flex-col gap-4 pt-1">
      <p className="text-sm" style={{ color: 'var(--muted)' }}>
        <strong style={{ color: 'var(--text)' }}>{recipeTitle}</strong> uses{' '}
        <strong style={{ color: 'var(--text)' }}>{list}</strong>.
      </p>

      {clashes.length > 0 && (
        <p
          className="text-sm rounded-lg px-3 py-2"
          style={{ background: 'var(--warm)', color: 'var(--muted)' }}
        >
          You&apos;re already cooking {clashes.map((c) => c.title).join(' and ')} this
          week, so the ingredients are on your list already.
        </p>
      )}

      <div className="flex flex-col gap-2">
        <button
          onClick={() => onAnswer(true)}
          disabled={busy}
          className="w-full text-left rounded-lg px-4 py-3 transition-colors"
          style={{
            background: clashes.length > 0 ? 'var(--bg)' : 'var(--green)',
            border: clashes.length > 0 ? '1px solid var(--border)' : 'none',
            color: clashes.length > 0 ? 'var(--text)' : '#fff',
            opacity: busy ? 0.5 : 1,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          <span className="block text-sm font-semibold">I&apos;ll make it</span>
          <span className="block text-xs mt-0.5" style={{ opacity: 0.8 }}>
            Shop for its ingredients instead
          </span>
        </button>
        <button
          onClick={() => onAnswer(false)}
          disabled={busy}
          className="w-full text-left rounded-lg px-4 py-3 transition-colors"
          style={{
            background: clashes.length > 0 ? 'var(--green)' : 'var(--bg)',
            border: clashes.length > 0 ? 'none' : '1px solid var(--border)',
            color: clashes.length > 0 ? '#fff' : 'var(--text)',
            opacity: busy ? 0.5 : 1,
            cursor: busy ? 'default' : 'pointer',
          }}
        >
          <span className="block text-sm font-semibold">I&apos;ll buy it</span>
          <span className="block text-xs mt-0.5" style={{ opacity: 0.8 }}>
            Keep it on the list as it&apos;s written
          </span>
        </button>
      </div>

      <p className="text-xs" style={{ color: 'var(--muted)' }}>
        You can change your mind from the meal&apos;s menu on the plan.
      </p>
    </div>
  );
}

interface Props extends BodyProps {
  open: boolean;
  onClose: () => void;
}

export default function SubRecipePrompt({ open, onClose, ...body }: Props) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      style={{ animation: 'fadeIn 0.15s ease both' }}
      onClick={onClose}
    >
      <div
        className="shadow-lg w-full max-w-md sm:mx-4"
        style={{
          background: 'var(--card)',
          borderRadius: '20px 20px 0 0',
          animation: 'slideUp 0.2s ease both',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <h2
            className="text-lg font-semibold"
            style={{ color: 'var(--text)', fontFamily: '"Newsreader", Georgia, serif' }}
          >
            Making it or buying it?
          </h2>
          <button
            onClick={onClose}
            className="text-xl leading-none px-1 rounded hover:bg-black/5 transition-colors"
            style={{ color: 'var(--muted)' }}
            aria-label="Close"
          >
            &times;
          </button>
        </div>
        <div className="px-5 pb-[calc(env(safe-area-inset-bottom,0px)+84px)] sm:pb-5">
          <SubRecipePromptBody {...body} />
        </div>
      </div>
    </div>
  );
}
