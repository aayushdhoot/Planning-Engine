// Loading and saving the AI Assistant's conversations.
//
// The counterpart to api/workspace/chats.ts, and the same shape as workspace-store.ts on
// purpose: the two stores fail in the same ways, so they should be read and reported the same
// way. A failed load is a FAILURE, not an empty history — an assistant that quietly shows no
// past threads because the server was unreachable looks exactly like one with nothing to show,
// and the second is the reading a person takes because it is the ordinary one.
import type { ChatState } from '../ui/Assistant';

/** One thread, belonging to one project. */
export interface Conversation {
  id: string;
  projectId: string;
  /** taken from the first thing asked, so the list reads as what was discussed */
  title: string;
  createdAt: string;
  updatedAt: string;
  state: ChatState;
}

export interface StoredChats {
  savedAt: string;
  conversations: Conversation[];
}

export interface ChatLoadResult {
  chats: StoredChats | null;
  /** null when the load succeeded; the reason when it did not */
  error: string | null;
}

const URL_PATH = '/api/workspace/chats';

/** True when a response is Vite's SPA shell — i.e. nothing is serving that path. */
function isSpaShell(text: string): boolean {
  return text.includes('<div id="root">') || text.includes('/src/main.tsx');
}

/** Keep only what this app wrote — a hand-edited file should not crash the tab. */
function clean(rows: unknown[]): Conversation[] {
  const out: Conversation[] = [];
  for (const r of rows) {
    if (!r || typeof r !== 'object') continue;
    const c = r as Partial<Conversation>;
    if (typeof c.id !== 'string' || typeof c.projectId !== 'string') continue;
    const turns = Array.isArray(c.state?.turns) ? c.state!.turns : [];
    out.push({
      id: c.id,
      projectId: c.projectId,
      title: typeof c.title === 'string' && c.title ? c.title : 'Untitled',
      createdAt: typeof c.createdAt === 'string' ? c.createdAt : '',
      updatedAt: typeof c.updatedAt === 'string' ? c.updatedAt : '',
      state: { turns, pendingOriginal: c.state?.pendingOriginal ?? null },
    });
  }
  return out;
}

export async function loadChats(): Promise<ChatLoadResult> {
  let res: Response;
  try {
    res = await fetch(URL_PATH);
  } catch (err) {
    return { chats: null, error: `Could not reach the chat store (${err instanceof Error ? err.message : String(err)}).` };
  }

  const text = await res.text();
  // Vite answers an unknown path with the app itself rather than a 404, so "route missing" is
  // established from the body, the same way the workspace store establishes it.
  if (isSpaShell(text))
    return { chats: null, error: 'The chat store is not being served — conversations will not survive a reload. Run the app through `npm run dev`.' };
  if (!res.ok) return { chats: null, error: `The chat store answered ${res.status}.` };

  try {
    const f = JSON.parse(text) as Partial<StoredChats>;
    return {
      chats: { savedAt: f.savedAt ?? '', conversations: clean(Array.isArray(f.conversations) ? f.conversations : []) },
      error: null,
    };
  } catch {
    return { chats: null, error: 'The chat file could not be parsed.' };
  }
}

/** Returns null on success, or the reason it did not save. */
export async function saveChats(conversations: Conversation[]): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(URL_PATH, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversations }),
    });
  } catch (err) {
    return `Could not reach the chat store (${err instanceof Error ? err.message : String(err)}).`;
  }
  const text = await res.text();
  if (isSpaShell(text)) return 'The chat store is not being served, so this conversation was not saved. Run the app through `npm run dev`.';
  if (!res.ok) {
    try {
      return (JSON.parse(text) as { error?: string }).error ?? `The chat store answered ${res.status}.`;
    } catch {
      return `The chat store answered ${res.status}.`;
    }
  }
  return null;
}

/**
 * A thread's name, taken from the first thing asked in it.
 *
 * Titles are derived rather than prompted for. Nobody names a conversation before
 * having it, and an untitled list is unreadable the moment it has more than three
 * rows in it.
 */
export function titleFrom(text: string): string {
  const t = text.trim().replace(/\s+/g, ' ');
  if (!t) return 'New chat';
  return t.length <= 48 ? t : `${t.slice(0, 47)}…`;
}
