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

const CLIENT_ID_KEY = 'dnb.driveClientId';

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
