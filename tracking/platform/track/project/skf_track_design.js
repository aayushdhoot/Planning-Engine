// ===================================================================
// DnB-OS . platform/track/project/skf_track_design.js
// DESIGN & DRAWINGS TRACKING PACK . SKF Pune . as of 16 Jul 2026
// Curated from the ledger's absorbed sources, nothing invented:
//   . drawing register: GFC TRACKER Google Sheet (pulled 16 Jul, 58 drawings)
//   . cross check: SKF Weekly Task Tracker Wk4 (last updated around 06 Jul)
// Group planned dates come from the register's own start and end dates.
// A drawing marked Completed on the register is a claim, not proof:
// SKF has approved nothing, so nothing here can be verified_done.
// The register's own summary says 22 completed but the rows add to 19.
// The engine trusts the rows and raises the discrepancy as a query.
// Drawings with no dates on the register are refused by the law and
// named in a query. Every gap is a question, never a guess.
// ===================================================================

;(function (root) {

const D_EV = "2026-07-16";  // day the register was pulled into the ledger
const WK4  = "2026-07-06";  // Wk4 tracker freshness (10 days stale on 16 Jul)

const DESIGN = {

  category: "Design & Drawings",
  boqCode: null,
  asOf: "2026-07-16",
  queryPrefix: "design ",

  context: {
    note: "58 drawings on the GFC TRACKER register in 4 groups. By row count: 19 INT completed, 4 in progress, 4 under revision R1, 31 not started (all 23 MEP among them). SKF side approvals: 0 of 58 started.",
    line: "Source GFC TRACKER register, 58 drawings · INT completed 19 of 58 by row count (sheet summary claims 22, raised as a query) · under revision R1 4 · SKF approvals 0 of 58"
  },

  commitments: [],

  tasks: [

    {
      name: "GFC layouts (9 drawings)",
      sub: "Good for construction",
      planned: { start: "2026-05-28", finish: "2026-06-13" },
      commitments: [], materials: [],
      measured: { done: 4, of: 9, unit: "drawings INT completed" },
      evidence: [
        { day: D_EV, kind: "schedule", text: "GFC tracker rows: 4 of 9 INT completed (Furniture, Flooring, Modular, Partition), 4 under revision R1 (Furniture Dimensions, Wall finish, RCP, Lighting), Base Build Layout not started. SKF approval not started on any." }
      ],
      items: [
        { name: "Base Build Layout (Crit 1)", planned: { start: "2026-06-05", finish: "2026-06-09" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Furniture Layout (Crit 1)", planned: { start: "2026-05-28", finish: "2026-05-28" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed, revision Approved. SKF approval not started." }] },
        { name: "Furniture Dimensions Layout (Crit 1)", planned: { start: "2026-06-01", finish: "2026-06-01" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", text: "Register: Under Revision R1 (was Approved). SKF approval not started." }] },
        { name: "Wall finish layout (Crit 1)", planned: { start: "2026-06-11", finish: "2026-06-11" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", text: "Register: Under Revision R1." }] },
        { name: "Flooring Layout (Crit 1)", planned: { start: "2026-06-02", finish: "2026-06-02" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed, revision Approved. SKF approval not started." }] },
        { name: "Modular layout (Crit 1)", planned: { start: "2026-06-11", finish: "2026-06-11" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. Revision column reads Not Started." }] },
        { name: "Partition Layout (Crit 1)", planned: { start: "2026-06-03", finish: "2026-06-03" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed, revision Approved. SKF approval not started." }] },
        { name: "RCP Layout (Crit 1)", planned: { start: "2026-06-04", finish: "2026-06-13" }, commitments: [], materials: [], measured: null,
          evidence: [
            { day: D_EV, kind: "schedule", text: "Register: Under Revision R1, revision In Progress." },
            { day: WK4, kind: "claim", text: "Wk4 tracker: integrated RCP (C-101) blocked at 10 percent, depends on MEP inputs. Top gate, ceiling cannot close." }
          ] },
        { name: "Lighting Layout with dimensions (Crit 1)", planned: { start: "2026-06-05", finish: "2026-06-05" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", text: "Register: Under Revision R1, revision Not Started." }] }
      ]
    },

    {
      name: "Technical details, TD (9 drawings)",
      sub: "Furniture and ceiling details",
      planned: { start: "2026-05-19", finish: "2026-06-19" },
      commitments: [], materials: [],
      measured: { done: 9, of: 9, unit: "drawings INT completed" },
      evidence: [
        { day: D_EV, kind: "schedule", completes: true, text: "GFC tracker rows: all 9 TD drawings INT Completed (Reception Table, Ledge Seating, Boardroom Table, Designer partition, Designer pod seating, Designer Ceiling, Baffle Ceiling, High table, Pelmet detail). SKF approval not started on any. Sheet claim only, no client sign off." }
      ],
      items: [
        { name: "Reception Table (Crit 1)", planned: { start: "2026-06-19", finish: "2026-06-19" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. SKF approval not started." }] },
        { name: "Ledge Seating (Crit 1)", planned: { start: "2026-05-19", finish: "2026-06-19" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. SKF approval not started." }] },
        { name: "Boardroom Table (Crit 1)", planned: { start: "2026-06-17", finish: "2026-06-17" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. SKF approval not started." }] },
        { name: "Designer partition (Crit 1)", planned: { start: "2026-05-22", finish: "2026-06-16" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. SKF approval not started." }] },
        { name: "Designer pod seating", planned: { start: "2026-06-17", finish: "2026-06-17" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed, revision In Progress." }] },
        { name: "Designer Ceiling, collab area", planned: null, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. No planned dates on the register." }] },
        { name: "Baffle Ceiling", planned: null, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. No planned dates on the register." }] },
        { name: "High table, collab area", planned: null, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. No planned dates on the register." }] },
        { name: "Pelmet detail", planned: { start: "2026-06-18", finish: "2026-06-18" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed, revision In Progress." }] }
      ]
    },

    {
      name: "Elevational TDs (17 drawings)",
      sub: "Elevations",
      planned: { start: "2026-05-25", finish: "2026-06-14" },
      commitments: [], materials: [],
      measured: { done: 6, of: 17, unit: "drawings INT completed" },
      evidence: [
        { day: D_EV, kind: "schedule", text: "GFC tracker rows: 6 of 17 INT completed (Reception, Boardroom, Cabin, Dry Pantry, 12 pax meeting room, Ledge Seating passage), 4 in progress (Meeting Room typical, Handwash, Cafeteria wall, Phone Booth), 7 not started including all 6 washroom types whose windows ended 11 Jun." }
      ],
      items: [
        { name: "Reception (Crit 1)", planned: { start: "2026-05-25", finish: "2026-06-14" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. SKF approval not started." }] },
        { name: "Meeting Room typical (Crit 1)", planned: { start: "2026-05-26", finish: "2026-06-14" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", text: "Register: INT In Progress." }] },
        { name: "Boardroom (Crit 1)", planned: { start: "2026-05-27", finish: "2026-06-14" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. SKF approval not started." }] },
        { name: "Cabin (Crit 1)", planned: { start: "2026-05-28", finish: "2026-06-14" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. SKF approval not started." }] },
        { name: "Handwash, cafe", planned: { start: "2026-06-14", finish: "2026-06-14" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", text: "Register: INT In Progress." }] },
        { name: "Dry Pantry, collab", planned: { start: "2026-06-14", finish: "2026-06-14" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed." }] },
        { name: "Tuck Shop, cafe", planned: { start: "2026-06-14", finish: "2026-06-14" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Cafeteria wall, wallpaper", planned: null, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", text: "Register: INT In Progress. No planned dates on the register." }] },
        { name: "12 pax meeting room", planned: { start: "2026-06-14", finish: "2026-06-14" }, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed." }] },
        { name: "Ledge Seating, passage", planned: null, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", completes: true, text: "Register: INT Completed. No planned dates on the register." }] },
        { name: "Phone Booth", planned: null, commitments: [], materials: [], measured: null,
          evidence: [{ day: D_EV, kind: "schedule", text: "Register: INT In Progress. No planned dates on the register." }] },
        { name: "Male Washroom type 01", planned: { start: "2026-06-11", finish: "2026-06-11" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Male Washroom type 02", planned: { start: "2026-06-11", finish: "2026-06-11" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Female washroom type 01", planned: { start: "2026-06-11", finish: "2026-06-11" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Female washroom type 02", planned: { start: "2026-06-11", finish: "2026-06-11" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Handicap washroom type 01", planned: { start: "2026-06-11", finish: "2026-06-11" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Handicap washroom type 02", planned: { start: "2026-06-11", finish: "2026-06-11" }, commitments: [], materials: [], measured: null, evidence: [] }
      ]
    },

    {
      name: "MEP drawings (23 drawings)",
      sub: "All Criticality 1",
      planned: { start: "2026-05-06", finish: "2026-06-12" },
      commitments: [], materials: [],
      measured: { done: 0, of: 23, unit: "drawings INT completed" },
      evidence: [
        { day: WK4, kind: "claim", text: "Wk4 tracker: Issue GFC MEP coordination (C-100) plus integrated RCP (C-101), Blocked at 10 percent, depends on MEP inputs. Fire layouts F-100 and F-105 for Fire NOC not started. HVAC ducting on site is blocked on drawing M-100." }
      ],
      // the register itself says all 23 Not Started, windows ended 12 Jun.
      // that is absence of work, not evidence, so it raises the query below.
      items: [
        { name: "UPS CALCULATION", planned: { start: "2026-05-06", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "HVAC DBR", planned: { start: "2026-05-06", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Hvac layout", planned: { start: "2026-05-12", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Panel & DB Position layout", planned: { start: "2026-05-11", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Power & Data Layout", planned: { start: "2026-05-13", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Raceway Layout", planned: { start: "2026-05-14", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Cable Tray Layout", planned: { start: "2026-05-16", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Lighting Looping Layout", planned: { start: "2026-05-19", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Electrical SLD Layout", planned: { start: "2026-05-22", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Fire Sprinkler Layout", planned: { start: "2026-05-22", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Fire Drencher Layout", planned: { start: "2026-05-25", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Fire Extinguisher Layout", planned: { start: "2026-05-26", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "FAS & PA Layout", planned: { start: "2026-05-27", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "CCTV Layout", planned: { start: "2026-05-28", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "WLD Layout", planned: { start: "2026-05-30", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Rodent Layout", planned: { start: "2026-05-16", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "NOVEC System Layout", planned: { start: "2026-05-19", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Fire Exit Layout", planned: { start: "2026-05-20", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "BMS Layout", planned: { start: "2026-05-22", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Access Control Layout", planned: { start: "2026-05-22", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Plumbing Drainage Layout", planned: { start: "2026-05-25", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Plumbing Water Supply Layout", planned: { start: "2026-05-26", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Load Analysis Sheet", planned: { start: "2026-05-28", finish: "2026-06-12" }, commitments: [], materials: [], measured: null, evidence: [] }
      ]
    }
  ],

  queries: [
    { about: "design mep drawings",
      question: "All 23 MEP GFC drawings are Criticality 1 and every one reads Not Started on the register, with every window ended 12 Jun (34 days past). Wk4 says MEP coordination C-100 and RCP C-101 are Blocked at 10 percent on MEP inputs, and HVAC ducting on site is blocked on M-100. Who is producing the MEP set, and what is the recovery date per drawing?", blocking: false },
    { about: "design skf approvals",
      question: "Zero of 58 drawings show any SKF side approval started. Confirm the client approval workflow: who at SKF signs, what has been issued to them, and the expected approval dates. Until sign off, every Completed drawing stays claimed done, not verified.", blocking: false },
    { about: "design count discrepancy",
      question: "The register's own summary says 22 INT completed, 5 in progress, 27 not started. The rows add to 19 completed, 4 in progress, 31 not started. The engine trusts the rows. Reconcile the sheet summary with its rows.", blocking: false },
    { about: "design undated drawings",
      question: "Six drawings have no planned dates on the register, so the law refuses to score them at item level: Designer Ceiling, Baffle Ceiling, High table (TD), Cafeteria wall, Ledge Seating passage, Phone Booth (ELEV). Supply their planned start and finish.", blocking: false }
  ],

  pins: [],

  apply: function (ledger, zones) {
    if (ledger.state.queries.some(q => q.about === "design mep drawings")) {
      return { applied: false, reason: "design tracking queries already raised" };
    }
    let pinsOk = 0, pinsMissed = 0;
    for (const id of DESIGN.pins) {
      const r = zones.pin(id);
      if (r.ok) pinsOk++;
      else { pinsMissed++; ledger.addQuery(r.query); }
    }
    for (const q of DESIGN.queries) ledger.addQuery(q);
    return { applied: true, queries: DESIGN.queries.length, pinsOk, pinsMissed };
  }
};

root.TRACK_DESIGN = DESIGN;
if (typeof module !== "undefined") module.exports = root.TRACK_DESIGN;

})(typeof window !== "undefined" ? window : globalThis);
