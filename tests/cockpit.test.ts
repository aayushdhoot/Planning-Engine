// The cockpit's job is to be right about what needs attention. These pin the two ways it could
// mislead: inventing progress, and going green while something is actually broken.
import { describe, expect, it } from 'vitest';
import { buildCockpit } from '../src/engine/cockpit';
import { buildPlan } from '../src/engine/planner';
import { skf } from '../src/data/skf';
import { kohler } from '../src/data/kohler';
import { pendingKohler } from '../src/data/others';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const base: EngineConfig = {
  calendar: cal,
  buffer: { internalBufferDays: 7, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};

describe('cockpit', () => {
  const c = buildCockpit(buildPlan(kohler, base, '2026-09-15'), '2026-09-15');

  it('reports variance rather than absolutes', () => {
    const schedule = c.kpis.find((k) => k.key === 'schedule')!;
    // "+1 d buffer", not "120 working days"
    expect(schedule.value).toMatch(/^[+-]?\d+ d$|^—$/);
    expect(schedule.sub).toMatch(/buffer to|past the client date|no baseline/);
  });

  it('says out loud that nothing has been recorded, instead of implying progress', () => {
    expect(c.exceptions.some((e) => /No progress has been recorded/.test(e.title))).toBe(true);
    expect(c.kpis.find((k) => k.key === 'progress')!.value).toMatch(/^-/);
  });

  it('ranks red exceptions above amber', () => {
    const sev = c.exceptions.map((e) => e.severity);
    expect(sev.slice().sort((a, b) => (a === b ? 0 : a === 'red' ? -1 : 1))).toEqual(sev);
  });

  it('cannot be green while a red exception is open', () => {
    if (c.exceptions.some((e) => e.severity === 'red')) expect(c.rag).not.toBe('green');
  });

  it('routes every exception to a real module', () => {
    for (const e of c.exceptions) expect(['schedule', 'design', 'procurement', 'materials', 'billing', 'manpower']).toContain(e.area);
  });

  it('rolls trades up by work content, biggest first', () => {
    const md = c.trades.map((t) => t.manDays);
    expect(md.slice().sort((a, b) => b - a)).toEqual(md);
    expect(c.trades.reduce((s, t) => s + t.activities, 0)).toBe(
      buildPlan(kohler, base, '2026-09-15').modules.timeline.activities.length,
    );
  });

  it('flags a schedule that has eaten its buffer', () => {
    const late = buildCockpit(
      buildPlan(skf, { ...base, dates: { internalStart: '2026-07-20' } }, '2026-07-01'),
      '2026-07-01',
    );
    expect(late.rag).toBe('red');
    expect(late.exceptions.some((e) => /past the client date/.test(e.title))).toBe(true);
  });

  it('degrades cleanly for a project with no plan', () => {
    const none = buildCockpit(buildPlan(pendingKohler, base, '2026-07-01'), '2026-07-01');
    expect(none.trades).toEqual([]);
    expect(none.curve.points).toEqual([]);
  });
});
