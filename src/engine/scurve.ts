// S-curve: planned vs actual cumulative progress.
//
// The curve is built from work content, not from activity counts — finishing ten one-day
// snagging items is not the same progress as finishing one twenty-day HVAC run. Each activity
// contributes its duration × crew (man-days), spread evenly across its working window, which
// is the same quantity the manpower module levels.
//
// Actual is only ever what someone recorded. There is deliberately no "assume it is on track"
// fallback: an activity whose window has passed with nothing recorded drags the actual curve
// down, because that is the truth the curve exists to show.
import type { ScheduledActivity } from '../domain/types';
import { addCalendarDays } from './calendar';

export interface SCurvePoint {
  date: string;
  /** cumulative planned % complete, 0..100 */
  planned: number;
  /** cumulative actual % complete, 0..100; null once the date is in the future */
  actual: number | null;
}

export interface SCurve {
  points: SCurvePoint[];
  /** planned % at today */
  plannedToday: number;
  /** actual % at today */
  actualToday: number;
  /** actual minus planned at today; negative means behind */
  varianceToday: number;
  totalManDays: number;
  /** date the plan says the project completes */
  plannedFinish: string | null;
}

const DAY = 86400000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);

/** Man-days an activity carries: the work content the curve weights it by. */
const weightOf = (a: ScheduledActivity): number => Math.max(1, a.duration.value) * Math.max(1, a.crew.value);

/**
 * Build the curve at a sensible interval. Weekly for anything longer than ~3 months, otherwise
 * every few days, so the chart stays readable without hiding a slip.
 */
export function buildSCurve(acts: ScheduledActivity[], today: string, stepDays?: number): SCurve {
  const live = acts.filter((a) => !a.isMilestone);
  if (!live.length)
    return { points: [], plannedToday: 0, actualToday: 0, varianceToday: 0, totalManDays: 0, plannedFinish: null };

  const start = live.reduce((m, a) => (a.startDate < m ? a.startDate : m), live[0].startDate);
  const finish = live.reduce((m, a) => (a.endDate > m ? a.endDate : m), live[0].endDate);
  const totalManDays = live.reduce((s, a) => s + weightOf(a), 0);
  const spanDays = Math.max(1, Math.round((ms(finish) - ms(start)) / DAY));
  const step = stepDays ?? (spanDays > 90 ? 7 : spanDays > 30 ? 3 : 1);

  /** Share of an activity's work content that should be done by `date` (0..1). */
  const plannedShare = (a: ScheduledActivity, date: string): number => {
    if (date < a.startDate) return 0;
    if (date >= a.endDate) return 1;
    const total = Math.max(1, Math.round((ms(a.endDate) - ms(a.startDate)) / DAY) + 1);
    const done = Math.round((ms(date) - ms(a.startDate)) / DAY) + 1;
    return Math.min(1, done / total);
  };

  const points: SCurvePoint[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= finish && guard++ < 2000) {
    const planned = live.reduce((s, a) => s + weightOf(a) * plannedShare(a, cursor), 0);
    // actual is recorded progress only, and only up to today — the future has no actuals
    const actual =
      cursor > today
        ? null
        : live.reduce((s, a) => {
            const pct = a.percentComplete?.value;
            if (pct == null) return s;
            // an activity cannot be more complete at an earlier date than it is now
            return s + weightOf(a) * Math.min(pct / 100, plannedShare(a, cursor) || pct / 100);
          }, 0);
    points.push({
      date: cursor,
      planned: Math.round((planned / totalManDays) * 1000) / 10,
      actual: actual === null ? null : Math.round((actual / totalManDays) * 1000) / 10,
    });
    if (cursor === finish) break;
    const next = addCalendarDays(cursor, step);
    cursor = next > finish ? finish : next;
  }

  const at = (d: string) => points.filter((p) => p.date <= d).at(-1) ?? points[0];
  const nowPoint = today < start ? { planned: 0, actual: 0 } : today > finish ? points.at(-1)! : at(today);
  const plannedToday = today < start ? 0 : nowPoint.planned;
  const actualToday = today < start ? 0 : nowPoint.actual ?? 0;

  return {
    points,
    plannedToday,
    actualToday,
    varianceToday: Math.round((actualToday - plannedToday) * 10) / 10,
    totalManDays,
    plannedFinish: finish,
  };
}
