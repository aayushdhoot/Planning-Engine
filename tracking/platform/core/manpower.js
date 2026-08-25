// ===================================================================
// DnB-OS . platform/core/manpower.js . THE MANPOWER PLAN
// Phase 4. "180 men on site" is not a number anybody can act on.
// "14 carpenters on Tuesday, and six turned up" is. This law turns the
// dated plan into a headcount per trade per day, puts the DPR's actual
// count beside it, and names the gap when the site is short for long
// enough to matter.
//
//   curve(plan)                  -> the planned headcount, day by trade
//   peaks(curve)                 -> the peak, site wide and per trade
//   week(curve, mondayISO)       -> one week, for a table
//   compare(curve, actualDays)   -> planned against actual, day by day
//   findings(cmp, opts)          -> the gaps worth telling somebody about
//   SITE_WORDS / mapTrade        -> the site's words to the engine's trades
//
// THE LAWS
//   . the plan's headcount EXCLUDES desk and vendor work. An enabling
//     task is nobody's boots on the floor and counting it would inflate
//     every day of the curve.
//   . the site's words are not the engine's words. A DPR says Gypsum,
//     Punning, FAS, Carpenter; the engine says drywall, civil, fire,
//     joinery. The bridge is declared here, and a word nobody declared
//     is REPORTED AS UNMAPPED, never silently dropped and never silently
//     counted. A comparison that quietly loses a trade reads as though
//     the site sent nobody.
//   . a DPR with a total but no breakdown compares SITE WIDE only. It is
//     not spread across trades to make the table look complete . that
//     would be inventing the very number the DPR failed to give.
//   . a gap is only a finding when it PERSISTS. One thin day is weather,
//     a delivery, a festival. Three running is a problem.
//   . every finding names the trade, the days, and both numbers.
//
// Pure: plan and DPR rows in, numbers out. No clock, no storage.
// ===================================================================

;(function (root) {

// The site's vocabulary, mapped to the engine's trades. Adding a word
// here is the only change needed when a DPR starts using a new one.
const SITE_WORDS = {
  electrical: "electrical", electric: "electrical", electrician: "electrical",
  civil: "civil", mason: "civil", masonry: "civil", punning: "civil", plaster: "civil",
  gypsum: "drywall", drywall: "drywall", partition: "drywall",
  ceiling: "ceiling", grid: "ceiling",
  painter: "painting", painting: "painting", paint: "painting",
  carpenter: "joinery", joinery: "joinery", "workstation marking": "joinery",
  workstation: "joinery", furniture: "joinery",
  hvac: "hvac", ducting: "hvac", duct: "hvac", ac: "hvac",
  plumbing: "plumbing", plumber: "plumbing",
  fas: "fire", "fire fighting": "fire", firefighting: "fire", fire: "fire", sprinkler: "fire",
  elv: "elv", data: "elv", networking: "elv", cctv: "elv",
  flooring: "flooring", tiling: "flooring", tiles: "flooring", carpet: "flooring",
  housekeeping: "closeout", cleaning: "closeout", cleaner: "closeout",
  demolition: "demolition", demo: "demolition", dismantling: "demolition",
};

function mapTrade(word) {
  const k = String(word == null ? "" : word).trim().toLowerCase();
  if (!k) return null;
  if (SITE_WORDS[k]) return SITE_WORDS[k];
  // a loose match, so "Fire fighting " or "HVAC Ducting" still land
  for (const w of Object.keys(SITE_WORDS)) if (k.indexOf(w) !== -1) return SITE_WORDS[w];
  return null;
}

// ---- the planned curve ---------------------------------------------
function curve(plan) {
  const src = (plan && plan.manpower && plan.manpower.byDayTrade) || {};
  const days = Object.keys(src).sort();
  return { days, byDayTrade: src,
    byDay: days.reduce((o, d) => {
      o[d] = Object.values(src[d]).reduce((s, n) => s + n, 0); return o;
    }, {}) };
}

function peaks(c) {
  const perTrade = {}, perDay = c.byDay || {};
  let site = 0, siteDay = null;
  for (const d of c.days) {
    const tot = perDay[d] || 0;
    if (tot > site) { site = tot; siteDay = d; }
    for (const t of Object.keys(c.byDayTrade[d])) {
      const n = c.byDayTrade[d][t];
      if (!perTrade[t] || n > perTrade[t].peak) perTrade[t] = { trade: t, peak: n, day: d };
    }
  }
  return { site, siteDay, byTrade: Object.values(perTrade).sort((a, b) => b.peak - a.peak) };
}

// one week of the curve, for a table a PM can read across
function week(c, mondayISO) {
  const days = [];
  const d0 = new Date(mondayISO + "T00:00:00Z");
  for (let i = 0; i < 7; i++) {
    const d = new Date(d0); d.setUTCDate(d.getUTCDate() + i);
    days.push(d.toISOString().slice(0, 10));
  }
  const trades = [...new Set(days.flatMap(d => Object.keys(c.byDayTrade[d] || {})))].sort();
  return { days, trades,
    rows: trades.map(t => ({ trade: t, byDay: days.map(d => (c.byDayTrade[d] || {})[t] || 0),
      total: days.reduce((s, d) => s + ((c.byDayTrade[d] || {})[t] || 0), 0) })),
    totals: days.map(d => c.byDay[d] || 0) };
}

// ---- planned against actual -----------------------------------------
// actualDays: [{ day, trades:{word:n}, reported, traded }] . the shape
// platform/track/manpower.js already produces from a DPR.
function compare(c, actualDays) {
  const rows = [], unmapped = {};
  for (const a of (actualDays || [])) {
    if (!a || !a.day) continue;
    const planTrades = c.byDayTrade[a.day] || null;
    const plannedTotal = c.byDay[a.day];
    const words = a.trades || {};
    const hasBreakdown = Object.keys(words).length > 0;

    const actualByTrade = {};
    for (const w of Object.keys(words)) {
      const t = mapTrade(w);
      if (!t) { unmapped[w] = (unmapped[w] || 0) + 1; continue; }
      actualByTrade[t] = (actualByTrade[t] || 0) + (Number(words[w]) || 0);
    }
    const actualTotal = (typeof a.reported === "number") ? a.reported
      : (typeof a.traded === "number" && a.traded > 0) ? a.traded
      : Object.values(actualByTrade).reduce((s, n) => s + n, 0);

    // a day with a total but no breakdown compares SITE WIDE only. It is
    // never spread across trades to fill the table, because that invents
    // exactly the number the DPR did not give.
    const trades = hasBreakdown && planTrades
      ? [...new Set(Object.keys(planTrades).concat(Object.keys(actualByTrade)))].sort()
          .map(t => ({ trade: t, planned: planTrades[t] || 0, actual: actualByTrade[t] || 0,
            gap: (planTrades[t] || 0) - (actualByTrade[t] || 0) }))
      : [];

    rows.push({ day: a.day,
      plannedTotal: plannedTotal == null ? null : plannedTotal,
      actualTotal: actualTotal,
      gapTotal: plannedTotal == null ? null : plannedTotal - actualTotal,
      breakdown: hasBreakdown, planned: !!planTrades, trades,
      note: !planTrades ? "no planned labour on this day"
        : !hasBreakdown ? "the DPR gave a total but no trade split, so this day compares site wide only"
        : null });
  }
  rows.sort((a, b) => a.day < b.day ? -1 : 1);
  return { rows, unmapped: Object.keys(unmapped).map(w => ({ word: w, days: unmapped[w] })) };
}

// ---- the findings ---------------------------------------------------
// A gap is only worth raising when it PERSISTS. One thin day is weather,
// a delivery, a festival. Three running is a problem somebody should
// hear about, and the finding names the trade, the run and both numbers.
function findings(cmp, opts) {
  const o = opts || {};
  const runNeeded = o.runNeeded || 3;
  const shortBy = o.shortBy || 0.5;          // half the planned crew or worse
  const out = [];

  // per trade, walk the days in order and count consecutive short days
  const byTrade = {};
  for (const r of cmp.rows) {
    if (!r.breakdown) continue;
    for (const t of r.trades) (byTrade[t.trade] = byTrade[t.trade] || []).push({ day: r.day, ...t });
  }
  for (const trade of Object.keys(byTrade)) {
    const days = byTrade[trade];
    let run = [];
    const flush = () => {
      if (run.length >= runNeeded) {
        const plannedAvg = Math.round(run.reduce((s, x) => s + x.planned, 0) / run.length);
        const actualAvg = Math.round(run.reduce((s, x) => s + x.actual, 0) / run.length);
        out.push({ trade, days: run.length, from: run[0].day, to: run[run.length - 1].day,
          planned: plannedAvg, actual: actualAvg,
          what: "planned " + plannedAvg + " " + trade + ", site had " + actualAvg +
                ", " + run.length + " days running" });
      }
      run = [];
    };
    for (const d of days) {
      const short = d.planned > 0 && d.actual < d.planned * shortBy;
      if (short) run.push(d); else flush();
    }
    flush();
  }
  // A trade the plan asks for that NEVER appears in any DPR, on any day, is
  // usually a reporting gap and not a manning one: the site is booking those
  // men under another word. Saying "site had 0 demolition for nine days"
  // when the DPR has no demolition word at all is technically true and
  // practically misleading, so it is called what it is.
  const everSeen = {};
  for (const r of cmp.rows) for (const t of (r.trades || [])) if (t.actual > 0) everSeen[t.trade] = 1;
  for (const f of out) {
    if (f.actual === 0 && !everSeen[f.trade]) {
      f.kind = "unreported";
      f.what = "planned " + f.planned + " " + f.trade + " and no DPR names this trade at all, "
             + f.days + " days running. The site is probably booking them under another word.";
    } else {
      f.kind = "short";
    }
  }
  out.sort((a, b) => (b.days - a.days) || (b.planned - a.planned));
  return out;
}

const MP = { SITE_WORDS, mapTrade, curve, peaks, week, compare, findings };
root.CORE_MANPOWER = MP;
if (typeof module !== "undefined" && module.exports) module.exports = MP;

})(typeof window !== "undefined" ? window : globalThis);
