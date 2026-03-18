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
}

export function getWeekOptions(count = 4): WeekOption[] {
  const now = new Date();
  const currentMonday = getMonday(now);

  return Array.from({ length: count }, (_, i) => {
    const monday = shiftWeek(currentMonday, i);
    const sunday = new Date(monday);
    sunday.setDate(sunday.getDate() + 6);

    const label = `${formatWeekLabel(monday)} – ${formatWeekLabel(sunday)}`;
    return {
      weekStart: formatWeekStart(monday),
      label,
      isCurrent: i === 0,
    };
  });
}
