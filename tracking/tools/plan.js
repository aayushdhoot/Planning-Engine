#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/plan.js . THE BILL BECOMES A SCHEDULE
//   node tools/plan.js [--rev R5] [--start 2026-06-03]
//
// Takes the priced lines the ingest read, crosses them into work through
// platform/core/scope.js, and hands that to the laws that were already
// built and guarded — sequence, durations, calendar, CPM.
//
// It reports three numbers together, always: what became work, what is
// parked with no task, and what matched a task but cannot produce a
// duration. A schedule quoted without those three is a schedule that has
// quietly left work out.
// ===================================================================
const fs = require("fs"), path = require("path");
const SCOPE = require(path.join(__dirname, "../platform/core/scope.js"));
const DUR   = require(path.join(__dirname, "../platform/kb/durations.js"));
const CAL   = require(path.join(__dirname, "../platform/kb/calendar.js"));
const CPM   = require(path.join(__dirname, "../platform/core/cpm.js"));
const ZONE  = require(path.join(__dirname, "../platform/core/zoning.js"));
const TAKT  = require(path.join(__dirname, "../platform/core/takt.js"));
const ASSUME= require(path.join(__dirname, "../platform/core/assume.js"));
const PROCURE = require(path.join(__dirname, "../platform/kb/procure.js"));

const args = process.argv.slice(2);
const arg = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const ENGINE = path.join(__dirname, "../engines/skf");
const REV = arg("--rev", "R5");
const START = arg("--start", null);
const OUT = arg("--out", path.join(ENGINE, "plan.json"));

const facts = JSON.parse(fs.readFileSync(path.join(ENGINE, "facts.json"), "utf8"));
const settledEarly = (() => { try {
  return JSON.parse(fs.readFileSync(path.join(ENGINE, "settled.json"), "utf8")); } catch (e) { return null; } })();
const fromRev = (x) => new RegExp("_" + REV + " BOQ").test(x.source.doc);
const qty   = facts.facts.filter(x => x.role === "priced BOQ quantity" && fromRev(x));
// A SPLIT LINE'S MONEY IS THE TWO HALVES ADDED, AND IT IS ALREADY ADDED.
// Every MEP package on this bill — Electrical, PHE, HVAC, Fire & Security,
// Passive Networking — prices supply and installation in separate columns
// and carries no single "amount" at all. Reading only "BOQ amount" left the
// entire services scope with quantities and no value against them.
const money = facts.facts.filter(x =>
  (x.role === "BOQ amount" || x.role === "line total") && fromRev(x));
// AND THE RATES, for the sheets that state a rate and leave the multiplication
// to the reader — see moneyFor() in scope.js. Supply and installation rates on
// the same row are two halves of one rate and add.
const rates = facts.facts.filter(x =>
  (x.role === "BOQ rate" || x.role === "supply rate" || x.role === "installation rate") && fromRev(x));
if (!qty.length) { console.error("no priced quantities from revision " + REV); process.exit(2); }

const norms = Array.isArray(DUR.NORMS) ? DUR.NORMS
  : Object.keys(DUR.NORMS).map(k => Object.assign({ code: k }, DUR.NORMS[k]));

// THE BILL REPEATS ITSELF, AND THE ENGINE NOW SAYS WHICH READING IT TOOK.
// Several lines carrying the identical count against one code are stages of
// one item far more often than they are separate items — and where a second
// document lands on the same number, that stops being a hunch. Showing both
// readings and choosing neither produced a programme knowingly several times
// too long, so the likelier reading is taken and recorded as an assumption
// with its confidence. `corroborate` carries the independent counts.
// every number the node schedule states about the same work: the active
// total, the redundant total, and the sum. A bill line matching ANY of them
// is a bill line the design also counted.
const nodeCounts = {};
const add = (code, n) => { if (Number(n) >= 50) (nodeCounts[code] = nodeCounts[code] || []).push(Number(n)); };
// ONLY A TOTAL CAN CORROBORATE, AND ONLY A DISTINCTIVE ONE. Feeding every
// per-room count in made "4" and "10" corroborating numbers, and four bill
// lines of quantity 4 — cable organisers, a run-way kit — collapsed as one
// item priced four times. A small integer agreeing with a small integer is
// arithmetic, not evidence. Totals only, and nothing under fifty.
facts.facts.filter(x => /^(active|redundant) data points$/.test(x.role || "") ||
                        x.role === "points across all rooms of this type")
  .filter(x => /TOTAL/i.test(x.subject))
  .forEach(x => add("data_drop", x.value));
// the same schedule counts desks, and the furniture task is measured in desks
facts.facts.filter(x => x.role === "how many rooms of this type" && /Workstation/i.test(x.subject))
  .forEach(x => add("workstation", x.value));
const counted = fs.existsSync(path.join(ENGINE, "counts.json"))
  ? JSON.parse(fs.readFileSync(path.join(ENGINE, "counts.json"), "utf8")) : {};
Object.keys(counted).forEach(code =>
  add(code, Object.values(counted[code]).reduce((t, v) => t + Number(v || 0), 0)));
// what a person has already settled outranks everything the engine can infer
const confirmed = {};
Object.entries((settledEarly && settledEarly.confirmedCounts) || {})
  .forEach(([k, v]) => { if (v && typeof v.qty === "number") confirmed[k] = v.qty; });
// alwaysOn: the programme also holds the work nobody priced — see ALWAYS in
// scope.js. Asked for by name, because "the bill becomes work" and "a fit-out
// also contains this" are two different statements.
const scope = SCOPE.build(qty, norms,
  { money, rates, collapseCounts: true, corroborate: nodeCounts, confirmed, alwaysOn: true,
    // so an always-on package normed per square metre is sized to this floor.
    // The AREA REGISTER, not the raw area facts — those carry every reading of
    // every room from every source, and summing them gave 63,957 m2 of floor
    // to deep clean on a floor that measures 1,782.
    floorM2: (() => { try {
      const A = JSON.parse(fs.readFileSync(path.join(ENGINE, "areas.json"), "utf8")).areas || [];
      return Math.round(A.filter(a => a.named).reduce((t, a) => t + (a.sqft || 0), 0) * 0.092903) || null;
    } catch (e) { return null; } })() });

// THE PROGRAMME'S OWN START, NOT ONE THE ENGINE INVENTED. The client's
// milestone sheet says when this job began; using anything else makes every
// date downstream incomparable with the document the client is holding.
const starts = facts.facts.filter(x => x.role === "planned start").map(x => x.value).sort();
const projectStart = START || starts[0] || "2026-06-03";
const startSource = START ? "given on the command line"
  : starts[0] ? "the earliest planned start in the client's milestone sheet" : "a default, because no programme was read";

// ---- the work gets a place -------------------------------------------
// The bill's own LOCATION column answers for 31 of 539 lines and says things
// like "all areas" and "Entire Floor", so the places come from the drawing
// instead: each named area's measured share of the floor. Counted work — six
// hundred fittings, forty doors — is not spread, because a count is not laid
// out in proportion to square footage.
const areasFile = path.join(ENGINE, "areas.json");
const areas = fs.existsSync(areasFile)
  ? JSON.parse(fs.readFileSync(areasFile, "utf8")).areas.map(a => Object.assign({}, a,
      { pts: null }))
  : [];
// the outlines live in the pin pack, and zoning needs them for wall runs
const pins = JSON.parse(fs.readFileSync(path.join(ENGINE, "pins.json"), "utf8"));
const ptsByName = {}; pins.spaces.forEach(s2 => ptsByName[s2.name] = s2.pts);
areas.forEach(a => { a.pts = ptsByName[a.wasCalled || a.name] || ptsByName[a.name] || null; });

// COUNTS SOMEBODY HAS DONE PER ROOM. The one thing that turns counted work
// — outlets, fittings, workstations — from one crew in series into parallel
// work across the floor. There is no way to derive it: a count is counted.
const countsFile = path.join(ENGINE, "counts.json");
const counts = fs.existsSync(countsFile) ? JSON.parse(fs.readFileSync(countsFile, "utf8")) : {};
const spread = ZONE.distribute(scope.tasks, areas, { counts });
const taskInputs = spread.zoned.concat(spread.notZoned.map(t => Object.assign({}, t, { zone: "floor" })))
  .map((t, i) => ({ id: "T" + String(i + 1).padStart(3, "0"),
    code: t.code, qty: Math.round(t.qty * 100) / 100, zone: t.zone || "floor" }));

const cal = CAL.defaultConfig ? CAL.defaultConfig("pune", 2026) : undefined;
let plan = null, planError = null;
try { plan = CPM.schedule(taskInputs, cal, { start: projectStart }); }
catch (e) { planError = e.message; }

// ---- THE HALF OF THE JOB THAT HAPPENS BEFORE THE SITE -------------------
// The lead weeks live here, on the task, because that is where the sequence
// rules put them. The CHAIN they imply is built in tools/schedule.js, not
// here: it has to be back-scheduled from the date the site ACTUALLY starts
// the package, and this file only knows the unlevelled bound. Anchoring it
// here dated a delivery to 29 September for work that finishes on the 5th.
const leadWeeks = {};
if (plan && plan.tasks) plan.tasks.forEach(t => {
  if (t.code && t.leadWeeks > 0) leadWeeks[t.code] = t.leadWeeks; });

const out = {
  builtAt: new Date().toISOString(),
  revision: REV,
  start: { day: projectStart, why: startSource },
  zoning: { why: spread.why, areasUsed: spread.areasUsed, areasSkipped: spread.areasSkipped,
            notZoned: spread.notZoned.map(t => ({ code: t.code, qty: t.qty, unit: t.unit,
              basis: t.basis, value: t.value, why: t.why })),
            drift: spread.drift, coverage: spread.coverage },
  scope: { tasks: scope.tasks, parked: scope.parked, unusable: scope.unusable,
           // what this bill says its own installation content is, which is
           // what prices the work it never listed — see core/weight.js
           installTotal: Math.round(facts.facts.filter(x => fromRev(x) &&
             x.role === "installation amount" && !/TOTAL/i.test(x.subject))
             .reduce((a, x) => a + Number(x.value || 0), 0)),
           suspectCounts: scope.suspectCounts, alwaysOn: scope.alwaysOn || [],
           coverage: scope.coverage, why: scope.why },
  plan: plan ? { tasks: plan.tasks || plan.nodes || [], milestones: plan.milestones || null,
                 criticalPath: plan.criticalPath || null, finish: plan.finish || null,
                 // what depends on what — a chart without these is a list of bars
                 edges: plan.edges || [], projectStart: plan.projectStart || null,
                 projectEnd: plan.projectEnd || null } : null,
  // what each package needs ordering ahead by; the dated chain is built in
  // tools/schedule.js against the levelled programme
  leadWeeks,
  // the lines the bill could not answer for, plus the procurement stages
  // whose date has already gone. Both are questions with a price on them.
  queries: {
    scope: (scope.parked || []).filter(x => /covers too many trades/.test(String(x.why || "")))
      .map(x => ({ id: "q:boq:" + String(x.at || x.description).slice(-24),
        importance: "medium", askOf: "Commercial / BOQ",
        package: x.package, description: x.description, qty: x.qty, unit: x.unit, value: x.value,
        ask: 'Which package does "' + String(x.description).slice(0, 60) + '" belong to? ' +
             'It is priced under ' + x.package + ' and the section covers too many trades to tell.',
        why: "assigning it on the section default would put man-days on a guess" })),
  },
  planError,
};
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

const cr = (n) => "Rs " + (n / 10000000).toFixed(2) + " Cr";
const v = scope.coverage.value;
console.log("THE BILL  (" + REV + ")");
console.log("  " + scope.why);
console.log("  " + cr(v.total) + " priced:  " + cr(v.tasks) + " became work (" + v.taskedShare + "%)  ·  " +
  cr(v.parked) + " parked  ·  " + cr(v.unusable) + " no duration possible");
console.log("\nTHE WORK");
console.log("  " + scope.tasks.length + " task codes from " + scope.coverage.tasked + " priced lines");
console.log("\nTHE PLACES");
console.log("  " + spread.why);
if (spread.drift.length) console.log("  ** the parts do not add back to the whole: " +
  spread.drift.map(d => d.code).join(", ") + " **");
else console.log("  every spread quantity adds back to the floor total exactly");
scope.tasks.slice(0, 10).forEach(t => console.log("    " + t.code.padEnd(20) +
  String(Math.round(t.qty)).padStart(8) + " " + String(t.unit).padEnd(4) + cr(t.value).padStart(12)));

// A SINGLE TASK LONGER THAN THE WHOLE PROGRAMME IS A MAPPING ERROR, NOT A
// SCHEDULE. The arithmetic is right and the input is wrong, and the engine
// has to say which — otherwise it publishes a finish date six years out with
// a straight face.
// THE DATE THE ENGINE MEASURES AGAINST IS ONE SOMEBODY CHOSE. Four documents
// on this project state four different handovers — 14, 15, 18 and 22 August —
// and taking the latest "planned finish" on the log picked one of them by
// accident. A tracking engine that quietly measures against a date nobody
// agreed to reports a slip against the wrong thing. So the contractual date
// is settled by a person, in settled.json, and the others are carried as
// variances against it rather than competing with it.
const settledFile = path.join(ENGINE, "settled.json");
const settled = fs.existsSync(settledFile) ? JSON.parse(fs.readFileSync(settledFile, "utf8")) : null;
const readFinish = facts.facts.filter(x => x.role === "planned finish").map(x => x.value).sort().pop() || null;
const clientFinish = (settled && settled.handover && settled.handover.date) || readFinish;
const finishWhy = (settled && settled.handover)
  ? settled.handover.source + ", settled by " + settled.decidedBy + " on " + settled.decidedOn
  : "the latest planned finish read off the documents — NOBODY HAS SETTLED WHICH DATE COUNTS";
const spanDays = clientFinish ? Math.round((Date.parse(clientFinish) - Date.parse(projectStart)) / 86400000) : null;
const suspect = plan ? (plan.tasks || plan.nodes || [])
  .filter(t => !t.gate && spanDays && (t.durWD || 0) > spanDays * 0.75)
  .map(t => { const s2 = scope.tasks.find(x => x.code === t.code) || {};
    return { code: t.code, days: t.durWD, qty: s2.qty, unit: s2.unit, lines: (s2.lines || []).length }; }) : [];
out.credible = !suspect.length;
out.suspect = suspect;
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));

if (planError) { console.log("\nTHE SCHEDULE\n  it would not solve: " + planError); }
else {
  const ts = (plan.tasks || plan.nodes || []).filter(t => !t.gate);
  const ends = ts.map(t => t.EF || t.ef).filter(Boolean).sort();
  console.log("\nTHE SCHEDULE, WITH ONE GANG PER JOB");
  console.log("  This is the upper bound, not the plan: every room worked in parallel but only ever");
  console.log("  one gang on each trade. What it is good for is showing which tasks are long because");
  console.log("  of their quantity rather than their sequence. The resourced answer is under THE MEN.");
  console.log("  starts " + projectStart + "  (" + startSource + ")");
  console.log("  " + ts.length + " tasks, finishing " + (ends[ends.length - 1] || "—"));
  const crit = ts.filter(t => t.critical);
  console.log("  " + crit.length + " on the critical path: " + crit.slice(0, 8).map(t => t.code).join(", "));
  // ONE LINE PER TRADE, NOT PER ZONE. Twenty-eight identical conduit rows is
  // the zoning working, not a schedule anybody can read.
  const roll = {};
  ts.forEach(t => { const r = roll[t.code] = roll[t.code] ||
    { code: t.code, ES: t.ES, EF: t.EF, zones: 0, longest: 0, critical: false };
    if (t.ES < r.ES) r.ES = t.ES; if (t.EF > r.EF) r.EF = t.EF;
    r.zones++; r.longest = Math.max(r.longest, t.durWD || 0); r.critical = r.critical || !!t.critical; });
  Object.keys(roll).map(k => roll[k]).sort((a, b) => a.ES.localeCompare(b.ES))
    .forEach(r => console.log("    " + r.ES + " → " + r.EF + "  " + String(r.code).padEnd(20) +
      String(r.zones).padStart(3) + (r.zones === 1 ? " place " : " places") +
      String(Math.round(r.longest) + "d").padStart(6) + " longest" + (r.critical ? "   critical" : "")));
  if (suspect.length) {
    console.log("\n  THIS IS NOT A CREDIBLE SCHEDULE YET, AND HERE IS WHY");
    console.log("  the client\'s own programme runs " + projectStart + " to " + clientFinish +
      " (" + spanDays + " days). These single tasks are longer than three quarters of that:");
    suspect.forEach(x => console.log("    " + x.code.padEnd(20) + String(x.days) + " working days for " +
      Math.round(x.qty) + " " + x.unit + " gathered from " + x.lines + " priced lines"));
    console.log("  A quantity that size is one crew doing the whole floor in series. Two things fix it and");
    console.log("  neither is a guess: zone the work so crews run in parallel, and take crew sizes from the");
    console.log("  manpower law rather than one gang per code.");
  }
}
if (scope.suspectCounts.length) {
  console.log("\nCOUNTED TWICE?  (the same number against one code, on several lines)");
  scope.suspectCounts.sort((a, b) => b.counted - a.counted).slice(0, 5).forEach(x => {
    console.log("  " + x.code + ": " + x.repeats + " lines of " + x.qty + " each, summed to " + x.counted);
    x.descriptions.slice(0, 4).forEach(d => console.log("      " + String(d).slice(0, 66)));
  });
  console.log("  Each of these is probably one set of items with its stages priced separately.");
  console.log("  The engine will not choose — the sum stands until somebody says otherwise.");
}
// ---- how many gangs, and does that reach the client's date ------------
// The CPM answers with one gang per job and every zone in parallel — an
// upper bound nobody can staff. This is the real question: with F gangs per
// trade flowing room to room, when does it finish, and how many rooms can
// physically hold a crew at once.
//
// A ROOM CAN ONLY HOLD SO MANY PEOPLE. The congestion cap is the area law's
// own — one worker per 225 sqft — read off the measured outlines rather than
// assumed, so a 23 sqft phone booth never gets a gang of four.
const zoneCaps = {};
areas.filter(a => a.named).forEach(a => { zoneCaps[a.name] = Math.max(1, Math.floor((a.sqft || 0) / 225)); });

let takt = null, taktError = null;
try { takt = TAKT.sweep(taskInputs, cal, { start: projectStart, zoneCaps, max: 8 }); }
catch (e) { taktError = e.message; }

if (takt) {
  const rec = TAKT.recommend(takt, clientFinish);
  out.manpower = { rows: takt, target: clientFinish, recommend: rec, zoneCaps };
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
  console.log("\nTHE MEN  — the resourced plan");
  console.log("  a front is one gang of each trade. Two fronts means two rooms can hold the same trade at once.");
  console.log("  This is the answer to take to a meeting; the table above is the one-gang bound it improves on.");
  console.log("  fronts   finishes      working days   peak on site");
  takt.forEach(r => console.log("     " + String(r.fronts).padStart(2) + "     " + r.projectEnd +
    String(r.workingDays).padStart(12) + String(r.peakWorkers).padStart(15) +
    (clientFinish && r.projectEnd <= clientFinish ? "   hits the client date" : "")));
  if (rec.hits)
    console.log("\n  " + rec.fronts + " fronts reaches " + clientFinish + " — " + finishWhy + ".");
  else {
    const best = takt.slice().sort((a, b) => a.projectEnd < b.projectEnd ? -1 : 1)[0];
    const over = Math.round((Date.parse(best.projectEnd) - Date.parse(clientFinish)) / 86400000);
    console.log("\n  NO NUMBER OF FRONTS REACHES " + clientFinish + " (" + finishWhy + ").");
    console.log("  The best this plan can do is " + best.projectEnd + " at " + best.fronts +
      " fronts — " + over + " calendar days past it.");
    console.log("  More gangs stop helping because the work that is late is not zoned: a count the engine");
    console.log("  could not put in rooms is one crew in series however many fronts you open.");
  }
}
else if (taktError) console.log("\nTHE MEN\n  the levelling would not run: " + taktError);

// ---- WHAT THIS PLAN IS ASSUMING -----------------------------------------
// THE DOUBT IS PART OF THE ANSWER, AND IT GOES NEXT TO THE ANSWER. A finish
// date printed without the assumptions holding it up is a date somebody will
// quote in a meeting. The register is sorted least-certain first, because
// that is the order an afternoon should be spent in.
const reg = ASSUME.register((spread.assumptions || []).concat(scope.assumptions || []));
out.assumptions = reg;
fs.writeFileSync(OUT, JSON.stringify(out, null, 1));
if (reg.assumptions.length) {
  console.log("\nWHAT THIS PLAN IS ASSUMING  —  " + reg.why);
  reg.assumptions.forEach(a => {
    console.log("\n  [" + a.confidence.toUpperCase() + "]  " + a.what);
    console.log("     because   " + a.why);
    console.log("     it moves  " + (a.affects || "(not stated)"));
    console.log("     settle it " + a.settledBy);
    if (a.instead) console.log("     instead of " + a.instead);
  });
  console.log("\n  Every task built through one of these carries its confidence. Nothing here is");
  console.log("  a fact, and none of it becomes one by being used.");
}

console.log("\nWHAT THE PLAN DOES NOT CARRY");
console.log("  parked, no task at all: " + scope.parked.length + " lines, " + cr(v.parked));
scope.parked.slice().sort((a, b) => (b.value || 0) - (a.value || 0)).slice(0, 5)
  .forEach(p => console.log("    " + cr(p.value || 0).padStart(12) + "  " + p.package + " · " + String(p.description).slice(0, 50)));
console.log("  matched a task, no duration: " + scope.unusable.length + " lines, " + cr(v.unusable));
const noUnit = scope.unusable.filter(u => /states no unit/.test(u.why));
console.log("    " + noUnit.length + " because the bill states no unit for them");
console.log("    " + (scope.unusable.length - noUnit.length) + " because no conversion between their unit and the norm's is declared");
console.log("\n→ " + OUT);
