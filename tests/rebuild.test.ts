import { describe, expect, it } from 'vitest';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import { buildPlan, clientView } from '../src/engine/planner';
import { validatePlan, auditTrace } from '../src/engine/schema';
import { buildPertFromPlan } from '../src/engine/pert-build';
import { buildEmiratesPert } from '../src/data/emirates-pert';
import { flattenPert, descendantIds, PERT_CATEGORIES } from '../src/domain/pert';
import { buildInventory, buildQueries, unansweredBlocking, INPUT_SLOTS } from '../src/engine/intake';
import { folderIdFrom, ManifestDriveService } from '../src/services/drive';
import { delayDays } from '../src/domain/trackers';
import { skf } from '../src/data/skf';
import { emirates } from '../src/data/emirates';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar: cal,
  buffer: { internalBufferDays: norms.bufferPolicy.defaultInternalBufferDays, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};
const TODAY = '2025-11-15';

describe('Emirates — real project from its Drive folder', () => {
  it('the folder now yields a fully planned project, not pending_inputs', () => {
    const plan = buildPlan(emirates, cfg, TODAY);
    expect(plan.project.status).toBe('planned');
    expect(validatePlan(plan).errors).toEqual([]);
    expect(auditTrace(plan).ok).toBe(true);
    expect(emirates.areaSft!.value).toBe(33000);
    expect(emirates.contractValue!.value).toBe(239500000);
    expect(emirates.boqPackages.length).toBe(10);
  });

  it('the issued PERT parses into a hierarchy with all four categories', () => {
    const tree = buildEmiratesPert(TODAY);
    expect(tree.totalTasks).toBe(392);
    expect(tree.root!.name).toBe('Emirates Mumbai');
    for (const c of PERT_CATEGORIES) expect(tree.byCategory[c.key].length).toBeGreaterThan(0);
    expect(tree.source).toContain('Emirates PERT Schedule.pdf');
  });

  it('summary rows roll up children and report progress', () => {
    const tree = buildEmiratesPert(TODAY);
    const design = tree.byCategory.design[0];
    expect(design.isSummary).toBe(true);
    expect(design.children.length).toBeGreaterThan(2);
    // 3D views were actually finished in the source programme
    const all = flattenPert([tree.root!], new Set());
    const threeD = all.find((n) => n.name === 'Basic 3D Views')!;
    expect(threeD.actualFinish).toBe('2025-07-24');
    expect(threeD.percentComplete).toBe(100);
    expect(threeD.status).toBe('complete');
  });

  it('rows still open past their finish date are flagged delayed', () => {
    const tree = buildEmiratesPert(TODAY);
    const all = flattenPert([tree.root!], new Set());
    const late = all.filter((n) => !n.isSummary && n.finish && n.finish < TODAY && n.percentComplete < 100);
    expect(late.length).toBeGreaterThan(0);
    expect(late.every((n) => n.status === 'delayed')).toBe(true);
  });
});

describe('PERT view — collapse and expand', () => {
  const tree = buildEmiratesPert(TODAY);

  it('collapsing a node hides its whole subtree', () => {
    const roots = [tree.root!];
    const openAll = flattenPert(roots, new Set()).length;
    const design = tree.byCategory.design[0];
    const collapsed = flattenPert(roots, new Set([design.id])).length;
    expect(collapsed).toBeLessThan(openAll);
    const hiddenCount = flattenPert([design], new Set()).length - 1;
    expect(openAll - collapsed).toBe(hiddenCount);
  });

  it('collapse-all leaves only the top level, expand-all restores everything', () => {
    const roots = [tree.root!];
    const all = descendantIds(roots);
    expect(flattenPert(roots, new Set(all)).length).toBe(1);
    expect(flattenPert(roots, new Set()).length).toBe(392);
  });

  it('projects without an issued programme still get a four-category PERT', () => {
    const plan = buildPlan(skf, cfg, '2026-07-01');
    const tree2 = buildPertFromPlan(plan, '2026-07-01');
    expect(tree2.root).not.toBeNull();
    expect(tree2.byCategory.schedule.length).toBe(1);
    expect(tree2.byCategory.design.length).toBe(1);
    expect(tree2.byCategory.procurement.length).toBe(1);
    expect(tree2.byCategory.execution.length).toBe(1);
    expect(tree2.totalTasks).toBeGreaterThan(80);
  });
});

describe('Manpower levelling — the 30-electrician bug', () => {
  const plan = buildPlan(skf, cfg, '2026-07-01');
  const mp = plan.modules.manpower;

  it('no trade ever exceeds its realistic gang cap', () => {
    const caps = norms.crewCaps as unknown as Record<string, { min: number; max: number }>;
    for (const day of mp.days)
      for (const [trade, n] of Object.entries(day.byTrade)) {
        const cap = caps[trade] ?? caps.default;
        expect({ trade, n, max: cap.max, over: n > cap.max }).toEqual({ trade, n, max: cap.max, over: false });
      }
  });

  it('electricians specifically stay in a plausible band', () => {
    const counts = mp.days.map((d) => d.byTrade.electrical).filter((n): n is number => n != null);
    expect(Math.max(...counts)).toBeLessThanOrEqual(14);
    expect(Math.min(...counts)).toBeGreaterThan(0);
  });

  it('each trade holds a stable core gang rather than swinging day to day', () => {
    for (const t of mp.trades) {
      const daily = mp.days.map((d) => d.byTrade[t.trade]).filter((n): n is number => n != null);
      const min = Math.min(...daily);
      const max = Math.max(...daily);
      // surge is capped at +25% per extra concurrent activity, so the band stays tight
      expect({ trade: t.trade, ratio: max / min <= 2 }).toEqual({ trade: t.trade, ratio: true });
    }
  });

  it('the overall histogram is reasonably level, not spiky', () => {
    expect(mp.smoothness).toBeGreaterThan(0.5);
    expect(mp.peak).toBeGreaterThan(0);
    expect(mp.averageDaily).toBeGreaterThan(0);
  });

  it('core gang sizes are computed from work content and carry provenance', () => {
    for (const t of mp.trades) {
      expect(t.coreCrew.provenance).toBe('computed');
      expect(t.coreCrew.source).toContain('man-days');
      expect(t.coreCrew.source).toContain('crewCaps');
    }
  });
});

describe('Trackers in the Flipspaces formats', () => {
  const plan = buildPlan(skf, cfg, '2026-07-01');

  it('design tracker carries GFC, MEP and SAMPLING with dual internal/client approval', () => {
    const rows = plan.modules.design.rows;
    for (const cat of ['GFC', 'MEP', 'SAMPLING'] as const) expect(rows.some((r) => r.category === cat)).toBe(true);
    for (const r of rows) {
      expect(r).toHaveProperty('statusInt');
      expect(r).toHaveProperty('statusClient');
      expect(r).toHaveProperty('criticality');
      expect(r).toHaveProperty('revision');
      // internal issue must precede client approval
      if (r.endDateInt && r.endDateClient) expect(r.endDateInt < r.endDateClient).toBe(true);
    }
    expect(plan.modules.design.summary.drawings).toBe(rows.length);
  });

  it('design dates are back-scheduled ahead of the activity they release', () => {
    const rows = plan.modules.design.rows.filter((r) => r.releases.length);
    expect(rows.length).toBeGreaterThan(20);
    for (const r of rows) {
      expect(r.basis).toContain('back-scheduled');
      if (r.startDate && r.endDateInt) expect(r.startDate < r.endDateInt).toBe(true);
    }
  });

  it('procurement carries no commercial value at all', () => {
    const json = JSON.stringify(plan.modules.procurement);
    expect(json).not.toContain('clientAmount');
    expect(json).not.toContain('bcsAmount');
    expect(json).not.toContain(String(skf.contractValue!.value));
    for (const p of plan.modules.procurement) {
      expect(p).toHaveProperty('orderBy');
      expect(p).toHaveProperty('deliveryRequired');
      expect(p).toHaveProperty('orderStatus');
      expect(p).toHaveProperty('deliveryStatus');
    }
  });

  it('procurement is gated by a design approval where one applies', () => {
    expect(plan.modules.procurement.some((p) => p.gatedBy !== null)).toBe(true);
  });

  it('to-do rows are trackable with priority, status and revised date', () => {
    for (const t of plan.modules.todos) {
      expect(['HIGH', 'MEDIUM', 'LOW']).toContain(t.priority);
      expect(t).toHaveProperty('revisedDate');
      expect(t).toHaveProperty('responsibility');
    }
  });

  it('dependency rows follow the open-points format and compute delay', () => {
    const rows = plan.modules.dependencies;
    expect(rows.length).toBe(20);
    for (const r of rows) {
      expect(r.sr).toBeGreaterThan(0);
      expect(['Kick Off', 'Design', 'Commercial', 'Operation', 'Design/Operation']).toContain(r.area);
    }
    expect(delayDays('2026-01-01', '2026-01-11', TODAY)).toBe(10);
    expect(delayDays('2026-01-01', '2025-12-30', TODAY)).toBe(0);
    expect(delayDays(null, null, TODAY)).toBeNull();
  });
});

describe('Project intake', () => {
  const scan = {
    folderId: 'abc',
    folderName: 'Acme OS',
    scannedAt: '2026-07-28T00:00:00Z',
    files: [
      { id: '1', name: 'Acme BOQ_BCS R2.xlsx', mimeType: 'x', sizeBytes: 1000, modifiedTime: null, path: 'Acme OS/Acme BOQ_BCS R2.xlsx', webViewLink: null },
      { id: '2', name: 'Signed Agreement.pdf', mimeType: 'application/pdf', sizeBytes: 900, modifiedTime: null, path: 'Acme OS/Signed Agreement.pdf', webViewLink: null },
      { id: '3', name: 'GFC Furniture Layout.dwg', mimeType: 'x', sizeBytes: 800, modifiedTime: null, path: 'Acme OS/GFC Furniture Layout.dwg', webViewLink: null },
      { id: '4', name: 'random notes.txt', mimeType: 'text/plain', sizeBytes: 10, modifiedTime: null, path: 'Acme OS/random notes.txt', webViewLink: null },
    ],
    skipped: [],
  };

  it('classifies documents against the required-input checklist', () => {
    const inv = buildInventory(scan);
    expect(inv.slots.length).toBe(INPUT_SLOTS.length);
    expect(inv.slots.find((s) => s.slot.key === 'boq')!.present).toBe(true);
    expect(inv.slots.find((s) => s.slot.key === 'contract')!.present).toBe(true);
    expect(inv.slots.find((s) => s.slot.key === 'drawings')!.present).toBe(true);
    expect(inv.unmatched.map((f) => f.name)).toContain('random notes.txt');
    expect(inv.mandatoryMissing.length).toBeGreaterThan(0);
  });

  it('asks the project head before assuming anything, and blocks until answered', () => {
    const qs = buildQueries(buildInventory(scan));
    const ids = qs.map((q) => q.id);
    for (const must of ['q_start', 'q_duration', 'q_area', 'q_workmode', 'q_weekoff']) expect(ids).toContain(must);
    expect(unansweredBlocking(qs).length).toBeGreaterThan(4);
    const answered = qs.map((q) => ({ ...q, answer: q.blocking ? 'x' : '' }));
    expect(unansweredBlocking(answered)).toEqual([]);
  });

  it('raises a question for every missing mandatory input', () => {
    const inv = buildInventory(scan);
    const qs = buildQueries(inv);
    for (const missing of inv.mandatoryMissing) expect(qs.some((q) => q.question.includes(missing))).toBe(true);
  });

  it('extracts a folder id from any Drive URL form', () => {
    expect(folderIdFrom('https://drive.google.com/drive/folders/1POu_bRTsX2UlSicPOdBmof0JSygOlM-F?usp=drive_link')).toBe('1POu_bRTsX2UlSicPOdBmof0JSygOlM-F');
    expect(folderIdFrom('1POu_bRTsX2UlSicPOdBmof0JSygOlM-F')).toBe('1POu_bRTsX2UlSicPOdBmof0JSygOlM-F');
  });

  it('classifies the real KOHLER OS folder without false positives', () => {
    const kohlerScan = {
      folderId: '1NVFok5Gk4prjzu-yghgQLK88pHHiCJ3_',
      folderName: 'KOHLER OS',
      scannedAt: '2026-07-28T00:00:00Z',
      skipped: [],
      // real names AND real folder paths — the classifier reads both, because Flipspaces
      // filenames are not always self-describing (the Kohler BOQ has no "BOQ" in its name)
      files: ([
        ['KOHLER_PUNE_FS_26TH JUNE_V5.xlsx', '01 · Sales & Client/Contract & scope/BOQ & Project Plan'],
        ['Kohler_Pune_Project_Schedule_V2 (2).xlsx', '01 · Sales & Client/Contract & scope/BOQ & Project Plan'],
        ['Modification of 7th floor ITC 7A.pdf - signed.pdf', '01 · Sales & Client/Contract & scope/Contract'],
        ['KOH-R1-GFC-003-PARTITION LAYOUT.pdf', '02 · Design & Drawings/GFC drawings (by package)/PDF/Layouts'],
        ['KOHLER_OFFICE_GFC_R0.dxf', '02 · Design & Drawings/GFC drawings (by package)/CAD + DXF/Layouts'],
        ['[INT] FINAL_SAMPLING_LIST_KOHLER_PUNE.xlsx', '02 · Design & Drawings/Material & finish selections'],
        ['Kohler POs & Payment Tracker (1).xlsx', '01 · Sales & Client/Commercials — RA bills & invoices'],
        ['Fitout policy.doc', '03 · Operations & Site/Fitout Guidelines'],
        ['Kohler_KT_Internal.docx', '01 · Sales & Client/Contract & scope'],
        ['KOHLER_No04_Aspen_Deck.pptx (2).pdf', '02 · Design & Drawings/Design intent & renders'],
        ['Site Picture — WhatsApp Image 2026-07-03 at 4.01.12 PM.jpeg', '01 · Sales & Client/Client brief & contacts/Client Brief/Site Pictures'],
        ['Kohler_Contact Details.xlsx', '01 · Sales & Client/Client brief & contacts'],
      ] as [string, string][]).map(([name, folder], i) => ({
        id: `k${i}`, name, mimeType: 'x', sizeBytes: 1, modifiedTime: null,
        path: `KOHLER OS/${folder}/${name}`, webViewLink: null,
      })),
    };
    const inv = buildInventory(kohlerScan);
    // every mandatory input is present in this folder
    expect(inv.mandatoryMissing).toEqual([]);
    // the sampling list satisfies the make-list slot
    expect(inv.slots.find((s) => s.slot.key === 'makeList')!.matches.map((m) => m.name))
      .toContain('[INT] FINAL_SAMPLING_LIST_KOHLER_PUNE.xlsx');
    // a contacts sheet must NOT be mistaken for a drawing
    expect(inv.slots.find((s) => s.slot.key === 'drawings')!.matches.map((m) => m.name))
      .not.toContain('Kohler_Contact Details.xlsx');
  });

  it('the manifest fallback works without any Google credentials', async () => {
    const svc = new ManifestDriveService();
    expect(svc.isConfigured()).toBe(false);
    const loaded = svc.loadManifest(JSON.stringify(scan));
    expect(loaded.files.length).toBe(4);
    expect(svc.isConfigured()).toBe(true);
    await expect(svc.readFile(scan.files[0])).rejects.toThrow(/contents were not supplied/);
    svc.attach('1', new ArrayBuffer(8));
    expect((await svc.readFile(scan.files[0])).byteLength).toBe(8);
  });

  it('rejects a file that is not a manifest', () => {
    expect(() => new ManifestDriveService().loadManifest('{"nope":1}')).toThrow(/manifest/i);
  });
});

describe('Client view still redacts correctly after the rebuild', () => {
  it('manpower, resources and vendors are withheld', () => {
    const c = clientView(buildPlan(emirates, cfg, TODAY));
    expect(validatePlan(c).errors).toEqual([]);
    expect(c.modules.manpower.days).toEqual([]);
    expect(c.modules.manpower.trades).toEqual([]);
    expect(c.modules.resources).toEqual([]);
    expect(c.modules.procurement.every((p) => p.vendor === '' && p.remarks === '')).toBe(true);
  });
});
