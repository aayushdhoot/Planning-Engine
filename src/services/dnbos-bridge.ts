// The bridge between this planning engine and the DnB-OS tracking engine.
//
// WHAT THIS REPLACES
//   dnbos-sync.ts writes a spine snapshot into localStorage for the OLD tracking
//   shell (engines/os), which read `dnbos-spine:snap:<id>` off the same origin.
//   The engine actually in use now is engines/skf, served by tools/serve-engine.js
//   on its own port, and it reads JSON over HTTP rather than localStorage. Two
//   different origins cannot share localStorage at all, so that route could never
//   have reached it. This one talks to the sync store that server exposes.
//
// THE SHAPE OF THE DEAL
//   . MODULES are ours. The planner computes the programme, the manpower, the
//     procurement and the design, and pushes them whole. The tracking engine
//     renders them and never recomputes them.
//   . EDITS are shared. Either app may correct a field; the correction is a
//     sparse rowId -> field -> value overlay, merged by the server, and it
//     survives a re-plan. That is what makes a change made on site show up here
//     rather than being flattened the next time the programme is recomputed.
//
// WHY A PROXY PATH AND NOT THE PORT
//   The tracking engine listens on 8901 and this app is served from 5173. Calling
//   the port directly is cross-origin: it works for GET but preflights every JSON
//   POST, and fails outright in any build served from a different host. `/dnbos`
//   is proxied by vite.config.ts, so the browser only ever talks to its own
//   origin and there is no CORS in the picture at all.
import type { ProjectInputs } from '../domain/types';
import type { PertTree } from '../domain/pert';
import type { Plan } from '../engine/planner';
import type { SCurve } from '../engine/scurve';

/** Where the tracking engine lives, for the "open it" link. */
export const TRACKING_ENGINE_URL =
  (import.meta.env?.VITE_DNBOS_URL as string | undefined) ?? 'http://localhost:8901/';

const BASE = '/dnbos';

/**
 * The same project is called different things by the two apps: this one has
 * `skf-pune`, the tracking engine's folder and pin pack are keyed `skf-pune-7f`.
 * Renaming either side would orphan data already stored under the old key â€” the
 * tracking engine's fact store, pin index and event log are all keyed by its id â€”
 * so the two names are reconciled here instead, in one table, rather than by
 * making one app lie about what it calls its own project.
 *
 * An id with no entry passes through unchanged, which is what makes a newly
 * created project work with no edit to this file.
 */
const PROJECT_ALIAS: Record<string, string> = {
  'skf-pune': 'skf-pune-7f',
};

export function dnbosProjectId(planningId: string): string {
  return PROJECT_ALIAS[planningId] ?? planningId;
}

/** rowId -> field -> value. The one shape both apps agree on. */
export type EditOverlay = Record<string, Record<string, string>>;

export interface BridgeState {
  ok: boolean;
  modules: BridgeModules | null;
  edits: EditOverlay;
  pushedAt: string | null;
  editsAt: string | null;
  editsBy: string | null;
  rev: number;
}

export interface BridgeModules {
  /** the PERT tree exactly as this app's Pert.tsx renders it */
  pert: PertTree;
  /** what Gantt.tsx needs, flattened so the tracking engine draws the same bars */
  gantt: {
    activities: { id: string; name: string; startDate: string; endDate: string;
      durationDays: number; totalFloat: number; critical: boolean; phase: string | null;
      /** recorded progress 0..100, or null where the site has reported nothing */
      percentComplete: number | null }[];
    externalStart: string | null; externalEnd: string | null;
    internalEnd: string | null; internalTarget: string | null;
  };
  scurve: SCurve;
  manpower: Plan['modules']['manpower'];
  procurement: Plan['modules']['procurement'];
  design: Plan['modules']['design'];
  /** the mobilisation checklist, including the schedule-derived rows so the
      tracking engine can offer the same "show derived" toggle this app does */
  todos: Plan['modules']['todos'];
  /** the headline figures the tracking engine prints above the programme */
  summary: {
    internalStart: string | null; internalEnd: string | null;
    internalWorkingDays: number | null; varianceDays: number | null;
    externalEnd: string | null; bufferDays: number | null; invariantHolds: boolean;
    totalTasks: number; source: string; engine: string;
  };
}

export function buildBridgeModules(plan: Plan, pert: PertTree, scurve: SCurve): BridgeModules {
  return {
    pert,
    gantt: {
      activities: plan.modules.timeline.activities.map((a) => ({
        id: a.id,
        name: a.name,
        startDate: a.startDate,
        endDate: a.endDate,
        durationDays: a.duration.value,
        totalFloat: a.totalFloat,
        critical: !!a.critical,
        phase: a.phase ?? null,
        percentComplete: a.percentComplete?.value ?? null,
      })),
      externalStart: plan.external?.start ?? null,
      externalEnd: plan.external?.end ?? null,
      internalEnd: plan.internal?.end ?? null,
      internalTarget: plan.internal?.target ?? null,
    },
    scurve,
    manpower: plan.modules.manpower,
    procurement: plan.modules.procurement,
    design: plan.modules.design,
    todos: plan.modules.todos,
    summary: {
      internalStart: plan.internal?.start ?? null,
      internalEnd: plan.internal?.end ?? null,
      internalWorkingDays: plan.internal?.durationWorkingDays ?? null,
      varianceDays: plan.internal?.varianceDays ?? null,
      externalEnd: plan.external?.end ?? null,
      bufferDays: plan.ieInvariant.bufferCalendarDays,
      invariantHolds: plan.ieInvariant.holds,
      totalTasks: pert.totalTasks,
      source: pert.source,
      engine: `${plan.engine.name} v${plan.engine.version}`,
    },
  };
}

async function call<T>(path: string, init?: RequestInit): Promise<T | null> {
  try {
    const r = await fetch(BASE + path, init);
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    // The tracking engine not running is the normal case for anyone using this
    // app on its own. It is not an error and must never interrupt planning.
    return null;
  }
}

/** Push the computed modules. Never touches the edit overlay â€” the server keeps it. */
export async function pushPlan(
  projectId: string,
  project: ProjectInputs,
  modules: BridgeModules,
): Promise<BridgeState | null> {
  return call<BridgeState>(`/sync/plan?project=${encodeURIComponent(dnbosProjectId(projectId))}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      by: 'planning-engine',
      project: {
        id: projectId,
        name: project.name,
        client: project.client || null,
        location: project.location || null,
        areaSft: project.areaSft?.value ?? null,
      },
      modules,
    }),
  });
}

/** Read what the store holds, including edits made in the tracking engine. */
export async function pullState(projectId: string): Promise<BridgeState | null> {
  return call<BridgeState>(`/sync/state?project=${encodeURIComponent(dnbosProjectId(projectId))}`);
}

/** Push an overlay of corrections made here, so the tracking engine shows them. */
export async function pushEdits(projectId: string, edits: EditOverlay): Promise<BridgeState | null> {
  return call<BridgeState>(`/sync/edits?project=${encodeURIComponent(dnbosProjectId(projectId))}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ by: 'planning-engine', edits }),
  });
}
