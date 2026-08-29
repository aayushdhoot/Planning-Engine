// GET  /api/workspace/chats  -> { savedAt, conversations }
// PUT  /api/workspace/chats  <- the same shape; writes it to disk
//
// Where the AI Assistant's conversations live.
//
// They lived in a useState keyed by project id, which meant a thread survived switching tabs and
// nothing else: every question asked and every replan reviewed was gone on reload, with no trace
// that it had ever been asked. That is a poor bargain for the one part of the app a person
// talks to — the reason to look back at a thread is usually to see what was decided and why.
//
// A file on disk, for the same reason projects are one (api/workspace/projects.ts spells it out
// at length): localStorage is banned repo-wide so nothing hidden can influence a plan, and a
// conversation here can END IN AN APPROVED REPLAN — a constraint that moves real dates. That
// makes a thread part of the audit trail of how a programme got its shape, and audit trails
// belong in a file a person can open, diff, copy to another machine, or delete.
//
// runtime: 'nodejs', not 'edge', and deliberately: this needs a filesystem.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export const config = { runtime: 'nodejs' };

/** Beside the app, next to projects.json — data this machine owns, not source. */
const FILE = join(process.cwd(), 'workspace', 'chats.json');

interface ChatFile {
  savedAt: string;
  /** every conversation, for every project; each carries the project it belongs to */
  conversations: unknown[];
}

const EMPTY: ChatFile = { savedAt: '', conversations: [] };

async function read(): Promise<ChatFile> {
  try {
    const raw = await readFile(FILE, 'utf8');
    const f = JSON.parse(raw) as Partial<ChatFile>;
    // Shape-checked rather than trusted: a half-written or hand-edited file should cost the
    // assistant its history, not throw on load and leave the tab blank.
    return {
      savedAt: typeof f.savedAt === 'string' ? f.savedAt : '',
      conversations: Array.isArray(f.conversations) ? f.conversations : [],
    };
  } catch {
    return EMPTY; // no file yet, or unreadable — no history either way
  }
}

export default async function handler(req: Request): Promise<Response> {
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  if (req.method === 'GET') return json(await read());

  if (req.method === 'PUT' || req.method === 'POST') {
    let body: Partial<ChatFile>;
    try {
      body = await req.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400);
    }
    if (!Array.isArray(body.conversations)) return json({ error: 'conversations[] is required' }, 400);

    const next: ChatFile = { savedAt: new Date().toISOString(), conversations: body.conversations };
    try {
      await mkdir(dirname(FILE), { recursive: true });
      await writeFile(FILE, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    } catch (err) {
      return json({ error: `Could not write the chat file: ${err instanceof Error ? err.message : String(err)}` }, 500);
    }
    return json({ ok: true, savedAt: next.savedAt, count: next.conversations.length });
  }

  return json({ error: 'Method not allowed' }, 405);
}
