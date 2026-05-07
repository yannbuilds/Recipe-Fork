import { useEffect, useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook, Recipe } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';

const PRESET_EMOJIS = ['📖', '🍝', '🥗', '🍰', '🍱', '🍳', '🥘', '🍲', '🍕', '🌮', '🍜', '🥐'];

interface CookbookFormModalProps {
  open: boolean;
  cookbook?: Cookbook | null; // edit mode if provided
  recipes?: Recipe[]; // shown in edit mode for removal
  onClose: () => void;
  onSaved: (cookbook: Cookbook) => void;
  // Called on Save with the recipe IDs to remove from the cookbook.
  // Removals are staged locally — nothing hits the DB until Save.
  onCommitRemovals?: (recipeIds: string[]) => Promise<void> | void;
}

export default function CookbookFormModal({ open, cookbook, recipes, onClose, onSaved, onCommitRemovals }: CookbookFormModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState<string>('📖');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (open) {
      setName(cookbook?.name ?? '');
      setDescription(cookbook?.description ?? '');
      setEmoji(cookbook?.emoji ?? '📖');
      setError(null);
      setPendingRemoval(new Set());
    }
  }, [open, cookbook]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  async function handleSave() {
    if (!user || !name.trim()) return;
    setSaving(true);
    setError(null);
    if (cookbook) {
      const { data, error: err } = await supabase
        .from('cookbooks')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          emoji,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cookbook.id)
        .select()
        .single();
      if (err) {
        setError(err.message);
        setSaving(false);
        return;
      }
      if (pendingRemoval.size > 0 && onCommitRemovals) {
        await onCommitRemovals(Array.from(pendingRemoval));
      }
      if (data) {
        onSaved(data as Cookbook);
        onClose();
      }
    } else {
      const { data, error: err } = await supabase
        .from('cookbooks')
        .insert({
          user_id: user.id,
          name: name.trim(),
          description: description.trim() || null,
          emoji,
        })
        .select()
        .single();
      if (err) {
        setError(err.message);
      } else if (data) {
        onSaved(data as Cookbook);
        onClose();
      }
    }
    setSaving(false);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.15s ease both' }}
    >
      <div
        className="rf-card max-w-md w-full mx-4 space-y-4"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="rf-heading text-lg font-semibold" style={{ color: 'var(--text)' }}>
          {cookbook ? 'Edit cookbook' : 'New cookbook'}
        </h2>

        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
            Cover emoji
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESET_EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onClick={() => setEmoji(e)}
                className="w-10 h-10 rounded-lg flex items-center justify-center transition-colors"
                style={
                  emoji === e
                    ? {
                        background: 'var(--green-light)',
                        border: '2px solid var(--green)',
                        fontSize: 22,
                      }
                    : {
                        background: 'var(--warm)',
                        border: '2px solid transparent',
                        fontSize: 22,
                      }
                }
              >
                {e}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
            Name
          </label>
          <input
            className="rf-input w-full"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Weeknight dinners"
            autoFocus
            maxLength={60}
          />
        </div>

        <div>
          <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
            Description (optional)
          </label>
          <input
            className="rf-input w-full"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What's this cookbook for?"
            maxLength={140}
          />
        </div>

        {cookbook && recipes && recipes.length > 0 && onCommitRemovals && (
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
              Recipes ({recipes.length - pendingRemoval.size}
              {pendingRemoval.size > 0 ? ` · ${pendingRemoval.size} to remove` : ''})
            </label>
            <div
              className="max-h-48 overflow-y-auto -mx-1 px-1 space-y-1"
              style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 6 }}
            >
              {recipes.map((r) => {
                const removing = pendingRemoval.has(r.id);
                return (
                  <div
                    key={r.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-lg"
                    style={removing ? { opacity: 0.55 } : undefined}
                  >
                    {r.image_url ? (
                      <img
                        src={r.image_url}
                        alt=""
                        className="w-9 h-9 rounded-md object-cover shrink-0"
                      />
                    ) : (
                      <div
                        className="w-9 h-9 rounded-md shrink-0 flex items-center justify-center"
                        style={{
                          background: 'linear-gradient(135deg, var(--warm) 0%, var(--warm-dark) 100%)',
                        }}
                      >
                        🍴
                      </div>
                    )}
                    <p
                      className="flex-1 text-sm truncate"
                      style={{
                        color: 'var(--text)',
                        textDecoration: removing ? 'line-through' : 'none',
                      }}
                    >
                      {r.title}
                    </p>
                    {removing ? (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingRemoval((prev) => {
                            const next = new Set(prev);
                            next.delete(r.id);
                            return next;
                          });
                        }}
                        className="shrink-0 px-2 h-7 rounded-md text-xs font-semibold transition-colors"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--border)',
                          color: 'var(--muted)',
                        }}
                      >
                        Undo
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setPendingRemoval((prev) => {
                            const next = new Set(prev);
                            next.add(r.id);
                            return next;
                          });
                        }}
                        className="shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors"
                        style={{
                          background: 'transparent',
                          border: '1px solid var(--red-border)',
                          color: 'var(--red)',
                          fontSize: 16,
                          lineHeight: 1,
                        }}
                        onMouseEnter={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'var(--red-light)';
                        }}
                        onMouseLeave={(e) => {
                          (e.currentTarget as HTMLElement).style.background = 'transparent';
                        }}
                        aria-label={`Remove ${r.title}`}
                        title="Remove from cookbook"
                      >
                        ×
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              {pendingRemoval.size > 0
                ? 'Changes apply when you click Save.'
                : 'Removing only takes the recipe out of this cookbook — it stays in your library.'}
            </p>
          </div>
        )}

        {error && (
          <p className="text-sm" style={{ color: 'var(--red)' }}>
            {error}
          </p>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="rf-btn rf-btn-secondary" disabled={saving}>
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || saving}
            className="rf-btn rf-btn-filled"
          >
            {saving ? 'Saving…' : cookbook ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}
