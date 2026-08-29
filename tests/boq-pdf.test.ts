// A priced BOQ that only exists as a PDF.
//
// Two BOQ documents in the Keppel (Pune) folder came back "NOT READ — Failed to fetch", and
// the fix has two halves: the bytes have to arrive (tests/drive-download.test.ts), and once
// they do the document has to become priced packages rather than evidence. This pins the
// second half — above all that a PDF BOQ and an Excel BOQ go through the SAME parser, because
// two parsers that disagree about what a package is would be worse than one that reads nothing.
import { describe, expect, it } from 'vitest';
import { extractorFor } from '../src/engine/coverage';
import { normalizeRows, stitchPages, type BoqPageRows } from '../src/services/extraction/boq-vision';
import { BoqIngestionService } from '../src/services/ingestion';
import type { DriveFile } from '../src/services/drive';

const f = (name: string, path = `Keppel (Pune)/${name}`): DriveFile => ({
  id: name, name, mimeType: '', sizeBytes: null, modifiedTime: null, path, webViewLink: null,
});

describe('extractorFor — a BOQ issued as a PDF', () => {
  it('routes a priced BOQ PDF to the BOQ reader, not the generic photograph path', () => {
    expect(extractorFor(f('Final BOQ - 30 Dec 2025_8.75Cr - Makelist.pdf', 'Keppel (Pune)/Makelist/Final BOQ - 30 Dec 2025_8.75Cr - Makelist.pdf'))).toBe('boq-pdf');
    expect(extractorFor(f('FS_Submission_R4_BCS.pdf'))).toBe('boq-pdf');
  });

  it('recognises a BOQ by its folder when the filename does not say so', () => {
    expect(extractorFor(f('KOHLER_PUNE_FS_26TH JUNE_V5.pdf', 'KOHLER OS/BOQ & Project Plan/KOHLER_PUNE_FS_26TH JUNE_V5.pdf'))).toBe('boq-pdf');
  });

  it('leaves every other PDF on the generic vision path', () => {
    expect(extractorFor(f('TenStep_Pune_Final_Design Deck (1).pdf', 'Keppel (Pune)/Design Deck/TenStep_Pune_Final_Design Deck (1).pdf'))).toBe('pdf');
    expect(extractorFor(f('HSE Policy.pdf'))).toBe('pdf');
  });

  it('still calls a programme a programme, even filed in a BOQ folder', () => {
    expect(extractorFor(f('Issued Programme R2.pdf', 'Keppel (Pune)/BOQ/Issued Programme R2.pdf'))).toBe('pdf');
  });

  it('does not disturb the spreadsheet routing it sits beside', () => {
    expect(extractorFor(f('priced BOQ_BCS.csv'))).toBe('boq');
    expect(extractorFor(f('Final BOQ - 30 Dec 2025_8.75Cr', 'Keppel (Pune)/BOQ/Final BOQ - 30 Dec 2025_8.75Cr'))).toBe('boq');
  });
});

describe('normalizeRows — whatever shape the model answers in', () => {
  it('takes the plain {rows} shape', () => {
    expect(normalizeRows({ rows: [['A', 'CIVIL', '1,00,000']], notes: ['header repeated'] })).toEqual({
      rows: [['A', 'CIVIL', '1,00,000']],
      notes: ['header repeated'],
    });
  });

  it('accepts the wrapper keys the model drifts to, and a bare array', () => {
    expect(normalizeRows({ table: [['A', 'x']] }).rows).toEqual([['A', 'x']]);
    expect(normalizeRows({ data: [['B', 'y']] }).rows).toEqual([['B', 'y']]);
    expect(normalizeRows([['C', 'z']]).rows).toEqual([['C', 'z']]);
  });

  it('flattens a row returned as an object keyed by column name', () => {
    expect(normalizeRows({ rows: [{ code: 'A1', description: 'Blockwork', amount: '4,50,000' }] }).rows).toEqual([
      ['A1', 'Blockwork', '4,50,000'],
    ]);
  });

  it('keeps blank cells as blanks rather than dropping the column', () => {
    expect(normalizeRows({ rows: [['A1', '', null, '4,50,000']] }).rows).toEqual([['A1', '', '', '4,50,000']]);
  });

  it('returns nothing rather than throwing on a shape it cannot read', () => {
    expect(normalizeRows({ answer: 'no table here' })).toEqual({ rows: [], notes: [] });
    expect(normalizeRows(null)).toEqual({ rows: [], notes: [] });
  });
});

describe('stitchPages — page boundaries are reported, not erased', () => {
  const page = (pageLabel: string, rows: string[][]): BoqPageRows => ({ pageLabel, rows, notes: [] });

  it('says which row each page starts at, so a traced package can be checked against the PDF', () => {
    const { rows, pageStarts } = stitchPages([
      page('page 1 of 3', [['A', 'CIVIL', '1'], ['A1', 'Blockwork', '1']]),
      page('page 2 of 3', [['B', 'MEP', '2']]),
    ]);
    expect(rows).toHaveLength(3);
    expect(pageStarts).toEqual([
      { pageLabel: 'page 1 of 3', row: 1 },
      { pageLabel: 'page 2 of 3', row: 3 },
    ]);
  });

  it('skips a page that held no table without shifting the rows that follow it', () => {
    const { rows, pageStarts } = stitchPages([
      page('page 1 of 2', []),
      page('page 2 of 2', [['A', 'CIVIL', '1']]),
    ]);
    expect(rows).toEqual([['A', 'CIVIL', '1']]);
    expect(pageStarts).toEqual([{ pageLabel: 'page 2 of 2', row: 1 }]);
  });
});

describe('parseBoq reads transcribed rows exactly as it reads a workbook', () => {
  const rows: string[][] = [
    ['PROJECT AREA', '12,500', 'sft'],
    ['CODE', 'DESCRIPTION', 'QTY', 'UNIT', 'AMOUNT', 'BCS'],
    ['A1', 'Civil & Blockwork', '1,200', 'sft', '45,00,000', '31,00,000'],
    ['B1', 'Electrical works', '', '', '62,00,000', '44,00,000'],
    ['C1', 'HVAC', '', '', '38,00,000', '27,00,000'],
    ['', 'GRAND TOTAL', '', '', '1,45,00,000', '1,02,00,000'],
  ];

  it('produces the same packages, traces and warnings the spreadsheet path would', () => {
    const parsed = new BoqIngestionService().parseBoq({ name: 'Final BOQ.pdf (transcribed from PDF)', data: rows });
    expect(parsed.packages.map((p) => p.code)).toEqual(['A1', 'B1', 'C1']);
    expect(parsed.packages[0].clientAmount.value).toBe(4500000);
    expect(parsed.packages[0].bcsAmount?.value).toBe(3100000);
    expect(parsed.packages[0].clientAmount.provenance).toBe('input');
    expect(parsed.packages[0].clientAmount.source).toContain('transcribed from PDF');
    expect(parsed.areaSft?.value).toBe(12500);
    expect(parsed.contractValue?.value).toBe(14500000);
  });

  it('reads the physical quantity when the transcription kept the QTY/UNIT columns', () => {
    const parsed = new BoqIngestionService().parseBoq({ name: 'Final BOQ.pdf', data: rows });
    expect(parsed.packages[0].quantity?.value).toBe(1200);
    expect(parsed.packages[0].unit).toBe('sft');
  });

  it('reports no packages rather than inventing them when the pages held no table', () => {
    const parsed = new BoqIngestionService().parseBoq({ name: 'Cover.pdf', data: [['Terms and conditions'], ['']] });
    expect(parsed.packages).toHaveLength(0);
  });
});
