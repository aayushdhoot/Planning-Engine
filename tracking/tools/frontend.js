#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/frontend.js . THE WORK THAT HAPPENS BEFORE THE WORK
//   node tools/frontend.js [--as 2026-08-10]
//
// Builds two files, because they are two views of one chain:
//   design.json      drawings, samples and approvals — the desk work
//   procurement.json the six stages between a decision and a delivery
//
// A fit-out is lost at the front end and blamed on the back. Nine weeks of
// outdoor unit lead time does not start when somebody raises the purchase
// order — it starts when the shop drawing is approved, which cannot happen
// until the sample is approved, which cannot happen until somebody chooses
// a make. Four desk activities, none of which anybody photographs, and by
// the time the gap shows on site it is eleven weeks old.
//
// THE EVIDENCE THIS HAS
//   . a sampling and material approval register, 81 rows, each with a
//     status somebody typed: Not Started, Sample Arranged, Under Revision,
//     Awaiting, CLOSE.
//   . 385 approved makes, named against a material.
//   . a GFC drawing tracker.
//   . target closure dates from the weekly tracker.
//   . the levelled programme, which says when each package is installed —
//     and therefore the day the front end has to be finished by.
//
// THE LAWS
//   . NEITHER PAGE IS SCORED. Design and procurement are scheduled and
//     owned, never counted towards site completion. That number is what
//     is built on the floor.
//   . A STATUS SOMEBODY TYPED BEATS ANYTHING THE ENGINE INFERS, and the
//     row says which it is.
//   . A REGISTER ROW THAT MATCHES NO PACKAGE IS STILL SHOWN. A sample
//     approval for something the engine cannot place is a real approval
//     for real material, and dropping it is how a tracker starts lying.
//   . NO DATE IS INVENTED FOR A STAGE NOBODY DATED. The chain gives a
//     latest-finish for every stage, which is a deadline, not a claim
//     that anybody is working to it.
// ===================================================================
const fs = require("fs"), path = require("path");
const PROC = require(path.join(__dirname, "../platform/kb/procure.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const facts = (read("facts.json") || {}).facts || [];
const sched = read("schedule.json");
const res   = read("resources.json");
const plan  = read("plan.json");

const argAs = (() => { const i = process.argv.indexOf("--as");
  return i > 0 ? process.argv[i + 1] : null; })();
const asOf = argAs || new Date().toISOString().slice(0, 10);
const days = (a, b) => a && b ? Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) : null;

// ---- what the register says, in the words somebody typed ----------------
// FIVE STATES, MAPPED TO THREE. "CLOSE" is done, "Not Started" is not
// started, and everything in between is somewhere in the middle — which is
// the only honest reduction, because "Sample Arranged" is not an approval
// and must never read as one.
const SETTLED = /^(close|closed|approved|complete)/i;
const MOVING  = /^(sample arranged|under revision|awaiting|submitted|in progress)/i;
const stateOf = (v) => SETTLED.test(String(v || "")) ? "settled"
                     : MOVING.test(String(v || "")) ? "moving" : "not started";

const register = (() => {
  const bySubject = {};
  facts.filter(f => f.role === "register status" && f.subject).forEach(f => {
    const k = String(f.subject).trim();
    const r = bySubject[k] = bySubject[k] || { subject: k, status: null, makes: [],
      doc: (f.source || {}).doc || null, closeBy: null };
    r.status = String(f.value);
  });
  facts.filter(f => f.role === "approved make" && f.subject).forEach(f => {
    const k = String(f.subject).trim();
    const r = bySubject[k] = bySubject[k] || { subject: k, status: null, makes: [],
      doc: (f.source || {}).doc || null, closeBy: null };
    if (r.makes.indexOf(String(f.value)) < 0) r.makes.push(String(f.value));
  });
  facts.filter(f => f.role === "target closure date" && f.subject).forEach(f => {
    const k = String(f.subject).trim();
    const r = bySubject[k]; if (!r) return;
    if (!r.closeBy || f.value < r.closeBy) r.closeBy = String(f.value);
  });
  return Object.values(bySubject);
})();

// ---- and which package on the programme it is about ---------------------
// A LOOSE MATCH IS DECLARED AS ONE. "Metal Grid Ceiling" and the package
// "Metal ceiling" are the same thing to a person and not to a string
// comparison, so the match is on words and the row says it was matched
// that way rather than stated.
const pkgs = (res && res.rows) || [];
const STOP = new Set(["and", "the", "for", "with", "system", "works", "work"]);
const wordsOf = (s) => String(s || "").toLowerCase().split(/\W+/)
  .filter(w => w.length > 3 && !STOP.has(w));
// ONE SHARED WORD IS NOT A MATCH. "Board room chair" and "Distribution
// boards" share "board", and on that evidence the register put a chair into
// the electrical panel package. A match needs two words, or one long word
// matched whole — and where two packages tie there is no match at all,
// because a wrong owner is worse than none.
const matchPkg = (subject) => {
  const w = wordsOf(subject); if (!w.length) return null;
  const scored = pkgs.map(p => {
    const pw = wordsOf(p.name);
    let whole = 0, part = 0;
    w.forEach(x => { if (pw.indexOf(x) >= 0) whole++;
      else if (pw.some(y => y.indexOf(x) === 0 || x.indexOf(y) === 0)) part++; });
    return { p, score: whole * 2 + part, whole, part };
  }).filter(s => s.score > 0).sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const top = scored[0];
  const strong = top.whole >= 2 || (top.whole === 1 && top.part >= 1) ||
                 (top.whole === 1 && w.length === 1);
  if (!strong) return null;
  if (scored[1] && scored[1].score === top.score) return null;   // a tie is not a match
  return { code: top.p.code, name: top.p.name, on: top.score };
};

const design = register.map(r => {
  const m = matchPkg(r.subject);
  const p = m ? pkgs.find(x => x.code === m.code) : null;
  // THE DEADLINE IS THE MATERIAL'S, not the register's. A sample approved
  // the week the material was needed is a sample approved too late.
  const neededOn = p ? p.neededOn : null;
  const orderBy  = p ? p.orderBy : null;
  const due = orderBy || r.closeBy || null;
  // A ROW WITH NO STATUS IS NOT A ROW SOMEBODY HAS NOT STARTED. Most of
  // these come off the approved-make list, which is a specification and not
  // a workflow — counting them as "not started" invents 135 open actions.
  const st = r.status ? stateOf(r.status) : null;
  return {
    subject: r.subject, status: r.status, state: st,
    tracked: !!r.status,
    makes: r.makes, hasMake: r.makes.length > 0,
    closeBy: r.closeBy,
    package: m ? m.code : null, packageName: m ? m.name : null,
    matchedOnWords: !!m,
    neededOn, orderBy, due,
    overdue: !!(r.status && due && due < asOf && st !== "settled"),
    lateBy: r.status && due && due < asOf && st !== "settled" ? days(due, asOf) : 0,
    value: p ? p.value : null,
  };
}).sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);

// ---- the six stages, package by package ---------------------------------
// Taken off the built programme rather than recomputed, so this page and the
// schedule cannot drift apart.
// THE SCHEDULE EMITS ONE ROW PER STAGE, not one per package: `code` is the
// stage (pkg_design, pkg_approval …) and `name` is the package it is for.
// Grouping by code gives six enormous rows and tells nobody anything.
const byPkgName = {};
if (sched) sched.wbs.forEach(c => c.packages.forEach(k => {
  const staged = (k.rooms || []).filter(r => r.stage);
  if (!staged.length) return;
  const g = byPkgName[k.name] = byPkgName[k.name] || { name: k.name, trade: k.trade, stages: [] };
  staged.forEach(s => {
    const meta = PROC.BY_ID ? PROC.BY_ID[s.stage] : null;
    g.stages.push({ id: s.stage, name: s.name || (meta && meta.name) || s.stage,
      owner: meta ? meta.owner : null, ownerName: meta ? meta.ownerName : null,
      ES: s.ES, EF: s.EF, durWD: s.durWD,
      // A STAGE WHOSE FINISH IS BEHIND US IS A DEADLINE THAT PASSED. It is
      // not a claim that the stage did not happen — nobody records that.
      passed: !!(s.EF && s.EF < asOf), why: meta ? meta.why : null });
  });
}));
const ORDER = (PROC.CHAIN || []).map(s => s.id);
const chains = Object.values(byPkgName).map(g => {
  const p = pkgs.find(x => x.name === g.name) || null;
  const reg = design.find(d => d.packageName === g.name) || null;
  g.stages.sort((a, b) => ORDER.indexOf(a.id) - ORDER.indexOf(b.id));
  return {
    code: p ? p.code : null, name: g.name, trade: g.trade,
    value: p ? p.value : null, leadWeeks: p ? p.leadWeeks : null,
    neededOn: p ? p.neededOn : null,
    firstStage: g.stages[0] ? g.stages[0].ES : null,
    lastStage: g.stages[g.stages.length - 1] ? g.stages[g.stages.length - 1].EF : null,
    stages: g.stages,
    register: reg ? { status: reg.status, state: reg.state, makes: reg.makes } : null,
    onSite: p ? p.onSite : false,
    answered: p ? p.answered : false,
  };
}).sort((a, b) => (b.value || 0) - (a.value || 0));

// ---- who owes what ------------------------------------------------------
const byOwner = {};
chains.forEach(c => c.stages.forEach(s => {
  if (!s.owner) return;
  const o = byOwner[s.owner] = byOwner[s.owner] || { owner: s.owner, name: s.ownerName,
    stages: 0, passed: 0, packages: {} };
  o.stages++; if (s.passed && !c.onSite && !c.answered) o.passed++;
  o.packages[c.name] = true;
}));
const owners = Object.values(byOwner).map(o => ({ owner: o.owner, name: o.name,
  stages: o.stages, passed: o.passed, packages: Object.keys(o.packages).length }))
  .sort((a, b) => b.passed - a.passed);

const tracked = design.filter(d => d.tracked);
const counts = {
  rows: design.length,
  register: tracked.length,
  specOnly: design.length - tracked.length,
  settled: tracked.filter(d => d.state === "settled").length,
  moving: tracked.filter(d => d.state === "moving").length,
  notStarted: tracked.filter(d => d.state === "not started").length,
  overdue: design.filter(d => d.overdue).length,
  withMake: design.filter(d => d.hasMake).length,
  unmatched: tracked.filter(d => !d.package).length,
  chains: chains.length,
  chainsPassed: chains.filter(c => !c.onSite && !c.answered && c.stages.some(s => s.passed)).length,
};

fs.writeFileSync(path.join(ENGINE, "design.json"), JSON.stringify({
  builtAt: new Date().toISOString(), asOf, counts, rows: design,
  why: "the status is the word somebody typed into the sampling register. The deadline is " +
       "the material's own order-by date, not the register's target — a sample approved the " +
       "week the material was needed is a sample approved too late. Nothing here is scored " +
       "towards site completion: design is scheduled and owned, never counted",
}));

fs.writeFileSync(path.join(ENGINE, "procurement.json"), JSON.stringify({
  builtAt: new Date().toISOString(), asOf, counts, owners, chains,
  stages: PROC.CHAIN,
  why: "six stages between a decision and a delivery, back-scheduled from the day the " +
       "levelled programme installs the package. A stage whose finish is behind us is a " +
       "deadline that passed, never a claim that the stage did not happen — nothing on " +
       "this engine records that",
}));

// ---- what it found -------------------------------------------------------
const cr = (n) => n >= 1e7 ? "Rs " + (n / 1e7).toFixed(2) + " Cr"
                : n >= 1e5 ? "Rs " + (n / 1e5).toFixed(1) + " L" : "Rs " + Math.round(n || 0);
console.log("\n  THE SAMPLING AND APPROVAL REGISTER  (as on " + asOf + ")");
console.log("    " + counts.register + " rows somebody keeps a status on · " + counts.settled +
  " closed · " + counts.moving + " moving · " + counts.notStarted + " not started");
console.log("    " + counts.specOnly + " more name an approved make and carry no status — a " +
  "specification, not a workflow");
console.log("    " + counts.unmatched + " of the tracked rows match no package the engine schedules");
console.log("\n  PAST THE DATE THE MATERIAL HAD TO BE ORDERED: " + counts.overdue);
design.filter(d => d.overdue).slice(0, 12).forEach(d => console.log("    " +
  String(d.lateBy).padStart(3) + "d  " + String(d.status).padEnd(16) +
  d.subject.slice(0, 38).padEnd(39) + (d.packageName || "—")));

console.log("\n  THE SIX STAGES  ·  " + counts.chains + " packages carry a full chain");
owners.forEach(o => console.log("    " + String(o.name).padEnd(16) + String(o.stages).padStart(4) +
  " stages across " + String(o.packages).padStart(3) + " packages · " + o.passed +
  " whose deadline has passed with nothing seen on site"));
console.log("\n→ engines/skf/design.json, engines/skf/procurement.json\n");
