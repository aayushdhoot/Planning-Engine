#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/target.js . THE DATE IS THE CONSTRAINT
//   node tools/target.js [--to 2026-08-22]
//
// A deadline is not a thing you compare a programme to afterwards. It is
// the thing the programme is built to. This takes the handover date as
// fixed and solves the only question that matters: WHAT WOULD IT TAKE.
//
// The first answer this gave was "2.85x the standard crew", which lands on
// the date and needs 1,188 people standing on a floor that holds 85. That is
// not an answer, it is arithmetic with the constraint left out. So the
// question is asked the other way round, and it is the only way that cannot
// lie: MAN-DAYS OF WORK against MAN-DAYS THE FLOOR CAN SUPPLY.
//
//   work      = every task's duration times its crew
//   capacity  = the floor's congestion limit times the working days available
//   if work > capacity the date is not tight, it is impossible — and no
//   amount of sequencing, levelling or gang-splitting changes that
//
// Only when the two are within reach of each other is a schedule the answer.
// Where they are not, the levers are named with numbers: a second shift
// doubles capacity, a norm halves work, scope moves out of the window.
//
// THE LAWS
//   . THE DATE IS NOT MOVED, AND NEITHER IS THE WORK. Quantities are what
//     the bill says and the sequence is what the trades allow. The only
//     thing this varies is how many people stand in a room.
//   . A ROOM HAS A CAPACITY AND IT IS NOT NEGOTIABLE. One worker per 225
//     square feet is the congestion limit already used by the levelling.
//     A plan that needs more than the floor holds is not a tight plan, it
//     is an impossible one, and the difference has to be stated.
//   . IF IT CANNOT BE DONE, THE ANSWER IS A NUMBER. "Not achievable" is
//     useless. "Achievable to 14 September at the floor's limit, so 23 days
//     of scope or a second shift must give" is something somebody can act
//     on this afternoon.
//   . EVERY ASSUMPTION IS NAMED AND CARRIES A CONFIDENCE. See
//     platform/core/assume.js — the same three levels as everywhere else.
// ===================================================================
const fs = require("fs"), path = require("path");
const DUR = require(path.join(__dirname, "../platform/kb/durations.js"));
const CAL = require(path.join(__dirname, "../platform/kb/calendar.js"));
const CPM = require(path.join(__dirname, "../platform/core/cpm.js"));
const SEQ = require(path.join(__dirname, "../platform/kb/sequence.js"));
const SHIFT = require(path.join(__dirname, "../platform/kb/shifts.js"));
const TAKT = require(path.join(__dirname, "../platform/core/takt.js"));
const ASSUME = require(path.join(__dirname, "../platform/core/assume.js"));

const args = process.argv.slice(2);
const arg = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const ENGINE = path.join(__dirname, "../engines/skf");
const plan = JSON.parse(fs.readFileSync(path.join(ENGINE, "plan.json"), "utf8"));
const settled = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, "settled.json"), "utf8")); }
                         catch (e) { return null; } })();
const TARGET = arg("--to", (settled && settled.handover && settled.handover.date) || null);
if (!TARGET) { console.error("no handover date — pass --to YYYY-MM-DD or settle one in settled.json"); process.exit(2); }

const START = (plan.start && plan.start.day) || "2026-06-03";
const base = (plan.plan.tasks || []).filter(t => !t.gate)
  .map(t => ({ id: t.id, code: t.code, qty: t.qty, zone: t.zone }));
// the CPM re-derives duration from quantity, so the inputs it needs are the
// quantity and the crew — which is exactly the knob this tool turns
const qtyOf = {};
(plan.scope.tasks || []).forEach(s => { qtyOf[s.code] = s; });
const inputs = (plan.plan.tasks || []).filter(t => !t.gate).map(t => ({
  id: t.id, code: t.code, zone: t.zone,
  qty: t.qty != null ? t.qty : null }));
// plan.json does not carry each task's quantity, so recover it from the
// duration the CPM already derived: qty = days * crew * hours / mhPerUnit
const NORM = {}; (Array.isArray(DUR.NORMS) ? DUR.NORMS
  : Object.keys(DUR.NORMS).map(k => Object.assign({ code: k }, DUR.NORMS[k]))).forEach(n => NORM[n.code] = n);
const HPD = DUR.HOURS_PER_DAY || 8;
(plan.plan.tasks || []).filter(t => !t.gate).forEach((t, i) => {
  const n = NORM[t.code]; if (!n) return;
  // A DAY-NORMED PACKAGE IS ALREADY IN DAYS. Running it back through the
  // man-hour formula turned a twelve-day snagging cycle into sixty, because
  // effort and duration are the same number for a fixed-duration package and
  // dividing one by the other multiplies it by the crew.
  inputs[i].qty = n.unit === "day" ? (t.durWD || 1)
    : (t.durWD || 1) * n.crew * HPD / n.mhPerUnit;
});

const cal = CAL.defaultConfig ? CAL.defaultConfig("pune", 2026) : undefined;
const runAt = (mult) => {
  const ti = inputs.map(x => ({ id: x.id, code: x.code, zone: x.zone, qty: x.qty,
    crew: Math.max(1, Math.round((NORM[x.code] ? NORM[x.code].crew : 2) * mult)) }));
  try { return CPM.schedule(ti, cal, { start: START }); } catch (e) { return null; }
};

// ---- 1. WORK AGAINST CAPACITY ------------------------------------------
const NORM_ = NORM;
const at1 = runAt(1);
const tasksNow = (plan.plan.tasks || []).filter(t => !t.gate);
let manDays = 0; const byCode = {};
tasksNow.forEach(t => { const n = NORM_[t.code]; if (!n) return;
  const m = (t.durWD || 0) * n.crew; manDays += m;
  const r = byCode[t.code] = byCode[t.code] || { code: t.code, name: t.name || t.code,
    manDays: 0, rooms: 0, crew: n.crew, perManDay: (n.crew * HPD) / n.mhPerUnit, unit: n.unit,
    mhPerUnit: n.mhPerUnit, src: n.src || null };
  r.manDays += m; r.rooms++; });

const areas = (() => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, "areas.json"), "utf8")).areas || []; }
                       catch (e) { return []; } })();
const floorSqft = Math.round(areas.filter(a => a.named).reduce((t, a) => t + (a.sqft || 0), 0));
const SQFT_PER_WORKER = 225;
const CAP = Math.floor(floorSqft / SQFT_PER_WORKER);

const wdBetween = (a, b) => { let n = 0;
  for (let d = Date.parse(a + "T00:00:00Z"); d <= Date.parse(b + "T00:00:00Z"); d += 86400000)
    if (new Date(d).getUTCDay() !== 0) n++; return n; };
const windowWD = wdBetween(START, TARGET);
const capacity = CAP * windowWD;
const ratio = capacity ? manDays / capacity : Infinity;
const dayAfter = (from, n) => { let d = Date.parse(from + "T00:00:00Z");
  while (n > 0) { d += 86400000; if (new Date(d).getUTCDay() !== 0) n--; }
  return new Date(d).toISOString().slice(0, 10); };
const atCapacity = dayAfter(START, Math.ceil(manDays / Math.max(1, CAP)));
const possible = ratio <= 1;

// ---- 2. THE LEVERS, WITH NUMBERS ---------------------------------------
// Each one is a real decision somebody can take this afternoon, sized so the
// conversation is about which to take rather than whether the date is "tight".
const biggest = Object.values(byCode).sort((a, b) => b.manDays - a.manDays);
const top = biggest[0];
const levers = [];
if (!possible) {
  const short = Math.ceil(manDays - capacity);
  levers.push({ lever: "a longer shift",
    gets: "capacity from " + capacity.toLocaleString() + " to " +
          SHIFT.capacityOf(floorSqft, windowWD, "extended").toLocaleString() +
          " man-days on overtime, " + SHIFT.capacityOf(floorSqft, windowWD, "double").toLocaleString() +
          " on two shifts",
    enough: SHIFT.capacityOf(floorSqft, windowWD, "double") >= manDays,
    why: "the floor holds " + CAP + " people at a time, not " + CAP + " people a day. Two shifts is the only way " +
         "to put more man-days through the same square footage." });
  if (top) levers.push({ lever: "the " + top.name.toLowerCase() + " norm",
    gets: "it is " + Math.round(top.manDays).toLocaleString() + " man-days, " +
          Math.round(top.manDays / manDays * 100) + "% of the whole job, at " +
          top.mhPerUnit + " man-hours per " + top.unit + " (" + top.perManDay.toFixed(1) + " " + top.unit +
          " per man-day). Halving it saves " + Math.round(top.manDays / 2).toLocaleString() + " man-days",
    enough: manDays - top.manDays / 2 <= capacity,
    why: "one package carries a third of this programme. Whether that norm is right for THIS specification — " +
         "bespoke veneer or a proprietary panel system — decides the date on its own. Source: " + (top.src || "not stated") });
  levers.push({ lever: "move scope out of the window",
    gets: Math.ceil(short) + " man-days would have to come out, " + Math.round(short / manDays * 100) + "% of the job",
    enough: true,
    why: "snagging, loose furniture and the final clean are the usual candidates — they are the tail, and the " +
         "client can occupy without them" });
}

const assumptions = [];
assumptions.push({
  id: "target:capacity",
  what: "the floor can hold one worker per " + SQFT_PER_WORKER + " sqft, so " + CAP + " people at once",
  why: floorSqft.toLocaleString() + " sqft measured off the drawing, at the congestion rate the levelling already uses",
  confidence: "medium",
  affects: "whether the date is reachable at all — it is the denominator of the whole answer",
  settledBy: "the site manager saying what this floor has actually held on a busy day",
  instead: "solving for crew size alone, which said 2.85x and put 1,188 people on a floor that holds 85",
  value: { capacity: CAP, sqft: floorSqft },
});
assumptions.push({
  id: "target:norms",
  what: "the man-hour norms are right for this specification",
  why: "they are practitioner and Methvin figures held in platform/kb/durations.js, per man-hour and per unit, " +
       "and they scale — but they are generic. " + (top ? top.name + " alone is " +
       Math.round(top.manDays / manDays * 100) + "% of the job at " + top.mhPerUnit + " mh/" + top.unit + "." : ""),
  confidence: "medium",
  affects: "the total work content, and therefore the date",
  settledBy: "the package manager for " + (top ? top.name.toLowerCase() : "the largest package") +
             " confirming the output rate for what is actually specified",
  instead: "treating a generic norm as a measured fact",
  value: top ? { code: top.code, mhPerUnit: top.mhPerUnit, share: Math.round(top.manDays / manDays * 100) } : null,
});

// ---- WHAT ACTUALLY HAS TO BE FINISHED BY THE DATE -----------------------
// Not all of the tail is a condition of handover. De-snagging runs on for
// weeks after the client is in, and the as-builts and O&M manuals routinely
// follow the keys by a month. Judging the date against work that was never
// going to be finished by it makes it look further away than it is.
const HANDOVER_CLASS = {}; const BEFORE_SHARE = {};
(plan.scope.tasks || []).forEach(t => { if (t.handover) {
  HANDOVER_CLASS[t.code] = t.handover;
  BEFORE_SHARE[t.code] = t.beforeShare == null ? 1 : t.beforeShare; } });
const mustPrecede = (code) => (HANDOVER_CLASS[code] || "before") !== "after";
// a spanning package only has to get its declared share in by the date
const cutFor = (code, ES, EF) => {
  const share = BEFORE_SHARE[code] == null ? 1 : BEFORE_SHARE[code];
  if (share >= 1) return EF;
  const days = Math.max(1, Math.round(
    (Date.parse(EF + "T00:00:00Z") - Date.parse(ES + "T00:00:00Z")) / 86400000 * share));
  return new Date(Date.parse(ES + "T00:00:00Z") + days * 86400000).toISOString().slice(0, 10);
};
// the latest date the CONDITIONS OF HANDOVER finish, in a given run
const landsBy = (run) => ((run && run.tasks) || []).filter(t => !t.gate && mustPrecede(t.code))
  .reduce((m, t) => { const d = cutFor(t.code, t.ES, t.EF); return d > m ? d : m; }, "");

// ---- 3. THE SCHEDULE THAT LANDS ON THE DATE -----------------------------
// ANALYSIS IS NOT A PROGRAMME. Saying "it needs 1.35x the floor's capacity"
// and then drawing bars that run to November is two answers to one question.
// The date is the constraint, so the bars are built to it: crews are raised
// until the critical chain fits, and what that costs in people is stated
// rather than hidden. Where the floor cannot hold those people, the schedule
// still lands on the date and the capacity line above says what it would
// take — one programme, one date, and the price of it in plain sight.
// THE SEARCH USED TO RUN TO 24x AND ASK FOR 11,808 PEOPLE. It landed on the
// date on paper because nothing in it knew what a floor holds. There are two
// real knobs and only two, and they are not the same knob:
//
//   MORE HOURS   a shift pattern. The same crew, held back four hours, or a
//                second crew at night. Costs money, not floor space.
//   MORE GANGS   more people in the room at the same moment. Costs floor
//                space, and the floor runs out at one worker per 100 sqft.
//
// A site reaches for hours before it reaches for gangs, because the gangs
// run out first. So the search goes pattern by pattern, lightest first, and
// inside each pattern it adds gangs only up to what the floor can hold. If
// the heaviest pattern at the fullest floor still misses the date, that is
// the answer: the engine says what spills and to when. It does not invent a
// crew that cannot stand anywhere.
// THE CPM IS AN UPPER BOUND, NOT A PROGRAMME. It runs all 49 rooms of every
// package at once, which at the norms' own standard crews already asks for
// 496 people on a floor that holds 191. Multiplying THAT by 24 is how the
// engine arrived at 11,808. So the schedule is levelled: a limited number
// of gangs per trade flowing room to room, with each room's own congestion
// cap. What comes out has a peak a site manager would recognise.
//
// Two knobs, and they are different knobs:
//   HOURS  a shift pattern. The same gang for longer. It shortens every
//          task and puts NOBODY extra on the floor, which is why a site
//          reaches for it first. Modelled by scaling the quantity: a gang
//          working 1.35 days' worth in a day clears 1.35x the quantity.
//   GANGS  fronts. More rooms of the same trade running at once. It puts
//          real bodies on real floor and runs out at one per 100 sqft.
const zoneCaps = {};
areas.filter(a => a.named).forEach(a => {
  zoneCaps[a.name] = Math.max(1, Math.floor((a.sqft || 0) / SQFT_PER_WORKER)); });

const PEAK_CAP = SHIFT.workersFor(floorSqft, "peak");   // 191 here, not 11,808
const MAX_FRONTS = 16;

const levelAt = (effective, fronts) => {
  const ti = inputs.map(x => ({ id: x.id, code: x.code, zone: x.zone,
    qty: x.qty == null ? null : x.qty / effective }));
  try { return TAKT.level(ti, cal, { start: START, fronts, zoneCaps }); }
  catch (e) { return null; }
};

const attempts = [];
let built = null, chosen = null;

for (const pat of SHIFT.PATTERNS) {
  let fit = null, best = null;
  for (let f = 2; f <= MAX_FRONTS; f += 2) {
    const r = levelAt(pat.effective, f);
    if (!r) continue;
    const peak = r.peakWorkers || 0;
    if (peak > PEAK_CAP) break;                     // the floor is full; more gangs is a fiction
    const by = landsBy(r);
    const row = { fronts: f, run: r, peak, conditionsBy: by };
    if (!best || by < best.conditionsBy) best = row;
    if (by && by <= TARGET) { fit = row; break; }   // smallest gang count that works
  }
  const take = fit || best;
  if (!take) continue;
  attempts.push({ pattern: pat.id, name: pat.name, window: pat.window, cost: pat.cost,
    fronts: take.fronts, peakWorkers: take.peak,
    conditionsBy: take.conditionsBy, finish: take.run.projectEnd, lands: !!fit });
  if (fit) { built = { ...fit, effective: pat.effective }; chosen = pat; break; }
}
// nothing landed: the heaviest pattern at the fullest floor is the truth
if (!built) {
  const last = attempts[attempts.length - 1];
  chosen = SHIFT.BY_ID[last.pattern];
  const r = levelAt(chosen.effective, last.fronts);
  built = { fronts: last.fronts, run: r, peak: last.peakWorkers,
            conditionsBy: last.conditionsBy, effective: chosen.effective };
}
built.g = built.fronts;
built.mult = built.effective;
const landed = !!(built.run && landsBy(built.run) && landsBy(built.run) <= TARGET);
const compressed = ((built.run && built.run.tasks) || []).filter(t => !t.gate).map(t => ({
  id: t.id, ES: t.ES, EF: t.EF, durWD: t.durWD, critical: !!t.critical,
  floatWD: t.floatWD == null ? null : t.floatWD }));
const peakBuilt = built.peak;

// ---- WHAT SPILLS PAST THE DATE, PACKAGE BY PACKAGE ----------------------
// A date that is missed is missed by particular work, not in the abstract.
const conditionsClose = built.run ? landsBy(built.run) : null;
const spillDays = (!landed && conditionsClose) ? wdBetween(TARGET, conditionsClose) - 1 : 0;
const spillPkgs = {};
((built.run && built.run.tasks) || []).filter(t => !t.gate && mustPrecede(t.code)).forEach(t => {
  const cut = cutFor(t.code, t.ES, t.EF);
  if (cut <= TARGET) return;
  const r = spillPkgs[t.code] = spillPkgs[t.code] || { code: t.code,
    name: (NORM_[t.code] && NORM_[t.code].name) || t.code, rooms: 0, latest: "" };
  r.rooms++; if (cut > r.latest) r.latest = cut;
});
const spill = landed ? null : {
  workingDays: spillDays,
  conditionsClose,
  packages: Object.values(spillPkgs).sort((a, b) => b.latest.localeCompare(a.latest))
    .map(p => ({ ...p, overWD: wdBetween(TARGET, p.latest) - 1 })),
  why: "at " + chosen.name.toLowerCase() + " with " + built.fronts + " gangs per trade, the most this " +
       "floor can hold, the conditions of handover close " + conditionsClose +
       " — " + spillDays + " working days past " + TARGET,
};

// ---- THE DATE ALL SITE WORK HAS TO BE FINISHED BY -----------------------
// Working back from the handover through the block that no crew compresses:
// the client's snag walk, de-snagging to the point of sign-off, and the deep
// clean. Nobody can shorten a consultant's walk by putting more men on it.
const tailWD = (() => {
  let n = 0;
  ((built.run && built.run.tasks) || []).filter(t => !t.gate).forEach(t => {
    if (t.code !== "snag_cycle" && t.code !== "final_clean") return;
    n += (t.durWD || 0) * (t.code === "snag_cycle" ? (BEFORE_SHARE.snag_cycle == null ? 1 : BEFORE_SHARE.snag_cycle) : 1);
  });
  return Math.ceil(n);
})();
const backFrom = (to, n) => { let d = Date.parse(to + "T00:00:00Z");
  while (n > 0) { d -= 86400000; if (new Date(d).getUTCDay() !== 0) n--; }
  return new Date(d).toISOString().slice(0, 10); };
const siteWorkBy = backFrom(TARGET, tailWD);

const out = {
  builtAt: new Date().toISOString(),
  target: TARGET, start: START, windowWD,
  built: { landed, finish: built.run ? built.run.projectEnd : null,
    conditionsBy: built.run ? landsBy(built.run) : null,
    runsOnTo: built.run ? built.run.projectEnd : null,
    shift: chosen.id, shiftName: chosen.name, shiftWindow: chosen.window,
    shiftWhy: chosen.why, costMultiple: chosen.cost,
    fronts: built.fronts,
    crewMultiple: Number(built.mult.toFixed(2)), peakWorkers: peakBuilt,
    peakCeiling: PEAK_CAP, holdable: peakBuilt <= PEAK_CAP,
    why: landed
      ? "every condition of handover lands by " + TARGET + " on " + chosen.name.toLowerCase() +
        " (" + chosen.window + ") with " + built.fronts + " gangs per trade, peaking at " + peakBuilt +
        " people against a floor ceiling of " + PEAK_CAP + ". Labour cost runs about " +
        chosen.cost + "x. De-snagging and the handover file run on past the date, as they always do."
      : "no shift pattern this floor can hold lands " + TARGET + ". The heaviest, " +
        chosen.name.toLowerCase() + " at " + peakBuilt + " people, closes the conditions of " +
        "handover on " + (built.run ? landsBy(built.run) : "—") },
  attempts,
  spill,
  siteWorkBy: { date: siteWorkBy, tailWD,
    why: "the client's snag walk, de-snagging to sign-off and the deep clean are " + tailWD +
         " working days that no crew size compresses. Working back from " + TARGET +
         ", every trade has to be off the floor by " + siteWorkBy },
  tasks: compressed,
  work: { manDays: Math.round(manDays), unconstrainedFinish: at1 ? at1.projectEnd : null },
  floor: { sqft: floorSqft, sqftPerWorker: SQFT_PER_WORKER, capacity: CAP,
    peakCeiling: PEAK_CAP, peakSqftPerWorker: SHIFT.DENSITY.peakSqftPerWorker,
    why: SHIFT.DENSITY.why },
  shifts: SHIFT.PATTERNS.map(p => ({ id: p.id, name: p.name, window: p.window,
    effective: p.effective, cost: p.cost, why: p.why,
    capacity: SHIFT.capacityOf(floorSqft, windowWD, p.id) })),
  capacity: { manDays: capacity, ratio: Number(ratio.toFixed(2)) },
  verdict: { possible, atCapacityFinish: atCapacity,
    shortBy: possible ? 0 : Math.ceil(manDays - capacity),
    why: possible
      ? "the work fits the window at the floor's capacity"
      : "the work needs " + ratio.toFixed(2) + "x the man-days this floor can supply between " + START +
        " and " + TARGET + ". No sequence, no levelling and no number of gangs changes that — it is " +
        "square footage times days." },
  levers,
  packages: biggest.slice(0, 12).map(r => ({ code: r.code, name: r.name,
    manDays: Math.round(r.manDays), share: Math.round(r.manDays / manDays * 100),
    rooms: r.rooms, perManDay: Number(r.perManDay.toFixed(1)), unit: r.unit, mhPerUnit: r.mhPerUnit })),
  assumptions: ASSUME.register(assumptions),
};
fs.writeFileSync(path.join(ENGINE, "target.json"), JSON.stringify(out, null, 1));

// ---- report --------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log("BUILDING TO " + TARGET + ", NOT REPORTING AGAINST IT\n");
console.log("  the work        " + Math.round(manDays).toLocaleString() + " man-days");
console.log("  the floor       " + CAP + " people at once (" + floorSqft.toLocaleString() +
  " sqft at one per " + SQFT_PER_WORKER + ")");
console.log("  the window      " + windowWD + " working days, " + START + " → " + TARGET);
console.log("  so at best      " + capacity.toLocaleString() + " man-days can pass through this floor\n");
console.log(possible
  ? "  IT FITS — " + ratio.toFixed(2) + "x of capacity"
  : "  IT DOES NOT FIT. The work needs " + ratio.toFixed(2) + "x what the floor can supply.\n" +
    "  Flat out at " + CAP + " people it finishes " + atCapacity + ", and no sequencing changes that.");

console.log("\nHOW MANY PEOPLE, FOR HOW LONG");
console.log("  this floor holds " + CAP + " people all day, and takes " + PEAK_CAP +
  " for a few weeks of finishing. Every line below stays under that.");
attempts.forEach(a => console.log("  " + (a.lands ? "→ " : "  ") + pad(a.name, 30) +
  pad(a.fronts + " gangs", 10) + pad("peak " + a.peakWorkers, 11) +
  "conditions close " + a.conditionsBy + (a.lands ? "   LANDS " + TARGET : "") +
  "   labour " + a.cost + "x"));
if (spill) {
  console.log("\n  NOTHING LANDS " + TARGET + ". The most this floor can do is " +
    chosen.name.toLowerCase() + ", and that closes " + spill.conditionsClose + ".");
  console.log("  SPILLOVER " + spill.workingDays + " working days. What is still running:");
  spill.packages.slice(0, 8).forEach(p => console.log("      " + pad(p.name, 26) +
    "+" + p.overWD + " working days past the date"));
}
console.log("\n  ALL SITE WORK HAS TO BE OFF THE FLOOR BY " + siteWorkBy);
console.log("      " + out.siteWorkBy.why.split(". ")[0] + ".");

console.log("\nWHERE THE WORK IS");
out.packages.slice(0, 6).forEach(p => console.log("  " + pad(p.name.slice(0, 30), 32) +
  String(p.manDays).padStart(6) + " man-days  " + String(p.share + "%").padStart(4) +
  "   " + p.perManDay + " " + p.unit + "/man-day"));

if (levers.length) { console.log("\nWHAT WOULD ACTUALLY CHANGE IT");
  levers.forEach(l => console.log("  " + (l.enough ? "[ENOUGH]  " : "[partial] ") + l.lever + " — " + l.gets)); }

console.log("\nWHAT THIS IS ASSUMING");
out.assumptions.assumptions.forEach(a => console.log("  [" + a.confidence.toUpperCase() + "] " + a.what +
  "\n        settle it: " + a.settledBy));
console.log("\n→ engines/skf/target.json");
