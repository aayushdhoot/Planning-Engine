// Does the plan believe its own inputs?
//
// Keppel (Pune) was set up with a 90-day contract and produced a six-day internal baseline,
// eighty-five days of buffer, and a screen reading "invariant holds". Nothing in the chain was
// individually wrong: the BOQ came through as ₹4.46 lakh of stray rows against a ₹8.75 crore
// contract, every trade fell back to the 2% floor, ₹8,915 over a gang of four at ₹12,000 a
// man-day rounds up to one day, and sixteen one-day activities really do finish in six days.
//
// What was missing was anyone asking whether the inputs had said enough to be worth computing
// from. These tests are that question, in the three places it can be asked.
import { describe, expect, it } from 'vitest';
import type { BoqPackage, CalendarConfig, EngineConfig, ProjectInputs } from '../src/domain/types';
import { buildPlan, clientView } from '../src/engine/planner';
import { deriveWbs } from '../src/engine/wbs';
import { skf } from '../src/data/skf';
import norms from '../src/norms/norms-v1.json';

const cfg: EngineConfig = {
  calendar: { weeklyOffDays: [], holidays: [], workModeFactor: 1 } as CalendarConfig,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};

const t = (value: number, source = 'test') => ({ value, provenance: 'input' as const, source });
const pkg = (code: string, trade: string, amount: number): BoqPackage =>
  ({ code, name: code, clientAmount: t(amount), bcsAmount: null, trade });

/** The Keppel shape: a real contract, a BOQ that never actually read. */
const project = (packages: BoqPackage[], contractValue: number, durationDays = 90): ProjectInputs =>
  ({
    id: 'k', name: 'Keppel (Pune)', client: 'Keppel', location: 'Pune',
    areaSft: t(26484), contractStart: '2026-08-27', contractDurationCalDays: t(durationDays),
    contractValue: t(contractValue), bcsValue: null, milestones: [],
    boqPackages: packages, scheduleActivities: [],
    provided: { boq: true, contract: true, layout: true, drawings: true, day0Images: true, design3d: true, salesKt: true, makeList: true, paymentTerms: true },
    ldPercentPerWeek: null, ldCapPercent: null, dlpMonths: null,
    siteConditions: [], materialItems: [], scopeNotes: [], designRefs: [],
  }) as ProjectInputs;

describe('a BOQ that does not describe its contract', () => {
  const plan = buildPlan(project([pkg('A1', 'general', 445_750)], 87_500_000), cfg, '2026-08-27');

  it('is caught by comparing two figures the engine already had', () => {
    const warned = plan.assumptions.find((a) => a.area === 'inputs' && /BOQ totals/.test(a.text));
    expect(warned).toBeDefined();
    expect(warned!.text).toMatch(/0\.5% of the job/);
    expect(warned!.text).toMatch(/Read the priced BOQ properly/);
  });

  it('is not hidden from the client view — it is a fault in our own inputs, not a secret', () => {
    expect(plan.assumptions.find((a) => /BOQ totals/.test(a.text))!.internalOnly).toBe(false);
  });

  it('caps confidence rather than averaging the fault away against nine present inputs', () => {
    // every input present and one package mapped would otherwise score ~0.86
    expect(plan.confidence.score).toBeLessThanOrEqual(0.35);
    expect(plan.confidence.basis).toMatch(/BOQ covers only/);
  });

  it('flags a BOQ that is too LARGE too — double-counted roll-up rows', () => {
    const doubled = buildPlan(project([pkg('A1', 'general', 200_000_000)], 87_500_000), cfg, '2026-08-27');
    expect(doubled.assumptions.find((a) => /counted twice/.test(a.text))).toBeDefined();
  });

  it('says nothing when the BOQ and the contract agree', () => {
    const sane = buildPlan(project([pkg('A1', 'general', 86_000_000)], 87_500_000), cfg, '2026-08-27');
    expect(sane.assumptions.filter((a) => /BOQ totals/.test(a.text))).toHaveLength(0);
  });
});

describe('the buffer can be wrong at both ends', () => {
  it('shapes an unusable BOQ to the contract the user actually typed', () => {
    // Keppel: 90 days entered, ₹4.46 lakh of BOQ, and a five-day programme came out. The five
    // days are the symptom of the BOQ, not a reading of the job, so the contract shapes the
    // programme instead — and every duration says which of the two it came from.
    const plan = buildPlan(project([pkg('A1', 'general', 445_750)], 87_500_000, 90), cfg, '2026-08-27');
    expect(plan.internal!.durationWorkingDays).toBeGreaterThan(60);
    expect(plan.ieInvariant.state).toBe('ok');
    expect(plan.ieInvariant.bufferCalendarDays!).toBeLessThanOrEqual(cfg.buffer.max);
    expect(plan.assumptions.some((a) => /shaped to the 90-day contract instead/.test(a.text))).toBe(true);
    expect(plan.modules.timeline.activities.every((a) => /NOT measured from the BOQ/.test(a.duration.source))).toBe(true);
    // shaping it does not make it trustworthy — the BOQ warning and the low score both stand
    expect(plan.assumptions.some((a) => /BOQ totals/.test(a.text))).toBe(true);
    expect(plan.confidence.score).toBeLessThanOrEqual(0.35);
  });

  it('still catches an over-large buffer the fit could not close', () => {
    // The backstop: when even the expansion bound cannot fill the contract, the gap is named
    // rather than reported as a healthy invariant.
    const tiny = { ...cfg, buffer: { ...cfg.buffer, max: 2 } };
    const plan = buildPlan(project([pkg('A1', 'general', 445_750)], 87_500_000, 3650), tiny, '2026-08-27');
    expect(plan.ieInvariant.holds).toBe(true); // it does hold. That was never the point.
    expect(plan.ieInvariant.state).toBe('implausible');
    const note = plan.assumptions.find((a) => a.area === 'schedule' && /before the contract end/.test(a.text));
    expect(note!.text).toMatch(/did not drive these durations|under-states the work/);
  });

  it('leaves a healthy project alone', () => {
    const plan = buildPlan(skf, cfg, '2026-07-01');
    expect(plan.ieInvariant.state).toBe('ok');
    expect(plan.assumptions.filter((a) => a.area === 'inputs' && /BOQ totals/.test(a.text))).toHaveLength(0);
    expect(plan.confidence.score).toBeGreaterThan(0.6);
  });

  it('still calls a real overrun a breach', () => {
    // one day of contract against a full programme
    const plan = buildPlan(project([pkg('A1', 'general', 86_000_000)], 87_500_000, 1), cfg, '2026-08-27');
    expect(plan.ieInvariant.holds).toBe(false);
    expect(plan.ieInvariant.state).toBe('breach');
  });

  it('never shows the client our judgement about our own inputs', () => {
    const plan = buildPlan(project([pkg('A1', 'general', 445_750)], 87_500_000), cfg, '2026-08-27');
    const client = clientView(plan);
    expect(client.ieInvariant.state).toBe('ok'); // the date is met; how comfortably is ours to know
    expect(client.ieInvariant.bufferCalendarDays).toBeNull();
  });
});

describe('deriveWbs says whether the BOQ drove it', () => {
  it('reports a BOQ that carried no value at all, and does not claim the durations mean anything', () => {
    const wbs = deriveWbs([pkg('A1', 'general', 0)], 90, []);
    expect(wbs.valueDriven).toBe(false);
    expect(wbs.notes.some((n) => /NOT driven by the BOQ/.test(n))).toBe(true);
    expect(wbs.notes.some((n) => /Durations are computed, not assumed/.test(n))).toBe(false);
  });

  it('puts the total it computed from into the note, since every date moves with it', () => {
    const wbs = deriveWbs([pkg('A1', 'civil', 5_000_000), pkg('B1', 'electrical', 4_000_000)], 90, []);
    expect(wbs.valueDriven).toBe(true);
    expect(wbs.totalValue).toBe(9_000_000);
    expect(wbs.notes.some((n) => /computed from ₹90,00,000 of package value/.test(n))).toBe(true);
  });

  it('warns when site images alone deleted half the sequence from a new project', () => {
    const conditions = ['civil', 'plumbing', 'partition', 'electrical', 'hvac', 'sprinkler', 'lv', 'ceiling', 'carpentry', 'glass'].map((trade) => ({
      trade, status: 'complete' as const, note: 'looks done', source: 'photo.jpg',
    }));
    const wbs = deriveWbs([pkg('A1', 'civil', 5_000_000)], 90, conditions);
    expect(wbs.notes.some((n) => /were skipped as already complete on the strength of site images alone/.test(n))).toBe(true);
  });
});

describe('the programme honours the duration the user typed', () => {
  const trades = ['civil', 'plumbing', 'partition', 'electrical', 'hvac', 'sprinkler', 'lv', 'ceiling', 'carpentry', 'glass', 'painting', 'flooring', 'modular', 'finishing', 'cleaning'];
  const fullBoq = trades.map((tr, i) => pkg(`P${i}`, tr, 12_000_000));

  it('compresses a programme that overruns the contract, instead of quietly overrunning it', () => {
    // Ascendion: 60 days entered, 131 came out, nothing said why. The work content still says
    // what it says — but the plan now aims at the date it was given and reports the cost.
    const plan = buildPlan(project(fullBoq, 180_000_000, 60), cfg, '2026-08-27');
    const note = plan.assumptions.find((a) => /compressed by ×/.test(a.text));
    expect(note).toBeDefined();
    expect(note!.text).toMatch(/putting proportionally more people/);
    expect(note!.text).toMatch(/Check the manpower module/);
  });

  it('holds work content constant when it compresses — the same job, more people, less time', () => {
    // Scaling durations alone would delete man-days: manpower and the S-curve both weight an
    // activity by duration × crew, so a shorter plan would also claim less labour. Free time.
    const plan = buildPlan(project(fullBoq, 180_000_000, 60), cfg, '2026-08-27');
    const compressed = plan.modules.timeline.activities.filter((a) => !a.isMilestone);
    expect(compressed.length).toBeGreaterThan(0);
    expect(compressed.every((a) => /duration x crew held constant/.test(a.crew.source))).toBe(true);
  });

  it('stops at the compression floor and says the date must move, rather than pretending', () => {
    // 315 days of work does not fit in 60 however many people are hired, and the engine says so
    // instead of producing a plan nobody can staff.
    const plan = buildPlan(project(fullBoq, 180_000_000, 60), cfg, '2026-08-27');
    const stopped = plan.assumptions.find((a) => /Compression stopped at the ×/.test(a.text));
    expect(stopped).toBeDefined();
    expect(stopped!.text).toMatch(/The date moves or the scope does/);
    expect(plan.ieInvariant.state).toBe('breach');
  });

  it('leaves a programme that already fits its contract alone', () => {
    const plan = buildPlan(skf, cfg, '2026-07-01');
    expect(plan.assumptions.some((a) => /compressed by ×|shaped to the/.test(a.text))).toBe(false);
    expect(plan.modules.timeline.activities.some((a) => /schedule fit/.test(a.duration.source))).toBe(false);
  });

  it('never lets compression cancel a site constraint the user just declared', () => {
    // The fit runs BEFORE the work-mode factor. Fitting afterwards would stretch the programme
    // for restricted daytime working and then pull it straight back, so the setting looked inert
    // and a real risk disappeared. A slower work mode must still cost time.
    const normal = buildPlan(skf, cfg, '2026-07-28');
    const slow = buildPlan(skf, { ...cfg, calendar: { ...cfg.calendar, workModeFactor: 1.25 } }, '2026-07-28');
    expect(slow.internal!.end > normal.internal!.end).toBe(true);
    expect(slow.ieInvariant.state).toBe('breach');
  });
});

describe('a sound BOQ that finishes far inside its contract', () => {
  // Snitch (Bengaluru): 90 days entered, a BOQ covering the whole job, and 22 working days came
  // out with 69 days of buffer and "invariant holds". Stretching used to be gated on the
  // durations being meaningless, on the reasoning that padding a sound plan invents work. It
  // does not — the crew moves inversely — and the gate left the honest case as the broken one.
  const trades = ['civil', 'plumbing', 'partition', 'electrical', 'hvac', 'sprinkler', 'lv', 'ceiling', 'carpentry', 'glass', 'painting', 'flooring', 'modular', 'finishing', 'cleaning'];
  const boq = trades.map((tr, i) => pkg(`P${i}`, tr, 1_200_000));
  const value = boq.reduce((s, x) => s + x.clientAmount.value, 0);
  const at = (days: number) => buildPlan(project(boq, value, days), cfg, '2026-08-29');

  it('spreads the work across the days the user actually specified', () => {
    const plan = at(90);
    expect(plan.internal!.durationWorkingDays).toBeGreaterThan(70);
    expect(plan.ieInvariant.bufferCalendarDays!).toBeLessThanOrEqual(cfg.buffer.max);
    expect(plan.ieInvariant.state).toBe('ok');
  });

  it('tracks the contract duration rather than ignoring it', () => {
    // the programme follows the number typed, in both directions, from one mechanism
    const spans = [38, 60, 90, 120].map((d) => at(d).internal!.durationWorkingDays);
    expect(spans).toEqual([...spans].sort((a, b) => a - b)); // monotonic
    expect(spans[3]).toBeGreaterThan(spans[0] * 2.5);
    for (const d of [38, 60, 90, 120]) expect(at(d).ieInvariant.bufferCalendarDays!).toBeLessThanOrEqual(cfg.buffer.max);
  });

  it('holds the work content while it stretches — smaller gangs, not more work', () => {
    // Only to the nearest whole worker: a gang cannot be 3.4 people and never drops below one.
    const content = (days: number) =>
      at(days).modules.timeline.activities.filter((a) => !a.isMilestone).reduce((s, a) => s + a.duration.value * a.crew.value, 0);
    const short = content(38);
    for (const d of [60, 90, 120]) expect(Math.abs(content(d) - short) / short).toBeLessThan(0.15);
  });

  it('says that a longer programme is not the cheaper one', () => {
    // Site man-days DO rise with the window — manpower holds a minimum viable gang per trade —
    // so the note must not claim the stretch is free. Reading it as the cheap plan is the
    // mistake it exists to prevent.
    const note = at(90).assumptions.find((a) => /stretched by ×/.test(a.text));
    expect(note).toBeDefined();
    expect(note!.text).toMatch(/minimum viable gang/);
    expect(note!.text).toMatch(/do not read this one as the cheaper plan/);
    expect(at(120).modules.manpower.totalManDays).toBeGreaterThan(at(38).modules.manpower.totalManDays);
  });
});

describe('the derived programme is a programme, not a skeleton', () => {
  // Snitch (Bengaluru) showed eight bars, each seventy days long, for a ninety-day fit-out —
  // because the template was one row per trade while the seeded projects carry a real issued
  // programme. The template is now that programme's task list.
  const trades = ['civil', 'plumbing', 'partition', 'electrical', 'hvac', 'sprinkler', 'lv', 'ceiling', 'carpentry', 'glass', 'painting', 'flooring', 'modular', 'finishing', 'cleaning'];
  const boq = trades.map((tr, i) => pkg(`P${i}`, tr, 1_200_000));
  const value = boq.reduce((s, x) => s + x.clientAmount.value, 0);

  it('matches the granularity of the issued programme it was taken from', () => {
    const wbs = deriveWbs(boq, 90, []);
    expect(wbs.activities.length).toBe(skf.scheduleActivities.length);
    expect(new Set(wbs.activities.map((a) => a.phase)).size).toBeGreaterThanOrEqual(10);
  });

  it('keeps the site sequence a site manager would recognise', () => {
    const wbs = deriveWbs(boq, 90, []);
    const at = (name: string) => wbs.activities.findIndex((a) => a.name === name);
    expect(at('GI Sheet Ducting Fabrication & Installation')).toBeLessThan(at('Duct Light Testing (Pre-insulation)'));
    expect(at('Duct Light Testing (Pre-insulation)')).toBeLessThan(at('Thermal & Acoustic Insulation'));
    expect(at('C-Class Sprinkler Piping (Grooved)')).toBeLessThan(at('Sprinkler Testing & Commissioning'));
    expect(at('Internal Walls (Putty + Paint)')).toBeLessThan(at('Carpet Installation'));
  });

  it('does not get longer just for being more detailed', () => {
    // Each of HVAC's nine tasks takes a share of HVAC's value, not all of it. Without that, a
    // richer template would inflate every trade by its own row count.
    const wbs = deriveWbs(boq, 90, []);
    const hvacDays = wbs.activities.filter((a) => a.trade === 'hvac').reduce((s, a) => s + a.duration.value, 0);
    const civilDays = wbs.activities.filter((a) => a.trade === 'civil').reduce((s, a) => s + a.duration.value, 0);
    // equal package value, so equal work — nine HVAC rows must not out-weigh five civil ones
    expect(hvacDays).toBeLessThan(civilDays * 3);
  });

  it('still lands on the contract at every length, with the detailed template', () => {
    for (const days of [45, 60, 90, 120]) {
      const plan = buildPlan(project(boq, value, days), cfg, '2026-08-27');
      expect(plan.modules.timeline.activities.length).toBe(69);
      expect(plan.ieInvariant.state).toBe('ok');
      expect(plan.ieInvariant.bufferCalendarDays!).toBeLessThanOrEqual(cfg.buffer.max);
      expect(plan.ieInvariant.bufferCalendarDays!).toBeGreaterThanOrEqual(0);
    }
  });

  it('lands on the contract even when every duration is on the one-day floor', () => {
    // The Keppel shape. Whole-day durations made the finish a step function — 31 / 63 / 95
    // calendar days with nothing between — until the rounding remainder was carried across
    // tasks AND across the start-to-start lags the critical path actually runs through.
    for (const days of [45, 60, 90, 120]) {
      const plan = buildPlan(project([pkg('A1', 'general', 445_750)], 87_500_000, days), cfg, '2026-08-27');
      expect(plan.ieInvariant.state).toBe('ok');
      expect(plan.ieInvariant.bufferCalendarDays!).toBeGreaterThanOrEqual(0);
    }
  });
});
