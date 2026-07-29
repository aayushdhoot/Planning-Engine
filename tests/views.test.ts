import { describe, expect, it } from 'vitest';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import { buildPlan, clientView } from '../src/engine/planner';
import { validatePlan, canonicalJson } from '../src/engine/schema';
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
    leaky.modules.cashflow.margin = { value: 27.5, provenance: 'computed', source: 'x' };
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
