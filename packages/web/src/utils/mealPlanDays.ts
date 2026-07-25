import type { MealPlanEntry } from '@recipe-aggregator/shared';

// Day helpers for the week grid. Weeks run Monday-first (0 = Mon … 6 = Sun) to
// match `week_start` always being a Monday.
//
// Mirrored in packages/mobile/src/lib/mealPlanDays.ts — keep the two in step.

export const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export const DAY_FULL = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];
export const DAY_INDEXES = [0, 1, 2, 3, 4, 5, 6];

/** The calendar date sitting in a given slot of the week. */
export function dayDate(weekStart: Date, dayIndex: number): Date {
  const d = new Date(weekStart);
  d.setDate(d.getDate() + dayIndex);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** 0–6 for today, or null when the week on screen isn't the current one. */
export function todayIndex(weekStart: Date): number | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (const i of DAY_INDEXES) {
    if (dayDate(weekStart, i).getTime() === today.getTime()) return i;
  }
  return null;
}

/** Entries sitting on a day, oldest first so the order is stable. */
export function entriesForDay(entries: MealPlanEntry[], dayIndex: number): MealPlanEntry[] {
  return entries
    .filter((e) => e.day_index === dayIndex)
    .sort((a, b) => a.added_at.localeCompare(b.added_at));
}

/** Meals in the week that haven't been given a day. Never a to-do list. */
export function unplacedEntries(entries: MealPlanEntry[]): MealPlanEntry[] {
  return entries
    .filter((e) => e.day_index === null || e.day_index === undefined)
    .sort((a, b) => a.added_at.localeCompare(b.added_at));
}

/**
 * Only 'cook' rows put ingredients on the shopping list. A 'batch' night eats
 * from the same pot, and 'out' buys nothing at all.
 */
export function shoppingSourceEntries(entries: MealPlanEntry[]): MealPlanEntry[] {
  return entries.filter((e) => e.entry_type === 'cook' && e.recipe);
}

/** Servings this cook should be shopped for; falls back to the recipe's own. */
export function entryServings(entry: MealPlanEntry): number | undefined {
  return entry.servings ?? entry.recipe?.custom_servings ?? entry.recipe?.servings ?? undefined;
}

/** Every row belonging to one cook — the cook itself plus its extra nights. */
export function batchSiblings(entry: MealPlanEntry, entries: MealPlanEntry[]): MealPlanEntry[] {
  const rootId = entry.entry_type === 'batch' ? entry.parent_id : entry.id;
  if (!rootId) return [entry];
  return entries
    .filter((e) => e.id === rootId || e.parent_id === rootId)
    .sort((a, b) => {
      // Placed nights read in day order; unplaced ones trail behind.
      const ad = a.day_index ?? 99;
      const bd = b.day_index ?? 99;
      if (ad !== bd) return ad - bd;
      return a.added_at.localeCompare(b.added_at);
    });
}

/**
 * "Night 2 of 3" for a meal-prep batch. Null for a one-night meal, so the UI
 * only marks up the case that actually needs explaining.
 */
export function batchPosition(
  entry: MealPlanEntry,
  entries: MealPlanEntry[],
): { index: number; total: number } | null {
  if (entry.entry_type === 'out') return null;
  const siblings = batchSiblings(entry, entries);
  if (siblings.length < 2) return null;
  const index = siblings.findIndex((e) => e.id === entry.id);
  return { index: index + 1, total: siblings.length };
}

/** The row that actually gets cooked for this batch. */
export function batchCookEntry(
  entry: MealPlanEntry,
  entries: MealPlanEntry[],
): MealPlanEntry | null {
  if (entry.entry_type !== 'batch') return entry.entry_type === 'cook' ? entry : null;
  return entries.find((e) => e.id === entry.parent_id) ?? null;
}

function totalMinutes(entry: MealPlanEntry): number {
  return (entry.recipe?.prep_time ?? 0) + (entry.recipe?.cook_time ?? 0);
}

/**
 * Spread the unplaced meals over the free days: the long cooks land on the
 * weekend, quick ones fill weeknights. Past days in the current week are
 * skipped — there's no use planning Monday on Wednesday.
 */
export function autoPlace(
  entries: MealPlanEntry[],
  weekStart: Date,
): { id: string; day_index: number }[] {
  const today = todayIndex(weekStart);
  const taken = new Set(entries.filter((e) => e.day_index != null).map((e) => e.day_index));
  const free = DAY_INDEXES.filter((d) => !taken.has(d) && (today === null || d >= today));
  if (free.length === 0) return [];

  const weekend = free.filter((d) => d >= 5);
  const weekday = free.filter((d) => d < 5);

  // Longest first, so the 90-minute ragù gets first claim on a weekend slot.
  const toPlace = [...unplacedEntries(entries)].sort((a, b) => totalMinutes(b) - totalMinutes(a));

  const out: { id: string; day_index: number }[] = [];
  const longThreshold = 45;

  for (const entry of toPlace) {
    let day: number | undefined;
    if (totalMinutes(entry) >= longThreshold && weekend.length > 0) {
      day = weekend.shift();
    } else if (weekday.length > 0) {
      day = weekday.shift();
    } else if (weekend.length > 0) {
      day = weekend.shift();
    }
    if (day === undefined) break;
    out.push({ id: entry.id, day_index: day });
  }

  return out;
}

/** Compact "Prep 20m · Cook 1h" style meta for a row. */
export function formatMins(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}
