// ===================================================================
// DnB-OS . platform/core/assume.js . MOVING WITHOUT PRETENDING
// An engine that refuses to proceed until every gap is closed produces
// nothing, on a project where gaps are the normal state. An engine that
// closes them silently produces a plan nobody can argue with, which is
// worse. This is the third thing: it PROCEEDS ON A STATED ASSUMPTION and
// carries how sure it is, so the work moves and the doubt stays visible.
//
//   LEVELS                  high · medium · low, and what each means
//   assume(a)               make one, with its evidence and what it moves
//   register()              every assumption, sorted by what it puts at risk
//   confidenceOf(fact)      what a fact's provenance is worth as confidence
//   weakest(list)           a chain is only as good as its worst link
//
// THE LAWS
//   . AN ASSUMPTION IS NOT A FACT, AND NEVER BECOMES ONE. It is recorded
//     separately, it carries a confidence, and anything computed through
//     it inherits that confidence. It does not decay into certainty by
//     being used a lot.
//   . EVERY ASSUMPTION NAMES WHAT WOULD SETTLE IT. "Ask the MEP lead
//     whether these five lines are one point priced at five stages" is
//     worth a hundred times "unresolved", because somebody can do it.
//   . CONFIDENCE IS ABOUT THE EVIDENCE, NOT ABOUT THE FEELING. high means
//     two independent sources agree, or one says it unambiguously. medium
//     means one source implies it and nothing contradicts. low means the
//     engine picked the more likely of two readings to keep moving.
//   . A LOW-CONFIDENCE ASSUMPTION IS STILL BETTER THAN A STOP, PROVIDED
//     IT IS LOUD. The cost of assuming is a wrong number somebody can
//     see and correct. The cost of stopping is no number at all, and a
//     fortnight later nobody remembers what was waiting on what.
//   . THE CHAIN TAKES THE WEAKEST LINK. A date computed from a
//     high-confidence quantity and a low-confidence unit is a
//     low-confidence date, and reporting it as anything else is how a
//     guess three steps back arrives dressed as arithmetic.
//
// Pure: declarations and records. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

// what each level is allowed to mean. Written down so "medium" means the
// same thing in the ingest, the plan and the daily walk.
const LEVELS = {
  high:   { rank: 3, why: "two independent sources agree, or one states it unambiguously" },
  medium: { rank: 2, why: "one source implies it and nothing on the project contradicts it" },
  low:    { rank: 1, why: "the engine chose the likelier of two readings so the work could move" },
};
const ORDER = ["high", "medium", "low"];

// A FACT'S PROVENANCE IS EVIDENCE ABOUT HOW MUCH IT IS WORTH. The fact
// model already records HOW something was known; this says what that is
// worth as confidence, in one place, so no report invents its own scale.
function confidenceOf(fact) {
  const c = String((fact && fact.conf) || "").toLowerCase();
  if (c === "measured") return "high";     // off geometry, or a numeric cell
  if (c === "stated")   return "high";     // a document says so, in words
  if (c === "derived")  return "medium";   // arithmetic, or read by position
  if (c === "inferred") return "low";      // pattern-matched out of prose
  return "low";
}

// A CHAIN IS ONLY AS GOOD AS ITS WORST LINK.
function weakest(levels) {
  const seen = (levels || []).map(l => String(l || "low").toLowerCase())
    .filter(l => LEVELS[l]);
  if (!seen.length) return "low";
  return seen.reduce((w, l) => LEVELS[l].rank < LEVELS[w].rank ? l : w, "high");
}

// ---- one assumption ----------------------------------------------------
// id         a stable name, so the same assumption re-made is the same one
// what       the assumption itself, in a sentence a person can disagree with
// why        the evidence for it. An assumption with no evidence is a guess.
// confidence high | medium | low
// affects    what changes if it is wrong — dates, cost, scope, an owner
// settledBy  the one action that would replace it with a fact
// instead    what the engine would have done otherwise (usually: stopped)
function assume(a) {
  const o = a || {};
  const level = LEVELS[String(o.confidence || "").toLowerCase()] ? String(o.confidence).toLowerCase() : "low";
  const problems = [];
  if (!o.id)   problems.push("an assumption with no id cannot be re-made or retracted");
  if (!o.what) problems.push("an assumption has to be a sentence somebody can disagree with");
  if (!o.why)  problems.push("an assumption with no evidence behind it is a guess, and guesses are not recorded as assumptions");
  // AN ASSUMPTION THAT NAMES NO WAY OUT IS A DEAD END. Somebody has to be
  // able to close it, and the engine has to say who and how.
  if (!o.settledBy) problems.push("an assumption has to name what would settle it");
  if (problems.length) return { ok: false, why: problems.join("; ") };
  return { ok: true, assumption: {
    id: String(o.id), what: String(o.what), why: String(o.why),
    confidence: level, affects: o.affects || null,
    settledBy: String(o.settledBy), instead: o.instead || null,
    at: o.at || null, value: o.value == null ? null : o.value,
  } };
}

// ---- the register ------------------------------------------------------
// Sorted by what it puts at risk: the least certain first, because that is
// the order somebody should spend their afternoon on.
function register(list) {
  const good = [], refused = [];
  (list || []).forEach(a => { const r = assume(a);
    r.ok ? good.push(r.assumption) : refused.push({ a, why: r.why }); });
  good.sort((x, y) => LEVELS[x.confidence].rank - LEVELS[y.confidence].rank);
  const counts = { high: 0, medium: 0, low: 0 };
  good.forEach(a => counts[a.confidence]++);
  return { assumptions: good, refused, counts,
    why: good.length + " assumptions carrying this plan: " +
      ORDER.map(l => counts[l] + " " + l).join(", ") +
      (counts.low ? ". The " + counts.low + " low ones are where it is most likely to be wrong, and each names what would settle it."
                  : ".") };
}

const A = { LEVELS, ORDER, assume, register, confidenceOf, weakest };
root.ASSUME = A;
if (typeof module !== "undefined" && module.exports) module.exports = A;

})(typeof window !== "undefined" ? window : globalThis);
