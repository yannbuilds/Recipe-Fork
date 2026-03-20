import { useEffect, useRef, useState } from 'react';

interface ConfirmModalProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmWord?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = 'Delete',
  confirmWord,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (open) {
      setTyped('');
      cancelRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onCancel]);

  if (!open) return null;

  const confirmed = confirmWord ? typed.toLowerCase() === confirmWord.toLowerCase() : true;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="rf-card max-w-sm w-full mx-4 space-y-4"
        style={{ padding: 24 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="rf-heading text-lg font-semibold" style={{ color: 'var(--text)' }}>
          {title}
        </h2>
        <p className="text-sm" style={{ color: 'var(--muted)' }}>{message}</p>
        {confirmWord && (
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--muted)' }}>
              Type <strong style={{ color: 'var(--text)' }}>{confirmWord}</strong> to confirm
            </p>
            <input
              className="rf-input w-full"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={confirmWord}
              autoFocus
            />
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button ref={cancelRef} onClick={onCancel} className="rf-btn rf-btn-secondary">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={!confirmed} className="rf-btn rf-btn-danger">
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
