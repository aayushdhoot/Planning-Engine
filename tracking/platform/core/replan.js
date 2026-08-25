// ===================================================================
// DnB-OS . platform/core/replan.js . YESTERDAY'S TRUTH, TODAY'S PLAN
// Phase 10. The loop closes here. Confirmed site facts become actuals,
// the schedule is re-solved against them, and the movement is measured
// against a FROZEN original . the honest slipped date and the recovery
// option side by side, each with what it costs.
//
//   actuals(status, opts)          confirmed reports -> takt pins (+ refusals)
//   causeFor(fact, task, plan)     ours | client | free_issue | statutory
//   compare(original, current)     what moved, and what drove it
//   raImpact(orig, curr, kt, heads) which payment gates moved, and their value
//   options(ctx)                   recovery moves, re-solved, never hand-waved
//   propose(ctx)                   the whole revision . PROPOSED, not applied
//   shouldRun(lastRunDay, readDays) the once-a-day cadence
//
// THE LAWS
//   . ONLY A NAMED HUMAN'S REPORT BECOMES AN ACTUAL. A photograph is
//     evidence, not confirmation. Where a read contradicts a report the
//     engine uses the REPORT . somebody is accountable for it . and
//     raises the contradiction as a question. It never silently prefers
//     one over the other, and it never re-plans work that already
//     happened just because no camera could see it.
//   . A CAUSE IS NEVER GUESSED. ours / client / free-issue / statutory
//     comes from the blocking dependency, or from a declared bridge over
//     the reason given. An unmapped reason is reported as "cause not
//     established" and the slip is still shown . it simply carries no
//     claim. A wrong cause tag on an EOT claim is worse than no tag.
//   . THE ORIGINAL IS FROZEN. A revision is measured against the
//     baseline and never mutates it. Run the same facts twice and the
//     same numbers come back.
//   . THE ENGINE PROPOSES. Nothing here republishes a plan. A human
//     accepts a revision, exactly as they accept an action in Phase 9.
//   . AN OPTION THAT CANNOT RECOVER SAYS SO. Every option is measured by
//     RE-SOLVING, not by arithmetic on a napkin. If the best one still
//     lands past the committed date, the engine says the date is gone.
//     A recovery plan that quietly does not recover is the single most
//     expensive thing this engine could produce.
//   . NO CLOCK IN HERE. `today` is passed in, so a revision can be
//     reproduced, guarded, and argued about months later.
//
// Pure: facts, a baseline and a solver in . a proposal out.
// ===================================================================

;(function (root) {

const req = (typeof require !== "undefined");
const CAL = req ? require("../kb/calendar.js") : (root.KB_CAL || null);

const CAUSES = ["ours", "client", "free_issue", "statutory"];

const CAUSE_LABEL = {
  ours: "ours",
  client: "client",
  free_issue: "free-issue",
  statutory: "statutory",
};

// Words a site person actually types into a hold reason, mapped to the
// four causes that matter commercially. Declared, so adding one is a line.
// Anything not in here stays unmapped and is REPORTED.
const CAUSE_WORDS = {
  client: ["client approval", "await client", "awaiting client", "client decision",
    "client instruction", "client hold", "client not ready", "client change",
    "design change by client", "client access", "access from client", "client delay",
    "approval pending from client", "sign off pending", "sign-off pending"],
  free_issue: ["free issue", "free-issue", "fi material", "client supplied",
    "client-supplied", "client material", "supplied by client", "owner supplied"],
  statutory: ["fire noc", "noc", "statutory", "authority approval", "authority permission",
    "municipal", "corporation approval", "cfo", "occupancy certificate",
    "police permission", "night work permission", "fire department"],
  ours: ["manpower", "labour shortage", "labor shortage", "our vendor", "vendor delay",
    "material not ordered", "po not released", "rework", "quality rejection",
    "sequencing", "our delay", "short delivery", "gang pulled off"],
};

// The enabling packages whose owner is NOT us. Structural, and stronger
// than any word: if the thing in front of this task is a client approval,
// the cause is the client whatever the reason field says.
const DEPT_CAUSE = { pkg_approval: "client", pkg_design: null, pkg_po: null,
  pkg_submittal: null, pkg_mfg: null, pkg_delivery: null };

function causeFromWords(text) {
  const k = String(text == null ? "" : text).trim().toLowerCase();
  if (!k) return null;
  // longest phrase first, so "client supplied" beats a bare "client"
  const all = [];
  for (const c of CAUSES) for (const w of (CAUSE_WORDS[c] || [])) all.push({ c, w });
  all.sort((a, b) => b.w.length - a.w.length);
  for (const x of all) if (k.indexOf(x.w) !== -1) return x.c;
  return null;
}

// fact: the human's report on this task. task: the planned task. plan: for deps.
function causeFor(fact, task, plan) {
  // 1. structural: what is in front of it
  const byId = {};
  for (const t of ((plan && plan.tasks) || [])) byId[t.id] = t;
  const preds = (task && (task.preds || task.deps || [])) || [];
  for (const d of preds) {
    const p = byId[typeof d === "string" ? d : (d && (d.id || d.from))];
    if (!p) continue;
    const dc = DEPT_CAUSE[p.code];
    if (dc) return { cause: dc, from: "dependency", ref: p.id,
      why: "the work in front of it is " + p.code + ", which is not ours to finish" };
  }
  // 2. the words the site gave us
  const w = causeFromWords(fact && fact.reason);
  if (w) return { cause: w, from: "reason", ref: null,
    why: "from the reason given: “" + String(fact.reason).trim() + "”" };
  // 3. honestly nothing
  return { cause: null, from: null, ref: null,
    why: (fact && fact.reason)
      ? "the reason given does not map to a cause the engine knows, so this slip carries no claim"
      : "no reason was given, so this slip carries no claim" };
}

// ---- confirmed reports become actuals --------------------------------
// status: the spine's taskStatus store, { taskId: {state, pct, day, startedOn,
// reason, by} }. Returns the pins the solver can trust, and . just as
// important . everything it REFUSED to turn into a date, with why.
function actuals(status, opts) {
  const o = opts || {};
  const byId = {};
  for (const t of ((o.plan && o.plan.tasks) || [])) byId[t.id] = t;

  const pins = [], refused = [], holds = [];
  for (const id of Object.keys(status || {})) {
    const f = status[id] || {};
    const t = byId[id];
    if (!t) { refused.push({ id, why: "no task in the published plan carries this id" }); continue; }

    if (f.state === "done") {
      // a finish with no date cannot pin anything. Guessing today would
      // silently rewrite history every time the app is opened.
      if (!f.day) { refused.push({ id, name: t.name, zone: t.zone, state: "done",
        why: "reported finished with no date, so there is nothing to pin the plan to",
        ask: "On what day did " + (t.name || id) + " actually finish?" }); continue; }
      // A finish with no reported start would pin as == af, and the solver
      // reads that as a ONE DAY task . a ten-day activity collapses to a
      // spike in the manpower curve. The planned start is used instead:
      // it changes no date anybody is accountable for, and the finish, the
      // fact that actually matters, is the one the site gave us.
      pins.push({ id, as: f.startedOn || t.ES || f.day, af: f.day,
        startAssumed: !f.startedOn && !!t.ES });
      continue;
    }
    if (f.state === "in_progress") {
      if (f.pct == null && !f.startedOn) { refused.push({ id, name: t.name, zone: t.zone,
        state: "in_progress",
        why: "reported under way with neither a start date nor a percentage, so how much is left is unknown",
        ask: "When did " + (t.name || id) + " start, or how far along is it?" }); continue; }
      pins.push({ id, as: f.startedOn || null,
        pct: f.pct == null ? null : Math.min(0.99, Math.max(0, f.pct / 100)) });
      continue;
    }
    if (f.state === "on_hold") {
      // A hold with a release date is a floor the solver can honour. A hold
      // with no release date is not a date at all . it is a question.
      const c = causeFor(f, t, o.plan);
      if (f.releaseOn) holds.push({ code: t.code, zone: t.zone, notBefore: f.releaseOn,
        id, cause: c.cause, reason: f.reason || null });
      else refused.push({ id, name: t.name, zone: t.zone, state: "on_hold",
        cause: c.cause, causeWhy: c.why, reason: f.reason || null,
        why: "on hold with no release date, so the engine cannot say when it restarts",
        ask: "When does " + (t.name || id) + " come off hold?" });
      continue;
    }
    // not_started and the derived `delayed` are not reports of anything
    // that happened, so they pin nothing.
  }
  pins.sort((a, b) => (a.id < b.id ? -1 : 1));
  refused.sort((a, b) => (a.id < b.id ? -1 : 1));
  holds.sort((a, b) => (a.id < b.id ? -1 : 1));
  return { pins, refused, holds };
}

// ---- where a photograph disagrees with a person ----------------------
// The read is evidence; the person is accountable. The engine keeps the
// person's report AND raises the disagreement. It never picks silently.
function contested(status, dayDiff, plan) {
  const byId = {};
  for (const t of ((plan && plan.tasks) || [])) byId[t.id] = t;
  const notSeen = {};
  for (const no of Object.keys((dayDiff && dayDiff.byPin) || {})) {
    const p = dayDiff.byPin[no];
    if (p.unmapped || !p.read) continue;
    for (const r of p.rows) if (r.verdict === "not_seen") notSeen[p.zone + "|" + r.code] = p.pin;
  }
  const out = [];
  for (const id of Object.keys(status || {})) {
    const f = status[id] || {}, t = byId[id];
    if (!t || (f.state !== "done" && f.state !== "in_progress")) continue;
    const pin = notSeen[t.zone + "|" + t.code];
    if (pin == null) continue;
    out.push({ id, name: t.name, zone: t.zone, code: t.code, pin,
      reported: f.state, by: f.by || null,
      question: (t.name || id) + " in " + t.zone + " is reported " +
        (f.state === "done" ? "finished" : "under way") +
        (f.by ? " by " + f.by : "") + ", and the read from pin " + pin +
        " did not show it. The plan is using the report. Which is right?" });
  }
  return out.sort((a, b) => (a.id < b.id ? -1 : 1));
}

// ---- what moved -------------------------------------------------------
function endOf(plan) {
  let e = null;
  for (const t of ((plan && plan.tasks) || [])) if (t.EF && (!e || t.EF > e)) e = t.EF;
  return e;
}

function compare(original, current, opts) {
  const o = opts || {};
  const cal = o.cal, byId = {};
  for (const t of ((original && original.tasks) || [])) byId[t.id] = t;

  const moved = [];
  for (const t of ((current && current.tasks) || [])) {
    const b = byId[t.id];
    if (!b || !b.EF || !t.EF || b.EF === t.EF) continue;
    const days = cal ? signedWorkingDays(b.EF, t.EF, cal) : calDays(b.EF, t.EF);
    moved.push({ id: t.id, name: t.name, zone: t.zone, code: t.code,
      was: b.EF, now: t.EF, days, critical: !!t.critical });
  }
  moved.sort((a, b) => (b.days - a.days) || (a.id < b.id ? -1 : 1));

  const wasEnd = endOf(original), nowEnd = endOf(current);
  const slip = (wasEnd && nowEnd)
    ? (cal ? signedWorkingDays(wasEnd, nowEnd, cal) : calDays(wasEnd, nowEnd)) : 0;

  return { wasEnd, nowEnd, slip, moved,
    late: moved.filter(m => m.days > 0), early: moved.filter(m => m.days < 0) };
}

function calDays(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
// Working days, not calendar days, and SIGNED . a task that pulled two
// days earlier has to read as -2, not as two days of slip.
function signedWorkingDays(a, b, cal) {
  if (!CAL || !cal) return calDays(a, b);
  return a <= b ? CAL.workingDaysBetween(a, b, cal) : -CAL.workingDaysBetween(b, a, cal);
}

// ---- the money the site actually feels -------------------------------
// A day is abstract. "RA3 is 15% of the order and it just moved 12 days"
// is not. Payment gates come from the signed schedule; their value comes
// from the priced BOQ. Where either is missing the engine says so rather
// than reporting a zero.
function raImpact(original, current, kt, heads, opts) {
  const o = opts || {};
  const gates = (kt && kt.raGates) || [];
  const total = (heads || []).reduce((s, h) => s + (h && typeof h.bcs === "number" ? h.bcs : 0), 0);
  // Heads the BOQ does not price. On the real project this is site
  // preliminaries, which carries no BCS . so the gate values are a FLOOR,
  // and saying which head is missing is the difference between a number
  // somebody can act on and a number that is quietly wrong.
  const unpriced = (heads || []).filter(h => !h || typeof h.bcs !== "number")
    .map(h => (h && (h.head || h.name)) || "(unnamed)");

  const gateEnd = (plan, codes) => {
    let e = null, n = 0;
    for (const t of ((plan && plan.tasks) || [])) {
      if (codes.indexOf(t.code) === -1 || t.gate) continue;
      n++; if (t.EF && (!e || t.EF > e)) e = t.EF;
    }
    return { end: e, tasks: n };
  };

  const rows = gates.map(g => {
    const a = gateEnd(original, g.codes || []), b = gateEnd(current, g.codes || []);
    const pct = parseFloat(String(g.pay || "").replace("%", ""));
    const value = (total && !isNaN(pct)) ? Math.round(total * pct / 100) : null;
    // flagged on every row, so a value can never travel without its caveat
    const days = (a.end && b.end)
      ? (o.cal ? signedWorkingDays(a.end, b.end, o.cal) : calDays(a.end, b.end)) : null;
    return { ra: g.ra, gate: g.gate, pay: g.pay, day: g.day,
      was: a.end, now: b.end, days, tasks: b.tasks, value,
      floor: value != null && unpriced.length > 0,
      why: a.tasks ? null : "no task in the plan carries any of this gate's codes, so it cannot be tracked" };
  });

  return { rows, total: total || null, valued: !!total,
    unpriced, floor: !!total && unpriced.length > 0,
    note: !total
      ? "no head in the BOQ carries a price, so the engine reports which gates moved but not what they are worth"
      : unpriced.length
        ? "priced off the heads that carry a value; " + unpriced.join(", ") +
          " " + (unpriced.length === 1 ? "is" : "are") + " not priced in the BOQ, so these are a floor, not the full contract sum"
        : null };
}

// ---- the recovery options ---------------------------------------------
// Every option is measured by RE-SOLVING with the lever pulled. Nothing
// here is arithmetic on a napkin, and nothing claims a day it cannot show.
const LEVERS = [
  { id: "more_men", name: "Put more men on it",
    what: "raise the crew cap in every zone that is behind",
    apply: (base) => Object.assign({}, base, {
      zoneCaps: scaleCaps(base.zoneCaps, 1.5) }),
    cost: (a, b) => ({ kind: "manpower",
      say: "more gangs on the same fronts . the men have to exist and be paid" }) },
  { id: "second_shift", name: "Run a second shift on the fronts that are behind",
    what: "two shifts instead of one, which the conditions law already prices in hours",
    apply: (base) => Object.assign({}, base, {
      conditions: Object.assign({}, base.conditions || {}, { shift: "both" }) }),
    cost: () => ({ kind: "shift",
      say: "night and holiday work needs prior written permission under Cl.10, and the hours are paid at a premium" }) },
  { id: "resequence", name: "Re-sequence around it",
    what: "open more work fronts so the trades behind are not queued on one",
    apply: (base) => Object.assign({}, base, { fronts: (base.fronts || 1) + 2 }),
    cost: () => ({ kind: "congestion",
      say: "no extra men, but more trades in the same rooms at once . congestion and quality risk" }) },
];

function scaleCaps(caps, by) {
  const out = {};
  for (const k of Object.keys(caps || {})) out[k] = Math.max(1, Math.ceil((caps[k] || 1) * by));
  return out;
}

// ctx: { tasks, cal, base, solve, current, committedEnd }
//   solve(baseOpts) -> a plan. Injected, so this law never imports a solver.
function options(ctx) {
  const c = ctx || {};
  if (typeof c.solve !== "function") return { rows: [], why: "no solver was given" };
  const currEnd = endOf(c.current);

  const rows = LEVERS.map(L => {
    let plan = null, err = null;
    try { plan = c.solve(L.apply(c.base || {})); } catch (e) { err = e && e.message; }
    const end = endOf(plan);
    const buys = (end && currEnd)
      ? (c.cal ? signedWorkingDays(end, currEnd, c.cal) : calDays(end, currEnd)) : null;
    const recovers = !!(end && c.committedEnd && end <= c.committedEnd);
    return { id: L.id, name: L.name, what: L.what, end, buys: buys == null ? null : buys,
      recovers, cost: L.cost(), error: err };
  }).filter(r => !r.error);

  rows.sort((a, b) => (b.buys || 0) - (a.buys || 0));

  // THE HONESTY LAW. If nothing gets back to the committed date, say the
  // date is gone. An option list that quietly does not recover is the most
  // expensive thing this engine could hand anybody.
  const best = rows[0] || null;
  const any = rows.some(r => r.recovers);
  // reads as its own sentence on the panel and as a clause inside the
  // headline, so it starts as a sentence in both places
  const verdict = !c.committedEnd
    ? "No committed date is recorded, so nothing can be measured against it."
    : any ? "At least one of these gets back inside the committed date."
    : (best && best.buys > 0)
      ? "None of these recovers the committed date. The best of them buys back " + best.buys +
        " working day" + (best.buys === 1 ? "" : "s") + " and the date still moves."
      : "None of these recovers the committed date, and none of them buys back a day. The date has gone.";
  return { rows, best, recovers: any, verdict };
}

// ---- the cadence -------------------------------------------------------
// On demand, and once a day after the walk is read. Not once an hour: a
// revision that regenerates while somebody is reading it is noise.
function shouldRun(lastRunDay, readDays) {
  const days = (readDays || []).slice().sort();
  const latest = days[days.length - 1] || null;
  if (!latest) return { run: false, why: "no walk has been read yet" };
  if (!lastRunDay) return { run: true, day: latest, why: "the walk of " + latest + " has never been folded into the plan" };
  if (latest > lastRunDay) return { run: true, day: latest,
    why: "the walk of " + latest + " is newer than the last re-plan (" + lastRunDay + ")" };
  return { run: false, day: latest, why: "the plan already carries the walk of " + latest };
}

// ---- the whole proposal ------------------------------------------------
function propose(ctx) {
  const c = ctx || {};
  const act = actuals(c.status, { plan: c.original });
  const cmp = compare(c.original, c.current, { cal: c.cal });
  const ra = raImpact(c.original, c.current, c.kt, c.heads, { cal: c.cal });
  const con = contested(c.status, c.dayDiff, c.original);

  // AN OPTION IS MEASURED ON TOP OF REALITY, NOT INSTEAD OF IT. The first
  // draft handed the levers a baseline with no actuals in it, so every
  // option was re-solving a schedule the site had already left behind and
  // reporting days it could not actually buy.
  const withFacts = Object.assign({}, c.base || {}, { pins: act.pins, holds: act.holds });
  const opt = options({ tasks: c.tasks, cal: c.cal, base: withFacts, solve: c.solve,
    current: c.current, committedEnd: c.committedEnd });

  // A DIRECT SLIP AND A KNOCK-ON ARE DIFFERENT FACTS. A task somebody
  // reported on carries a cause and can support a claim. A task that moved
  // because the leveller re-packed the gangs AFTER those facts has not had
  // its cause "fail to be established" . its cause is the fact upstream of
  // it, and calling it unestablished reads as 90 unexplained slips.
  // A REFUSED REPORT MOVED NOTHING. Having a report is not enough . the
  // report has to have become a fact the solver actually used. A hold the
  // engine refused (no release date) still leaves its task drifting on
  // re-levelling, and tagging those days "client" would put a cause on a
  // slip the client did not cause. That is a bogus EOT claim, and it is
  // the precise failure the cause law exists to prevent.
  const byId = {};
  for (const t of ((c.original && c.original.tasks) || [])) byId[t.id] = t;
  const reported = c.status || {};
  const used = {};
  for (const p of act.pins) used[p.id] = "pin";
  for (const h of act.holds) if (h.id) used[h.id] = "hold";

  const direct = [], knockOn = [];
  for (const m of cmp.late) {
    if (reported[m.id] && used[m.id]) {
      const k = causeFor(reported[m.id], byId[m.id] || {}, c.original);
      direct.push(Object.assign({}, m, { cause: k.cause, causeFrom: k.from,
        causeWhy: k.why, fact: used[m.id] }));
    } else {
      knockOn.push(Object.assign({}, m,
        reported[m.id] ? { hadRefusedReport: true } : {}));
    }
  }
  // the tally counts DIRECT slips only . a knock-on day is claimed through
  // its root cause, never a second time on its own
  const tally = {};
  for (const x of direct) tally[x.cause || "unestablished"] = (tally[x.cause || "unestablished"] || 0) + 1;

  return {
    day: c.today || null,
    from: cmp.wasEnd, to: cmp.nowEnd, slip: cmp.slip,
    actuals: act, contested: con,
    moved: cmp.moved, late: direct, knockOn, early: cmp.early,
    causes: tally, ra, options: opt,
    // proposed, never applied. A human accepts, exactly as in Phase 9.
    accepted: false,
    line: line(cmp, opt, act, direct, knockOn),
  };
}

function line(cmp, opt, act, direct, knockOn) {
  if (!cmp.wasEnd || !cmp.nowEnd) return "There is no baseline to measure against yet.";
  const dir = cmp.slip > 0 ? "later" : cmp.slip < 0 ? "earlier" : null;
  const head = dir
    ? "The site facts move the finish to " + cmp.nowEnd + ", " + Math.abs(cmp.slip) +
      " working day" + (Math.abs(cmp.slip) === 1 ? "" : "s") + " " + dir + " than the plan on record."
    : "The site facts leave the finish where it was, on " + cmp.nowEnd + ".";
  const inside = ((direct || []).length || (knockOn || []).length)
    ? " Inside it, " + (direct || []).length + " reported task" + ((direct || []).length === 1 ? "" : "s") +
      " moved and " + (knockOn || []).length + " more shifted as the gangs re-packed around them."
    : "";
  const asked = act.refused.length
    ? " " + act.refused.length + " report" + (act.refused.length === 1 ? " is" : "s are") +
      " missing something the engine needs, so " + (act.refused.length === 1 ? "it is" : "they are") +
      " a question rather than a date."
    : "";
  // the verdict already ends in a full stop of its own
  const stop = (s) => /[.!?]$/.test(s) ? s : s + ".";
  return head + inside + (dir ? " " + stop(opt.verdict) : "") + asked;
}

const REPLAN = { CAUSES, CAUSE_LABEL, CAUSE_WORDS, DEPT_CAUSE, LEVERS,
  causeFromWords, causeFor, actuals, contested, compare, endOf, raImpact,
  options, shouldRun, propose, line };
root.CORE_REPLAN = REPLAN;
if (typeof module !== "undefined" && module.exports) module.exports = REPLAN;

})(typeof window !== "undefined" ? window : globalThis);
