import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, PenLine, ArrowLeft, Loader2 } from 'lucide-react';
import { supabase } from '@recipe-aggregator/shared';
import { useNewRecipeModal } from '../context/NewRecipeModalContext';
import { saveTags } from '../lib/saveTags';

type Step = 'choose' | 'url-input' | 'processing' | 'error';

export default function NewRecipeModal() {
  const { open, closeModal } = useNewRecipeModal();
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('choose');
  const [url, setUrl] = useState('');
  const [statusText, setStatusText] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep('choose');
      setUrl('');
      setErrorMessage('');
    }
  }, [open]);

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

  async function handleImport() {
    const trimmed = url.trim();
    if (!trimmed) return;

    // Basic URL validation
    try {
      new URL(trimmed);
    } catch {
      setErrorMessage('Please enter a valid URL (e.g. https://example.com/recipe)');
      setStep('error');
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

      const { data: existing } = await supabase
        .from('recipes')
        .select('id')
        .eq('source_url', trimmed)
        .eq('user_id', userId)
        .maybeSingle();

      if (existing) {
        closeModal();
        navigate(`/recipe/${existing.id}`);
        return;
      }

      // Call Edge Function
      setStatusText('Cooking recipe…');

      const { data, error } = await supabase.functions.invoke('import-recipe', {
        body: { url: trimmed },
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

      const { recipe, tagNames } = data;

      // Save recipe to Supabase
      setStatusText('Saving recipe…');

      const insertData = userId
        ? { ...recipe, user_id: userId, is_favourite: false }
        : { ...recipe, is_favourite: false };

      const { data: saved, error: saveError } = await supabase
        .from('recipes')
        .insert(insertData)
        .select('id')
        .single();

      if (saveError || !saved) {
        throw new Error(saveError?.message ?? 'Failed to save recipe');
      }

      // Save tags (non-blocking)
      await saveTags(saved.id, tagNames).catch(() => {});

      closeModal();
      navigate(`/recipe/${saved.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Something went wrong';
      setErrorMessage(message);
      setStep('error');
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
      className="fixed inset-0 flex flex-col justify-end bg-black/50"
      style={{ zIndex: 60, animation: 'fadeIn 0.15s ease' }}
      onClick={handleBackdropClick}
    >
      <div
        className="w-full"
        style={{
          background: 'var(--card)',
          borderRadius: '20px 20px 0 0',
          padding: '12px 24px calc(24px + 72px)',
          maxHeight: '50vh',
          overflowY: 'auto',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
          animation: 'slideUp 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Drag handle */}
        <div className="flex justify-center mb-4">
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
            <div className="grid grid-cols-2 gap-3">
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
                  e.currentTarget.style.background = 'var(--green-light, #f0faf4)';
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
                    From the Web
                  </span>
                  <span className="block text-xs mt-1" style={{ color: 'var(--muted)' }}>
                    Paste a recipe URL
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
                  e.currentTarget.style.background = 'var(--green-light, #f0faf4)';
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
                    Type it in yourself
                  </span>
                </div>
              </button>
            </div>
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
                Import from URL
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
                placeholder="https://example.com/recipe..."
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
            <p className="text-sm mb-4" style={{ color: 'var(--red, #e53e3e)' }}>
              {errorMessage}
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={closeModal} className="rf-btn rf-btn-secondary">
                Cancel
              </button>
              <button
                onClick={() => setStep('url-input')}
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
