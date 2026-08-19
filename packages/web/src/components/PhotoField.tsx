import { useEffect, useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCw, Trash2 } from 'lucide-react';

interface Props {
  /** A photo picked in this session, not yet uploaded. */
  file: File | null;
  /** The photo already on the recipe, or '' when there isn't one. */
  url: string;
  onPick: (file: File) => void;
  onRemove: () => void;
  onError?: (message: string) => void;
  height?: number;
}

const MAX_BYTES = 20 * 1024 * 1024;

/**
 * The one way a photo gets onto a recipe: pick from the device, replace, remove.
 * No URL box — on a phone the file input opens the native "Photo Library / Take
 * Photo" sheet, which is what people actually reach for. Imported recipes still
 * carry a remote image_url; it just shows as the current photo rather than as
 * text to edit.
 */
export default function PhotoField({ file, url, onPick, onRemove, onError, height = 260 }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [objectUrl, setObjectUrl] = useState('');
  const [dragging, setDragging] = useState(false);

  // The preview for a freshly picked file lives and dies with that file.
  useEffect(() => {
    if (!file) { setObjectUrl(''); return; }
    const next = URL.createObjectURL(file);
    setObjectUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [file]);

  const preview = objectUrl || url.trim();

  function accept(candidate?: File | null) {
    if (!candidate) return;
    if (!candidate.type.startsWith('image/')) { onError?.('That file isn’t an image.'); return; }
    if (candidate.size > MAX_BYTES) { onError?.('Choose a photo smaller than 20 MB.'); return; }
    onPick(candidate);
  }

  return (
    <div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => { accept(e.target.files?.[0]); e.target.value = ''; }}
      />

      {preview ? (
        <div className="rf-photo rf-photo-filled" style={{ height }}>
          <img src={preview} alt="Recipe photo" />
          <div className="rf-photo-actions">
            <button type="button" onClick={() => input.current?.click()} className="rf-photo-pill">
              <RefreshCw size={14} strokeWidth={2.2} /> Replace photo
            </button>
            <button
              type="button"
              onClick={onRemove}
              className="rf-photo-pill rf-photo-pill-icon"
              aria-label="Remove photo"
              title="Remove photo"
            >
              <Trash2 size={15} strokeWidth={2.2} />
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => input.current?.click()}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => { e.preventDefault(); setDragging(false); accept(e.dataTransfer.files?.[0]); }}
          className={dragging ? 'rf-photo rf-photo-empty rf-photo-dragging' : 'rf-photo rf-photo-empty'}
          style={{ height }}
        >
          <span className="rf-photo-mark"><ImagePlus size={22} strokeWidth={1.8} /></span>
          <span className="rf-photo-title">Add a photo</span>
          <span className="rf-photo-hint">
            <Camera size={13} strokeWidth={2} /> Take one or choose from your library
          </span>
        </button>
      )}
    </div>
  );
}
