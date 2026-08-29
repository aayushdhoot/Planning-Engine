// Prefilling the intake questions from what the folder actually said.
//
// The screen used to present twelve blank fields immediately after reading 178 documents,
// several of which state the answer outright. These tests pin the two halves of fixing that
// which could each go wrong quietly: coercing a document's wording into the shape a control
// accepts, and never letting a proposal pass itself off as an answer.
import { describe, expect, it } from 'vitest';
import {
  applyPrefill, awaitingConfirmation, buildInventory, buildQueries, matchOption, toIsoDate, toNumber,
  unansweredBlocking, type FoundAnswer, type IntakeQuery,
} from '../src/engine/intake';
import type { DriveScan } from '../src/services/drive';

const scan: DriveScan = {
  folderId: 'x', folderName: 'Keppel (Pune)', scannedAt: '2026-08-27T00:00:00.000Z', files: [], skipped: [],
};
const questions = () => buildQueries(buildInventory(scan));
const byId = (qs: IntakeQuery[], id: string) => qs.find((q) => q.id === id)!;
const found = (key: string, value: string, source = 'Agreement.docx — clause 4'): FoundAnswer => ({ key, value, source });

describe('toIsoDate — the forms a contract writes a date in', () => {
  it('reads the ordinary Indian and written forms', () => {
    expect(toIsoDate('2026-02-04')).toBe('2026-02-04');
    expect(toIsoDate('4 Feb 2026')).toBe('2026-02-04');
    expect(toIsoDate('4th February 2026')).toBe('2026-02-04');
    expect(toIsoDate('February 4, 2026')).toBe('2026-02-04');
    expect(toIsoDate('possession from 04/02/2026')).toBe('2026-02-04');
    expect(toIsoDate('04.02.26')).toBe('2026-02-04');
  });

  it('reads all-numeric dates day-first, because every project here is in India', () => {
    // 04/02/26 is the fourth of February on an Indian fit-out contract, not the second of April.
    expect(toIsoDate('04/02/26')).toBe('2026-02-04');
    expect(toIsoDate('15/01/2026')).toBe('2026-01-15');
  });

  it('returns nothing rather than a guess — a wrong start date is worse than a blank one', () => {
    expect(toIsoDate('as per site readiness')).toBeNull();
    expect(toIsoDate('within 2 weeks of possession')).toBeNull();
    expect(toIsoDate('31/02/2026')).toBeNull(); // not a real day
    expect(toIsoDate('')).toBeNull();
  });
});

describe('toNumber — a count out of a sentence', () => {
  it('strips separators, units and surrounding words', () => {
    expect(toNumber('12,500')).toBe(12500);
    expect(toNumber('carpet area 14,905 sft')).toBe(14905);
    expect(toNumber('90 calendar days')).toBe(90);
  });

  it('refuses what it cannot count', () => {
    expect(toNumber('twelve weeks')).toBeNull();
    expect(toNumber('as per drawing')).toBeNull();
  });
});

describe('matchOption — a clause onto the option list', () => {
  const WORK = ['Day & night (fastest)', 'Day only (normal)', 'Night only / no noisy work in the day (slowest)'];
  const WEEK = ['None — 7-day week', 'Sundays off', 'Sundays and alternate Saturdays off'];

  it('maps working-hours clauses by meaning, not by spelling', () => {
    expect(matchOption('24x7 working permitted', WORK)).toBe(WORK[0]);
    expect(matchOption('Work is permitted round the clock', WORK)).toBe(WORK[0]);
    expect(matchOption('Working hours 9am to 6pm only', WORK)).toBe(WORK[1]);
    expect(matchOption('No noisy work during the day; fit-out at night only', WORK)).toBe(WORK[2]);
  });

  it('maps week-off clauses, including the alternate-Saturday case', () => {
    expect(matchOption('No work permitted on Sundays', WEEK)).toBe(WEEK[1]);
    expect(matchOption('Site closed on Sundays and 2nd and 4th Saturdays', WEEK)).toBe(WEEK[2]);
    expect(matchOption('Working all seven days is permitted', WEEK)).toBe(WEEK[0]);
  });

  it('returns nothing rather than rounding to a neighbour', () => {
    // These decide the programme's whole calendar; a near-miss is a wrong calendar.
    expect(matchOption('Refer building management for timings', WORK)).toBeNull();
    expect(matchOption('As per society rules', WEEK)).toBeNull();
  });
});

describe('applyPrefill', () => {
  it('fills the field, keeps the source, and does NOT mark it answered', () => {
    const qs = applyPrefill(questions(), [found('start', '4 Feb 2026', 'Agreement.docx — clause 4')]);
    const q = byId(qs, 'q_start');
    expect(q.answer).toBe('2026-02-04');
    expect(q.prefill?.sources).toEqual(['Agreement.docx — clause 4']);
    expect(q.confirmed).toBe(false);
  });

  it('keeps a blocking question blocking until a person confirms it', () => {
    const qs = applyPrefill(questions(), [found('start', '4 Feb 2026')]);
    expect(unansweredBlocking(qs).map((q) => q.id)).toContain('q_start');

    const confirmed = qs.map((q) => (q.id === 'q_start' ? { ...q, confirmed: true } : q));
    expect(unansweredBlocking(confirmed).map((q) => q.id)).not.toContain('q_start');
  });

  it('coerces each answer into what its own control accepts', () => {
    const qs = applyPrefill(questions(), [
      found('duration', '90 calendar days'),
      found('area', '14,905 sft'),
      found('weekoff', 'No work permitted on Sundays'),
    ]);
    expect(byId(qs, 'q_duration').answer).toBe('90');
    expect(byId(qs, 'q_area').answer).toBe('14905');
    expect(byId(qs, 'q_weekoff').answer).toBe('Sundays off');
  });

  it('leaves the field blank but shows what was read when it cannot be coerced', () => {
    const qs = applyPrefill(questions(), [found('duration', 'twelve weeks from possession', 'PO.pdf — p.2')]);
    const q = byId(qs, 'q_duration');
    expect(q.answer).toBe('');
    expect(q.prefill?.rawOnly).toContain('twelve weeks from possession');
    expect(q.prefill?.rawOnly).toContain('PO.pdf — p.2');
    // still blocking: an uncoerced quote is not a duration
    expect(unansweredBlocking(qs).map((x) => x.id)).toContain('q_duration');
  });

  it('takes the first proposal and reports the rest as a conflict rather than picking silently', () => {
    const qs = applyPrefill(questions(), [
      found('start', '2026-02-04', 'the ingested programme'),
      found('start', '11 Feb 2026', 'Annexure 2 — clause 3'),
    ]);
    const q = byId(qs, 'q_start');
    expect(q.answer).toBe('2026-02-04');
    expect(q.prefill?.conflicts).toEqual(['2026-02-11 — Annexure 2 — clause 3']);
  });

  it('collects both sources when two documents agree', () => {
    const qs = applyPrefill(questions(), [
      found('area', '14,905', 'BOQ.xlsx — row 3'),
      found('area', '14905 sft', 'Layout.pdf — titleblock'),
    ]);
    expect(byId(qs, 'q_area').prefill?.sources).toEqual(['BOQ.xlsx — row 3', 'Layout.pdf — titleblock']);
    expect(byId(qs, 'q_area').prefill?.conflicts).toBeUndefined();
  });

  it('never overwrites something a person already typed', () => {
    const typed = questions().map((q) => (q.id === 'q_area' ? { ...q, answer: '9000' } : q));
    const qs = applyPrefill(typed, [found('area', '14,905')]);
    expect(byId(qs, 'q_area').answer).toBe('9000');
    expect(byId(qs, 'q_area').prefill).toBeUndefined();
  });

  it('leaves questions the folder did not answer genuinely blank', () => {
    const qs = applyPrefill(questions(), [found('start', '4 Feb 2026')]);
    const phasing = byId(qs, 'q_phasing');
    expect(phasing.answer).toBe('');
    expect(phasing.prefill).toBeUndefined();
    expect(awaitingConfirmation(qs).map((q) => q.id)).toEqual(['q_start']);
  });

  it('ignores a key that is not one of the twelve questions', () => {
    const qs = applyPrefill(questions(), [found('favourite_colour', 'blue')]);
    expect(awaitingConfirmation(qs)).toHaveLength(0);
  });
});
