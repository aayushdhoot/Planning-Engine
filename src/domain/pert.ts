// PERT / WBS types — the MS-Project-style hierarchical schedule used at Flipspaces.
// Format mirrors 'Emirates PERT Schedule.pdf': ID, Task Name, Duration, Start, Finish,
// Actual Start, Actual Finish, with summary rollups and collapsible levels.

/** Top-level streams a fit-out programme is organised into. */
export type PertCategory = 'schedule' | 'design' | 'procurement' | 'execution';

export const PERT_CATEGORIES: { key: PertCategory; label: string }[] = [
  { key: 'schedule', label: 'Schedule & Milestones' },
  { key: 'design', label: 'Design' },
  { key: 'procurement', label: 'Procurement' },
  { key: 'execution', label: 'Execution' },
];

export interface PertNode {
  /** display id (row number in the source programme) */
  id: number;
  name: string;
  /** indent depth: 0 = project, 1 = category, 2 = section, 3+ = task */
  level: number;
  category: PertCategory;
  /** duration in calendar days as stated by the programme */
  durationDays: number;
  start: string | null; // ISO
  finish: string | null; // ISO
  actualStart: string | null;
  actualFinish: string | null;
  /** true when this row rolls up children rather than carrying its own work */
  isSummary: boolean;
  children: PertNode[];
  /** 0..100, rolled up from children by duration weight */
  percentComplete: number;
  /** derived: is this row behind its planned finish, given today */
  status: 'not_started' | 'in_progress' | 'complete' | 'delayed';
}

export interface PertTree {
  root: PertNode | null;
  byCategory: Record<PertCategory, PertNode[]>;
  totalTasks: number;
  source: string;
}

/** Flatten a tree honouring a set of collapsed node ids. */
export function flattenPert(nodes: PertNode[], collapsed: ReadonlySet<number>): PertNode[] {
  const out: PertNode[] = [];
  const walk = (list: PertNode[]) => {
    for (const n of list) {
      out.push(n);
      if (n.children.length && !collapsed.has(n.id)) walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** All descendant ids of a node, used for expand-all / collapse-all. */
export function descendantIds(nodes: PertNode[]): number[] {
  const out: number[] = [];
  const walk = (list: PertNode[]) => {
    for (const n of list) {
      if (n.children.length) {
        out.push(n.id);
        walk(n.children);
      }
    }
  };
  walk(nodes);
  return out;
}

/** Roll percent-complete and status up the tree. Mutates and returns the nodes. */
export function rollUp(nodes: PertNode[], today: string): PertNode[] {
  const visit = (n: PertNode): PertNode => {
    if (n.children.length) {
      n.children.forEach(visit);
      const totalW = n.children.reduce((s, c) => s + Math.max(1, c.durationDays), 0);
      n.percentComplete = Math.round(
        n.children.reduce((s, c) => s + c.percentComplete * Math.max(1, c.durationDays), 0) / totalW,
      );
    } else {
      n.percentComplete = n.actualFinish ? 100 : n.actualStart ? 50 : 0;
    }
    if (n.percentComplete >= 100) n.status = 'complete';
    else if (n.finish && n.finish < today && n.percentComplete < 100) n.status = 'delayed';
    else if (n.percentComplete > 0) n.status = 'in_progress';
    else n.status = 'not_started';
    return n;
  };
  nodes.forEach(visit);
  return nodes;
}
