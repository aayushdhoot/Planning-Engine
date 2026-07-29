import { describe, expect, it } from 'vitest';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import { buildPlan, clientView } from '../src/engine/planner';
import { validatePlan, canonicalJson } from '../src/engine/schema';
import { buildPertFromPlan } from '../src/engine/pert-build';
import { renderReport } from '../src/reports/render';
import { skf } from '../src/data/skf';
import { emirates } from '../src/data/others';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg = (extra: Partial<EngineConfig> = {}): EngineConfig => ({
  calendar: cal,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
  ...extra,
});
const TODAY = '2026-07-28';

describe('Client vs internal documents genuinely differ', () => {
  const internal = buildPlan(skf, cfg(), TODAY);
  const client = clientView(internal);

  it('audience is explicit and schema-enforced both ways', () => {
    expect(internal.audience).toBe('internal');
    expect(client.audience).toBe('client');
    expect(validatePlan(internal).errors).toEqual([]);
    expect(validatePlan(client).errors).toEqual([]);
  });

  it('schema rejects a client plan that leaks internal data', () => {
    const leaky = structuredClone(client);
    leaky.margin = { value: 27.5, provenance: 'computed', source: 'x' };
    expect(validatePlan(leaky).ok).toBe(false);
    const leaky2 = structuredClone(client);
    leaky2.modules.timeline.activities[0].critical = true;
    expect(validatePlan(leaky2).ok).toBe(false);
  });

  it('client JSON is materially smaller — real redaction, not a label', () => {
    const i = canonicalJson(internal).length;
    const c = canonicalJson(client).length;
    expect(c).toBeLessThan(i * 0.8);
  });

  it('client view drops manpower, resources, float and non-design to-dos', () => {
    expect(client.modules.manpower.days).toEqual([]);
    expect(client.modules.resources).toEqual([]);
    expect(client.modules.timeline.criticalPath).toEqual([]);
    expect(client.modules.todos.every((t) => t.category === 'design')).toBe(true);
    expect(internal.modules.manpower.days.length).toBeGreaterThan(0);
    expect(internal.modules.resources.length).toBe(7);
  });

  it('rendered reports differ in structure and content', () => {
    const ci = renderReport(internal, 'internal');
    const cc = renderReport(client, 'client');
    expect(ci).toContain('Not for external circulation');
    expect(ci).toContain('Critical path');
    expect(ci).toContain('BCS cost');
    expect(cc).not.toContain('BCS');
    expect(cc).not.toContain('Critical path');
    expect(cc).not.toContain('Margin');
    expect(cc).toContain('Inputs required from client / builder');
    expect(cc).toContain('Payment milestones');
    expect(ci.length).toBeGreaterThan(cc.length);
  });

  it('pending-input projects still render both reports without crashing', () => {
    const p = buildPlan(emirates, cfg(), TODAY);
    expect(renderReport(p, 'internal')).toContain('No plan generated');
    expect(renderReport(clientView(p), 'client')).toContain('pending');
  });
});

describe('Norms are editable data, not constants', () => {
  it('a lead-time override re-drives order-by dates and is recorded as an input', () => {
    const baseline = buildPlan(skf, cfg(), TODAY);
    const tweaked = buildPlan(skf, cfg({ normsOverrides: { packageLeadTimeDays: { B2: 90 } } }), TODAY);
    const b = baseline.modules.procurement.find((x) => x.category === 'Modular Furniture')!;
    const t = tweaked.modules.procurement.find((x) => x.category === 'Modular Furniture')!;
    expect(b.deliveryRequired).toBe(t.deliveryRequired); // the site date does not move
    expect(t.orderBy! < b.orderBy!).toBe(true); // but the order must go out earlier
    expect(t.basis).toContain('90d lead');
    expect(t.basis).toContain('override');
  });

  it('calendar and work-mode changes re-drive the schedule', () => {
    const normal = buildPlan(skf, cfg(), TODAY);
    const sundaysOff = buildPlan(skf, cfg({ calendar: { ...cal, weeklyOffDays: [0] } }), TODAY);
    const slow = buildPlan(skf, cfg({ calendar: { ...cal, workModeFactor: 1.25 } }), TODAY);
    expect(sundaysOff.internal!.end > normal.internal!.end).toBe(true);
    expect(slow.internal!.end > normal.internal!.end).toBe(true);
    // slower work mode must stretch the whole network, not just individual bars
    expect(slow.internal!.durationWorkingDays).toBeGreaterThan(normal.internal!.durationWorkingDays * 1.15);
    // and the engine must flag the resulting contract breach rather than hiding it
    expect(slow.ieInvariant.holds).toBe(false);
    expect(slow.assumptions.some((a) => a.area === 'schedule' && a.text.includes('below configured minimum'))).toBe(true);
    // a faster work mode buys buffer instead
    const fast = buildPlan(skf, cfg({ calendar: { ...cal, workModeFactor: 0.85 } }), TODAY);
    expect(fast.ieInvariant.bufferCalendarDays!).toBeGreaterThan(normal.ieInvariant.bufferCalendarDays!);
  });
});

describe('Dependency-driven overrun is detected and flagged', () => {
  it('a long-lead item that cannot be ordered in time is surfaced', () => {
    const late = buildPlan(skf, cfg(), '2026-08-01'); // "today" after several order-by dates
    const overdue = late.modules.procurement.filter((x) => x.orderBy && x.orderBy < '2026-08-01');
    expect(overdue.length).toBeGreaterThan(0);
    expect(overdue.some((x) => x.remarks.includes('has passed'))).toBe(true);
    expect(late.modules.todos.some((t) => t.category === 'procurement' && t.status === 'Delayed')).toBe(true);
  });
});

describe('actual dates override the contract (#16)', () => {
  const base: EngineConfig = {
    calendar: { weeklyOffDays: [], holidays: [], workModeFactor: 1 },
    buffer: { internalBufferDays: 7, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
    normsVersion: norms.version,
  };
  const TODAY = '2026-07-01';

  it('re-anchors the whole baseline when the site actually started late', () => {
    const onContract = buildPlan(skf, base, TODAY);
    const late = buildPlan(skf, { ...base, dates: { internalStart: '2026-06-15' } }, TODAY);
    expect(onContract.internal!.start).toBe('2026-06-08');
    expect(late.internal!.start).toBe('2026-06-15');
    // every downstream date moves with it rather than the plan describing a project that is not happening
    expect(late.internal!.end > onContract.internal!.end).toBe(true);
    expect(late.assumptions.some((a) => /re-anchored to the actual start/i.test(a.text))).toBe(true);
  });

  it('uses a client committed finish in place of contract start + duration', () => {
    const p = buildPlan(skf, { ...base, dates: { clientEnd: '2026-09-30' } }, TODAY);
    expect(p.external!.end).toBe('2026-09-30');
    expect(p.ieInvariant.externalEnd).toBe('2026-09-30');
    expect(p.assumptions.some((a) => /Client baseline finish set to 2026-09-30/.test(a.text))).toBe(true);
  });

  it('reports a missed internal target as a variance instead of compressing durations', () => {
    const p = buildPlan(skf, { ...base, dates: { internalEnd: '2026-07-31' } }, TODAY);
    expect(p.internal!.target).toBe('2026-07-31');
    expect(p.internal!.varianceDays).toBeGreaterThan(0);
    // the durations themselves must be untouched — the engine states the gap, it does not invent pace
    const plain = buildPlan(skf, base, TODAY);
    expect(p.internal!.end).toBe(plain.internal!.end);
    expect(p.assumptions.some((a) => /does not compress durations/i.test(a.text))).toBe(true);
  });

  it('shifts the client milestone dates with the client start', () => {
    const p = buildPlan(skf, { ...base, dates: { clientStart: '2026-06-22' } }, TODAY);
    expect(p.external!.start).toBe('2026-06-22');
    expect(p.external!.milestones[0].date).toBe('2026-06-22');
  });

  it('leaves the contract dates alone when nothing is overridden', () => {
    const p = buildPlan(skf, { ...base, dates: {} }, TODAY);
    expect(p.internal!.start).toBe('2026-06-08');
    expect(p.internal!.target).toBeNull();
    expect(p.internal!.varianceDays).toBeNull();
  });
});

describe('the client baseline does not drift with internal reality', () => {
  const base: EngineConfig = {
    calendar: { weeklyOffDays: [], holidays: [], workModeFactor: 1 },
    buffer: { internalBufferDays: 7, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
    normsVersion: norms.version,
  };

  it('holds the client dates on the contract when only the internal start slips', () => {
    const late = buildPlan(skf, { ...base, dates: { internalStart: '2026-06-22' } }, '2026-07-01');
    // internal moved…
    expect(late.internal!.start).toBe('2026-06-22');
    // …the client commitment did not
    expect(late.external!.start).toBe('2026-06-08');
    expect(late.external!.end).toBe('2026-08-22');
  });

  it('turns a slip that eats the buffer into a visible invariant breach', () => {
    const late = buildPlan(skf, { ...base, dates: { internalStart: '2026-07-20' } }, '2026-07-01');
    expect(late.ieInvariant.externalEnd).toBe('2026-08-22');
    expect(late.internal!.end > late.ieInvariant.externalEnd!).toBe(true);
    expect(late.ieInvariant.holds).toBe(false);
  });
});

describe('the client can actually see the schedule (#16)', () => {
  const c = cfg();
  const internal = buildPlan(skf, c, '2026-07-01');
  const client = clientView(internal);

  it('builds a PERT programme for the client view, not an empty tree', () => {
    const tree = buildPertFromPlan(client, '2026-07-01');
    expect(tree.root).not.toBeNull();
    expect(tree.totalTasks).toBeGreaterThan(0);
    expect(tree.byCategory.execution.length).toBeGreaterThan(0);
    expect(tree.source).not.toBe('no plan');
  });

  it('gives the client the same programme depth as internal', () => {
    const i = buildPertFromPlan(internal, '2026-07-01');
    const e = buildPertFromPlan(client, '2026-07-01');
    expect(e.totalTasks).toBe(i.totalTasks);
  });

  it('still produces nothing for a project with no plan', () => {
    const pending = buildPlan(emirates, c, '2026-07-01');
    expect(buildPertFromPlan(pending, '2026-07-01').root).toBeNull();
  });
});
