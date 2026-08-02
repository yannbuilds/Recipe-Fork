export function getSunday(date: Date): Date {
  const d = new Date(date);
  d.setDate(d.getDate() - d.getDay());
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatWeekStart(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatWeekLabel(date: Date): string {
  return date.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
}

export function shiftWeek(date: Date, weeks: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + weeks * 7);
  return d;
}

export interface WeekOption {
  weekStart: string;
  label: string;
  isCurrent: boolean;
  isDefault: boolean;
}

/** Returns true when today is Fri/Sat/Sun — the typical meal-planning window. */
export function isPlanningMode(): boolean {
  const day = new Date().getDay();
  return day === 0 || day === 5 || day === 6;
}

/**
 * The week the Plan screen opens on — always the current one. Jumping ahead on
 * a weekend was disorienting: the meals you cooked on Monday vanished with no
 * explanation. The weekend nudge is now an offer on the screen, not a decision
 * made for you.
 */
export function getDefaultWeekStart(): Date {
  return getSunday(new Date());
}

export function getWeekOptions(count = 4): WeekOption[] {
  const now = new Date();
  const currentSunday = getSunday(now);
  const defaultSunday = formatWeekStart(isPlanningMode() ? shiftWeek(currentSunday, 1) : currentSunday);

  return Array.from({ length: count }, (_, i) => {
    const sunday = shiftWeek(currentSunday, i);
    const saturday = new Date(sunday);
    saturday.setDate(saturday.getDate() + 6);

    const ws = formatWeekStart(sunday);
    const label = `${formatWeekLabel(sunday)} – ${formatWeekLabel(saturday)}`;
    return {
      weekStart: ws,
      label,
      isCurrent: ws === formatWeekStart(currentSunday),
      isDefault: ws === defaultSunday,
    };
  });
}
