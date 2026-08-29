// Where a project made in this app lives.
//
// It lived nowhere: `extraProjects` was a plain useState([]), so two projects that were set up,
// planned and pushed to the tracking engine were gone from the dashboard on the next reload.
// Only the rendered modules survived, in the other engine's store — the inputs were unrecoverable.
//
// These tests pin the two ways a fix like this goes wrong quietly. Both are about a failure
// being mistaken for an emptiness.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadWorkspace, saveWorkspace } from '../src/services/workspace-store';

const SPA = '<!doctype html><html><body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body></html>';
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

afterEach(() => vi.unstubAllGlobals());

describe('loadWorkspace', () => {
  it('returns what the store holds', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      ok({ savedAt: '2026-08-29T06:00:00.000Z', normsVersion: 'norms-v1', projects: [{ id: 'keppel-pune' }], overrides: { skf: { id: 'skf' } } }),
    ));
    const { workspace, error } = await loadWorkspace();
    expect(error).toBeNull();
    expect(workspace!.projects).toHaveLength(1);
    expect(workspace!.overrides.skf).toBeDefined();
  });

  it('reports an unreachable store rather than returning an empty one', async () => {
    // The whole point. An empty workspace and an unreachable one look identical on the
    // dashboard, and "I have not made anything yet" is the reading a person takes — which is how
    // silently losing every project would go unnoticed.
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    const { workspace, error } = await loadWorkspace();
    expect(workspace).toBeNull();
    expect(error).toMatch(/Could not reach the workspace store/);
  });

  it('recognises Vite answering an unknown path with the app itself', async () => {
    // A missing route is a 200 with the SPA shell in it, not a 404, so the body decides.
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SPA, { status: 200 })));
    const { workspace, error } = await loadWorkspace();
    expect(workspace).toBeNull();
    expect(error).toMatch(/not being served/);
  });

  it('does not throw on a half-written or hand-edited file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"projects": [', { status: 200 })));
    const { workspace, error } = await loadWorkspace();
    expect(workspace).toBeNull();
    expect(error).toMatch(/could not be parsed/);
  });

  it('fills in anything the file is missing rather than handing back undefined', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ok({})));
    const { workspace, error } = await loadWorkspace();
    expect(error).toBeNull();
    expect(workspace).toEqual({ savedAt: '', normsVersion: '', projects: [], overrides: {} });
  });
});

describe('saveWorkspace', () => {
  it('sends the workspace and reports success as null', async () => {
    const fetchMock = vi.fn(async () => ok({ ok: true, savedAt: 'x', count: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const err = await saveWorkspace({ normsVersion: 'norms-v1', projects: [{ id: 'a' }] as never, overrides: {} });
    expect(err).toBeNull();
    const sent = fetchMock.mock.calls[0] as unknown as [string, { method: string; body: string }];
    expect(sent[1].method).toBe('PUT');
    expect(JSON.parse(sent[1].body).projects).toHaveLength(1);
  });

  it('never lets a failed save look like a successful one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ error: 'disk full' }), { status: 500 })));
    expect(await saveWorkspace({ normsVersion: 'v', projects: [], overrides: {} })).toBe('disk full');
  });

  it('says so when nothing is serving the route, instead of silently discarding the project', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(SPA, { status: 200 })));
    expect(await saveWorkspace({ normsVersion: 'v', projects: [], overrides: {} })).toMatch(/was not saved/);
  });

  it('reports a store it could not reach at all', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch'); }));
    expect(await saveWorkspace({ normsVersion: 'v', projects: [], overrides: {} })).toMatch(/Could not reach/);
  });
});
