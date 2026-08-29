// ===================================================================
// DnB-OS . platform/kb/conditions.js . THE SITE CONDITIONS LAW
// Phase 1. The things a project is allowed to do, which decide how many
// productive hours a task actually gets in a day:
//   . the shift . day, night, or both
//   . noise . in an occupied building the loud work is allowed only in a
//     named window, so a demolition day is not eight hours long
//   . access . one shared service lift, or a loading bay open for four
//     hours, caps the trades that move material all day
//   . the plain limitations a site engineer would write down
//
// This law does NOT touch the calendar. Which DAYS are worked (Sundays,
// public holidays, monsoon, festivals) is calendar.js and already built.
// This is about how much of a worked day a given task really gets.
//
//   hoursFor(norm, cond) -> { hours, why:[...] }
//   apply(cond)          -> a normalised, complete conditions object
//   assumptions(cond)    -> what the engine had to assume, for the queries
//   summarise(cond)      -> one honest sentence
//
// Everything here is PURE. Conditions in, hours out, no clock and no
// storage, so the guards break it offline like every other law.
//
// THE FLOOR. A restriction can never take a task below one productive
// hour a day. Without that floor a mistyped zero turns every duration
// into infinity and the plan silently becomes nonsense instead of
// visibly wrong.
// ===================================================================

;(function (root) {

const SHIFTS = ["day", "night", "both"];
const BASE_HOURS = 8;          // the productive hours in one Indian fit-out shift
const MIN_HOURS = 1;           // the floor. See the note above.

// Work that a neighbour hears through a wall. Breaking, chasing, drilling
// and core cutting are the ones that get banned in an occupied building;
// taping a joint or laying carpet is not. Kept here rather than as a flag
// on every norm, so durations.js stays a table of rates and nothing else.
const NOISY_TRADES = ["demolition", "civil"];
const NOISY_CODES = /core_cut|chase|drill|anchor|breaker|grind|saw/i;
// Work whose day is spent moving material in and out. When the lift or the
// loading bay is shared these are the trades that queue for it.
const HAULING_TRADES = ["demolition", "civil", "flooring", "joinery"];

function isNoisy(norm) {
  if (!norm) return false;
  return NOISY_TRADES.indexOf(norm.trade) !== -1 || NOISY_CODES.test(String(norm.code || ""));
}
function isHauling(norm) {
  if (!norm) return false;
  return HAULING_TRADES.indexOf(norm.trade) !== -1;
}

// ---- the normalised shape ------------------------------------------
// Every field the rest of the engine may read, with the CONSERVATIVE
// default when it has not been answered. Conservative means the choice
// that does not shorten the programme: one day shift, no extra hours.
// An engine that assumed "both shifts" because nobody said otherwise
// would publish a date it has no right to.
function apply(cond) {
  const c = cond || {};
  const shift = SHIFTS.indexOf(c.shift) !== -1 ? c.shift : "day";
  const num = (v, lo, hi) => {
    const n = Number(v);
    return isFinite(n) && n > 0 ? Math.max(lo, Math.min(hi, n)) : null;
  };
  return {
    shift: shift,
    shiftHours: num(c.shiftHours, 1, 12) || BASE_HOURS,
    occupied: !!c.occupied,
    // hours a day the loud work is allowed. null means unrestricted.
    noiseHours: c.occupied ? (num(c.noiseHours, 0.5, 24) || null) : (num(c.noiseHours, 0.5, 24) || null),
    noiseWindow: c.noiseWindow || null,          // "18:00 to 07:00", for the copy
    // hours a day the lift or loading bay is available. null means all day.
    accessHours: num(c.accessHours, 0.5, 24) || null,
    accessNote: c.accessNote || null,
    limitations: c.limitations || null,
    _answered: {
      shift: SHIFTS.indexOf(c.shift) !== -1,
      occupied: typeof c.occupied === "boolean",
      noise: c.noiseHours != null || c.noiseWindow != null,
      access: c.accessHours != null || c.accessNote != null,
    },
  };
}

// ---- the hours one task really gets --------------------------------
// Returns the number AND the reasons, so a screen can always say why a
// duration is what it is instead of presenting a number with no story.
function hoursFor(norm, cond) {
  const c = apply(cond);
  const why = [];
  let h = c.shiftHours;

  if (c.shift === "both") { h = c.shiftHours * 2; why.push("two shifts, " + c.shiftHours + " hours each"); }
  else if (c.shift === "night") why.push("night shift, " + c.shiftHours + " hours");
  else why.push("day shift, " + c.shiftHours + " hours");

  // noise: the loud trades lose the hours they are not allowed to be loud in
  if (c.noiseHours != null && isNoisy(norm) && c.noiseHours < h) {
    h = c.noiseHours;
    why.push("noisy work limited to " + c.noiseHours + " hours a day"
      + (c.noiseWindow ? " (" + c.noiseWindow + ")" : "")
      + (c.occupied ? ", the building is occupied" : ""));
  }

  // access: the trades that live on the lift cannot outrun it
  if (c.accessHours != null && isHauling(norm) && c.accessHours < h) {
    h = c.accessHours;
    why.push("material access limited to " + c.accessHours + " hours a day"
      + (c.accessNote ? " (" + c.accessNote + ")" : ""));
  }

  if (h < MIN_HOURS) { h = MIN_HOURS; why.push("held at the " + MIN_HOURS + " hour floor"); }
  return { hours: h, why: why, noisy: isNoisy(norm), hauling: isHauling(norm) };
}

// ---- what the engine had to assume ---------------------------------
// The materiality gate wants these named, not buried. Each one carries
// the question a human should answer and what the engine did meanwhile.
function assumptions(cond) {
  const c = apply(cond);
  const out = [];
  if (!c._answered.shift) out.push({ id: "COND-SHIFT", about: "Shift",
    question: "Does this site run a day shift, a night shift, or both?",
    assumed: "a single day shift of " + c.shiftHours + " hours",
    impact: "high" });
  if (!c._answered.occupied) out.push({ id: "COND-OCCUPIED", about: "Occupied premises",
    question: "Is the building occupied while we work?",
    assumed: "empty, so no restriction on noisy work",
    impact: "high" });
  if (!c._answered.noise && c.occupied) out.push({ id: "COND-NOISE", about: "Noisy work",
    question: "What hours is noisy work allowed in an occupied building?",
    assumed: "no limit, which is unlikely in an occupied building",
    impact: "high" });
  if (!c._answered.access) out.push({ id: "COND-ACCESS", about: "Access and hoisting",
    question: "Is the service lift or loading bay shared or time limited?",
    assumed: "material can move all day",
    impact: "medium" });
  return out;
}

// one plain sentence for a cover or a header
function summarise(cond) {
  const c = apply(cond);
  const bits = [];
  bits.push(c.shift === "both" ? "two shifts a day" : c.shift === "night" ? "night shift" : "day shift");
  if (c.occupied) bits.push("occupied premises");
  if (c.noiseHours != null) bits.push("noisy work " + c.noiseHours + "h a day"
    + (c.noiseWindow ? ", " + c.noiseWindow : ""));
  if (c.accessHours != null) bits.push("material access " + c.accessHours + "h a day");
  return bits.join(" · ");
}

// a stable signature, so a plan memo knows when conditions changed
function signature(cond) {
  const c = apply(cond);
  return [c.shift, c.shiftHours, c.occupied ? 1 : 0, c.noiseHours, c.accessHours].join("|");
}

const COND = { SHIFTS, BASE_HOURS, MIN_HOURS, NOISY_TRADES, NOISY_CODES, HAULING_TRADES,
  isNoisy, isHauling, apply, hoursFor, assumptions, summarise, signature };

root.KB_COND = COND;
if (typeof module !== "undefined" && module.exports) module.exports = COND;

})(typeof window !== "undefined" ? window : globalThis);
