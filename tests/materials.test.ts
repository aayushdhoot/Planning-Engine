// The site material register is the tracker the site engineer works from, so what it covers,
// how it dates itself and — above all — how it links back to procurement are pinned here.
import { describe, expect, it } from 'vitest';
import { buildPlan, clientView } from '../src/engine/planner';
import { validatePlan } from '../src/engine/schema';
import { buildCockpit } from '../src/engine/cockpit';
import { renderReport } from '../src/reports/render';
import { skf } from '../src/data/skf';
import { kohler } from '../src/data/kohler';
import { pendingKohler } from '../src/data/others';
import { emirates } from '../src/data/emirates';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar: cal,
  buffer: { internalBufferDays: 7, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};
const TODAY = '2026-06-01';
const plan = buildPlan(skf, cfg, TODAY);
const materials = plan.modules.materials.rows;
const acts = plan.modules.timeline.activities;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);

describe('the register covers the material that actually turns up at site', () => {
  it('carries the things a fit-out is built from, not one line per cost head', () => {
    for (const expected of [/gypsum board/i, /^ply /i, /wires & cables/i, /ducting/i, /workstations/i, /chairs/i, /carpet tiles/i, /light fittings/i, /sprinkler pipes/i, /cat6/i]) {
      const hit = materials.find((m) => expected.test(m.item));
      expect(`${expected}:${hit ? 'found' : 'missing'}`).toBe(`${expected}:found`);
    }
    // several materials per package is the whole point — one row per package is the procurement tab
    expect(materials.length).toBeGreaterThan(plan.modules.procurement.length * 3);
  });

  it('only raises material for cost heads the project actually carries', () => {
    const codes = new Set(skf.boqPackages.map((p) => p.code));
    for (const m of materials) expect(`${m.item}:${m.packageCode === '' || codes.has(m.packageCode)}`).toBe(`${m.item}:true`);
  });

  it('scales down with the project rather than listing a fixed catalogue', () => {
    const k = buildPlan(kohler, cfg, '2026-07-29').modules.materials.rows;
    const kCodes = new Set(kohler.boqPackages.map((p) => p.code));
    for (const m of k) expect(m.packageCode === '' || kCodes.has(m.packageCode)).toBe(true);
  });

  it('follows the project\'s own BOQ coding rather than one fixed scheme', () => {
    // SKF codes HVAC "HVAC" and networking "PN"; KOHLER calls them D1 and E1; Emirates runs A–J.
    // Keying the catalogue on codes alone silently dropped the ducts, pipes and cabling from
    // every project that did not use the scheme the norms were written against.
    for (const [project, today, head] of [
      [kohler, '2026-07-29', 'HVAC'],
      [emirates, '2026-06-01', 'HVAC'],
    ] as const) {
      const rows = buildPlan(project, cfg, today).modules.materials.rows;
      for (const item of [/GI sheet for ducting/, /CAT6/, /Sprinkler pipes/, /FRLS copper/]) {
        const hit = rows.find((m) => item.test(m.item));
        expect(`${project.id} ${item}:${hit ? 'found' : 'missing'}`).toBe(`${project.id} ${item}:found`);
        expect(hit!.requiredOnSite).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      }
      // and it is linked to that project's own cost head, by whatever code it uses
      const duct = rows.find((m) => /GI sheet for ducting/.test(m.item))!;
      expect(duct.category).toContain(head);
      expect(duct.procurementId).not.toBeNull();
    }
  });

  it('leaves a head unlinked rather than guessing it onto the nearest package', () => {
    // The Emirates BOQ has no separate glass or flooring head — those sit inside "Civil &
    // Interior". The material still has to land on site, so the row is raised with its dates,
    // but nothing claims to know which PO buys it.
    const rows = buildPlan(emirates, cfg, '2026-06-01').modules.materials.rows;
    const glass = rows.find((m) => /Partition glass/.test(m.item))!;
    expect(glass.packageCode).toBe('');
    expect(glass.procurementId).toBeNull();
    expect(glass.requiredOnSite).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(emirates.boqPackages.some((p) => /glass/i.test(p.name))).toBe(false);
  });

  it('generates nothing for a project with no programme', () => {
    const none = buildPlan(pendingKohler, cfg, TODAY);
    expect(none.modules.materials.rows).toEqual([]);
    expect(none.modules.materials.summary.items).toBe(0);
  });
});

describe('every material says how it gets to site (#link)', () => {
  it('links what we buy ourselves to the procurement row that raises the PO', () => {
    const procById = new Map(plan.modules.procurement.map((p) => [p.id, p]));
    const ours = materials.filter((m) => m.supply === 'procured');
    expect(ours.length).toBeGreaterThan(0);
    for (const m of ours) {
      const proc = procById.get(m.procurementId!);
      expect(`${m.item}:${proc ? proc.packageCode : 'unlinked'}`).toBe(`${m.item}:${m.packageCode}`);
      // and it reads as the same cost head on both tabs, so the two tables agree
      expect(m.category).toBe(proc!.category);
    }
  });

  it('leaves vendor- and client-supplied material off our procurement, to be chased on their PO', () => {
    for (const m of materials.filter((x) => x.supply !== 'procured')) {
      expect(`${m.item}:${m.procurementId}`).toBe(`${m.item}:null`);
      expect(m.responsibility).toBe(m.supply === 'client' ? 'Client' : 'Site / contractor');
    }
  });

  it('raises the client free issue that is not in the BOQ at all', () => {
    const free = materials.filter((m) => m.supply === 'client');
    expect(free.length).toBeGreaterThan(0);
    for (const m of free) {
      expect(m.packageCode).toBe('');
      expect(m.category).toBe('Client free issue');
      // it still has to land on a date, or it is not being tracked
      expect(m.requiredOnSite).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(free.some((m) => /IT hardware/i.test(m.item))).toBe(true);
  });

  it('never invents a vendor, a PO or a quantity — those are entered', () => {
    for (const m of materials) {
      expect(m.vendor).toBe('');
      expect(m.poNumber).toBe('');
      expect(m.orderedQty).toBeNull();
      expect(m.deliveredQty).toBeNull();
      expect(m.actualDelivery).toBeNull();
      expect(m.status).toBe('Not Ordered');
    }
  });
});

describe('dates are back-scheduled from the activity that consumes the material', () => {
  it('puts every material on site before the activity that uses it starts', () => {
    for (const m of materials) {
      if (!m.consumedBy || !m.requiredOnSite) continue;
      const start = m.consumedBy.slice(-11, -1);
      expect(`${m.item}:${m.requiredOnSite < start}`).toBe(`${m.item}:true`);
      expect(`${m.item}:${days(m.requiredOnSite, start)}`).toBe(`${m.item}:2`);
    }
  });

  it('orders it exactly its own lead time earlier', () => {
    for (const m of materials) {
      if (!m.orderBy || !m.requiredOnSite) continue;
      expect(`${m.item}:${days(m.orderBy, m.requiredOnSite)}`).toBe(`${m.item}:${m.leadDays}`);
    }
  });

  it('takes the lead time from the norms material list where that list carries the item', () => {
    const gypsum = materials.find((m) => /gypsum board/i.test(m.item))!;
    const norm = norms.materialLeadTimesDays.find((x) => x.item === 'Gypsum board')!;
    expect(gypsum.leadDays).toBe(norm.days);
    expect(gypsum.make).toBe(norm.make);
    expect(gypsum.basis).toContain(norm.source);
  });

  it('dates a material against its own package rather than any activity of the trade', () => {
    const glass = materials.find((m) => /partition glass/i.test(m.item))!;
    const glassActs = acts.filter((a) => a.packageCode === 'A3');
    expect(glassActs.length).toBeGreaterThan(0);
    expect(glass.consumedBy).toContain(glassActs.sort((a, b) => (a.startDate < b.startDate ? -1 : 1))[0].name);
  });

  it('states its basis rather than presenting a bare date', () => {
    for (const m of materials) expect(m.basis.length).toBeGreaterThan(20);
  });
});

describe('the register flags what cannot work, and only that', () => {
  it('flags long-lead material whose order-by falls before the project starts', () => {
    const flagged = materials.filter((m) => m.issues.length);
    expect(flagged.length).toBeGreaterThan(0);
    for (const m of flagged) expect(m.orderBy! < plan.internal!.start || m.consumedBy === null).toBe(true);
    // and reports it once at plan level rather than thirty times
    const note = plan.assumptions.filter((a) => a.area === 'materials');
    expect(note).toHaveLength(1);
    expect(note[0].internalOnly).toBe(true);
  });

  it('does not badge every row for ordering ahead of a design approval', () => {
    // that is true of most rows on a compressed fit-out; it belongs in the remark, not a flag
    expect(materials.filter((m) => m.issues.length).length).toBeLessThan(materials.length / 2);
    const gated = materials.filter((m) => /after the order-by date/.test(m.remarks));
    expect(gated.length).toBeGreaterThan(0);
    for (const m of gated) expect(m.issues.some((i) => /approv/i.test(i))).toBe(false);
  });

  it('counts short-on-site from the required date, never from the date arriving', () => {
    // nothing is delivered on a fresh plan, so as "today" moves past the required dates the
    // count rises — but it is never inferred that a passed date means the material landed
    const fresh = buildPlan(skf, cfg, '2026-06-01').modules.materials.summary;
    const later = buildPlan(skf, cfg, '2026-08-01').modules.materials.summary;
    expect(fresh.delivered).toBe(0);
    expect(later.delivered).toBe(0);
    expect(later.shortOnSite).toBeGreaterThan(fresh.shortOnSite);
  });
});

describe('the material register reaches the cockpit and the client view', () => {
  it('raises a cockpit exception when material should already be on site', () => {
    const c = buildCockpit(buildPlan(skf, cfg, '2026-08-01'), '2026-08-01');
    expect(c.kpis.some((k) => k.key === 'materials')).toBe(true);
    expect(c.exceptions.some((e) => e.area === 'materials' && /should already be on site/.test(e.title))).toBe(true);
  });

  it('gives the client their own free issue and nothing else', () => {
    const client = clientView(plan, TODAY);
    expect(client.modules.materials.rows.length).toBe(materials.filter((m) => m.supply === 'client').length);
    expect(client.modules.materials.rows.every((m) => m.supply === 'client')).toBe(true);
    for (const m of client.modules.materials.rows) {
      expect(m.vendor).toBe('');
      expect(m.poNumber).toBe('');
      expect(m.remarks).toBe('');
      expect(m.storage).toBe('');
    }
    expect(validatePlan(client).errors).toEqual([]);
  });

  it('reaches both reports, at each audience\'s depth', () => {
    const internalHtml = renderReport(plan, 'internal');
    const clientHtml = renderReport(clientView(plan, TODAY), 'client');
    expect(internalHtml).toContain('Material Registry — delivery register');
    expect(internalHtml).toContain('Gypsum board 12.5mm');
    // the client document names only what they owe us, never our own register
    expect(clientHtml).toContain('Material supplied by you (free issue)');
    expect(clientHtml).not.toContain('Gypsum board');
    expect(clientHtml).toContain('IT hardware');
  });

  it('schema rejects a client plan that leaks the internal register', () => {
    const leaky = structuredClone(clientView(plan, TODAY));
    leaky.modules.materials.rows.push(structuredClone(materials.find((m) => m.supply === 'procured')!));
    expect(validatePlan(leaky).ok).toBe(false);
    const leaky2 = structuredClone(clientView(plan, TODAY));
    leaky2.modules.materials.rows[0].poNumber = 'PO/2026/0042';
    expect(validatePlan(leaky2).ok).toBe(false);
  });
});
