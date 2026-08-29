// The S-curve's only job is to be honest about where the project actually is, so the tests
// pin the two things that make it dishonest: weighting by count instead of work, and
// inferring progress from the calendar.
import { describe, expect, it } from 'vitest';
import { buildSCurve } from '../src/engine/scurve';
import { buildPlan } from '../src/engine/planner';
import { skf } from '../src/data/skf';
import type { CalendarConfig, EngineConfig, ScheduledActivity } from '../src/domain/types';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar: cal,
  buffer: { internalBufferDays: 7, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};

const act = (id: string, start: string, end: string, dur: number, crew: number, pct?: number): ScheduledActivity =>
  ({
    id,
    name: id,
    phase: 'P',
    trade: 'civil',
    duration: { value: dur, provenance: 'input', source: 't' },
    deps: [],
    crew: { value: crew, provenance: 'norm', source: 't' },
    isMilestone: false,
    percentComplete: pct == null ? undefined : { value: pct, provenance: 'input', source: 'recorded' },
    es: 0, ef: dur, ls: 0, lf: dur, totalFloat: 0, critical: false,
    startDate: start, endDate: end,
  }) as ScheduledActivity;

describe('buildSCurve', () => {
  it('rises from 0 to 100 across the programme', () => {
    const c = buildSCurve([act('a', '2026-01-01', '2026-01-10', 10, 4)], '2026-01-05', 1);
    expect(c.points[0].planned).toBe(10);
    expect(c.points.at(-1)!.planned).toBe(100);
    for (let i = 1; i < c.points.length; i++) expect(c.points[i].planned >= c.points[i - 1].planned).toBe(true);
  });

  it('weights by work content, not by activity count', () => {
    // one 20-day gang-of-10 activity, and ten 1-day solo activities finishing first
    const big = act('big', '2026-01-01', '2026-01-20', 20, 10);
    const small = Array.from({ length: 10 }, (_, i) => act(`s${i}`, '2026-01-01', '2026-01-01', 1, 1));
    const c = buildSCurve([big, ...small], '2026-01-01', 1);
    // 10 of 11 activities are done on day one, but they are a sliver of the work
    expect(c.points[0].planned).toBeLessThan(20);
    expect(c.totalManDays).toBe(20 * 10 + 10);
  });

  it('never infers progress from the calendar', () => {
    // the window has passed and nothing was recorded: actual must stay at zero
    const c = buildSCurve([act('a', '2026-01-01', '2026-01-10', 10, 4)], '2026-02-01', 1);
    expect(c.plannedToday).toBe(100);
    expect(c.actualToday).toBe(0);
    expect(c.varianceToday).toBe(-100);
  });

  it('counts recorded progress and reports the gap', () => {
    const c = buildSCurve([act('a', '2026-01-01', '2026-01-10', 10, 4, 50)], '2026-01-10', 1);
    expect(c.actualToday).toBe(50);
    expect(c.varianceToday).toBe(-50);
  });

  it('leaves the future without an actual rather than drawing it flat', () => {
    const c = buildSCurve([act('a', '2026-01-01', '2026-01-10', 10, 4, 100)], '2026-01-05', 1);
    expect(c.points.filter((p) => p.date > '2026-01-05').every((p) => p.actual === null)).toBe(true);
    expect(c.points.filter((p) => p.date <= '2026-01-05').every((p) => p.actual !== null)).toBe(true);
  });

  it('starts the actual line at zero, where the planned line starts', () => {
    // The bug this pins: every activity counted its recorded progress from the first day of the
    // PROGRAMME rather than from its own start, so the actual line was drawn flat at the
    // project's overall percentage from the left edge of the chart to the right — the same
    // number before the job began, on the day it began, and at handover.
    const c = buildSCurve(
      [act('early', '2026-01-01', '2026-01-10', 10, 4, 100), act('late', '2026-02-01', '2026-02-10', 10, 4, 0)],
      '2026-02-10',
      1,
    );
    // half the work content is recorded complete, so the flat line sat at 50 from day one.
    expect(c.actualToday).toBe(50);
    expect(c.points[0].actual).toBeLessThan(50);
    // it leaves zero alongside the planned line rather than above it, and it rises
    expect(c.points[0].actual!).toBeLessThanOrEqual(c.points[0].planned);
    expect(new Set(c.points.map((p) => p.actual)).size).toBeGreaterThan(2);
  });

  it('never counts an activity before that activity started', () => {
    const c = buildSCurve([act('a', '2026-02-01', '2026-02-10', 10, 4, 100)], '2026-02-10', 1);
    expect(c.points.filter((p) => p.date < '2026-02-01').every((p) => p.actual === 0)).toBe(true);
  });

  it('arrives at exactly the recorded figure on today, and stops there', () => {
    const c = buildSCurve([act('a', '2026-01-01', '2026-01-20', 20, 4, 50)], '2026-01-10', 1);
    expect(c.points.find((p) => p.date === '2026-01-10')!.actual).toBe(50);
    expect(c.actualToday).toBe(50);
    expect(c.points.filter((p) => p.date > '2026-01-10').every((p) => p.actual === null)).toBe(true);
  });

  it('samples today itself, so the line reaches the today marker drawn beside it', () => {
    // at a weekly step the actual line could otherwise stop up to six days short of "today",
    // which reads as a gap in the record rather than as the sampling interval it is
    const c = buildSCurve([act('a', '2026-01-01', '2026-06-30', 180, 4, 40)], '2026-03-11');
    expect(c.points.some((p) => p.date === '2026-03-11')).toBe(true);
    expect(c.points.find((p) => p.date === '2026-03-11')!.actual).toBe(40);
  });

  it('a finished activity holds its recorded figure after its own end date', () => {
    // 'done' finishes on the 10th with everything recorded; 'rest' carries the programme on to
    // the 31st with nothing recorded, so the curve keeps sampling past the first one's end.
    const c = buildSCurve(
      [act('done', '2026-01-01', '2026-01-10', 10, 4, 100), act('rest', '2026-01-11', '2026-01-31', 21, 4, 0)],
      '2026-01-31',
      1,
    );
    const at = (d: string) => c.points.find((p) => p.date === d)!.actual;
    expect(at('2026-01-10')).toBe(at('2026-01-20'));
    expect(at('2026-01-20')).toBe(at('2026-01-31'));
    expect(at('2026-01-31')).toBeGreaterThan(0);
  });

  it('handles a real project without blowing up', () => {
    const plan = buildPlan(skf, cfg, '2026-07-01');
    const c = buildSCurve(plan.modules.timeline.activities, '2026-07-01');
    expect(c.points.length).toBeGreaterThan(5);
    expect(c.plannedFinish).toBe(plan.internal!.end);
    expect(c.plannedToday).toBeGreaterThan(0);
    expect(c.plannedToday).toBeLessThanOrEqual(100);
  });

  it('returns an empty curve rather than throwing when there is no schedule', () => {
    const c = buildSCurve([], '2026-01-01');
    expect(c.points).toEqual([]);
    expect(c.totalManDays).toBe(0);
  });
});
