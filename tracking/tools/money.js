#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/money.js . WHAT GETS BILLED, AND WHEN
//   node tools/money.js [--as 2026-08-10]
//
// Builds cashflow.json.
//
// A programme in days becomes a programme in rupees by one multiplication
// and one hard rule about which multiplication. Each package carries a bill
// value and a span of working days; spread the value across the working
// days it is installed on and every month of the job has a number against
// it. That is the plan.
//
// What has actually been EARNED is a different number, and the only honest
// source for it is the same reading the progress page uses: what the walk
// saw finished, weighted by bill value. Not a certificate, not an invoice —
// this engine has neither — but the value of work that demonstrably exists.
//
// THE LAWS
//   . EARNED IS THE WALK, PRICED. The same percentage the progress page
//     publishes, against the same weights. If the two ever disagree one of
//     them is lying.
//   . A PACKAGE WITH NO VALUE EARNS NOTHING and is not spread. Thirty-nine
//     of these have no priced line behind them; giving them an average
//     would put money against work nobody bought.
//   . THE PLAN CURVE IS THE LEVELLED ONE. Billing against the unresourced
//     bound bills for work that cannot start.
//   . NOTHING IS FORECAST PAST WHAT THE PROGRAMME SAYS. There is no
//     retention schedule, no payment terms and no certified date anywhere
//     on this log, and none of them is invented.
// ===================================================================
const fs = require("fs"), path = require("path");
const CAL = require(path.join(__dirname, "../platform/kb/calendar.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const sched = read("schedule.json"), res = read("resources.json"), target = read("target.json");

const argAs = (() => { const i = process.argv.indexOf("--as");
  return i > 0 ? process.argv[i + 1] : null; })();
const asOf = argAs || new Date().toISOString().slice(0, 10);

const cal = CAL.defaultConfig ? CAL.defaultConfig("pune", 2026) : null;
const isWD = (iso) => { const d = new Date(iso + "T00:00:00Z");
  if (cal && cal.holidays) { const h = cal.holidays.find(x => x.date === iso); if (h && h.siteOff) return false; }
  return d.getUTCDay() !== 0; };
const addDay = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const monthOf = (iso) => iso.slice(0, 7);

// ---- the value of each package, and the days it is installed over -------
const valueOf = {}, spanOf = {};
(res ? res.rows : []).forEach(r => { if (r.value > 0) valueOf[r.code] = r.value; });
if (sched) sched.wbs.forEach(c => c.packages.forEach(k => {
  if (!k.code || k.procurement) return;
  const cur = spanOf[k.code];
  if (!cur) spanOf[k.code] = { ES: k.ES, EF: k.EF };
  else { if (k.ES && k.ES < cur.ES) cur.ES = k.ES; if (k.EF && k.EF > cur.EF) cur.EF = k.EF; }
}));

// ---- spread it, working day by working day ------------------------------
const byMonth = {};
const touch = (m) => byMonth[m] = byMonth[m] || { month: m, planned: 0, earned: 0 };
let unspread = 0, spread = 0;
Object.keys(valueOf).forEach(code => {
  const s = spanOf[code];
  // A PACKAGE THE PROGRAMME NEVER SCHEDULES CANNOT BE BILLED ON A DATE.
  if (!s || !s.ES || !s.EF) { unspread += valueOf[code]; return; }
  const wd = [];
  for (let d = s.ES; d <= s.EF; d = addDay(d, 1)) if (isWD(d)) wd.push(d);
  if (!wd.length) { unspread += valueOf[code]; return; }
  const per = valueOf[code] / wd.length;
  wd.forEach(d => touch(monthOf(d)).planned += per);
  spread += valueOf[code];
});

// ---- and what the walk says is already there ----------------------------
// THE SAME READING THE PROGRESS PAGE PUBLISHES, priced. Not an invoice.
const earnedByCode = {};
let overallPct = null, walkDay = null;
if (sched && sched.days && sched.days.length) {
  walkDay = sched.days[sched.days.length - 1];
  const pr = sched.progress[walkDay];
  if (pr) {
    overallPct = pr.overall ? pr.overall.actual : null;
    sched.wbs.forEach(c => c.packages.forEach(k => {
      const r = pr.byPkg[k.id];
      if (!r || r.actual == null || !valueOf[k.code]) return;
      earnedByCode[k.code] = Math.max(earnedByCode[k.code] || 0, r.actual);
    }));
  }
}
const earnedTotal = Object.keys(earnedByCode)
  .reduce((t, c) => t + valueOf[c] * earnedByCode[c] / 100, 0);

// spread the earned value over the months already gone, in proportion to
// what the plan said would happen in them — the only shape available
const months = Object.keys(byMonth).sort();
const past = months.filter(m => m <= monthOf(asOf));
const pastPlanned = past.reduce((t, m) => t + byMonth[m].planned, 0);
past.forEach(m => { byMonth[m].earned = pastPlanned > 0
  ? earnedTotal * byMonth[m].planned / pastPlanned : 0; });

let runP = 0, runE = 0;
const rowsM = months.map(m => { const b = byMonth[m];
  runP += b.planned; runE += b.earned;
  return { month: m, planned: Math.round(b.planned), earned: Math.round(b.earned),
    cumPlanned: Math.round(runP), cumEarned: Math.round(runE),
    past: m <= monthOf(asOf) };
});

const total = Object.values(valueOf).reduce((a, b) => a + b, 0);
const out = {
  builtAt: new Date().toISOString(), asOf, walkDay,
  totals: {
    contract: Math.round(total),
    spread: Math.round(spread), unspread: Math.round(unspread),
    earned: Math.round(earnedTotal),
    earnedPct: total > 0 ? Math.round(earnedTotal / total * 1000) / 10 : null,
    sitePct: overallPct,
    remaining: Math.round(total - earnedTotal),
  },
  months: rowsM,
  byPackage: Object.keys(valueOf).map(c => ({
    code: c, value: Math.round(valueOf[c]),
    pct: earnedByCode[c] == null ? null : earnedByCode[c],
    earned: Math.round(valueOf[c] * (earnedByCode[c] || 0) / 100),
    ES: spanOf[c] ? spanOf[c].ES : null, EF: spanOf[c] ? spanOf[c].EF : null,
  })).sort((a, b) => b.value - a.value),
  why: "the plan curve spreads each package's bill value evenly across the working days the " +
       "levelled programme installs it on. Earned is the walk's own reading priced at the same " +
       "weights the progress page uses — not a certificate and not an invoice, because this " +
       "engine has neither. No retention, no payment terms and no certified dates have been " +
       "invented, because none of them are on the log",
};
fs.writeFileSync(path.join(ENGINE, "cashflow.json"), JSON.stringify(out));

const cr = (n) => n >= 1e7 ? "Rs " + (n / 1e7).toFixed(2) + " Cr"
                : n >= 1e5 ? "Rs " + (n / 1e5).toFixed(1) + " L" : "Rs " + Math.round(n || 0);
console.log("\n  WHAT GETS BILLED, AND WHEN  (as on " + asOf + ")");
console.log("    " + cr(total) + " of priced work · " + cr(spread) + " spread over dates · " +
  cr(unspread) + " the programme never schedules");
console.log("    earned to " + walkDay + ": " + cr(earnedTotal) + "  (" + out.totals.earnedPct +
  "% of value, against " + overallPct + "% of the site read)");
console.log("\n    MONTH      PLANNED       EARNED    CUM PLANNED    CUM EARNED");
rowsM.forEach(r => console.log("    " + r.month + "  " + cr(r.planned).padStart(11) + "  " +
  (r.past ? cr(r.earned) : "—").padStart(11) + "  " + cr(r.cumPlanned).padStart(13) + "  " +
  (r.past ? cr(r.cumEarned) : "—").padStart(12)));
console.log("\n→ engines/skf/cashflow.json\n");
