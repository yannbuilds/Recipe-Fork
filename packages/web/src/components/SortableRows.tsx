import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';
import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type Modifier,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { GripVertical } from 'lucide-react';

/**
 * Drag-to-reorder for the small editable lists inside a form — the same
 * gesture the cookbook shelves use, sized down for a row of ingredients.
 *
 * Ids are positional (`ing-0`, `ing-1`, …) because the rows carry no id of
 * their own. That is safe here: the array is only reordered on drop, so the
 * ids never move mid-gesture, and once the drop lands dnd-kit sees the same
 * id list it started with — the row contents simply swap underneath it, with
 * no stray shift animation.
 */

const verticalOnly: Modifier = ({ transform }) => ({ ...transform, x: 0 });

/** Positional ids for a list of `count` rows. */
export function rowIds(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => `${prefix}-${i}`);
}

export function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Move a row, and give it the category of whichever neighbour it landed next
 * to. For the lists the wizard edits: it never shows categories, so without
 * this the recipe page would group a moved row straight back where it came
 * from and the order you just set wouldn't be the order you got.
 */
export function moveAdoptingCategory<T extends { category?: string | null }>(
  list: T[],
  from: number,
  to: number,
): T[] {
  const next = moveItem(list, from, to);
  const neighbour = next[to - 1] ?? next[to + 1];
  if (neighbour) next[to] = { ...next[to], category: neighbour.category };
  return next;
}

interface SortableRowsProps {
  /** One id per row, in render order. Build with `rowIds`. */
  ids: string[];
  /** Fired once on drop, with the positions to swap. */
  onReorder: (from: number, to: number) => void;
  /** Fired when a drag starts — a chance to close an open row editor. */
  onDragStart?: () => void;
  gap?: number;
  children: ReactNode;
}

export function SortableRows({ ids, onReorder, onDragStart, gap = 8, children }: SortableRowsProps) {
  // Desktop: a small drag distance activates, so a plain click still opens the
  // row for editing. Touch: a short press-and-hold, kept under Chrome's ~500ms
  // long-press so drag mode engages before its text-selection callout.
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 300, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Swallow the stray click that fires right after a drop, so letting go of a
  // row never also opens its editor. A window-level capture listener runs
  // before React does, which keeps it immune to render-timing races.
  const suppressNextClick = useRef(false);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!suppressNextClick.current) return;
      suppressNextClick.current = false;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, []);

  function handleDragEnd({ active, over }: DragEndEvent) {
    // Clear the flag shortly after the drop in case no click follows (touch),
    // so a later genuine tap is never eaten.
    setTimeout(() => {
      suppressNextClick.current = false;
    }, 300);

    if (!over || active.id === over.id) return;
    const from = ids.indexOf(String(active.id));
    const to = ids.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    onReorder(from, to);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      modifiers={[verticalOnly]}
      onDragStart={() => {
        suppressNextClick.current = true;
        // Confirm the long press landed, where the hardware allows it.
        navigator.vibrate?.(12);
        onDragStart?.();
      }}
      onDragEnd={handleDragEnd}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div style={{ display: 'flex', flexDirection: 'column', gap }}>{children}</div>
      </SortableContext>
    </DndContext>
  );
}

interface SortableRowProps {
  id: string;
  /** Nothing to grab — used for the row currently open for editing. */
  disabled?: boolean;
  /** Only the grip starts a drag. Use where the row is full of text inputs. */
  handleOnly?: boolean;
  /** Where the grip sits against the row's content. */
  gripAlign?: 'center' | 'top';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

export function SortableRow({
  id,
  disabled = false,
  handleOnly = false,
  gripAlign = 'center',
  className,
  style,
  children,
}: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
    disabled,
  });

  const dragProps = disabled ? {} : { ...attributes, ...listeners };

  const rowStyle: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: [transition, 'box-shadow 160ms ease'].filter(Boolean).join(', '),
    zIndex: isDragging ? 30 : undefined,
    position: 'relative',
    // The lifted row gets a real surface, laid on without shifting anything.
    boxShadow: isDragging ? '0 14px 30px rgba(0,0,0,0.18)' : undefined,
    background: isDragging ? 'var(--card)' : undefined,
    // Let touch scroll the page; the TouchSensor's delay decides between a
    // scroll and a drag, then suppresses scrolling once dragging.
    touchAction: 'pan-y',
    ...style,
  };

  const grip = (
    <span
      {...(handleOnly ? dragProps : {})}
      aria-label={handleOnly && !disabled ? 'Drag to reorder' : undefined}
      title={handleOnly && !disabled ? 'Drag to reorder' : undefined}
      className="rf-grip"
      style={{
        alignSelf: gripAlign === 'top' ? 'flex-start' : 'center',
        marginTop: gripAlign === 'top' ? 12 : 0,
        // Kept in the layout even when there's nothing to grab, so opening a
        // row for editing never nudges its content sideways.
        opacity: disabled ? 0 : undefined,
        pointerEvents: disabled ? 'none' : undefined,
        color: isDragging ? 'var(--green)' : 'var(--muted)',
        cursor: handleOnly ? (isDragging ? 'grabbing' : 'grab') : undefined,
        touchAction: handleOnly ? 'none' : undefined,
      }}
    >
      <GripVertical size={15} strokeWidth={2} aria-hidden />
    </span>
  );

  return (
    <div
      ref={setNodeRef}
      style={rowStyle}
      className={['rf-sortable-row', className].filter(Boolean).join(' ')}
      onContextMenu={(e) => e.preventDefault()}
      // Belt and braces: a native HTML5 drag would cut the pointer stream
      // dnd-kit needs, and the row would refuse to move.
      onDragStart={(e) => e.preventDefault()}
      {...(handleOnly ? {} : dragProps)}
    >
      <div style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
        {grip}
        <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      </div>
    </div>
  );
}
