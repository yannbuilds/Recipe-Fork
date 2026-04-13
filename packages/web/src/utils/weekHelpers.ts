export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatWeekStart(date: Date): string {
  return date.toISOString().split('T')[0];
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

/** Like getMonday(), but auto-advances to next week on Fri/Sat/Sun. */
export function getDefaultWeekStart(): Date {
  const monday = getMonday(new Date());
  return isPlanningMode() ? shiftWeek(monday, 1) : monday;
}

export function getWeekOptions(count = 4): WeekOption[] {
  const now = new Date();
  const currentMonday = getMonday(now);
  const defaultMonday = formatWeekStart(isPlanningMode() ? shiftWeek(currentMonday, 1) : currentMonday);

  return Array.from({ length: count }, (_, i) => {
    const monday = shiftWeek(currentMonday, i);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const ws = formatWeekStart(monday);
    const label = `${formatWeekLabel(monday)} – ${formatWeekLabel(sunday)}`;
    return {
      weekStart: ws,
      label,
      isCurrent: ws === formatWeekStart(currentMonday),
      isDefault: ws === defaultMonday,
    };
  });
}
