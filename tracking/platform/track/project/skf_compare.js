// ===================================================================
// DnB-OS . platform/track/project/skf_compare.js . THE WALK PACK
// The 18 Jul 2026 planned vs achieved reading for SKF Pune, the same
// numbers the director deck carries. Every site % here is a visual
// estimate from the 81 pin photo walk, cross read with the wk4
// weekly tracker, the DPR chat and the materials sheet. The next
// full walk overwrites this pack and the bars move with it.
// Plan dates come from the revised working schedule (plan_part2).
// The compare law (compare.js) computes plan % and chips from these.
// ===================================================================

;(function (root) {

root.TRACK_COMPARE_SKF = {
  project: "SKF Pune",
  asOf: "2026-07-18",
  day: 45, days: 78,
  handover: "2026-08-20",
  source: "81 pin photo walk of 18 Jul, visual estimates, cross read with the wk4 weekly tracker, the DPR chat and the materials sheet",

  groups: [
    { label: "Civil and wet works", rows: [
      { name: "Site preparation", ps: "2026-06-03", pf: "2026-06-20", site: 100,
        note: "Enabling works closed in June." },
      { name: "Blockwork, AAC, plaster", ps: "2026-06-24", pf: "2026-07-03", site: 70,
        note: "Running 15 days past its window." },
      { name: "Waterproofing wet areas", ps: "2026-07-11", pf: "2026-07-15", site: 60,
        note: "Live in wet areas, not closed." },
      { name: "Anti termite treatment", ps: "2026-07-16", pf: "2026-07-18", site: 100,
        note: "Closed early in the job." },
      { name: "Self leveling screed", ps: "2026-07-03", pf: "2026-07-08", site: 95,
        note: "Done across almost the whole floor." },
      { name: "Vitrified tile", ps: "2026-07-13", pf: "2026-07-20", site: 8,
        note: "Will not close by Monday. Biggest live gap." }
    ]},

    { label: "Fire fighting", rows: [
      { name: "Sprinkler piping", ps: "2026-06-27", pf: "2026-07-15", site: 90,
        note: "Near done, grid painted and hung." },
      { name: "Heads and flexible drops", ps: "2026-07-02", pf: "2026-07-20", site: 85,
        note: "Tracking its window." },
      { name: "Sprinkler testing and commissioning", ps: "2026-07-18", pf: "2026-07-21", site: 0,
        note: "Starts now, piping is ready for it." }
    ]},

    { label: "HVAC", rows: [
      { name: "GI ducting, low side", ps: "2026-07-04", pf: "2026-07-22", site: 55,
        note: "Most active trade, still short of its curve." },
      { name: "Duct light test", ps: "2026-07-16", pf: "2026-07-18", site: 0,
        note: "Missed, ducting not complete enough to test." },
      { name: "Duct insulation", ps: "2026-07-18", pf: "2026-07-27", site: 5,
        note: "Started early in the Cafeteria zone." },
      { name: "High side refrigerant piping", ps: "2026-07-05", pf: "2026-07-16", site: 50, chip: "risk",
        reason: "completion unconfirmed, query raised",
        note: "Partly seen. Completion unconfirmed, query raised." },
      { name: "VRV units and ODUs", ps: "2026-07-16", pf: "2026-07-21", site: 0, chip: "risk",
        reason: "delivery and crane slot unconfirmed",
        note: "Delivery and crane slot unconfirmed." }
    ]},

    { label: "Electrical", rows: [
      { name: "Trays and containment", ps: "2026-07-02", pf: "2026-07-23", site: 45,
        note: "Behind its curve." },
      { name: "Conduiting and back boxes", ps: "2026-07-09", pf: "2026-07-30", site: 45,
        note: "On plan, running with the partitions." },
      { name: "Point wiring and DBs", ps: "2026-07-16", pf: "2026-08-06", site: 5,
        note: "Just starting, as planned." }
    ]},

    { label: "Plumbing", rows: [
      { name: "Drainage and waste pipes", ps: "2026-06-29", pf: "2026-07-06", site: 60,
        note: "Still in first fix in wet areas." },
      { name: "Toilet cubicles", ps: "2026-07-18", pf: "2026-07-23", site: 0, chip: "risk",
        reason: "material still at quote stage",
        note: "Due now, material still at quote stage." },
      { name: "Sanitary second fix", ps: "2026-07-21", pf: "2026-07-26", site: 0, chip: "risk",
        reason: "fixture selection pending from design",
        note: "Fixture selection still pending from design." }
    ]},

    { label: "ELV and low voltage", rows: [
      { name: "FAS and PA cabling", ps: "2026-07-11", pf: "2026-07-26", site: 5,
        note: "Vendor not appointed, package not awarded." },
      { name: "Access and CCTV", ps: "2026-07-18", pf: "2026-07-27", site: 0, chip: "risk",
        reason: "PO not placed",
        note: "Due now, PO not placed." }
    ]},

    { label: "Interiors and finishes", rows: [
      { name: "Gypsum partitions", ps: "2026-06-24", pf: "2026-07-09", site: 85,
        note: "Boarded, but taping near zero." },
      { name: "Column cladding, ply", ps: "2026-06-29", pf: "2026-07-14", site: 50,
        note: "Panelling still running per daily reports." },
      { name: "True ceiling coat", ps: "2026-07-11", pf: "2026-07-18", site: 10,
        note: "Library bay only. Window closed today." },
      { name: "Glass partitions", ps: "2026-07-18", pf: "2026-07-29", site: 40,
        note: "Started early, tape crosses on all new glass." },
      { name: "Putty and prep", ps: "2026-07-29", pf: "2026-08-08", site: 20,
        note: "Paint window opens 29 Jul. Early start in about 10 rooms." },
      { name: "Carpet flooring", ps: "2026-07-20", pf: "2026-07-28", site: 0, chip: "risk",
        reason: "carpet not ordered, sample approval at 50 percent",
        note: "Starts Monday. Carpet not ordered yet." }
    ]}
  ],

  // Site tab mapping: one trade group -> its compare rows.
  // The Site tab draws one pair of bars per trade from the mean of these.
  siteMap: {
    "Preliminaries":               ["Site preparation"],
    "Civil Works":                 ["Blockwork, AAC, plaster", "Waterproofing wet areas", "Anti termite treatment", "Self leveling screed", "Vitrified tile"],
    "Fire Sprinklers":             ["Sprinkler piping", "Heads and flexible drops", "Sprinkler testing and commissioning"],
    "HVAC Low Side":               ["GI ducting, low side", "Duct light test", "Duct insulation"],
    "HVAC High Side":              ["High side refrigerant piping", "VRV units and ODUs"],
    "Plumbing & Drainage":         ["Drainage and waste pipes"],
    "Toilet Fittings & Fixtures":  ["Toilet cubicles", "Sanitary second fix"],
    "Electrical":                  ["Trays and containment", "Conduiting and back boxes", "Point wiring and DBs"],
    "FAS & PA":                    ["FAS and PA cabling"],
    "Access, CCTV & Protection":   ["Access and CCTV"],
    "Carpentry & Gypsum":          ["Gypsum partitions", "Column cladding, ply"],
    "Ceiling Works":               ["True ceiling coat"],
    "Carpet Flooring":             ["Carpet flooring"],
    "Paint & Wall Finish":         ["Putty and prep"],
    "Glass Partitions":            ["Glass partitions"]
  },

  // what the plan wants closed by 25 Jul, with the walk's verdict
  week: [
    { tone: "ok",   name: "Sprinkler test and commissioning", note: "18 to 21 Jul · piping ready, achievable" },
    { tone: "ok",   name: "Glass partitions",                 note: "running ahead, keep the fitters supplied" },
    { tone: "ok",   name: "Duct insulation",                  note: "started early in Cafeteria, keep going" },
    { tone: "warn", name: "VRV outdoor units",                note: "by 21 Jul · delivery and crane slot unconfirmed" },
    { tone: "warn", name: "Millwork and seating",             note: "by 20 Jul · just starting, will run past" },
    { tone: "bad",  name: "Vitrified tile",                   note: "finish 20 Jul · floor is at 8 percent, will not close" },
    { tone: "bad",  name: "Toilet cubicles",                  note: "install by 23 Jul · material still at quote stage" },
    { tone: "bad",  name: "Raised floor and epoxy",           note: "by 19 Jul · quantity still open" },
    { tone: "bad",  name: "Carpet Type 1",                    note: "starts 20 Jul · not ordered, sample approval at 50 percent" }
  ],

  // what the compare really says
  insights: [
    { head: "Time vs work", body: "58 percent of the calendar is gone. Live packages average 40 percent against a plan ask of 61. That gap is over two weeks of work, almost all of it on the wet and finish chain." },
    { head: "The site can hit plan", body: "Fire on plan. Glass and putty early. Where material and drawings landed, the floor delivered." },
    { head: "One domino, many falls", body: "Masonry 15 days late. It now holds plaster, tile, waterproofing and ceilings. Close the wet areas first." },
    { head: "The critical path has moved", body: "Next week needs carpet, cubicles, sanitary, glass, furniture. Several still at quote. Buying sets the pace now, not building." },
    { head: "Ceilings are the gate to the finish", body: "Ceilings open 27 Jul. They need HVAC, wiring and sprinkler drops done, plus the revised drawing. HVAC slips, ceilings slip." },
    { head: "Manpower is decent, not enough for what is coming", body: "47 by day, 40 by night. Next week stacks tile, carpet, ceilings, cubicles and millwork. Needs a bigger crew." }
  ],

  // the challenge lists, evidence backed
  challenges: {
    design: { head: "Design gates still closed", items: [
      "Ceiling and MEP drawings still in revision. No bay closes without them.",
      "Door and joinery drawings not out. Carpentry waits.",
      "Fire layouts for the fire NOC still pending.",
      "Client approvals open. Carpet at 50 percent. Sanitary, blinds, skirting not picked.",
      "Washroom elevation drawings not started on the register."
    ]},
    procure: { head: "Procurement running late", items: [
      "Carpet not ordered. Install starts Monday. Most urgent buy.",
      "ELV and data vendor not appointed. Work is already due.",
      "Toilet cubicles, loose furniture, call booths, UPS and AV all sitting at quote stage.",
      "Furniture PO, Rs 1.8 Cr. Tracker says placed. Needs written confirmation.",
      "Long lead deliveries crowd 20 to 28 Jul, when installs begin. Any slip hits the floor."
    ]},
    exec: { head: "Execution and quality", items: [
      "Wet areas slowest. Blockwork, waterproofing and drainage all past their windows.",
      "Boarding at 85 percent, taping near zero. The finish crew inherits the backlog.",
      "Duct light test missed, which pushes insulation quality checks downstream.",
      "Two shifts running. Next week needs a written crew ramp per package."
    ]},
    hse: { head: "Safety and compliance", items: [
      "Helmets rare. One count showed 2 of 13 wearing.",
      "Standing water beside live extension boards. Clear it same day.",
      "Height work with no harness at four pins. Open trenches on walk routes.",
      "Rubble against new glazing. Cardboard fire load near hot work.",
      "Contractor all risk insurance was not yet bound per the weekly tracker. Confirm it is in force."
    ]}
  },

  // the four asks of the week
  asks: [
    { head: "Order carpet Monday", body: "Close the sample approval and place the order. Its window opens 20 Jul and nothing else can substitute for it." },
    { head: "Release the ceiling drawings", body: "Revised ceiling and MEP coordination drawings out this week, so bays can start closing from 27 Jul." },
    { head: "Award ELV, close the quote pile", body: "Appoint the ELV vendor and convert cubicles, sanitary, UPS and AV from quotes to purchase orders." },
    { head: "Double the tile gang, fix HSE", body: "Tile is the biggest live gap. And close the safety list: helmets, trench covers, water near live boards, insurance." }
  ]
};

if (typeof module !== "undefined") module.exports = root.TRACK_COMPARE_SKF;

})(typeof window !== "undefined" ? window : globalThis);
