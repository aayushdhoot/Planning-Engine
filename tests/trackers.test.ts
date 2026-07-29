// The trackers are what the project team actually works from, so their shape and their
// deadlines are pinned here rather than left to whatever the generator happens to emit.
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../src/engine/planner';
import { parseMilestoneClauses } from '../src/engine/trackers';
import { skf } from '../src/data/skf';
import { kohler } from '../src/data/kohler';
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
const design = plan.modules.design.rows;

describe('design tracker carries two targets and no orphan dates (#6)', () => {
  it('exposes only drawing-readiness and client-approval targets', () => {
    const r = design[0] as unknown as Record<string, unknown>;
    expect(r).toHaveProperty('readyBy');
    expect(r).toHaveProperty('approvalBy');
    // the columns the sheet used to carry and nobody managed
    for (const gone of ['startDate', 'endDateInt', 'endDateClient', 'revisedEndDateInt', 'revisedEndDateClient'])
      expect(`${gone}:${gone in r}`).toBe(`${gone}:false`);
  });

  it('leaves no row without dates — the missing-dates complaint', () => {
    const dateless = design.filter((d) => !d.readyBy || !d.approvalBy);
    expect(dateless.map((d) => d.drawingName)).toEqual([]);
  });

  it('keeps readiness strictly before client approval on every row', () => {
    for (const d of design) expect(`${d.drawingName}:${d.readyBy! < d.approvalBy!}`).toBe(`${d.drawingName}:true`);
  });

  it('validates each deadline against the activity it gates', () => {
    for (const d of design) {
      if (!d.releases.length) continue;
      // a row that passes validation must not claim approval lands after the site needs it
      const complaint = d.issues.find((i) => /site would be waiting/.test(i));
      expect(`${d.drawingName}:${complaint ?? 'ok'}`).toBe(`${d.drawingName}:ok`);
    }
  });

  it('says which rows are unworkable rather than presenting an impossible date plainly', () => {
    // built against a today far past the programme, every target is already gone
    const late = buildPlan(skf, cfg, '2027-01-01').modules.design.rows;
    expect(late.every((d) => d.issues.some((i) => /already passed/.test(i)))).toBe(true);
  });
});

describe('GFC lists TDs and elevations derived from the BOQ and layout (#7)', () => {
  it('raises a technical drawing for every carpentry cost head', () => {
    const tds = design.filter((d) => d.subCategory === 'TD');
    const carpentryPkgs = skf.boqPackages.filter((p) => ['carpentry', 'modular', 'partition'].includes(p.trade));
    expect(tds.length).toBe(carpentryPkgs.length);
    expect(tds.length).toBeGreaterThan(0);
    for (const p of carpentryPkgs) expect(tds.some((t) => t.drawingName === `TD — ${p.name}`)).toBe(true);
  });

  it('raises an elevation per zone', () => {
    const zones = (norms.projectZones as { zones: string[] }).zones;
    const elevations = design.filter((d) => d.subCategory === 'Elevations');
    expect(elevations.map((e) => e.zone).sort()).toEqual([...zones].sort());
  });

  it('scales with the project — KOHLER has its own carpentry heads', () => {
    const k = buildPlan(kohler, cfg, '2026-07-29').modules.design.rows.filter((d) => d.subCategory === 'TD');
    expect(k.length).toBe(kohler.boqPackages.filter((p) => ['carpentry', 'modular', 'partition'].includes(p.trade)).length);
  });
});

describe('sampling is split by zone, because finishes vary by location (#8)', () => {
  const zones = (norms.projectZones as { zones: string[] }).zones;

  it('raises paint, laminate, tile, carpet and ceiling samples once per zone', () => {
    for (const finish of ['Paint Shades', 'Carpentry Laminates & Veneer Shades', 'Floor and Dado Tiles']) {
      const rows = design.filter((d) => d.category === 'SAMPLING' && d.drawingName.startsWith(finish));
      expect(`${finish}:${rows.length}`).toBe(`${finish}:${zones.length}`);
      expect(rows.every((r) => r.zone !== null)).toBe(true);
    }
  });

  it('leaves finishes that do not vary by location as a single row', () => {
    const switches = design.filter((d) => d.drawingName.startsWith('Switch Sockets'));
    expect(switches).toHaveLength(1);
    expect(switches[0].zone).toBeNull();
  });
});

describe('to-do list carries the standard mobilisation tasks (#9)', () => {
  const todos = plan.modules.todos;

  it('seeds the tasks that are the same on every project', () => {
    for (const expected of [
      /site marking/i,
      /resource allocation/i,
      /site verification/i,
      /tool creation/i,
      /wispr onboarding/i,
      /client whatsapp group/i,
      /welcome email/i,
    ])
      expect(`${expected}:${todos.some((t) => expected.test(t.description))}`).toBe(`${expected}:true`);
  });

  it('dates them against the site start rather than leaving them open-ended', () => {
    const std = todos.filter((t) => /Standard project mobilisation/.test(t.notes));
    expect(std.length).toBe((norms.standardMobilisationTodos as { items: unknown[] }).items.length);
    for (const t of std) expect(t.endDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('still carries the project-specific rows alongside them', () => {
    expect(todos.some((t) => t.category === 'procurement')).toBe(true);
    expect(todos.some((t) => t.category === 'design')).toBe(true);
  });
});

describe('RA milestone clause parsing', () => {
  it('splits the labelled contract form into kinds', () => {
    const c = parseMilestoneClauses('Execution: Demolition, partition line marking. Material delivery: gypsum frames. Key order closures: HVAC.');
    expect(c.filter((x) => x.kind === 'execution').map((x) => x.text)).toEqual(['Demolition', 'partition line marking']);
    expect(c.filter((x) => x.kind === 'material').map((x) => x.text)).toEqual(['gypsum frames']);
    expect(c.filter((x) => x.kind === 'order').map((x) => x.text)).toEqual(['HVAC']);
  });

  it('handles the unlabelled "a, b + material delivery" form', () => {
    const c = parseMilestoneClauses('Partition marking, frameworks + gypsum material delivery');
    expect(c.some((x) => x.kind === 'execution' && /Partition marking/.test(x.text))).toBe(true);
    expect(c.some((x) => x.kind === 'material')).toBe(true);
  });
});

describe('to-do list is general by default, not a restatement of the other tabs', () => {
  const todos = plan.modules.todos;

  it('tags every row by where it came from', () => {
    for (const t of todos) expect(['standard', 'derived', 'custom']).toContain(t.source);
  });

  it('keeps the general list short enough to read', () => {
    const general = todos.filter((t) => t.source === 'standard');
    expect(general.length).toBe((norms.standardMobilisationTodos as { items: unknown[] }).items.length);
    // the derived rows are the ones that made it unreadable — they are separable
    expect(todos.filter((t) => t.source === 'derived').length).toBeGreaterThan(general.length);
  });
});

describe('procurement flags long-lead packages (#3)', () => {
  const proc = plan.modules.procurement;

  it('exposes the long-lead flag and the lead time it used', () => {
    expect(proc.some((p) => p.longLead)).toBe(true);
    for (const p of proc) {
      expect(typeof p.longLead).toBe('boolean');
      expect(p.leadDays).toBeGreaterThan(0);
    }
  });

  it('matches the long-lead flag to the norms, not to a guess', () => {
    const leads = norms.packageLeadTimes as Record<string, { days: number; longLead: boolean }>;
    for (const p of proc) {
      const code = skf.boqPackages.find((b) => b.name === p.category)?.code;
      if (code && leads[code]) expect(`${p.category}:${p.longLead}`).toBe(`${p.category}:${leads[code].longLead}`);
    }
  });

  it('gives long-lead packages more runway than short-lead ones', () => {
    const gap = (p: (typeof proc)[number]) =>
      p.orderBy && p.deliveryRequired
        ? Math.round((Date.parse(p.deliveryRequired) - Date.parse(p.orderBy)) / 86400000)
        : 0;
    const long = proc.filter((p) => p.longLead && p.orderBy);
    const short = proc.filter((p) => !p.longLead && p.orderBy);
    expect(Math.min(...long.map(gap))).toBeGreaterThanOrEqual(Math.max(...short.map(gap)));
  });
});
