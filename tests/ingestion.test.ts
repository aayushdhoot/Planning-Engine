import { describe, expect, it } from 'vitest';
import { BoqIngestionService, parseAmount, splitCsv, tradeFor } from '../src/services/ingestion';
import { MemoryPersistence, FilePersistence } from '../src/services/persistence';
import { deriveWbs } from '../src/engine/wbs';
import { buildPlan } from '../src/engine/planner';
import { validatePlan, auditTrace } from '../src/engine/schema';
import type { CalendarConfig, EngineConfig, ProjectInputs } from '../src/domain/types';
import { skf } from '../src/data/skf';
import norms from '../src/norms/norms-v1.json';

const svc = new BoqIngestionService();

describe('BOQ parsing — messy real-world cells', () => {
  it('parses currency, blanks, negatives and junk', () => {
    expect(parseAmount(' 82,100,400 ')).toBe(82100400);
    expect(parseAmount('₹ 1,23,456.50')).toBe(123456.5);
    expect(parseAmount('(1,200)')).toBe(-1200);
    expect(parseAmount('-')).toBeNull();
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('N/A')).toBeNull();
    expect(parseAmount('28.00%')).toBeNull();
    expect(parseAmount(42)).toBe(42);
  });

  it('splits quoted CSV fields containing commas', () => {
    expect(splitCsv('A1,"Blockwork, AAC & Plastering"," 1,781,747 "', ',')).toEqual(['A1', 'Blockwork, AAC & Plastering', ' 1,781,747 ']);
  });

  it('maps line descriptions to trades', () => {
    expect(tradeFor('CIVIL WORKS')).toBe('civil');
    expect(tradeFor('HVAC_LOW SIDE')).toBe('hvac');
    expect(tradeFor('LOOSE FURNITURE & CHAIRS')).toBe('modular');
    expect(tradeFor('Something unclassifiable')).toBe('general');
  });
});

// A realistic messy extract of the SKF FINAL SUMMARY sheet: blank rows, merged-cell gaps,
// section roll-ups alongside children, percentage columns, tax rows after the grand total.
const MESSY_CSV = [
  'FINAL SUMMARY,,,,',
  '"Project: SKF, Phoenix Pune",,,,',
  ',,,,',
  ' PROJECT AREA (SFT) ," 26,484 ",,,',
  'S.No., Cost Heads , AMOUNT (INR) , Rate Per Sft , BCS AMOUNT (INR) , Margin',
  'A, ARCHITECTURAL WORKS : CIVIL AND INTERIORS ," 21,824,503 ", 824 ," 16,128,074 ",',
  'A1,CIVIL WORKS," 1,781,747 ", 67 ," 1,282,858 ",28.00%',
  'A2,INTERIOR WORKS," 15,573,856 ", 588 ," 11,621,460 ",25.38%',
  ',,,,',
  'A3,MODULAR GLASS PARTITIONS AND DOORS," 2,458,250 ", 93 ," 1,769,940 ",28.00%',
  'B1,CARPET FLOORING," 3,419,125 ", 129 ," 2,461,770 ",28.00%',
  'B2,MODULAR FURNITURE," 5,326,045 ", 201 ," 3,834,752 ",28.00%',
  'C1,ELECTRICAL WORKS," 13,398,707 ", 506 ," 9,647,069 ",28.00%',
  'HVAC,HVAC WORKS," 12,240,339 ", 462 ,-,',
  ', GRAND TOTAL (EXCLUSIVE OF TAXES) ," 82,100,400 "," 3,100 "," 59,538,240 ",27.48%',
  ',GST @ 18%," 14,778,072 ",," 10,716,883 ",',
  ', GRAND TOTAL (WITH TAXES) ," 96,878,472 ",," 70,255,123 ",',
].join('\n');

describe('BOQ ingestion — end to end', () => {
  const r = svc.parseBoq({ name: 'SKF-summary.csv', data: MESSY_CSV });

  it('recognises priced packages and skips noise', () => {
    const codes = r.packages.map((p) => p.code);
    expect(codes).toContain('A1');
    expect(codes).toContain('C1');
    expect(codes).toContain('HVAC');
    expect(r.rowsSkipped).toBeGreaterThan(3);
  });

  it('drops the roll-up row that would double-count its children', () => {
    expect(r.packages.map((p) => p.code)).not.toContain('A');
  });

  it('extracts area, grand total and BCS from their own rows', () => {
    expect(r.areaSft!.value).toBe(26484);
    expect(r.contractValue!.value).toBe(82100400);
    expect(r.bcsValue!.value).toBe(59538240);
    expect(r.areaSft!.provenance).toBe('input');
    expect(r.contractValue!.source).toContain('SKF-summary.csv');
  });

  it('reads client and BCS amounts per package, and copes with a missing BCS cell', () => {
    const a1 = r.packages.find((p) => p.code === 'A1')!;
    expect(a1.clientAmount.value).toBe(1781747);
    expect(a1.bcsAmount!.value).toBe(1282858);
    expect(a1.trade).toBe('civil');
    const hvac = r.packages.find((p) => p.code === 'HVAC')!;
    expect(hvac.bcsAmount).toBeNull();
  });

  it('excludes tax rows from the totals', () => {
    expect(r.packages.some((p) => /gst|tax/i.test(p.name))).toBe(false);
  });

  it('warns rather than silently mis-totalling', () => {
    expect(r.warnings.some((w) => w.includes('5%'))).toBe(true); // this extract is a subset of the real sheet
  });

  it('handles an empty / unrecognisable file without throwing', () => {
    const empty = svc.parseBoq({ name: 'blank.csv', data: '\n\n,,,\n' });
    expect(empty.packages).toEqual([]);
    expect(empty.warnings.length).toBeGreaterThan(0);
  });
});

const LINE_ITEM_CSV = [
  'SL NO,ITEM DESCRIPTION,UNIT,QTY,RATE (INR),AMOUNT (INR)',
  'A1,Blockwork and plastering to walls,SQM,"1,450",820," 1,189,000 "',
  'A2,"Gypsum partition, double skin with rockwool",Sq.M,"2,100",1450," 3,045,000 "',
  'B1,Carpet tile flooring supply and lay,sqm,"2,300",900," 2,070,000 "',
  'C1,Light point wiring including switch,Nos,860,1100," 946,000 "',
  'PHE,C-class GI sprinkler piping,RMT,"1,150",640," 736,000 "',
].join('\n');

describe('Per-unit norms — quantities drive durations when the BOQ carries them', () => {
  const r = svc.parseBoq({ name: 'line-item.csv', data: LINE_ITEM_CSV });

  it('reads QTY and UNIT columns and canonicalises unit spellings', () => {
    const byCode = Object.fromEntries(r.packages.map((p) => [p.code, p]));
    expect(byCode.A1.quantity!.value).toBe(1450);
    expect(byCode.A1.unit).toBe('sqm');
    expect(byCode.A2.unit).toBe('sqm'); // "Sq.M"
    expect(byCode.B1.unit).toBe('sqm'); // "sqm"
    expect(byCode.C1.unit).toBe('pts'); // "Nos"
    expect(byCode.PHE.unit).toBe('rmt');
    expect(r.warnings.some((w) => w.includes('carry a physical quantity'))).toBe(true);
  });

  it('derives durations from quantity, not value, and says so in the provenance', () => {
    const wbs = deriveWbs(r.packages, null);
    const partition = wbs.activities.find((a) => a.trade === 'partition')!;
    expect(partition.duration.source).toContain('physicalProductivity');
    expect(partition.duration.source).toContain('sqm');
    // The quantity is split across the trade's tasks by template weight, the same way value is —
    // otherwise each of partition's three rows would carry the whole 2,100 sqm and the trade
    // would take three times as long for being described in more detail. Summed back up the
    // trade still carries its whole quantity, and that is the invariant worth pinning here
    // rather than any single row.
    const daysFor = (trade: string) =>
      wbs.activities.filter((a) => a.trade === trade).reduce((s, a) => s + a.duration.value, 0);
    // 2,100 sqm / (crew 10 x 4.5 sqm/man-day) = 46.7 days of work, now spread across three rows
    expect(daysFor('partition')).toBeGreaterThanOrEqual(46);
    expect(daysFor('partition')).toBeLessThanOrEqual(51);
    // 2,300 sqm / (crew 6 x 14) = 27.4 days of work across flooring's rows
    expect(daysFor('flooring')).toBeGreaterThanOrEqual(27);
    expect(daysFor('flooring')).toBeLessThanOrEqual(33);
  });

  it('falls back to value-based norms for trades without quantities, and labels the fallback', () => {
    const wbs = deriveWbs(r.packages, null);
    const modular = wbs.activities.find((a) => a.trade === 'modular')!;
    expect(modular.duration.source).toContain('no BOQ quantity available');
    expect(modular.duration.source).toContain('productivityInrPerManDay');
  });

  it('summary-level BOQs (no quantities) still plan, purely on value norms', () => {
    const wbs = deriveWbs(skf.boqPackages, 75);
    expect(wbs.activities.every((a) => a.duration.source.includes('productivityInrPerManDay'))).toBe(true);
  });
});

describe('Scope -> WBS -> plan, from BOQ alone (no supplied schedule)', () => {
  const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
  const cfg: EngineConfig = {
    calendar: cal,
    buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
    normsVersion: norms.version,
  };

  it('derives durations from norms x value, with provenance', () => {
    const wbs = deriveWbs(skf.boqPackages, 75);
    // one row per trade became the full fit-out task template — see SEQUENCE in engine/wbs.ts
    expect(wbs.activities.length).toBe(69);
    for (const a of wbs.activities) {
      expect(a.duration.provenance).toBe('computed');
      expect(a.duration.source).toContain('productivityInrPerManDay');
      expect(a.duration.value).toBeGreaterThan(0);
    }
    expect(wbs.notes.some((n) => n.includes('floored'))).toBe(true);
  });

  it('a BOQ-only project still produces a full, valid, traceable plan', () => {
    const boqOnly: ProjectInputs = { ...skf, id: 'skf-boq-only', scheduleActivities: [] };
    const plan = buildPlan(boqOnly, cfg, '2026-07-28');
    expect(plan.project.status).toBe('planned');
    expect(validatePlan(plan).errors).toEqual([]);
    expect(auditTrace(plan).ok).toBe(true);
    expect(plan.modules.timeline.activities.length).toBe(69);
    expect(plan.modules.raMilestones.length).toBeGreaterThanOrEqual(0);
    expect(plan.assumptions.some((a) => a.area === 'wbs')).toBe(true);
  });

  it('the derived programme lands in a plausible range against the 75-day contract', () => {
    const boqOnly: ProjectInputs = { ...skf, id: 'skf-boq-only', scheduleActivities: [] };
    const plan = buildPlan(boqOnly, cfg, '2026-07-28');
    const d = plan.internal!.durationWorkingDays;
    expect(d).toBeGreaterThan(45);
    expect(d).toBeLessThan(130);
  });
});

describe('Persistence service', () => {
  it('round-trips a workspace through the in-memory store', async () => {
    const p = new MemoryPersistence();
    expect(await p.load()).toBeNull();
    const w = { savedAt: '2026-07-28', normsVersion: norms.version, projects: [skf], config: { calendar: { weeklyOffDays: [], holidays: [], workModeFactor: 1 }, buffer: { internalBufferDays: 7, min: 0, max: 15 }, normsVersion: norms.version } };
    await p.save(w);
    const back = await p.load();
    expect(back!.projects[0].name).toBe('SKF, Pune');
    expect((await p.list()).length).toBe(1);
  });

  it('file persistence rejects a non-workspace file', async () => {
    const f = new FilePersistence();
    await expect(f.ingest('{"nope":1}')).rejects.toThrow(/workspace/i);
  });
});
