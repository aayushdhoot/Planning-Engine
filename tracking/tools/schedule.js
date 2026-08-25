#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/schedule.js . THE PROGRAMME, AND WHERE IT ACTUALLY IS
//   node tools/schedule.js
//
// plan.json holds 1,649 scheduled tasks, 2,582 dependency links and eleven
// days of site observation. None of that is a programme anybody can read.
// This builds the thing a project manager actually opens: a work breakdown
// three levels deep, with dates, float, the critical path, what each task
// waits on — and, for every day the site was walked, how far along it was
// against where the plan said it would be.
//
//   CATEGORY   the phase of a fit-out, in its canonical order — demolition
//              before civil before first fix. Not invented here: it is the
//              rank list in platform/kb/sequence.js.
//   PACKAGE    one trade's work of one kind — "Electrical conduit". This is
//              the row a PM argues about.
//   TASK       that package in one room. This is what a gang is sent to do.
//
// THE LAWS
//   . PARALLEL IS THE DEFAULT, SEQUENCE IS THE EXCEPTION, AND THE EXCEPTION
//     IS DECLARED. Two tasks run at once unless a link says otherwise, and
//     every link carries the reason it exists. A programme where everything
//     is sequential is a programme nobody looked at.
//   . PLANNED PER CENT IS EARNED BY WORKING DAY, NOT BY CALENDAR DAY. A task
//     spanning a weekend has not fallen behind by Monday.
//   . ACTUAL PER CENT IS WHAT A CAMERA SAW, AND ONLY WHERE IT COULD SEE. An
//     item the render said this view can never resolve is not scored — it is
//     not zero. Scoring it as zero is how a finished trade reads as late.
//   . A ROLL-UP IS WEIGHTED BY WORK, NOT BY COUNT. Forty-nine one-day tasks
//     and one sixty-day task are not "50% done" when the small ones finish.
//   . A DAY NOBODY WALKED HAS NO ACTUAL. It is not nought per cent; it is
//     unknown, and the two must never look the same.
// ===================================================================
const fs = require("fs"), path = require("path");
const LOG = require(path.join(__dirname, "../platform/core/log.js"));
const OBS = require(path.join(__dirname, "../platform/core/observe.js"));
const SEQ = require(path.join(__dirname, "../platform/kb/sequence.js"));
const CHK = require(path.join(__dirname, "../platform/signals/checklist.js"));
const CAL = require(path.join(__dirname, "../platform/kb/calendar.js"));
const ENT = require(path.join(__dirname, "../platform/core/entail.js"));
const STEP = require(path.join(__dirname, "../platform/kb/steps.js"));
const PROCURE = require(path.join(__dirname, "../platform/kb/procure.js"));
const PREC = require(path.join(__dirname, "../platform/kb/precedence.js"));
const WEIGHT = require(path.join(__dirname, "../platform/core/weight.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const OUT = path.join(ENGINE, "schedule.json");
const plan = JSON.parse(fs.readFileSync(path.join(ENGINE, "plan.json"), "utf8"));
const P = plan.plan || {};
const tasks = (P.tasks || []).filter(t => !t.gate);
if (!tasks.length) { console.error("plan.json holds no tasks — run tools/plan.js"); process.exit(2); }

// ---- HOW MUCH WORK EACH PACKAGE IS, BEFORE ANYTHING COMPRESSES IT ------
// Captured here, at the top, against the UNLEVELLED durations. A few lines
// further down every one of these is overwritten with the compressed dates
// from target.json, and reading effort off those would mean the weighting
// changed every time somebody chose a different shift pattern. The whole
// point of moving off bar-length was to stop the schedule voting on how
// complete the site is.
const DUR0 = require(path.join(__dirname, "../platform/kb/durations.js"));
const NORM0 = {}; (Array.isArray(DUR0.NORMS) ? DUR0.NORMS
  : Object.keys(DUR0.NORMS).map(k => Object.assign({ code: k }, DUR0.NORMS[k])))
  .forEach(n => NORM0[n.code] = n);
const effortOf = {};
tasks.filter(t => t.code && !t.procurement).forEach(t => {
  const n = NORM0[t.code]; if (!n) return;
  effortOf[t.code] = (effortOf[t.code] || 0) + (t.durWD || 0) * n.crew; });

// ---- working days, so per cent is earned the way work is done ----------
const cal = CAL.defaultConfig ? CAL.defaultConfig("pune", 2026) : null;
const isWD = (iso) => {
  const d = new Date(iso + "T00:00:00Z"), dow = d.getUTCDay();
  if (cal && cal.holidays && cal.holidays.indexOf(iso) !== -1) return false;
  // a fit-out site works six days; Sunday is the one that is not a working day
  return dow !== 0;
};
const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
function wdBetween(a, b) {                 // working days in [a, b], inclusive
  if (!a || !b || b < a) return 0;
  let n = 0; for (let d = a; d <= b; d = addDays(d, 1)) if (isWD(d)) n++;
  return n;
}

// ---- WHAT EACH TASK WAITS ON -------------------------------------------
// The edge list is by task id. Kept as ids so the chart can draw a line, and
// with the REASON, because "why is this after that" is the only question
// anybody ever asks of a programme.
const preds = {};
(P.edges || []).forEach(e => {
  (preds[e.to] = preds[e.to] || []).push({ id: e.from, type: e.type || "FS", lag: e.lag || 0, why: e.why || null });
});

// ---- THE FRAME AND THE WALKS -------------------------------------------
// The render said what each pin's view holds when finished. The walk said
// what was there. Both are on the log, addressed to a pin and a day.
const events = LOG.read(ENGINE);
const frame = {}, pinArea = {};
events.filter(e => e.kind === "expectation.set").forEach(e => {
  const a = e.value.address || {}; if (a.pin == null) return;
  (frame[a.pin] = frame[a.pin] || {})[e.value.item] = e.value;
  if (a.area) pinArea[a.pin] = a.area;
});
// ---- PHOTOGRAPHS THAT ARE NOT THIS SITE --------------------------------
// A yes now beats a no, so one wrong frame can never be outvoted. The
// refusal list is what keeps that rule safe. See engines/skf/frames-refused.json.
const REFUSED = (() => { try {
  return new Set((JSON.parse(fs.readFileSync(path.join(ENGINE, "frames-refused.json"),
    "utf8")).frames || []).map(f => f.doc));
} catch (e) { return new Set(); } })();
const walk = {};                       // day -> pin -> item -> observation
events.filter(e => e.kind === "observation.record").forEach(e => {
  const a = e.value.address || {}; if (a.pin == null || !a.day) return;
  if (REFUSED.has(e.value.doc)) return;
  // TWO FRAMES OF ONE PIN: the stronger reading stands, not the later one.
  const at = ((walk[a.day] = walk[a.day] || {})[a.pin] = walk[a.day][a.pin] || {});
  at[e.value.item] = OBS.stronger(at[e.value.item], e.value);
});
const days = Object.keys(walk).sort();

// which checklist items speak for a task code, and which pins sit in an area
const itemsFor = {};
CHK.ITEMS.forEach(it => (CHK.codesFor(it.id).codes || []).forEach(c =>
  (itemsFor[c] = itemsFor[c] || []).push(it.id)));
const pinsIn = {};
Object.keys(pinArea).forEach(p => (pinsIn[pinArea[p]] = pinsIn[pinArea[p]] || []).push(Number(p)));
const allPins = Object.keys(frame).map(Number);
// THE FLOOR HAS THE PINS THE PIN PACK SAYS IT HAS. Sizing coverage against
// the pins that have a RENDER counts a walk of 81 pins as 107% of a floor of
// 76 — the five undelivered renders quietly shrank the denominator.
const PINS_ON_FLOOR = (() => {
  try { return (JSON.parse(fs.readFileSync(path.join(ENGINE, "pins.json"), "utf8")).pins || []).length; }
  catch (e) { return allPins.length; }
})() || allPins.length;

// ---- WHAT EACH PIN SPEAKS FOR ------------------------------------------
// A pin is a camera position, not a unit of work, and the per cent inside a
// package was counting them one each. Pin 12 stands in a 23 sqft phone booth
// and pin 40 in 797 sqft of open workstation floor: one is worth thirty-five
// of the other and both scored one. A package finished in every small room
// and untouched across the open plan read as most of the way done.
//
// So a pin carries the floor it answers for — its area's measured size
// shared between the pins standing in it — and the per cent becomes an area
// per cent, which is what "how much of this is built" has always meant.
const pinWeight = (() => {
  const w = {};
  try {
    const A = JSON.parse(fs.readFileSync(path.join(ENGINE, "areas.json"), "utf8")).areas || [];
    A.filter(a => a.named && (a.pins || []).length).forEach(a => {
      const each = (a.sqft || 0) / a.pins.length;
      a.pins.forEach(p => w[Number(p)] = each);
    });
  } catch (e) {}
  const vals = Object.values(w);
  // a pin in no named area still speaks for something: the average
  w.__default = vals.length ? vals.reduce((t, v) => t + v, 0) / vals.length : 1;
  return w;
})();
const wOf = (pin) => pinWeight[Number(pin)] || pinWeight.__default;

// ---- AND WHICH PACKAGES THAT IS THE RIGHT WEIGHT FOR --------------------
// Area is the right denominator for work that is MEASURED — plaster, screed,
// ceiling, paint, flooring. Twice the floor is twice the work.
//
// It is the wrong denominator for work that is COUNTED. A phone booth is 23
// sqft and has one door; four hundred square feet of open plan has none.
// Weighting doors by floor area says the open plan matters thirty-five times
// more for doors than the booth does, when it has no doors at all. The same
// goes for the sanitary fixtures, which live entirely inside washrooms that
// are two per cent of the plate, and for the racks, the UPS and the gas
// suppression, which live in one room each.
//
// For counted work the denominator is the number of PLACES that need the
// item — every pin whose finished view holds one, each weighing the same.
// That is what "how many of the places that need a door have got one" means,
// and it is the question a count has always answered.
//
// Which is which is not decided here: zoning.js already declares a spreading
// basis for every code, because the same distinction governs how quantity is
// laid out across the floor. One declaration, used twice.
const ZONING = require(path.join(__dirname, "../platform/core/zoning.js"));
const countBasis = (code) => {
  const b = (ZONING.BASIS || {})[code];
  // "whole" is one job for the whole floor — a single place, so either
  // weighting gives the same answer; counted is the safer default there
  return b === "count" || b === "whole";
};
const weightFor = (code) => countBasis(code) ? (() => 1) : wOf;

// ---- WHAT NO CAMERA ON THIS FLOOR CAN EVER SEE -------------------------
// Twenty-five packages carrying a tenth of the job have no evidence route at
// all: the UPS and the BMS are in plant rooms, the outdoor units are on the
// terrace, the racks are in a hub with no pin, and the testing has no
// physical thing to photograph. Every one of them read nought per cent, and
// nought because nobody could look is not the same fact as nought because
// somebody looked and found nothing.
//
// It matters because it is not a rounding error. Answering the four largest
// of these settles nine per cent of the number, and until somebody does, the
// completion figure is quietly a tenth short of what it could be. So they
// are marked, and the page lists them as work to be reported rather than
// leaving them to look like packages that simply have not started.
const noRouteFor = (code) => {
  const items = itemsFor[code] || [];
  if (!items.length) return "no photograph can show this kind of work";
  for (const pin of allPins) {
    const exp = frame[pin] || {};
    for (const i of items) if (exp[i] && exp[i].answer !== "no") return null;
  }
  return "nothing on this floor is pinned where this work happens";
};

// ---- HOW FAR ALONG ONE TASK WAS ON ONE DAY -----------------------------
// Only where the camera could answer. An item the frame said this view can
// never resolve is not counted at all — neither as done nor as undone —
// because counting it as undone is how a completed trade reads as late.
function actualOn(code, zone, day) {
  const items = itemsFor[code] || [];
  if (!items.length) return null;                       // no camera speaks for this trade
  const pins = (zone && zone !== "floor" && pinsIn[zone]) ? pinsIn[zone] : allPins;
  const seen = walk[day] || {};
  const W = weightFor(code);
  let done = 0, scored = 0, ent = 0, places = 0; const entBy = {};
  for (const pin of pins) {
    const pw = W(pin);
    const exp = frame[pin] || {}, obs = seen[pin] || {};
    for (const item of items) {
      const e = exp[item], o = obs[item];
      if (!e) continue;                                 // not on this pin's frame at all
      // A RENDER OF A FINISHED ROOM CANNOT SHOW A DUCT. It is above the
      // ceiling, and the ceiling is closed — so the frame answers "no", and
      // the engine read that as "there is no duct in this room" and threw
      // away the walk. On 3 August the camera saw insulated duct at 25 pins
      // and duct at 44, and the programme reported duct insulation as not
      // started, because the finished view said the duct was not visible.
      //
      // For anything on the SERVICE ladder — duct, insulation, copper,
      // conduit, tray, wiring, plumbing, data, sprinkler, waterproofing —
      // "not visible when finished" is a property of the item, not evidence
      // about the site. The frame cannot speak for these at all. The walk
      // can, because today the ceiling is still open, and it is the only
      // thing that can. So the walk is believed and the frame is ignored.
      const chk = CHK.BY_ID[item];
      const concealed = !!(chk && chk.ladder === "service");
      if (e.answer === "no" && !concealed) continue;    // the finished room has no such thing here
      // THE FRAME'S OWN "CANNOT TELL" IS THE CASE THIS EXISTS FOR. A render of
      // a finished room cannot show the conduit inside the wall either, so
      // skipping those before asking what the cover proves threw away the
      // permanent half of the problem and left five entailments out of four
      // thousand. The frame not being able to see it is not the same as it
      // not being there.
      if (e.answer === "cannot_tell" || !o || o.answer === "cannot_tell") {
        // WHAT THE COVER PROVES COUNTS AS DONE. Buried work is never seen
        // again; leaving it unscored for the rest of the job reports finished
        // trades as untouched. entail.js only fires past the point of no
        // return, and only where the camera had nothing to say.
        const proof = ENT.entailedBy(item, obs);
        if (proof) { scored += pw; done += pw; places++; ent++;
          entBy[proof.by] = (entBy[proof.by] || 0) + 1; }
        continue;
      }
      scored += pw; places++;
      if (o.answer === "yes") done += pw;
    }
  }
  // `scored` is now square feet of floor, so the count of readings travels
  // separately — the page still wants to say how many places were looked at
  return scored ? { pct: Math.round(done / scored * 100),
    done: Math.round(done), scored: Math.round(scored), places, entailed: ent,
    entailedBy: Object.keys(entBy).length ? entBy : null } : null;
}

// ---- HOW FAR ALONG ONE STEP IS, ACROSS THE WHOLE FLOOR -----------------
// The room is no longer the unit anybody reads; the STEP is. So a step's
// per cent is how many of the places that need it have reached it — one
// number for "chasing for conduit", not forty-nine rows of it.
//
// LATER PROVES EARLIER, INSIDE THE PACKAGE TOO. You cannot plaster a wall
// you have not chased, so a pin showing plaster applied has had its chase
// and its conduit whatever the camera made of them that morning. This is
// the same reasoning as entail.js, turned inward: within one package the
// steps are a sequence, and reaching step five means one to four are behind
// you. Without it the earlier steps of every finished package read as
// undone for the rest of the job.
function stepActualOn(code, day) {
  const steps = STEP.stepsFor(code);
  const seen = walk[day] || {};
  const W = weightFor(code);
  const out = steps.map(st => ({ id: st.id, done: 0, of: 0, byEntail: 0, bySequence: 0 }));
  for (const pin of allPins) {
    const pw = W(pin);
    const exp = frame[pin] || {}, obs = seen[pin] || {};
    // is this package even at this pin? it is, if the frame speaks to any
    // item any of its steps is evidenced by
    const relevant = steps.some(st => st.sees.some(i => exp[i] && exp[i].answer !== "no"));
    if (!relevant) continue;
    // walk the steps forward, remembering the furthest one actually reached
    let reached = -1;
    steps.forEach((st, i) => {
      if (!st.sees.length) return;
      const hit = st.sees.some(item => {
        const o = obs[item];
        if (o && o.answer === "yes") {
          if (!st.stage) return true;
          const it = CHK.BY_ID[item];
          const ladder = (CHK.LADDER || {})[(it && it.ladder) || "buildup"] || [];
          return ladder.indexOf(o.stage) >= ladder.indexOf(st.stage);
        }
        // buried work the cover proves counts as reached
        return !!ENT.entailedBy(item, obs);
      });
      if (hit) reached = Math.max(reached, i);
    });
    steps.forEach((st, i) => {
      out[i].of += pw; out[i].places = (out[i].places || 0) + 1;
      if (i <= reached) { out[i].done += pw; if (i < reached) out[i].bySequence++; }
    });
  }
  return out.map((r) => ({ ...r, pct: r.of ? Math.round(r.done / r.of * 100) : null,
    of: Math.round(r.of), done: Math.round(r.done), places: r.places || 0 }));
}

// planned per cent on a day: work earned by working day across the bar
function plannedOn(t, day) {
  if (day < t.ES) return 0;
  if (day >= t.EF) return 100;
  const total = Math.max(1, wdBetween(t.ES, t.EF));
  return Math.round(wdBetween(t.ES, day) / total * 100);
}

// ---- THE PROGRAMME IS BUILT TO THE DATE --------------------------------
// tools/target.js compresses the chain until it lands on the handover. Where
// it has, those are the dates this schedule carries — because a programme
// that analyses the deadline in a banner and then draws bars two months past
// it is giving two answers to one question. What the compression costs in
// people is on the record in target.json and stated on the page.
// WHICH BASIS THE PAGE IS REPORTING ON. Value is what a QS certifies and
// the default; effort is what the site feels. Settled, so it does not reset.
const BASIS = (() => { try {
  const st = JSON.parse(fs.readFileSync(path.join(ENGINE, "settled.json"), "utf8"));
  return st.progressBasis === "effort" ? "effort" : "value"; } catch (e) { return "value"; } })();
const TARGETDATE = (() => { try {
  return JSON.parse(fs.readFileSync(path.join(ENGINE, "settled.json"), "utf8")).handover.date; }
  catch (e) { return null; } })();
const target = (() => { try {
  return JSON.parse(fs.readFileSync(path.join(ENGINE, "target.json"), "utf8")); } catch (e) { return null; } })();
const builtTo = {};
// THE TIGHTEST ACHIEVABLE PLAN IS STILL THE PLAN. Where the date cannot be
// reached at all, showing the UNCOMPRESSED programme instead is the worst of
// both: bars three months past the date AND no sign that anybody tried. The
// compressed dates are used whenever they exist; whether they landed is a
// separate fact, stated separately.
// THE LEVELLING SPLITS A LONG TASK ACROSS GANGS, and the pieces come back as
// "T1682#1", "T1682#2". Matching on the bare id left those eleven tasks
// carrying their UNLEVELLED dates — one of them ran to December inside a
// programme that finished in September, and it dragged its whole category
// with it. A split task is the same task: earliest start, latest finish.
if (target && (target.tasks || []).length) (target.tasks || []).forEach(t => {
  const base = String(t.id).split("#")[0];
  const b = builtTo[base];
  if (!b) { builtTo[base] = { ...t, id: base }; return; }
  if (t.ES < b.ES) b.ES = t.ES;
  if (t.EF > b.EF) { b.EF = t.EF; b.durWD = t.durWD; }
  b.critical = b.critical || t.critical;
  if (t.floatWD != null) b.floatWD = b.floatWD == null ? t.floatWD : Math.min(b.floatWD, t.floatWD);
});
const notBuilt = [];
if (Object.keys(builtTo).length) tasks.forEach(t => { const b = builtTo[t.id];
  if (!b) { if (t.code && !t.procurement) notBuilt.push(t.id); return; }
  t.ES = b.ES; t.EF = b.EF; t.durWD = b.durWD; t.critical = b.critical;
  if (b.floatWD != null) t.floatWD = b.floatWD; });
if (notBuilt.length) console.error("  ** " + notBuilt.length +
  " site tasks carry unlevelled dates: " + notBuilt.slice(0, 6).join(" ") + " **");

// THE FRONT HALF OF THE JOB GOES ON THE PROGRAMME AND STAYS OUT OF THE
// PERCENTAGE. Drawings, approvals, orders, manufacture and delivery are what
// the first two months of a fit-out actually consist of, and leaving them off
// made the programme start at demolition with nine weeks of VRF lead time
// hidden inside a task's early start. They are scheduled. They are not
// tracked: nobody photographs a purchase order, and folding them into the
// completion figure would drag the site's own number down for work that is
// not the site's. Every one carries track:false — see platform/kb/procure.js.
// Back-scheduled from the day the LEVELLED programme actually starts each
// package, which is why this is here and not in plan.js: that file only
// knows the unlevelled bound, and anchoring to it dated a delivery to 29
// September for work the site finishes on the 5th.
const backWD = (iso, n) => { let d = iso; while (n > 0) { d = addDays(d, -1); if (isWD(d)) n--; } return d; };
const startsAt = {};
tasks.filter(t => t.code).forEach(t => {
  if (!startsAt[t.code] || t.ES < startsAt[t.code]) startsAt[t.code] = t.ES; });
const scopeName = {}; (plan.scope.tasks || []).forEach(x => scopeName[x.code] = x.name);
const procurement = [];
Object.keys(plan.leadWeeks || {}).sort().forEach(code => {
  if (!startsAt[code]) return;
  PROCURE.chainFor({ code, name: scopeName[code] || code,
    leadWeeks: plan.leadWeeks[code], needBy: startsAt[code] }, { back: backWD })
    .forEach(x => procurement.push(x));
});
for (const t of procurement) tasks.push(t);
const procurementQueries = PROCURE.queriesFor(procurement, new Date().toISOString().slice(0, 10));

// WHAT A PERSON HAS ALREADY ANSWERED. The engine infers where it cannot see,
// marks every inference on the screen, and the moment somebody says what is
// actually true that answer replaces it and is never argued with again.
const said = (() => { try {
  return JSON.parse(fs.readFileSync(path.join(ENGINE, "confirmed.json"), "utf8")); }
  catch (e) { return {}; } })();

const cats = {};
for (const t of tasks) {
  const rank = SEQ.phaseOf(t);
  const cat = SEQ.phaseLabel ? (SEQ.phaseLabel(rank) || ("Phase " + rank)) : ("Phase " + rank);
  const C = cats[cat] = cats[cat] || { id: "C" + String(rank).replace(".", "_"), kind: "category",
    name: cat, rank, packages: {} };
  const pkgKey = t.procurement ? t.code + ":" + t.forCode : t.code;
  const K = C.packages[pkgKey] = C.packages[pkgKey] || { id: "P_" + pkgKey.replace(/:/g, "_"),
    kind: "package", code: t.code, name: t.procurement ? t.forName : (t.name || t.code),
    trade: t.trade || null, track: t.track !== false, owner: t.ownerName || null,
    procurement: !!t.procurement, rooms: [], tasks: [] };
  // THE ROOMS STAY, BUT BEHIND THE NUMBER. They are how a step's per cent is
  // computed and where a gang is actually sent; they are not what a PM reads.
  K.rooms.push({ id: t.id, zone: t.procurement ? (t.ownerName || "off site") : (t.zone || "floor"),
    ES: t.ES, EF: t.EF,
    durWD: t.durWD || 0, critical: !!t.critical,
    stage: t.stage || null, stageName: t.procurement ? String(t.name).split(" — ")[0] : null,
    waitsOn: (preds[t.id] || []).slice(0, 3) });
}

// A ROLL-UP IS WEIGHTED BY WORK. Averaging per cent across tasks makes forty
// nine one-day rooms outweigh one sixty-day run, and the number then moves
// fastest exactly when the least is happening.
// ---- WHAT EACH PACKAGE IS WORTH ----------------------------------------
// Not the length of its bar. See platform/core/weight.js for why that was
// indefensible and what replaced it.
const valueOf = {};
(plan.scope.tasks || []).forEach(t => { valueOf[t.code] = (valueOf[t.code] || 0) + (t.value || 0); });
// the bill's own installation total, which is what prices the work it forgot
const installTotal = (plan.scope.installTotal != null) ? plan.scope.installTotal : 0;

const WEIGHTS = (() => {
  const rows = [];
  Object.values(cats).forEach(C => Object.values(C.packages).forEach(K => {
    rows.push({ code: K.code, name: K.name, catId: C.id, track: K.track,
      value: valueOf[K.code] || 0, manDays: effortOf[K.code] || 0 }); }));
  return WEIGHT.build(rows, { installTotal, basis: BASIS });
})();

// A ROLL-UP IS WEIGHTED BY WHAT THE WORK IS WORTH, and the weight rides on
// each row so the page can show why a package moves the number.
const roll = (kids, day, key) => {
  let num = 0, den = 0;
  kids.forEach(k => { const w = k.w != null ? k.w : Math.max(k.durWD || 0, 0.25);
    const v = k[key]; if (v == null || w <= 0) return; num += v * w; den += w; });
  return den ? Math.round(num / den) : null;
};
// THE SAME ROLL-UP, UNROUNDED. A whole per cent is the right thing to show on
// a card and the wrong thing to do arithmetic with: this project moves well
// under a point between walks, so DIFFERENCING TWO ROUNDED FIGURES was wrong
// on six of twelve intervals — twice reporting no movement on a day when eight
// packages moved, once reporting a whole point for a fifth of one. Anything
// that subtracts must subtract these and round once, at the end.
const rollRaw = (kids, day, key) => {
  let num = 0, den = 0;
  kids.forEach(k => { const w = k.w != null ? k.w : Math.max(k.durWD || 0, 0.25);
    const v = k[key]; if (v == null || w <= 0) return; num += v * w; den += w; });
  return den ? num / den : null;
};

const wbs = Object.values(cats).sort((a, b) => a.rank - b.rank).map(C => {
  const packages = Object.values(C.packages).map(K => {
    K.rooms.sort((a, b) => a.ES.localeCompare(b.ES) || a.zone.localeCompare(b.zone));
    K.ES = K.rooms.reduce((m, t) => t.ES < m ? t.ES : m, K.rooms[0].ES);
    K.EF = K.rooms.reduce((m, t) => t.EF > m ? t.EF : m, K.rooms[0].EF);
    K.durWD = wdBetween(K.ES, K.EF);
    K.critical = K.rooms.some(t => t.critical);
    K.zones = K.rooms.length;
    // a package the tail declares may follow the keys is not late for doing so
    const cls = (plan.scope.tasks || []).find(t => t.code === K.code);
    K.handover = (cls && cls.handover) || "before";
    // THE STEPS TAKE THEIR DATES FROM THE PACKAGE THEY BELONG TO. Each one
    // gets the slice of the package's span its share of the work earns —
    // which is what makes the chase and the conduit visible as the days they
    // actually occupy rather than as a footnote to "blockwork".
    const span = Math.max(1, wdBetween(K.ES, K.EF));
    const dayAt = (frac) => { let n = Math.round(span * frac), d = K.ES;
      while (n > 0) { d = addDays(d, 1); if (isWD(d)) n--; } return d; };
    // a procurement stage IS one activity, so it does not get a method
    // statement pretending otherwise — it gets itself, and whose job it is
    K.tasks = K.procurement
      ? [{ id: K.id + ":do", kind: "step", stepId: K.rooms[0].stage || "do", code: K.code,
           name: K.rooms[0].stageName || K.name, trade: "procurement",
           share: 100, generic: false, track: false, owner: K.owner,
           ES: K.ES, EF: K.EF, durWD: K.durWD, critical: K.critical,
           sees: [], zone: K.owner || "off site" }]
      : STEP.stepsFor(K.code).map(st => ({
      id: K.id + ":" + st.id, kind: "step", stepId: st.id, code: K.code,
      name: st.name, trade: st.trade, share: Math.round(st.share * 100),
      generic: st.generic,
      ES: dayAt(st.from), EF: dayAt(st.to),
      durWD: Math.max(1, Math.round(span * st.share)),
      critical: K.critical, sees: st.sees, zone: K.zones + " rooms" }));
    return K;
  }).sort((a, b) => a.ES.localeCompare(b.ES));
  C.packages = packages;
  C.ES = packages.reduce((m, k) => k.ES < m ? k.ES : m, packages[0].ES);
  C.EF = packages.reduce((m, k) => k.EF > m ? k.EF : m, packages[0].EF);
  C.durWD = wdBetween(C.ES, C.EF);
  C.critical = packages.some(k => k.critical);
  return C;
});

// ---- PROGRESS, DAY BY DAY -----------------------------------------------
// A DAY NOBODY WALKED HAS NO ACTUAL, and says so. Only the days on the log
// get an entry, and inside a day a task the camera could not speak to is
// null rather than nought.
const progress = {};
for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
  const day = days[dayIndex];
  const byTask = {}, byPkg = {}, byCat = {}, pkgOf = {};
  for (const C of wbs) {
    const catKids = [];
    for (const K of C.packages) {
      const pkgKids = [];
      let sp = stepActualOn(K.code, day);
      // THE CAMERA SPEAKS FOR THE PACKAGE EVEN WHEN NO STEP CLAIMS IT.
      // Most method statements name no checklist item on their individual
      // steps, so stepActualOn found nothing to score and the whole package
      // fell to "unseen" — while actualOn, reading the same walk against the
      // same code, had a perfectly good number. Duct insulation was the worst
      // of it: 25 pins showed insulated duct and the row read nought.
      //
      // Where no step has an evidence route, the package's own reading is
      // used and spread across the steps the way a per cent always maps onto
      // a sequence: the steps behind it are finished, the one it is inside is
      // part done, the ones after it have not started.
      let fromPackage = null;
      if (!sp.some(a => a && a.of > 0)) {
        const a = actualOn(K.code, null, day);
        if (a && a.scored) {
          fromPackage = a;
          let acc = 0;
          sp = STEP.stepsFor(K.code).map(st => {
            const lo = acc * 100, hi = (acc + st.share) * 100; acc += st.share;
            const pct = a.pct >= hi ? 100 : a.pct <= lo ? 0
              : Math.round((a.pct - lo) / Math.max(1e-9, hi - lo) * 100);
            return { id: st.id, done: pct, of: 100, byEntail: 0, bySequence: 0,
                     pct, places: a.scored, viaPackage: true };
          });
        }
      }
      K.tasks.forEach((t, i) => {
        const a = sp[i];
        const row = { planned: plannedOn(t, day),
                      actual: a && a.of ? a.pct : null,
                      seen: a ? a.done : 0, scored: a ? a.of : 0,
                      bySequence: a ? a.bySequence : 0, durWD: t.durWD };
        // NO READING ON WORK THAT IS DUE IS NOT THE SAME AS NO CONCERN.
        // Ninety of the two hundred and ninety-four tracked rows had no
        // camera route at all, so they showed a blank in Done and a blank in
        // Gap — and a blank in a gap column reads as "fine". Duct insulation,
        // fire dampers, sprinkler heads, the UPS and gas suppression were all
        // sitting there at 100% planned, entirely unstarted for all anybody
        // could tell, looking exactly like the rows that were on track.
        //
        // So an unread row on a TRACKED package counts as nought done, which
        // makes the gap the whole of what was planned, and the parts finally
        // add back to the whole. `unseen` travels with it because nought
        // because nobody looked and nought because somebody looked and saw
        // nothing are different facts, and the tooltip says which this is.
        // Work off site keeps no percentage at all — see the law above.
        if (a && a.viaPackage) row.viaPackage = true;
        if (K.track !== false && row.actual == null) { row.actual = 0; row.unseen = true; }
        byTask[t.id] = row; pkgKids.push(row);
      });
      const noRoute = noRouteFor(K.code);
      const wK = WEIGHT.of(WEIGHTS, K.code);
      const wp = WEIGHTS.byPackage[K.code] || {};
      // inside a package the steps split its weight by their declared share,
      // so the tree adds up at every level and not just the top one
      pkgKids.forEach((r, i) => { const st = K.tasks[i];
        r.w = wK * ((st && st.share != null ? st.share : 100) / 100); });
      byPkg[K.id] = { planned: roll(pkgKids, day, "planned"), actual: roll(pkgKids, day, "actual"),
                      w: wK, weight: Math.round(wK * 1000) / 10,
                      value: wp.value || 0, manDays: wp.manDays || 0, valueFrom: wp.valueFrom || null,
                      durWD: K.durWD, track: K.track !== false, noRoute,
                      unseen: pkgKids.length > 0 && pkgKids.every(r => r.unseen) };
      catKids.push(byPkg[K.id]);
      pkgOf[K.code] = { row: byPkg[K.id], K, catKids };
    }
    byCat[C.id] = { planned: roll(catKids, day, "planned"), actual: roll(catKids, day, "actual"),
                    durWD: C.durWD, track: C.packages.some(k => k.track !== false),
                    unseen: catKids.length > 0 && catKids.every(r => r.unseen),
                    inferred: catKids.some(r => r.inferred) ? { inferred: true,
                      confidence: catKids.filter(r => r.inferred)
                        .reduce((w, r) => w === "low" || r.inferred.confidence === "low" ? "low"
                          : w === "medium" || r.inferred.confidence === "medium" ? "medium" : "high", "high"),
                      why: "some of the work under this heading is read from what the rest of the " +
                           "floor proves, not from a photograph" } : null,
                    confirmed: catKids.some(r => r.confirmed) ? true : null };
  }
  // ---- WORK DOES NOT UN-HAPPEN ----------------------------------------
  // A walk is a sample. The 6 August round photographed every pin but only
  // twenty were read in depth, and every package those twenty did not speak
  // to fell to nought — so a floor that had plainly moved forward reported
  // 12% on the 3rd and 5% on the 6th. The engine was reading its own
  // sampling as demolition.
  //
  // A package that was seen at 57% and is not looked at again is still at
  // 57%. It is not a new observation and it does not pretend to be one: the
  // figure carries the day it came from, and any FRESH reading on this day,
  // higher or lower, replaces it outright — because a genuine regression
  // (work taken down, a wall re-opened) has to be able to show through.
  // THE BEST EVIDENCE ANY WALK HAS PRODUCED, not the last walk's evidence.
  // Two things make a later reading come out lower without anything being
  // taken down: a walk is a SAMPLE, so a package the round did not reach
  // scores nothing; and two readers CALIBRATE DIFFERENTLY, so the same duct
  // read as "concealed" by one and "rough in" by another moves forty points
  // on nobody's tools. Ducting went 69% to 30% between 3 and 6 August on a
  // floor where more duct had gone up in between.
  //
  // So a package holds the highest figure any walk has reached, and says
  // which walk that was. A genuine regression still shows: it needs a pin
  // that saw the work and now does not, which is a fact about a place rather
  // than an artefact of who was looking.
  Object.keys(pkgOf).forEach(code => {
    const e = pkgOf[code], R = e.row;
    if (R.track === false) return;
    let best = null;
    for (let i = 0; i < dayIndex; i++) {
      const prev = progress[days[i]]; if (!prev) continue;
      const was = prev.byPkg[e.K.id];
      if (!was || was.actual == null || was.unseen) continue;
      if (!best || was.actual > best.pct) best = { pct: was.actual, on: days[i], row: was };
    }
    if (!best) return;
    if (!R.unseen && R.actual != null && R.actual >= best.pct) return;   // today is the best
    const wasUnseen = R.unseen;
    R.actual = best.pct; R.unseen = false;
    R.carried = { from: best.on, pct: best.pct,
      why: wasUnseen
        ? "this round did not reach it. It was " + best.pct + "% on " + best.on +
          " and work does not un-happen"
        : "this round read it lower than " + best.on + " did, which on a sampled walk is " +
          "a difference between readers rather than work coming down" };
    if (best.row.inferred) R.inferred = best.row.inferred;
    e.K.tasks.forEach(t => { const row = byTask[t.id];
      if (!row || row.actual == null || row.actual < best.pct) {
        if (row) { row.actual = best.pct; row.unseen = false; row.carried = R.carried; } } });
  });

  // ---- WHAT THE REST OF THE FLOOR PROVES ------------------------------
  // Run AFTER every package has a number, and read from those numbers rather
  // than re-deriving them, so the proof quoted on screen is the same figure
  // the row above it shows.
  //
  // It fires on a reading of NOUGHT as readily as on no reading at all,
  // because for this handful of packages nought is what the camera says
  // either way. A core cut is a hole; once the pipe is through it and it is
  // fire-sealed there is nothing left to photograph. A demolition finished
  // in June leaves no trace but the new wall standing where the old one was.
  // These are not packages that are hard to see. They are packages that stop
  // existing the moment they succeed, and the list of them is the whole of
  // platform/kb/precedence.js.
  const pctOf = (c) => { const e = pkgOf[c]; return e && e.row.actual != null ? e.row.actual : null; };
  Object.keys(pkgOf).forEach(code => {
    const e = pkgOf[code], R = e.row;
    if (R.track === false) return;
    if (!(R.unseen || R.actual === 0)) return;
    const inf = PREC.inferFor(code, pctOf);
    if (!inf) return;
    R.actual = inf.pct; R.unseen = false; R.inferred = inf;
    e.K.tasks.forEach(t => { const row = byTask[t.id];
      if (row) { row.actual = inf.pct; row.unseen = false; row.inferred = inf; } });
  });

  // ---- AND THEN WHAT A PERSON ACTUALLY SAID ---------------------------
  // An inference nobody can correct is a lie with a citation. Every figure
  // above is marked on the screen and one click replaces it with this, which
  // is never argued with again.
  Object.keys(pkgOf).forEach(code => {
    const ans = said[code]; if (!ans || typeof ans.pct !== "number") return;
    if (ans.on && ans.on > day) return;              // answered about a later day
    const e = pkgOf[code], R = e.row;
    R.actual = ans.pct; R.unseen = false; R.inferred = null;
    R.confirmed = { pct: ans.pct, by: ans.by || "site", on: ans.on || null, note: ans.note || null };
    e.K.tasks.forEach(t => { const row = byTask[t.id];
      if (row) { row.actual = ans.pct; row.unseen = false; row.inferred = null;
                 row.confirmed = R.confirmed; } });
  });

  // the category rows were rolled before any of that, so roll them again
  for (const C of wbs) {
    const kids = C.packages.map(k => byPkg[k.id]).filter(Boolean);
    if (!kids.length) continue;
    const wC = kids.reduce((t, r) => t + (r.w || 0), 0);
    byCat[C.id] = { planned: roll(kids, day, "planned"), actual: roll(kids, day, "actual"),
      w: wC, weight: Math.round(wC * 1000) / 10,
      value: kids.reduce((t, r) => t + (r.value || 0), 0),
      manDays: kids.reduce((t, r) => t + (r.manDays || 0), 0),
      durWD: C.durWD, track: C.packages.some(k => k.track !== false),
      unseen: kids.every(r => r.unseen),
      inferred: kids.some(r => r.inferred) ? { inferred: true,
        confidence: kids.filter(r => r.inferred).reduce((w, r) =>
          w === "low" || r.inferred.confidence === "low" ? "low"
          : w === "medium" || r.inferred.confidence === "medium" ? "medium" : "high", "high"),
        why: "some of the work under this heading is read from what the rest of the floor " +
             "proves, because no photograph can show it" } : null,
      confirmed: kids.some(r => r.confirmed) || null };
  }

  // THE PERCENTAGE IS THE SITE'S, AND ONLY THE SITE'S. Design, approvals,
  // orders, manufacture and delivery are on the programme because they drive
  // the dates, but they are not work anybody can photograph. Counting them
  // in the completion figure would let a signed drawing raise the number
  // while nothing on the floor moved, and — far worse — would drag the site
  // team's own percentage down for a PO somebody else has not raised. So the
  // roll is over tracked categories only, and the front end shows dates
  // without ever showing a per cent.
  const all = Object.values(byCat).filter(c => c.track);
  // A PER CENT OFF ONE PIN IS NOT A PER CENT OF THE FLOOR. On 31 July the
  // walk covered a single pin, that pin's work was done, and the programme
  // read 100% complete — a sampling artefact that would have been quoted in
  // a meeting. The number still stands, because it is what was seen, but it
  // travels with how much of the floor was actually looked at and how much
  // that is worth. See platform/core/assume.js for the three levels.
  const walked = Object.keys(walk[day] || {}).length;
  const cover = PINS_ON_FLOOR ? Math.min(1, walked / PINS_ON_FLOOR) : 0;
  progress[day] = { byTask, byPkg, byCat,
    // `actual` is what a card shows. `actualRaw` is what anything subtracting
    // two days must use — see rollRaw. Both come off the same weighted sum, so
    // this is one number shown two ways, never a second reading.
    overall: { planned: roll(all, day, "planned"), actual: roll(all, day, "actual"),
      plannedRaw: rollRaw(all, day, "planned"), actualRaw: rollRaw(all, day, "actual") },
    pinsWalked: walked, pinsTotal: PINS_ON_FLOOR,
    coverage: Math.round(cover * 100),
    confidence: cover >= 0.8 ? "high" : cover >= 0.4 ? "medium" : "low",
    why: cover >= 0.8 ? "the walk covered the floor"
       : cover >= 0.4 ? "the walk covered " + Math.round(cover * 100) + "% of the pins — the rest is unseen, not undone"
       : "only " + walked + " of " + PINS_ON_FLOOR + " pins were walked. This is what those pins showed, " +
         "not a reading of the floor" };
}

// ---- WHERE THIS LANDS IF NOTHING CHANGES -------------------------------
// The programme says where the job SHOULD be. The walk says where it IS.
// Neither answers the question a client actually asks in August, which is
// "so when will it be finished?" That is a third number and it comes from
// the site's own measured rate, not from anybody's intention.
//
// Only full-coverage walks are used. A day when one pin was photographed
// says nothing about the floor, and letting it into a regression makes the
// projection lurch by weeks on a day nobody worked.
const projection = (() => {
  const good = days.filter(d => (progress[d].coverage || 0) >= 80)
    .map(d => ({ day: d, pct: progress[d].overall.actual }))
    .filter(r => r.pct != null);
  if (good.length < 3) return null;
  const wdFrom = (a, b) => { let n = 0; for (let d = a; d < b; d = addDays(d, 1)) if (isWD(d)) n++; return n; };
  const base = good[0].day;
  const xs = good.map(r => wdFrom(base, r.day)), ys = good.map(r => r.pct);
  const n = xs.length, sx = xs.reduce((a, b) => a + b, 0), sy = ys.reduce((a, b) => a + b, 0);
  const sxx = xs.reduce((a, x) => a + x * x, 0), sxy = xs.reduce((a, x, i) => a + x * ys[i], 0);
  const denom = n * sxx - sx * sx;
  const slope = denom ? (n * sxy - sx * sy) / denom : 0;      // points per working day
  const last = good[good.length - 1];
  if (slope <= 0.01) return { rate: Number(slope.toFixed(3)), from: base, at: last.day,
    pct: last.pct, finish: null, readings: good.length,
    why: "the last " + good.length + " full walks show no measurable gain, so no finish can be " +
         "projected from them. That is a reading about the site, not about the maths" };
  const need = Math.max(0, 100 - last.pct);
  const wdLeft = Math.ceil(need / slope);
  let d = last.day, k = wdLeft;
  while (k > 0) { d = addDays(d, 1); if (isWD(d)) k--; }
  const overWD = TARGETDATE && d > TARGETDATE ? wdFrom(TARGETDATE, d) : 0;
  return {
    rate: Number(slope.toFixed(2)), from: base, at: last.day, pct: last.pct,
    readings: good.length, workingDaysLeft: wdLeft, finish: d,
    overWD, target: TARGETDATE,
    why: "the site has gained " + slope.toFixed(2) + " points of completion per working day across " +
         good.length + " full walks between " + base + " and " + last.day + ". At that rate the " +
         "remaining " + Math.round(need) + " points take " + wdLeft + " working days and the floor " +
         "finishes " + d + ".",
    // the same arithmetic run the other way: what rate WOULD hit the date
    needed: (() => {
      if (!TARGETDATE || TARGETDATE <= last.day) return null;
      const wd = wdFrom(last.day, TARGETDATE);
      return wd > 0 ? { rate: Number((need / wd).toFixed(2)), workingDays: wd,
        times: Number((need / wd / slope).toFixed(1)) } : null; })(),
  };
})();

const out = {
  builtAt: new Date().toISOString(),
  start: tasks.reduce((m, t) => t.ES < m ? t.ES : m, tasks[0].ES),
  finish: tasks.reduce((m, t) => t.EF > m ? t.EF : m, tasks[0].EF),
  builtToDate: !!Object.keys(builtTo).length,
  landsOnDate: !!(target && target.built && target.built.landed),
  // WHY IT CANNOT, IN ONE SENTENCE. A fixed-duration tail — testing, snagging,
  // the handover file, the deep clean — does not shorten because more people
  // turn up, so past a point the labour lever simply stops working.
  // THE RESIDUAL IS MEASURED ON THE CONDITIONS OF HANDOVER, NOT ON EVERYTHING.
  // The as-builts and the O&M file follow the keys by a month on every job
  // ever handed over; counting them as lateness measures the wrong thing.
  residual: (target && target.built && !target.built.landed && target.built.conditionsBy)
    ? { finish: target.built.conditionsBy, runsOnTo: target.built.runsOnTo,
        overWD: (() => { let n = 0; for (let d = Date.parse(TARGETDATE + "T00:00:00Z");
          d <= Date.parse(target.built.conditionsBy + "T00:00:00Z"); d += 86400000)
          if (new Date(d).getUTCDay() !== 0) n++; return Math.max(0, n - 1); })(),
        why: "the conditions of handover — testing, the pre-snag and consultant walk, extinguishers " +
             "and signage, the deep clean — close then, compressed as far as labour can take them. " +
             "De-snagging and the handover file run on to " + target.built.runsOnTo + ", as they always do" }
    : null,
  weights: WEIGHTS,
  progressBasis: BASIS,
  projection,
  // what the capacity model decided, so the page can say it in one line
  shift: target && target.built ? { id: target.built.shift, name: target.built.shiftName,
    window: target.built.shiftWindow, fronts: target.built.fronts,
    peakWorkers: target.built.peakWorkers, peakCeiling: target.built.peakCeiling,
    cost: target.built.costMultiple, why: target.built.shiftWhy } : null,
  spill: target ? target.spill : null,
  siteWorkBy: target ? target.siteWorkBy : null,
  queries: { procurement: procurementQueries, scope: (plan.queries || {}).scope || [],
    // the packages the walk can never answer for, biggest first: answering
    // these is the only way their share of the number ever becomes real
    unseeable: (() => {
      const last = days[days.length - 1]; if (!last) return [];
      const pr = progress[last]; const out = [];
      wbs.forEach(C => C.packages.forEach(K => {
        if (K.track === false) return;
        const r = pr.byPkg[K.id]; if (!r || !r.noRoute) return;
        if (r.inferred || r.confirmed) return;        // already answered another way
        out.push({ id: "q:see:" + K.code, code: K.code, package: K.name, category: C.name,
          importance: r.weight >= 1 ? "high" : "medium",
          weight: r.weight, askOf: "Site",
          ask: "How far along is " + K.name.toLowerCase() + "? " + (r.weight >= 0.5
            ? "It is " + r.weight + "% of the job, so this one figure moves the total by up to " +
              (r.weight * (100 - (r.actual || 0)) / 100).toFixed(1) + " points."
            : "Nobody can photograph it, so the programme carries it at " + (r.actual || 0) + "%."),
          why: r.noRoute });
      }));
      return out.sort((a, b) => b.weight - a.weight);
    })() },
  criticalPath: P.criticalPath || [],
  counts: { categories: wbs.length, packages: wbs.reduce((n, c) => n + c.packages.length, 0),
            tasks: tasks.length, links: (P.edges || []).length },
  days, wbs, progress,
  // WHAT KIND OF SCHEDULE THIS IS, SAID ON THE FACE OF IT. These bars are the
  // UNRESOURCED bound: one gang per trade per room, as many gangs as the work
  // wants, nothing constraining them but the dependency links. It is the
  // earliest the job could possibly finish, not a plan anybody can staff — and
  // a chart that does not say so gets read as a promise. The resourced sweep
  // is in plan.json under manpower and finishes LATER, because the floor
  // cannot hold the labour.
  basis: { kind: "unresourced",
    why: "one gang per trade per room, unlimited gangs, constrained only by the dependency links — " +
         "the earliest this scope could finish, not a plan anybody has staffed",
    resourced: (() => { const m = plan.manpower; if (!m || !m.rows) return null;
      const best = m.rows.slice().sort((a, b) => a.projectEnd < b.projectEnd ? -1 : 1)[0];
      return { bestEnd: best.projectEnd, fronts: best.fronts, peakWorkers: best.peakWorkers,
        hits: !!(m.recommend && m.recommend.hits) }; })() },
  // THE ENGINE'S OWN DOUBT TRAVELS WITH THE DATE IT PRODUCED
  credible: plan.credible !== false,
  suspect: (plan.suspect || []).map(x => ({ code: x.code, days: x.days, qty: Math.round(x.qty),
    unit: x.unit, lines: x.lines })),
  suspectCounts: (((plan.scope || {}).suspectCounts) || []).filter(x => x.qty >= 20)
    .map(x => ({ code: x.code, qty: x.qty, repeats: x.repeats, counted: x.counted })),
  // the contractual date, so the chart can draw the line everything is measured to
  handover: (() => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, "settled.json"), "utf8")).handover; }
                     catch (e) { return null; } })(),
};
fs.writeFileSync(OUT, JSON.stringify(out));

// ---- what it built -------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log("THE PROGRAMME");
console.log("  " + out.counts.categories + " categories · " + out.counts.packages + " packages · " +
  out.counts.tasks + " tasks · " + out.counts.links + " dependency links");
console.log("  " + out.start + " → " + out.finish +
  (out.handover ? "   (measured to " + out.handover.date + ")" : ""));
console.log("\nBY CATEGORY");
wbs.forEach(C => console.log("  " + pad(C.name, 34) + C.ES + " → " + C.EF +
  String(C.packages.length).padStart(4) + " pkg" + String(C.durWD).padStart(5) + "d" +
  (C.critical ? "   critical" : "")));
const last = days[days.length - 1];
if (last) {
  const o = progress[last].overall;
  console.log("\nAGAINST THE SITE, " + last + "  (" + progress[last].pinsWalked + " pins walked)");
  console.log("  planned " + o.planned + "%   ·   actual " + o.actual + "%   ·   " +
    (o.actual == null ? "no camera could speak to any of it"
     : o.actual >= o.planned ? "ahead by " + (o.actual - o.planned) + " points"
     : "behind by " + (o.planned - o.actual) + " points"));
}
console.log("\n→ " + OUT);
