#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/actions.js . EVERYTHING THAT NEEDS A PERSON
//   node tools/actions.js [--as 2026-08-10]
//
// Builds three files:
//   todo.json     one list of every open question this engine has raised
//   client.json   the subset the client or the consultant owns
//   change.json   where what we were given stopped agreeing with itself
//
// An engine that raises a question on eight different screens has raised
// it nowhere. Every module here already knows what it cannot answer — the
// material with no landing date, the assumption nobody has confirmed, the
// pin with no drawing, the trade nobody could place — and until now each
// one said so on its own page and to nobody in particular.
//
// This is the single door. One row per open question, with who owns it,
// what it blocks, and the date it stops being answerable in time.
//
// THE LAWS
//   . NOTHING IS INVENTED TO FILL THE LIST. Every row points at a module
//     that raised it and a file it came out of.
//   . A QUESTION THE SITE HAS ALREADY ANSWERED IS NOT ASKED. Material the
//     walk can see, packages somebody has dated, assumptions confirmed —
//     all gone from the list without anybody closing them by hand.
//   . BLOCKING AND MERELY OPEN ARE DIFFERENT. A blocking row stops the
//     engine moving a date. An open row does not, and saying so keeps
//     the blocking list short enough to be read.
//   . OWNERSHIP IS STATED, NEVER GUESSED. A row whose owner is not
//     derivable says "unassigned" rather than naming somebody plausible.
// ===================================================================
const fs = require("fs"), path = require("path");

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const res = read("resources.json"), design = read("design.json"), proc = read("procurement.json");
const sched = read("schedule.json"), areas = read("areas.json"), assess = read("assess.json");
const pairs = read("pairs.json"), heldDpr = read("dpr-held.json");
const mp = read("manpower.json"), plan = read("plan.json"), target = read("target.json");
const reg = read("registers.json");

const argAs = (() => { const i = process.argv.indexOf("--as");
  return i > 0 ? process.argv[i + 1] : null; })();
const asOf = argAs || new Date().toISOString().slice(0, 10);
const days = (a, b) => a && b ? Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) : null;

const rows = [];
const add = (r) => rows.push(Object.assign({
  blocking: false, owner: "unassigned", due: null, value: null,
}, r));

// ---- 1. material nobody can account for ---------------------------------
// BLOCKING, because the engine will not move a date on a number nobody gave.
// THE SAME LIST THE RESOURCES PAGE CALLS OPEN — pending or unknown, and
// nobody has said otherwise. Filtering on a different field here is how two
// screens start disagreeing about how much is outstanding.
(res ? res.rows : []).filter(r => !r.settled &&
    ["pending", "unknown", "overdue"].indexOf(r.state) >= 0)
  .forEach(r => add({
  id: "MAT-" + r.code, kind: "material", blocking: true, owner: "procurement",
  what: r.name + (r.state === "overdue" ? " — the vendor's date has gone. Where is it?"
       : r.state === "pending" ? " — nothing on the PO register buys this. Has it been ordered?"
       : " — is it here?"),
  why: (r.guess ? r.guess.why : "") + (r.couldLandOn ? ". Ordered today it lands " + r.couldLandOn : ""),
  due: r.neededOn, value: r.value, from: "resources.json", go: "tasks",
}));

// ---- 2. approvals whose material is already needed -----------------------
(design ? design.rows : []).filter(d => d.overdue).forEach(d => add({
  id: "APP-" + d.subject.slice(0, 24), kind: "approval", blocking: false, owner: "client",
  what: d.subject + " — the sample is still \"" + d.status + "\"",
  why: "the material this belongs to had to be ordered by " + (d.due || "—") +
       ", which was " + d.lateBy + " days ago",
  due: d.due, value: d.value, from: "design.json", go: "design",
}));

// ---- 3. the stages the client owns, whose deadline has gone -------------
(proc ? proc.chains : []).filter(c => !c.onSite && !c.answered).forEach(c => {
  c.stages.filter(s => s.passed && s.owner === "client").forEach(s => add({
    id: "CL-" + c.name.slice(0, 20) + "-" + s.id, kind: "approval", blocking: false,
    owner: "client",
    what: c.name + " — " + s.name.toLowerCase(),
    why: "the programme needed this finished by " + s.EF + " for the package to be on site by " +
         (c.neededOn || "—") + ". " + (s.why || ""),
    due: s.EF, value: c.value, from: "procurement.json", go: "buy",
  }));
});

// ---- 3b. the drawing set nobody has approved ----------------------------
// AN INTERNAL STATUS IS NOT AN APPROVAL, and on this project the difference
// is the whole story: 19 drawings are through internally and not one of the
// 58 has a client approval against it.
if (reg && reg.drawings.counts.total) {
  const d = reg.drawings.counts;
  if (d.approvedByClient === 0) add({
    id: "GFC-none", kind: "drawing", blocking: true, owner: "client",
    what: "Not one of the " + d.total + " drawings has been approved by the client",
    why: d.throughInternally + " are complete on our side and " + d.critical + " are marked " +
         "critical. A shop drawing cannot start against an unapproved GFC, so every procurement " +
         "chain on the job is waiting behind this one row",
    from: "registers.json", go: "design" });
  reg.drawings.rows.filter(x => x.overdue && x.critical).slice(0, 6).forEach(x => add({
    id: "GFC-" + x.name.slice(0, 20), kind: "drawing", blocking: false, owner: "design",
    what: x.name + " — " + x.internal.toLowerCase() + " internally, " + x.client.toLowerCase() + " with the client",
    why: "due " + x.end + ", which was " + x.lateBy + " days ago",
    due: x.end, from: "registers.json", go: "design" }));
}

// ---- 3c. what somebody outside the crew owes the job --------------------
// THESE ARE THE ONES SOMEBODY ACTUALLY ASKED FOR, with a name on them —
// not derived from the programme like the rest.
if (reg) reg.deps.rows.filter(x => x.open).forEach(x => add({
  id: "DEP-" + x.ask.slice(0, 22), kind: "dependency",
  blocking: !!x.blocking, owner: x.side === "client" ? "client" : "site",
  what: x.ask + (x.owner ? " — " + x.owner : ""),
  why: (x.plan ? "asked for by " + x.plan + (x.overdue ? ", " + x.age + " days ago" : "") : "no date agreed") +
       (x.note ? ". " + x.note : ""),
  due: x.plan, from: "registers.json", go: "dep" }));

// ---- 4. what the engine assumed and nobody has confirmed ----------------
if (sched && sched.days && sched.days.length) {
  const last = sched.days[sched.days.length - 1];
  const pr = sched.progress[last];
  if (pr) sched.wbs.forEach(c => c.packages.forEach(k => {
    const r = pr.byPkg[k.id];
    if (!r || !r.inferred || r.confirmed) return;
    add({ id: "ASM-" + k.code, kind: "assumption", blocking: false, owner: "site",
      what: k.name + " — the engine put this at " + r.inferred.pct + "%, is that right?",
      why: r.inferred.why, due: null, from: "schedule.json", go: "sched",
      confidence: r.inferred.confidence });
  }));
}

// ---- 5. pins that can never be scored -----------------------------------
if (assess && assess.counts && (assess.counts.unframed || []).length) {
  add({ id: "PIN-unframed", kind: "drawing", blocking: false, owner: "design",
    what: "Pins " + assess.counts.unframed.join(", ") + " have no design render",
    why: "these positions were walked and photographed and can never be scored, because there " +
         "is no finished state to read them against. Five renders would close it",
    from: "assess.json", go: "assess" });
}

// ---- 6. areas whose size is a guess -------------------------------------
if (areas) {
  const guessed = (areas.areas || []).filter(a => a.guessed);
  if (guessed.length) add({ id: "AREA-sqft", kind: "measure", blocking: false, owner: "design",
    what: guessed.length + " of " + (areas.areas || []).length + " areas have a guessed size",
    why: "their square footage was not stated anywhere and was apportioned. Every quantity " +
         "spread by area inherits that guess",
    from: "areas.json", go: "map" });
}

// ---- 7. trades a daily report named that this engine cannot place -------
if (mp && mp.actual && mp.actual.any) {
  const unk = {};
  mp.actual.days.forEach(d => (mp.actual.byDay[d].unknown || []).forEach(u =>
    unk[u.label] = (unk[u.label] || 0) + u.count));
  const labels = Object.keys(unk);
  if (labels.length) add({ id: "DPR-unplaced", kind: "reading", blocking: false, owner: "site",
    what: labels.length + " trade name" + (labels.length === 1 ? "" : "s") +
          " on the daily reports that this engine cannot place",
    why: labels.map(l => l + " (" + unk[l] + ")").join(", ") + " — they are counted on the floor " +
         "and on no trade curve until somebody says which trade they are",
    from: "manpower.json", go: "crew" });
}

// ---- 7c. headcounts nobody can date -------------------------------------
// A real reading somebody typed out, refused only because the message never
// said which day it is for. The engine will not date it from the posting
// clock — but a person can, in one line, and the reading is waiting.
//
// NOT BLOCKING: the muster row below already carries the blocking weight for
// the same underlying problem, and two blocking rows for one gap makes the
// blocking list longer without making it truer.
(heldDpr && heldDpr.held ? heldDpr.held : []).forEach((h, i) => add({
  // three of these can land on one date, so the id carries its place in the
  // file. Two rows sharing an id is two rows nobody can close separately.
  id: "DPR-undated-" + h.postedOn + (h.night ? "-n" : "-d") + "-" + (i + 1), kind: "reading",
  blocking: false, owner: "site",
  what: "A headcount of " + (h.total || "?") + " posted on " + h.postedOn +
        " that cannot be filed — which day is it for?",
  why: h.why + ". The reading itself is complete and waiting: " + h.preview,
  due: h.postedOn, from: "dpr-held.json", go: "crew" }));

// ---- 7b. the muster has gone quiet --------------------------------------
// BLOCKING, on the same rule as material nobody can account for: the engine
// will not move a date on a number nobody gave. This project is over its
// contract date and the only thing that recovers it is people on the floor —
// so a fortnight with no muster is not a gap in a report, it is the engine
// losing sight of the one variable the recovery depends on.
//
// WHAT MAKES IT A QUERY RATHER THAN AN OBSERVATION: the walks did not stop.
// The floor was visited and photographed after the last muster, which means
// the silence is in the counting, not the site. If BOTH had stopped this
// would be a different question and it is not the one being asked here.
//
// It is computed, never stated. The day it is answered the row goes.
if (mp && mp.actual && mp.actual.any && pairs && (pairs.walkDays || []).length) {
  const last = mp.actual.days[mp.actual.days.length - 1];
  const since = days(last, asOf);
  // walked days after the last muster: each one is a day a DPR could have
  // covered, and cannot, for want of a headcount alone.
  // A DPR needs a day that was walked AND photographed AND mustered. Test the
  // first two the way reports.js tests them, or this row and the report it is
  // about will disagree about which days exist. sched.days is the WALK
  // calendar, not the working week — filtering one by the other proves nothing.
  const shot = new Set();
  ((pairs && pairs.pins) || []).forEach(p =>
    Object.keys(p.shots || {}).forEach(d => shot.add(d)));
  const orphaned = (pairs.walkDays || []).filter(d => d > last && shot.has(d));
  if (since !== null && since >= 4 && orphaned.length) add({
    id: "MP-silent", kind: "reading", blocking: true, owner: "site",
    what: "No manpower has been recorded since " + last + " — " + since + " days",
    why: "the floor was walked and photographed on " + orphaned.join(", ") +
         " after that, so the site did not go quiet, the counting did. " +
         "Each of those " + orphaned.length + " day" + (orphaned.length === 1 ? "" : "s") +
         " would produce a daily report and cannot, for want of a headcount alone. " +
         "The last muster stood at " + (mp.actual.byDay[last].labour) + " labour" +
         " and this programme is recovering on labour, so the engine cannot say " +
         "whether the ramp it needs is happening",
    due: last, from: "manpower.json", go: "crew" });
}

// ---- 8. the date itself --------------------------------------------------
if (target && sched) {
  const lands = (target.built && target.built.conditionsBy) || null;
  if (lands && target.target && lands > target.target) add({
    id: "DATE-slip", kind: "date", blocking: true, owner: "client",
    what: "The programme lands " + lands + " against a contract date of " + target.target,
    why: "at " + (sched.builtToDate || "?") + " built and the manpower the floor can hold, " +
         days(target.target, lands) + " days cannot be recovered with people. The date moves " +
         "or the scope does",
    due: target.target, from: "target.json", go: "sched" });
}

rows.sort((a, b) => (b.blocking - a.blocking) ||
  ((a.due || "9999") < (b.due || "9999") ? -1 : (a.due || "9999") > (b.due || "9999") ? 1 : 0) ||
  ((b.value || 0) - (a.value || 0)));

const byOwner = {};
rows.forEach(r => { const o = byOwner[r.owner] = byOwner[r.owner] || { owner: r.owner, n: 0, blocking: 0, value: 0 };
  o.n++; if (r.blocking) o.blocking++; o.value += r.value || 0; });

// ---- WHAT A PERSON ALREADY CLOSED ---------------------------------------
// The open list was only ever half the record. Every decision on this project
// — the handover date the whole programme hangs off, the floor the agreement
// gets wrong, which BOQ revision is the one — was settled by somebody, used by
// plan.js and target.js, and then shown on no screen at all. A closed decision
// nobody can find is one that gets re-argued from scratch in three months.
//
// THE LAWS HERE ARE THE SAME AS FOR AN OPEN ROW
//   . A DECISION CARRIES WHO MADE IT AND WHEN. No decider, no row.
//   . AND WHAT IT WAS MADE AGAINST, so it can be reopened when the evidence
//     changes rather than defended because it is written down.
//   . NOTHING IS PROMOTED TO CLOSED BY THE ENGINE. Only what a person put
//     their name to appears here.
const closed = [];
{
  const settled = (() => { try { return JSON.parse(fs.readFileSync(
    path.join(ENGINE, "settled.json"), "utf8")); } catch (e) { return null; } })();
  const who = settled && settled.decidedBy, when = settled && settled.decidedOn;
  const add = (o) => { if (o.by && o.on) closed.push(o); };
  if (settled) {
    if (settled.handover) add({ kind: "date", what: "Handover is " + settled.handover.date,
      why: settled.handover.why, against: settled.handover.source,
      by: settled.handover.decidedBy || who, on: settled.handover.chosenOn || when,
      from: "settled.json", stillOpen: null });
    if (settled.floor) add({ kind: "reading", what: "The floor is " + settled.floor.value,
      why: settled.floor.why, against: settled.floor.source, by: who, on: when,
      from: "settled.json", stillOpen: settled.floor.stillOpen || null });
    if (settled.boqRevision) add({ kind: "reading",
      what: "The BOQ is revision " + settled.boqRevision.value,
      why: settled.boqRevision.why, against: settled.boqRevision.source,
      by: who, on: when, from: "settled.json", stillOpen: null });
    if (settled.ambiguousColumns) add({ kind: "reading",
      what: "Ambiguous spreadsheet columns are read by position, not left unread",
      why: settled.ambiguousColumns.why,
      against: (settled.ambiguousColumns.rules || []).join(" · "),
      by: who, on: when, from: "settled.json", stillOpen: null });
    Object.keys(settled.confirmedCounts || {}).filter(k => k !== "_").forEach(k => {
      const c = settled.confirmedCounts[k]; add({ kind: "measure",
        what: k.replace(/_/g, " ") + " is " + c.qty + (c.was ? ", not " + c.was : ""),
        why: c.what, against: c.crossCheck || null, by: c.confirmedBy, on: c.on,
        from: "settled.json", stillOpen: null }); });
    Object.keys(settled.confirmedQuantities || {}).forEach(k => {
      const c = settled.confirmedQuantities[k]; add({ kind: "measure",
        what: k.replace(/_/g, " ") + " is " + c.qty.toLocaleString("en-IN") + " " + c.unit,
        why: c.what, against: c.crossCheck || null, by: c.confirmedBy, on: c.on,
        from: "settled.json", stillOpen: null }); });
  }
  // A PHOTOGRAPH REFUSED IS A JUDGEMENT ABOUT EVIDENCE, and belongs here with
  // the rest. Only the ones a person actually closed.
  const refused = (() => { try { return JSON.parse(fs.readFileSync(
    path.join(ENGINE, "frames-refused.json"), "utf8")); } catch (e) { return null; } })();
  ((refused && refused.frames) || []).filter(f => f.confirmedBy).forEach(f => add({
    kind: "reading", what: f.doc.split("/").pop() + " is not this site",
    why: f.why, against: f.confirmedWhat || null,
    by: f.confirmedBy, on: f.confirmedOn, from: "frames-refused.json",
    stillOpen: null, proposedBy: f.by,
    cost: (f.claimed || []).length + " false readings held back" }));
}
closed.sort((a, b) => String(b.on).localeCompare(String(a.on)));

const todo = {
  builtAt: new Date().toISOString(), asOf,
  counts: { total: rows.length, blocking: rows.filter(r => r.blocking).length,
    overdue: rows.filter(r => r.due && r.due < asOf).length,
    value: Math.round(rows.reduce((t, r) => t + (r.value || 0), 0)),
    closed: closed.length },
  byOwner: Object.values(byOwner).sort((a, b) => b.blocking - a.blocking || b.n - a.n),
  rows, closed,
  whyClosed: "what a person decided, and what it was decided against. Every one of these was " +
       "already being used by the engine and shown on no screen. A decision nobody can find " +
       "is one that gets re-argued from scratch",
  why: "one row per open question this engine raised, each pointing at the module that raised " +
       "it. Blocking means the engine will not move a date until it is answered. Nothing here " +
       "is invented to fill a list, and anything the site has already answered has gone",
};
fs.writeFileSync(path.join(ENGINE, "todo.json"), JSON.stringify(todo));

// ---- the client's own list ----------------------------------------------
const clientRows = rows.filter(r => r.owner === "client");
fs.writeFileSync(path.join(ENGINE, "client.json"), JSON.stringify({
  builtAt: new Date().toISOString(), asOf,
  counts: { total: clientRows.length, blocking: clientRows.filter(r => r.blocking).length,
    value: Math.round(clientRows.reduce((t, r) => t + (r.value || 0), 0)) },
  rows: clientRows,
  why: "what the client and the consultant owe the programme. Every row is a decision or a " +
       "signature, and every one of them has a date attached that came off the levelled " +
       "programme rather than out of a meeting",
}));

// ---- what stopped agreeing with itself ----------------------------------
// A CHANGE REGISTER WITH NO VARIATION ORDERS IN IT. This project has no
// formal VO log anywhere on the log, so inventing one would be a lie. What
// this can honestly show is where the documents we WERE given disagree —
// which is where variations come from in the first place.
const change = [];
if (plan && plan.scope) {
  (plan.scope.unusable || []).forEach(u => change.push({
    kind: "unpriced", what: u.description || u.package || u.code,
    detail: (u.why || "the bill prices it and the engine cannot place it against any package"),
    value: u.value || 0, where: u.at || null }));
  (plan.scope.parked || []).slice(0, 200).forEach(u => change.push({
    kind: "parked", what: u.description || u.package || u.code,
    detail: u.why || "read, and deliberately not scheduled",
    value: u.value || 0, where: u.at || null }));
}
if (sched && sched.suspectCounts) (sched.suspectCounts || []).forEach(s => change.push({
  kind: "suspect count", what: s.code || s.name,
  detail: s.why || "the same quantity appears on more than one line and was read once",
  value: 0 }));
const changeVal = change.reduce((t, c) => t + (c.value || 0), 0);
fs.writeFileSync(path.join(ENGINE, "change.json"), JSON.stringify({
  builtAt: new Date().toISOString(), asOf,
  counts: { rows: change.length, value: Math.round(changeVal),
    unpriced: change.filter(c => c.kind === "unpriced").length,
    parked: change.filter(c => c.kind === "parked").length },
  rows: change.sort((a, b) => (b.value || 0) - (a.value || 0)),
  noRegister: true,
  why: "there is no variation order register anywhere on this engine's inputs, and one has " +
       "not been invented. What this shows instead is where the documents we were given stop " +
       "agreeing with each other — priced lines nothing schedules, work read and parked, and " +
       "quantities that appear twice. That is where variations come from",
}));

const cr = (n) => n >= 1e7 ? "Rs " + (n / 1e7).toFixed(2) + " Cr"
                : n >= 1e5 ? "Rs " + (n / 1e5).toFixed(1) + " L" : "Rs " + Math.round(n || 0);
console.log("\n  EVERYTHING THAT NEEDS A PERSON  (as on " + asOf + ")");
console.log("    " + todo.counts.total + " open · " + todo.counts.blocking +
  " of them blocking · " + cr(todo.counts.value) + " of work behind them");
todo.byOwner.forEach(o => console.log("    " + String(o.owner).padEnd(14) +
  String(o.n).padStart(3) + " open, " + o.blocking + " blocking, " + cr(o.value)));
console.log("\n  THE FIRST TEN");
rows.slice(0, 10).forEach(r => console.log("    " + (r.blocking ? "BLOCK " : "      ") +
  String(r.owner).padEnd(12) + String(r.due || "—").padEnd(12) + r.what.slice(0, 70)));
console.log("\n  WHERE THE DOCUMENTS DISAGREE: " + change.length + " rows, " + cr(changeVal));
console.log("\n→ todo.json, client.json, change.json\n");
