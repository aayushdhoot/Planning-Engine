// Where the assistant's conversations live.
//
// They lived in a useState keyed by project: one thread per project, gone on reload. A thread
// can end in an APPROVED REPLAN — a constraint that moves real dates — so losing it loses the
// reasoning behind a date change. These tests pin the ways that goes wrong quietly: a failure
// mistaken for an empty history, and a hand-edited file taking the tab down with it.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadChats, saveChats, titleFrom } from '../src/services/chat-store';

const SPA = '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
const conv = (over: Record<string, unknown> = {}) => ({
  id: 'c1', projectId: 'skf-pune', title: 'Flooring delay', createdAt: '2026-08-29T06:00:00.000Z',
  updatedAt: '2026-08-29T06:10:00.000Z', state: { turns: [{ id: 't1', role: 'user', text: 'hi' }], pendingOriginal: null },
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe('loadChats', () => {
  it('returns the conversations the store holds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ savedAt: 'x', conversations: [conv()] })));
    const { chats, error } = await loadChats();
    expect(error).toBeNull();
    expect(chats!.conversations).toHaveLength(1);
    expect(chats!.conversations[0].state.turns).toHaveLength(1);
  });

  it('reports a missing route as a FAILURE, not as an empty history', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SPA, { status: 200 })));
    const { chats, error } = await loadChats();
    expect(chats).toBeNull();
    expect(error).toContain('not being served');
  });

  it('reports an unreachable store rather than answering "no chats"', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const { chats, error } = await loadChats();
    expect(chats).toBeNull();
    expect(error).toContain('Could not reach');
  });

  it('drops rows it cannot make sense of instead of throwing on load', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ conversations: [conv(), { nope: true }, null, conv({ id: 'c2' })] })));
    const { chats, error } = await loadChats();
    expect(error).toBeNull();
    expect(chats!.conversations.map((c) => c.id)).toEqual(['c1', 'c2']);
  });

  it('survives a conversation with no turns array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ conversations: [conv({ state: {} })] })));
    const { chats } = await loadChats();
    expect(chats!.conversations[0].state.turns).toEqual([]);
  });
});

describe('saveChats', () => {
  it('returns null when the write lands', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({ ok: true })));
    expect(await saveChats([conv()] as never)).toBeNull();
  });

  it('says the thread was NOT saved when nothing is serving the route', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SPA, { status: 200 })));
    const err = await saveChats([conv()] as never);
    expect(err).toContain('not saved');
  });

  it('passes the server own reason through', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'disk full' }), { status: 500 })));
    expect(await saveChats([])).toBe('disk full');
  });
});

describe('titleFrom — a thread is named by what was asked in it', () => {
  it('uses the question', () => expect(titleFrom('  flooring is   delayed by 10 days ')).toBe('flooring is delayed by 10 days'));
  it('truncates a long one rather than breaking the list', () => {
    const t = titleFrom('x'.repeat(200));
    expect(t).toHaveLength(48);
    expect(t.endsWith('…')).toBe(true);
  });
  it('falls back when there is nothing to name it after', () => expect(titleFrom('   ')).toBe('New chat'));
});
