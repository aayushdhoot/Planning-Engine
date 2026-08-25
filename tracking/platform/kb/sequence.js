// ===================================================================
// DnB-OS · platform/kb/sequence.js
// What must come before what.  The CPM reads this to wire the plan.
//
// Three things live here:
//  1. PHASES  — the canonical order of a commercial fit-out, as ranks.
//  2. LINK rules — finish-to-start (FS) and start-to-start (SS) with
//     real lags (screed cure, waterproofing test) — physics, not
//     padding hidden inside durations.
//  3. GATES  — coordination holds: sequencing sign-off points that
//     block downstream work (e.g. services-in-wall checked BEFORE the
//     wall is closed).  Skipping these is the 280-350% rework trap.
//     These are NOT quality checkpoints (those were cut) — they are
//     "you physically cannot do B until A is signed".
//
// Cross-zone work stays UNLINKED on purpose: the same trade can run in
// many zones at once.  That parallelism is the takt / fronts lever
// (PE-3).  Here we only sequence WITHIN a zone.
//
// Public contract:
//   phaseOf(code) -> rank        phaseLabel(rank) -> name
//   GATES -> [ {id,name,afterPhase,beforePhase,why} ]
//   longLeadFor(code) -> weeks
//   deriveLinks(tasks) -> { nodes, edges }
//      tasks: [ {id, code, zone, ...} ]
//      edges: [ {from, to, type:'FS'|'SS', lag, why} ]  (working-day lag)
//      nodes: tasks + inserted gate nodes {id, gate:true, name, zone, phase}
// ===================================================================

;(function () {

// ---- 1. PHASES (rank = order; lower runs first) --------------------
// The label is what a PM reads as the heading of a group of work, so it is
// site language and nothing else: short, plain, no punctuation tricks. The
// rank is the only thing the engine orders by; the label is free to change.
// One rank, one label. A repeated label would silently merge two different
// groups into one row on the programme, so the guard below refuses it.
const PHASES = [
  { rank: 2,   label: "Mobilisation" },
  { rank: 3,   label: "Temporary power" },
  { rank: 4,   label: "Drawings" },
  { rank: 4.6, label: "Client approvals" },
  { rank: 5,   label: "Ordering" },
  { rank: 5.5, label: "Material approvals" },
  { rank: 6,   label: "Samples" },
  { rank: 6.5, label: "Manufacturing" },
  { rank: 7,   label: "Deliveries" },
  { rank: 10,  label: "Demolition" },
  { rank: 12,  label: "Site clearing" },
  { rank: 15,  label: "Marking" },
  { rank: 16,  label: "Civil work" },
  { rank: 17,  label: "Plumbing first fix" },
  { rank: 18,  label: "Waterproofing" },
  { rank: 22,  label: "Floor raceways" },
  { rank: 24,  label: "Floor levelling" },
  { rank: 25,  label: "Screed" },
  { rank: 30,  label: "MEP first fix" },
  { rank: 40,  label: "Partition framing" },
  { rank: 45,  label: "Conduit in walls" },
  { rank: 50,  label: "First side boarding" },
  { rank: 51,  label: "Wiring and insulation" },
  { rank: 53,  label: "Closing partitions" },
  { rank: 54,  label: "Taping and jointing" },
  { rank: 60,  label: "Work above ceiling" },
  { rank: 61,  label: "Indoor units and dampers" },
  { rank: 62,  label: "Ceiling framing" },
  { rank: 70,  label: "Flooring" },
  { rank: 71,  label: "Floor coating" },
  { rank: 72,  label: "Skirting" },
  { rank: 78,  label: "Putty and primer" },
  { rank: 80,  label: "Painting" },
  { rank: 85,  label: "Joinery and doors" },
  { rank: 88,  label: "Ceiling tiles" },
  { rank: 90,  label: "MEP second fix" },
  { rank: 92,  label: "Testing" },
  { rank: 93,  label: "Wall finishes" },
  { rank: 95,  label: "Furniture and signage" },
  { rank: 96,  label: "Snagging" },
  { rank: 97,  label: "Cleaning" },
  { rank: 98,  label: "Handover papers" },
  { rank: 99,  label: "Handover" },
];
const PHASE_LABEL = {};
PHASES.forEach(p => {
  if (PHASE_LABEL[p.rank] !== undefined)
    throw new Error("sequence: rank " + p.rank + " named twice");
  PHASE_LABEL[p.rank] = p.label;
});
(() => { const seen = {};                       // the programme keys on the label
  PHASES.forEach(p => { if (seen[p.label] !== undefined)
    throw new Error("sequence: label \"" + p.label + "\" used by rank " +
      seen[p.label] + " and rank " + p.rank + " — they would merge into one row");
    seen[p.label] = p.rank; }); })();

// ---- code -> phase (durations.js codes) ----------------------------
const PHASE_OF_CODE = {
  mobilisation:2, gfc_pack:4, samples_mockups:6,
  pkg_design:4, pkg_approval:4.6, pkg_po:5, pkg_submittal:5.5, pkg_mfg:6.5, pkg_delivery:7,
  demo_floor_finish:10, demo_ceiling:10, demo_partition:10,
  pest_control:12, temporary_lighting:3,
  blockwork:16, plaster:16,
  cpvc_pipe:17,
  waterproofing:18,
  floor_raceway:22,
  screed:25,
  duct_gi:30, sprinkler_pipe:30, refnet_pipe:30,
  gi_stud_frame:40,
  conduit:45,
  board_one_face:50,
  circuit_wiring:51, insulation_partition:51,
  board_close:53,
  partition_tape:54,
  cable_pull:60, duct_insulation:60, data_drop:60, db_panel:60,
  fcu_unit:61,
  ceiling_gypsum:62, ceiling_grid_tile:62,
  ceiling_tiles:88,
  tile_vitrified:70, stone_marble:70, carpet_tile:70, vinyl_lvt:70, raised_floor:70,
  skirting:72,
  putty_primer:78,
  paint_emulsion:80, texture_paint:80, paint_final:94,
  joinery_panel:85, glazing_partition:85, door_install:85, storage_unit:85,
  wiring_point:90,
  light_fixture:90, grille_diffuser:90,
  sanitary_fixture:90, sprinkler_head:90, elv_device:90, fa_device:90,
  condensate_drain:30, core_cut:17, firestop:61, kitchen_hood:61, toilet_exhaust:60, blinds_film:93, graphics_planters:95,
  plywood_backing:51.5,
  // Emirates corpus codes
  statutory_liaison:4, lineout_marking:15, self_leveling:24, pop_punning:16.5,
  epoxy_flooring:71, wall_dado:70, wallpaper:93, lacquered_glass:93, fluted_panel:93,
  stretch_ceiling:62, metal_ceiling:62, fire_door:85, vav_unit:60, fire_damper:61,
  ahu_unit:61, precision_ac:90, ups_battery:90, pa_system:90, wld_system:90, odu_unit:30,
  rodent_system:90, gas_suppression:90, bms_integration:92, av_system:95, white_goods:95,
  workstation:95, ws_power_data:95.5, protection_covering:71, toilet_cubicle:90, washroom_accessories:93, network_rack:90,
  tc_electrical:92, tc_hvac:92, tc_plumbing:92, tc_fire:92, tc_elv:92,
  // extinguishers, exit signs and evacuation maps ARE signage, and they have
  // to be up before the drill, not filed under snagging beside it
  signage_evac:95,
  snag_cycle:96, mock_fire_drill:96,
  fm_training:99,                      // training is the handover, not a snag
  final_clean:97,
  fire_noc:98, handover_file:98,
};
// fallback by trade if a code is unknown
const PHASE_OF_TRADE = { demolition:10, civil:20, drywall:50, ceiling:55, flooring:70, painting:80, joinery:85, electrical:90, hvac:30, plumbing:90, fire:90, elv:90, closeout:97 };

function phaseOf(codeOrTask) {
  if (codeOrTask && typeof codeOrTask === "object")
    return PHASE_OF_CODE[codeOrTask.code] != null ? PHASE_OF_CODE[codeOrTask.code]
         : (PHASE_OF_TRADE[codeOrTask.trade] != null ? PHASE_OF_TRADE[codeOrTask.trade] : 50);
  return PHASE_OF_CODE[codeOrTask] != null ? PHASE_OF_CODE[codeOrTask] : 50;
}
function phaseLabel(rank) { return PHASE_LABEL[rank] || ("phase " + rank); }

// ===================================================================
// THE RULEBOOK — the authored source of truth.
//   WHAT FOLLOWS WHAT   -> AFTER: every code declares its physical
//     predecessors. A task links FROM every listed predecessor present
//     in its zone (CPM takes the latest). Absent predecessor = genuinely
//     unconstrained (a no-demo zone really can start early).
//   WHAT RUNS TOGETHER  -> type "SS" = deliberate overlap with lag;
//     PARALLEL constants; NEVER = same-zone exclusions the testing
//     layers verify on final dates.
//   GATES               -> inspection holds anchored to CODES, routed
//     through a zero-duration gate node.
// Sources: MoS/FIS/Procore method statements · Stanford CIFE · KNS/COF/
// RepOne · LCI/IGLC · Flipspaces PERT corpus (BFIL/TCS/Addverb/Pivox).
// ===================================================================
const FS = (of, why, lag) => ({ of, type: "FS", lag: lag || 0, why });

// ---- WHEN A RULE NAMES WORK THIS PROJECT PACKAGES DIFFERENTLY -----------
// The rulebook says wall panelling follows "partition_tape". On this job the
// taping is a STEP inside board_close and there is no partition_tape package
// at all, so the rule matched nothing, wall panelling ended up with zero
// predecessors, and the largest package in the job floated to day one — free
// to be scheduled onto a wall that did not exist yet. Twenty packages were in
// that state, including the conduit in the walls and both ceilings.
//
// A missing predecessor is not "no constraint". It is the same constraint
// wearing another package's name. Each entry below says which packages carry
// that work when the named one is absent; the first one PRESENT wins, and if
// none is present the rule genuinely does not apply here.
const STANDS_IN = {
  partition_tape:  ["board_close", "plaster"],
  // NOT board_close: the conduit that waits on the frame is the conduit
  // INSIDE that partition, and board_close already carries it as a step.
  // Standing the frame in for the whole partition package made the conduit
  // wait on the wall that waits on the conduit.
  gi_stud_frame:   ["blockwork"],
  board_one_face:  ["board_close"],
  demo_ceiling:    ["demo_partition"],
  mobilisation:    ["lineout_marking", "temporary_lighting"],
  ceiling_tiles:   ["ceiling_grid_tile"],
  paint_final:     ["paint_emulsion"],
  texture_paint:   ["paint_emulsion"],
};
const SS = (of, why, lag) => ({ of, type: "SS", lag: lag == null ? 1 : lag, why });

const AFTER = {
  // -- enabling ------------------------------------------------------
  demo_partition:   [FS("demo_ceiling","top-down strip: ceiling out before walls")],
  demo_floor_finish:[FS("demo_partition","walls out before the floor is stripped")],
  blockwork:        [FS("demo_partition","strip-out clears the line"), FS("demo_floor_finish","slab exposed first"), FS("lineout_marking","build on the approved line-out (Emirates)")],
  plaster:          [FS("blockwork","render on cured masonry")],
  cpvc_pipe:        [FS("blockwork","concealed runs chase finished walls"), FS("demo_partition","strip-out first"), FS("demo_floor_finish","slab exposed")],
  waterproofing:    [FS("cpvc_pipe","membrane wraps tested pipes (R4) — hydro gate below"), FS("plaster","membrane on finished faces"), FS("floor_raceway","slab raceways routed before the membrane — never chip a signed membrane")],
  floor_raceway:    [FS("demo_floor_finish","raceways lie on the exposed slab (video/TCS)"), FS("demo_partition","strip-out first")],
  screed:           [FS("floor_raceway","screed covers the floor raceways (video/TCS)"), FS("waterproofing","ponding test signed before screed traps it",2), FS("plaster","wet works before screed"), FS("demo_floor_finish","slab exposed")],
  // -- overhead first fix (biggest first, serial hand-off in the void — R6/R20)
  duct_gi:          [FS("demo_ceiling","void cleared first")],
  sprinkler_pipe:   [SS("duct_gi","ducts hang first — sprinkler mains thread behind (R6)",2), FS("demo_ceiling","void cleared")],
  refnet_pipe:      [SS("duct_gi","copper follows the duct route",2), FS("demo_ceiling","void cleared")],
  // -- partitions (MoS stage pattern: frame -> board 1 -> services in wall -> inspect -> close -> tape)
  gi_stud_frame:    [FS("screed","frames stand on walkable screed (KNS)",3), SS("duct_gi","framing alongside overhead first fix",1), FS("demo_partition","strip-out first"), FS("lineout_marking","frame on the approved line-out (Emirates)")],
  conduit:          [SS("gi_stud_frame","in-wall conduit + boxes with framing",1)],
  board_one_face:   [FS("gi_stud_frame","frame inspected before boarding"), FS("conduit","boxes set before first side")],
  circuit_wiring:   [SS("board_one_face","wall handed to MEP as first side closes (MoS)",1)],
  insulation_partition: [SS("circuit_wiring","quilt goes in behind the wiring",1)],
  plywood_backing:  [FS("insulation_partition","backing over the infill (LS: glasswool -> ply -> close)"), FS("board_one_face","onto the open frame")],
  board_close:      [FS("board_one_face","first side must exist before the second closes — gate rides on top")],
  partition_tape:   [SS("board_close","taping trails closing zone-by-zone (R17)",1)],
  // -- above-ceiling completion, then the plane closes
  cable_pull:       [FS("duct_gi","trays route after ducts — biggest first"), FS("conduit","containment before cables")],
  data_drop:        [SS("cable_pull","data pulls ride the same containment",1)],
  duct_insulation:  [FS("duct_gi","duct pressure-tested before insulation (ITP)")],
  db_panel:         [SS("cable_pull","panels erect as cabling lands",2)],
  fcu_unit:         [FS("duct_gi","units hang off the duct route"), FS("refnet_pipe","copper before units"), SS("duct_insulation","insulation closes around hung units",1)],
  // A CEILING CLOSES OVER EVERYTHING ABOVE IT, AND THAT IS THE POINT OF NO
  // RETURN. The 6 August walk found GI grid framed under bare galvanised
  // duct in three rooms at once — Payroll, Cabin 01 and Cabin 02 — spotted
  // by two readers who never saw each other's work. Once those ceilings
  // board, the insulation crew cannot reach the duct without taking them
  // down again, and the same is true of every sprinkler drop and cable run
  // in the void. metal_ceiling already carried these three predecessors;
  // the two ceilings that actually cover this floor did not, so the
  // programme could not see the rework it was building in.
  //
  // Note it is the sprinkler PIPE, not the head. The drop has to be set to
  // its final position before the plane closes; the head itself screws on
  // through the finished ceiling afterwards, which is why sprinkler_head
  // waits on the ceiling further down this list rather than the other way.
  ceiling_gypsum:   [FS("partition_tape","walls done before the plane"),
                     FS("duct_insulation","no reaching the duct once the plane closes"),
                     FS("sprinkler_pipe","drops set to final position before boarding"),
                     FS("cable_pull","cable in the void before it is covered")],
  ceiling_grid_tile:[FS("partition_tape","walls done before the plane"),
                     FS("duct_insulation","no reaching the duct once the plane closes"),
                     FS("sprinkler_pipe","drops set to final position before the grid"),
                     FS("cable_pull","cable in the void before it is covered")],
  // -- floors: hard early, soft AFTER paint (R11 — dust ruins soft floors)
  tile_vitrified:   [FS("screed","screed cure before tiling",7), FS("partition_tape","closed sanded walls first"), FS("ceiling_gypsum","plane above finished"), FS("ceiling_grid_tile","plane above finished")],
  stone_marble:     [FS("screed","bed on cured screed",7), FS("partition_tape","walls first"), FS("ceiling_gypsum","plane first"), FS("ceiling_grid_tile","plane first")],
  raised_floor:     [FS("partition_tape","walls first"), FS("ceiling_gypsum","plane first"), FS("ceiling_grid_tile","plane first")],
  skirting:         [FS("tile_vitrified","after its floor"), FS("stone_marble","after its floor"), FS("raised_floor","after its floor"), FS("screed","carpet zones: skirting first, carpet butts to it",7)],
  putty_primer:     [FS("skirting","prep after skirting lines"), FS("partition_tape","joints dry before prep",1)],
  paint_emulsion:   [FS("putty_primer","primer sanded before coats")],
  texture_paint:    [FS("putty_primer","prepped faces")],
  carpet_tile:      [FS("paint_emulsion","soft floors go down AFTER paint (R11)"), FS("skirting","butts to skirting"), FS("screed","cured base",7), FS("door_install","doors hung before soft floors"), FS("glazing_partition","glazing dust before carpet"), FS("joinery_panel","carpentry dust before carpet"), FS("storage_unit","units in before carpet"), FS("texture_paint","spray work before carpet")],
  vinyl_lvt:        [FS("paint_emulsion","soft floors after paint (R11)"), FS("skirting","butts to skirting"), FS("screed","cured base",7), FS("door_install","doors before soft floors"), FS("glazing_partition","glazing before vinyl"), FS("joinery_panel","carpentry before vinyl"), FS("storage_unit","units before vinyl"), FS("texture_paint","spray before vinyl")],
  // -- joinery / glazing measured off finished surfaces
  joinery_panel:    [FS("partition_tape","site-built carcass runs parallel to finishes (video/BFIL 50d span); final fit rides painting")],
  glazing_partition:[FS("paint_emulsion","measured off finished, painted plaster (COF)")],
  door_install:     [FS("paint_emulsion","frames to finished walls")],
  storage_unit:     [FS("paint_emulsion","on finished faces")],
  // -- grid tiles = late clean work
  ceiling_tiles:    [FS("paint_emulsion","tiles after paint — dust rule (R19/R38)"), FS("texture_paint","spray work before tiles"), FS("joinery_panel","after dusty joinery"), FS("glazing_partition","after glazing"), FS("door_install","after doors")],
  // -- second fix through the finished plane
  wiring_point:     [FS("ceiling_tiles","through the closed plane"), FS("ceiling_gypsum","through the closed plane"), FS("paint_emulsion","plates on final surfaces"), FS("circuit_wiring","no termination before its wires"), FS("cable_pull","no termination before its cables")],
  light_fixture:    [FS("ceiling_tiles","with/through tiles"), FS("ceiling_gypsum","cut into finished plane"), FS("paint_emulsion","finished surfaces"), FS("cable_pull","no fixture before its cable")],
  grille_diffuser:  [FS("ceiling_tiles","fascias at the plane"), FS("ceiling_gypsum","fascias at the plane"), FS("fcu_unit","units first")],
  sprinkler_head:   [FS("ceiling_tiles","heads drop through tiles"), FS("ceiling_gypsum","heads through the plane"), FS("sprinkler_pipe","mains first")],
  elv_device:       [FS("ceiling_tiles","devices at the plane"), FS("ceiling_gypsum","devices at the plane"), FS("cable_pull","cabling first")],
  fa_device:        [FS("ceiling_tiles","detectors at the closed plane"), FS("ceiling_gypsum","detectors at the closed plane"), FS("cable_pull","loop cabling first")],
  // Emirates corpus codes — physics from the Mumbai plan
  lineout_marking:  [FS("demo_floor_finish","set out on the stripped slab")],
  self_leveling:    [FS("demo_floor_finish","level the exposed slab")],
  pop_punning:      [FS("plaster","punning on cured render")],
  epoxy_flooring:   [FS("self_leveling","level base first"), FS("paint_emulsion","late pour on a painted shell — Emirates runs it 25-31 Jan")],
  wall_dado:        [FS("plaster","tile on cured render")],
  paint_final:      [FS("paint_emulsion","touch-up rides the finished base"), FS("joinery_panel","after carpentry knocks"), FS("door_install","after door hanging"), FS("wiring_point","after second-fix plates"), FS("blinds_film","after blinds & film handling")],
  wallpaper:        [FS("paint_emulsion","on finished base — Emirates installs after paint"), FS("putty_primer","prepped base")],
  lacquered_glass:  [FS("paint_emulsion","glass over finished walls")],
  fluted_panel:     [FS("paint_emulsion","panels over finished walls")],
  stretch_ceiling:  [FS("paint_emulsion","membrane last — dust-free room")],
  metal_ceiling:    [FS("duct_insulation","services above signed"), FS("sprinkler_pipe","mains above signed"), FS("cable_pull","containment above signed")],
  fire_door:        [FS("gi_stud_frame","frames into built walls"), FS("blockwork","frames into masonry")],
  odu_unit:         [FS("mobilisation","terrace access + crane window")],
  vav_unit:         [FS("duct_gi","boxes into the duct network")],
  fire_damper:      [FS("duct_gi","dampers into ducts"), FS("vav_unit","after boxes set")],
  ahu_unit:         [FS("duct_gi","AHU connects to the duct network")],
  precision_ac:     [FS("raised_floor","server room floor first"), FS("blockwork","room built")],
  ups_battery:      [FS("db_panel","downstream of panels"), FS("raised_floor","server room floor first")],
  pa_system:        [FS("cable_pull","containment first"), FS("ceiling_tiles","speakers at the plane"), FS("ceiling_gypsum","speakers at the plane")],
  wld_system:       [FS("raised_floor","sensors under the raised floor")],
  rodent_system:    [FS("raised_floor","under-floor devices")],
  gas_suppression:  [FS("raised_floor","cylinders + nozzles into the finished room"), FS("blockwork","room sealed")],
  bms_integration:  [FS("db_panel","points from panels"), FS("fcu_unit","points from units")],
  av_system:        [FS("ceiling_tiles","devices at the plane"), FS("ceiling_gypsum","devices at the plane"), FS("data_drop","network first")],
  white_goods:      [FS("paint_emulsion","into finished rooms")],
  // D5 scope holes — the new codes carry their physics
  condensate_drain: [FS("demo_ceiling","void open first"), SS("refnet_pipe","same high-level run, graded to riser",1)],
  core_cut:         [FS("demo_partition","set out on the stripped shell")],
  firestop:         [FS("core_cut","openings exist first"), FS("duct_gi","seal around ducts"), FS("sprinkler_pipe","seal around mains"), FS("cable_pull","seal around containment")],
  kitchen_hood:     [FS("duct_gi","hood ties into the exhaust duct"), FS("blockwork","kitchen walls up")],
  toilet_exhaust:   [FS("duct_gi","riser and duct stub first")],
  blinds_film:      [FS("glazing_partition","film on installed glass"), FS("paint_emulsion","dust-free surfaces")],
  graphics_planters:[FS("paint_emulsion","graphics on finished walls"), FS("joinery_panel","around finished joinery")],
  sanitary_fixture: [FS("tile_vitrified","fixtures on finished tiling"), FS("paint_emulsion","finished room")],
  toilet_cubicle:   [FS("tile_vitrified","cubicles on finished floor"), FS("sanitary_fixture","around fixtures")],
  washroom_accessories: [FS("sanitary_fixture","accessories last"), FS("toilet_cubicle","holders and hooks mount on the cubicles")],
  network_rack:     [FS("raised_floor","racks on finished floor"), FS("data_drop","cabling first"), FS("paint_emulsion","clean room")],
  workstation:      [FS("paint_emulsion","furniture into finished space"), FS("carpet_tile","furniture on finished soft floors"), FS("vinyl_lvt","furniture on finished floors"), FS("ceiling_tiles","plane closed before furniture")],
  ws_power_data:    [SS("workstation","cables route & terminate INTO installed furniture (his catch + BFIL)",2)],
  final_clean:      [FS("wiring_point","after second fix"), FS("light_fixture","after fixtures"), FS("grille_diffuser","after fascias"), FS("sanitary_fixture","after fixtures"), FS("sprinkler_head","after heads"), FS("elv_device","after devices"), FS("fa_device","after detection devices"), FS("workstation","after furniture"), FS("ws_power_data","after desk terminations"), FS("washroom_accessories","after accessories"), FS("ceiling_tiles","after tiles"), FS("paint_emulsion","after paint"), FS("texture_paint","after spray work"), FS("carpet_tile","after soft floors"), FS("vinyl_lvt","after soft floors"), FS("door_install","after doors"), FS("storage_unit","after units"), FS("glazing_partition","after glazing"), FS("joinery_panel","after carpentry"), FS("toilet_cubicle","after cubicles"), FS("network_rack","after racks"), FS("blinds_film","after blinds & film"), FS("graphics_planters","after graphics & planters"), FS("paint_final","after the final coat"), FS("wallpaper","after wallpaper"), FS("lacquered_glass","after glass panelling"), FS("fluted_panel","after panelling"), FS("stretch_ceiling","after membrane"), FS("metal_ceiling","after feature ceiling"), FS("av_system","after AV"), FS("white_goods","after white goods"), FS("wall_dado","after dado"), FS("epoxy_flooring","after pours"), FS("fire_door","after door sets")],
};

// inspection gates, CODE-anchored: FROM these done -> gate -> TO these may start
const GATE_RULES = [
  { id:"g_pipe_test", name:"Plumbing hydro test", from:["cpvc_pipe"], to:["waterproofing"], lag:1,
    why:"pressure held before the membrane buries the joints — a leak found post-tile breaks tile, screed and membrane" },
  { id:"g_waterproof", name:"Wet-area waterproofing test", from:["waterproofing"], to:["screed"], lag:2,
    why:"ponding held 48h before screed traps the membrane (R42)" },
  { id:"g_duct_test", name:"Duct pressure test", from:["duct_gi"], to:["duct_insulation"], lag:1,
    why:"SMACNA leak test before insulation wraps the joints" },
  { id:"g_wall", name:"Services-in-wall inspection", from:["conduit","circuit_wiring","insulation_partition","cpvc_pipe","plywood_backing"], to:["board_close"], lag:0,
    why:"in-wall wiring, pipes + insulation checked before the second side closes (MoS stage-2 / R28)" },
  { id:"g_ceiling", name:"Above-ceiling MEP inspection", from:["cable_pull","duct_insulation","fcu_unit","data_drop","sprinkler_pipe","refnet_pipe","conduit","condensate_drain","toilet_exhaust"], to:["ceiling_gypsum","ceiling_grid_tile","metal_ceiling","stretch_ceiling"], lag:0,
    why:"everything living above the plane signed off before it closes (R35 — tiles-in is the #1 violation)" },
  // D6: the void's pressure tests are EVENTS of their own, before the inspection
  { id:"g_sprk_test", name:"Sprinkler hydro test (in-void)", from:["sprinkler_pipe"], to:["ceiling_gypsum","ceiling_grid_tile","metal_ceiling","stretch_ceiling"], lag:0,
    why:"mains pressure-held before the plane closes — a weep found post-tiles reopens the ceiling" },
  { id:"g_refnet_test", name:"VRF refnet nitrogen hold", from:["refnet_pipe"], to:["ceiling_gypsum","ceiling_grid_tile","metal_ceiling","stretch_ceiling"], lag:0,
    why:"brazed joints hold nitrogen before they disappear above the plane (ASHRAE/mfr practice)" },
  // LIFE hole #6: the raceway is the only containment BURIED in screed —
  // a dead run found at desk-power stage means chipping finished floor
  { id:"g_raceway", name:"Floor raceway continuity check", from:["floor_raceway"], to:["screed"], lag:0,
    why:"prove every buried run before screed entombs it — the 280-350% rework trap" },
];

// site-scope relations: runway, per-system T&C, protection, closeout, statutory
const SITE_RULES = {
  runway: [
    { from:"mobilisation",    toPhaseMin:10, toPhaseMax:99, why:"nothing on site before mobilisation" },
    // LIFE hole #4: temp power (phase 3) sat BELOW the runway floor — it
    // could schedule before the site existed. Mobilisation covers it now.
    { from:"mobilisation",    toPhaseMin:3,  toPhaseMax:3,  why:"temporary power needs an established site" },
    { from:"gfc_pack",        toPhaseMin:11.1, toPhaseMax:91.9, why:"no trade builds without GFC" },
    { from:"samples_mockups", toPhaseMin:60, toPhaseMax:91.9, why:"finishes only from approved samples" },
    { from:"pest_control",    toPhaseMin:16, toPhaseMax:59.9, why:"treatment before construction covers the slab" },
  ],
  tc: {
    tc_electrical:["conduit","circuit_wiring","wiring_point","cable_pull","light_fixture","db_panel","temporary_lighting","ws_power_data","floor_raceway","ups_battery"],
    tc_hvac:["duct_gi","duct_insulation","grille_diffuser","fcu_unit","refnet_pipe","condensate_drain","kitchen_hood","toilet_exhaust","vav_unit","fire_damper","ahu_unit","precision_ac","odu_unit"],
    tc_plumbing:["cpvc_pipe","sanitary_fixture"],
    tc_fire:["sprinkler_pipe","sprinkler_head","fa_device","gas_suppression"],
    tc_elv:["elv_device","data_drop","network_rack","ws_power_data","pa_system","wld_system","rodent_system","bms_integration","av_system"],
  },
  protectionAfter:["tile_vitrified","stone_marble","carpet_tile","vinyl_lvt","raised_floor"],
  protectionBeforePhase:[95,96.9],
  chain: [
    // LIFE hole #5: "post strip-out" was only a name — nothing anchored
    // pest to demolition, it could plan on day 1 under live strip-out
    { code:"pest_control",    afterCodes:["demo_floor_finish"], why:"treat the EXPOSED slab — post strip-out by definition" },
    { code:"snag_cycle",      afterMaxPhase:95.9, why:"snag what is finished — incl. furniture, desk terminations, accessories" },
    { code:"signage_evac",    afterCodes:["tc_fire"], why:"life-safety tested, then signage and maps" },
    { code:"mock_fire_drill", afterCodes:["tc_fire","signage_evac"], why:"mock inspection after life-safety is testable" },
    { code:"fm_training",     afterCodes:["tc_electrical","tc_hvac","tc_plumbing","tc_fire","tc_elv"], why:"train on commissioned systems" },
    // LIFE hole #7: nothing forbade cleaning BEFORE de-snag rework re-dirtied the floor
    { code:"final_clean",     afterCodes:["snag_cycle"], why:"clean after de-snag rework, not before it" },
    { code:"fire_noc",        afterCodes:["mock_fire_drill","snag_cycle"], why:"officer inspects a finished, drilled floor" },
    // LIFE hole #8: training records go INTO the handover file (ASHRAE/BSRIA) — it must wait for them
    { code:"handover_file",   afterCodes:["tc_electrical","tc_hvac","tc_plumbing","tc_fire","tc_elv","snag_cycle","fm_training"], why:"certs, O&M and training records assemble after tests pass" },
  ],
};

// WHAT RUNS TOGETHER — declared, not implied
const CONCURRENCY = {
  parallel_ok: [
    { rule:"Same activity across different zones", why:"takt: crews flow zone to zone — this is the fronts lever" },
    { rule:"Different zones at different stages", why:"zone A finishes while zone B frames — subject to the shell hold" },
    { rule:"Framing alongside overhead first fix (SS+1)", why:"different planes of the same zone" },
    { rule:"In-wall wiring + insulation behind first-side boarding (SS+1)", why:"MoS hand-over pattern" },
    { rule:"Taping trailing second-side closing (SS+1)", why:"crew-flow overlap, 24h coat cures inside durations" },
    { rule:"Sprinkler + copper threading behind ducts (SS+2)", why:"void hand-off — biggest first (R6/R20)" },
    { rule:"GFC and samples run beside demolition", why:"design desk vs site — different resources" },
  ],
  never_together: [ // same zone, same days — verified on final dates (LG-11)
    { a:["demo_floor_finish","demo_ceiling","demo_partition"], b:"*", why:"nothing works under live strip-out" },
    { a:["putty_primer","paint_emulsion"], b:["carpet_tile","vinyl_lvt","ceiling_tiles"], why:"sanding dust ruins soft finishes (R19)" },
    { a:["screed"], b:["gi_stud_frame","board_one_face"], why:"nobody stands on green screed" },
    { a:["joinery_panel","texture_paint","glazing_partition"], b:["carpet_tile","vinyl_lvt"], why:"dusty carpentry and spray never over laid soft floors" },
  ],
};

// generated flat rule list for the testing layers (every AFTER pair + site chain)
const ORDER_RULES = [];
Object.keys(AFTER).forEach(code => AFTER[code].forEach(r =>
  ORDER_RULES.push({ id:"AR-"+code+"<-"+r.of, scope:"zone", after:[code], before:[r.of], ss:r.type==="SS",
    name:code+" follows "+r.of, why:r.why })));
SITE_RULES.chain.forEach(c => (c.afterCodes||[]).forEach(a =>
  ORDER_RULES.push({ id:"SR-"+c.code+"<-"+a, scope:"site", after:[c.code], before:[a], name:c.code+" follows "+a, why:c.why })));

// ---- long-lead items (weeks) — refreshed from the Flipspaces PERT corpus
const LONGLEAD = {
  fcu_unit: 4, db_panel: 6, workstation: 6, stone_marble: 5, storage_unit: 5,
  joinery_panel: 5, glazing_partition: 6, duct_gi: 3,
  carpet_tile: 6, light_fixture: 5, vinyl_lvt: 5, door_install: 5,
  cable_pull: 3, sanitary_fixture: 4, network_rack: 4, raised_floor: 2,
  toilet_cubicle: 5, sprinkler_pipe: 2, grille_diffuser: 2,
  // LIFE holes #1-3: import devices and spec material had no buy/wait step
  fa_device: 5, elv_device: 6, tile_vitrified: 3,
  // D5 additions: fabricated hood + made-to-measure blinds
  kitchen_hood: 4, blinds_film: 3,
  // Emirates corpus: order-to-site evidence from the Mumbai plan
  fire_door: 6, ahu_unit: 8, precision_ac: 8, ups_battery: 6, av_system: 6,
  stretch_ceiling: 6, metal_ceiling: 4, white_goods: 4, vav_unit: 4, fire_damper: 4,
  gas_suppression: 6, wld_system: 4, rodent_system: 4, bms_integration: 4, pa_system: 4,
  odu_unit: 9, // Kohler KT: 8-10wk CRITICAL — the single longest HVAC lead
  wallpaper: 3, lacquered_glass: 4, fluted_panel: 4,
};
function longLeadFor(code) { return LONGLEAD[code] || 0; }

// ===================================================================
// THE ENABLING CHAIN (his point 9) — design, client approval, vendor
// award/PO, submittal, manufacture, delivery as FIRST-CLASS TASKS.
// A stuck drawing or a late PO must move dates visibly; an invisible
// lead-time offset cannot be chased, escalated or blamed.
//
// One PACKAGE = one vendor, one PO, one submittal cycle, N install
// codes. A package chains: design -> client approval -> PO -> submittal
// -> manufacture -> delivery -> (FS) every member install, every zone.
// design/approval only where drawings gate the order (made-to-order).
// mfg working days = LONGLEAD weeks x 6 minus PO+submittal+delivery,
// so the chain reproduces the researched order-to-site totals — the
// design/approval legs ahead of the PO are genuinely additional time.
// The takt lead floor (LONGLEAD) stays as a belt-and-braces MAX.
// ===================================================================
// STAGE ORDER (corrected 13 Jul, 2 witnesses): LS logic ties material
// APPROVAL -> ORDER explicitly (Dado approval #17 -> Marble Order #36);
// Emirates dates agree (samples 20 Sep-19 Oct BEFORE orders Oct-Nov).
// Sample & material approval is DESIGN-side and precedes the PO.
const PKG_STAGES = ["design","approval","submittal","po","mfg","delivery"];
const PKG_WD = { po:5, submittal:5, delivery:2 };      // approval: package aprWd or 5 · po/delivery calibrated to Emirates actuals
const PACKAGES = [
  { id:"joinery",       name:"Joinery & fixed woodwork", codes:["joinery_panel","storage_unit"],        lead:5, design:true,  dsnWd:8 },
  { id:"glazing_doors", name:"Glazing & doors",          codes:["glazing_partition","door_install"],    lead:6, design:true,  dsnWd:6 },
  { id:"furniture",     name:"Loose furniture & workstations", codes:["workstation"],                   lead:6, design:true,  dsnWd:5 },
  { id:"flooring_soft", name:"Soft flooring",            codes:["carpet_tile","vinyl_lvt"],             lead:6, design:false },
  { id:"flooring_hard", name:"Hard flooring & stone",    codes:["stone_marble","tile_vitrified"],       lead:5, design:false },
  { id:"hvac_equip",    name:"HVAC equipment (IDU + ODU)", codes:["fcu_unit","odu_unit"],               lead:9, design:true,  dsnWd:6 },
  { id:"ducting",       name:"Ducting (fabricated)",     codes:["duct_gi"],                             lead:3, design:true,  dsnWd:6 },
  { id:"switchgear",    name:"DB panels & switchgear",   codes:["db_panel"],                            lead:6, design:true,  dsnWd:6 },
  { id:"light_fixtures",name:"Light fixtures",           codes:["light_fixture"],                       lead:5, design:false },
  { id:"fire_detection",name:"Fire alarm devices",       codes:["fa_device"],                           lead:5, design:false },
  { id:"elv",           name:"ELV & networking hardware",codes:["elv_device","network_rack"],           lead:6, design:false },
  { id:"sanitary_cp",   name:"Sanitary, CP & cubicles",  codes:["sanitary_fixture","toilet_cubicle"],   lead:5, design:false },
  // Emirates corpus packages — real Flipspaces procurement lines
  { id:"fire_doors",    name:"Fire-rated metal doors",   codes:["fire_door"],                           lead:6, design:true, dsnWd:4 },
  { id:"ahu",           name:"AHU + air-side equipment", codes:["ahu_unit","vav_unit","fire_damper"],   lead:8, design:true, dsnWd:6 },
  { id:"precision_ac",  name:"Precision AC (critical areas)", codes:["precision_ac"],                   lead:8, design:true, dsnWd:5 },
  { id:"ups",           name:"UPS & battery",            codes:["ups_battery"],                         lead:6, design:true, dsnWd:5 },
  { id:"av",            name:"AV / VC systems",          codes:["av_system"],                           lead:6, design:false },
  { id:"stretch_ceiling", name:"Stretch ceiling",        codes:["stretch_ceiling"],                     lead:6, design:false },
  { id:"metal_ceiling", name:"Metal / feature ceilings", codes:["metal_ceiling"],                       lead:4, design:true, dsnWd:5 },
  { id:"white_goods",   name:"White goods",              codes:["white_goods"],                         lead:4, design:false },
  { id:"critical_elv",  name:"Critical-area ELV (WLD, rodent, gas, BMS)", codes:["wld_system","rodent_system","gas_suppression","bms_integration"], lead:6, design:false },
  { id:"wall_finishes", name:"Wallpaper, lacquered glass & panels", codes:["wallpaper","lacquered_glass","fluted_panel"], lead:4, design:false },
];

// ===================================================================
// DESIGN DISCIPLINE DRAWINGS (Emirates evidence): the design phase is
// not one GFC blob — it is ~9 discipline packages, each drawn, client-
// approved, and RELEASING its own slice of site work. Emirates ran 20+
// drawing streams over 129 days, and its ACTUALS show design as the
// slipping discipline — so the engine must see each release date.
// The blanket gfc_pack runway stays as a safety net (max constraint).
// ===================================================================
const DRAWINGS = [
  { id:"dwg_layouts",  name:"Layouts — partitions, doors, line-out", wd:10,
    releases:["lineout_marking","gi_stud_frame","blockwork","board_one_face","door_install"] },
  { id:"dwg_flooring", name:"Flooring layouts & finishes schedule", wd:8,
    releases:["self_leveling","screed","tile_vitrified","stone_marble","carpet_tile","vinyl_lvt","raised_floor","epoxy_flooring","skirting"] },
  { id:"dwg_rcp",      name:"RCP + coordinated RCP", wd:12,
    releases:["ceiling_gypsum","ceiling_grid_tile","ceiling_tiles","stretch_ceiling","metal_ceiling"] },
  { id:"dwg_elec",     name:"Electrical — conduiting, raceway, SLD, load", wd:10,
    releases:["conduit","circuit_wiring","cable_pull","floor_raceway","db_panel","wiring_point","light_fixture","ups_battery"] },
  { id:"dwg_hvac",     name:"HVAC — layouts, heat load, equipment", wd:10,
    releases:["duct_gi","duct_insulation","fcu_unit","refnet_pipe","condensate_drain","vav_unit","fire_damper","ahu_unit","grille_diffuser","precision_ac","kitchen_hood","toilet_exhaust"] },
  { id:"dwg_plumbing", name:"Plumbing layouts", wd:8,
    releases:["cpvc_pipe","sanitary_fixture"] },
  { id:"dwg_fire",     name:"Fire — sprinkler + FA/PA layouts", wd:8,
    releases:["sprinkler_pipe","sprinkler_head","fa_device","gas_suppression"] },
  { id:"dwg_elv",      name:"ELV — data, security, AV layouts", wd:8,
    releases:["data_drop","elv_device","network_rack","pa_system","wld_system","rodent_system","bms_integration","av_system"] },
  { id:"dwg_finishes", name:"Wall finishes & paint schedule", wd:8,
    releases:["putty_primer","paint_emulsion","texture_paint","wallpaper","lacquered_glass","fluted_panel","wall_dado","blinds_film"] },
];

// drawing tasks for the disciplines this project actually needs:
// draw -> client approval; the approval RELEASES the discipline's codes
function drawingTasks(codesPresent) {
  const has = c => codesPresent.has ? codesPresent.has(c) : codesPresent.includes(c);
  const out = [];
  DRAWINGS.forEach(d => {
    if (!d.releases.some(has)) return;
    out.push({ id: "dwg:" + d.id + ":draw", code: "pkg_design", dwg: d.id, zone: "site",
      qty: d.wd, conf: "med", name: d.name + " — GFC issue",
      src: "design discipline · Emirates corpus (design ran as ~9 released packages)" });
    out.push({ id: "dwg:" + d.id + ":apr", code: "pkg_approval", dwg: d.id, zone: "site",
      qty: OPTS.aprWd || 5, conf: OPTS.aprWd ? "high" : "low", name: d.name + " — client approval",
      src: "design discipline · client court" });
  });
  return out;
}

// generate the chain tasks for every package whose install codes are in
// the project. Site-zone, day-unit quantities. Call from any project
// recipe: SEQ.enablingTasks(new Set(tasks.map(t=>t.code)))
function enablingTasks(codesPresent) {
  const out = [];
  PACKAGES.forEach(p => {
    if (!p.codes.some(c => codesPresent.has ? codesPresent.has(c) : codesPresent.includes(c))) return;
    const mfgWd = Math.max(2, p.lead * 6 - PKG_WD.po - PKG_WD.submittal - PKG_WD.delivery);
    const mk = (stage, code, qty, name) => out.push({
      id: "pkg:" + p.id + ":" + stage, code, pkg: p.id, zone: "site",
      qty, conf: stage === "approval" ? "low" : "med", name,
      src: "enabling chain · " + p.name + (stage === "mfg" ? " · LONGLEAD " + p.lead + "wk" : ""),
    });
    if (p.design) {
      mk("design",    "pkg_design",    p.dsnWd || 8,        "Design & shop drawings — " + p.name);
      // SLA confirmed by the user -> high confidence; assumed -> low + query
      mk("approval",  "pkg_approval",  OPTS.aprWd || p.aprWd || 5, "Client approval — " + p.name);
      out[out.length - 1].conf = OPTS.aprWd ? "high" : "low";
    }
    mk("po",        "pkg_po",        PKG_WD.po,           "Vendor award & PO — " + p.name);
    mk("submittal", "pkg_submittal", PKG_WD.submittal,    "Sample & material approval — " + p.name);
    mk("mfg",       "pkg_mfg",       mfgWd,               "Manufacture — " + p.name);
    mk("delivery",  "pkg_delivery",  PKG_WD.delivery,     "Delivery to site — " + p.name);
  });
  return out;
}

// ---- site-wide options (set by the app before each plan run) -------
// aprWd: confirmed client approval SLA in working days (null = assumed 5,
//        flagged as a query — no silent assumptions).
// preOrder: {all:true} or {pkgId:true} — award the PO on approved
//        typicals straight after design; client approval then runs in
//        parallel and gates DELIVERY, never the award. The classic D&B
//        compression move, made explicit and auditable.
// ductMethod: "wrap" (default: hang -> leak test -> insulate; Emirates) or
// "pre" (pre-insulated on ground: insulate BEFORE hanging; DHL) — corpus 1-1
const OPTS = { shellHold: false, aprWd: null, preOrder: {}, ductMethod: "wrap" };

// ---- deriveLinks: a thin interpreter over THE RULEBOOK -------------
function deriveLinks(tasks) {
  const nodes = tasks.map(t => Object.assign({}, t, { phase: phaseOf(t) }));
  const edges = [];
  const addEdge = (from, to, meta) => edges.push(Object.assign({ from, to }, meta));

  // index: zone -> code -> tasks
  const Z = {};
  nodes.forEach(n => {
    const z = n.zone || "_";
    (Z[z] = Z[z] || {}); (Z[z][n.code] = Z[z][n.code] || []).push(n);
  });

  // (1) WHAT FOLLOWS WHAT — zone-local AFTER relations
  const preIns = OPTS.ductMethod === "pre";
  Object.keys(Z).forEach(z => {
    if (z === "site") return;                       // site tasks wired by SITE_RULES only
    const zc = Z[z];
    // pre-insulated method (DHL): insulation precedes hanging — flip the pair
    if (preIns && zc.duct_insulation && zc.duct_gi)
      zc.duct_gi.forEach(b => zc.duct_insulation.forEach(a =>
        addEdge(a.id, b.id, { type: "FS", lag: 0, why: "pre-insulated sections hang ready (DHL method — your answer)" })));
    Object.keys(zc).forEach(code => {
      (AFTER[code] || []).forEach(rel => {
        if (preIns && code === "duct_insulation" && rel.of === "duct_gi") return; // flipped above
        // the named package, or whoever carries that work on this job
        let of = rel.of, note = "";
        if (!zc[of]) {
          // A STAND-IN THAT RESOLVES TO THE PACKAGE ITSELF IS A CYCLE.
          // "ceiling tiles after texture paint" becoming "paint after paint"
          // is not a constraint, it is a graph with no start.
          const alt = (STANDS_IN[of] || []).find(x => zc[x] && x !== code);
          if (!alt) return;
          // nor may it point back at something that already waits on us
          if ((AFTER[alt] || []).some(r => r.of === code ||
              (STANDS_IN[r.of] || []).indexOf(code) >= 0)) return;
          of = alt; note = " (" + alt + " carries " + rel.of + " on this job)";
        }
        (zc[of] || []).forEach(a => zc[code].forEach(b => {
          if (a.id !== b.id) addEdge(a.id, b.id, { type: rel.type, lag: rel.lag, why: rel.why + note });
        }));
      });
    });
    // (2) GATES — code-anchored inspection holds
    GATE_RULES.forEach(g => {
      if (preIns && g.id === "g_duct_test") return; // joints tested at hang, not post-wrap
      const from = g.from.flatMap(c => zc[c] || []);
      const to   = g.to.flatMap(c => zc[c] || []);
      if (!from.length || !to.length) return;
      const gid = g.id + ":" + z;
      nodes.push({ id: gid, gate: true, name: g.name, why: g.why, zone: z,
        phase: Math.max(...from.map(t => t.phase)) + 0.5, dur: 0 });
      from.forEach(a => addEdge(a.id, gid, { type: "FS", lag: 0, why: g.why }));
      to.forEach(b => addEdge(gid, b.id, { type: "FS", lag: g.lag || 0, why: g.why }));
    });
  });

  const byCode = {};
  nodes.forEach(n => { if (!n.gate) (byCode[n.code] = byCode[n.code] || []).push(n); });

  // (2b) THE ENABLING CHAIN — package stages in declared order, then
  // delivery releases every member install in every zone. Edges keyed
  // by pkg tag, never by the generic pkg_* codes (codes are shared
  // across packages; matching on code would cross-wire the chains).
  {
    const byPkg = {};
    nodes.forEach(n => { if (n.pkg) (byPkg[n.pkg] = byPkg[n.pkg] || {})[n.id.split(":").pop()] = n; });
    Object.keys(byPkg).forEach(pid => {
      const st = byPkg[pid];
      const pre = !!(OPTS.preOrder && (OPTS.preOrder.all || OPTS.preOrder[pid])) && st.design && st.approval;
      if (pre) {
        // PRE-ORDER: award on approved typicals — design releases the PO
        // directly; sample approval runs beside it but still gates
        // MANUFACTURE (nothing is made off an unapproved sample), and
        // the client design approval gates DELIVERY.
        const run = [st.design, st.po, st.mfg, st.delivery].filter(Boolean);
        for (let i = 1; i < run.length; i++)
          addEdge(run[i - 1].id, run[i].id, { type: "FS", lag: 0, why: "enabling chain (pre-order) — " + pid });
        if (st.submittal) {
          addEdge((st.design || st.po).id, st.submittal.id, { type: "FS", lag: 0, why: "samples move beside the award — " + pid });
          if (st.mfg) addEdge(st.submittal.id, st.mfg.id, { type: "FS", lag: 0, why: "nothing manufactured off an unapproved sample — " + pid });
        }
        if (st.approval) {
          addEdge(st.design.id, st.approval.id, { type: "FS", lag: 0, why: "approval runs beside procurement — " + pid });
          addEdge(st.approval.id, st.delivery.id, { type: "FS", lag: 0, why: "no unapproved material reaches site — " + pid });
        }
      } else {
        const seq = PKG_STAGES.map(s => st[s]).filter(Boolean);
        for (let i = 1; i < seq.length; i++)
          addEdge(seq[i - 1].id, seq[i].id, { type: "FS", lag: 0, why: "enabling chain — " + pid });
      }
      const dlv = st.delivery;
      const p = PACKAGES.find(x => x.id === pid);
      if (dlv && p) p.codes.forEach(c => (byCode[c] || []).forEach(inst => {
        if (!inst.pkg) addEdge(dlv.id, inst.id, { type: "FS", lag: 0, why: "material on site before install — " + pid });
      }));
    });
  }

  // (2c) DESIGN RELEASES — each discipline's client approval releases
  // that discipline's site codes (draw -> approve -> build). Keyed by
  // the dwg tag; the blanket gfc runway remains as the max-safety net.
  {
    const byDwg = {};
    nodes.forEach(n => { if (n.dwg) (byDwg[n.dwg] = byDwg[n.dwg] || {})[n.id.split(":").pop()] = n; });
    Object.keys(byDwg).forEach(did => {
      const st = byDwg[did];
      if (st.draw && st.apr) addEdge(st.draw.id, st.apr.id, { type: "FS", lag: 0, why: "client approves the issued set — " + did });
      // 2-witness law (LS logic + Malpani SS-cascade): the LAYOUT set is
      // drawn FIRST; every other discipline set starts off it (SS+2)
      if (did !== "dwg_layouts" && byDwg.dwg_layouts && byDwg.dwg_layouts.draw && st.draw)
        addEdge(byDwg.dwg_layouts.draw.id, st.draw.id, { type: "SS", lag: 2, why: "disciplines draw off the partition/furniture layouts (LS #5->all, Malpani cascade)" });
      const rel = (DRAWINGS.find(d => d.id === did) || {}).releases || [];
      const releaser = st.apr || st.draw;
      if (releaser) rel.forEach(c => (byCode[c] || []).forEach(inst => {
        if (!inst.dwg && !inst.pkg) addEdge(releaser.id, inst.id, { type: "FS", lag: 0, why: "no trade builds without its approved discipline set — " + did });
      }));
      // shop drawings derive from the approved GFC set (Emirates: SLD
      // approval before the LT-panel order) — release the package design leg
      if (releaser) PACKAGES.forEach(p => {
        if (!p.design || !p.codes.some(c => rel.includes(c))) return;
        const leg = nodes.find(n => n.id === "pkg:" + p.id + ":design");
        if (leg) addEdge(releaser.id, leg.id, { type: "FS", lag: 0, why: "shop drawings from the approved " + did + " set" });
      });
    });
  }

  // (2b) WORK THAT COULD NOT BE PUT IN A ROOM STILL HAS TO WAIT ITS TURN.
  // Counted work — 2,354 wiring points, 47 boards, every light fitting — has
  // no per-room count, so it lives as one task in a pseudo-zone called
  // "floor". The zone-local pass above finds it no neighbours there, so
  // nineteen packages came out with no predecessor at all and were free to
  // start on day one: the second-fix plates before the wall existed.
  //
  // Floor-wide work waits on floor-wide completion. A package that cannot say
  // WHICH room it is in cannot claim to follow room by room either, so it
  // links from EVERY task of each predecessor code, anywhere on the floor,
  // and the CPM takes the latest. That is the honest reading of "the whole
  // floor's conduit is in before the whole floor's plates go on".
  const floorTasks = nodes.filter(n => !n.gate && (n.zone === "floor" || !n.zone));
  if (floorTasks.length) {
    const byCode = {};
    nodes.filter(n => !n.gate && n.code).forEach(n => (byCode[n.code] = byCode[n.code] || []).push(n));
    floorTasks.forEach(b => {
      (AFTER[b.code] || []).forEach(rel => {
        let of = rel.of, note = "";
        if (!byCode[of]) {
          const alt = (STANDS_IN[of] || []).find(x => byCode[x] && x !== b.code);
          if (!alt) return;
          of = alt; note = " (" + alt + " carries " + rel.of + " on this job)";
        }
        if (of === b.code) return;
        (byCode[of] || []).forEach(a => {
          if (a.id === b.id || a.zone === b.zone) return;   // zone-local pass owns those
          addEdge(a.id, b.id, { type: rel.type, lag: rel.lag,
            why: rel.why + note + " — floor-wide, so it waits for the whole floor" });
        });
      });
    });
  }

  // (3) site-wide shell hold (his site rule; a lever, chat-flippable)
  if (OPTS.shellHold) {
    const demoT = nodes.filter(n => !n.gate && n.phase >= 10 && n.phase <= 11);
    const rest  = nodes.filter(n => !n.gate && n.phase > 11);
    if (demoT.length && rest.length) {
      const gid = "g_shell:site";
      nodes.push({ id: gid, gate: true, name: "Cleared shell handover — demolition complete, debris out",
        why: "occupied building: no trade starts under live demolition", zone: "site", phase: 10.6, dur: 0 });
      demoT.forEach(t => addEdge(t.id, gid, { type: "FS", lag: 0, why: "shell hold" }));
      rest.forEach(t => addEdge(gid, t.id, { type: "FS", lag: 0, why: "shell hold" }));
    }
  }

  // (4) runway: mobilisation / GFC / samples / pest gate bands of site work
  SITE_RULES.runway.forEach(r => (byCode[r.from] || []).forEach(f =>
    nodes.forEach(n => { if (!n.gate && n.id !== f.id && n.phase >= r.toPhaseMin && n.phase <= r.toPhaseMax
      && n.code !== r.from) addEdge(f.id, n.id, { type: "FS", lag: 0, why: "runway: " + f.name }); })));

  // (5) per-system T&C after its whole system
  Object.keys(SITE_RULES.tc).forEach(tc => (byCode[tc] || []).forEach(tcn =>
    nodes.forEach(n => { if (!n.gate && n.id !== tcn.id && SITE_RULES.tc[tc].includes(n.code))
      addEdge(n.id, tcn.id, { type: "FS", lag: 0, why: "system complete before its T&C" }); })));

  // (6) protection covering: after finish floors, before the furniture wave
  (byCode["protection_covering"] || []).forEach(pc => nodes.forEach(n => {
    if (n.gate || n.id === pc.id) return;
    if (SITE_RULES.protectionAfter.includes(n.code))
      addEdge(n.id, pc.id, { type: "FS", lag: 0, why: "floors down before protection goes over them" });
    if (n.phase >= SITE_RULES.protectionBeforePhase[0] && n.phase <= SITE_RULES.protectionBeforePhase[1])
      addEdge(pc.id, n.id, { type: "FS", lag: 0, why: "protection down before furniture moves in" });
  }));

  // (7) closeout & statutory chain
  SITE_RULES.chain.forEach(rule => (byCode[rule.code] || []).forEach(me => {
    if (rule.afterCodes) rule.afterCodes.forEach(c => (byCode[c] || []).forEach(p2 =>
      addEdge(p2.id, me.id, { type: "FS", lag: 0, why: rule.why })));
    if (rule.afterMaxPhase != null) nodes.forEach(n => { if (!n.gate && n.id !== me.id
      && n.phase <= rule.afterMaxPhase && n.zone !== "site")
      addEdge(n.id, me.id, { type: "FS", lag: 0, why: rule.why }); });
  }));

  // (8) long-lead weeks onto nodes (CPM enforces earliest start)
  nodes.forEach(n => { if (n.code) { const w = longLeadFor(n.code); if (w) n.leadWeeks = w; } });

  // (9) dedupe: one edge per from->to, most binding wins
  const byKey = {};
  edges.forEach(e => { const k = e.from + "|" + e.to; byKey[k] = byKey[k] ? mergeEdge(byKey[k], e) : e; });
  return { nodes, edges: Object.values(byKey) };
}

function mergeEdge(a, b) {
  if (a.type === "FS" || b.type === "FS") {
    const fs = [a, b].filter(x => x.type === "FS").sort((x, y) => y.lag - x.lag)[0];
    return { from: a.from, to: a.to, type: "FS", lag: fs.lag, why: fs.why };
  }
  const s = [a, b].sort((x, y) => y.lag - x.lag)[0];
  return { from: a.from, to: a.to, type: "SS", lag: s.lag, why: s.why };
}

const RULEBOOK = { AFTER, GATE_RULES, SITE_RULES, CONCURRENCY };
// export the WHOLE rulebook — an unexported table is invisible to the
// verifier, and an invisible table makes its checks pass vacuously
const SEQ = { PHASES, STANDS_IN, phaseOf, phaseLabel, GATES: GATE_RULES, GATE_RULES, AFTER, SITE_RULES, CONCURRENCY, LONGLEAD, longLeadFor, PACKAGES, PKG_STAGES, DRAWINGS, enablingTasks, drawingTasks, deriveLinks, PHASE_OF_CODE, OPTS, ORDER_RULES, RULEBOOK };
(function (g) { g.KB_SEQ = SEQ; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = SEQ;

})();
