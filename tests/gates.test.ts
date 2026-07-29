import { describe, expect, it } from 'vitest';
import type { Activity, CalendarConfig, EngineConfig } from '../src/domain/types';
import { computeCpm } from '../src/engine/cpm';
import { buildPlan, clientView } from '../src/engine/planner';
import { auditTrace, canonicalJson, validatePlan } from '../src/engine/schema';
import { workdayToDate, workingDaysBetween } from '../src/engine/calendar';
import { skf } from '../src/data/skf';
import { emirates, pendingKohler } from '../src/data/others';
import norms from '../src/norms/norms-v1.json';

const cal7: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar: cal7,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};
const TODAY = '2026-07-28';

const T = (v: number): Activity['duration'] => ({ value: v, provenance: 'input', source: 'golden-test' });
const act = (id: string, dur: number, deps: Activity['deps']): Activity => ({
  id, name: id, phase: 'P', trade: 'general', duration: T(dur), deps, crew: T(1), isMilestone: false,
});

describe('T1-CPM — golden schedule (hand-computed)', () => {
  // Network (durations in wd):
  // A(3) -> B(4) FS      A -> C(2) FS
  // B -> D(5) FS         C -> D SS+1
  // D -> E(2) FF+3       B -> E FS
  // Hand computation (ES/EF exclusive-EF convention):
  // A: ES0 EF3. B: ES3 EF7. C: ES3 EF5.
  // D: max(FS B: 7, SS C: ES_C+1=4) -> ES7 EF12.
  // E: max(FS B: 7, FF D: EF_D+3-2=13) -> ES13 EF15. Project end 15.
  // Backward: E: LF15 LS13. D: FF constraint from E: LF_E-3=12 -> LF12 LS7.
  // C: SS constraint on D: LS_D-1=6 -> LS on start => LF = 6+2=8. LS6. TF=3.
  // B: min(FS D: LS_D=7, FS E: LS_E=13) -> LF7 LS3. TF0.
  // A: min(FS B: 3, FS C: 6) -> LF3 LS0. TF0.
  // Critical path: A, B, D, E (TF=0). C float 3.
  const golden = [
    act('A', 3, []),
    act('B', 4, [{ pred: 'A', type: 'FS', lag: 0 }]),
    act('C', 2, [{ pred: 'A', type: 'FS', lag: 0 }]),
    act('D', 5, [{ pred: 'B', type: 'FS', lag: 0 }, { pred: 'C', type: 'SS', lag: 1 }]),
    act('E', 2, [{ pred: 'B', type: 'FS', lag: 0 }, { pred: 'D', type: 'FF', lag: 3 }]),
  ] as Activity[];

  it('matches hand-computed ES/EF/LS/LF, total float and critical path exactly', () => {
    const r = computeCpm(golden, '2026-06-08', cal7);
    const by = Object.fromEntries(r.activities.map((a) => [a.id, a]));
    expect([by.A.es, by.A.ef, by.A.ls, by.A.lf, by.A.totalFloat]).toEqual([0, 3, 0, 3, 0]);
    expect([by.B.es, by.B.ef, by.B.ls, by.B.lf, by.B.totalFloat]).toEqual([3, 7, 3, 7, 0]);
    expect([by.C.es, by.C.ef, by.C.ls, by.C.lf, by.C.totalFloat]).toEqual([3, 5, 6, 8, 3]);
    expect([by.D.es, by.D.ef, by.D.ls, by.D.lf, by.D.totalFloat]).toEqual([7, 12, 7, 12, 0]);
    expect([by.E.es, by.E.ef, by.E.ls, by.E.lf, by.E.totalFloat]).toEqual([13, 15, 13, 15, 0]);
    expect(r.projectDurationDays).toBe(15);
    expect(r.criticalPath).toEqual(['A', 'B', 'D', 'E']);
  });

  it('maps working-day indices to dates through a calendar with off-days', () => {
    const cal: CalendarConfig = { weeklyOffDays: [0], holidays: ['2026-06-10'], workModeFactor: 1 }; // Sundays off + 1 holiday
    // 2026-06-08 is a Monday. Index 0=8th, 1=9th, (10th holiday), 2=11th, 3=12th, 4=13th, (14th Sun), 5=15th
    expect(workdayToDate('2026-06-08', 0, cal)).toBe('2026-06-08');
    expect(workdayToDate('2026-06-08', 2, cal)).toBe('2026-06-11');
    expect(workdayToDate('2026-06-08', 5, cal)).toBe('2026-06-15');
    expect(workingDaysBetween('2026-06-08', '2026-06-15', cal)).toBe(6);
  });

  it('rejects cycles', () => {
    const cyc = [act('X', 1, [{ pred: 'Y', type: 'FS', lag: 0 }]), act('Y', 1, [{ pred: 'X', type: 'FS', lag: 0 }])] as Activity[];
    expect(() => computeCpm(cyc, '2026-06-08', cal7)).toThrow(/cycle/i);
  });
});

describe('T1-SCHEMA — canonical output validates', () => {
  it('SKF plan has all required keys', () => {
    const plan = buildPlan(skf, cfg, TODAY);
    const v = validatePlan(plan);
    expect(v.errors).toEqual([]);
    expect(v.ok).toBe(true);
  });
  it('degraded plans also validate', () => {
    for (const p of [emirates, pendingKohler]) {
      const v = validatePlan(buildPlan(p, cfg, TODAY));
      expect(v.ok).toBe(true);
    }
  });
});

describe('T1-TRACE — every quantitative field carries provenance', () => {
  it('SKF plan audit passes with a substantial traced count', () => {
    const plan = buildPlan(skf, cfg, TODAY);
    const audit = auditTrace(plan);
    expect(audit.orphans).toEqual([]);
    expect(audit.ok).toBe(true);
    expect(audit.tracedCount).toBeGreaterThan(150);
  });
});

describe('T1-IE — internal/external invariant', () => {
  it('external end ≥ internal end; buffer within configured range', () => {
    const plan = buildPlan(skf, cfg, TODAY);
    expect(plan.ieInvariant.holds).toBe(true);
    expect(plan.external!.end >= plan.internal!.end).toBe(true);
    expect(plan.ieInvariant.bufferCalendarDays!).toBeGreaterThanOrEqual(cfg.buffer.min);
    expect(plan.ieInvariant.bufferCalendarDays!).toBeLessThanOrEqual(cfg.buffer.max);
  });
  it('external baseline is anchored to contract dates', () => {
    const plan = buildPlan(skf, cfg, TODAY);
    expect(plan.external!.start).toBe('2026-06-08');
    expect(plan.external!.end).toBe('2026-08-22'); // 8-Jun + 75 calendar days (contract cl.28.2)
    expect(plan.external!.milestones.map((m) => m.code)).toEqual(['RA1', 'RA2', 'RA3', 'RA4', 'RA5', 'RA6']);
  });
  it('client view never leaks internal-only data', () => {
    const c = clientView(buildPlan(skf, cfg, TODAY));
    expect(c.internal).toBeNull();
    expect(c.modules.raMilestones.every((m) => m.checkpoints.every((k) => !k.responsibility && !k.activityId))).toBe(true);
    expect(c.modules.procurement.every((x) => x.vendor === '' && x.remarks === '')).toBe(true);
    expect(c.assumptions.every((a) => !a.internalOnly)).toBe(true);
    const s = canonicalJson(c);
    expect(s).not.toContain('59538240'); // BCS total must not appear anywhere in client JSON
    expect(s).not.toContain('"internalOnly": true');
  });
});

describe('T1-DETERMINISM — byte-identical output across runs', () => {
  it('same inputs + norms => identical canonical JSON', () => {
    const a = canonicalJson(buildPlan(skf, cfg, TODAY));
    const b = canonicalJson(buildPlan(skf, cfg, TODAY));
    expect(a).toBe(b);
    expect(a.length).toBeGreaterThan(1000);
  });
});

describe('T1-DEGRADE — missing inputs handled without crashing', () => {
  it('Emirates/KOHLER produce pending_inputs plans with explicit missing lists', () => {
    for (const p of [emirates, pendingKohler]) {
      const plan = buildPlan(p, cfg, TODAY);
      expect(plan.project.status).toBe('pending_inputs');
      expect(plan.missingInputs.length).toBeGreaterThan(5);
      expect(plan.assumptions.length).toBeGreaterThan(0);
      expect(plan.modules.timeline.activities).toEqual([]);
      expect(validatePlan(plan).ok).toBe(true);
    }
  });
  it('optional inputs absent on a valid project -> plan still produced with assumptions listed', () => {
    const partial = { ...skf, provided: { ...skf.provided, design3d: false, salesKt: false, day0Images: false, drawings: false } };
    const plan = buildPlan(partial, cfg, TODAY);
    expect(plan.project.status).toBe('planned');
    expect(plan.missingInputs).toContain('3D design');
    expect(plan.modules.timeline.activities.length).toBeGreaterThan(60);
  });
});

describe('Module sanity (Tier-2 support)', () => {
  const plan = buildPlan(skf, cfg, TODAY);
  it('all 8 modules populated for SKF', () => {
    const m = plan.modules;
    expect(m.timeline.activities.length).toBe(69);
    expect(m.manpower.days.length).toBeGreaterThan(50);
    expect(m.manpower.peak).toBeGreaterThan(0);
    expect(m.resources.length).toBe(7);
    expect(m.procurement.length).toBe(18);
    expect(m.design.rows.length).toBeGreaterThan(30);
    expect(m.todos.length).toBeGreaterThan(0);
    expect(m.dependencies.length).toBe(20);
    expect(m.raMilestones.length).toBe(6);
  });
  it('RA milestone amounts total the contract value', () => {
    const total = plan.modules.raMilestones.reduce((s, m) => s + (m.amount ?? 0), 0);
    expect(total).toBe(skf.contractValue!.value);
  });
  it('every package is ordered before the delivery date the programme needs', () => {
    for (const pr of plan.modules.procurement)
      if (pr.orderBy && pr.deliveryRequired) expect(pr.orderBy < pr.deliveryRequired).toBe(true);
  });
  it('margin matches BOQ summary (27.48%)', () => {
    expect(plan.margin!.value).toBeCloseTo(27.5, 1);
  });
});
