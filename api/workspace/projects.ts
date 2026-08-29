// GET  /api/workspace/projects  -> { savedAt, normsVersion, projects, overrides }
// PUT  /api/workspace/projects  <- the same shape; writes it to disk
//
// Where a project made in this app actually lives.
//
// It lived nowhere. `extraProjects` in App.tsx was a plain useState([]), so every project
// created through the intake screen survived exactly as long as the tab did — two of them were
// set up, planned, pushed to the tracking engine, and then vanished from the dashboard on the
// next reload with no trace left behind but the rendered modules in the tracking store.
//
// The obvious fix is localStorage and it is the wrong one. eslint.config.js bans it repo-wide so
// that nothing hidden can influence a plan (T1-DETERMINISM), and services/settings-store.ts
// spells out the exception and its limit: connection settings only, "plan inputs belong in the
// workspace JSON (PersistenceService), where they are explicit and portable." A project IS plan
// input. So this is that workspace JSON — a real file, on disk, that a person can open, diff,
// copy to another machine or delete. The only thing being automated is the save and the load;
// FilePersistence already wrote the same shape, it just made the user download it by hand.
//
// runtime: 'nodejs', not 'edge', and deliberately: this needs a filesystem. Both halves of this
// product already run as local servers — the tracking engine keeps its own store the same way
// (tracking/engines/skf/sync/) — so a route that only works where there is a disk is honest
// about how the thing is actually run, rather than failing silently on a platform it never meets.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const config = { runtime: 'nodejs' };

/** Beside the app, not inside src/ — it is data this machine owns, not source. */
const FILE = join(process.cwd(), 'workspace', 'projects.json');

interface Workspace {
  savedAt: string;
  normsVersion: string;
  /** projects created in this app */
  projects: unknown[];
  /** edits made to the built-in seed projects, keyed by project id */
  overrides: Record<string, unknown>;
}

const EMPTY: Workspace = { savedAt: '', normsVersion: '', projects: [], overrides: {} };

async function read(): Promise<Workspace> {
  try {
    const raw = await readFile(FILE, 'utf8');
    const w = JSON.parse(raw) as Partial<Workspace>;
    // Shape-checked rather than trusted: a half-written or hand-edited file should cost the
    // dashboard its saved projects, not throw on load and leave the app blank.
    return {
      savedAt: typeof w.savedAt === 'string' ? w.savedAt : '',
      normsVersion: typeof w.normsVersion === 'string' ? w.normsVersion : '',
      projects: Array.isArray(w.projects) ? w.projects : [],
      overrides: w.overrides && typeof w.overrides === 'object' ? (w.overrides as Record<string, unknown>) : {},
    };
  } catch {
    return EMPTY; // no file yet, or it is unreadable — an empty workspace either way
  }
}

export default async function handler(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (req.method === 'GET') return json(await read());

  if (req.method === 'PUT' || req.method === 'POST') {
    let body: Partial<Workspace>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (!Array.isArray(body.projects)) return json({ error: 'projects[] is required' }, 400);

    const next: Workspace = {
      savedAt: new Date().toISOString(),
      normsVersion: typeof body.normsVersion === 'string' ? body.normsVersion : '',
      projects: body.projects,
      overrides: body.overrides && typeof body.overrides === 'object' ? body.overrides : {},
    };
    try {
      await mkdir(dirname(FILE), { recursive: true });
      // Written whole, with the newline a JSON file should end with, so the thing on disk stays
      // something a person can read and a diff can show.
      await writeFile(FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    } catch (err) {
      return json({ error: `Could not write the workspace file: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
    return json({ ok: true, savedAt: next.savedAt, count: next.projects.length });
  }

  return json({ error: 'Method not allowed' }, 405);
}
