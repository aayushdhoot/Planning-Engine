// DnB-OS tracking engine sync — writes the spine snapshot to localStorage so the
// tracking engine (served from /tracking/ on the same origin) picks it up.
//
// eslint bans localStorage project-wide (T1-DETERMINISM). This module is permitted
// because it WRITES OUT of the planner, never reads back into it: the snapshot is a
// downstream artefact of a plan that was already computed from deterministic inputs.
// No planned value depends on anything this writes.
/* eslint-disable no-restricted-globals */
import type { ProjectInputs } from '../domain/types';
import type { Plan } from '../engine/planner';
import { planToDnbosSnapshot } from './dnbos-snapshot';

const SNAP_PREFIX = 'dnbos-spine:snap:';
const VERSION_PREFIX = 'dnbos-pe:version:';

function store(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

function readVersion(projectId: string): number {
  try {
    const raw = store()?.getItem(VERSION_PREFIX + projectId);
    return raw ? Number(raw) : 0;
  } catch {
    return 0;
  }
}

function writeVersion(projectId: string, v: number): void {
  try {
    store()?.setItem(VERSION_PREFIX + projectId, String(v));
  } catch { /* best effort */ }
}

export function syncPlanToTrackingEngine(
  projectId: string,
  project: ProjectInputs,
  plan: Plan,
): void {
  if (plan.project.status === 'pending_inputs') return;
  try {
    const s = store();
    if (!s) return;
    const version = readVersion(projectId) + 1;
    const snapshot = planToDnbosSnapshot(projectId, project, plan, version);
    s.setItem(SNAP_PREFIX + projectId, JSON.stringify(snapshot));
    writeVersion(projectId, version);
  } catch { /* localStorage full or unavailable — silent */ }
}
