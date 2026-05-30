import { useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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

  // Suppress the Link's click navigation that fires right after a drag.
  // isDragging reliably latches true during a real drag; the stray click
  // fires immediately after the drag ends, so we swallow exactly that one.
  const wasDraggingRef = useRef(false);
  if (isDragging) wasDraggingRef.current = true;

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
    touchAction: 'none',
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClickCapture={(e) => {
        if (wasDraggingRef.current) {
          e.preventDefault();
          e.stopPropagation();
          wasDraggingRef.current = false;
        }
      }}
    >
      <CookbookCard
        cookbook={cookbook}
        recipeCount={recipeCount}
        coverImages={coverImages}
        index={index}
      />
    </div>
  );
}
