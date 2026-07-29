// Manpower planning with resource levelling.
//
// The naive model (sum every active activity's nominal crew) is wrong for fit-out work:
// it produced 30 electricians on one day and 6 the next, which no contractor staffs.
// Real contractors hold a broadly stable gang per trade for the trade's engagement window
// and flex it within a band. So:
//   1. compute daily demand in MAN-DAYS from quantity/value-driven work content,
//   2. level that demand across each trade's engagement window against a crew cap,
//   3. hold a stable core gang, adding surge only where the levelled demand needs it,
//   4. report any work that could not be levelled inside the window as a flag.
import type { ScheduledActivity, Traced } from '../domain/types';
import norms from '../norms/norms-v1.json';

export interface TradeCrewPlan {
  trade: string;
  /** first and last working day the trade is engaged */
  start: string;
  end: string;
  /** gang held for the whole engagement */
  coreCrew: Traced<number>;
  /** maximum gang during surge */
  peakCrew: number;
  /** working days the trade is on site */
  activeDays: number;
  /** total man-days of work content */
  manDays: number;
  /** true when the work content cannot fit the window even at the cap */
  overloaded: boolean;
}

export interface ManpowerDay {
  date: string;
  byTrade: Record<string, number>;
  total: number;
}

export interface ManpowerPlan {
  days: ManpowerDay[];
  peak: number;
  peakDate: string | null;
  averageDaily: number;
  totalManDays: number;
  trades: TradeCrewPlan[];
  /** how smooth the histogram is: 1 = perfectly flat, lower = spikier */
  smoothness: number;
  warnings: string[];
}

const crewCapFor = (trade: string): { core: number; max: number } => {
  const nominal = (norms.crewByTrade as Record<string, number>)[trade] ?? norms.crewByTrade.general;
  const caps = norms.crewCaps as unknown as Record<string, { min: number; max: number }>;
  const cap = caps[trade] ?? caps.default;
  return { core: Math.max(cap.min, Math.min(nominal, cap.max)), max: cap.max };
};

/**
 * Level the manpower histogram.
 * `workingDays` must be the ordered list of working dates the project spans.
 */
export function levelManpower(acts: ScheduledActivity[], workingDays: string[]): ManpowerPlan {
  const warnings: string[] = [];
  const dayIndex = new Map(workingDays.map((d, i) => [d, i]));
  const byTrade = new Map<string, ScheduledActivity[]>();
  for (const a of acts) {
    const list = byTrade.get(a.trade) ?? [];
    list.push(a);
    byTrade.set(a.trade, list);
  }

  const grid: Record<string, number>[] = workingDays.map(() => ({}));
  const trades: TradeCrewPlan[] = [];

  for (const [trade, list] of [...byTrade.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    const startIso = list.reduce((m, a) => (a.startDate < m ? a.startDate : m), list[0].startDate);
    const endIso = list.reduce((m, a) => (a.endDate > m ? a.endDate : m), list[0].endDate);
    const s = dayIndex.get(startIso) ?? 0;
    const e = dayIndex.get(endIso) ?? workingDays.length - 1;
    const windowDays = Math.max(1, e - s + 1);

    // work content in man-days: nominal crew x duration, summed over the trade's activities
    const manDays = list.reduce((sum, a) => sum + a.crew.value * a.duration.value, 0);

    const { core: nominalCore, max } = crewCapFor(trade);
    // the gang that would deliver the work content evenly across the window
    const levelled = Math.ceil(manDays / windowDays);
    const coreCrew = Math.max(1, Math.min(Math.max(levelled, Math.ceil(nominalCore * 0.6)), max));
    const overloaded = levelled > max;
    if (overloaded)
      warnings.push(
        `${trade}: ${manDays} man-days across ${windowDays} working days needs ${levelled} workers, above the ${max} cap. ` +
          `Extend the window, split the front, or raise the cap in Settings.`,
      );

    // distribute: hold the core gang across the window; add surge where several
    // activities of the same trade genuinely overlap
    let peakCrew = coreCrew;
    for (let i = s; i <= e && i < grid.length; i++) {
      const iso = workingDays[i];
      const concurrent = list.filter((a) => a.startDate <= iso && iso <= a.endDate).length;
      const surge = concurrent > 1 ? Math.min(max - coreCrew, Math.ceil(coreCrew * 0.25 * (concurrent - 1))) : 0;
      const headcount = Math.min(max, coreCrew + Math.max(0, surge));
      grid[i][trade] = headcount;
      if (headcount > peakCrew) peakCrew = headcount;
    }

    trades.push({
      trade,
      start: startIso,
      end: endIso,
      coreCrew: {
        value: coreCrew,
        provenance: 'computed',
        source: `ceil(${manDays} man-days / ${windowDays} working days), capped at ${norms.version}:crewCaps.${trade}`,
      },
      peakCrew,
      activeDays: windowDays,
      manDays,
      overloaded,
    });
  }

  const days: ManpowerDay[] = workingDays.map((date, i) => {
    const rec = grid[i];
    return { date, byTrade: rec, total: Object.values(rec).reduce((s, n) => s + n, 0) };
  }).filter((d) => d.total > 0);

  const peakDay = days.reduce<ManpowerDay | null>((m, d) => (d.total > (m?.total ?? 0) ? d : m), null);
  const totalManDays = days.reduce((s, d) => s + d.total, 0);
  const avg = days.length ? totalManDays / days.length : 0;
  const smoothness = peakDay && peakDay.total > 0 ? Math.round((avg / peakDay.total) * 100) / 100 : 1;
  if (smoothness < 0.5)
    warnings.push(`Manpower curve is peaky (average ${Math.round(avg)} vs peak ${peakDay?.total ?? 0}). Consider re-sequencing overlapping trades.`);

  return {
    days,
    peak: peakDay?.total ?? 0,
    peakDate: peakDay?.date ?? null,
    averageDaily: Math.round(avg),
    totalManDays,
    trades,
    smoothness,
    warnings,
  };
}
