import { useEffect, useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook } from '@recipe-aggregator/shared';
import CookbookFormModal from './CookbookFormModal';

interface AddToCookbookSheetProps {
  open: boolean;
  recipeId: string;
  onClose: () => void;
}

export default function AddToCookbookSheet({ open, recipeId, onClose }: AddToCookbookSheetProps) {
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [cbResult, crResult] = await Promise.all([
        supabase
          .from('cookbooks')
          .select('id, user_id, name, description, emoji, created_at, updated_at')
          .order('created_at', { ascending: false }),
        supabase.from('cookbook_recipes').select('cookbook_id').eq('recipe_id', recipeId),
      ]);
      if (cancelled) return;
      setCookbooks((cbResult.data as Cookbook[]) ?? []);
      setMemberOf(new Set(((crResult.data ?? []) as { cookbook_id: string }[]).map((r) => r.cookbook_id)));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [open, recipeId]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  async function toggle(cookbookId: string) {
    const isMember = memberOf.has(cookbookId);
    // Optimistic
    setMemberOf((prev) => {
      const next = new Set(prev);
      if (isMember) next.delete(cookbookId);
      else next.add(cookbookId);
      return next;
    });
    if (isMember) {
      await supabase
        .from('cookbook_recipes')
        .delete()
        .eq('cookbook_id', cookbookId)
        .eq('recipe_id', recipeId);
    } else {
      await supabase
        .from('cookbook_recipes')
        .insert({ cookbook_id: cookbookId, recipe_id: recipeId });
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
        onClick={onClose}
        style={{ animation: 'fadeIn 0.15s ease both' }}
      >
        <div
          className="rf-card max-w-md w-full sm:mx-4 space-y-3"
          style={{ padding: 20, borderRadius: '20px 20px 0 0', animation: 'slideUp 0.2s ease both' }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <h2 className="rf-heading text-base font-semibold" style={{ color: 'var(--text)' }}>
              Save to cookbook
            </h2>
            <button
              onClick={onClose}
              style={{ color: 'var(--muted)', fontSize: 20, lineHeight: 1 }}
              aria-label="Close"
            >
              ×
            </button>
          </div>

          {loading ? (
            <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>
              Loading…
            </p>
          ) : (
            <div className="max-h-80 overflow-y-auto -mx-2 px-2 space-y-1">
              {cookbooks.map((cb) => {
                const checked = memberOf.has(cb.id);
                return (
                  <button
                    key={cb.id}
                    onClick={() => toggle(cb.id)}
                    className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors"
                    style={{
                      background: checked ? 'var(--green-light)' : 'transparent',
                      border: '1px solid',
                      borderColor: checked ? 'var(--green)' : 'transparent',
                    }}
                  >
                    <span style={{ fontSize: 22 }}>{cb.emoji ?? '📖'}</span>
                    <span
                      className="flex-1 text-left text-sm font-semibold"
                      style={{ color: 'var(--text)' }}
                    >
                      {cb.name}
                    </span>
                    <span
                      className="w-5 h-5 rounded-md flex items-center justify-center"
                      style={{
                        background: checked ? 'var(--green)' : 'transparent',
                        border: '1.5px solid',
                        borderColor: checked ? 'var(--green)' : 'var(--border)',
                        color: '#fff',
                        fontSize: 12,
                      }}
                    >
                      {checked ? '✓' : ''}
                    </span>
                  </button>
                );
              })}
              {cookbooks.length === 0 && (
                <p className="text-sm py-4 text-center" style={{ color: 'var(--muted)' }}>
                  No cookbooks yet.
                </p>
              )}
            </div>
          )}

          <button
            onClick={() => setShowCreate(true)}
            className="rf-btn rf-btn-primary w-full"
          >
            + New cookbook
          </button>
        </div>
      </div>

      <CookbookFormModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onSaved={(cb) => {
          setCookbooks((prev) => [cb, ...prev]);
          // Auto-add the recipe to the freshly-created cookbook
          supabase
            .from('cookbook_recipes')
            .insert({ cookbook_id: cb.id, recipe_id: recipeId })
            .then(() => {
              setMemberOf((prev) => new Set(prev).add(cb.id));
            });
        }}
      />
    </>
  );
}
