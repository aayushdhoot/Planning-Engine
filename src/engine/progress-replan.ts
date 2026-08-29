// Where the programme actually stands, and how to move the part of it that has
// not happened yet.
//
// Two things live here because they are the same act seen from two sides:
//   . the VERDICT — on track, behind, or ahead, in days rather than percent
//   . the SLIDE   — push unfinished work later, leaving finished work alone
//
// The engine's standing rule is that it states a gap rather than inventing a
// pace: nothing below runs on its own. A verdict is computed and shown; the
// slide happens only when somebody presses the button that applies it.
import type { ExternalDelay } from './planner';
import type { Plan } from './planner';
import type { SCurve } from './scurve';

const DAY = 86400000;
const ms = (d: string) => Date.parse(`${d}T00:00:00Z`);

export interface Verdict {
  /** 'on_track' | 'behind' | 'ahead' | 'not_started' */
  state: 'on_track' | 'behind' | 'ahead' | 'not_started';
  plannedPct: number;
  actualPct: number;
  /** percentage points; negative is behind */
  variancePct: number;
  /**
   * How far behind in TIME, not percent.
   *
   * Percent behind is the wrong unit for a decision: 20% short of plan means
   * one thing in week two and something else entirely in the last fortnight,
   * because the curve is steep in the middle and flat at both ends. This walks
   * back along the PLANNED curve to the date the plan expected to be at the
   * percentage actually reached — the distance between that date and today is
   * the slip, in days somebody can act on.
   */
  daysBehind: number;
  /** the date the plan expected today's actual percentage, or null if it never did */
  planWasHereOn: string | null;
  activitiesComplete: number;
  activitiesTotal: number;
  /** activities whose window has passed with nothing recorded as finished */
  overdue: number;
  line: string;
}

export function readVerdict(plan: Plan, curve: SCurve, today: string): Verdict {
  const acts = plan.modules.timeline.activities.filter((a) => !a.isMilestone);
  const complete = acts.filter((a) => (a.percentComplete?.value ?? 0) >= 100).length;
  // a date passing is not evidence of work — an activity past its window with
  // less than 100 recorded is overdue, never "probably done"
  const overdue = acts.filter((a) => a.endDate < today && (a.percentComplete?.value ?? 0) < 100).length;

  const plannedPct = curve.plannedToday;
  const actualPct = curve.actualToday;
  const variancePct = Math.round((actualPct - plannedPct) * 10) / 10;

  let planWasHereOn: string | null = null;
  for (const p of curve.points) {
    if (p.planned <= actualPct) planWasHereOn = p.date;
    else break;
  }
  const daysBehind = planWasHereOn ? Math.round((ms(today) - ms(planWasHereOn)) / DAY) : 0;

  const state: Verdict['state'] =
    actualPct <= 0 ? 'not_started'
      : variancePct >= -0.5 ? (variancePct > 0.5 ? 'ahead' : 'on_track')
        : 'behind';

  const line =
    state === 'not_started' ? 'Nothing recorded yet, so there is no position to report.'
      : state === 'ahead' ? `Ahead of the curve: ${actualPct}% done against ${plannedPct}% planned.`
        : state === 'on_track' ? `On the curve: ${actualPct}% done against ${plannedPct}% planned.`
          : `Behind by ${daysBehind} day${daysBehind === 1 ? '' : 's'}: ${actualPct}% done where the plan wanted ${plannedPct}%`
            + (planWasHereOn ? ` — that is where the plan stood on ${planWasHereOn}.` : '.');

  return { state, plannedPct, actualPct, variancePct, daysBehind, planWasHereOn,
    activitiesComplete: complete, activitiesTotal: acts.length, overdue, line };
}

/**
 * Push every activity that is NOT finished out by `days`, leaving finished work
 * where it is.
 *
 * Sliding the whole programme would be wrong on both ends: it would move work
 * already done — which has real recorded dates and cannot move — and it would
 * hide the fact that the slip is concentrated in what is left. So the floor is
 * applied per activity, and CPM re-solves the network around those floors, which
 * is what makes successors follow and the float recompute honestly.
 *
 * A part-done activity IS moved. It has started, but its remaining work is still
 * ahead of it, and that remainder is what the slip is made of.
 */
export function slidePending(plan: Plan, days: number, reason: string): ExternalDelay[] {
  if (!days) return [];
  const out: ExternalDelay[] = [];
  for (const a of plan.modules.timeline.activities) {
    if ((a.percentComplete?.value ?? 0) >= 100) continue;   // done is done
    out.push({
      activityId: a.id,
      minStartWorkingDay: Math.max(0, a.es + days),
      reason,
    });
  }
  return out;
}

/** How many working days a calendar-day shift is worth, at the plan's calendar. */
export function workingDaysIn(plan: Plan, calendarDays: number): number {
  const offPerWeek = (plan.calendar.weeklyOffDays ?? []).length;
  if (offPerWeek <= 0) return calendarDays;
  return Math.max(1, Math.round(calendarDays * ((7 - offPerWeek) / 7)));
}
