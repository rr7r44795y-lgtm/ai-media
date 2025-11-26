export const startOfWeek = (date: Date): Date => {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const diff = day; // week starts on Sunday
  copy.setUTCDate(copy.getUTCDate() - diff);
  return copy;
};

export const endOfWeek = (date: Date): Date => {
  const start = startOfWeek(date);
  start.setUTCDate(start.getUTCDate() + 6);
  return start;
};

export const getMonthVisibleRange = (anchor: Date): { start: Date; end: Date } => {
  const firstOfMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth(), 1));
  const lastOfMonth = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));
  const start = startOfWeek(firstOfMonth);
  const end = endOfWeek(lastOfMonth);
  return { start, end };
};

export const getMonthGrid = (anchor: Date): Date[][] => {
  const weeks: Date[][] = [];
  const { start, end } = getMonthVisibleRange(anchor);
  const current = new Date(start);
  while (current <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i += 1) {
      week.push(new Date(current));
      current.setUTCDate(current.getUTCDate() + 1);
    }
    weeks.push(week);
  }
  return weeks;
};

export const getWeekDays = (anchor: Date): Date[] => {
  const start = startOfWeek(anchor);
  return Array.from({ length: 7 }).map((_, idx) => {
    const day = new Date(start);
    day.setUTCDate(start.getUTCDate() + idx);
    return day;
  });
};

export const formatDateKey = (date: Date): string => date.toISOString().slice(0, 10);

export const isoDateString = (date: Date): string => date.toISOString().slice(0, 10);
