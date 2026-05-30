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
  const draggedRef = useRef(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);

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
      onPointerDownCapture={(e) => {
        draggedRef.current = false;
        startRef.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerMoveCapture={(e) => {
        if (!startRef.current) return;
        const dx = e.clientX - startRef.current.x;
        const dy = e.clientY - startRef.current.y;
        if (Math.hypot(dx, dy) > 6) draggedRef.current = true;
      }}
      onClickCapture={(e) => {
        if (isDragging || draggedRef.current) {
          e.preventDefault();
          e.stopPropagation();
          draggedRef.current = false;
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
