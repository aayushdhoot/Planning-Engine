// Loading and saving the projects this app has made.
//
// The counterpart to api/workspace/projects.ts, which explains why the store is a file on disk
// and not localStorage. This half only has to do one thing well: never let a save failure look
// like a successful save, and never let a load failure look like an empty workspace.
//
// That distinction is the whole reason this file has more in it than two fetch calls. A
// dashboard that shows nothing because the server was unreachable looks exactly like a dashboard
// that shows nothing because no projects exist — and the second is the reading a person takes,
// because it is the ordinary one. So a failed load is reported as a failure, and the caller
// keeps whatever it already had rather than replacing it with emptiness.
import type { ProjectInputs } from '../domain/types';

export interface StoredWorkspace {
  savedAt: string;
  normsVersion: string;
  projects: ProjectInputs[];
  overrides: Record<string, ProjectInputs>;
}

export interface LoadResult {
  workspace: StoredWorkspace | null;
  /** null when the load succeeded; the reason when it did not */
  error: string | null;
}

const URL_PATH = '/api/workspace/projects';

/** True when a response is Vite's SPA shell — i.e. nothing is serving that path. */
function isSpaShell(text: string): boolean {
  return text.includes('<div id="root">') || text.includes('/src/main.tsx');
}

export async function loadWorkspace(): Promise<LoadResult> {
  let res: Response;
  try {
    res = await fetch(URL_PATH);
  } catch (err) {
    return { workspace: null, error: `Could not reach the workspace store (${err instanceof Error ? err.message : String(err)}).` };
  }

  const text = await res.text();
  // Vite answers an unknown path with the app itself rather than a 404, so "route missing" is
  // established from the body, the same way the Drive services establish it.
  if (isSpaShell(text))
    return { workspace: null, error: 'The workspace store is not being served — projects made here will not survive a reload. Run the app through `npm run dev`.' };
  if (!res.ok) return { workspace: null, error: `The workspace store answered ${res.status}.` };

  try {
    const w = JSON.parse(text) as StoredWorkspace;
    return {
      workspace: {
        savedAt: w.savedAt ?? '',
        normsVersion: w.normsVersion ?? '',
        projects: Array.isArray(w.projects) ? w.projects : [],
        overrides: w.overrides && typeof w.overrides === 'object' ? w.overrides : {},
      },
      error: null,
    };
  } catch {
    return { workspace: null, error: 'The workspace file could not be parsed.' };
  }
}

/** Returns null on success, or the reason it did not save. */
export async function saveWorkspace(w: Omit<StoredWorkspace, 'savedAt'>): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(URL_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(w),
    });
  } catch (err) {
    return `Could not reach the workspace store (${err instanceof Error ? err.message : String(err)}).`;
  }
  const text = await res.text();
  if (isSpaShell(text)) return 'The workspace store is not being served, so this project was not saved. Run the app through `npm run dev`.';
  if (!res.ok) {
    try {
      return (JSON.parse(text) as { error?: string }).error ?? `The workspace store answered ${res.status}.`;
    } catch {
      return `The workspace store answered ${res.status}.`;
    }
  }
  return null;
}
