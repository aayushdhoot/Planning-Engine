// Hand edits to the programme.
//
// The schedule is COMPUTED — dates come out of CPM over durations and
// dependencies — so an edit cannot simply be written onto a date and left
// there; the next recompute would wipe it. Edits are held as an overlay and
// folded back into the INPUTS, and the plan is then recomputed from those. That
// is what makes a changed duration move its successors, a new dependency
// re-route the critical path, and a deleted activity release the work that was
// waiting on it.
//
// TWO WAYS TO TYPE A DATE, because both are legitimate and they mean different
// things:
//   pin      the date becomes a constraint. CPM re-solves around it: successors
//            move, float recomputes, and the programme stays internally
//            consistent. Use it when the date is a commitment.
//   display  the date is shown as typed and nothing reflows. Use it to record
//            what a drawing or a client letter says, without claiming the
//            network agrees. The row is marked, because a date the network does
//            not stand behind must not look like one it does.
import type { Activity, ActivityStatus, Dependency, ProjectInputs } from '../domain/types';
import type { ExternalDelay, Plan } from './planner';
import { workingDaysBetween } from './calendar';

export type DateMode = 'pin' | 'display';

export interface ActivityEdit {
  name?: string;
  durationDays?: number;
  /** 0..100 recorded progress */
  percentComplete?: number;
  /** typed start date and how it should behave */
  start?: string | null;
  startMode?: DateMode;
  /**
   * Typed finish date, display mode only.
   *
   * A PINNED finish never reaches here: it is expressed as a duration, because
   * that is the only thing a finish can honestly mean to a network solved
   * forwards from its start. The editor converts start→finish into working days
   * and writes `durationDays`, so successors move and the critical path
   * re-routes exactly as they would for a duration typed directly. Storing a
   * pinned finish as well would leave two facts about the same row that a later
   * recompute could put out of step.
   */
  finish?: string | null;
  finishMode?: DateMode;
  /** what the site recorded actually happening — a fact, not a plan */
  actualStart?: string | null;
  actualFinish?: string | null;
  /** a status set by hand; null clears it and hands the row back to the derivation */
  status?: ActivityStatus | null;
  /** replacement predecessor list; undefined means "unchanged" */
  deps?: Dependency[];
  deleted?: boolean;
  /** rows the user added here rather than in the source schedule */
  added?: { phase: string; trade: string };
}

export type ScheduleEdits = Record<string, ActivityEdit>;

const NEW_PREFIX = 'user-';
export const isUserAdded = (id: string) => id.startsWith(NEW_PREFIX);
export const newActivityId = (n: number) => `${NEW_PREFIX}${n}`;

/** Does adding `dep -> id` close a loop? A cycle makes CPM never terminate. */
export function wouldCycle(acts: Activity[], id: string, predId: string): boolean {
  if (id === predId) return true;
  const byId = new Map(acts.map((a) => [a.id, a]));
  // walk back from the proposed predecessor; if we reach `id`, the edge closes a loop
  const seen = new Set<string>();
  const stack = [predId];
  while (stack.length) {
    const cur = stack.pop()!;
    if (cur === id) return true;
    if (seen.has(cur)) continue;
    seen.add(cur);
    const a = byId.get(cur);
    if (a) for (const d of a.deps) stack.push(d.pred);
  }
  return false;
}

/**
 * Fold the overlay into a list of activities.
 *
 * THIS, AND NOT THE PROJECT INPUTS, IS WHERE THE OVERLAY BELONGS. A programme
 * only sometimes arrives with the project: where there is a BOQ and no supplied
 * schedule the activities are DERIVED, inside buildPlan, from the WBS template —
 * which is the usual case, and every project here but Emirates. Folding the
 * overlay into `project.scheduleActivities` therefore folded it into an empty
 * list: the editor counted the edit, the push counted the edit, and the
 * programme never changed, for every project whose schedule the engine wrote.
 *
 * Taking activities rather than inputs lets buildPlan apply it at the one moment
 * both kinds exist — after the derivation, before the fit.
 */
export function applyEditsToActivities(activities: Activity[], edits: ScheduleEdits): Activity[] {
  const project = { scheduleActivities: activities } as ProjectInputs;
  return applyScheduleEdits(project, edits).scheduleActivities;
}

/**
 * Fold the overlay into the project inputs. The result is a ProjectInputs that
 * buildPlan can be run over exactly as if the schedule had arrived this way.
 */
export function applyScheduleEdits(project: ProjectInputs, edits: ScheduleEdits): ProjectInputs {
  const ids = new Set(project.scheduleActivities.map((a) => a.id));

  // rows the user added, in the order they were created
  const added: Activity[] = Object.entries(edits)
    .filter(([id, e]) => e.added && !ids.has(id) && !e.deleted)
    .map(([id, e]) => ({
      id,
      name: e.name || 'New activity',
      phase: e.added!.phase || 'Execution',
      trade: e.added!.trade || 'general',
      duration: { value: Math.max(1, e.durationDays ?? 1), provenance: 'input' as const, source: 'added by hand in the schedule editor' },
      durationLocked: true,   // typed, like every other hand-set duration
      deps: e.deps ?? [],
      crew: { value: 1, provenance: 'norm' as const, source: 'added by hand — crew not stated' },
      isMilestone: false,
    }));

  const kept = project.scheduleActivities
    .filter((a) => !edits[a.id]?.deleted)
    .map((a) => {
      const e = edits[a.id];
      if (!e) return a;
      const next: Activity = { ...a };
      if (e.name) next.name = e.name;
      if (e.durationDays != null && e.durationDays > 0) {
        next.duration = { value: e.durationDays, provenance: 'input', source: 'set by hand in the schedule editor' };
        // ...and held there. Without the lock the schedule fit rescales it on the
        // next recompute and the typed number is gone before it is read once.
        next.durationLocked = true;
      }
      if (e.percentComplete != null)
        next.percentComplete = { value: Math.max(0, Math.min(100, e.percentComplete)), provenance: 'input', source: 'recorded by hand in the schedule editor' };
      if (e.deps) next.deps = e.deps;
      // Recorded and display values. Each is folded in only when it holds a date —
      // a null is the person CLEARING the field, and the row goes back to what the
      // engine computes, so the absence has to be preserved rather than written as
      // an empty string that every later reader would have to guess at.
      if (e.start && e.startMode === 'display')
        next.displayStart = { value: e.start, provenance: 'input', source: 'typed in the schedule editor — display only' };
      if (e.finish && e.finishMode === 'display')
        next.displayFinish = { value: e.finish, provenance: 'input', source: 'typed in the schedule editor — display only' };
      if (e.actualStart)
        next.actualStart = { value: e.actualStart, provenance: 'input', source: 'actual start recorded in the schedule editor' };
      if (e.actualFinish)
        next.actualFinish = { value: e.actualFinish, provenance: 'input', source: 'actual finish recorded in the schedule editor' };
      if (e.status)
        next.statusOverride = { value: e.status, provenance: 'input', source: 'status set by hand in the schedule editor' };
      return next;
    });

  // A deleted activity must not be left as a dangling predecessor: everything
  // that waited on it would wait forever, and CPM would place it at day zero
  // with no explanation on screen.
  const live = new Set([...kept, ...added].map((a) => a.id));
  const clean = [...kept, ...added].map((a) =>
    a.deps.some((d) => !live.has(d.pred)) ? { ...a, deps: a.deps.filter((d) => live.has(d.pred)) } : a,
  );

  return { ...project, scheduleActivities: clean };
}

/** Typed start dates that are PINNED become CPM constraints. */
export function pinsToDelays(plan: Plan, edits: ScheduleEdits, projectStart: string): ExternalDelay[] {
  const out: ExternalDelay[] = [];
  for (const [id, e] of Object.entries(edits)) {
    if (!e.start || e.startMode !== 'pin' || e.deleted) continue;
    // index is inclusive-count minus one: the first working day is index 0
    const idx = Math.max(0, workingDaysBetween(projectStart, e.start, plan.calendar) - 1);
    out.push({ activityId: id, minStartWorkingDay: idx, reason: `start pinned to ${e.start} in the schedule editor` });
  }
  return out;
}

export function countEdits(edits: ScheduleEdits): number {
  let n = 0;
  for (const e of Object.values(edits)) {
    if (e.deleted) { n++; continue; }
    if (e.name != null) n++;
    if (e.durationDays != null) n++;
    if (e.percentComplete != null) n++;
    if (e.start != null) n++;
    if (e.finish != null) n++;
    if (e.actualStart != null) n++;
    if (e.actualFinish != null) n++;
    if (e.status != null) n++;
    if (e.deps) n++;
    if (e.added) n++;
  }
  return n;
}
