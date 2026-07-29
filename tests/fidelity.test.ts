import { describe, expect, it } from 'vitest';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import { buildPlan } from '../src/engine/planner';
import { skf } from '../src/data/skf';
import { emirates } from '../src/data/emirates';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar: cal,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};

describe('Baseline fidelity — CPM reproduces the source schedule', () => {
  const plan = buildPlan(skf, cfg, '2026-07-28');

  it('every activity starts on its source planned start date', () => {
    const drift = plan.modules.timeline.activities
      .filter((a) => a.plannedStartFromInput && a.startDate !== a.plannedStartFromInput)
      .map((a) => `${a.id} ${a.name}: cpm ${a.startDate} vs source ${a.plannedStartFromInput}`);
    expect(drift).toEqual([]);
  });

  it('project finish is within the contract window and matches the source end', () => {
    // source schedule End Date 15-Aug-26 (start + duration convention); CPM inclusive-end = 14-Aug-26
    expect(plan.internal!.end).toBe('2026-08-14');
    expect(plan.external!.end).toBe('2026-08-22');
  });

  it('critical path is a real subset, not everything', () => {
    const n = plan.modules.timeline.activities.length;
    const crit = plan.modules.timeline.criticalPath.length;
    expect(crit).toBeGreaterThan(3);
    expect(crit).toBeLessThan(n * 0.6);
  });

  it('float distribution is non-degenerate', () => {
    const floats = plan.modules.timeline.activities.map((a) => a.totalFloat);
    expect(Math.min(...floats)).toBe(0);
    expect(Math.max(...floats)).toBeGreaterThan(5);
  });
});

describe('Baseline fidelity — Emirates reproduces its issued PERT', () => {
  const plan = buildPlan(emirates, cfg, '2025-11-15');

  it('every activity starts on the date the issued programme says', () => {
    const drift = plan.modules.timeline.activities
      .filter((a) => a.plannedStartFromInput && a.startDate !== a.plannedStartFromInput)
      .map((a) => `${a.id} ${a.name}: cpm ${a.startDate} vs PERT ${a.plannedStartFromInput}`);
    expect(drift).toEqual([]);
  });

  it('the network keeps real parallelism — not everything is critical', () => {
    const n = plan.modules.timeline.activities.length;
    const crit = plan.modules.timeline.criticalPath.length;
    expect(n).toBeGreaterThan(200);
    expect(crit).toBeLessThan(n * 0.5);
    expect(crit).toBeGreaterThan(2);
  });

  it('finishes inside the contract window', () => {
    expect(plan.internal!.end <= plan.external!.end).toBe(true);
    expect(plan.ieInvariant.holds).toBe(true);
  });
});
