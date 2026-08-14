// A bounded-concurrency map. Reading a folder of 130 site photos one request at a time is the
// single biggest reason the intake step took as long as it did — each call is a whole network
// round trip to a vision model, and nothing about them is ordered. Running a few at once turns
// minutes into a fraction of that; running *all* of them at once just trips the provider's
// per-minute rate limit, which is why this is a pool and not Promise.all.
//
// Results come back index-aligned with the input, whatever order the work finished in, so
// callers can still merge deterministically.

export interface PoolOptions {
  /** how many tasks may be in flight at once */
  concurrency: number;
  /** called after each task settles — for progress reporting */
  onSettled?: (done: number, total: number) => void;
  /** consulted before each task starts; returning true abandons the rest of the queue.
   * Used for "the daily token allowance is spent" and for the user pressing Stop — both cases
   * where the remaining 100 requests are known to be pointless. */
  shouldStop?: () => boolean;
}

export type PoolResult<R> = { status: 'done'; value: R } | { status: 'failed'; error: unknown } | { status: 'skipped' };

export async function mapPool<T, R>(items: T[], task: (item: T, index: number) => Promise<R>, opts: PoolOptions): Promise<PoolResult<R>[]> {
  const results = new Array<PoolResult<R>>(items.length).fill({ status: 'skipped' });
  const limit = Math.max(1, Math.min(opts.concurrency, items.length));
  let next = 0;
  let done = 0;

  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      if (opts.shouldStop?.()) {
        results[i] = { status: 'skipped' };
        continue;
      }
      try {
        results[i] = { status: 'done', value: await task(items[i], i) };
      } catch (error) {
        results[i] = { status: 'failed', error };
      }
      opts.onSettled?.(++done, items.length);
    }
  };

  await Promise.all(Array.from({ length: limit }, worker));
  return results;
}
