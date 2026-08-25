// ===================================================================
// DnB-OS . platform/kb/snag.js . THE OWNER AND CLOSURE LAW
//
// A defect list is the last register on a job and the one most often kept
// in a spreadsheet nobody trusts, because two disciplines are missing from
// almost every one of them:
//
//   . EVERY OPEN POINT HAS A FACE AND A DATE. A side (us, the client, the
//     builder), a person where there is one, the day it was raised and the
//     day it is due. Age is computed from the raised date and is never
//     typed by anybody — a list where somebody types the age is a list
//     where the age stops moving the day they get bored.
//
//   . NO PROOF, NO CLOSURE. A defect is not closed because somebody says
//     it is. Closing needs a dated proof — a photograph, a test, a
//     signature — and there is no override, no force flag and no admin
//     bypass anywhere in this module. That is the whole point of it.
//
// Carried over from the tracking engine's snag law, which this project
// wrote and then left behind.
//
// Pure: rows in, rows out. No clock of its own — today is passed in, so
// the guards can drive it on any date.
// ===================================================================

;(function (root) {

const SIDES  = ["us", "client", "builder"];
const STATES = ["open", "wip", "closed"];
// How long a defect gets before it is late, by how bad it is.
const GRACE  = { high: 3, med: 7, low: 14 };
const SEVS   = ["high", "med", "low"];

const DAY = 86400000;
const parse = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? Date.parse(s + "T00:00:00Z") : null;
const between = (a, b) => { const x = parse(a), y = parse(b);
  return (x != null && y != null) ? Math.round((y - x) / DAY) : null; };
const shift = (s, n) => { const x = parse(s);
  return x == null ? null : new Date(x + n * DAY).toISOString().slice(0, 10); };

// ---- what a row must carry to be a row ---------------------------------
function faults(r) {
  const bad = [];
  if (!r || !r.what || String(r.what).trim().length < 4) bad.push("no description");
  if (!parse(r.raised)) bad.push("no raised date");
  if (SIDES.indexOf(r.side) < 0) bad.push("no side to own it");
  if (SEVS.indexOf(r.sev) < 0) bad.push("no severity");
  if (STATES.indexOf(r.state || "open") < 0) bad.push("state is not one of " + STATES.join("/"));
  return bad;
}

// ---- the due date, where nobody set one --------------------------------
// A DEFECT WITH NO DUE DATE IS A DEFECT NOBODY IS LATE ON. Rather than
// leave it blank, the severity sets one and the row says it was derived.
function dueFor(r) {
  if (r.due) return { due: r.due, derived: false };
  const g = GRACE[r.sev];
  return g ? { due: shift(r.raised, g), derived: true,
    why: "nobody set a date, so " + g + " days from raising, which is what a " +
         r.sev + " severity gets" } : { due: null, derived: false };
}

// ---- NO PROOF, NO CLOSURE ----------------------------------------------
// The only gate in this module, and it has no way round it.
function canClose(r) {
  if (!r.proof) return { ok: false,
    why: "closing a defect needs a dated proof — a photograph, a test or a signature. " +
         "There is no override on this register" };
  if (!parse(r.proof.on)) return { ok: false, why: "the proof carries no date" };
  if (!r.proof.by) return { ok: false, why: "the proof says nobody" };
  return { ok: true };
}

// ---- one row, read ------------------------------------------------------
function read(r, today) {
  const bad = faults(r);
  const d = dueFor(r);
  const state = bad.length ? "invalid" : (r.state || "open");
  const closed = state === "closed";
  return Object.assign({}, r, {
    state, valid: !bad.length, faults: bad,
    due: d.due, dueDerived: d.derived, dueWhy: d.why || null,
    // AGE IS COMPUTED FROM THE RAISED DATE and never typed.
    age: closed ? between(r.raised, r.closedOn) : between(r.raised, today),
    ageStops: closed ? r.closedOn : null,
    overdue: !closed && !!d.due && !!today && d.due < today,
    lateBy: !closed && d.due && today && d.due < today ? between(d.due, today) : 0,
    // and a closed row is only closed if it could be
    closable: canClose(r),
  });
}

// ---- the register, read -------------------------------------------------
function register(rows, today) {
  const out = (rows || []).map(r => read(r, today));
  // A CLOSED ROW WITH NO PROOF IS NOT CLOSED. It is reopened here, loudly,
  // rather than trusted because a field says so.
  out.forEach(r => { if (r.state === "closed" && !r.closable.ok) {
    r.state = "open"; r.reopened = true;
    r.reopenedWhy = "this was marked closed with no proof against it. " + r.closable.why; } });
  return out;
}

function summary(rows, today) {
  const R = register(rows, today);
  const by = (f) => R.filter(f).length;
  const openRows = R.filter(r => r.state !== "closed" && r.valid);
  return {
    total: R.length, valid: by(r => r.valid), invalid: by(r => !r.valid),
    open: by(r => r.state === "open" && r.valid),
    wip: by(r => r.state === "wip" && r.valid),
    closed: by(r => r.state === "closed"),
    reopened: by(r => r.reopened),
    overdue: by(r => r.overdue),
    high: by(r => r.sev === "high" && r.state !== "closed"),
    oldest: openRows.length ? Math.max.apply(null, openRows.map(r => r.age || 0)) : 0,
    bySide: SIDES.reduce((m, s) => (m[s] = by(r => r.side === s && r.state !== "closed"), m), {}),
  };
}

// ---- what closing the whole list would take -----------------------------
// A BURN DOWN IS A PROMISE, and a promise needs a rate. Nothing here
// invents one: if no row has ever been closed, the rate is null and the
// answer is "nobody has closed one yet", not a projection off zero.
function burnDown(rows, today) {
  const R = register(rows, today);
  const closed = R.filter(r => r.state === "closed" && r.closedOn);
  const open = R.filter(r => r.state !== "closed" && r.valid).length;
  if (!closed.length) return { open, perDay: null, clearBy: null,
    why: "nothing has been closed yet, so there is no rate to project from" };
  const first = closed.map(r => r.closedOn).sort()[0];
  const span = Math.max(1, between(first, today) || 1);
  const perDay = closed.length / span;
  return { open, closed: closed.length, perDay: Math.round(perDay * 100) / 100,
    clearBy: perDay > 0 ? shift(today, Math.ceil(open / perDay)) : null,
    why: closed.length + " closed over " + span + " days is " +
         (Math.round(perDay * 100) / 100) + " a day, and " + open + " are open" };
}

const SNAG = { SIDES, STATES, SEVS, GRACE, faults, dueFor, canClose,
               read, register, summary, burnDown, between, shift };
root.KB_SNAG = SNAG;
if (typeof module !== "undefined" && module.exports) module.exports = SNAG;

})(typeof globalThis !== "undefined" ? globalThis : this);
