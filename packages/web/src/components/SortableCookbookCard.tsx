import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { Cookbook } from '@recipe-aggregator/shared';
import CookbookCard from './CookbookCard';
import { PK } from '../styles/pieKeeper';

interface SortableCookbookCardProps {
  cookbook: Cookbook;
  recipeCount: number;
  coverImages: string[];
  index: number;
}

/**
 * Wraps CookbookCard with drag-to-reorder behaviour.
 *
 * The entire row is the handle — press and hold (or press and move, on a
 * mouse) anywhere on it and the card lifts onto a cream sheet, follows the
 * pointer, and the siblings animate aside to reveal the drop slot. The grip
 * glyph in the title row is only an affordance, never the one place you can
 * grab: it sits on the paper beside the entry number, where it stays legible
 * instead of disappearing into a photo.
 */
export default function SortableCookbookCard({
  cookbook,
  recipeCount,
  coverImages,
  index,
}: SortableCookbookCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: cookbook.id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(
      transform
        ? { ...transform, scaleX: isDragging ? 1.02 : 1, scaleY: isDragging ? 1.02 : 1 }
        : null
    ),
    transition: [transition, 'box-shadow 160ms ease'].filter(Boolean).join(', '),
    zIndex: isDragging ? 50 : undefined,
    borderRadius: 4,
    // The lifted card gets a real surface: the first shadow is a solid cream
    // ring that reads as padding around the content, the second is the drop
    // shadow beneath it. Neither affects layout, so nothing shifts on grab.
    boxShadow: isDragging
      ? `0 0 0 12px ${PK.cream}, 0 26px 50px rgba(0,0,0,0.26)`
      : undefined,
    background: isDragging ? PK.cream : undefined,
    cursor: isDragging ? 'grabbing' : 'grab',
    // Allow native scrolling on touch; the TouchSensor's long-press delay
    // decides between scroll and drag, then suppresses scroll once dragging.
    touchAction: 'pan-y',
    position: 'relative',
    // Stop Chrome's long-press link-preview / text-selection callout from
    // hijacking the press-and-hold gesture we use to start a drag.
    WebkitTouchCallout: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="group"
      onContextMenu={(e) => e.preventDefault()}
      // Belt and braces with the draggable={false} inside the card: any native
      // HTML5 drag that slips through would stop the pointer stream dnd-kit
      // needs, and the row would refuse to move.
      onDragStart={(e) => e.preventDefault()}
      {...attributes}
      {...listeners}
    >
      <CookbookCard
        cookbook={cookbook}
        recipeCount={recipeCount}
        coverImages={coverImages}
        index={index}
        leading={
          <span
            aria-hidden
            className={`transition-opacity ${
              isDragging ? 'opacity-100' : 'opacity-40 group-hover:opacity-100'
            }`}
            style={{
              alignSelf: 'center',
              display: 'grid',
              placeItems: 'center',
              width: 14,
              height: 20,
              // Flush with the card's left spine — the hairline and the photo
              // strip start here too — so the row reads as an indented entry
              // rather than a near-miss on the alignment.
              marginRight: -4,
              flexShrink: 0,
              color: isDragging ? PK.green : PK.inkMute,
              pointerEvents: 'none',
            }}
          >
            <GripVertical size={14} strokeWidth={2} />
          </span>
        }
      />
    </div>
  );
}
