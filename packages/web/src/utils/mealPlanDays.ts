import type { MealPlanEntry, Recipe } from '@recipe-aggregator/shared';

// Day helpers for the week grid. Weeks run Sunday-first (0 = Sun … 6 = Sat) to
// match `week_start` always being a Sunday.
//
// Mirrored in packages/mobile/src/lib/mealPlanDays.ts — keep the two in step.

export const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const DAY_FULL = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
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
    .filter((e) => e.entry_type !== 'batch' && e.day_index === dayIndex)
    .sort((a, b) => a.added_at.localeCompare(b.added_at));
}

/** Meals in the week that haven't been given a day. Never a to-do list. */
export function unplacedEntries(entries: MealPlanEntry[]): MealPlanEntry[] {
  return entries
    .filter((e) => e.entry_type !== 'batch' && (e.day_index === null || e.day_index === undefined))
    .sort((a, b) => a.added_at.localeCompare(b.added_at));
}

/**
 * Only 'cook' rows put ingredients on the shopping list. Legacy 'batch' rows
 * buy nothing, and 'out' buys nothing at all.
 */
export function shoppingSourceEntries(entries: MealPlanEntry[]): MealPlanEntry[] {
  return entries.filter((e) => e.entry_type === 'cook' && e.recipe);
}

/** Servings this cook should be shopped for; falls back to the recipe's own. */
export function entryServings(entry: MealPlanEntry): number | undefined {
  return entry.servings ?? entry.recipe?.custom_servings ?? entry.recipe?.servings ?? undefined;
}

/** What a recipe makes on its own terms, before plan mode has an opinion. */
export function recipeBatch(recipe: Pick<Recipe, 'servings' | 'custom_servings'>): number {
  return recipe.custom_servings ?? recipe.servings ?? 0;
}

/**
 * Servings one cook gets shopped for. Plan mode's own maths is people × meals,
 * but that's a floor, not a ceiling: a recipe already written for more than that
 * is planned as it stands. A six-serve slow cook or a tray of twelve dumplings is
 * portioned that way on purpose — scaling it down makes the cook fiddlier and the
 * extra meals, which are the point, disappear. Scaling *up* still happens as before.
 */
export function planServings(
  recipe: Pick<Recipe, 'servings' | 'custom_servings'>,
  servingsPerMeal: number,
  meals: number,
): number {
  return Math.max(servingsPerMeal * meals, recipeBatch(recipe));
}

/** Number of meals represented by one cook. Legacy batch rows are counted so
 * an older mobile build can coexist during rollout without resurfacing them. */
export function plannedMealCount(entry: MealPlanEntry, entries: MealPlanEntry[]): number {
  if (entry.entry_type !== 'cook') return 1;
  const legacyCount = 1 + entries.filter((e) => e.entry_type === 'batch' && e.parent_id === entry.id).length;
  return Math.max(entry.planned_nights ?? 1, legacyCount);
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
  const taken = new Set(entries.filter((e) => e.entry_type !== 'batch' && e.day_index != null).map((e) => e.day_index));
  const free = DAY_INDEXES.filter((d) => !taken.has(d) && (today === null || d >= today));
  if (free.length === 0) return [];

  const weekend = free.filter((d) => d === 0 || d === 6);
  const weekday = free.filter((d) => d >= 1 && d <= 5);

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
