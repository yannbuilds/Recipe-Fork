import { useDraggable, useDroppable } from '@dnd-kit/core';
import { GripVertical } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

// Drag-and-drop pieces for the week grid: every meal row can be dragged from
// anywhere on its surface onto any day, or onto "Not on a day yet" to take it
// off the calendar.
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
 * A meal row you can pick up from anywhere on its surface. Touch uses the
 * DndContext's short hold before activation, so ordinary taps on the recipe,
 * cook button and options menu remain instant.
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
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id });

  return (
    <div
      ref={setNodeRef}
      className="flex items-center gap-2"
      onContextMenu={(e) => e.preventDefault()}
      {...attributes}
      {...listeners}
      style={{
        ...style,
        opacity: isDragging ? 0.3 : 1,
        transition: 'opacity 0.15s ease',
        cursor: isDragging ? 'grabbing' : 'grab',
        touchAction: 'pan-y',
        WebkitTouchCallout: 'none',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      <div
        aria-hidden
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
          pointerEvents: 'none',
        }}
      >
        <GripVertical size={13} strokeWidth={2} />
      </div>
      {children}
    </div>
  );
}
