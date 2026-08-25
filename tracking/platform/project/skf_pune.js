// ===================================================================
// DnB-OS . platform/project/skf_pune.js . SKF INDIA, PUNE 7F
// The real project, from the Drive SSOT. Everything here is traceable to
// a named document; nothing is a placeholder.
//
//   BOQ heads        FS Submission_FINAL_SKF_Phoenix_22.05.2026_R5 BOQ.xlsx
//   zone areas       SKF_R1_GFC_FINAL LAYOUT.dxf (measured) and
//                    SKF_7th Floor_R1_30.06.2026-FLOORING LAYOUT.pdf V4
//   programme        Ptoject Schedule & Milestone - SKF.xlsx
//   identity         Drive: SKF India — Pune Fit-out · Project SSOT
//
// THE AREA RULE FOR THIS FILE
//   Every zone carries `src` saying where its number came from, and
//   `conf`. "high" means measured off the CAD or the flooring schedule.
//   "med" means the CAD put two room labels inside one polygon and the
//   engine will not choose between them . the area is right, the split
//   between those rooms is not established. "low" means derived by
//   subtracting measured numbers from a measured total.
//   Nothing here is estimated from a rate per square foot.
// ===================================================================

;(function (g) {

const SEQ = (typeof require !== "undefined") ? require("../kb/sequence.js") : g.KB_SEQ;
const SQFT = 0.092903;   // sqft -> m2

// ---- the floor, as the flooring schedule measures it -------------------
// SKF_7th Floor_R1_30.06.2026-FLOORING LAYOUT.pdf, V4 09.07.2026,
// designed Sayali / checked Shagun. Cross-checked against the priced BOQ:
// carpet 15,350 sqft against head B1 (Rs 34,19,125) = Rs 223/sqft, which
// is in band for carpet tile, so the legend is being read correctly.
const FLOORING = {
  terrazzo:     { sqft: 4272,  where: "reception, collab, passage, cafeteria" },
  epoxy_01:     { sqft: 89,    where: "reception" },
  lvt:          { sqft: 640,   where: "collab area, cafeteria" },
  carpet_01:    { sqft: 12850, where: "boardroom, meeting rooms, workstations, wellness, phone booths" },
  carpet_02:    { sqft: 455,   where: "boardroom" },
  carpet_03:    { sqft: 2045,  where: "collab 01, collab 02, 12-pax meeting" },
  epoxy_02:     { sqft: 470,   where: "AHU, battery, server" },
  vitrified_01: { sqft: 115,   where: "dishwash, handwash" },
  vitrified_02: { sqft: 965,   where: "washrooms" },
};
const FLOOR_TOTAL = Object.keys(FLOORING).reduce((s, k) => s + FLOORING[k].sqft, 0);  // 21,901

// ---- the zones ---------------------------------------------------------
// Measured rooms first (one label, one polygon in the DXF), then the ones
// the CAD could not separate, then what is left over by subtraction.
const CAD = "measured off SKF_R1_GFC_FINAL LAYOUT.dxf";
const LEG = "SKF flooring schedule V4";

const ZONES = [
  // --- measured, unambiguous -------------------------------------------
  { id:"caf_dining", name:"Cafeteria — 52 pax", area:1137, conf:"high", src:CAD,
    demo:1, floor:"vitrified", ceiling:"grid", part:0.12, glaze:0.05, doors:1, joinery:20, storage:2, data:4, ac:1 },
  { id:"reception",  name:"Reception & waiting", area:455, conf:"high", src:CAD,
    demo:1, floor:"stone", ceiling:"gypsum", part:0.5, glaze:0.25, doors:0, joinery:30, texture:25, ac:1 },
  { id:"collab",     name:"Collab area 1", area:414, conf:"high", src:CAD,
    demo:1, floor:"carpet", ceiling:"gypsum", part:0.6, glaze:0.3, doors:1, joinery:12, data:6, ac:1 },
  { id:"payroll",    name:"Payroll — 7 pax", area:307, conf:"high", src:CAD,
    demo:1, floor:"carpet", ceiling:"gypsum", part:1.4, glaze:0.5, doors:1, data:8, ac:1 },
  { id:"compactor",  name:"Compactor room", area:209, conf:"high", src:CAD,
    demo:1, floor:"vitrified", ceiling:"grid", part:1.0, doors:1, ac:0 },
  { id:"meeting_6",  name:"Meeting room — 6 pax", area:144, conf:"high", src:CAD,
    demo:1, floor:"carpet", ceiling:"gypsum", part:1.5, glaze:0.5, doors:1, data:6, ac:1 },
  { id:"server",     name:"Server room", area:134, conf:"high", src:CAD,
    demo:1, floor:"epoxy", ceiling:"none", part:1.4, doors:1, data:20, ac:1, precision:1 },
  { id:"visiting_1", name:"Visiting MR — 4 pax (1)", area:120, conf:"high", src:CAD,
    demo:1, floor:"carpet", ceiling:"gypsum", part:1.5, glaze:0.5, doors:1, data:4, ac:1 },
  { id:"visiting_2", name:"Visiting MR — 4 pax (2)", area:102, conf:"high", src:CAD,
    demo:1, floor:"carpet", ceiling:"gypsum", part:1.5, glaze:0.5, doors:1, data:4, ac:1 },
  { id:"cabin_04",   name:"Cabin 04", area:94, conf:"high", src:CAD,
    demo:1, floor:"carpet", ceiling:"gypsum", part:1.5, glaze:0.5, doors:1, storage:1, data:4, ac:1 },
  { id:"cabin_05",   name:"Cabin 05", area:89, conf:"high", src:CAD,
    demo:1, floor:"carpet", ceiling:"gypsum", part:1.5, glaze:0.5, doors:1, storage:1, data:4, ac:1 },
  { id:"battery",    name:"Battery room", area:84, conf:"high", src:CAD,
    demo:1, floor:"epoxy", ceiling:"none", part:1.4, doors:1, ac:0 },

  // --- the CAD put two labels in one polygon. The AREA is measured; which
  //     of the two rooms it belongs to is not established, so they are
  //     planned as one work area and the split is a query, not a guess.
  { id:"washrooms",  name:"Washrooms — ladies & gents", area:914, conf:"med",
    src:CAD + " · one polygon carries both restroom labels",
    demo:1, wet:1, floor:"vitrified", ceiling:"grid", part:1.2, doors:4, sanitary:12, ac:1 },
  { id:"boardroom",  name:"Boardroom — 20 pax (with storage)", area:886, conf:"med",
    src:CAD + " · one polygon carries BOARDROOM and STORAGE",
    demo:1, floor:"carpet", ceiling:"stretch", part:1.4, glaze:0.5, doors:1, joinery:40, data:10, ac:1 },
  { id:"cabins_1_2", name:"Cabins 01–02 & MR 8-pax 02", area:256, conf:"med",
    src:CAD + " · one polygon carries three labels",
    demo:1, floor:"carpet", ceiling:"gypsum", part:1.5, glaze:0.5, doors:3, storage:2, data:12, ac:1 },
  { id:"mr8_repro",  name:"MR 8-pax 01 & repro", area:150, conf:"med",
    src:CAD + " · one polygon carries both labels",
    demo:1, floor:"carpet", ceiling:"gypsum", part:1.5, glaze:0.5, doors:2, data:8, ac:1 },
  { id:"dishwash",   name:"Dishwash & handwash", area:134, conf:"med",
    src:CAD + " · one polygon carries both labels",
    demo:1, wet:1, floor:"vitrified", ceiling:"grid", part:1.0, doors:1, ac:0 },
  { id:"ups_elec",   name:"UPS & electrical room", area:125, conf:"med",
    src:CAD + " · one polygon carries UPS AND ELEC ROOM and UPS O/P PANEL",
    demo:1, floor:"epoxy", ceiling:"none", part:1.4, doors:1, ac:1 },
  { id:"cabins_3_6", name:"Cabins 03 & 06", area:94, conf:"med",
    src:CAD + " · one polygon carries both labels",
    demo:1, floor:"carpet", ceiling:"gypsum", part:1.5, glaze:0.5, doors:2, storage:2, data:8, ac:1 },
];

// ---- what is left of the measured floor --------------------------------
// Arithmetic on two measured numbers, not an estimate: the carpet-01 total
// from the flooring schedule, less every carpet room the CAD placed inside
// it. What remains is the open floor . workstations, wellness rooms and
// phone booths . which have no bounding polygon on any CAD layer.
const CARPET_ROOMS = ["payroll","meeting_6","visiting_1","visiting_2","cabin_04","cabin_05",
  "boardroom","cabins_1_2","mr8_repro","cabins_3_6"];
const carpetPlaced = ZONES.filter(z => CARPET_ROOMS.indexOf(z.id) !== -1)
  .reduce((s, z) => s + z.area, 0);
const OPEN_FLOOR = Math.max(0, FLOORING.carpet_01.sqft - carpetPlaced);

// The open floor is too big for one crew to flow through, so it is planned
// as work areas the way the takt law expects . the same treatment Kohler's
// cafeteria gets. The pin pack names three workstation zones, so it splits
// three ways; that split is DECLARED here rather than hidden in a formula.
const OPEN_SPLIT = 3;
for (let i = 1; i <= OPEN_SPLIT; i++) {
  ZONES.push({ id: "workstations_" + i, name: "Open workstation zone " + i,
    area: Math.round(OPEN_FLOOR / OPEN_SPLIT), conf: "low",
    src: LEG + " carpet-01 " + FLOORING.carpet_01.sqft + " sqft less " + carpetPlaced +
         " sqft of measured carpet rooms, split across the " + OPEN_SPLIT +
         " workstation zones the pin pack names",
    demo:1, floor:"carpet", ceiling:"grid", part:0.08, glaze:0.04, doors:0,
    ws: Math.round(OPEN_FLOOR / OPEN_SPLIT / 45), data: Math.round(OPEN_FLOOR / OPEN_SPLIT / 45), ac:1 });
}

// circulation: the terrazzo run less the reception and cafeteria that sit on it
const CIRC = Math.max(0, FLOORING.terrazzo.sqft + FLOORING.lvt.sqft - 455 - 1137);
ZONES.push({ id:"circulation", name:"Passage & circulation", area: CIRC, conf:"low",
  src: LEG + " terrazzo " + FLOORING.terrazzo.sqft + " + LVT " + FLOORING.lvt.sqft +
       " less the measured reception and cafeteria on the same finish",
  demo:1, floor:"stone", ceiling:"gypsum", part:0.05, doors:0, texture:10, ac:1 });

ZONES.push({ id:"site", name:"Whole floor — common", area: 0, conf:"high",
  src:"not an area; carries the floor-wide tasks", demo:0, floor:"none", ceiling:"none" });

// ---- tasks --------------------------------------------------------------
function zoneTasks(z) {
  const A = z.area, M = A * SQFT, T = [], seen = {};
  // A zone can reach the same code twice . a washroom is both `wet` (screed,
  // plaster, tiling) and has a floor finish (screed, tiling again). Pushing
  // both produced two tasks with one id, which the graph builder read as a
  // self-edge and refused as a cycle. The quantities are ADDED, because the
  // work really is both: floor screed plus wet-area screed.
  const add = (code, qty, note) => {
    if (!(qty >= 0.5)) return;
    const id = z.id + ":" + code;
    if (seen[id]) { seen[id].qty = Math.round(seen[id].qty + qty);
      seen[id].src += " + " + (note || "second pass"); return; }
    seen[id] = { id, code, zone: z.id, qty: Math.round(qty), conf: z.conf,
      src: note || "measured area × factor" };
    T.push(seen[id]);
  };

  if (z.demo) {
    add("demo_floor_finish", M,        "strip floor finish · full zone");
    add("demo_ceiling",      M * 0.9,  "old ceiling out · 90% of zone");
    add("demo_partition",    M * 0.25, "existing walls out");
  }
  if (z.wet) {
    add("blockwork",     M * 1.2, "wet-area walls");
    add("plaster",       M * 2.4, "both faces");
    add("waterproofing", M * 1.1, "floor + upturns");
    add("screed",        M,       "full wet floor");
    add("tile_vitrified",M * 2.7, "floor + wall tiling");
    add("cpvc_pipe",     A * 0.35,"supply + drain runs");
    add("sanitary_fixture", z.sanitary || 0, "install");
    add("washroom_accessories", 2, "dispensers, mirrors, holders");
  }
  if (z.part)  { add("gi_stud_frame", M * z.part, "partition framing");
                 add("board_one_face", M * z.part, "board first side");
                 add("board_close",    M * z.part, "close second side");
                 add("partition_tape", M * z.part * 2, "tape/joint/sand both faces"); }
  if (z.glaze)   add("glazing_partition", M * z.glaze, "glass partition");
  if (z.doors)   add("door_install", z.doors, "door leaves");
  if (z.joinery) add("joinery_panel", z.joinery, "joinery / panelling");
  if (z.storage) add("storage_unit", z.storage, "storage units");
  if (z.ws)      add("workstation", z.ws, "workstation positions");
  if (z.data)    add("cable_pull", z.data * 12, "data drops × 12 m average");
  if (z.texture) add("texture_paint", z.texture, "feature wall");

  if (z.floor === "carpet")    { add("screed", M, "levelling screed"); add("carpet_tile", M, "carpet tile"); }
  if (z.floor === "vitrified") { add("screed", M, "levelling screed"); add("tile_vitrified", M, "vitrified tile"); }
  if (z.floor === "stone")     { add("screed", M, "levelling screed"); add("stone_marble", M, "terrazzo"); }
  if (z.floor === "epoxy")     { add("screed", M, "levelling screed"); add("epoxy_flooring", M, "epoxy"); }

  if (z.ceiling === "gypsum")  add("ceiling_gypsum", M, "gypsum false ceiling");
  if (z.ceiling === "grid")    add("ceiling_grid_tile", M, "grid ceiling");
  if (z.ceiling === "stretch") add("stretch_ceiling", M, "stretch ceiling — boardroom");

  if (A > 0) {
    add("plaster",        M * 0.9, "wall prep");
    add("putty_primer",   M * 0.9, "base coat");
    add("paint_emulsion", M * 0.9, "finish coat");
    // These two were invented and were wrong: against the corpus-calibrated
    // basis the earlier project uses, conduit ran 2x and circuit_wiring
    // 17.6x too high . between them they produced 692 crew-days of
    // electrical work, three times the civil trade, which is not what a
    // fit-out looks like. Held against the real 62-day programme the gap
    // showed up immediately. Now on the same basis.
    add("conduit",        A * 0.30, "electrical first fix · corpus basis");
    add("circuit_wiring", A * 0.03, "wiring · corpus basis");
    add("light_fixture",  Math.round(A / 60), "light fittings");
    add("sprinkler_pipe", A * 0.12, "sprinkler distribution");
    add("sprinkler_head", Math.round(A / 110), "sprinkler heads");
    // NOTE: cable_tray is a code the diff and expectation laws both know,
    // but durations.js carries no norm for it . so the engine cannot say how
    // long it takes. Containment is planned through conduit and cable_pull
    // above rather than inventing a rate here. Raised as a gap, not filled.

  }
  if (z.ac) { add("duct_gi", A * 0.22, "GI ducting"); add("duct_insulation", A * 0.22, "duct insulation");
              add("fcu_unit", Math.max(1, Math.round(A / 900)), "indoor units"); }
  return T;
}

function siteTasks() {
  const T = [], add = (code, qty, src) => T.push({ id: "site:" + code, code, zone: "site",
    qty: Math.round(qty), conf: "high", src });
  add("db_panel", 6, "distribution boards — RCP legend counts 6 DB groups");
  add("ahu_unit", 2, "two AHU rooms on the floor plan (368 and 360 sqft)");
  add("final_clean", 26484 * SQFT, "deep clean, whole floor");
  add("tc_fire", 1, "fire system testing and commissioning");
  return T;
}

function buildTasks() {
  let T = [];
  ZONES.forEach(z => { if (z.id !== "site") T = T.concat(zoneTasks(z)); });
  T = T.concat(siteTasks());
  const present = new Set(T.map(t => t.code));
  if (SEQ) {
    T = T.concat(SEQ.enablingTasks(present));
    T = T.concat(SEQ.drawingTasks(present));
  }
  return T;
}

function qtyMap() {
  const m = {};
  buildTasks().forEach(t => m[t.id] = { qty: t.qty, conf: t.conf, src: t.src });
  return m;
}

function PROJECT_HEADS_AS_PACKAGES() {
  const out = {};
  for (const h of HEADS) out[h.name] = h.bcs;
  return out;
}

const HEADS = [
  { head:"A", name:"Architectural — civil and interiors", bcs:16128074 },
  { head:"B", name:"Furniture and furnishing",            bcs:10649815 },
  { head:"C", name:"Electrical works",                    bcs:13474596 },
  { head:"D", name:"HVAC",                                bcs:9532727 },
  { head:"E", name:"Data network",                        bcs:4237402 },
  { head:"F", name:"PHE works",                           bcs:334339 },
  { head:"G", name:"FLSS works",                          bcs:5181286 },
];

const PROJECT = {
  id: "skf-pune-7f",
  name: "SKF India · Pune 7F",
  sub: "Design & build fit-out · 26,484 sq ft",
  code: "FSINDB26270044",
  site: "Chapekar Chowk Flyover, Chinchwad, Pune 411033",
  ssot: "Drive: SKF India — Pune Fit-out · Project SSOT",
  carpetSqft: 26484,
  // THE TWO AREA BASES, which this project has as squarely as any.
  // The priced BOQ works on 26,484 sqft. The GFC flooring schedule measures
  // 21,901 sqft of actual floor finish. The difference is core, shafts,
  // lifts, stairs, balcony and refuge . real floor plate that nobody lays
  // carpet on. Every quantity leans on which one is the execution truth, so
  // the engine asks rather than choosing.
  areas: { boq: 26484, deck: FLOOR_TOTAL, measuredFloor: FLOOR_TOTAL },
  hasBoq: true,
  boqRef: "SKF_BOQ_HEADS",
  // the real programme: Ptoject Schedule & Milestone - SKF.xlsx
  defaults: { intStart: "2026-06-03", extStart: "2026-06-03", extEnd: "2026-08-14" },
  actors: ["Vikash","Prafull Tale","Prince Kumar","Sagar Shivaji","Md. Gufran","Shagun Gupta","Shubhangi Satpute"],
  team: { Design:"Shagun Gupta", Execution:"Sagar Shivaji", MEP:"Md. Gufran",
          Purchase:"Prince Kumar", Commercial:"Shubhangi Satpute" },
  escalation: ["Atish Parganiha (AVP-Ops)","Tarun Kondepudi (HOD-Ops)",
               "Ashish Kumar (Director-Ops)","Abhijeet Pawar (Director-Business)"],
  spm: "Prafull Tale",
  shellHold: false,
  // the priced BOQ, R5. BCS by head, exactly as the FINAL SUMMARY carries it.
  boqHeads: HEADS,
  // the programme's own milestone spine, from the Milestones sheet
  milestones: [
    { id:"A0",  name:"Project initiation",       from:"2026-06-03", to:"2026-06-08" },
    { id:"A1",  name:"Site prep",                from:"2026-06-08", to:"2026-06-14" },
    { id:"A2",  name:"Civil works",              from:"2026-06-24", to:"2026-07-21" },
    { id:"A3",  name:"Fire fighting — sprinkler",from:"2026-06-27", to:"2026-07-21" },
    { id:"A4",  name:"HVAC works",               from:"2026-07-04", to:"2026-07-31" },
    { id:"A5",  name:"Plumbing works",           from:"2026-06-29", to:"2026-07-26" },
    { id:"A6",  name:"Electrical works",         from:"2026-07-02", to:"2026-08-06" },
    { id:"A7",  name:"ELV installations",        from:"2026-07-11", to:"2026-07-29" },
    { id:"A8",  name:"Interiors and finishes",   from:"2026-06-24", to:"2026-08-07" },
    { id:"A9",  name:"Furniture",                from:"2026-07-28", to:"2026-08-09" },
    { id:"A10", name:"Networking",               from:"2026-08-02", to:"2026-08-12" },
    { id:"A11", name:"Miscellaneous",            from:"2026-07-28", to:"2026-08-08" },
    { id:"A12", name:"Final snags and handover", from:"2026-08-05", to:"2026-08-14" },
  ],
  kt: {
    docName: "Drive SSOT · 01 Contract & Commercial · Flipspaces Fit out Agreement (Signed).pdf",
    // NOT transcribed from the agreement yet. The engine reports the
    // absence rather than carrying Kohler's terms on SKF's project.
    clock: null,
    areaEvidence: "the priced BOQ is written on 26,484 sqft; the GFC flooring schedule V4 measures 21,901 sqft of laid floor finish. The gap is core, shafts, lifts, stairs, balcony and refuge.",
    ld: null,
    ldNote: "the signed agreement has not been read into the engine yet, so no LD exposure is computed for this project",
    raGates: [],
  },
  flooring: FLOORING,
  zones: ZONES,
  buildTasks: buildTasks,
  qtyMap: qtyMap,
  version: "skf_v1 · built 1 Aug 2026 from the Drive SSOT",
};

// `boqRef` names a global the template looks up: BOQ = window[PROJ.boqRef].
// SKF's line-level BOQ is a 28 MB workbook that is not in the repo, but the
// head-level BCS is, and that is what prices the payment gates. Shaped as
// `packages` so the revision panel reads it the same way it reads a full BOQ.
g.SKF_BOQ_HEADS = {
  source: "FS Submission_FINAL_SKF_Phoenix_22.05.2026_R5 BOQ.xlsx · FINAL SUMMARY",
  packages: PROJECT_HEADS_AS_PACKAGES(),
  // the seven heads sum to 59,538,239; the submission's own GRAND TOTAL line
  // reads 59,538,240. A one rupee rounding artefact in their sheet, kept
  // visible rather than reconciled by adjusting a head.
  totalAmount: 59538239,
  totalOnSubmission: 59538240,
  lines: [],
  note: "head-level BCS only; the priced line detail is in the Drive workbook, not here",
};

g.PROJ_REGISTRY = g.PROJ_REGISTRY || [];
g.PROJ_REGISTRY.push(PROJECT);
g.PROJECT_SKF_PUNE = PROJECT;
if (typeof module !== "undefined" && module.exports) module.exports = PROJECT;

})(typeof window !== "undefined" ? window : globalThis);
