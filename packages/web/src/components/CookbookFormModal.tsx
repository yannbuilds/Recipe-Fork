import { useEffect, useState } from 'react';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';

const PRESET_EMOJIS = ['📖', '🍝', '🥗', '🍰', '🍱', '🍳', '🥘', '🍲', '🍕', '🌮', '🍜', '🥐'];

interface CookbookFormModalProps {
  open: boolean;
  cookbook?: Cookbook | null; // edit mode if provided
  onClose: () => void;
  onSaved: (cookbook: Cookbook) => void;
}

export default function CookbookFormModal({ open, cookbook, onClose, onSaved }: CookbookFormModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [emoji, setEmoji] = useState<string>('📖');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(cookbook?.name ?? '');
      setDescription(cookbook?.description ?? '');
      setEmoji(cookbook?.emoji ?? '📖');
      setError(null);
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
      } else if (data) {
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
