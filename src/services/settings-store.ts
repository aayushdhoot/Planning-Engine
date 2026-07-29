// The one place browser storage is permitted, and only for connection settings.
//
// eslint.config.js bans localStorage project-wide, next to the ban on Math.random, so that
// nothing hidden can influence a plan: every number in the output must trace to an input, a
// norm or a computation, and two runs over the same inputs must be byte-identical
// (T1-DETERMINISM). A Google OAuth *client ID* is none of those things — it is how the app
// reaches Drive, it never reaches the engine, and no planned value depends on it. That is why
// this file carries a scoped exception and the rest of the codebase does not.
//
// Do not widen this to anything the planner reads. Plan inputs belong in the workspace JSON
// (PersistenceService), where they are explicit and portable.
//
// The org directory is kept here too. It is staffing metadata — who is on which project, what
// state a project is in — and the planner never reads any of it, so it is inside the rule
// above. It stays on this machine and is deliberately never committed: the master list is
// personal data and this repository is public.

const CLIENT_ID_KEY = 'dnb.driveClientId';
const ORG_KEY = 'dnb.org';

/** localStorage is absent when server-rendering (render tests) and throws in some privacy modes. */
function storage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/**
 * The Google OAuth client ID, if one was saved. A client ID is a public identifier, not a
 * secret — Google embeds it in the browser redirect — so keeping it here leaks nothing.
 */
export function readDriveClientId(): string {
  try {
    return storage()?.getItem(CLIENT_ID_KEY) ?? '';
  } catch {
    return '';
  }
}

export function writeDriveClientId(value: string): void {
  try {
    storage()?.setItem(CLIENT_ID_KEY, value.trim());
  } catch {
    // storage disabled — the ID simply will not survive a reload
  }
}

/** The org directory and project assignments. Local to this machine; never committed. */
export function readOrg<T>(fallback: T): T {
  try {
    const raw = storage()?.getItem(ORG_KEY);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeOrg(value: unknown): void {
  try {
    storage()?.setItem(ORG_KEY, JSON.stringify(value));
  } catch {
    // storage full or disabled — the directory just will not survive a reload
  }
}
