// ===================================================================
// DnB-OS . platform/track/project/skf_hse.js . THE HSE PACK . SKF Pune
// Safety flags per walk day, read from the daily pin walk photos. The
// first day loaded is 18 Jul 2026, seeded verbatim from the walk read
// (site_readings/2026-07-18.md, HSE section). Every future walk adds its
// day here the same way.
//
// A flag carries: day, category, severity (high/med/low), the pins it was
// seen at, a state (open/closed), and a plain line. Good practice seen on
// the walk is kept apart, as a positive note, never mixed into the flags.
// Closure needs a dated answer, so until an HSE log with close dates
// exists, every flag reads open, never guessed closed. That gap is a
// standing query, not a silent zero.
// ===================================================================

;(function (root) {

var HSE = {
  project: "SKF Pune",
  asOf: "2026-07-18",
  queryPrefix: "hse ",

  // categories the rollup groups by, in this order
  categories: ["PPE", "Work at height", "Electrical", "Housekeeping", "Fire", "Welfare"],

  flags: [
    { day: "2026-07-18", cat: "PPE", sev: "high", pins: [], state: "open",
      text: "Helmets rarely worn. One walk slice counted 2 of 13 wearing." },
    { day: "2026-07-18", cat: "Housekeeping", sev: "high", pins: [], state: "open",
      text: "Open floor trenches on walk routes, no covers." },
    { day: "2026-07-18", cat: "Electrical", sev: "high", pins: [47, 48, 49], state: "open",
      text: "Standing water at P47 to P49 and wet rooms, next to live extension boards." },
    { day: "2026-07-18", cat: "Work at height", sev: "high", pins: [48, 67, 78, 79], state: "open",
      text: "Work at height without guardrail or harness at four pins." },
    { day: "2026-07-18", cat: "Housekeeping", sev: "med", pins: [59], state: "open",
      text: "Rubble heap resting against new glazing at P59. Clear immediately." },
    { day: "2026-07-18", cat: "Electrical", sev: "med", pins: [71, 76], state: "open",
      text: "Energized extension board with loose cable runs." },
    { day: "2026-07-18", cat: "Fire", sev: "med", pins: [74, 81], state: "open",
      text: "Cardboard fire load stacked at P74, possible hot work ash at P81." },
    { day: "2026-07-18", cat: "Housekeeping", sev: "low", pins: [15, 16, 19], state: "open",
      text: "Glass wool scraps loose at P15, P16, P19." },
    { day: "2026-07-18", cat: "Welfare", sev: "low", pins: [], state: "open",
      text: "Workers resting on bare floors." }
  ],

  // good practice, a positive note, kept out of the flag count
  good: [
    { day: "2026-07-18", pins: [38, 40, 51, 52, 80], text: "Cones and chain barricades in place." },
    { day: "2026-07-18", pins: [], text: "Tape crosses on all new glass." }
  ],

  queries: [
    { about: "hse capture cadence",
      question: "Safety flags are read from the daily pin walk photos, so the engine sees what is present but has no HSE inspection log with owners and close dates. Start a daily HSE line (flag, owner, target close date) so closure can be tracked, not just presence. Until then every flag reads open, never a guessed zero.",
      blocking: false }
  ],

  apply: function (ledger) {
    if (ledger.state.queries.some(function (q) { return q.about === "hse capture cadence"; }))
      return { applied: false, reason: "hse pack query already raised" };
    for (var i = 0; i < HSE.queries.length; i++) ledger.addQuery(HSE.queries[i]);
    return { applied: true, queries: HSE.queries.length };
  }
};

root.TRACK_HSE_SKF = HSE;
if (typeof module !== "undefined") module.exports = root.TRACK_HSE_SKF;

})(typeof window !== "undefined" ? window : globalThis);
