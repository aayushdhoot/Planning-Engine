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
  /**
   * The id of the thing this row was built FROM — an activity, a drawing, a
   * purchase package, a milestone. Null on summaries, which are built from their
   * children and are nothing on their own.
   *
   * The editor used to find a row's activity by matching its NAME, which worked
   * only because nothing had been renamed yet: the first hand-edited name broke
   * the link and the row silently stopped being editable. It also left the three
   * non-execution streams uneditable, because a drawing's name matches no
   * activity at all. Carrying the id is what lets every row be edited.
   */
  sourceId?: string;
  /** derived: is this row behind its planned finish, given today */
  status: 'not_started' | 'in_progress' | 'complete' | 'delayed';
  /**
   * The status was SET, not worked out, so the roll-up must leave it alone.
   *
   * Without the flag there is no way to tell a hand-set "complete" from a
   * derived one, and rollUp — which runs after the tree is built — would
   * recompute it straight back to whatever the percentages imply. The override
   * would appear to be accepted and then quietly vanish on the next render.
   */
  statusIsManual?: boolean;
  /** same again for a percentage typed by hand — see the leaf rule in rollUp */
  percentIsManual?: boolean;
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
      // A leaf's percent comes from its actual dates: finished is 100, started
      // but unfinished is 50, untouched is 0.
      //
      // The exception is a leaf the builder has already given a real recorded
      // figure. Overwriting that with the 50 that stands for "somewhere in the
      // middle" reported a 20%-complete activity as half done — and the S-curve,
      // which reads the same source directly, then disagreed with the PERT about
      // the same activity on the same screen. A number somebody recorded beats a
      // placeholder for one.
      // A figure TYPED by hand is not one of the two cases below. It is the
      // answer, including the awkward ones the rule cannot express — 100% on a
      // row with no actual finish recorded, or 0% on one that has started.
      const recorded = n.percentComplete;
      if (!n.percentIsManual)
        n.percentComplete = n.actualFinish
          ? 100
          : recorded > 0 && recorded < 100
            ? recorded
            : n.actualStart ? 50 : 0;
    }
    // A status somebody set by hand is not a conclusion to be re-derived.
    if (!n.statusIsManual) {
      if (n.percentComplete >= 100) n.status = 'complete';
      else if (n.finish && n.finish < today && n.percentComplete < 100) n.status = 'delayed';
      else if (n.percentComplete > 0) n.status = 'in_progress';
      else n.status = 'not_started';
    }
    return n;
  };
  nodes.forEach(visit);
  return nodes;
}
