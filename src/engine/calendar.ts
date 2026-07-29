import type { CalendarConfig } from '../domain/types';

const DAY_MS = 86400000;

export function parseIso(d: string): Date {
  const [y, m, day] = d.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, day));
}

export function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function isWorkingDay(d: Date, cal: CalendarConfig): boolean {
  if (cal.weeklyOffDays.includes(d.getUTCDay())) return false;
  if (cal.holidays.includes(toIso(d))) return false;
  return true;
}

/** Working day index -> ISO date. Index 0 = first working day on/after startIso. */
export function workdayToDate(startIso: string, index: number, cal: CalendarConfig): string {
  let d = parseIso(startIso);
  // move to first working day
  while (!isWorkingDay(d, cal)) d = new Date(d.getTime() + DAY_MS);
  let remaining = index;
  while (remaining > 0) {
    d = new Date(d.getTime() + DAY_MS);
    if (isWorkingDay(d, cal)) remaining--;
  }
  return toIso(d);
}

/** Count working days from startIso (inclusive) to endIso (inclusive). */
export function workingDaysBetween(startIso: string, endIso: string, cal: CalendarConfig): number {
  let d = parseIso(startIso);
  const end = parseIso(endIso);
  let n = 0;
  while (d.getTime() <= end.getTime()) {
    if (isWorkingDay(d, cal)) n++;
    d = new Date(d.getTime() + DAY_MS);
  }
  return n;
}

/** Add calendar days to an ISO date. */
export function addCalendarDays(iso: string, days: number): string {
  return toIso(new Date(parseIso(iso).getTime() + days * DAY_MS));
}
