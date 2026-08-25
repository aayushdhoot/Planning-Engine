// ===================================================================
// DnB-OS . platform/track/project/skf_manpower.js
// THE MANPOWER AND SAFETY PACK . SKF Pune
// Headcount per trade per day, read verbatim from the WhatsApp DPR
// (dpr/_chat.txt, 05 to 15 Jul, day and night shifts) and the 18 Jul pin
// walk tally (47 counted). Every number is what the DPR claimed, tag
// claimed, not a measured turnstile count. The reported grand total is
// kept beside the trade sum; the manpower law flags a day when the two
// disagree. Safety manhours and near miss are not in the DPR, so they
// are a query, never a zero. EHS on the report is the safety staff head
// count, not manhours.
// ===================================================================

;(function (root) {

const MAN = {
  project: "SKF Pune",
  asOf: "2026-07-18",
  queryPrefix: "manpower ",

  // safety is a channel with no numbers yet
  safety: { manhours: null, safeManhours: null, firstAid: null, nearMiss: null,
    note: "The DPR carries an EHS staff count (1 to 2 a day) but no safety manhours, first aid or near miss log. These are queried, never shown as zero." },

  // one record per shift per day. trades is what the DPR listed. total is
  // the DPR grand total. fsStaff is the FS staff head count above labour.
  days: [
    { day: "2026-07-05", shift: "day",  total: 37, fsStaff: 6, ehs: 2,
      trades: { Electrical: 5, Civil: 5, Gypsum: 4, Housekeeping: 7, FAS: 3, HVAC: 7 } },
    { day: "2026-07-06", shift: "day",  total: 37, fsStaff: 7, ehs: 2,
      trades: { Electrical: 5, Civil: 5, Gypsum: 4, Housekeeping: 7, FAS: 3, HVAC: 7, Painter: 3 } },
    { day: "2026-07-07", shift: "day",  total: 34, fsStaff: 6, ehs: 1,
      trades: { Electrical: 5, Housekeeping: 5, FAS: 3, HVAC: 7, Painter: 3, Civil: 5 } },
    { day: "2026-07-07", shift: "night", total: 5, fsStaff: 1, ehs: 1,
      trades: { Electrical: 4 } },
    { day: "2026-07-08", shift: "day",  total: 20, fsStaff: 5, ehs: 1,
      trades: { Painter: 2, Civil: 5, Gypsum: 6, Electrical: 3 } },
    { day: "2026-07-08", shift: "night", total: 5, fsStaff: 1, ehs: 1,
      trades: { Electrical: 4 } },
    { day: "2026-07-09", shift: "day",  total: 17, fsStaff: 3, ehs: 1,
      trades: { Painter: 3, Punning: 5, Gypsum: 6 } },
    { day: "2026-07-09", shift: "night", total: 4, fsStaff: 1, ehs: 1,
      trades: { Electrical: 3 } },
    { day: "2026-07-10", shift: "day",  total: 27, fsStaff: 5, ehs: 1,
      trades: { Painter: 4, Punning: 2, Gypsum: 5, Electrical: 4, Housekeeping: 3, "Workstation marking": 4 } },
    { day: "2026-07-10", shift: "night", total: 17, fsStaff: 1, ehs: 1,
      trades: { Civil: 6, Electrical: 10 } },
    { day: "2026-07-11", shift: "day",  total: 34, fsStaff: 5, ehs: 1,
      trades: { Painter: 5, Civil: 9, Gypsum: 4, Electrical: 4, Housekeeping: 2, "Fire fighting": 3, HVAC: 2 } },
    { day: "2026-07-11", shift: "night", total: 4, fsStaff: 2, ehs: 1,
      trades: { Electrical: 2 } },
    { day: "2026-07-12", shift: "day",  total: 22, fsStaff: 5, ehs: 1,
      trades: { Painter: 5, Civil: 3, Gypsum: 2, Electrical: 4, Housekeeping: 2, HVAC: 2 } },
    { day: "2026-07-12", shift: "night", total: 6, fsStaff: 2, ehs: 1,
      trades: { Electrical: 4 } },
    { day: "2026-07-13", shift: "day",  total: 32, fsStaff: 5, ehs: 1,
      trades: { Painter: 5, Civil: 9, Gypsum: 3, Electrical: 4, "Fire fighting": 2, HVAC: 2, Housekeeping: 2 } },
    { day: "2026-07-13", shift: "night", total: 11, fsStaff: 2, ehs: 1,
      trades: { Electrical: 9 } },
    { day: "2026-07-14", shift: "day",  total: 45, fsStaff: 5, ehs: 1,
      trades: { Painter: 5, Civil: 9, Gypsum: 3, Electrical: 5, "Fire fighting": 5, HVAC: 4, Carpenter: 7, Housekeeping: 2 } },
    { day: "2026-07-14", shift: "night", total: 27, fsStaff: 2, ehs: 1,
      trades: { Electrical: 10, Civil: 8, Ducting: 7 } },
    { day: "2026-07-15", shift: "day",  total: 48, fsStaff: 5, ehs: 1,
      trades: { Painter: 5, Civil: 9, Gypsum: 3, Electrical: 5, "Fire fighting": 4, HVAC: 8, Carpenter: 7, Housekeeping: 2 } },
    { day: "2026-07-15", shift: "night", total: 40, fsStaff: 2, ehs: 1,
      trades: { Electrical: 12, Civil: 9, Ducting: 10, Carpenter: 7 } },
    // the 18 Jul pin walk: a head tally, no trade breakdown, so nothing
    // to reconcile. Trades seen but not counted: HVAC, drywall, masons,
    // electricians, putty gangs, helpers.
    { day: "2026-07-18", shift: "day",  total: 47, fsStaff: null, ehs: null, trades: {},
      note: "Counted on the 81 pin walk across four slices (5 + 13 + 12 + 17). Not broken down by trade." }
  ],

  queries: [
    { about: "manpower safety log",
      question: "The DPR gives daily headcount but no safety manhours, first aid count or near miss log. The India DPR standard tracks all three (the client deck carried 11,230 worked and 10,590 safe). Start a daily safety line so the engine can hold it. Until then safety reads as not logged, never zero.", blocking: false },
    { about: "manpower ramp",
      question: "On 15 Jul the day count reached 48 and Vikash flagged labour far behind expected. From next week the plan stacks tile, carpet, ceilings, cubicles and millwork together. What is the planned headcount ramp per trade for the next two weeks?", blocking: false }
  ],

  apply: function (ledger) {
    if (ledger.state.queries.some(q => q.about === "manpower safety log")) {
      return { applied: false, reason: "manpower pack queries already raised" };
    }
    for (const q of MAN.queries) ledger.addQuery(q);
    return { applied: true, queries: MAN.queries.length };
  }
};

root.TRACK_MANPOWER_SKF = MAN;
if (typeof module !== "undefined") module.exports = root.TRACK_MANPOWER_SKF;

})(typeof window !== "undefined" ? window : globalThis);
