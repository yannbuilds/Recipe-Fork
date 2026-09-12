import { useEffect, useState } from 'react';
import ModalPortal from './ModalPortal';
import { Utensils, X } from 'lucide-react';
import { supabase } from '@recipe-aggregator/shared';
import type { Cookbook, Recipe } from '@recipe-aggregator/shared';
import { useAuth } from '../context/AuthContext';
import PhotoField from './PhotoField';

// Default cover glyph kept for the DB column; no longer shown in the UI
// (cookbook covers use recipe photos with a line-icon fallback).
const DEFAULT_COVER = '📖';
const COVER_BUCKET = 'cookbook-covers';

function coverStoragePath(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = `/storage/v1/object/public/${COVER_BUCKET}/`;
  const markerIndex = url.indexOf(marker);
  if (markerIndex === -1) return null;
  try {
    return decodeURIComponent(url.slice(markerIndex + marker.length));
  } catch {
    return null;
  }
}

interface CookbookFormModalProps {
  open: boolean;
  cookbook?: Cookbook | null; // edit mode if provided
  recipes?: Recipe[]; // shown in edit mode for removal
  // Pre-fill values for create mode (e.g. from an AI suggestion).
  initialValues?: { name?: string; description?: string | null; emoji?: string | null };
  // Recipe ids to attach to the cookbook immediately after create (create mode only).
  initialRecipeIds?: string[];
  onClose: () => void;
  onSaved: (cookbook: Cookbook) => void;
  // Called on Save with the recipe IDs to remove from the cookbook.
  // Removals are staged locally — nothing hits the DB until Save.
  onCommitRemovals?: (recipeIds: string[]) => Promise<void> | void;
}

export default function CookbookFormModal({ open, cookbook, recipes, initialValues, initialRecipeIds, onClose, onSaved, onCommitRemovals }: CookbookFormModalProps) {
  const { user } = useAuth();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<Set<string>>(new Set());
  const [coverRecipeId, setCoverRecipeId] = useState<string | null>(null);
  const [coverImageUrl, setCoverImageUrl] = useState('');
  const [coverImageFile, setCoverImageFile] = useState<File | null>(null);

  useEffect(() => {
    if (open) {
      setName(cookbook?.name ?? initialValues?.name ?? '');
      setDescription(cookbook?.description ?? initialValues?.description ?? '');
      setCoverRecipeId(cookbook?.cover_recipe_id ?? null);
      setCoverImageUrl(cookbook?.cover_image_url ?? '');
      setCoverImageFile(null);
      setError(null);
      setPendingRemoval(new Set());
    }
  }, [open, cookbook, initialValues]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    // The signed-in app scrolls inside this shell element rather than the
    // document. Freeze it while the portal-mounted dialog owns the screen so
    // touch gestures cannot move the page behind the sheet on iOS.
    const appScroller = document.querySelector<HTMLElement>('.pk-shell-scroll');
    const previousOverflow = appScroller?.style.overflow;
    if (appScroller) appScroller.style.overflow = 'hidden';
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('keydown', handleKey);
      if (appScroller) appScroller.style.overflow = previousOverflow ?? '';
    };
  }, [open, onClose]);

  if (!open) return null;

  async function handleSave() {
    if (!user || !name.trim()) return;
    setSaving(true);
    setError(null);
    if (cookbook) {
      let uploadedPath: string | null = null;
      let nextCoverImageUrl = coverImageUrl.trim() || null;

      if (coverImageFile) {
        const extension = coverImageFile.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
        uploadedPath = `${user.id}/${cookbook.id}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage.from(COVER_BUCKET).upload(uploadedPath, coverImageFile, {
          contentType: coverImageFile.type || 'image/jpeg',
          upsert: false,
        });
        if (uploadError) {
          setError(`Could not upload the cover: ${uploadError.message}`);
          setSaving(false);
          return;
        }
        nextCoverImageUrl = supabase.storage.from(COVER_BUCKET).getPublicUrl(uploadedPath).data.publicUrl;
      }

      const { data, error: err } = await supabase
        .from('cookbooks')
        .update({
          name: name.trim(),
          description: description.trim() || null,
          cover_recipe_id: coverRecipeId,
          cover_image_url: nextCoverImageUrl,
          updated_at: new Date().toISOString(),
        })
        .eq('id', cookbook.id)
        .select()
        .single();
      if (err) {
        if (uploadedPath) await supabase.storage.from(COVER_BUCKET).remove([uploadedPath]);
        setError(err.message);
        setSaving(false);
        return;
      }

      const previousPath = coverStoragePath(cookbook.cover_image_url);
      if (previousPath && cookbook.cover_image_url !== nextCoverImageUrl) {
        await supabase.storage.from(COVER_BUCKET).remove([previousPath]);
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
          emoji: initialValues?.emoji ?? DEFAULT_COVER,
        })
        .select()
        .single();
      if (err) {
        setError(err.message);
      } else if (data) {
        if (initialRecipeIds && initialRecipeIds.length > 0) {
          const rows = initialRecipeIds.map((rid) => ({
            cookbook_id: data.id,
            recipe_id: rid,
          }));
          const { error: linkErr } = await supabase
            .from('cookbook_recipes')
            .insert(rows);
          if (linkErr) {
            setError(linkErr.message);
            setSaving(false);
            return;
          }
        }
        onSaved(data as Cookbook);
        onClose();
      }
    }
    setSaving(false);
  }

  return (
    <ModalPortal>
    <div
      className="rf-cookbook-modal-overlay"
      onClick={onClose}
      style={{ animation: 'fadeIn 0.15s ease both' }}
    >
      <section
        className="rf-card rf-cookbook-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="cookbook-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="rf-cookbook-modal-header">
          <h2 id="cookbook-modal-title" className="rf-heading text-lg font-semibold" style={{ color: 'var(--text)' }}>
            {cookbook ? 'Edit cookbook' : 'New cookbook'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rf-cookbook-modal-close"
            aria-label="Close cookbook editor"
          >
            <X size={20} />
          </button>
        </header>

        <div className="rf-cookbook-modal-body space-y-4">
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

        {cookbook && (
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
              Cover image
            </label>
            <PhotoField
              file={coverImageFile}
              url={coverImageUrl}
              height={150}
              alt={`${name.trim() || 'Cookbook'} cover`}
              onPick={(file) => {
                setCoverImageFile(file);
                setCoverRecipeId(null);
                setError(null);
              }}
              onRemove={() => {
                setCoverImageFile(null);
                setCoverImageUrl('');
                setCoverRecipeId(null);
              }}
              onError={setError}
            />

            {recipes?.some((r) => r.image_url) && (
              <>
                <p className="text-xs mt-3 mb-2" style={{ color: 'var(--muted)' }}>
                  Or use a recipe photo
                </p>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  <button
                    type="button"
                    onClick={() => {
                      setCoverImageFile(null);
                      setCoverImageUrl('');
                      setCoverRecipeId(null);
                    }}
                    className="shrink-0 flex items-center justify-center text-xs font-semibold"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 10,
                      border: `1.5px dashed ${!coverImageFile && !coverImageUrl && coverRecipeId === null ? 'var(--green)' : 'var(--border)'}`,
                      background: !coverImageFile && !coverImageUrl && coverRecipeId === null ? 'var(--green-light)' : 'transparent',
                      color: !coverImageFile && !coverImageUrl && coverRecipeId === null ? 'var(--green)' : 'var(--muted)',
                    }}
                    title="Automatic — newest recipe photo"
                  >
                    Auto
                  </button>
                  {recipes
                    .filter((r) => r.image_url)
                    .map((r) => (
                      <button
                        type="button"
                        key={r.id}
                        onClick={() => {
                          setCoverImageFile(null);
                          setCoverImageUrl('');
                          setCoverRecipeId(r.id);
                        }}
                        className="shrink-0 p-0"
                        style={{
                          borderRadius: 10,
                          border: `2px solid ${!coverImageFile && !coverImageUrl && coverRecipeId === r.id ? 'var(--green)' : 'transparent'}`,
                          lineHeight: 0,
                        }}
                        title={r.title}
                      >
                        <img
                          src={r.image_url!}
                          alt={r.title}
                          className="object-cover"
                          style={{ width: 52, height: 52, borderRadius: 8 }}
                        />
                      </button>
                    ))}
                </div>
              </>
            )}
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Used on your cookbook shelf and when saving a recipe.
            </p>
          </div>
        )}

        {cookbook && recipes && recipes.length > 0 && onCommitRemovals && (
          <div>
            <label className="block text-xs font-semibold mb-2" style={{ color: 'var(--muted)' }}>
              Recipes ({recipes.length - pendingRemoval.size}
              {pendingRemoval.size > 0 ? ` · ${pendingRemoval.size} to remove` : ''})
            </label>
            <div
              className="rf-cookbook-recipe-list -mx-1 px-1 space-y-1"
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
                          color: 'var(--muted)',
                        }}
                      >
                        <Utensils size={16} strokeWidth={1.5} />
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
        </div>

        <footer className="rf-cookbook-modal-footer">
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
        </footer>
      </section>
    </div>
    </ModalPortal>
  );
}
