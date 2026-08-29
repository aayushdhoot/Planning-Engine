// The document-reading path: how many requests run at once, what happens when the provider
// refuses, and what the engine is allowed to claim afterwards.
//
// The behaviour under test is mostly about honesty under failure. A folder read that reports
// "nothing usable was found" for 129 photographs the model never actually saw is worse than one
// that reports nothing at all, because the number on the coverage screen then says the engine
// looked when it did not.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mapPool } from '../src/services/extraction/pool';
import { pagePlan, scaleFor, PDF_MAX_PAGES } from '../src/services/extraction/rasterize';
import { parseRetryWaitMs, rateLimitScopeOf } from '../src/services/extraction/vision-client';
import { extractProjectDocuments, type SourceFile } from '../src/services/extraction/extraction-service';

describe('mapPool', () => {
  it('returns results index-aligned with the input, whatever order they finish in', async () => {
    const out = await mapPool([30, 10, 20], async (ms) => {
      await new Promise((r) => setTimeout(r, ms / 10));
      return ms;
    }, { concurrency: 3 });
    // `attempts` rides on every settled result now — a file that only came back on its third
    // try is worth knowing about when a scan is explained afterwards.
    expect(out).toEqual([
      { status: 'done', value: 30, attempts: 1 },
      { status: 'done', value: 10, attempts: 1 },
      { status: 'done', value: 20, attempts: 1 },
    ]);
  });

  it('puts a retryable failure back on the queue instead of abandoning it', async () => {
    // The behaviour a folder scan needs: a file refused on a rate limit has not failed, it has
    // been told to come back. It used to be recorded as failed and never tried again, which is
    // how a scan finished with most of the folder still unread.
    let tries = 0;
    const out = await mapPool([1], async () => {
      tries++;
      if (tries < 3) throw new Error('429 rate limit');
      return 'read';
    }, {
      concurrency: 1,
      retryAfter: (err) => (String((err as Error).message).includes('429') ? 0 : null),
    });
    expect(tries).toBe(3);
    expect(out[0]).toEqual({ status: 'done', value: 'read', attempts: 3 });
  });

  it('stops retrying at maxAttempts rather than looping for ever', async () => {
    let tries = 0;
    const out = await mapPool([1], async () => { tries++; throw new Error('429 rate limit'); }, {
      concurrency: 1, maxAttempts: 3, retryAfter: () => 0,
    });
    expect(tries).toBe(3);
    expect(out[0].status).toBe('failed');
  });

  it('accepts a non-retryable failure first time, without burning attempts on it', async () => {
    // an unreadable file fails identically however many times it is tried
    let tries = 0;
    const out = await mapPool([1], async () => { tries++; throw new Error('corrupt file'); }, {
      concurrency: 1,
      retryAfter: (err) => (String((err as Error).message).includes('429') ? 0 : null),
    });
    expect(tries).toBe(1);
    expect(out[0].status).toBe('failed');
  });

  it('never exceeds its concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    await mapPool(Array.from({ length: 20 }, (_, i) => i), async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((r) => setTimeout(r, 1));
      inFlight--;
    }, { concurrency: 4 });
    expect(peak).toBe(4);
  });

  it('abandons the queue when told to stop, and says which items were skipped', async () => {
    let stop = false;
    const seen: number[] = [];
    const out = await mapPool(Array.from({ length: 10 }, (_, i) => i), async (n) => {
      seen.push(n);
      if (n >= 1) stop = true;
      return n;
    }, { concurrency: 1, shouldStop: () => stop });
    expect(seen).toEqual([0, 1]);
    expect(out.filter((r) => r.status === 'skipped')).toHaveLength(8);
  });

  it('reports a thrown task as failed rather than rejecting the whole batch', async () => {
    const out = await mapPool([1, 2], async (n) => {
      if (n === 1) throw new Error('boom');
      return n;
    }, { concurrency: 2 });
    expect(out[0].status).toBe('failed');
    expect(out[1]).toEqual({ status: 'done', value: 2, attempts: 1 });
  });
});

describe('rate limits', () => {
  it('tells a daily cap apart from a per-minute one', () => {
    // the two need opposite handling: one clears while you wait, the other does not
    expect(rateLimitScopeOf('Rate limit reached … service tier `on_demand` on tokens per day (TPD): Limit 200000')).toBe('day');
    expect(rateLimitScopeOf('Rate limit reached for model … tokens per minute (TPM)')).toBe('minute');
    expect(rateLimitScopeOf('invalid_request_error: bad image')).toBeNull();
  });

  it("reads Groq's own suggested wait, including the minutes form", () => {
    expect(parseRetryWaitMs('Please try again in 9.15s.')).toBe(9650);
    // the seconds-only pattern missed this entirely and retried against a 22-minute wall
    expect(parseRetryWaitMs('Please try again in 22m23.52s.')).toBe(1_343_520 + 500);
    expect(parseRetryWaitMs('Please try again in 1h2m3s.')).toBe(3_723_000 + 500);
    expect(parseRetryWaitMs('no figure here')).toBeNull();
  });
});

describe('page rendering decisions', () => {
  it('never upscales, and fits the longest edge', () => {
    expect(scaleFor(4032, 3024, 1024)).toBeCloseTo(1024 / 4032);
    expect(scaleFor(3024, 4032, 1024)).toBeCloseTo(1024 / 4032);
    expect(scaleFor(800, 600, 1024)).toBe(1);
    expect(scaleFor(0, 0, 1024)).toBe(1);
  });

  it('caps a long PDF and says so, rather than reading it silently or dropping it silently', () => {
    expect(pagePlan(3).pages).toEqual([1, 2, 3]);
    expect(pagePlan(3).note).toBeNull();
    const big = pagePlan(60);
    expect(big.pages).toHaveLength(PDF_MAX_PAGES);
    expect(big.note).toContain('60 pages');
  });
});

// ------------------------------------------------------------ extraction service

const okBody = (payload: unknown) =>
  new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }), { status: 200 });
const TPD_BODY =
  '{"error":{"message":"Rate limit reached for model `qwen/qwen3.6-27b` in organization `org_x` service tier `on_demand` on tokens per day (TPD): Limit 200000, Used 199695, Requested 3415. Please try again in 22m23.52s."}}';

const page = (label: string) => ({ imageBase64: 'AAAA', mimeType: 'image/jpeg' as const, pageLabel: label });
const file = (fileName: string, labels: string[]): SourceFile => ({ fileName, filePath: `p/${fileName}`, pages: labels.map(page) });

afterEach(() => vi.unstubAllGlobals());

describe('extractProjectDocuments', () => {
  it('merges every page of every file, in input order', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      okBody({ kind: 'site_image', siteConditions: [{ trade: 'civil', status: 'in_progress', note: 'shell floor, no partitions' }] }),
    ));
    const patch = await extractProjectDocuments([file('a.jpeg', ['image']), file('b.pdf', ['page 1 of 2', 'page 2 of 2'])], { apiKey: 'k' });
    expect(patch.siteConditions).toHaveLength(3);
    expect(patch.siteConditions[0].source).toContain('a.jpeg (image)');
    expect(patch.siteConditions[2].source).toContain('b.pdf (page 2 of 2)');
    expect(patch.failures).toEqual([]);
    expect(patch.emptyFiles).toEqual([]);
  });

  it('stops the batch on a daily rate limit instead of failing every remaining page against it', async () => {
    const fetchMock = vi.fn(async () => new Response(TPD_BODY, { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);

    const files = Array.from({ length: 12 }, (_, i) => file(`photo-${i}.jpeg`, ['image']));
    const patch = await extractProjectDocuments(files, { apiKey: 'k' }, { concurrency: 2 });

    // every page is accounted for, and the ones never attempted say so
    expect(patch.failures).toHaveLength(12);
    expect(patch.failures.filter((f) => f.skipped)).not.toHaveLength(0);
    expect(patch.failures.every((f) => f.rateLimit === 'day')).toBe(true);
    // the whole point: the provider was not asked 12 times for an answer it had already refused
    expect(fetchMock.mock.calls.length).toBeLessThan(12);
  });

  it('does not call a file empty when it was the read that failed, not the document', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":{"message":"bad image"}}', { status: 500 })));
    const patch = await extractProjectDocuments([file('drawing.pdf', ['page 1 of 1'])], { apiKey: 'k' });
    expect(patch.emptyFiles).toEqual([]);
    expect(patch.failures[0].fileName).toBe('drawing.pdf');
    expect(patch.failures[0].rateLimit).toBeNull();
  });

  it('still reports a genuinely empty read as empty', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => okBody({ kind: 'site_image', siteConditions: [] })));
    const patch = await extractProjectDocuments([file('blank.jpeg', ['image'])], { apiKey: 'k' });
    expect(patch.emptyFiles).toEqual(['blank.jpeg']);
    expect(patch.failures).toEqual([]);
  });
});
