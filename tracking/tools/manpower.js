#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/manpower.js . HOW MANY PEOPLE, WHICH TRADE, WHICH WEEK
//   node tools/manpower.js
//
// The programme knows exactly what it is asking for. Every task carries a
// crew size from its norm and a span from the levelling, so the number of
// people the plan needs on any given day is arithmetic, not opinion — and
// nobody has ever been able to see it.
//
// What this CANNOT tell you is how many turned up. The walk records that
// people were present at a pin, never how many, so there is no observed
// headcount anywhere on this log and this file does not invent one. What
// the walk does give is worth having on the same page: whether they were
// wearing the right kit, whether hot work was running, and whether the
// route was clear.
//
// THE LAWS
//   . THE DEMAND IS THE PLAN'S, NOT A WISH. Crew sizes come from the same
//     norms that produced the durations. Change one and both move.
//   . THE CEILING IS DRAWN ON EVERY CHART. A curve that runs past what the
//     floor holds is not a resourcing plan, it is a drawing.
//   . NO INVENTED HEADCOUNT. The site's actual number is not observed and
//     the page says so rather than filling the gap with the demand curve.
//   . A TRADE IS CALLED BY DATE. "Forty electricians in week 11" is a
//     phone call somebody can make. "2,354 wiring points" is not.
// ===================================================================
const fs = require("fs"), path = require("path");
const DUR = require(path.join(__dirname, "../platform/kb/durations.js"));
const CAL = require(path.join(__dirname, "../platform/kb/calendar.js"));
const SHIFT = require(path.join(__dirname, "../platform/kb/shifts.js"));
const LOG = require(path.join(__dirname, "../platform/core/log.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const plan = JSON.parse(fs.readFileSync(path.join(ENGINE, "plan.json"), "utf8"));
const target = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, "target.json"), "utf8")); }
                        catch (e) { return null; } })();

const NORM = {}; (Array.isArray(DUR.NORMS) ? DUR.NORMS
  : Object.keys(DUR.NORMS).map(k => Object.assign({ code: k }, DUR.NORMS[k])))
  .forEach(n => NORM[n.code] = n);

// ---- the dates the programme is actually built to -----------------------
// The levelled run, not the unresourced bound. Reading the wrong one gives a
// curve for a schedule nobody is working to.
// EVERY ROW THE LEVELLING PRODUCED, splits included. A long task split
// across two gangs is two runs of people, and rolling the pieces back into
// one span before counting heads loses exactly the parallelism the split
// was there to create.
const codeOf = {}; (plan.plan.tasks || []).forEach(t => codeOf[t.id] = t.code);
const zoneOf = {}; (plan.plan.tasks || []).forEach(t => zoneOf[t.id] = t.zone);
const tasks = (target && (target.tasks || []).length)
  ? target.tasks.map(t => { const base = String(t.id).split("#")[0];
      return { code: codeOf[base], zone: zoneOf[base], ES: t.ES, EF: t.EF, durWD: t.durWD }; })
      .filter(t => t.code)
  : (plan.plan.tasks || []).filter(t => !t.gate && t.code)
      .map(t => ({ code: t.code, zone: t.zone, ES: t.ES, EF: t.EF, durWD: t.durWD }));

const cal = CAL.defaultConfig ? CAL.defaultConfig("pune", 2026) : null;
const isWD = (iso) => {
  const d = new Date(iso + "T00:00:00Z");
  if (cal && cal.holidays) { const h = cal.holidays.find(x => x.date === iso); if (h && h.siteOff) return false; }
  return d.getUTCDay() !== 0;
};
const addDay = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);

// ---- how many people, on which day, in which trade ----------------------
const byDay = {};                       // day -> trade -> heads
let first = null, last = null;
for (const t of tasks) {
  const n = NORM[t.code]; if (!n) continue;
  const trade = n.trade || "other";
  for (let d = t.ES; d <= t.EF; d = addDay(d, 1)) {
    if (!isWD(d)) continue;
    (byDay[d] = byDay[d] || {})[trade] = (byDay[d][trade] || 0) + (n.crew || 1);
    if (!first || d < first) first = d;
    if (!last || d > last) last = d;
  }
}
const days = Object.keys(byDay).sort();
const trades = [...new Set(tasks.map(t => (NORM[t.code] || {}).trade || "other"))].sort();

// ---- the ceiling this floor cannot be argued past -----------------------
const floorSqft = (target && target.floor && target.floor.sqft) || 0;
const sustained = SHIFT.workersFor(floorSqft, "sustained");
const peakCap = SHIFT.workersFor(floorSqft, "peak");

const daily = days.map(d => {
  const t = byDay[d];
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  return { day: d, total, byTrade: t, overPeak: total > peakCap, overSustained: total > sustained };
});
const peak = daily.reduce((m, x) => x.total > m.total ? x : m, { total: 0 });

// ---- a week is the unit a gang is booked in ----------------------------
// Nobody hires a carpenter for Tuesday. The daily curve is the truth and the
// weekly one is the phone call, so both are here and the page shows weeks.
const weeks = {};
daily.forEach(x => {
  const d = new Date(x.day + "T00:00:00Z");
  const mon = new Date(d); mon.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  const k = mon.toISOString().slice(0, 10);
  const w = weeks[k] = weeks[k] || { week: k, days: 0, peak: 0, byTrade: {} };
  w.days++; if (x.total > w.peak) w.peak = x.total;
  Object.keys(x.byTrade).forEach(tr =>
    w.byTrade[tr] = Math.max(w.byTrade[tr] || 0, x.byTrade[tr]));
});

// ---- each trade's own shape --------------------------------------------
const byTrade = trades.map(tr => {
  const ds = daily.filter(x => x.byTrade[tr]);
  const manDays = ds.reduce((t, x) => t + x.byTrade[tr], 0);
  const pk = ds.reduce((m, x) => x.byTrade[tr] > m ? x.byTrade[tr] : m, 0);
  const pkDay = (ds.find(x => x.byTrade[tr] === pk) || {}).day || null;
  return { trade: tr, manDays: Math.round(manDays),
    from: ds.length ? ds[0].day : null, to: ds.length ? ds[ds.length - 1].day : null,
    peak: pk, peakOn: pkDay, workingDays: ds.length };
}).sort((a, b) => b.manDays - a.manDays);

// ---- what the walk can and cannot say about people ----------------------
// It says people were THERE. It never says how many, so there is no observed
// headcount to compare against any of the above, and pretending otherwise
// would be the most expensive lie on the page.
// THIS IS COUNTED PER FRAME, AND DELIBERATELY NOT FOLDED. A safety reading is
// not a progress reading: for progress a yes beats a no, because a thing seen
// built is built and a frame that missed it was only pointing elsewhere. For
// safety the opposite matters — one bay with no helmets is not cancelled by
// three bays with them — so every frame keeps its own vote.
//
// That makes frame IDENTITY load-bearing, and it was not being checked. Two
// things were wrong:
//
//   . ONE FRAME FILED TWICE VOTED TWICE. 40 photographs across 12 walks exist
//     under two names — X.jpg and X_r1.jpg with identical bytes, a copy, not
//     a retake. Each was counted as two independent looks at the floor, in
//     both halves of the rate.
//   . THE TWO HALVES OF THE RATE CAME FROM DIFFERENT FRAMES. The PPE tally
//     and the people tally were gathered independently and then divided, so
//     a frame with people in it whose PPE could not be judged sat in the
//     denominator while being unable to ever reach the numerator. Every
//     unreadable frame quietly pushed the rate down — by 3 to 21 points a
//     day, always in the same direction.
//
// Both are fixed by tallying the FRAME rather than the item: one row per
// photograph, carrying every answer that photograph gave, deduplicated by
// what is actually in the file. The item counts below are then derived from
// those rows, and a joined count is derived alongside them so a rate can be
// taken over the frames that could really have shown the thing.
const site = (() => {
  const ev = LOG.read(ENGINE);
  const ITEMS = ["manpower", "ppe", "hot_work", "housekeeping", "scaffold", "edge_protection"];

  // A FRAME IS ITS CONTENT, NOT ITS NAME. A file that cannot be read is its
  // own frame and never merges with another — returning one value for every
  // unreadable file silently collapses them into a single vote.
  const crypto = require("crypto");
  const PROJ = path.join(__dirname, "../../projects/skf-pune-7f");
  const idCache = {};
  const frameId = (doc) => {
    if (idCache[doc] !== undefined) return idCache[doc];
    try { return idCache[doc] = "b:" +
      crypto.createHash("md5").update(fs.readFileSync(path.join(PROJ, doc))).digest("hex"); }
    catch (e) { return idCache[doc] = "p:" + doc; }
  };

  const frames = {};                       // day -> frameId -> { item: answer }
  ev.forEach(e => {
    if (e.kind !== "observation.record") return;
    const v = e.value || {}, day = (v.address || {}).day;
    if (!day || ITEMS.indexOf(v.item) === -1) return;
    const doc = v.doc || e.source;
    const id = doc ? frameId(doc) : ("e:" + e.id);
    const f = ((frames[day] = frames[day] || {})[id] = frames[day][id] || {});
    // the same frame read twice for the same item: keep the more definite
    // answer, because a re-read that could not tell does not erase one that could
    const had = f[v.item];
    if (had === undefined || (had === "cannot_tell" && v.answer !== "cannot_tell")) f[v.item] = v.answer;
  });

  const d = {};
  Object.keys(frames).forEach(day => {
    const rows = Object.values(frames[day]);
    const o = d[day] = { frames: rows.length, withPeople: 0, joined: {} };
    ITEMS.forEach(i => { o[i] = { yes: 0, no: 0, cannot: 0 };
                         o.joined[i] = { yes: 0, judged: 0 }; });
    rows.forEach(r => {
      const people = r.manpower === "yes";
      if (people) o.withPeople++;
      ITEMS.forEach(i => {
        const a = r[i]; if (a === undefined) return;
        o[i][a === "yes" ? "yes" : a === "no" ? "no" : "cannot"]++;
        // JOINED: only this frame's own answers, and only where somebody was
        // in it to be safe or unsafe in the first place.
        if (people && (a === "yes" || a === "no")) {
          o.joined[i].judged++; if (a === "yes") o.joined[i].yes++; }
      });
    });
  });

  const walkDays = Object.keys(d).sort();
  const latest = walkDays[walkDays.length - 1];
  return { days: walkDays, latest, byDay: d,
    headcountObserved: false,
    countedPerFrame: true,
    why: "the walk records that people were present at a pin, never how many. " +
         "There is no observed headcount on this log, so the demand curve has " +
         "nothing to be compared against and this page does not invent one",
    whyFrames: "counted one vote per photograph, identified by its contents, so " +
         "a frame filed twice under two names is one look at the floor and not two" };
})();

// ---- WHAT ACTUALLY TURNED UP, IF ANYBODY PASTED A DPR --------------------
// The walk cannot count people. A daily progress report can, and once one is
// pasted the plan curve finally has something to be measured against instead
// of standing alone looking authoritative.
// A PROJECT MANAGER IS NOT A CREW. The demand curve is built from trade norms
// and books nobody to supervise, so the figure it can be measured against is
// the LABOUR on the floor, not the grand total that carries the PM, the two
// safety officers and the site engineer with it. Both are kept; only one is
// ever compared.
const actual = (() => {
  let d = {}; try { d = JSON.parse(fs.readFileSync(path.join(ENGINE, "dpr.json"), "utf8")); } catch (e) {}
  const days = Object.keys(d).sort();
  days.forEach(k => { const x = d[k];
    if (x.labour == null) { x.labour = x.total; x.staff = x.staff || 0; } });
  return { days, byDay: d, any: days.length > 0,
    why: "the actual figure compared against the plan is trade labour. Staff — " +
         "project managers, supervision, safety — are people on the floor and " +
         "are not a crew the programme ever asked for, so they are carried " +
         "separately and counted only against what the floor can hold" };
})();

// ---- AND WHAT IT WOULD TAKE FROM HERE -----------------------------------
// Not "you are behind" — everyone knows that. How many people a day, from
// tomorrow, to finish the work that is left inside the window that is left.
// It is the only number on this page anybody can act on, and where it lands
// above the ceiling that is the answer: this cannot be resourced, it has to
// be re-dated or de-scoped.
//
// A NORM-DAY AND A PERSON ARE NOT THE SAME UNIT, and this is the one place
// on the engine where confusing them costs money. The work left is measured
// in NORM man-days — one person, one eight hour shift, at the rate the
// duration table declares. What a floor holds is measured in PEOPLE. Under a
// round the clock pattern one attendance day delivers more than one norm day,
// so dividing norm-days by working days gives norm-days per day, NOT heads.
// The heads figure is that divided by what a day on this job actually
// returns. Both are carried, both are labelled.
const workContent = (target && target.work && target.work.manDays) || null;
const attendance = daily.reduce((t, x) => t + x.total, 0);
// THE PUBLISHED RATE IS THE RATE THE ARITHMETIC USES. Rounding it to two
// places on the way out while dividing by the full precision inside left the
// page showing 346 where anybody redoing the sum with the number printed
// next to it got 345. A figure a reader cannot reproduce is a figure they
// are right not to trust.
const gain = workContent && attendance
  ? Number((workContent / attendance).toFixed(2)) : 1;

const catchUp = (() => {
  const sched = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, "schedule.json"), "utf8")); }
                         catch (e) { return null; } })();
  if (!sched || !target) return null;
  const walkDays = sched.days || [];
  const lastWalk = walkDays[walkDays.length - 1];
  const done = lastWalk ? (sched.progress[lastWalk].overall.actual || 0) : 0;
  const handover = target.target;
  const content = (target.work && target.work.manDays) || 0;
  const left = Math.max(0, Math.round(content * (100 - done) / 100));
  const heads = (normPerDay) => normPerDay == null ? null : Math.ceil(normPerDay / gain);
  const windowTo = (to) => { let wd = 0;
    for (let x = lastWalk; x && x < to; x = addDay(x, 1)) if (isWD(x)) wd++;
    const norm = wd > 0 ? Math.ceil(left / wd) : null;
    return { date: to, workingDays: wd, normPerDay: norm, perDay: heads(norm),
             possible: heads(norm) != null && heads(norm) <= peakCap }; };
  const lands = (target.built && target.built.conditionsBy) || handover;

  // ---- and the same question asked again every single day ----------------
  // One flat line across the rest of the job is a poster. What a foreman
  // needs is today's number: given what has actually been delivered since
  // the walk, how many people from THIS day on. It climbs on every day that
  // passes without enough people, which is the whole point of drawing it.
  //
  // ONLY A DAY WITH A DPR TAKES ANYTHING OFF THE PILE. A day nobody reported
  // is not a day nobody worked, and the engine will not assume either way —
  // it holds the requirement flat and says the day is unreported.
  const curve = [];
  {
    let owed = left;
    const upto = lands > handover ? lands : handover;
    for (let x = lastWalk; x && x <= upto; x = addDay(x, 1)) {
      if (!isWD(x)) continue;
      let wd = 0; for (let y = x; y < handover; y = addDay(y, 1)) if (isWD(y)) wd++;
      let wd2 = 0; for (let y = x; y < lands; y = addDay(y, 1)) if (isWD(y)) wd2++;
      const rep = actual.byDay[x] || null;
      curve.push({ day: x, owed: Math.round(owed),
        toHandover: wd > 0 ? Math.ceil(Math.ceil(owed / wd) / gain) : null,
        toLanding:  wd2 > 0 ? Math.ceil(Math.ceil(owed / wd2) / gain) : null,
        workingDaysLeft: wd, reported: !!rep, turnedUp: rep ? rep.labour : null });
      // what that day delivered, converted from heads back into norm-days.
      // Supervision does not install anything, so it burns nothing.
      if (rep) owed = Math.max(0, owed - rep.labour * gain);
    }
  }

  return {
    asOf: lastWalk, donePct: done,
    workLeft: left, contentTotal: content,
    gain,
    toHandover: windowTo(handover),
    toLanding: windowTo(lands),
    curve,
    ceiling: peakCap, comfortable: sustained,
    why: "the work left is what the walk has not seen finished, at standard shift norms. " +
         "Spread it over the working days that remain and that is the norm-days a day it " +
         "needs; divide by the " + gain.toFixed(2) + " norm-days a day on this job actually " +
         "returns and that is people on the floor. Where that is above " + peakCap + " the " +
         "floor cannot hold them, and no amount of hiring changes it",
  };
})();

// ---- THE SAME JOB, COUNTED TWICE, AND THE PAGE HAS TO SAY WHICH ---------
// WORK CONTENT is what the job is: every quantity through its man-hour norm,
// at a standard eight hour shift. 7,070 man-days.
// ATTENDANCE is what the built programme asks people to turn up for. It is
// smaller, because a shift pattern makes each attendance day deliver more
// than one norm day.
//
// The two do not divide by the shift multiplier, and it is worth knowing
// why: most tasks on this floor are already at the one working day minimum,
// and a day cannot be cut in half. Only the longer runs actually compress,
// so the whole job gains 1.3x rather than the 2.3x round the clock offers
// on paper. That is a real limit on what any shift pattern can buy here.
// (both are computed above the catch-up, which needs them to convert)

const out = {
  builtAt: new Date().toISOString(),
  start: first, finish: last,
  effort: { workContent, attendance,
    gain: workContent && attendance ? Number((workContent / attendance).toFixed(2)) : null,
    shiftOffers: target && target.built ? (target.shifts || [])
      .filter(s => s.id === target.built.shift).map(s => s.effective)[0] : null,
    why: "work content is the job at standard shift norms; attendance is what the " +
         "built programme asks people to turn up for. They differ because a shift " +
         "pattern makes each attendance day deliver more than one norm day, and they " +
         "differ by less than the pattern offers because most tasks here are already " +
         "at the one day minimum and a day cannot be cut in half" },
  floor: { sqft: floorSqft, sustained, peakCap, why: SHIFT.DENSITY.why },
  shift: target && target.built ? {
    id: target.built.shift, name: target.built.shiftName, window: target.built.shiftWindow,
    fronts: target.built.fronts, cost: target.built.costMultiple,
    peakWorkers: target.built.peakWorkers, why: target.built.shiftWhy } : null,
  totals: {
    manDays: attendance,
    peak: peak.total, peakOn: peak.day,
    daysOverSustained: daily.filter(x => x.overSustained).length,
    daysOverPeak: daily.filter(x => x.overPeak).length,
    workingDays: daily.length,
  },
  trades, byTrade,
  actual, catchUp,
  daily,
  weeks: Object.values(weeks).sort((a, b) => a.week.localeCompare(b.week)),
  site,
  // every pattern, so the page can show what a different one would cost
  patterns: (target && target.attempts) || [],
};
fs.writeFileSync(path.join(ENGINE, "manpower.json"), JSON.stringify(out));

console.log("HOW MANY PEOPLE, WHICH TRADE, WHICH WEEK\n");
console.log("  built to      " + (out.shift ? out.shift.name + ", " + out.shift.fronts + " gangs" : "the unlevelled plan"));
console.log("  span          " + first + " → " + last + "   " + daily.length + " working days");
console.log("  work content  " + (workContent || "?").toLocaleString("en-IN") + " man-days at standard shift norms");
console.log("  attendance    " + attendance.toLocaleString("en-IN") + " man-days under this programme" +
  (out.effort.gain ? "   (each attendance day delivers " + out.effort.gain + " norm-days)" : ""));
console.log("  peak          " + peak.total + " people on " + peak.day +
  "   floor holds " + sustained + " all day, " + peakCap + " at a push");
console.log("  over the sustained line on " + out.totals.daysOverSustained + " of " + daily.length + " days" +
  (out.totals.daysOverPeak ? ", OVER THE CEILING on " + out.totals.daysOverPeak : ", never over the ceiling"));
console.log("\n  TRADE          man-days    peak   when");
byTrade.slice(0, 10).forEach(t => console.log("    " + t.trade.padEnd(13) +
  String(t.manDays).padStart(7) + String(t.peak).padStart(8) + "   " + t.from + " → " + t.to));
if (catchUp) {
  console.log("\n  WHAT IT WOULD TAKE FROM HERE  (site at " + catchUp.donePct + "% on " + catchUp.asOf + ")");
  console.log("    work left     " + catchUp.workLeft.toLocaleString("en-IN") + " man-days of " +
    catchUp.contentTotal.toLocaleString("en-IN"));
  const a = catchUp.toHandover, b = catchUp.toLanding;
  console.log("    to " + a.date + "   " + a.workingDays + " working days   needs " +
    (a.perDay || "?") + " people a day   " + (a.possible ? "possible" : "IMPOSSIBLE, the floor holds " + catchUp.ceiling));
  if (b.date !== a.date)
    console.log("    to " + b.date + "   " + b.workingDays + " working days   needs " +
      (b.perDay || "?") + " people a day   " + (b.possible ? "possible" : "IMPOSSIBLE, the floor holds " + catchUp.ceiling));
}
console.log("\n  actual manpower: " + (actual.any
  ? actual.days.length + " day" + (actual.days.length === 1 ? "" : "s") + " of DPR pasted"
  : "none pasted yet — the plan curve has nothing to be measured against"));
console.log("\n→ engines/skf/manpower.json");
