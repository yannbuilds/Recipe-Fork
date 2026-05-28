import { useEffect, useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import CookbookFormModal from './CookbookFormModal';

interface Suggestion {
  name: string;
  description: string;
  emoji: string;
  recipe_ids: string[];
}

interface RecipeLite {
  id: string;
  title: string;
  image_url: string | null;
}

interface SuggestCookbooksModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: (cookbook: Cookbook, recipeCount: number) => void;
}

type Status = 'idle' | 'loading' | 'empty' | 'error' | 'ready';

export default function SuggestCookbooksModal({ open, onClose, onCreated }: SuggestCookbooksModalProps) {
  const { user } = useAuth();
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recipeLookup, setRecipeLookup] = useState<Record<string, RecipeLite>>({});
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [creatingIdx, setCreatingIdx] = useState<number | null>(null);
  const [createErrorIdx, setCreateErrorIdx] = useState<number | null>(null);
  const [editing, setEditing] = useState<Suggestion | null>(null);
  const [previousNames, setPreviousNames] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !editing) onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose, editing]);

  useEffect(() => {
    if (!open || !user) return;
    setExpanded(new Set());
    setCreateErrorIdx(null);
    setPreviousNames([]);
    fetchSuggestions([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user]);

  async function fetchSuggestions(avoidNames: string[]) {
    setStatus('loading');
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('suggest-cookbooks', {
        body: { avoidNames },
      });
      if (fnErr) {
        setError(fnErr.message);
        setStatus('error');
        return;
      }
      const list: Suggestion[] = Array.isArray(data?.suggestions) ? data.suggestions : [];
      if (data?.reason === 'library_too_small' || list.length === 0) {
        setSuggestions([]);
        setStatus(data?.reason === 'library_too_small' ? 'empty' : 'error');
        if (data?.reason !== 'library_too_small') {
          setError('No suggestions returned. Try again in a moment.');
        }
        return;
      }
      setSuggestions(list);
      setPreviousNames((prev) => [...prev, ...list.map((s) => s.name)]);

      // Fetch titles + thumbnails for all referenced recipe ids
      const allIds = Array.from(new Set(list.flatMap((s) => s.recipe_ids)));
      if (allIds.length > 0) {
        const { data: rec } = await supabase
          .from('recipes')
          .select('id, title, image_url')
          .in('id', allIds);
        const lookup: Record<string, RecipeLite> = {};
        for (const r of (rec ?? []) as RecipeLite[]) {
          lookup[r.id] = r;
        }
        setRecipeLookup(lookup);
      }
      setStatus('ready');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
      setStatus('error');
    }
  }

  async function handleCreate(idx: number) {
    if (!user) return;
    const s = suggestions[idx];
    setCreatingIdx(idx);
    setCreateErrorIdx(null);
    const { data: cb, error: cbErr } = await supabase
      .from('cookbooks')
      .insert({
        user_id: user.id,
        name: s.name,
        description: s.description || null,
        emoji: s.emoji,
      })
      .select()
      .single();
    if (cbErr || !cb) {
      setCreateErrorIdx(idx);
      setError(cbErr?.message ?? 'Could not create cookbook');
      setCreatingIdx(null);
      return;
    }
    if (s.recipe_ids.length > 0) {
      const rows = s.recipe_ids.map((rid) => ({
        cookbook_id: cb.id,
        recipe_id: rid,
      }));
      const { error: linkErr } = await supabase.from('cookbook_recipes').insert(rows);
      if (linkErr) {
        setCreateErrorIdx(idx);
        setError(linkErr.message);
        setCreatingIdx(null);
        return;
      }
    }
    onCreated(cb as Cookbook, s.recipe_ids.length);
    setSuggestions((prev) => prev.filter((_, i) => i !== idx));
    setCreatingIdx(null);
  }

  if (!open) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3"
        onClick={editing ? undefined : onClose}
        style={{ animation: 'fadeIn 0.15s ease both' }}
      >
        <div
          className="rf-card max-w-2xl w-full max-h-[90vh] overflow-y-auto"
          style={{ padding: 24 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-start justify-between mb-1">
            <h2 className="rf-heading text-lg font-semibold" style={{ color: 'var(--text)' }}>
              ✨ Suggested cookbooks
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
            Themed groupings based on the recipes in your library.
          </p>

          {status === 'loading' && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="rf-card"
                  style={{
                    padding: 16,
                    background: 'var(--warm)',
                    border: '1px solid var(--border)',
                    opacity: 0.7,
                  }}
                >
                  <div style={{ height: 18, width: '40%', background: 'var(--border)', borderRadius: 6, marginBottom: 8 }} />
                  <div style={{ height: 14, width: '80%', background: 'var(--border)', borderRadius: 6 }} />
                </div>
              ))}
              <p className="text-center text-sm" style={{ color: 'var(--muted)' }}>
                Asking the AI to group your recipes…
              </p>
            </div>
          )}

          {status === 'empty' && (
            <div className="text-center py-10">
              <p className="text-base font-semibold mb-2" style={{ color: 'var(--text)' }}>
                Not enough recipes yet
              </p>
              <p className="text-sm" style={{ color: 'var(--muted)' }}>
                Save a few more recipes first — AI suggestions need at least 5 to work with.
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
            <>
              {suggestions.length === 0 ? (
                <p className="text-center py-8 text-sm" style={{ color: 'var(--muted)' }}>
                  All suggestions handled. Regenerate for more ideas.
                </p>
              ) : (
                <div className="space-y-3">
                  {suggestions.map((s, idx) => {
                    const isExpanded = expanded.has(idx);
                    const isCreating = creatingIdx === idx;
                    const hasError = createErrorIdx === idx;
                    return (
                      <div
                        key={`${s.name}-${idx}`}
                        className="rf-card"
                        style={{
                          padding: 16,
                          border: hasError ? '1px solid var(--red-border)' : '1px solid var(--border)',
                          background: 'var(--card)',
                        }}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className="shrink-0 flex items-center justify-center rounded-lg"
                            style={{
                              width: 44,
                              height: 44,
                              fontSize: 26,
                              background: 'var(--warm)',
                            }}
                          >
                            {s.emoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold" style={{ color: 'var(--text)' }}>
                              {s.name}
                            </p>
                            {s.description && (
                              <p className="text-sm mt-0.5" style={{ color: 'var(--muted)' }}>
                                {s.description}
                              </p>
                            )}
                            <button
                              onClick={() => {
                                setExpanded((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(idx)) next.delete(idx);
                                  else next.add(idx);
                                  return next;
                                });
                              }}
                              className="text-xs font-semibold mt-2"
                              style={{ color: 'var(--green)' }}
                            >
                              {isExpanded ? 'Hide' : 'Show'} {s.recipe_ids.length} recipe
                              {s.recipe_ids.length === 1 ? '' : 's'}
                            </button>
                          </div>
                        </div>

                        {isExpanded && (
                          <div
                            className="mt-3 space-y-1"
                            style={{
                              borderTop: '1px solid var(--border)',
                              paddingTop: 10,
                            }}
                          >
                            {s.recipe_ids.map((rid) => {
                              const r = recipeLookup[rid];
                              return (
                                <div key={rid} className="flex items-center gap-2">
                                  {r?.image_url ? (
                                    <img
                                      src={r.image_url}
                                      alt=""
                                      className="w-8 h-8 rounded-md object-cover shrink-0"
                                    />
                                  ) : (
                                    <div
                                      className="w-8 h-8 rounded-md shrink-0 flex items-center justify-center"
                                      style={{ background: 'var(--warm)' }}
                                    >
                                      🍴
                                    </div>
                                  )}
                                  <p
                                    className="text-sm truncate"
                                    style={{ color: 'var(--text)' }}
                                  >
                                    {r?.title ?? 'Recipe'}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        <div className="flex flex-wrap gap-2 mt-3">
                          <button
                            onClick={() => handleCreate(idx)}
                            disabled={isCreating}
                            className="rf-btn rf-btn-filled flex-1 sm:flex-initial"
                          >
                            {isCreating ? 'Creating…' : 'Create'}
                          </button>
                          <button
                            onClick={() => setEditing(s)}
                            disabled={isCreating}
                            className="rf-btn rf-btn-secondary flex-1 sm:flex-initial"
                          >
                            Edit first
                          </button>
                        </div>
                        {hasError && error && (
                          <p className="text-xs mt-2" style={{ color: 'var(--red)' }}>
                            {error}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          <div className="flex justify-end gap-3 pt-5 mt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <button onClick={onClose} className="rf-btn rf-btn-secondary">
              Close
            </button>
            {(status === 'ready' || status === 'error') && (
              <button
                onClick={() => fetchSuggestions(previousNames)}
                className="rf-btn rf-btn-secondary"
              >
                Regenerate
              </button>
            )}
          </div>
        </div>
      </div>

      <CookbookFormModal
        open={!!editing}
        initialValues={editing ? { name: editing.name, description: editing.description, emoji: editing.emoji } : undefined}
        initialRecipeIds={editing?.recipe_ids}
        onClose={() => setEditing(null)}
        onSaved={(cb) => {
          const count = editing?.recipe_ids.length ?? 0;
          const name = editing?.name;
          setEditing(null);
          onCreated(cb, count);
          if (name) {
            setSuggestions((prev) => prev.filter((s) => s.name !== name));
          }
        }}
      />
    </>
  );
}
