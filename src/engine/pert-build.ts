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

/**
 * Hand edits to the rows that are NOT part of the CPM network.
 *
 * Execution activities are edited by folding the change into the inputs and
 * recomputing — that is the only way a duration or a link can mean anything,
 * because the dates around it have to move. The other three streams are not like
 * that. A drawing's approval date, a package's order-by date and a contract
 * milestone are FACTS ABOUT OTHER TRACKERS that this table happens to draw; no
 * network solves them, so there is nothing for a recompute to re-derive and
 * nothing to reflow. They are applied here, on the way out.
 *
 * It is the SAME per-project overlay the Design and Procurement tabs already
 * write to — `rowId → field → value` — so a date changed here and the same date
 * changed there are one fact in one place, and both screens show it. Giving the
 * schedule its own private copy would have been quicker and would have let the
 * two disagree about the same drawing.
 */
export type ModuleOverlay = Record<string, Record<string, string>>;

/** Fields the schedule editor writes for rows that have no tracker column of their own. */
export const PERT_ACTUAL_START = 'pertActualStart';
export const PERT_ACTUAL_FINISH = 'pertActualFinish';
export const PERT_PERCENT = 'pertPercent';
export const PERT_STATUS = 'pertStatus';
export const PERT_NAME = 'pertName';

/**
 * Which of a row's own columns carry its start and finish, per stream.
 *
 * Mapped to the tracker's REAL field names rather than to a private pair, so a
 * date the schedule editor writes lands in the same cell the Design or
 * Procurement tab reads. A drawing has one approval date, not one per screen.
 */
const DATE_FIELDS: Record<string, { start: string; finish: string }> = {
  design: { start: 'readyBy', finish: 'approvalBy' },
  procurement: { start: 'orderBy', finish: 'deliveryRequired' },
  schedule: { start: 'date', finish: 'date' },
};

/** Apply the overlay to one leaf. Returns the node for chaining. */
function overlayRow(n: PertNode, overlay: ModuleOverlay): PertNode {
  const row = n.sourceId ? overlay[n.sourceId] : undefined;
  if (!row) return n;
  const fields = DATE_FIELDS[n.category];
  if (fields) {
    // A cleared cell is an empty string, and that is a different instruction
    // from an untouched one: it means "there is no such date", so the row goes
    // back to showing nothing rather than to showing what was computed.
    if (row[fields.start] !== undefined) n.start = row[fields.start] || null;
    if (row[fields.finish] !== undefined) n.finish = row[fields.finish] || null;
  }
  if (row[PERT_NAME]) n.name = row[PERT_NAME];
  if (row[PERT_ACTUAL_START] !== undefined) n.actualStart = row[PERT_ACTUAL_START] || null;
  if (row[PERT_ACTUAL_FINISH] !== undefined) n.actualFinish = row[PERT_ACTUAL_FINISH] || null;
  if (row[PERT_PERCENT] !== undefined && row[PERT_PERCENT] !== '') {
    n.percentComplete = Math.max(0, Math.min(100, Number(row[PERT_PERCENT]) || 0));
    n.percentIsManual = true;
  }
  if (row[PERT_STATUS]) {
    n.status = row[PERT_STATUS] as PertNode['status'];
    n.statusIsManual = true;
  }
  if (n.start && n.finish)
    n.durationDays = Math.max(1, Math.round((Date.parse(n.finish) - Date.parse(n.start)) / 86400000) + 1);
  return n;
}

export function buildPertFromPlan(plan: Plan, today: string, overlay: ModuleOverlay = {}): PertTree {
  counter = 0;
  // Deliberately does NOT require plan.internal. clientView() nulls it, and requiring it here
  // meant the client saw "no PERT programme available" — the schedule is the main thing a
  // client is owed. Everything below is built from the external baseline and the activities,
  // both of which survive redaction; float and critical flags are already stripped by then.
  if (plan.project.status !== 'planned' || !plan.external)
    return { root: null, byCategory: { schedule: [], design: [], procurement: [], execution: [] }, totalTasks: 0, source: 'no plan' };

  // ---- Schedule & Milestones
  const milestones = plan.external.milestones.map((m) =>
    overlayRow(
      node(`${m.code} — ${m.description.slice(0, 70)}${m.description.length > 70 ? '…' : ''}`, 2, 'schedule', m.date, m.date,
        // A contract milestone has no tracker row behind it, so its code is the
        // id. Namespaced: RA1 is a milestone code, and left bare it could collide
        // with a drawing or package id from a different register.
        { sourceId: `ms:${m.code}` }),
      overlay,
    ),
  );
  const schedule = summarise(
    Object.assign(node('Schedule & Milestones', 1, 'schedule', null, null), { children: milestones }),
  );

  // ---- Design (GFC / MEP / Sampling), grouped by category
  const designGroups: PertNode[] = (['GFC', 'MEP', 'SAMPLING'] as const).map((cat) => {
    const rows = plan.modules.design.rows.filter((r) => r.category === cat);
    const kids = rows.map((r) => {
      const n = node(r.drawingName, 3, 'design', r.readyBy, r.approvalBy ?? r.readyBy, { sourceId: r.id });
      n.actualFinish = r.statusClient === 'Completed' ? r.approvalBy : null;
      return overlayRow(n, overlay);
    });
    return summarise(Object.assign(node(cat === 'SAMPLING' ? 'Sampling & Mockup Approvals' : `${cat} Drawings`, 2, 'design', null, null), { children: kids }));
  }).filter((g) => g.children.length);
  const design = summarise(Object.assign(node('Design', 1, 'design', null, null), { children: designGroups }));

  // ---- Procurement: order-by → delivery-required window per package
  const procKids = plan.modules.procurement
    .filter((p) => p.orderBy && p.deliveryRequired)
    .sort((a, b) => (a.orderBy! < b.orderBy! ? -1 : 1))
    .map((p) => overlayRow(
      node(`${p.category} — order to delivery`, 2, 'procurement', p.orderBy, p.deliveryRequired, { sourceId: p.id }),
      overlay,
    ));
  const procurement = summarise(Object.assign(node('Procurement', 1, 'procurement', null, null), { children: procKids }));

  // ---- Execution: activities grouped by phase
  const phases = plan.modules.timeline.phases.map((ph) => {
    const kids = plan.modules.timeline.activities
      .filter((a) => a.phase === ph.name)
      .sort((a, b) => (a.startDate < b.startDate ? -1 : 1))
      .map((a) => {
        // A hand-typed "display only" date is shown INSTEAD of the computed one.
        // That is the whole of what display mode promises: the row reads as the
        // drawing or the client letter says, while the network behind it is
        // untouched — no successor moves, no float changes.
        const n = node(a.name, 3, 'execution',
          a.displayStart?.value ?? a.startDate,
          a.displayFinish?.value ?? a.endDate,
          { sourceId: a.id });
        n.durationDays = a.duration.value;
        // Recorded progress, where the site has reported any. rollUp() derives a
        // leaf's percent from its actual dates, so a part-done activity needs an
        // actual START and no actual finish; without it the roll-up reads the row
        // as not started and every summary above loses progress the S-curve is
        // already drawing from the very same numbers.
        const pct = a.percentComplete?.value;
        if (pct != null && pct > 0) {
          n.actualStart = a.startDate;
          if (pct >= 100) n.actualFinish = a.endDate;
          n.percentComplete = pct;   // rollUp keeps a recorded figure over its placeholder
        }
        // An actual date somebody RECORDED beats one inferred from a percentage.
        // The block above stands in the planned dates because a percent is all it
        // has to go on; when the real dates are known they are not a refinement of
        // that guess, they replace it.
        if (a.actualStart) n.actualStart = a.actualStart.value;
        if (a.actualFinish) n.actualFinish = a.actualFinish.value;
        if (a.statusOverride) {
          n.status = a.statusOverride.value;
          n.statusIsManual = true;   // rollUp must not derive over it
        }
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
