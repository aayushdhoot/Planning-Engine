// One shared pace for every vision read in flight.
//
// THE PROBLEM THIS EXISTS FOR
//   A folder scan fired four file-reads at once, each of which fanned out to up
//   to four page-reads inside its own server call — sixteen requests at Gemini
//   with nothing coordinating them. The free tier allows about fifteen requests
//   a MINUTE, so the burst tripped the limit within seconds.
//
//   What made it unrecoverable was the retry. Each call retried on its own, three
//   times, with no knowledge of the others: when the limit was hit every one of
//   the sixteen woke at the same moment, retried together, and tripped it again.
//   After three rounds of that they gave up and the file was marked "not read"
//   permanently. That is why a scan left seventy-nine readable files unread and
//   why running it again read a few more each time — each pass got a handful
//   through before tripping the wall again.
//
// WHAT IT DOES
//   . paces requests to a target rate, so the limit is usually not reached at all
//   . on a 429, pauses EVERY waiter until the moment the provider named, rather
//     than letting each retry independently
//   . halves the rate when refused and recovers it slowly on success, so it
//     finds the ceiling instead of being told it in advance
//
// It is deliberately client-side. The server route is one invocation per file
// and cannot see the others; the browser is a single context that sees them all,
// which makes it the only place a shared pace can actually be shared.

export interface GateState {
  /** requests per minute the gate is currently allowing */
  rpm: number;
  /** ms until the shared pause lifts, 0 when running */
  pausedFor: number;
  /** how many 429s have been absorbed this run */
  refusals: number;
  waiting: number;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class RateGate {
  private times: number[] = [];      // request starts inside the rolling minute
  private pausedUntil = 0;
  private waiting = 0;
  private streak = 0;                // consecutive successes since the last refusal
  refusals = 0;

  constructor(
    private rpm: number,
    private readonly minRpm = 3,
    private readonly maxRpm = 30,
  ) {}

  state(): GateState {
    return {
      rpm: Math.round(this.rpm),
      pausedFor: Math.max(0, this.pausedUntil - Date.now()),
      refusals: this.refusals,
      waiting: this.waiting,
    };
  }

  /** Wait until it is this caller's turn. Every caller queues behind the same pause. */
  async acquire(): Promise<void> {
    this.waiting++;
    try {
      for (;;) {
        const now = Date.now();
        if (now < this.pausedUntil) { await sleep(Math.min(1000, this.pausedUntil - now)); continue; }
        // drop request marks older than a minute
        const cutoff = now - 60_000;
        while (this.times.length && this.times[0] < cutoff) this.times.shift();
        if (this.times.length < this.rpm) { this.times.push(now); return; }
        // the window is full: wait until the oldest mark ages out
        await sleep(Math.min(1000, this.times[0] + 60_000 - now + 50));
      }
    } finally {
      this.waiting--;
    }
  }

  /**
   * The provider refused. Everyone waits, and the rate comes down.
   *
   * Halving rather than stepping down: a refusal means the current rate is over
   * the ceiling by an unknown margin, and creeping down one notch at a time
   * spends the whole run finding out. It climbs back gently afterwards.
   */
  penalise(waitMs: number): void {
    this.refusals++;
    this.streak = 0;
    this.pausedUntil = Math.max(this.pausedUntil, Date.now() + Math.max(1000, waitMs));
    this.rpm = Math.max(this.minRpm, Math.floor(this.rpm / 2));
  }

  /** A clean read. After a run of them, try slightly harder. */
  onSuccess(): void {
    this.streak++;
    if (this.streak >= 8 && this.rpm < this.maxRpm) {
      this.rpm = Math.min(this.maxRpm, this.rpm + 1);
      this.streak = 0;
    }
  }
}

/**
 * The default pace.
 *
 * Gemini's free tier for flash-lite allows roughly 15 requests a minute. Twelve
 * leaves room for the retries and for the assistant sharing the account, and the
 * gate raises it on its own if the account turns out to allow more.
 */
export const DEFAULT_RPM = 12;

/** Is this failure a rate limit, and is it worth waiting for? */
export function rateLimitWait(message: string): { retry: boolean; waitMs: number; daily: boolean } {
  const daily = /per\s*day|daily|\bRPD\b/i.test(message);
  const is429 = /\b429\b|RESOURCE_EXHAUSTED|rate.?limit|quota/i.test(message);
  if (!is429) return { retry: false, waitMs: 0, daily: false };
  if (daily) return { retry: false, waitMs: 0, daily: true };   // waiting will not clear a daily cap
  const m = message.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i);
  const named = m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : 0;
  // No figure named: back off far enough that the minute window has actually rolled.
  return { retry: true, waitMs: named || 30_000, daily: false };
}
