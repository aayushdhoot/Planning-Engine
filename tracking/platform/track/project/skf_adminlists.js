// ===================================================================
// DnB-OS . platform/track/project/skf_adminlists.js
// THE SMALL ADMIN LISTS PACK . SKF Pune . as of 18 Jul 2026
// Day one rituals the sheets held: approved sample boards with sign
// marks, the site readiness checklist, the client visit itinerary, and
// the housekeeping count per day. Sources:
//   . Wk4 tracker (mock-up sign off, weekly client walkthrough)
//   . Signed agreement (access, temporary power, insurance)
//   . The DPR housekeeping labour line (05 to 15 Jul)
//   . The 18 Jul walk HSE notes (housekeeping flags)
// Nothing is marked signed or ready without a dated basis. The rest are
// queried. The admin lists law scores these.
// ===================================================================

;(function (root) {

const ADMIN = {
  project: "SKF Pune",
  asOf: "2026-07-18",
  queryPrefix: "admin ",

  lists: {
    sampleBoards: [
      { key: "sb_ws", text: "Workstation mock-up sign off", note: "Wk4 #17, first of kind gate, not signed." },
      { key: "sb_mr", text: "Meeting room mock-up sign off", note: "Wk4 #17, not signed." },
      { key: "sb_ceiling", text: "Ceiling mock-up sign off", note: "Wk4 #17, not signed." },
      { key: "sb_mep", text: "MEP approved sample boards on site (client, GC, consultant logos)", note: "Physical proof of approval, the client deck kept these. Not yet photographed on site." },
      { key: "sb_carpet", text: "Carpet and flooring sample board", note: "Carpet sample at 50 percent per Wk4." },
      { key: "sb_paint", text: "Paint and finish sample board", note: "Finish TDS pending client selection." }
    ],
    siteReadiness: [
      { key: "sr_access", text: "Site access and passes (Phoenix)", on: "2026-06-08", source: "signed agreement, commencement" },
      { key: "sr_power", text: "Temporary power", on: "2026-06-12", source: "project schedule actuals" },
      { key: "sr_water", text: "Construction water supply", note: "No record. Queried, and tracked as a dependency." },
      { key: "sr_storage", text: "Material storage and staging area", note: "Blocks and duct staged on floor per the walk. Formal staging area not confirmed." },
      { key: "sr_safety", text: "Safety induction, PTW and toolbox board", note: "Wk4 #20 PTW at 50 percent, ongoing." },
      { key: "sr_hoarding", text: "Hoarding and barricading", note: "Cones and chain barricades seen at P38, P40, P51, P52, P80 on the walk." },
      { key: "sr_firstaid", text: "First aid and firefighting on floor", note: "EHS staff on site daily. Kit placement not confirmed." }
    ],
    itinerary: [
      { key: "iv_weekly", text: "Weekly client update and walkthrough", note: "Wk4 #24, owner Rajesh Pillai (SKF) and Atish (FS). Next visit date not set." }
    ]
  },

  // housekeeping head count per day, from the DPR housekeeping line.
  // Claimed, tag law applies. 08 and 09 Jul carried no housekeeping line.
  housekeeping: [
    { day: "2026-07-05", count: 7 },
    { day: "2026-07-06", count: 7 },
    { day: "2026-07-07", count: 5 },
    { day: "2026-07-10", count: 3 },
    { day: "2026-07-11", count: 2 },
    { day: "2026-07-12", count: 2 },
    { day: "2026-07-13", count: 2 },
    { day: "2026-07-14", count: 2 },
    { day: "2026-07-15", count: 2, note: "From 08 Jul the housekeeping line thins to 2 a day even as trades ramp." },
    { day: "2026-07-18", count: null, note: "Walk HSE flags: rubble against new glazing at P59, cardboard fire load at P74, standing water at P47 to P49, glass wool scraps at P15, P16, P19. Housekeeping count not reported on the walk." }
  ],

  queries: [
    { about: "admin sample boards",
      question: "None of the mock-up and sample boards are signed yet (workstation, meeting room, ceiling, MEP, carpet, paint). Wk4 named the workstation, MR and ceiling mock-ups as a first of kind gate. Which are approved, by whom, and on what date? A board is signed only from a dated record.", blocking: false },
    { about: "admin client visit",
      question: "The weekly client walkthrough (Wk4 #24) has no next date set. When is the next SKF visit, and what is the itinerary? The client deck kept a visit choreography sheet.", blocking: false },
    { about: "admin housekeeping",
      question: "The housekeeping crew thinned to 2 a day from 08 Jul while trades ramped, and the 18 Jul walk flagged rubble against glazing, cardboard fire load, standing water and loose glass wool. Is the housekeeping deployment enough, and who clears the flagged spots?", blocking: false }
  ],

  apply: function (ledger) {
    if (ledger.state.queries.some(q => q.about === "admin sample boards")) {
      return { applied: false, reason: "admin lists pack queries already raised" };
    }
    for (const q of ADMIN.queries) ledger.addQuery(q);
    return { applied: true, queries: ADMIN.queries.length };
  }
};

root.TRACK_ADMINLISTS_SKF = ADMIN;
if (typeof module !== "undefined") module.exports = root.TRACK_ADMINLISTS_SKF;

})(typeof window !== "undefined" ? window : globalThis);
