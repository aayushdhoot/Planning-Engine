// The coverage screen exists to answer "is the engine reading all my input data?".
// Its value is entirely in not overstating what was read, so that is what these tests pin.
import { describe, expect, it } from 'vitest';
import { buildCoverage, coverageRank, extractorFor, folderOf, groupCoverage, kindOf, noExtractorReason, slotFor, startsCollapsed, type DocStates } from '../src/engine/coverage';
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

const withMime = (file: DriveFile, mimeType: string): DriveFile => ({ ...file, mimeType });

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

  it('reads a native Google Sheet named like a BOQ, even with no mimeType (public-link scan)', () => {
    const nativeBoq = f('Priced BOQ', 'KOHLER OS/BOQ & Project Plan/Priced BOQ');
    expect(extractorFor(nativeBoq)).toBe('boq');
  });

  it('reads a native Google Sheet via its real mimeType (OAuth-authenticated scan)', () => {
    const nativeBoq = withMime(f('Priced BOQ', 'KOHLER OS/BOQ & Project Plan/Priced BOQ'), 'application/vnd.google-apps.spreadsheet');
    expect(extractorFor(nativeBoq)).toBe('boq');
  });

  it('does not guess spreadsheet for a no-extension file that is not named like a BOQ or schedule', () => {
    const notes = f('Random Notes', 'KOHLER OS/Random Notes');
    expect(kindOf(notes)).toBe('other');
    expect(extractorFor(notes)).toBeNull();
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
    for (const n of ['GFC layout.dwg', 'chat.zip', 'Kohler_KT_Internal.docx'])
      expect(`${n}:${extractorFor(f(n))}`).toBe(`${n}:null`);
  });

  it('reads a PDF by rendering its pages, rather than holding it as evidence', () => {
    // the brand guideline and the drawing set arrive as PDFs on most projects; "no extractor"
    // meant the engine never looked at either of them
    expect(extractorFor(f('22_08_29_Ascendion_brand.pdf'))).toBe('pdf');
    expect(extractorFor(f('ASCENDION VADODARA_8TH+9TH+10TH FLOOR V15.pdf'))).toBe('pdf');
  });

  it('reads still images through the vision adapter', () => {
    expect(extractorFor(f('render.png'))).toBe('vision');
    expect(extractorFor(f('WhatsApp Image 2026-07-30 at 10.55.20 PM.jpeg'))).toBe('vision');
  });

  it('survives a DriveFile-shaped object with no mimeType at all', () => {
    // a hand-supplied upload standing in for a Drive document is built from a filename alone;
    // dereferencing mimeType here surfaced as "Cannot read properties of undefined
    // (reading 'startsWith')" on the row of a perfectly readable PDF
    const nameOnly = { name: 'Drawings V15.pdf' } as DriveFile;
    expect(kindOf(nameOnly)).toBe('document');
    expect(extractorFor(nameOnly)).toBe('pdf');
    expect(() => noExtractorReason({ name: 'notes.vcf' } as DriveFile)).not.toThrow();
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
    expect(cov.extractableNotRead).toBe(4); // BOQ + programme + the PDF + the site photo
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
    expect(cov.extractableNotRead).toBe(3); // programme + PDF + site photo remain (BOQ now extracted)
    expect(cov.evidenceOnlyMandatory).not.toContain('Project BOQ (priced)');
  });

  it('takes a dropped document out of the live counts', () => {
    const states: DocStates = { 'Kohler_Pune_Project_Schedule_V2.xlsx': { state: 'dropped' } };
    const cov = buildCoverage(scan(files), states);
    expect(cov.dropped).toBe(1);
    expect(cov.extractableNotRead).toBe(3); // BOQ + PDF + site photo remain (schedule was dropped)
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

  it('names absent optional inputs too, so nothing is silently unaccounted for', () => {
    // a brand guideline or a fit-out manual is missing from most folders and must never hold a
    // plan up — but "not asked for" and "not there" are different answers, and the screen owes
    // the user the second one
    const cov = buildCoverage(scan([f('priced BOQ_BCS.xlsx')]));
    expect(cov.missingOptional).toContain('Brand guideline');
    expect(cov.missingOptional).toContain('Fitout guideline');
    expect(cov.missingMandatory).not.toContain('Brand guideline');
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
    // both the BOQ and the PDF are readable-but-unread, so both outrank the file nothing can
    // be done with; the dropped one sinks regardless
    expect(order.slice(0, 2).sort()).toEqual(['BOQ.xlsx', 'a.pdf']);
    expect(order.at(-1)).toBe('Schedule.xlsx');
  });
});

describe('grouping — a folder of ninety photographs is one decision, not ninety', () => {
  const photos = Array.from({ length: 40 }, (_, i) =>
    f(`IMG_22${String(i).padStart(2, '0')}.HEIC`, `SKF, Pune OS/Day -0 Site Pictures Videos/IMG_22${String(i).padStart(2, '0')}.HEIC`),
  );
  const rows = buildCoverage(
    scan([
      ...photos,
      f('priced BOQ_BCS.xlsx', 'SKF, Pune OS/Contract & scope/priced BOQ_BCS.xlsx'),
      f('Schedule.xlsx', 'SKF, Pune OS/Contract & scope/Schedule.xlsx'),
      f('Signed agreement.pdf', 'SKF, Pune OS/Contract & scope/Signed agreement.pdf'),
    ]),
  ).rows;

  it('collapses 43 files into a handful of groups', () => {
    const bySlot = groupCoverage(rows, 'slot');
    expect(bySlot.length).toBeLessThan(6);
    expect(bySlot.reduce((n, g) => n + g.rows.length, 0)).toBe(43);
  });

  it('puts groups holding readable documents first', () => {
    const g = groupCoverage(rows, 'slot');
    expect(g[0].readable).toBeGreaterThan(0);
    // the 40 photographs are the biggest group but carry nothing parseable, so they sink
    expect(g[0].rows.length).toBeLessThan(40);
  });

  it('groups by folder as well, keeping the path as the hint', () => {
    const byFolder = groupCoverage(rows, 'folder');
    const contract = byFolder.find((g) => g.label === 'Contract & scope')!;
    expect(contract.rows).toHaveLength(3);
    expect(contract.hint).toBe('SKF, Pune OS/Contract & scope');
    expect(byFolder.find((g) => g.label === 'Day -0 Site Pictures Videos')!.rows).toHaveLength(40);
  });

  it('starts a big evidence group collapsed and a data-carrying one open', () => {
    const byFolder = groupCoverage(rows, 'folder');
    expect(startsCollapsed(byFolder.find((g) => g.label === 'Day -0 Site Pictures Videos')!)).toBe(true);
    expect(startsCollapsed(byFolder.find((g) => g.label === 'Contract & scope')!)).toBe(false);
  });

  it('counts each state so the header can summarise without expanding', () => {
    const withStates = buildCoverage(
      scan([...photos, f('priced BOQ_BCS.xlsx', 'SKF, Pune OS/Contract & scope/priced BOQ_BCS.xlsx')]),
      { 'priced BOQ_BCS.xlsx': { state: 'extracted', detail: '18 packages' } },
    ).rows;
    const g = groupCoverage(withStates, 'folder').find((x) => x.label === 'Contract & scope')!;
    expect(g).toMatchObject({ extracted: 1, pending: 0, readable: 0 });
  });

  it('folderOf strips the filename', () => {
    expect(folderOf('a/b/c.xlsx')).toBe('a/b');
    expect(folderOf('loose.xlsx')).toBe('loose.xlsx');
  });
});
