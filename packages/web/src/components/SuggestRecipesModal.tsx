import { useEffect, useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook, Recipe } from '@recipe-aggregator/shared';

interface Suggestion {
  recipe_id: string;
  reason: string;
}

interface RecipeLite {
  id: string;
  title: string;
  image_url: string | null;
}

const RECIPE_SELECT =
  'id, user_id, title, image_url, prep_time, cook_time, servings, is_favourite, created_at, ingredients';

interface SuggestRecipesModalProps {
  open: boolean;
  cookbook: Cookbook;
  onClose: () => void;
  onAdded: (recipes: Recipe[]) => void;
}

type Status = 'idle' | 'loading' | 'empty' | 'error' | 'ready';

export default function SuggestRecipesModal({
  open,
  cookbook,
  onClose,
  onAdded,
}: SuggestRecipesModalProps) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recipeLookup, setRecipeLookup] = useState<Record<string, RecipeLite>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [seenIds, setSeenIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setSeenIds([]);
    fetchSuggestions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cookbook.id]);

  async function fetchSuggestions(avoidIds: string[]) {
    setStatus('loading');
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke(
        'suggest-cookbook-additions',
        {
          body: { cookbookId: cookbook.id, avoidIds },
        },
      );
      if (fnErr) {
        setError(fnErr.message);
        setStatus('error');
        return;
      }
      const list: Suggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
      if (data?.reason === 'not_enough_candidates' || list.length === 0) {
        setSuggestions([]);
        setStatus('empty');
        return;
      }
      setSuggestions(list);
      setSelected(new Set(list.map((s) => s.recipe_id)));
      setSeenIds((prev) => [...prev, ...list.map((s) => s.recipe_id)]);

      const ids = list.map((s) => s.recipe_id);
      const { data: rec } = await supabase
        .from('recipes')
        .select('id, title, image_url')
        .in('id', ids);
      const lookup: Record<string, RecipeLite> = {};
      for (const r of (rec ?? []) as RecipeLite[]) {
        lookup[r.id] = r;
      }
      setRecipeLookup(lookup);
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAddSelected() {
    if (selected.size === 0) return;
    setAdding(true);
    setError(null);
    const ids = Array.from(selected);
    const rows = ids.map((rid) => ({ cookbook_id: cookbook.id, recipe_id: rid }));
    const { error: linkErr } = await supabase.from('cookbook_recipes').insert(rows);
    if (linkErr) {
      setError(linkErr.message);
      setAdding(false);
      return;
    }
    const { data: fullRecipes } = await supabase
      .from('recipes')
      .select(RECIPE_SELECT)
      .in('id', ids);
    onAdded(((fullRecipes ?? []) as Recipe[]));
    setAdding(false);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.15s ease both' }}
    >
      <div
        className="rf-card max-w-2xl w-full max-h-[90vh] overflow-y-auto"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-1">
          <h2 className="rf-heading text-lg font-semibold" style={{ color: 'var(--text)' }}>
            ✨ Suggested recipes
          </h2>
          <button
            onClick={onClose}
            className="text-2xl leading-none px-2"
            style={{ color: 'var(--muted)' }}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--muted)' }}>
          Recipes from your library that fit <strong>{cookbook.name}</strong>.
        </p>

        {status === 'loading' && (
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rf-card"
                style={{
                  padding: 12,
                  background: 'var(--warm)',
                  border: '1px solid var(--border)',
                  opacity: 0.7,
                }}
              >
                <div style={{ height: 16, width: '60%', background: 'var(--border)', borderRadius: 6, marginBottom: 6 }} />
                <div style={{ height: 12, width: '90%', background: 'var(--border)', borderRadius: 6 }} />
              </div>
            ))}
            <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>
              Scanning your library for recipes that fit…
            </p>
          </div>
        )}

        {status === 'empty' && (
          <div className="text-center py-10">
            <p className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>
              No clear matches found
            </p>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              None of your other recipes obviously fit this cookbook's theme.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center py-8">
            <p className="text-sm mb-3" style={{ color: 'var(--red)' }}>
              {error ?? 'Something went wrong.'}
            </p>
            <button
              onClick={() => fetchSuggestions([])}
              className="rf-btn rf-btn-secondary"
            >
              Try again
            </button>
          </div>
        )}

        {status === 'ready' && (
          <div className="space-y-2">
            {suggestions.map((s) => {
              const r = recipeLookup[s.recipe_id];
              const isSelected = selected.has(s.recipe_id);
              return (
                <label
                  key={s.recipe_id}
                  className="rf-card flex items-start gap-3 cursor-pointer"
                  style={{
                    padding: 12,
                    border: `1px solid ${isSelected ? 'var(--green)' : 'var(--border)'}`,
                    background: 'var(--card)',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggle(s.recipe_id)}
                    className="mt-1"
                  />
                  {r?.image_url ? (
                    <img
                      src={r.image_url}
                      alt=""
                      className="w-12 h-12 rounded-md object-cover shrink-0"
                    />
                  ) : (
                    <div
                      className="w-12 h-12 rounded-md shrink-0 flex items-center justify-center"
                      style={{ background: 'var(--warm)' }}
                    >
                      🍴
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm" style={{ color: 'var(--text)' }}>
                      {r?.title ?? 'Recipe'}
                    </p>
                    {s.reason && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
                        {s.reason}
                      </p>
                    )}
                  </div>
                </label>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap justify-end gap-3 pt-5 mt-4" style={{ borderTop: '1px solid var(--border)' }}>
          <button onClick={onClose} className="rf-btn rf-btn-secondary">
            Close
          </button>
          {(status === 'ready' || status === 'error' || status === 'empty') && (
            <button
              onClick={() => fetchSuggestions(seenIds)}
              disabled={adding}
              className="rf-btn rf-btn-secondary"
            >
              Regenerate
            </button>
          )}
          {status === 'ready' && (
            <button
              onClick={handleAddSelected}
              disabled={adding || selected.size === 0}
              className="rf-btn rf-btn-filled"
            >
              {adding ? 'Adding…' : `Add ${selected.size} recipe${selected.size === 1 ? '' : 's'}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
