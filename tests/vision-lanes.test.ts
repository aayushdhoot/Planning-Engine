// The fallback chain across models.
//
// A folder scan of 178 documents stopped at 37 because one model's daily allowance ran out and
// there was nowhere else to go — 141 files marked "the daily allowance is spent" with nothing to
// do but come back tomorrow. These pin the rule that replaces it, and the two halves of that
// rule that are easy to get backwards: which failures move to the next model, and which do not.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callVision, lanesFor, lanesFromEnv, resetSpentLanes, VisionExtractionError, type VisionInput } from '../src/services/extraction/vision-client';

const input: VisionInput = { fileName: 'a.jpeg', filePath: 'f/a.jpeg', imageBase64: 'x', mimeType: 'image/jpeg' };
const LANES = [
  { provider: 'gemini' as const, model: 'first', apiKey: 'k1', label: 'first' },
  { provider: 'gemini' as const, model: 'second', apiKey: 'k2', label: 'second' },
];
const cfg = { apiKey: 'k1', lanes: LANES };
const call = () => callVision(input, cfg, 'sys', 'usr', 100);

const geminiOk = (text: string) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] }), { status: 200 });
const fail = (status: number, body: string) => new Response(body, { status });

beforeEach(resetSpentLanes);
afterEach(() => vi.unstubAllGlobals());

describe('lanesFor', () => {
  it('falls back to the single configured model when no chain is given', () => {
    expect(lanesFor({ apiKey: 'k' })).toEqual([{ provider: 'gemini', model: 'gemini-3.6-flash', apiKey: 'k', baseUrl: undefined }]);
  });
});

describe('lanesFromEnv', () => {
  it('builds three Gemini allowances and then Groq', () => {
    const lanes = lanesFromEnv({ GEMINI_EXTRACTION_API_KEY: 'g', GROQ_API_KEY: 'q' });
    expect(lanes.map((l) => `${l.provider}:${l.model}`)).toEqual([
      'gemini:gemini-3.6-flash', 'gemini:gemini-3.1-flash-lite', 'gemini:gemini-3.5-flash', 'groq:qwen/qwen3.8-27b',
    ]);
  });

  it('leads with the fast model for photographs and the careful one for a BOQ', () => {
    const speed = lanesFromEnv({ GEMINI_EXTRACTION_API_KEY: 'g' }, 'speed');
    const quality = lanesFromEnv({ GEMINI_EXTRACTION_API_KEY: 'g' }, 'quality');
    expect(speed[0].model).toBe('gemini-3.1-flash-lite');
    expect(quality[0].model).toBe('gemini-3.6-flash');
    // same models either way — whichever leads, the other is still behind it
    expect([...speed.map((l) => l.model)].sort()).toEqual([...quality.map((l) => l.model)].sort());
  });

  it('does not list the same model twice when two settings name it', () => {
    const lanes = lanesFromEnv({
      GEMINI_EXTRACTION_API_KEY: 'g',
      GEMINI_EXTRACTION_MODEL: 'one', GEMINI_EXTRACTION_MODEL_FAST: 'one', GEMINI_EXTRACTION_MODEL_2: 'one',
    });
    expect(lanes).toHaveLength(1);
  });

  it('is empty rather than half-configured when no key is set', () => {
    expect(lanesFromEnv({})).toEqual([]);
  });
});

describe('callVision — what moves to the next model', () => {
  it('moves on when a model reports its daily allowance spent', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fail(429, JSON.stringify({ error: { message: 'quota exceeded: requests per day (RPD)' } })))
      .mockResolvedValueOnce(geminiOk('{"ok":1}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).resolves.toBe('{"ok":1}');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('moves on when a model is congested (5xx after its own retries)', async () => {
    // gemini-3.7-flash answered "currently experiencing high demand" on a plain probe while two
    // other models read the same page — that is the model's problem, not the document's.
    const fetchMock = vi.fn()
      .mockResolvedValue(geminiOk('{"ok":2}'))
      .mockResolvedValueOnce(fail(503, 'high demand'))
      .mockResolvedValueOnce(fail(503, 'high demand'))
      .mockResolvedValueOnce(fail(503, 'high demand'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).resolves.toBe('{"ok":2}');
  });

  it('moves on when a key is refused, and says so', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(fail(403, 'API key not valid'))
      .mockResolvedValueOnce(geminiOk('{"ok":3}'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).resolves.toBe('{"ok":3}');
  });

  it('does NOT spend the backup allowance on a per-minute limit', async () => {
    // A minute limit clears by waiting, and the caller's rate gate already holds the whole run
    // behind one timer. Burning the fallback on it spends tomorrow's headroom on a wall that was
    // about to come down anyway.
    // retryDelay is honoured, so it is named short here — the client really does sleep for it.
    const body = JSON.stringify({ error: { message: 'rate limit: requests per minute', details: [{ retryDelay: '0.01s' }] }, retryDelay: '0.01s' });
    const fetchMock = vi.fn(async (url: unknown) => { void url; return fail(429, body); });
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).rejects.toMatchObject({ rateLimit: 'minute' });
    // four calls: the first plus three retries, all on the FIRST lane. The second never runs.
    expect(fetchMock.mock.calls.every((c: unknown[]) => String(c[0]).includes('first'))).toBe(true);
  });

  it('reports the daily scope when every model is spent, so the batch stops', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fail(429, 'quota exceeded: requests per day')));
    const err = await call().catch((e) => e);
    expect(err).toBeInstanceOf(VisionExtractionError);
    expect((err as VisionExtractionError).rateLimit).toBe('day');
  });
});

describe('callVision — remembering a spent model', () => {
  it('does not walk the same wall again for the next file', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fail(429, 'quota exceeded: requests per day')));
    await call().catch(() => {});
    const second = vi.fn(async () => geminiOk('{"ok":4}'));
    vi.stubGlobal('fetch', second);
    // both lanes are remembered as spent, so the next file is refused without a request
    await expect(call()).rejects.toMatchObject({ rateLimit: 'day' });
    expect(second).not.toHaveBeenCalled();
  });

  it('forgets on reset, so a fresh run tries again', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fail(429, 'quota exceeded: requests per day')));
    await call().catch(() => {});
    resetSpentLanes();
    const again = vi.fn(async () => geminiOk('{"ok":5}'));
    vi.stubGlobal('fetch', again);
    await expect(call()).resolves.toBe('{"ok":5}');
  });
});

describe('callVision — the Groq lane speaks its own dialect', () => {
  it('reads the OpenAI-shaped response Groq returns', async () => {
    const groqCfg = { apiKey: 'q', lanes: [{ provider: 'groq' as const, model: 'qwen/qwen3.8-27b', apiKey: 'q', label: 'groq/qwen3.8-27b' }] };
    const fetchMock = vi.fn(async (url: unknown, init: unknown) => { void url; void init; return new Response(JSON.stringify({ choices: [{ message: { content: '{"ok":6}' } }] }), { status: 200 }); });
    vi.stubGlobal('fetch', fetchMock);
    await expect(callVision(input, groqCfg, 'sys', 'usr', 100)).resolves.toBe('{"ok":6}');
    const sent = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    const body = JSON.parse(sent[1].body);
    expect(body.messages[1].content[1].image_url.url).toBe('data:image/jpeg;base64,x');
  });

  it('names the model that failed, not "Gemini", so a chain failure is readable', async () => {
    const groqCfg = { apiKey: 'q', lanes: [{ provider: 'groq' as const, model: 'qwen/qwen3.8-27b', apiKey: 'q', label: 'groq/qwen3.8-27b' }] };
    vi.stubGlobal('fetch', vi.fn(async () => fail(400, 'bad image')));
    await expect(callVision(input, groqCfg, 'sys', 'usr', 100)).rejects.toThrow(/groq\/qwen3\.8-27b returned 400/);
  });
});
