// A bounded-concurrency map with retry. Reading a folder of 130 site photos one request at a
// time is the single biggest reason the intake step took as long as it did — each call is a
// whole network round trip to a vision model, and nothing about them is ordered. Running a few
// at once turns minutes into a fraction of that; running *all* of them at once just trips the
// provider's per-minute rate limit, which is why this is a pool and not Promise.all.
//
// Results come back index-aligned with the input, whatever order the work finished in, so
// callers can still merge deterministically.
//
// RETRY BELONGS IN THE POOL, NOT IN THE CALLER.
//   A task refused on a rate limit has not failed — it has been told to come back. The earlier
//   version recorded it as `failed` and moved on, which is how a scan ended with seventy-nine
//   readable files marked "not read" and a person pressing Read again and again to collect a
//   few more each time. A retryable failure now goes back on the queue behind the work that has
//   not been tried yet, so one run finishes the folder instead of the first stretch of it.

export interface PoolProgress {
  done: number;
  total: number;
  /** currently in flight */
  running: number;
  /** refused and waiting to come round again */
  requeued: number;
  /** ms remaining, from measured throughput; null until there is enough to measure */
  etaMs: number | null;
}

export interface PoolOptions<T = unknown> {
  /** how many tasks may be in flight at once */
  concurrency: number;
  /** called after each task settles — for progress reporting */
  onSettled?: (done: number, total: number) => void;
  /** richer progress, including an ETA */
  onProgress?: (p: PoolProgress) => void;
  /** consulted before each task starts; returning true abandons the rest of the queue.
   * Used for "the daily token allowance is spent" and for the user pressing Stop — both cases
   * where the remaining 100 requests are known to be pointless. */
  shouldStop?: () => boolean;
  /**
   * Should this failure be tried again, and after how long in ms?
   * Return null to accept the failure. `attemptsMade` counts the one that just failed.
   */
  retryAfter?: (error: unknown, attemptsMade: number, item: T) => number | null;
  /** hard ceiling on attempts per item, whatever retryAfter says */
  maxAttempts?: number;
}

export type PoolResult<R> =
  | { status: 'done'; value: R; attempts: number }
  | { status: 'failed'; error: unknown; attempts: number }
  | { status: 'skipped' };

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function mapPool<T, R>(
  items: T[],
  task: (item: T, index: number) => Promise<R>,
  opts: PoolOptions<T>,
): Promise<PoolResult<R>[]> {
  const results = new Array<PoolResult<R>>(items.length).fill({ status: 'skipped' });
  const limit = Math.max(1, Math.min(opts.concurrency, items.length || 1));
  const maxAttempts = opts.maxAttempts ?? 6;

  // the queue holds indices, so a refused item can be pushed back onto it
  const queue: number[] = items.map((_, i) => i);
  const attempts = new Array<number>(items.length).fill(0);
  let done = 0;
  let running = 0;
  let requeued = 0;
  const started = Date.now();

  const report = () => {
    // ETA from measured throughput rather than a guessed per-item cost: the real pace varies a
    // lot across a run, because the rate gate slows down when refused and speeds up when not.
    const elapsed = Date.now() - started;
    const etaMs = done >= 3 && done < items.length
      ? Math.round((elapsed / done) * (items.length - done))
      : null;
    opts.onProgress?.({ done, total: items.length, running, requeued, etaMs });
  };

  const worker = async () => {
    for (;;) {
      const i = queue.shift();
      if (i === undefined) return;
      if (opts.shouldStop?.()) continue;   // leave whatever it already was on the result
      running++;
      report();
      try {
        const value = await task(items[i], i);
        attempts[i]++;
        results[i] = { status: 'done', value, attempts: attempts[i] };
        running--;
        opts.onSettled?.(++done, items.length);
        report();
      } catch (error) {
        attempts[i]++;
        running--;
        const wait = attempts[i] < maxAttempts
          ? opts.retryAfter?.(error, attempts[i], items[i]) ?? null
          : null;
        // recorded either way, so a run that is stopped mid-retry still says what went wrong
        results[i] = { status: 'failed', error, attempts: attempts[i] };
        if (wait === null) {
          opts.onSettled?.(++done, items.length);
          report();
          continue;
        }
        // Back of the queue, not the front: everything untried deserves its turn first, and by
        // the time this comes round again the pause it is waiting on has usually elapsed.
        queue.push(i);
        requeued++;
        report();
        if (wait > 0) await sleep(wait);
        requeued--;
      }
    }
  };

  report();
  await Promise.all(Array.from({ length: limit }, worker));
  report();
  return results;
}
