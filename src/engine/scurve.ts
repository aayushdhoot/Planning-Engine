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

  /**
   * Share of an activity's RECORDED progress that had been made by `date` (0..1).
   *
   * There is one percentage per activity and no history behind it, so this is a reconstruction
   * and is kept to the only defensible one: the recorded work accrued evenly from the day the
   * activity started to the last day it could have been accruing — its planned end, or today,
   * whichever came first. That makes the actual curve leave zero where the work did and arrive
   * at exactly the recorded figure on today's date.
   *
   * The earlier version read `Math.min(pct / 100, plannedShare(a, date) || pct / 100)`. Before
   * an activity's start `plannedShare` is 0, so the `||` fell through to the recorded figure
   * itself: every activity counted its progress from the first day of the PROGRAMME, whatever
   * its own dates. The drawn result was a flat line sitting at the project's overall percentage
   * from the left edge of the chart to the right — the same number before the job began, on the
   * day it began, and at handover. It said nothing at all about when the work happened.
   */
  const actualShare = (a: ScheduledActivity, date: string): number => {
    const pct = a.percentComplete?.value;
    if (pct == null || pct <= 0) return 0;
    if (date < a.startDate) return 0;
    const recorded = Math.min(1, pct / 100);
    const ref = a.endDate < today ? a.endDate : today;
    if (ref <= a.startDate) return recorded; // started and reported inside one day
    const total = Math.round((ms(ref) - ms(a.startDate)) / DAY) + 1;
    const done = Math.round((ms(date) - ms(a.startDate)) / DAY) + 1;
    return recorded * Math.min(1, done / total);
  };

  const dates: string[] = [];
  let cursor = start;
  let guard = 0;
  while (cursor <= finish && guard++ < 2000) {
    dates.push(cursor);
    if (cursor === finish) break;
    const next = addCalendarDays(cursor, step);
    cursor = next > finish ? finish : next;
  }
  // The curve has to actually reach today, not the last sampling point before it. At a weekly
  // step the actual line could otherwise stop up to six days short of the "today" marker drawn
  // beside it, which reads as a gap in the record rather than as the sampling interval it is.
  if (today > start && today < finish && !dates.includes(today)) {
    dates.push(today);
    dates.sort();
  }

  const points: SCurvePoint[] = dates.map((d) => {
    const planned = live.reduce((s, a) => s + weightOf(a) * plannedShare(a, d), 0);
    // actual is recorded progress only, and only up to today — the future has no actuals
    const actual = d > today ? null : live.reduce((s, a) => s + weightOf(a) * actualShare(a, d), 0);
    return {
      date: d,
      planned: Math.round((planned / totalManDays) * 1000) / 10,
      actual: actual === null ? null : Math.round((actual / totalManDays) * 1000) / 10,
    };
  });

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
