// KOHLER OS — the first project whose programme was INGESTED rather than transcribed.
// These tests hold it to the same bar as Emirates: exact reproduction of the issued dates,
// real float, and no invented commercial numbers.
import { describe, expect, it } from 'vitest';
import { kohler, kohlerProjectStart } from '../src/data/kohler';
import { buildPlan, clientView } from '../src/engine/planner';
import { computeCpm } from '../src/engine/cpm';
import { auditTrace, validatePlan } from '../src/engine/schema';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar: cal,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};
const TODAY = '2026-07-29';

describe('KOHLER inputs', () => {
  it('carries the BOQ headline figures from the FINAL SUMMARY', () => {
    expect(kohler.areaSft!.value).toBe(14905);
    expect(kohler.contractValue!.value).toBeCloseTo(57003999.7, 1);
    expect(kohler.contractValue!.provenance).toBe('input');
    expect(kohler.contractValue!.source).toMatch(/GRAND TOTAL/);
  });

  it('has 19 priced packages and drops the group headings that would double-count', () => {
    expect(kohler.boqPackages).toHaveLength(19);
    const sum = kohler.boqPackages.reduce((s, p) => s + p.clientAmount.value, 0);
    // leaf packages must reconcile to the grand total, not to grand total + group subtotals
    expect(sum).toBeCloseTo(kohler.contractValue!.value, 0);
    expect(kohler.boqPackages.map((p) => p.code)).not.toContain('A');
  });

  it('invents no internal cost, because the BOQ has no BCS column', () => {
    expect(kohler.bcsValue).toBeNull();
    for (const p of kohler.boqPackages) expect(p.bcsAmount).toBeNull();
  });

  it('carries the RA payment schedule, summing to 100%', () => {
    const total = kohler.milestones.reduce((s, m) => s + m.percent, 0);
    expect(total).toBeCloseTo(100, 6);
    expect(kohler.milestones[0].code).toBe('ADV');
    expect(kohler.milestones.at(-1)!.dayOffset).toBe(120);
  });

  it('holds the full issued programme', () => {
    expect(kohler.scheduleActivities).toHaveLength(66);
    expect(kohlerProjectStart).toBe('2026-07-07');
    expect(kohler.scheduleActivities.filter((a) => a.isMilestone)).toHaveLength(2);
  });
});

describe('KOHLER fidelity to the issued programme', () => {
  const cpm = computeCpm(kohler.scheduleActivities, kohlerProjectStart, cal);

  it('reproduces every planned start date exactly', () => {
    const drift = cpm.activities
      .map((a) => {
        const src = kohler.scheduleActivities.find((x) => x.id === a.id)!;
        return { id: a.id, computed: a.startDate, issued: src.plannedStartFromInput };
      })
      .filter((d) => d.computed !== d.issued);
    expect(drift).toEqual([]);
  });

  it('yields real float rather than a single critical chain', () => {
    const critical = cpm.activities.filter((a) => a.critical).length;
    expect(critical).toBeGreaterThan(0);
    expect(critical).toBeLessThan(cpm.activities.length / 2);
  });

  it('finishes inside the 120-day contract window', () => {
    const end = cpm.activities.reduce((m, a) => (a.endDate > m ? a.endDate : m), kohlerProjectStart);
    expect(end <= '2026-11-04').toBe(true);
  });

  it('agrees with the sheet on which activities are critical, bar the tail it disproves', () => {
    // The programme's own Critical column marks 26 activities; the engine confirms 24.
    // It does NOT confirm 14.10, because the sheet pins the handover milestone to day 120
    // (3-Nov) while its own predecessor 14.9 "Handover documentation & training" runs
    // 31-Oct–3-Nov and only completes at the end of that same day: the project is declared
    // handed over one working day before handover documentation finishes (hence the -1 lag
    // and 1 day of float on the milestone). 14.7 then carries 4 days of float rather than
    // zero, because 14.9 — not the snagging chain — drives the finish.
    // These disagreements are the engine doing its job, so they are asserted, not tolerated.
    const SHEET_CRITICAL = ['1.1', '10.1', '12.1', '14.10', '14.4', '14.6', '14.7', '2.1', '2.3', '2.4', '3.1', '3.2', '3.6', '4.2', '5.1', '5.2', '5.3', '5.4', '6.1', '6.3', '7.1', '7.7', '8.1', '8.2', '8.3', '9.2'];
    const engineCritical = new Set(cpm.activities.filter((a) => a.critical).map((a) => a.id));
    const unconfirmed = SHEET_CRITICAL.filter((id) => !engineCritical.has(id));
    expect(unconfirmed.sort()).toEqual(['14.10', '14.7']);
  });
});

describe('KOHLER package mapping', () => {
  const mapped = new Set(kohler.scheduleActivities.map((a) => a.packageCode).filter(Boolean));

  it('gives all but one cost head a site activity to draw down against', () => {
    const unmapped = kohler.boqPackages.filter((p) => !mapped.has(p.code)).map((p) => p.code);
    // H2 Kitchen Equipments is supply-only — no distinct site activity, so no order-by date.
    expect(unmapped).toEqual(['H2']);
  });

  it('books strip-out against the demolition budget, not the package being torn out', () => {
    const removal = kohler.scheduleActivities.find((a) => a.name.startsWith('Removal of existing flooring'))!;
    expect(removal.packageCode).toBe('A1');
  });

  it('leaves preliminaries unmapped rather than charging them to an unrelated head', () => {
    for (const name of ['Site mobilisation & access setup', 'Snagging & de-snagging', 'Handover documentation & training']) {
      const a = kohler.scheduleActivities.find((x) => x.name === name)!;
      expect(`${name}:${a.packageCode ?? 'unmapped'}`).toBe(`${name}:unmapped`);
    }
  });

  it('shares each package evenly across its activities, summing to 1', () => {
    for (const code of mapped) {
      const share = kohler.scheduleActivities.filter((a) => a.packageCode === code).reduce((s, a) => s + (a.valueShare ?? 0), 0);
      expect(`${code}:${share.toFixed(2)}`).toBe(`${code}:1.00`);
    }
  });
});

describe('KOHLER programme quality findings', () => {
  it('reports the dependencies whose issued dates contradict the sheet logic', () => {
    // 29 of 88. Recorded as a regression anchor: if the programme is reissued this number
    // should fall, and if it rises the reissue made the schedule less coherent, not more.
    const negative = kohler.scheduleActivities.flatMap((a) => a.deps.filter((d) => d.lag < 0));
    const total = kohler.scheduleActivities.reduce((n, a) => n + a.deps.length, 0);
    expect({ negative: negative.length, total }).toEqual({ negative: 29, total: 88 });
  });
});

describe('KOHLER plan', () => {
  const plan = buildPlan(kohler, cfg, TODAY);

  it('is planned, not pending_inputs', () => {
    expect(plan.project.status).toBe('planned');
    expect(plan.missingInputs).toEqual([]);
  });

  it('passes schema and traceability for both audiences', () => {
    expect(validatePlan(plan).errors).toEqual([]);
    expect(validatePlan(clientView(plan)).errors).toEqual([]);
    const trace = auditTrace(plan);
    expect(trace.ok).toBe(true);
    expect(trace.tracedCount).toBeGreaterThan(100);
  });

  it('says out loud that the margin is assumed, since no BCS was supplied', () => {
    const texts = plan.assumptions.map((a) => a.text).join(' ');
    expect(texts).toMatch(/BCS cost missing/i);
    expect(plan.margin).toBeNull();
  });

  it('keeps every trade inside its levelling cap on every day', () => {
    const caps = norms.crewCaps as unknown as Record<string, { min: number; max: number }>;
    for (const day of plan.modules.manpower.days)
      for (const [trade, n] of Object.entries(day.byTrade)) {
        const cap = caps[trade] ?? caps.default;
        expect({ trade, n, max: cap.max, over: n > cap.max }).toEqual({ trade, n, max: cap.max, over: false });
      }
  });

  it('redacts the client view', () => {
    const c = clientView(plan);
    expect(c.internal).toBeNull();
    expect(c.modules.manpower.days).toEqual([]);
    expect(c.margin).toBeNull();
  });
});
