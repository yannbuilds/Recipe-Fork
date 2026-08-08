import { useEffect, useMemo, useState } from 'react';
import { X as XIcon } from 'lucide-react';
import type { Recipe } from '@recipe-aggregator/shared';
import RecipeBrowser, { type BrowseSort } from './RecipeBrowser';
import useRecipeBrowserData from '../hooks/useRecipeBrowserData';
import { fSerif, fSans, fMono } from '../styles/pieKeeper';

interface AddRecipeModalProps {
  open: boolean;
  /** Recipes already on the receiving side. Labelled, never blocked — you may
   *  well want a second batch of something, or the same thing twice. */
  existingRecipeIds: Set<string>;
  /** What that label says. */
  existingLabel?: string;
  /** Recipes to leave out of the list entirely. `existingRecipeIds` only labels
   *  a card; this one hides it — used to stop a recipe linking to itself. */
  excludeRecipeIds?: Set<string>;
  onAdd: (recipe: Recipe) => void;
  onClose: () => void;
  title?: string;
  /** Mono line above the title — says what this picker is for. */
  eyebrow?: string;
  /** Least recently cooked first, the order plan mode opens on. Call sites where
   *  you're hunting a known recipe by name (sub-recipe linking) pass 'a-z'. */
  defaultSort?: BrowseSort;
}

/**
 * Pick one recipe out of the collection. Deliberately the same screen as plan
 * mode's picking step — same modal, same All-recipes / Cookbooks switch, same
 * search, filters and plate grid — because it is the same job. The only
 * difference is that one click here chooses and you're done.
 */
export default function AddRecipeModal({
  open,
  existingRecipeIds,
  existingLabel = 'Already added',
  excludeRecipeIds,
  onAdd,
  onClose,
  title = 'Add a recipe',
  eyebrow = 'Pick a recipe',
  defaultSort = 'suggested',
}: AddRecipeModalProps) {
  const data = useRecipeBrowserData(open);
  // Something you just added drops out of the list, so a picker you keep open
  // (adding several to a cookbook) always shows what's left to add.
  const [added, setAdded] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) setAdded(new Set());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const hidden = useMemo(() => {
    if (!excludeRecipeIds?.size) return added;
    return new Set([...added, ...excludeRecipeIds]);
  }, [added, excludeRecipeIds]);

  if (!open) return null;

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
              {added.size > 0 ? `${added.size} added · keep going` : eyebrow}
            </span>
            <h2 style={{ margin: '6px 0 0', fontFamily: fSerif, fontWeight: 400, fontSize: 23, letterSpacing: '-0.02em', color: 'var(--text)' }}>
              {title}
            </h2>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', lineHeight: 0, padding: 4 }}>
            <XIcon size={19} strokeWidth={1.8} />
          </button>
        </div>

        <div className="overflow-y-auto" style={{ padding: '20px 22px', flex: 1 }}>
          <RecipeBrowser
            open={open}
            data={data}
            excludeIds={hidden}
            defaultSort={defaultSort}
            emptyLabel="No recipes to add."
            autoFocusSearch
            onSelect={(recipe) => {
              onAdd(recipe);
              setAdded((prev) => new Set(prev).add(recipe.id));
            }}
            renderCardExtra={(recipe) =>
              existingRecipeIds.has(recipe.id) ? (
                <p style={{ margin: '4px 0 0', fontFamily: fMono, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--green)' }}>
                  {existingLabel}
                </p>
              ) : null
            }
          />
        </div>

        {/* Footer — one click picks and this closes, so all it needs is the way out. */}
        <div className="flex gap-2" style={{ padding: '14px 22px 18px', borderTop: '1px solid var(--border)' }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '11px 0',
              borderRadius: 999,
              border: added.size > 0 ? '1px solid var(--green)' : '1px solid var(--border)',
              background: added.size > 0 ? 'var(--green-solid)' : 'var(--card)',
              color: added.size > 0 ? '#fff' : 'var(--text)',
              fontFamily: fSans,
              fontSize: 14,
              fontWeight: added.size > 0 ? 500 : 400,
              cursor: 'pointer',
            }}
          >
            {added.size > 0 ? `Done · ${added.size} added` : 'Cancel'}
          </button>
        </div>
      </div>
    </div>
  );
}
