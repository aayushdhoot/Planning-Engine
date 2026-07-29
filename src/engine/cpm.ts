// Deterministic CPM engine. AI never computes dates; this module does (SPEC §4).
import type { Activity, CalendarConfig, CpmResult, ScheduledActivity } from '../domain/types';
import { workdayToDate } from './calendar';

/** Topological order; throws on cycles or unknown predecessors. */
function topoSort(acts: Activity[]): Activity[] {
  const byId = new Map(acts.map((a) => [a.id, a]));
  for (const a of acts)
    for (const d of a.deps)
      if (!byId.has(d.pred)) throw new Error(`Unknown predecessor ${d.pred} of ${a.id}`);
  const indeg = new Map<string, number>(acts.map((a) => [a.id, a.deps.length]));
  const succs = new Map<string, string[]>();
  for (const a of acts)
    for (const d of a.deps) {
      const s = succs.get(d.pred) ?? [];
      s.push(a.id);
      succs.set(d.pred, s);
    }
  // deterministic: process queue in sorted id order
  const queue = acts.filter((a) => a.deps.length === 0).map((a) => a.id).sort();
  const out: Activity[] = [];
  while (queue.length) {
    const id = queue.shift()!;
    out.push(byId.get(id)!);
    for (const s of (succs.get(id) ?? []).slice().sort()) {
      const n = indeg.get(s)! - 1;
      indeg.set(s, n);
      if (n === 0) {
        // insert keeping queue sorted for determinism
        const i = queue.findIndex((q) => q > s);
        if (i === -1) queue.push(s);
        else queue.splice(i, 0, s);
      }
    }
  }
  if (out.length !== acts.length) throw new Error('Dependency cycle detected');
  return out;
}

/**
 * Compute CPM schedule.
 * Working-day model: ES/EF are 0-based working-day indices; EF is exclusive
 * (activity occupies days [ES, EF)). A zero-duration milestone has EF === ES.
 */
export function computeCpm(acts: Activity[], projectStartIso: string, cal: CalendarConfig): CpmResult {
  const order = topoSort(acts);
  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  for (const a of order) {
    let start = 0;
    for (const d of a.deps) {
      const pes = es.get(d.pred)!;
      const pef = ef.get(d.pred)!;
      let cand: number;
      if (d.type === 'FS') cand = pef + d.lag;
      else if (d.type === 'SS') cand = pes + d.lag;
      else cand = pef + d.lag - a.duration.value; // FF
      if (cand > start) start = cand;
    }
    if (start < 0) start = 0;
    es.set(a.id, start);
    ef.set(a.id, start + a.duration.value);
  }

  const projectEnd = Math.max(0, ...order.map((a) => ef.get(a.id)!));

  // Backward pass
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();
  const succs = new Map<string, { succ: Activity; type: string; lag: number }[]>();
  for (const a of order)
    for (const d of a.deps) {
      const s = succs.get(d.pred) ?? [];
      s.push({ succ: a, type: d.type, lag: d.lag });
      succs.set(d.pred, s);
    }
  for (const a of [...order].reverse()) {
    const sl = succs.get(a.id) ?? [];
    let finish = projectEnd;
    for (const { succ, type, lag } of sl) {
      let cand: number;
      if (type === 'FS') cand = ls.get(succ.id)! - lag;
      else if (type === 'SS') cand = ls.get(succ.id)! - lag + a.duration.value; // constraint on start -> convert to finish
      else cand = lf.get(succ.id)! - lag; // FF
      if (cand < finish) finish = cand;
    }
    lf.set(a.id, finish);
    ls.set(a.id, finish - a.duration.value);
  }

  const scheduled: ScheduledActivity[] = order.map((a) => {
    const tf = ls.get(a.id)! - es.get(a.id)!;
    const s = es.get(a.id)!;
    const f = ef.get(a.id)!;
    return {
      ...a,
      es: s,
      ef: f,
      ls: ls.get(a.id)!,
      lf: lf.get(a.id)!,
      totalFloat: tf,
      critical: tf === 0,
      startDate: workdayToDate(projectStartIso, s, cal),
      // inclusive end date: last occupied working day (milestones: same as start)
      endDate: workdayToDate(projectStartIso, Math.max(s, f - 1), cal),
    };
  });

  // Critical path: follow TF=0 chain in topological order
  const criticalPath = scheduled.filter((a) => a.critical).map((a) => a.id);

  return { activities: scheduled, projectDurationDays: projectEnd, criticalPath };
}
