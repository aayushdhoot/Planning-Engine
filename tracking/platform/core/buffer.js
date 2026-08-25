// ===================================================================
// DnB-OS . platform/core/buffer.js . THE TWO DATES
// Phase 3. The client is given one date and the team runs to a tighter
// one. The gap between them is the buffer, and this law decides how big
// it should be from what the engine actually knows, instead of a round
// number somebody liked.
//
//   propose(facts) -> { days, band, floor, cap, drivers:[...] , why }
//   resolve(win, facts, override) -> { extEnd, intEnd, days, source }
//
// THE DIRECTION MATTERS. The contract end is given: it is what was
// signed. The INTERNAL date is derived from it by walking the buffer
// back. Setting the internal date first and calling the difference a
// buffer gets it backwards, and produces a client date the contract
// never agreed to.
//
// THE LAWS
//   . the buffer is EARNED, not assumed. Every day of it names the risk
//     that bought it, so a PM can argue with the number instead of
//     nodding at it.
//   . a floor and a cap. Under the floor the buffer is theatre; over the
//     cap the team is running to a date nobody believes, which is the
//     same as having no internal date at all.
//   . a human override always wins, and is recorded as a human override
//     rather than quietly becoming the engine's own proposal.
//   . the buffer NEVER pushes the internal date past the contract date,
//     and never before the project start. A buffer that inverts the two
//     dates is worse than none.
//
// Pure: facts in, days out. No clock, no storage.
// ===================================================================

;(function (root) {

const FLOOR = 5;      // under this the buffer is decoration
const CAP   = 30;     // over this nobody believes the internal date
const BASE  = 8;      // the starting gap on a project the engine knows well

// What buys a day, and why. Each driver reads a fact the engine already
// holds from an earlier phase, so the buffer is a synthesis rather than
// a new opinion.
const DRIVERS = [
  { id: "boq",        max: 6,
    why: "quantities are take-off estimates, not a read BOQ",
    days: f => f.hasBoq ? 0 : 6 },
  { id: "queries",    max: 6,
    why: "open questions that could still move scope or dates",
    days: f => Math.min(6, Math.ceil((f.openQueries || 0) / 8)) },
  { id: "conditions", max: 4,
    why: "site conditions still assumed rather than answered",
    days: f => Math.min(4, (f.openConditions || 0) * 2) },
  { id: "allocation", max: 3,
    why: "work with nobody named against it",
    days: f => (f.unallocated || 0) > 0 ? 3 : 0 },
  { id: "longlead",   max: 6,
    why: "long-lead items sitting on the chain that sets the finish",
    days: f => Math.min(6, (f.criticalLeads || 0) * 2) },
  { id: "confidence", max: 4,
    why: "durations carrying low confidence",
    days: f => Math.min(4, Math.round((f.lowConfShare || 0) * 8)) },
  { id: "weather",    max: 4,
    why: "the tail of the programme runs into monsoon",
    days: f => f.monsoonTail ? 4 : 0 },
];

function propose(facts) {
  const f = facts || {};
  const drivers = [];
  let earned = 0;
  for (const d of DRIVERS) {
    let n = 0;
    try { n = Math.max(0, Math.min(d.max, Math.round(d.days(f) || 0))); } catch (e) { n = 0; }
    if (n > 0) { drivers.push({ id: d.id, days: n, why: d.why }); earned += n; }
  }
  const raw = BASE + earned;
  const days = Math.max(FLOOR, Math.min(CAP, raw));
  const band = days <= 10 ? "tight" : days <= 20 ? "normal" : "wide";
  return {
    days, band, floor: FLOOR, cap: CAP, base: BASE, earned, raw,
    clamped: raw !== days,
    drivers,
    why: drivers.length
      ? BASE + " days to start, plus " + earned + " earned by " + drivers.length +
        " risk" + (drivers.length > 1 ? "s" : "") + " the engine can name"
      : BASE + " days, and nothing on this project is currently buying more",
  };
}

// ---- the two dates -------------------------------------------------
// extEnd is the contract. intEnd is extEnd minus the buffer, walked back
// on plain calendar days (the buffer is contingency, not working time).
// An override is a human's call and is labelled as one.
function resolve(win, facts, override, addDays) {
  const w = win || {};
  const p = propose(facts);
  const manual = (override != null && isFinite(Number(override)) && Number(override) >= 0);
  const days = manual ? Math.round(Number(override)) : p.days;

  const shift = addDays || ((iso, n) => {
    const d = new Date(iso + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  });

  let intEnd = w.extEnd ? shift(w.extEnd, -days) : null;
  const notes = [];
  // never invert the two dates, and never land before the project starts
  if (intEnd && w.extEnd && intEnd > w.extEnd) { intEnd = w.extEnd; notes.push("buffer would invert the dates, held at the contract end"); }
  if (intEnd && w.intStart && intEnd < w.intStart) { intEnd = w.intStart; notes.push("buffer would land before the start, held at the start"); }

  return {
    extEnd: w.extEnd || null,
    intEnd: intEnd,
    days: days,
    source: manual ? "override" : "engine",
    proposal: p,
    notes: notes,
  };
}

const BUF = { FLOOR, CAP, BASE, DRIVERS, propose, resolve };
root.CORE_BUFFER = BUF;
if (typeof module !== "undefined" && module.exports) module.exports = BUF;

})(typeof window !== "undefined" ? window : globalThis);
