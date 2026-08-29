// ===================================================================
// DnB-OS . platform/track/project/skf_track_civil.js
// CIVIL WORKS TRACKING PACK . SKF Pune . as of 16 Jul 2026
// Curated from the ledger's absorbed sources, nothing invented:
//   . baseline dates: "Ptoject Schedule & Milestone - SKF.xlsx" part2 (plan xlsx-v1)
//   . commitments: PO extracts FSL2026272027 / 272011 / 272014
//   . evidence: WhatsApp DPR _chat.txt (verbatim lines, dated), site photos
//   . items: PO 272027 line items (sub-category / item level)
// Every gap is a query. No line below claims more than its source says.
// ===================================================================

;(function (root) {

const CIVIL = {

  category: "Civil Works",
  boqCode: "A1",
  asOf: "2026-07-16",
  queryPrefix: "civil ",

  context: {
    boqClientValue: null,   // BOQ R5 cell A1 reads #ERROR, derived approx 17,81,747 (query open from absorb2)
    boqClientApprox: 1781747,
    boqBcsValue: 1282858,
    note: "BOQ A1 client value unreadable (#ERROR), approximation derived from category rows. BCS value read clean.",
    line: "BOQ A1 · client value unreadable in BOQ R5 (#ERROR), approx ₹17,81,747 · BCS ₹12,82,858 · committed in POs ₹23,81,052 · baseline plan xlsx-v1"
  },

  commitments: [
    { po: "FSL2026272027", rev: 3, vendor: "NATIONAL INFRA SOLUTIONS", value: 1872944,
      delivery: "2026-06-16", scope: "civil execution: plastering, punning, gypsum, AAC blockwork, vitrified tile laying",
      flags: ["Vizdom revision stamp: printed Order Date is the latest revision date, not the original order date"] },
    { po: "FSL2026272011", rev: 3, vendor: "PCI Pest Control", value: 64900,
      delivery: "2026-06-10", scope: "anti-termite and pest control, 22,000 sqft, 2 rounds, 10 year warranty",
      flags: ["Vizdom revision stamp: printed Order Date is the latest revision date, not the original order date"] },
    { po: "FSL2026272014", rev: 6, vendor: "HINDUSTAN ASSOCIATES", value: 443208,
      delivery: "2026-06-11", advance: "100%", scope: "Kajaria vitrified tiles supply, 4495 sqft",
      flags: ["Vizdom revision stamp: printed Order Date is the latest revision date, not the original order date"] }
  ],

  // ---- the six baseline tasks of Civil Works (plan xlsx-v1) ---------
  tasks: [

    {
      name: "Blockwork, AAC Blocks & Plastering",
      sub: "Masonry",
      planned: { start: "2026-06-24", finish: "2026-07-03" },
      commitments: ["FSL2026272027"],
      materials: [],
      measured: null,
      evidence: [
        { day: "2026-06-16", kind: "schedule", text: "Site schedule records masonry actual start 16 Jun (schedule entry, no visual proof)" },
        { day: "2026-07-05", kind: "claim", text: "DPR: 2nd Layer lintel for hub room, Ups room and wash rooms near Cafeteria", zones: ["hub-room", "ups-electrical-room"] },
        { day: "2026-07-06", kind: "claim", text: "DPR: 2nd layer lintel work continuing (hub room, UPS room, washrooms near cafeteria)", zones: ["hub-room", "ups-electrical-room"] },
        { day: "2026-07-07", kind: "photo", text: "DPR: Lintal & block work in server room & electric room", photos: ["00003021-PHOTO-2026-07-07-18-57-31.jpg"], zones: ["server-room", "ups-electrical-room"] },
        { day: "2026-07-08", kind: "claim", text: "DPR: 3rd Layer block work on Lintel for server room & electric room; Punning for AHU Room out side walls near Cafeteria", zones: ["server-room", "ups-electrical-room"] },
        { day: "2026-07-09", kind: "claim", text: "DPR: Punning for AHU Room out side walls near Cafeteria & Washrooms (report shows Painter 03, Punning 05, Gypsum 06; civil labour 0 that day)" },
        { day: "2026-07-11", kind: "claim", text: "DPR: Block Shifting B1 - 07th Floor (logistics, civil labour 9)" },
        { day: "2026-07-12", kind: "claim", text: "DPR: block shifting continuing; Block Work For Server (civil labour 3)", zones: ["server-room"] },
        { day: "2026-07-13", kind: "claim", text: "DPR: Block loading unloading B1 to 7th floor (civil labour 9)" },
        { day: "2026-07-14", kind: "claim", text: "DPR: Plaster work in server room & electric room (plaster start, civil labour 9)", zones: ["server-room", "ups-electrical-room"] },
        { day: "2026-07-15", kind: "claim", text: "DPR: 1) Plaster work in server room & electric room 2) Block work of wash room near cafeteria 3) Sand shifting B1 to 7th floor (civil labour 9)", zones: ["server-room", "ups-electrical-room"] },
        { day: "2026-07-16", kind: "photo", text: "DPR photo: 1st level lintal is done of washroom near cafeteria", photos: ["00003159-PHOTO-2026-07-16-10-50-16.jpg"] },
        { day: "2026-07-16", kind: "photo", text: "DPR photo: washroom block work second layer is start", photos: ["00003160-PHOTO-2026-07-16-10-50-17.jpg"] }
      ],
      // item level, from PO FSL2026272027 line items
      items: [
        {
          name: "AAC block walls 150 mm (272 sqm)",
          planned: { start: "2026-06-24", finish: "2026-07-03" },
          commitments: ["FSL2026272027"], materials: [], measured: null,
          evidence: [
            { day: "2026-07-05", kind: "claim", text: "2nd layer lintel: hub room, UPS room, washrooms near cafeteria", zones: ["hub-room", "ups-electrical-room"] },
            { day: "2026-07-07", kind: "photo", text: "Lintel and blockwork in server room and electric room", photos: ["00003021-PHOTO-2026-07-07-18-57-31.jpg"], zones: ["server-room", "ups-electrical-room"] },
            { day: "2026-07-08", kind: "claim", text: "3rd layer blockwork on lintel, server and electric room", zones: ["server-room", "ups-electrical-room"] },
            { day: "2026-07-12", kind: "claim", text: "Blockwork for server room", zones: ["server-room"] },
            { day: "2026-07-15", kind: "claim", text: "Blockwork of washroom near cafeteria" },
            { day: "2026-07-16", kind: "photo", text: "Washroom lintel level 1 done; second layer blockwork started", photos: ["00003159-PHOTO-2026-07-16-10-50-16.jpg", "00003160-PHOTO-2026-07-16-10-50-17.jpg"] }
          ]
        },
        {
          name: "Cement plastering (approx 429 sqm)",
          planned: { start: "2026-06-24", finish: "2026-07-03" },
          commitments: ["FSL2026272027"], materials: [], measured: null,
          evidence: [
            { day: "2026-07-14", kind: "claim", text: "Plaster work in server room and electric room (first plaster mention)", zones: ["server-room", "ups-electrical-room"] },
            { day: "2026-07-15", kind: "claim", text: "Plaster work in server room and electric room continuing", zones: ["server-room", "ups-electrical-room"] }
          ]
        },
        {
          name: "POP punning (400 sqm)",
          planned: { start: "2026-06-24", finish: "2026-07-03" },
          commitments: ["FSL2026272027"], materials: [], measured: null,
          evidence: [
            { day: "2026-07-08", kind: "claim", text: "Punning for AHU room outside walls near cafeteria" },
            { day: "2026-07-09", kind: "claim", text: "Punning for AHU room outside walls near cafeteria and washrooms (punning labour 05)" }
          ]
        },
        {
          name: "Gypsum plaster (475 sqm)",
          planned: { start: "2026-06-24", finish: "2026-07-03" },
          commitments: ["FSL2026272027"], materials: [], measured: null,
          evidence: []
          // gypsum labour appears in the 09 Jul labour count (Gypsum 06) but no
          // DPR line names a gypsum work front; labour count alone is not work evidence
        }
      ]
    },

    {
      name: "Waterproofing (For Floor + Walls 600 mm High)",
      sub: "Waterproofing",
      planned: { start: "2026-07-11", finish: "2026-07-15" },
      commitments: [], materials: [], measured: null,
      evidence: []
      // keyword scan of the full DPR chat: zero mentions of waterproofing. Window has elapsed.
    },

    {
      name: "Anti-termite treatment and Pest control",
      sub: "Treatment",
      planned: { start: "2026-06-16", finish: "2026-06-18" },
      commitments: ["FSL2026272011"], materials: [], measured: null,
      evidence: []
      // DPR chat coverage starts 04 Jul; the anti-termite window predates it.
      // A PO exists, execution is unproven either way.
    },

    {
      name: "Self Leveling & Associated works",
      sub: "Flooring prep",
      planned: { start: "2026-07-03", finish: "2026-07-08" },
      commitments: [], materials: [], measured: null,
      evidence: []
      // keyword scan: zero mentions of self leveling or screed. Window has elapsed.
    },

    {
      name: "Vitrified tile works",
      sub: "Flooring",
      planned: { start: "2026-07-13", finish: "2026-07-20" },
      commitments: ["FSL2026272027", "FSL2026272014"],
      materials: [
        { day: "2026-07-15", text: "DPR note (Rahul Singh): Kindly confirm on the qty of tiles. Is there any damage pc or anything grn needs to be done for the same. (tiles have arrived on site, GRN unconfirmed)" }
      ],
      measured: null,
      evidence: [],
      // no laying work reported yet; window is open to 20 Jul
      items: [
        {
          name: "Vitrified tile laying with epoxy grout (800 sqm per PO 272027)",
          planned: { start: "2026-07-13", finish: "2026-07-20" },
          commitments: ["FSL2026272027"], materials: [], measured: null,
          evidence: []
        },
        {
          name: "Kajaria tile supply (4495 sqft per PO 272014, 100% advance paid)",
          planned: { start: "2026-07-13", finish: "2026-07-20" },
          commitments: ["FSL2026272014"],
          materials: [{ day: "2026-07-15", text: "Tiles on site per DPR note, GRN pending confirmation" }],
          measured: null,
          evidence: []
        }
      ]
    },

    {
      name: "Milestone: POP on Flooring (Protection)",
      sub: "Protection",
      planned: { start: "2026-07-20", finish: "2026-07-21" },
      commitments: [], materials: [], measured: null,
      evidence: []
      // window not open yet
    }
  ],

  // ---- queries this tracking pass raises ----------------------------
  queries: [
    { about: "civil measured quantities",
      question: "Masonry is visibly in progress (3 photos, daily claims) but no measured quantities exist. Report sqm done against PO 272027 items: AAC blockwork (of 272 sqm), cement plaster (of 429 sqm), POP punning (of 400 sqm), gypsum plaster (of 475 sqm). No percent will be shown until measured.", blocking: false },
    { about: "civil waterproofing",
      question: "Waterproofing (floor + walls 600 mm) was planned 11 to 15 Jul. The window has elapsed and the DPR chat has zero mentions of waterproofing. Has it started, and who is the vendor? No PO for waterproofing was found in the 30 absorbed POs.", blocking: false },
    { about: "civil anti-termite",
      question: "Anti-termite treatment was planned 16 to 18 Jun, before DPR chat coverage begins (04 Jul). PCI PO 272011 exists (2 rounds, 10 year warranty). Supply the round 1 service report or completion certificate so this can move past commitment_only.", blocking: false },
    { about: "civil self leveling",
      question: "Self leveling was planned 03 to 08 Jul. The window has elapsed and the DPR chat has zero mentions of self leveling or screed. Tiling (starts 13 Jul) depends on it. What is its real status?", blocking: false },
    { about: "civil tile quantity",
      question: "Civil PO 272027 carries vitrified tile laying of 800 sqm (approx 8611 sqft) but the Kajaria supply PO 272014 covers only 4495 sqft. Confirm the correct laying quantity, the balance supply source, and the GRN status of the tiles that arrived by 15 Jul.", blocking: false },
    { about: "civil zone pins",
      question: "DPR lines say 'wash rooms near Cafeteria' (registry has ladies-restroom and gents-restroom) and 'AHU Room near cafeteria' (registry has ahu-room-1 and ahu-room-2). Name which registry zones these are. Evidence stays unpinned there until answered.", blocking: false }
  ],

  // confident pins exercised against the registry (never silent-create)
  pins: ["server-room", "ups-electrical-room", "hub-room"],

  // ---- apply: idempotent, only raises queries and checks pins --------
  apply: function (ledger, zones) {
    if (ledger.state.queries.some(q => q.about === "civil measured quantities")) {
      return { applied: false, reason: "civil tracking queries already raised" };
    }
    let pinsOk = 0, pinsMissed = 0;
    for (const id of CIVIL.pins) {
      const r = zones.pin(id);
      if (r.ok) pinsOk++;
      else { pinsMissed++; ledger.addQuery(r.query); }
    }
    for (const q of CIVIL.queries) ledger.addQuery(q);
    return { applied: true, queries: CIVIL.queries.length, pinsOk, pinsMissed };
  }
};

root.TRACK_CIVIL = CIVIL;
if (typeof module !== "undefined") module.exports = root.TRACK_CIVIL;

})(typeof window !== "undefined" ? window : globalThis);
