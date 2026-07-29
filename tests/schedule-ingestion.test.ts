// Schedule ingestion replaces hand-transcription of issued programmes, so it is tested to the
// same bar as the CPM engine: exact dates, real float, and no silently mis-booked trades.
import { describe, expect, it } from 'vitest';
import { ScheduleIngestionService, parsePredecessors, parseScheduleDate, tradeForSection } from '../src/services/schedule-ingestion';
import { computeCpm } from '../src/engine/cpm';
import type { CalendarConfig } from '../src/domain/types';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const svc = new ScheduleIngestionService();

const GRID: unknown[][] = [
  ['KOHLER PUNE - PROJECT SCHEDULE'],
  ['Phase 1 - 30 Days | Phase 2 - 90 Days'],
  ['Activity\nNo.', 'Section', 'Activity Description', 'Pred.', 'Dur\n(Days)', 'Start\nDay', 'Finish\nDay', 'Float\n(Days)', 'Critical'],
  ['PHASE 1  -  DEMOLITION  (DAY 1-30)'],
  ['1.1', 'Mobilisation', 'Site mobilisation & access setup', '-', '3', '7-Jul-26', '10-Jul-26', '0', 'Yes'],
  ['1.2', 'Mobilisation', 'Hoarding & barricading', '1.1', '2', '11-Jul-26', '13-Jul-26', '113', 'No'],
  ['2.1', 'Survey & Make-Safe', 'Dilapidation survey', '1.1', '2', '14-Jul-26', '16-Jul-26', '0', 'Yes'],
  ['2.2', 'Survey & Make-Safe', 'Services mapping', '2.1 SS+1', '2', '14-Jul-26', '16-Jul-26', '1', 'No'],
  ['5.4', 'Milestone', 'Cleared shell handover', '2.2', '0', '30', '30', '0', 'Yes'],
  [null, null, 'Legend:', null, 'Normal activity'],
];

describe('parseScheduleDate', () => {
  it('reads the date shapes a programme sheet actually contains', () => {
    expect(parseScheduleDate('7-Jul-26')).toBe('2026-07-07');
    expect(parseScheduleDate('07-July-2026')).toBe('2026-07-07');
    expect(parseScheduleDate('2026-07-07')).toBe('2026-07-07');
    // SheetJS hands back local-time dates, so this must survive any host timezone
    expect(parseScheduleDate(new Date(2026, 6, 7))).toBe('2026-07-07');
  });

  it('reads a local-time date cell as the day it displays, in any timezone', () => {
    // east of UTC, toISOString() on a local midnight yields the previous day — the bug this pins
    expect(parseScheduleDate(new Date(2026, 0, 1))).toBe('2026-01-01');
    expect(parseScheduleDate(new Date(2026, 11, 31))).toBe('2026-12-31');
  });
  it('returns null rather than a wrong date for day numbers and junk', () => {
    expect(parseScheduleDate('30')).toBeNull();
    expect(parseScheduleDate('')).toBeNull();
    expect(parseScheduleDate('Legend')).toBeNull();
    expect(parseScheduleDate('7-Xxx-26')).toBeNull();
  });
});

describe('parsePredecessors', () => {
  it('reads type and lag out of the sheet notation', () => {
    expect(parsePredecessors('2.1 SS+1')).toEqual([{ pred: '2.1', type: 'SS', lag: 1 }]);
    expect(parsePredecessors('9.6 SS+3, 11.1')).toEqual([
      { pred: '9.6', type: 'SS', lag: 3 },
      { pred: '11.1', type: 'FS', lag: 0 },
    ]);
    expect(parsePredecessors('3.6, 4.1, 3.5').map((d) => d.pred)).toEqual(['3.6', '4.1', '3.5']);
    expect(parsePredecessors('TW.1')).toEqual([{ pred: 'TW.1', type: 'FS', lag: 0 }]);
    expect(parsePredecessors('14.6 SS-2')).toEqual([{ pred: '14.6', type: 'SS', lag: -2 }]);
    expect(parsePredecessors('8.2 FF+1')).toEqual([{ pred: '8.2', type: 'FF', lag: 1 }]);
  });
  it('treats "-" and blank as no predecessor', () => {
    expect(parsePredecessors('-')).toEqual([]);
    expect(parsePredecessors('')).toEqual([]);
    expect(parsePredecessors(null)).toEqual([]);
  });
});

describe('tradeForSection', () => {
  it('does not book an HVAC gang for "site induction"', () => {
    expect(tradeForSection('Mobilisation', 'HSE setup, permits & site induction')).toBe('general');
  });
  it('treats strip-out as demolition labour, not the trade being removed', () => {
    expect(tradeForSection('Demolition & Dismantling', 'Dismantling of existing services (cable, duct, pipe)')).toBe('civil');
    expect(tradeForSection('Demolition & Dismantling', 'Dismantling of partitions, glazing & doors')).toBe('civil');
  });
  it('splits a bundled Services section by description', () => {
    expect(tradeForSection('Services - Phase I', 'HVAC works - Phase I (ducting & piping)')).toBe('hvac');
    expect(tradeForSection('Services - Phase I', 'Electrical works - Phase I (conduiting & cabling)')).toBe('electrical');
    expect(tradeForSection('Services - Phase I', 'PHE works - Phase I (drainage & water lines)')).toBe('plumbing');
    expect(tradeForSection('Services - Phase II', 'Passive networking - Phase II (termination & racks)')).toBe('lv');
  });
  it('only ever returns a trade the norms define', async () => {
    const norms = (await import('../src/norms/norms-v1.json')).default as { crewByTrade: Record<string, number> };
    const samples = [
      ['Finishes', 'Painting works - final coat'],
      ['Finishes', 'Flooring works - tile, marble, wooden & carpet'],
      ['Joinery', 'Doors & ironmongery installation'],
      ['Testing & Handover', 'Snagging & de-snagging'],
      ['Unknown Section', 'Something entirely unmapped'],
    ];
    for (const [s, d] of samples) expect(norms.crewByTrade[tradeForSection(s, d)]).toBeDefined();
  });
});

describe('ScheduleIngestionService.fromGrid', () => {
  const parsed = svc.fromGrid(GRID, 'test.xlsx · Project Schedule');

  it('finds the header row past the title banners and skips legend rows', () => {
    expect(parsed.activities).toHaveLength(5);
    expect(parsed.projectStart).toBe('2026-07-07');
  });

  it('resolves a day-numbered milestone against day 1', () => {
    const ms = parsed.activities.find((a) => a.id === '5.4')!;
    expect(ms.isMilestone).toBe(true);
    expect(ms.duration.value).toBe(0);
    // day 30 is 29 calendar days after day 1 (7-Jul-26)
    expect(ms.plannedStartFromInput).toBe('2026-08-05');
    expect(parsed.durationDays).toBe(120 - 90); // sheet's own max day number
  });

  it('traces every duration back to its sheet row', () => {
    for (const a of parsed.activities) {
      expect(a.duration.provenance).toBe('input');
      expect(a.duration.source).toMatch(/row \d+/);
    }
  });

  it('reproduces the issued start dates exactly when fed through CPM', () => {
    const cpm = computeCpm(parsed.activities, parsed.projectStart!, cal);
    for (const a of cpm.activities) {
      const src = parsed.activities.find((x) => x.id === a.id)!;
      expect(`${a.id}:${a.startDate}`).toBe(`${a.id}:${src.plannedStartFromInput}`);
    }
  });

  it('drops predecessors that are not in the sheet instead of crashing CPM', () => {
    const g = GRID.map((r) => [...r]);
    g[5][3] = '9.9'; // predecessor that does not exist
    const p = svc.fromGrid(g, 'test.xlsx');
    expect(p.warnings.join(' ')).toMatch(/not found/i);
    expect(() => computeCpm(p.activities, p.projectStart!, cal)).not.toThrow();
  });

  it('reports rather than guesses when the header is missing', () => {
    const p = svc.fromGrid([['just'], ['some'], ['rows']], 'x.xlsx');
    expect(p.activities).toHaveLength(0);
    expect(p.warnings.join(' ')).toMatch(/header row/i);
  });
});
