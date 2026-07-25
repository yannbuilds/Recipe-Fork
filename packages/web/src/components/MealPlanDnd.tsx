import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

// Drag-and-drop pieces for the week grid: every meal row can be dragged by its
// grip onto any day, or onto "Not on a day yet" to take it off the calendar.
// Same @dnd-kit foundation as the cookbook reorder, but across containers
// (7 days + the no-day bucket) rather than one sortable list.

/** Droppable id for a day slot, or the no-day bucket. */
export function dropId(day: number | null): string {
  return day === null ? 'day-none' : `day-${day}`;
}

/** Reads a droppable id back into a day index (null = the no-day bucket). */
export function dayFromDropId(id: string): number | null {
  return id === 'day-none' ? null : Number(id.replace('day-', ''));
}

interface DropZoneState {
  /** A meal is hovering over this zone right now. */
  isOver: boolean;
  /** Some meal is being dragged — used to light up the empty slots. */
  dragging: boolean;
}

/**
 * Wraps a day row so meals can be dropped on it. Render-prop, so the row keeps
 * its own editorial layout and only reacts to the hover state.
 */
export function MealDropZone({
  id,
  children,
}: {
  id: string;
  children: (state: DropZoneState) => ReactNode;
}) {
  const { setNodeRef, isOver, active } = useDroppable({ id });
  return (
    <div ref={setNodeRef}>{children({ isOver: isOver && active != null, dragging: active != null })}</div>
  );
}

/**
 * A meal row you can pick up. The whole row is the drag body (so the drop
 * animation snaps the row into its new slot) but only the grip starts a drag —
 * the photo, title, cook button and options menu stay instantly tappable.
 */
export function DraggableMealRow({
  id,
  style,
  children,
}: {
  id: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      className="flex items-center gap-2"
      style={{
        ...style,
        opacity: isDragging ? 0.3 : 1,
        transition: 'opacity 0.15s ease',
      }}
    >
      <button
        ref={setActivatorNodeRef}
        {...attributes}
        {...listeners}
        aria-label="Drag to another day"
        onContextMenu={(e) => e.preventDefault()}
        style={{
          flexShrink: 0,
          display: 'grid',
          placeItems: 'center',
          width: 22,
          minHeight: 38,
          margin: '0 -4px 0 -7px',
          padding: 0,
          background: 'none',
          border: 'none',
          color: 'var(--muted)',
          opacity: isDragging ? 1 : 0.5,
          cursor: isDragging ? 'grabbing' : 'grab',
          // The handle owns the gesture: no page scroll, no long-press callout.
          touchAction: 'none',
          WebkitTouchCallout: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
        }}
      >
        <GripVertical size={13} strokeWidth={2} />
      </button>
      {children}
    </div>
  );
}
