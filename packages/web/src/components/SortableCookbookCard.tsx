import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';
import type { Cookbook } from '@recipe-aggregator/shared';
import CookbookCard from './CookbookCard';

interface SortableCookbookCardProps {
  cookbook: Cookbook;
  recipeCount: number;
  coverImages: string[];
  index: number;
}

/**
 * Wraps CookbookCard with drag-to-reorder behaviour.
 * The card lifts and scales on grab; siblings animate aside to reveal the drop slot.
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
        ? { ...transform, scaleX: isDragging ? 1.04 : 1, scaleY: isDragging ? 1.04 : 1 }
        : null
    ),
    transition,
    zIndex: isDragging ? 50 : undefined,
    opacity: isDragging ? 0.92 : 1,
    boxShadow: isDragging ? '0 18px 40px rgba(0,0,0,0.28)' : undefined,
    borderRadius: 'var(--radius)',
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
      {...attributes}
      {...listeners}
    >
      <CookbookCard
        cookbook={cookbook}
        recipeCount={recipeCount}
        coverImages={coverImages}
        index={index}
      />

      {/* Drag affordance: always faintly visible (mobile has no hover),
          brightens on hover. pointer-events:none — the whole card is draggable. */}
      <div
        aria-hidden
        className="absolute top-2 right-2 flex items-center justify-center rounded-full opacity-70 group-hover:opacity-100 transition-opacity"
        style={{
          width: 24,
          height: 24,
          background: 'rgba(20,20,22,0.5)',
          backdropFilter: 'blur(4px)',
          color: 'rgba(255,255,255,0.95)',
          pointerEvents: 'none',
        }}
      >
        <GripVertical size={15} strokeWidth={2.25} />
      </div>
    </div>
  );
}
