import { useEffect, useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook } from '@recipe-aggregator/shared';
import CookbookFormModal from './CookbookFormModal';
import { fSerif } from '../styles/pieKeeper';

interface AddToCookbookSheetProps {
  open: boolean;
  recipeId: string;
  onClose: () => void;
}

interface Toast {
  key: number;
  text: string;
  kind: 'added' | 'removed' | 'error';
}

// Row from the cover-photo query; Supabase may return the joined
// `recipes` relation as an object or a single-element array.
interface CoverRow {
  cookbook_id: string;
  recipes:
    | { image_url: string | null; created_at: string }
    | { image_url: string | null; created_at: string }[]
    | null;
}

export default function AddToCookbookSheet({ open, recipeId, onClose }: AddToCookbookSheetProps) {
  const [cookbooks, setCookbooks] = useState<Cookbook[]>([]);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [memberOf, setMemberOf] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      const [cbResult, crResult, coverResult] = await Promise.all([
        supabase
          .from('cookbooks')
          .select('id, user_id, name, description, emoji, sort_order, created_at, updated_at')
          .order('sort_order', { ascending: true })
          .order('created_at', { ascending: false }),
        supabase.from('cookbook_recipes').select('cookbook_id').eq('recipe_id', recipeId),
        // Newest recipe photo per cookbook — same source the shelf covers use.
        supabase.from('cookbook_recipes').select('cookbook_id, recipes(image_url, created_at)'),
      ]);
      if (cancelled) return;
      setCookbooks((cbResult.data as Cookbook[]) ?? []);
      setMemberOf(new Set(((crResult.data ?? []) as { cookbook_id: string }[]).map((r) => r.cookbook_id)));
      const newest: Record<string, { url: string; at: number }> = {};
      for (const row of ((coverResult.data ?? []) as unknown) as CoverRow[]) {
        const rec = Array.isArray(row.recipes) ? row.recipes[0] : row.recipes;
        if (!rec?.image_url) continue;
        const at = new Date(rec.created_at).getTime();
        const cur = newest[row.cookbook_id];
        if (!cur || at > cur.at) newest[row.cookbook_id] = { url: rec.image_url, at };
      }
      setCovers(Object.fromEntries(Object.entries(newest).map(([id, v]) => [id, v.url])));
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
    const name = cookbooks.find((cb) => cb.id === cookbookId)?.name ?? 'cookbook';
    // Optimistic
    setMemberOf((prev) => {
      const next = new Set(prev);
      if (isMember) next.delete(cookbookId);
      else next.add(cookbookId);
      return next;
    });
    const { error } = isMember
      ? await supabase
          .from('cookbook_recipes')
          .delete()
          .eq('cookbook_id', cookbookId)
          .eq('recipe_id', recipeId)
      : await supabase
          .from('cookbook_recipes')
          .insert({ cookbook_id: cookbookId, recipe_id: recipeId });
    if (error) {
      // Revert the optimistic tick — never leave a tick that lied.
      setMemberOf((prev) => {
        const next = new Set(prev);
        if (isMember) next.add(cookbookId);
        else next.delete(cookbookId);
        return next;
      });
      setToast({ key: Date.now(), kind: 'error', text: 'Couldn’t save – try again' });
    } else {
      setToast({
        key: Date.now(),
        kind: isMember ? 'removed' : 'added',
        text: isMember ? `Removed from ${name}` : `Added to ${name}`,
      });
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
          className="rf-card max-w-md w-full sm:mx-4 space-y-3 pb-[calc(env(safe-area-inset-bottom,0px)+84px)] sm:pb-5"
          style={{
            paddingTop: 20,
            paddingLeft: 20,
            paddingRight: 20,
            borderRadius: '20px 20px 0 0',
            animation: 'slideUp 0.2s ease both',
          }}
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
                    {covers[cb.id] ? (
                      <img
                        src={covers[cb.id]}
                        alt=""
                        className="shrink-0 object-cover"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                        }}
                      />
                    ) : (
                      <span
                        className="shrink-0 flex items-center justify-center"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          border: '1px solid var(--border)',
                          color: 'var(--green)',
                          fontFamily: fSerif,
                          fontSize: 17,
                          fontStyle: 'italic',
                        }}
                      >
                        {(cb.name.trim()[0] ?? '?').toUpperCase()}
                      </span>
                    )}
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

        {/* Save confirmation toast — floats above the sheet, never blocks taps. */}
        {toast && (
          <div
            className="fixed left-1/2 z-[60]"
            style={{
              bottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)',
              transform: 'translateX(-50%)',
              pointerEvents: 'none',
            }}
          >
            <div
              key={toast.key}
              className="flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold"
              style={{
                background:
                  toast.kind === 'added'
                    ? 'var(--green-solid)'
                    : toast.kind === 'error'
                      ? 'var(--red)'
                      : 'var(--text)',
                color: toast.kind === 'removed' ? 'var(--card)' : '#fff',
                boxShadow: 'var(--shadow-md)',
                whiteSpace: 'nowrap',
                maxWidth: '85vw',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                animation: 'fadeUp 0.25s ease both',
              }}
              role="status"
            >
              {toast.kind === 'added' ? '✓ ' : toast.kind === 'error' ? '⚠ ' : ''}
              {toast.text}
            </div>
          </div>
        )}
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
            .then(({ error }) => {
              if (error) {
                setToast({ key: Date.now(), kind: 'error', text: 'Couldn’t save – try again' });
                return;
              }
              setMemberOf((prev) => new Set(prev).add(cb.id));
              setToast({ key: Date.now(), kind: 'added', text: `Added to ${cb.name}` });
            });
        }}
      />
    </>
  );
}
