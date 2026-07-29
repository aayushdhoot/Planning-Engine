// The coverage screen exists to answer "is the engine reading all my input data?".
// Its value is entirely in not overstating what was read, so that is what these tests pin.
import { describe, expect, it } from 'vitest';
import { buildCoverage, coverageRank, extractorFor, kindOf, slotFor, type DocStates } from '../src/engine/coverage';
import type { DriveFile, DriveScan } from '../src/services/drive';

const f = (name: string, path = `KOHLER OS/${name}`): DriveFile => ({
  id: name,
  name,
  mimeType: '',
  sizeBytes: 1024,
  modifiedTime: null,
  path,
  webViewLink: null,
});

const scan = (files: DriveFile[]): DriveScan => ({
  folderId: 'x',
  folderName: 'KOHLER OS',
  scannedAt: '2026-07-29T10:00:00.000Z',
  files,
  skipped: [],
});

describe('extractorFor', () => {
  it('recognises the two things the engine can structurally read', () => {
    expect(extractorFor(f('priced BOQ_BCS.csv'))).toBe('boq');
    expect(extractorFor(f('Kohler_Pune_Project_Schedule_V2.xlsx'))).toBe('schedule');
  });

  it("identifies KOHLER's real BOQ, whose filename never says BOQ", () => {
    // only the parent folder identifies it — filename-only matching hid the most important
    // document in the project behind a "no extractor" badge
    const real = f('KOHLER_PUNE_FS_26TH JUNE_V5.xlsx', 'KOHLER OS/01 · Sales & Client/Contract & scope/BOQ & Project Plan/KOHLER_PUNE_FS_26TH JUNE_V5.xlsx');
    expect(extractorFor(real)).toBe('boq');
    expect(slotFor(real)?.key).toBe('boq');
  });

  it('still reads a programme sitting inside a BOQ folder as a programme', () => {
    const sched = f('Kohler_Pune_Project_Schedule_V2 (2).xlsx', 'KOHLER OS/Contract & scope/BOQ & Project Plan/Kohler_Pune_Project_Schedule_V2 (2).xlsx');
    expect(extractorFor(sched)).toBe('schedule');
  });

  it('claims nothing for formats with no extractor', () => {
    for (const n of ['Signed agreement.pdf', 'GFC layout.dwg', 'render.png', 'chat.zip', 'Kohler_KT_Internal.docx'])
      expect(`${n}:${extractorFor(f(n))}`).toBe(`${n}:null`);
  });

  it('does not guess at a spreadsheet whose purpose is not in its name', () => {
    expect(extractorFor(f('Kohler_Contact Details.xlsx'))).toBeNull();
  });

  it('classifies file kinds so the UI can explain itself', () => {
    expect(kindOf(f('a.xlsx'))).toBe('spreadsheet');
    expect(kindOf(f('a.pdf'))).toBe('document');
    expect(kindOf(f('a.dwg'))).toBe('drawing');
    expect(kindOf(f('a.jpeg'))).toBe('image');
    expect(kindOf(f('a.zip'))).toBe('archive');
    expect(kindOf(f('a.vcf'))).toBe('other');
  });
});

describe('buildCoverage', () => {
  const files = [
    f('priced BOQ_BCS.xlsx'),
    f('Kohler_Pune_Project_Schedule_V2.xlsx'),
    f('Modification of 7th floor ITC 7A.pdf - signed.pdf'),
    f('KOHLER_OFFICE_GFC_R0.dxf'),
    f('Site Pictures/WhatsApp Image.jpeg', 'KOHLER OS/Client Brief/Site Pictures/WhatsApp Image.jpeg'),
    f('random-notes.vcf'),
  ];

  it('counts an unread but readable document as the actionable gap', () => {
    const cov = buildCoverage(scan(files));
    expect(cov.documents).toBe(6);
    expect(cov.extracted).toBe(0);
    expect(cov.extractableNotRead).toBe(2); // BOQ + programme
  });

  it('never reports a PDF as read just because its bytes were opened', () => {
    const states: DocStates = { 'Modification of 7th floor ITC 7A.pdf - signed.pdf': { state: 'logged', detail: 'Opened (1 KB).' } };
    const cov = buildCoverage(scan(files), states);
    expect(cov.extracted).toBe(0);
    expect(cov.loggedOnly).toBe(1);
    // the contract slot has a document but nothing usable came out of it
    expect(cov.evidenceOnlyMandatory).toContain('Project Contract / PO');
  });

  it('counts a parsed spreadsheet as genuinely read', () => {
    const states: DocStates = { 'priced BOQ_BCS.xlsx': { state: 'extracted', detail: '19 packages' } };
    const cov = buildCoverage(scan(files), states);
    expect(cov.extracted).toBe(1);
    expect(cov.extractableNotRead).toBe(1);
    expect(cov.evidenceOnlyMandatory).not.toContain('Project BOQ (priced)');
  });

  it('takes a dropped document out of the live counts', () => {
    const states: DocStates = { 'Kohler_Pune_Project_Schedule_V2.xlsx': { state: 'dropped' } };
    const cov = buildCoverage(scan(files), states);
    expect(cov.dropped).toBe(1);
    expect(cov.extractableNotRead).toBe(1); // only the BOQ remains
  });

  it('reports a required input as uncovered once its only document is dropped', () => {
    // dropping is a decision, not a way to make a gap disappear — the drawing was the only
    // thing satisfying "Drawings", so that input is now genuinely uncovered
    const before = buildCoverage(scan(files));
    expect(before.missingMandatory).not.toContain('Drawings');
    const after = buildCoverage(scan(files), { 'KOHLER_OFFICE_GFC_R0.dxf': { state: 'dropped' } });
    expect(after.missingMandatory).toContain('Drawings');
  });

  it('names mandatory inputs that are absent from the folder entirely', () => {
    const cov = buildCoverage(scan([f('priced BOQ_BCS.xlsx')]));
    expect(cov.missingMandatory).toContain('Drawings');
    expect(cov.missingMandatory).not.toContain('Project BOQ (priced)');
  });

  it('maps documents to the required input they satisfy', () => {
    expect(slotFor(f('priced BOQ_BCS.xlsx'))?.key).toBe('boq');
    expect(slotFor(f('KOHLER_OFFICE_GFC_R0.dxf'))?.key).toBe('drawings');
    expect(slotFor(f('random-notes.vcf'))).toBeNull();
  });

  it('trusts the filename over the folder, so a programme is not labelled the BOQ', () => {
    // both files live in "BOQ & Project Plan"; only one of them is the BOQ
    const dir = 'KOHLER OS/01 · Sales & Client/Contract & scope/BOQ & Project Plan';
    expect(slotFor(f('Kohler_Pune_Project_Schedule_V2.xlsx', `${dir}/Kohler_Pune_Project_Schedule_V2.xlsx`))?.key).toBe('schedule');
    expect(slotFor(f('KOHLER_PUNE_FS_26TH JUNE_V5.xlsx', `${dir}/KOHLER_PUNE_FS_26TH JUNE_V5.xlsx`))?.key).toBe('boq');
  });
});

describe('coverageRank', () => {
  it('floats readable-but-unread to the top and sinks dropped to the bottom', () => {
    const rows = buildCoverage(
      scan([f('a.pdf'), f('BOQ.xlsx'), f('notes.vcf'), f('Schedule.xlsx')]),
      { 'Schedule.xlsx': { state: 'dropped' } },
    ).rows;
    const order = [...rows].sort((x, y) => coverageRank(x) - coverageRank(y)).map((r) => r.file.name);
    expect(order[0]).toBe('BOQ.xlsx');
    expect(order.at(-1)).toBe('Schedule.xlsx');
  });
});
