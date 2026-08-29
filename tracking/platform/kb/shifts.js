// ===================================================================
// DnB-OS . platform/kb/shifts.js . HOW MANY PEOPLE, FOR HOW LONG
// The engine used to answer "the date does not fit" by multiplying the
// crew until it did. The search ran to 24x and asked for 11,808 people on
// a 19,181 sqft floor. Nobody caught it because nothing in the model knew
// what a floor can physically hold, and nothing knew that the real answer
// a site reaches for is not more people in the same eight hours — it is
// more hours.
//
//   DENSITY      what a floor holds, sustained and at peak
//   PATTERNS     the shift patterns an Indian fit-out actually runs
//   capacityOf() man-days a floor can pass in a window, under a pattern
//   patternFor() the lightest pattern that carries a given amount of work
//
// THE LAWS
//   . A FLOOR HAS A CEILING AND IT IS NOT NEGOTIABLE. Man-days come from
//     people x days. People come from square feet. No schedule may ask
//     for more people than the floor holds, at any moment, ever.
//   . MORE HOURS BEFORE MORE PEOPLE. A packed floor does not go faster
//     by packing it harder; it goes faster by running a second shift.
//   . AN HOUR AT NIGHT IS NOT AN HOUR AT NOON. Overtime and night work
//     are counted at what they actually produce, not at their length.
//   . WHAT WILL NOT FIT IS NAMED. If the heaviest pattern still does not
//     carry the work, the engine says how much spills and to when. It
//     does not invent a crew.
//
// Pure: numbers in, numbers out. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

// ---- WHAT A FLOOR HOLDS ------------------------------------------------
// Two different numbers, and using one for the other is how the model got
// to 11,808 people.
//
// SUSTAINED is the density a floor works at day after day with materials
// landing, debris going out, one goods lift and a supervisor who can still
// see what is happening. On an Indian commercial interior fit-out that is
// about one worker per 225 sqft.
//
// PEAK is what the same floor absorbs for a few weeks during finishing,
// when the work is spread thin across every room, the plant is small and
// the trades are painters, carpenters and electricians rather than gangs
// breaking concrete. One per 100 sqft. On this floor that is 192 people,
// which is the number a project manager would recognise as "about 200 at
// the peak" — and it is a CEILING, not a target.
const DENSITY = {
  sustainedSqftPerWorker: 225,
  peakSqftPerWorker: 100,
  why: "one worker per 225 sqft is what a floor works at day after day with material movement, " +
       "debris removal and one goods lift; one per 100 sqft is what it absorbs for a few weeks " +
       "of finishing, when the trades are light and spread across every room",
};

// ---- THE SHIFT PATTERNS AN INDIAN FIT-OUT ACTUALLY RUNS ----------------
// A commercial tower restricts hours, the goods lift is shared, and the
// building's own tenants are next door. These four are what site managers
// reach for, in the order they reach for them.
//
// `hours`     paid hours on the floor per worker per day
// `effective` man-days produced per worker per day, AFTER fatigue and the
//             fact that a night crew works without the full supervision,
//             material flow and consultant availability a day crew has
// `peopleMult` how many times the sustained density the pattern puts on
//             the floor across the whole day (two shifts = two crews, but
//             never both at once, so the instantaneous density is still 1x)
// `cost`      rough multiple on the labour bill, so the choice is honest
const PATTERNS = [
  { id: "general", name: "General shift", order: 1,
    window: "09:00 to 18:00", hours: 8, effective: 1.00, peopleMult: 1, cost: 1.00,
    why: "one crew, eight working hours and an hour off. The default, and what every norm in " +
         "this engine is written against" },

  { id: "extended", name: "General shift with overtime", order: 2,
    window: "09:00 to 22:00", hours: 12, effective: 1.35, peopleMult: 1, cost: 1.60,
    why: "the same crew held back four hours, paid at overtime. Twelve hours on the floor " +
         "produces about 1.35 days of work, not 1.5 — the last hours are the tired ones. " +
         "The commonest answer on a fit-out that is three weeks behind" },

  { id: "double", name: "Two shifts", order: 3,
    window: "08:00 to 20:00 and 20:00 to 08:00", hours: 24, effective: 1.85, peopleMult: 2, cost: 2.20,
    why: "two crews, day and night. The night crew produces about 85% of the day crew: the same " +
         "hands, less supervision, no consultant to answer a question and a shared goods lift. " +
         "Needs building permission for night work and a second set of supervisors" },

  { id: "triple", name: "Round the clock", order: 4,
    window: "three shifts of eight", hours: 24, effective: 2.30, peopleMult: 3, cost: 3.10,
    why: "three crews of eight hours. Rarely worth it on an interior fit-out: the handover " +
         "between shifts costs an hour each end, material cannot be moved into a tower at 3am, " +
         "and the third crew is the hardest to staff. Here as the last thing before the date moves" },
];

const BY_ID = {}; PATTERNS.forEach(p => BY_ID[p.id] = p);

// ---- what a floor can pass in a window ---------------------------------
// A FLOOR'S CEILING IS AN INSTANT, NOT A TOTAL. Two shifts do not put two
// hundred people in a room at once — they put the same crew in it twice.
// So the instantaneous density stays at the sustained figure and the extra
// comes out of the hours, which is exactly why a second shift is the right
// lever and a bigger gang is not.
function workersFor(sqft, which) {
  const per = which === "peak" ? DENSITY.peakSqftPerWorker : DENSITY.sustainedSqftPerWorker;
  return Math.max(1, Math.floor((Number(sqft) || 0) / per));
}

// man-days a floor can produce over `workingDays`, under a pattern
function capacityOf(sqft, workingDays, patternId) {
  const p = BY_ID[patternId] || BY_ID.general;
  const sustained = workersFor(sqft, "sustained");
  return Math.round(sustained * (Number(workingDays) || 0) * p.effective);
}

// the most people standing on the floor at any one moment under a pattern
function peakOnFloor(sqft, patternId) {
  const p = BY_ID[patternId] || BY_ID.general;
  // a shift's crew may be pushed to peak density; the OTHER shifts are not
  // on the floor at the same time, so they do not add to the instant
  return { perShift: workersFor(sqft, "peak"), shifts: p.peopleMult,
           acrossTheDay: workersFor(sqft, "peak") * p.peopleMult,
           ceiling: workersFor(sqft, "peak") };
}

// ---- the lightest pattern that carries the work ------------------------
// Tried in order, because a site does not jump to night work to save a day.
// Returns the pattern and, where none of them is enough, what spills.
function patternFor(manDaysNeeded, sqft, workingDays) {
  const need = Number(manDaysNeeded) || 0;
  const tried = PATTERNS.map(p => {
    const cap = capacityOf(sqft, workingDays, p.id);
    return { id: p.id, name: p.name, capacity: cap, enough: cap >= need,
             ratio: cap ? Number((need / cap).toFixed(2)) : null, cost: p.cost };
  });
  const fit = tried.find(t => t.enough) || null;
  const best = tried[tried.length - 1];
  return {
    pattern: fit ? fit.id : best.id,
    landed: !!fit,
    tried,
    // what cannot be made to fit, in man-days and in the working days it
    // would take at the heaviest pattern's rate
    spill: fit ? null : {
      manDays: Math.round(need - best.capacity),
      share: Math.round((need - best.capacity) / need * 100),
      extraWorkingDays: Math.ceil((need - best.capacity) /
        Math.max(1, capacityOf(sqft, 1, best.id))),
      why: "even " + best.name.toLowerCase() + " on every working day in the window carries " +
           best.capacity + " man-days, and the work is " + Math.round(need),
    },
  };
}

const SHIFTS = { DENSITY, PATTERNS, BY_ID, workersFor, capacityOf, peakOnFloor, patternFor };
root.KB_SHIFTS = SHIFTS;
if (typeof module !== "undefined" && module.exports) module.exports = SHIFTS;

})(typeof globalThis !== "undefined" ? globalThis : this);
