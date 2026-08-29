#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/registers.js . THE STANDING REGISTERS
//   node tools/registers.js
//
// Builds registers.json: four lists the tracking engine kept and this one
// never had — the drawing pipeline, the standing client dependency register,
// the closeout checklist, and the room program.
//
// Each answers a question no other screen can:
//   DRAWINGS   58 of them, each with an internal status and a client
//              status. The two disagree on almost every row, which is the
//              whole point: a drawing this side calls Completed is Not
//              Started as far as the client's approval is concerned.
//   DEPENDS    who outside the crew owes the job something, with a planned
//              date and an age. Ours were derived from the programme; these
//              are the ones somebody actually asked for, with a name on them.
//   CLOSEOUT   commissioning, statutory approvals, documents. The project
//              ends at handover, not at "verified done", and the gap between
//              the two is twenty items nothing was tracking.
//   PROGRAM    required against built, room type by room type. The engine
//              knows quantities; it never asked whether there are 305 seats.
//
// THE LAWS
//   . AN INTERNAL STATUS IS NOT AN APPROVAL. A drawing is only through when
//     the client says it is through, and the two columns stay apart.
//   . A DEPENDENCY WITH NO ACTUAL DATE IS OPEN, however old. Age is computed
//     from the planned date and is never typed.
//   . A CLOSEOUT ITEM WITH NO EVIDENCE IS NOT STARTED. Nothing here reads
//     done because a plan date passed.
//   . BUILT IS ONLY EVER WHAT SOMEBODY COUNTED. Where nobody has counted a
//     room type, the built column is blank and says so — never the required
//     figure copied across.
// ===================================================================
const fs = require("fs"), path = require("path");
const grab = (m) => { try { return require(path.join(__dirname, "../platform/track/project/" + m)); }
                      catch (e) { return null; } };
const GFC = grab("skf_gfc.js"), DEPS = grab("skf_deps.js");
const CO = grab("skf_closeout.js"), PROG = grab("skf_program.js");
const ADMIN = grab("skf_adminlists.js");

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const asOf = new Date().toISOString().slice(0, 10);
const ageOf = (d) => d ? Math.round((Date.parse(asOf) - Date.parse(d)) / 86400000) : null;

// ---- the drawing pipeline ----------------------------------------------
// AN INTERNAL STATUS IS NOT AN APPROVAL. Nineteen drawings read Completed
// this side and fifty six read Not Started on the client's. A pipeline that
// reported one column would be reporting the wrong one.
const DONE = /^(completed|approved|closed)/i;
const drawings = ((GFC && GFC.drawings) || []).map(d => ({
  name: d.name, group: d.group, critical: !!d.crit,
  internal: d.intStatus, client: d.skf,
  start: d.start || null, end: d.end || null,
  throughInternally: DONE.test(d.intStatus || ""),
  approvedByClient: DONE.test(d.skf || ""),
  // THE ONLY STATE THAT MATTERS TO A PROCUREMENT CHAIN
  usable: DONE.test(d.intStatus || "") && DONE.test(d.skf || ""),
  overdue: !!(d.end && d.end < asOf && !DONE.test(d.skf || "")),
  lateBy: d.end && d.end < asOf && !DONE.test(d.skf || "") ? ageOf(d.end) : 0,
}));

// ---- who outside the crew owes the job something ------------------------
// A DEPENDENCY WITH NO ACTUAL DATE IS OPEN, however old.
const deps = ((DEPS && DEPS.deps) || []).map(d => ({
  ask: d.ask, side: d.side, owner: d.owner || null,
  plan: d.plan || null, actual: d.actual || null,
  blocking: !!d.blocking,
  open: !d.actual,
  age: d.actual ? null : ageOf(d.plan),
  overdue: !d.actual && !!d.plan && d.plan < asOf,
  note: d.note || null,
}));

// ---- the gap between verified done and handover -------------------------
// A CLOSEOUT ITEM WITH NO EVIDENCE IS NOT STARTED.
const closeout = ((CO && CO.items) || []).map(c => ({
  pkg: c.pkg, kind: c.kind, text: c.text, note: c.note || null,
  state: c.state || "not started",
  evidence: c.evidence || null,
}));
const byKind = {};
closeout.forEach(c => byKind[c.kind] = (byKind[c.kind] || 0) + 1);

// ---- required against built --------------------------------------------
// BUILT IS ONLY EVER WHAT SOMEBODY COUNTED.
const program = ((PROG && PROG.rooms) || []).map(r => ({
  name: r.name, group: r.group, unit: r.unit,
  required: r.required == null ? null : r.required,
  reqSource: r.reqSource || null,
  built: r.built == null ? null : r.built,
  builtSource: r.builtSource || null,
  counted: r.built != null,
  gap: (r.built != null && r.required != null) ? r.built - r.required : null,
}));

const out = {
  builtAt: new Date().toISOString(), asOf,
  source: "the tracking engine's registers — skf_gfc, skf_deps, skf_closeout, skf_program",
  drawings: {
    rows: drawings,
    counts: { total: drawings.length, critical: drawings.filter(d => d.critical).length,
      throughInternally: drawings.filter(d => d.throughInternally).length,
      approvedByClient: drawings.filter(d => d.approvedByClient).length,
      usable: drawings.filter(d => d.usable).length,
      overdue: drawings.filter(d => d.overdue).length },
    why: "an internal status is not an approval. A drawing is only usable when both columns say " +
         "so, and on this project 19 read complete internally against 0 approved by the client",
  },
  deps: {
    rows: deps,
    counts: { total: deps.length, open: deps.filter(d => d.open).length,
      blocking: deps.filter(d => d.blocking && d.open).length,
      overdue: deps.filter(d => d.overdue).length },
    why: "the standing register of what somebody outside the crew owes the job. Age is computed " +
         "from the planned date and is never typed by anybody",
  },
  closeout: {
    rows: closeout, byKind,
    counts: { total: closeout.length,
      notStarted: closeout.filter(c => c.state === "not started").length,
      withEvidence: closeout.filter(c => c.evidence).length },
    why: "the project ends at handover, not at verified done. Nothing here reads done because a " +
         "planned date passed — an item with no evidence is not started",
  },
  program: {
    rows: program,
    counts: { total: program.length, counted: program.filter(p => p.counted).length,
      uncounted: program.filter(p => !p.counted).length },
    why: "required against built, room type by room type. Where nobody has counted, the built " +
         "column is blank — the required figure is never copied across to fill it",
  },
  housekeeping: (ADMIN && ADMIN.housekeeping) || [],
};
fs.writeFileSync(path.join(ENGINE, "registers.json"), JSON.stringify(out));

console.log("\n  THE STANDING REGISTERS");
const D = out.drawings.counts;
console.log("\n  DRAWINGS  " + D.total + " · " + D.critical + " critical");
console.log("    through internally  " + D.throughInternally);
console.log("    approved by client  " + D.approvedByClient +
  (D.approvedByClient === 0 ? "   ← not one of them" : ""));
console.log("    usable for buying   " + D.usable);
console.log("    past their date     " + D.overdue);
console.log("\n  DEPENDENCIES  " + out.deps.counts.total + " · " + out.deps.counts.open +
  " open · " + out.deps.counts.blocking + " blocking · " + out.deps.counts.overdue + " past their date");
deps.filter(d => d.overdue).slice(0, 8).forEach(d => console.log("    " +
  String(d.age).padStart(3) + "d  " + String(d.owner || d.side).slice(0, 22).padEnd(24) + d.ask));
console.log("\n  CLOSEOUT  " + out.closeout.counts.total + " items · " +
  out.closeout.counts.notStarted + " not started · " + out.closeout.counts.withEvidence + " with evidence");
Object.keys(byKind).forEach(k => console.log("    " + String(byKind[k]).padStart(3) + "  " + k));
console.log("\n  ROOM PROGRAM  " + out.program.counts.total + " types · " +
  out.program.counts.counted + " counted · " + out.program.counts.uncounted + " nobody has counted");
console.log("\n→ engines/skf/registers.json\n");
