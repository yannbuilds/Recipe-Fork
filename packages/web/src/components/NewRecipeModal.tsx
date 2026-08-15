import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, PenLine, ArrowLeft, Loader2, Images, Camera, X } from 'lucide-react';
import {
  findRecipeWithSameSource,
  normalizeRecipeSourceUrl,
  supabase,
} from '@recipe-aggregator/shared';
import { useNewRecipeModal } from '../context/NewRecipeModalContext';
import { saveTags } from '../lib/saveTags';

type Step = 'choose' | 'url-input' | 'photo-input' | 'processing' | 'error';

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

interface SelectedPhoto {
  file: File;
  previewUrl: string;
}

async function findExistingRecipe(sourceUrl: string): Promise<{ id: string } | undefined> {
  const { data, error } = await supabase.from('recipes').select('id, source_url');
  if (error) throw new Error(error.message);
  return findRecipeWithSameSource(data ?? [], sourceUrl);
}

export default function NewRecipeModal() {
  const { open, closeModal } = useNewRecipeModal();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('choose');
  const [url, setUrl] = useState('');
  const [photos, setPhotos] = useState<SelectedPhoto[]>([]);
  const [statusText, setStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [errorReturnStep, setErrorReturnStep] = useState<Step>('url-input');
  const [dismissing, setDismissing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragStartY = useRef<number | null>(null);
  const dragCurrentY = useRef(0);
  const isDragging = useRef(false);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('choose');
      setUrl('');
      setPhotos((current) => {
        current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
        return [];
      });
      setErrorMessage('');
      setDismissing(false);
      dragStartY.current = null;
      dragCurrentY.current = 0;
      isDragging.current = false;
    }
  }, [open]);

  function handleDragPointerDown(e: React.PointerEvent) {
    if (step === 'processing') return;
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragCurrentY.current = 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handleDragPointerMove(e: React.PointerEvent) {
    if (!isDragging.current || dragStartY.current === null) return;
    const delta = Math.max(0, e.clientY - dragStartY.current);
    dragCurrentY.current = delta;
    if (sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
      sheetRef.current.style.transition = 'none';
    }
  }

  function handleDragPointerUp() {
    if (!isDragging.current) return;
    isDragging.current = false;
    const delta = dragCurrentY.current;
    const sheetHeight = sheetRef.current?.offsetHeight ?? 300;
    const threshold = Math.min(80, sheetHeight * 0.35);

    if (delta > threshold) {
      // Dismiss: slide down then close
      setDismissing(true);
      setTimeout(() => closeModal(), 300);
    } else {
      // Snap back
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
        sheetRef.current.style.transform = 'translateY(0)';
      }
    }
  }

  // Focus URL input when switching to that step
  useEffect(() => {
    if (step === 'url-input') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [step]);

  // Escape key closes modal (unless processing)
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && step !== 'processing') {
        closeModal();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, step, closeModal]);

  if (!open) return null;

  function handleManual() {
    closeModal();
    navigate('/new');
  }

  function showError(message: string, returnStep: Step) {
    setErrorMessage(message);
    setErrorReturnStep(returnStep);
    setStep('error');
  }

  function addPhotos(files: FileList | null) {
    if (!files) return;
    const available = MAX_PHOTOS - photos.length;
    const chosen = Array.from(files).slice(0, available);
    const invalid = chosen.find((file) => !file.type.startsWith('image/'));
    const oversized = chosen.find((file) => file.size > MAX_PHOTO_BYTES);
    if (invalid) {
      showError(`${invalid.name} is not an image.`, 'photo-input');
      return;
    }
    if (oversized) {
      showError(`${oversized.name} is larger than 20 MB.`, 'photo-input');
      return;
    }
    setPhotos((current) => [
      ...current,
      ...chosen.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ]);
  }

  function removePhoto(index: number) {
    setPhotos((current) => {
      URL.revokeObjectURL(current[index].previewUrl);
      return current.filter((_, photoIndex) => photoIndex !== index);
    });
  }

  async function functionErrorMessage(error: { context?: unknown; message?: string }, fallback: string) {
    try {
      if (error.context instanceof Response) {
        const clone = error.context.clone();
        try {
          const body = await clone.json();
          return body?.error || fallback;
        } catch {
          return await error.context.text() || fallback;
        }
      }
      return error.message || fallback;
    } catch {
      return fallback;
    }
  }

  async function saveImportedRecipe(
    userId: string,
    data: { recipe: Record<string, unknown>; tags?: Array<{ name: string; emoji: string }> },
  ) {
    setStatusText('Saving recipe…');
    const recipe = { ...data.recipe };
    if (typeof recipe.source_url === 'string') {
      recipe.source_url = normalizeRecipeSourceUrl(recipe.source_url);
    }
    const { data: saved, error: saveError } = await supabase
      .from('recipes')
      .insert({ ...recipe, user_id: userId, is_favourite: false })
      .select('id')
      .single();
    if (saveError || !saved) throw new Error(saveError?.message ?? 'Failed to save recipe');
    await saveTags(saved.id, data.tags ?? []).catch(() => {});
    closeModal();
    navigate(`/recipe/${saved.id}`);
  }

  async function handlePhotoImport() {
    if (photos.length === 0) return;
    setStep('processing');
    setStatusText('Uploading photos…');
    const uploadedPaths: string[] = [];

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;
      if (!session || !userId) throw new Error('Please sign in to scan recipes');

      for (let index = 0; index < photos.length; index++) {
        setStatusText(`Uploading photo ${index + 1} of ${photos.length}…`);
        const photo = photos[index].file;
        const extension = photo.name.split('.').pop()?.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() || 'jpg';
        const path = `${userId}/${crypto.randomUUID()}.${extension}`;
        const { error: uploadError } = await supabase.storage
          .from('recipe-scans')
          .upload(path, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
        if (uploadError) throw new Error(`Could not upload ${photo.name}: ${uploadError.message}`);
        uploadedPaths.push(path);
      }

      setStatusText('Reading your recipe…');
      const { data, error } = await supabase.functions.invoke('import-recipe-photo', {
        body: { paths: uploadedPaths },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (error) throw new Error(await functionErrorMessage(error, 'Failed to scan recipe'));
      if (data?.error) throw new Error(data.error);
      if (!data?.recipe) throw new Error('No recipe was found in those photos');

      await saveImportedRecipe(userId, data);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Something went wrong', 'photo-input');
    } finally {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from('recipe-scans').remove(uploadedPaths).catch(() => {});
      }
    }
  }

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Basic URL validation
    try {
      new URL(trimmed);
    } catch {
      showError('Please enter a valid URL (e.g. https://example.com/recipe)', 'url-input');
      return;
    }

    setStep('processing');
    setStatusText('Checking for duplicates…');

    try {
      // Require auth — edge function needs a valid JWT
      const { data: { session } } = await supabase.auth.getSession();
      const userId = session?.user?.id;

      if (!userId) {
        throw new Error('Please sign in to import recipes');
      }

      const normalizedUrl = normalizeRecipeSourceUrl(trimmed);
      // RLS returns both own and family recipes. Compare canonical source keys,
      // not exact strings, so `/recipe` and `/recipe/?utm_…` are one recipe.
      const existing = await findExistingRecipe(normalizedUrl);

      if (existing) {
        closeModal();
        navigate(`/recipe/${existing.id}`);
        return;
      }

      // Call Edge Function
      setStatusText('Cooking recipe…');

      const { data, error } = await supabase.functions.invoke('import-recipe', {
        body: { url: normalizedUrl },
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (error) {
        let msg = 'Failed to import recipe';
        try {
          if (error.context instanceof Response) {
            const clone = error.context.clone();
            try {
              const body = await clone.json();
              msg = body?.error || msg;
            } catch {
              msg = await error.context.text() || msg;
            }
          } else if (error.message) {
            msg = error.message;
          }
        } catch { /* keep generic message */ }
        console.error('[import-recipe]', error);
        throw new Error(msg);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      const { recipe, tags } = data;

      // The importer may follow a redirect to a different canonical URL, so
      // check once more before inserting the returned record.
      const canonicalUrl =
        typeof recipe?.source_url === 'string' ? recipe.source_url : normalizedUrl;
      const canonicalDuplicate = await findExistingRecipe(canonicalUrl);
      if (canonicalDuplicate) {
        closeModal();
        navigate(`/recipe/${canonicalDuplicate.id}`);
        return;
      }

      // Save recipe to Supabase
      setStatusText('Saving recipe…');

      await saveImportedRecipe(userId, { recipe, tags });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      showError(message, 'url-input');
    }
  }

  function handleBackdropClick(e: React.MouseEvent) {
    if (step !== 'processing') {
      closeModal();
    }
    e.stopPropagation();
  }

  return (
    <div
      className="fixed inset-0 flex flex-col justify-end bg-black/50 px-2 sm:px-0"
      style={{ zIndex: 60, animation: 'fadeIn 0.15s ease' }}
      onClick={handleBackdropClick}
    >
      <div
        ref={sheetRef}
        className="w-full mx-auto"
        style={{
          maxWidth: 1100,
          background: 'var(--card)',
          borderRadius: '20px 20px 0 0',
          padding: '0 24px calc(24px + 72px)',
          maxHeight: '50vh',
          overflowY: 'auto',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
          animation: dismissing ? 'none' : 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
          transform: dismissing ? 'translateY(110%)' : undefined,
          transition: dismissing ? 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)' : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle zone — touch target for drag-to-dismiss */}
        <div
          onPointerDown={handleDragPointerDown}
          onPointerMove={handleDragPointerMove}
          onPointerUp={handleDragPointerUp}
          style={{ touchAction: 'none', cursor: 'grab', padding: '12px 0 8px', display: 'flex', justifyContent: 'center' }}
        >
          <div
            style={{
              width: 40,
              height: 4,
              borderRadius: 2,
              background: 'var(--border)',
            }}
          />
        </div>
        {/* Step: Choose */}
        {step === 'choose' && (
          <>
            <h2
              className="rf-heading text-lg font-semibold text-center mb-5"
              style={{ color: 'var(--text)' }}
            >
              Add a Recipe
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                onClick={() => setStep('url-input')}
                className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 transition-all"
                style={{
                  padding: '28px 16px',
                  border: '2px solid var(--border)',
                  background: 'var(--card)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--green)';
                  e.currentTarget.style.background = 'var(--green-light)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--card)';
                }}
              >
                <Globe size={32} strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                <div className="text-center">
                  <span
                    className="rf-heading block text-sm font-semibold"
                    style={{ color: 'var(--text)' }}
                  >
                    From a Link
                  </span>
                  <span className="block text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    Recipe page or social post
                  </span>
                </div>
              </button>

              <button
                onClick={() => setStep('photo-input')}
                className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 transition-all"
                style={{
                  padding: '22px 16px',
                  border: '2px solid var(--border)',
                  background: 'var(--card)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--green)';
                  e.currentTarget.style.background = 'var(--green-light)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--card)';
                }}
              >
                <Images size={32} strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                <div className="text-center">
                  <span className="rf-heading block text-sm font-semibold" style={{ color: 'var(--text)' }}>
                    From Photos
                  </span>
                  <span className="block text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    Scan a page or card
                  </span>
                </div>
              </button>

              <button
                onClick={handleManual}
                className="flex flex-col items-center justify-center gap-3 rounded-xl border-2 transition-all"
                style={{
                  padding: '28px 16px',
                  border: '2px solid var(--border)',
                  background: 'var(--card)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--green)';
                  e.currentTarget.style.background = 'var(--green-light)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--border)';
                  e.currentTarget.style.background = 'var(--card)';
                }}
              >
                <PenLine size={32} strokeWidth={1.5} style={{ color: 'var(--green)' }} />
                <div className="text-center">
                  <span
                    className="rf-heading block text-sm font-semibold"
                    style={{ color: 'var(--text)' }}
                  >
                    Add Manually
                  </span>
                  <span className="block text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    Paste everything at once
                  </span>
                </div>
              </button>
            </div>
          </>
        )}

        {/* Step: Photo Input */}
        {step === 'photo-input' && (
          <>
            <div className="flex items-center gap-2 mb-2">
              <button
                onClick={() => setStep('choose')}
                className="flex items-center justify-center rounded-lg"
                style={{ width: 32, height: 32, color: 'var(--muted)', cursor: 'pointer', background: 'none', border: 'none' }}
                aria-label="Back"
              >
                <ArrowLeft size={18} />
              </button>
              <h2 className="rf-heading text-lg font-semibold" style={{ color: 'var(--text)' }}>
                Scan a Recipe
              </h2>
            </div>
            <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
              Add up to 5 clear photos in page order. Include the title, every ingredient, and the full method.
            </p>
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                addPhotos(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(event) => {
                addPhotos(event.currentTarget.files);
                event.currentTarget.value = '';
              }}
            />
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                className="rf-btn rf-btn-secondary flex items-center justify-center gap-2"
                onClick={() => galleryInputRef.current?.click()}
                disabled={photos.length >= MAX_PHOTOS}
              >
                <Images size={17} /> Choose Photos
              </button>
              <button
                type="button"
                className="rf-btn rf-btn-secondary flex items-center justify-center gap-2"
                onClick={() => cameraInputRef.current?.click()}
                disabled={photos.length >= MAX_PHOTOS}
              >
                <Camera size={17} /> Take Photo
              </button>
            </div>
            {photos.length > 0 && (
              <div className="mt-4">
                <div className="flex gap-2 overflow-x-auto pb-2">
                  {photos.map((photo, index) => (
                    <div key={`${photo.file.name}-${index}`} className="relative shrink-0">
                      <img
                        src={photo.previewUrl}
                        alt={`Recipe page ${index + 1}`}
                        className="object-cover rounded-lg"
                        style={{ width: 76, height: 76, border: '1px solid var(--border)' }}
                      />
                      <button
                        type="button"
                        onClick={() => removePhoto(index)}
                        aria-label={`Remove photo ${index + 1}`}
                        className="absolute -top-1 -right-1 flex items-center justify-center rounded-full"
                        style={{ width: 22, height: 22, border: 'none', color: 'white', background: 'var(--red)', cursor: 'pointer' }}
                      >
                        <X size={13} />
                      </button>
                      <span
                        className="absolute bottom-1 left-1 text-xs rounded-full"
                        style={{ minWidth: 18, padding: '1px 5px', color: 'white', background: 'rgba(0,0,0,.65)', textAlign: 'center' }}
                      >
                        {index + 1}
                      </span>
                    </div>
                  ))}
                </div>
                <button type="button" onClick={handlePhotoImport} className="rf-btn rf-btn-filled w-full mt-2">
                  Scan {photos.length === 1 ? 'Photo' : `${photos.length} Photos`}
                </button>
              </div>
            )}
          </>
        )}

        {/* Step: URL Input */}
        {step === 'url-input' && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => setStep('choose')}
                className="flex items-center justify-center rounded-lg"
                style={{
                  width: 32,
                  height: 32,
                  color: 'var(--muted)',
                  cursor: 'pointer',
                  background: 'none',
                  border: 'none',
                }}
              >
                <ArrowLeft size={18} />
              </button>
              <h2
                className="rf-heading text-lg font-semibold"
                style={{ color: 'var(--text)' }}
              >
                Import from a link
              </h2>
            </div>
            <div className="space-y-3">
              <input
                ref={inputRef}
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleImport();
                }}
                placeholder="Paste a recipe or social post URL..."
                className="rf-input w-full"
              />
              <button
                onClick={handleImport}
                disabled={!url.trim()}
                className="rf-btn rf-btn-filled w-full"
              >
                Import Recipe
              </button>
            </div>
          </>
        )}

        {/* Step: Processing */}
        {step === 'processing' && (
          <div className="flex flex-col items-center justify-center py-6 gap-4">
            <Loader2
              size={32}
              strokeWidth={2}
              style={{ color: 'var(--green)', animation: 'spin 1s linear infinite' }}
            />
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
              {statusText}
            </p>
          </div>
        )}

        {/* Step: Error */}
        {step === 'error' && (
          <div className="text-center py-2">
            <p className="text-sm mb-4" style={{ color: 'var(--red)' }}>
              {errorMessage}
            </p>
            {errorMessage.includes('Failed to fetch page') && (
              <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>
                Some sites block automated requests. Try saving this recipe using the Pie Keeper Chrome extension instead.
              </p>
            )}
            <div className="flex gap-3 justify-center">
              <button onClick={closeModal} className="rf-btn rf-btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => setStep(errorReturnStep)}
                className="rf-btn rf-btn-filled"
              >
                Try Again
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
