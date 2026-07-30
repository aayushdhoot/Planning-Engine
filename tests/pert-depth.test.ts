// The three view levels are just "collapse below this depth" on an already-levelled tree.
// What matters is that switching level never loses a row and never invents one.
import { describe, expect, it } from 'vitest';
import { buildPertFromPlan } from '../src/engine/pert-build';
import { buildPlan } from '../src/engine/planner';
import { flattenPert, type PertNode } from '../src/domain/pert';
import { skf } from '../src/data/skf';
import type { CalendarConfig, EngineConfig } from '../src/domain/types';
import norms from '../src/norms/norms-v1.json';

const cal: CalendarConfig = { weeklyOffDays: [], holidays: [], workModeFactor: 1 };
const cfg: EngineConfig = {
  calendar: cal,
  buffer: { internalBufferDays: 7, min: norms.bufferPolicy.min, max: norms.bufferPolicy.max },
  normsVersion: norms.version,
};
const tree = buildPertFromPlan(buildPlan(skf, cfg, '2026-07-01'), '2026-07-01');

/** Mirrors the component: collapse everything at or below maxLevel. */
const atDepth = (roots: PertNode[], maxLevel: number | null) => {
  if (maxLevel === null) return flattenPert(roots, new Set());
  const forced = new Set<number>();
  const walk = (n: PertNode) => {
    if (n.level >= maxLevel && n.children.length) forced.add(n.id);
    n.children.forEach(walk);
  };
  roots.forEach(walk);
  return flattenPert(roots, forced);
};

describe('PERT view levels', () => {
  const roots = [tree.root!];

  it('WBS level shows the project and its streams only', () => {
    const rows = atDepth(roots, 1);
    expect(rows.every((r) => r.level <= 1)).toBe(true);
    expect(rows.length).toBeGreaterThan(1);
  });

  it('summary level adds the sections beneath each stream', () => {
    const rows = atDepth(roots, 2);
    expect(rows.every((r) => r.level <= 2)).toBe(true);
    expect(rows.length).toBeGreaterThan(atDepth(roots, 1).length);
  });

  it('activity level shows every task', () => {
    const rows = atDepth(roots, null);
    expect(rows.length).toBeGreaterThan(atDepth(roots, 2).length);
    expect(rows.some((r) => r.level >= 3)).toBe(true);
  });

  it('each level is a strict superset of the one above it', () => {
    const ids = (rows: PertNode[]) => new Set(rows.map((r) => r.id));
    const wbs = ids(atDepth(roots, 1));
    const summary = ids(atDepth(roots, 2));
    const activity = ids(atDepth(roots, null));
    for (const id of wbs) expect(summary.has(id)).toBe(true);
    for (const id of summary) expect(activity.has(id)).toBe(true);
  });

  it('summary rows still carry rolled-up dates, so a collapsed view is not blank', () => {
    for (const r of atDepth(roots, 1).filter((n) => n.isSummary)) {
      expect(r.start).not.toBeNull();
      expect(r.finish).not.toBeNull();
    }
  });
});

describe('choosing a level seeds the collapse state (the bug)', () => {
  // mirrors collapseForDepth in the component
  const collapseForDepth = (d: 'wbs' | 'summary' | 'activity') => {
    const s = new Set<number>();
    if (d === 'activity') return s;
    const maxLevel = d === 'wbs' ? 1 : 2;
    const walk = (n: PertNode) => {
      if (n.level >= maxLevel && n.children.length) s.add(n.id);
      n.children.forEach(walk);
    };
    if (tree.root) walk(tree.root);
    return s;
  };
  const rowsAt = (d: 'wbs' | 'summary' | 'activity') => flattenPert([tree.root!], collapseForDepth(d));

  it('activity level collapses nothing, so it really does show activities', () => {
    expect(collapseForDepth('activity').size).toBe(0);
    expect(rowsAt('activity').some((r) => r.level >= 3)).toBe(true);
  });

  it('each level shows strictly more rows than the one above', () => {
    const wbs = rowsAt('wbs').length;
    const summary = rowsAt('summary').length;
    const activity = rowsAt('activity').length;
    expect(summary).toBeGreaterThan(wbs);
    // this is what regressed: activity used to equal summary
    expect(activity).toBeGreaterThan(summary);
  });
});
