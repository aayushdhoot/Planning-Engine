// Build a PERT tree from a computed plan, so every project — not just the ones with an
// issued MS-Project programme — gets the same four-category collapsible view.
import type { Plan } from './planner';
import type { PertCategory, PertNode, PertTree } from '../domain/pert';
import { rollUp } from '../domain/pert';

let counter = 0;
const node = (
  name: string,
  level: number,
  category: PertCategory,
  start: string | null,
  finish: string | null,
  opts: Partial<PertNode> = {},
): PertNode => ({
  id: ++counter,
  name,
  level,
  category,
  durationDays: start && finish ? Math.max(1, Math.round((Date.parse(finish) - Date.parse(start)) / 86400000) + 1) : 0,
  start,
  finish,
  actualStart: null,
  actualFinish: null,
  isSummary: false,
  children: [],
  percentComplete: 0,
  status: 'not_started',
  ...opts,
});

const span = (nodes: PertNode[]): { start: string | null; finish: string | null } => {
  const s = nodes.map((n) => n.start).filter(Boolean) as string[];
  const f = nodes.map((n) => n.finish).filter(Boolean) as string[];
  return {
    start: s.length ? s.reduce((a, b) => (a < b ? a : b)) : null,
    finish: f.length ? f.reduce((a, b) => (a > b ? a : b)) : null,
  };
};

const summarise = (n: PertNode): PertNode => {
  if (!n.children.length) return n;
  const { start, finish } = span(n.children);
  n.start = start;
  n.finish = finish;
  n.durationDays = start && finish ? Math.round((Date.parse(finish) - Date.parse(start)) / 86400000) + 1 : 0;
  n.isSummary = true;
  return n;
};

export function buildPertFromPlan(plan: Plan, today: string): PertTree {
  counter = 0;
  // Deliberately does NOT require plan.internal. clientView() nulls it, and requiring it here
  // meant the client saw "no PERT programme available" — the schedule is the main thing a
  // client is owed. Everything below is built from the external baseline and the activities,
  // both of which survive redaction; float and critical flags are already stripped by then.
  if (plan.project.status !== 'planned' || !plan.external)
    return { root: null, byCategory: { schedule: [], design: [], procurement: [], execution: [] }, totalTasks: 0, source: 'no plan' };

  // ---- Schedule & Milestones
  const milestones = plan.external.milestones.map((m) =>
    node(`${m.code} — ${m.description.slice(0, 70)}${m.description.length > 70 ? '…' : ''}`, 2, 'schedule', m.date, m.date),
  );
  const schedule = summarise(
    Object.assign(node('Schedule & Milestones', 1, 'schedule', null, null), { children: milestones }),
  );

  // ---- Design (GFC / MEP / Sampling), grouped by category
  const designGroups: PertNode[] = (['GFC', 'MEP', 'SAMPLING'] as const).map((cat) => {
    const rows = plan.modules.design.rows.filter((r) => r.category === cat);
    const kids = rows.map((r) => {
      const n = node(r.drawingName, 3, 'design', r.startDate, r.endDateClient ?? r.endDateInt);
      n.actualFinish = r.statusClient === 'Completed' ? r.revisedEndDateClient ?? r.endDateClient : null;
      return n;
    });
    return summarise(Object.assign(node(cat === 'SAMPLING' ? 'Sampling & Mockup Approvals' : `${cat} Drawings`, 2, 'design', null, null), { children: kids }));
  }).filter((g) => g.children.length);
  const design = summarise(Object.assign(node('Design', 1, 'design', null, null), { children: designGroups }));

  // ---- Procurement: order-by → delivery-required window per package
  const procKids = plan.modules.procurement
    .filter((p) => p.orderBy && p.deliveryRequired)
    .sort((a, b) => (a.orderBy! < b.orderBy! ? -1 : 1))
    .map((p) => node(`${p.category} — order to delivery`, 2, 'procurement', p.orderBy, p.deliveryRequired));
  const procurement = summarise(Object.assign(node('Procurement', 1, 'procurement', null, null), { children: procKids }));

  // ---- Execution: activities grouped by phase
  const phases = plan.modules.timeline.phases.map((ph) => {
    const kids = plan.modules.timeline.activities
      .filter((a) => a.phase === ph.name)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
      .map((a) => {
        const n = node(a.name, 3, 'execution', a.startDate, a.endDate);
        n.durationDays = a.duration.value;
        return n;
      });
    return summarise(Object.assign(node(ph.name, 2, 'execution', null, null), { children: kids }));
  });
  const execution = summarise(Object.assign(node('Execution', 1, 'execution', null, null), { children: phases }));

  const children = [schedule, design, procurement, execution].filter((c) => c.children.length);
  const root = summarise(Object.assign(node(plan.project.name, 0, 'schedule', null, null), { children }));
  rollUp([root], today);

  const byCategory = { schedule: [], design: [], procurement: [], execution: [] } as Record<PertCategory, PertNode[]>;
  for (const c of children) byCategory[c.category].push(c);

  const count = (n: PertNode): number => 1 + n.children.reduce((s, c) => s + count(c), 0);
  return { root, byCategory, totalTasks: count(root), source: `derived from the computed plan (${plan.engine.name} v${plan.engine.version})` };
}
