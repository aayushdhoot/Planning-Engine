// ===================================================================
// DnB-OS · platform/project/kohler_v0.js
// Kohler Pune 7F — project model v0 (the fixture the Plan screen runs on).
//
// WHAT THIS IS: real zones and areas from the Aspen deck read
// (dandb-os/kb/measurement.js, carpet total 11,900 sqft), turned into
// task quantities through a TRANSPARENT take-off recipe — standard
// fit-out factors, written next to each line. Confidence carries the
// zone's own deck confidence.
//
// WHAT THIS IS NOT: a BOQ read. PE-4 (intelligence) replaces this file
// with quantities read from the priced BOQ + drawings, line by line.
// Until then every quantity here is marked src:"deck-area × factor".
//
// Units follow platform/kb/durations.js norms: m2 / m / kg / no.
// sqft -> m2 conversion 0.0929.
// ===================================================================

;(function () {

const SQFT = 0.0929; // sqft -> m2
const SEQ = (typeof require !== "undefined") ? require("../kb/sequence.js")
  : (typeof window !== "undefined" ? window.KB_SEQ : globalThis.KB_SEQ);

// ---- zones: id, name, area sqft, confidence — from the Aspen deck read
// traits: floor carpet|vitrified|stone|vinyl|raised · ceiling gypsum|grid|none
//         wet (waterproofing chain) · demo (existing floor strip-out)
//         part = partition wall sqft per sqft of floor (drywall)
//         glaze = glazed-front sqft per sqft of floor
const ZONES = [
  { id:"reception",   name:"Reception & arrival",      area:850,  conf:"high", demo:1, floor:"stone",     ceiling:"gypsum", part:0.5,  glaze:0.25, doors:0, joinery:30, texture:25, ac:1 },
  { id:"boardroom",   name:"Boardroom (20 pax)",       area:530,  conf:"high", demo:1, floor:"carpet",    ceiling:"gypsum", part:1.4,  glaze:0.5,  doors:1, joinery:40, data:10, ac:1 },
  { id:"md_cabin",    name:"MD cabin",                 area:323,  conf:"med",  demo:1, floor:"carpet",    ceiling:"gypsum", part:1.3,  glaze:0.4,  doors:1, joinery:12, storage:2, data:4, ac:1 },
  { id:"hod_cabins",  name:"HOD cabins (4)",           area:480,  conf:"med",  demo:1, floor:"carpet",    ceiling:"gypsum", part:1.5,  glaze:0.5,  doors:4, storage:4, data:16, ac:1 },
  { id:"meeting_6",   name:"6-pax meeting rooms (3)",  area:270,  conf:"med",  demo:1, floor:"carpet",    ceiling:"gypsum", part:1.5,  glaze:0.5,  doors:3, data:18, ac:1 },
  { id:"meeting_8",   name:"8-pax meeting room",       area:140,  conf:"med",  demo:1, floor:"carpet",    ceiling:"gypsum", part:1.5,  glaze:0.5,  doors:1, data:6, ac:1 },
  // cafeteria runs as THREE work areas (takt: no zone bigger than a crew can flow through; R9 treats them separately too)
  { id:"caf_dining",  name:"Cafeteria — dining",       area:2200, conf:"high", demo:1, floor:"vitrified", ceiling:"grid",   part:0.12, glaze:0.05, doors:1, joinery:20, storage:2, data:4, ac:1 },
  { id:"caf_town",    name:"Cafeteria — town hall",    area:1200, conf:"high", demo:1, floor:"vitrified", ceiling:"grid",   part:0.15, glaze:0.08, doors:1, joinery:15, data:4, ac:1 },
  { id:"caf_kitchen", name:"Kitchen & servery",        area:810,  conf:"high", demo:1, floor:"vitrified", ceiling:"grid",   part:0.45, glaze:0,    doors:0, joinery:10, storage:2, ac:1, kitchen:1 },
  { id:"collab",      name:"Collaboration zones",      area:400,  conf:"med",  demo:1, floor:"carpet",    ceiling:"grid",   part:0.3,  glaze:0.1,  doors:0, joinery:10, data:8, ac:1 },
  { id:"workstations",name:"Workstations (42 WS)",     area:1815, conf:"high", demo:1, floor:"carpet",    ceiling:"grid",   part:0.12, glaze:0.05, doors:0, data:84, ws:42, ac:1 },
  { id:"circulation", name:"Passage / circulation",    area:700,  conf:"med",  demo:1, floor:"vinyl",     ceiling:"gypsum", part:0.1,  glaze:0,    doors:0, ac:1 },
  { id:"display",     name:"Display / feature area",   area:340,  conf:"med",  demo:1, floor:"stone",     ceiling:"gypsum", part:0.5,  glaze:0.3,  doors:0, joinery:20, texture:12, data:2, ac:1 },
  { id:"foyer",       name:"Waiting foyer",            area:235,  conf:"med",  demo:1, floor:"stone",     ceiling:"gypsum", part:0.3,  glaze:0.2,  doors:0, data:2, ac:1 },
  { id:"washrooms",   name:"Washrooms (M/F/H)",        area:500,  conf:"high", demo:1, wet:1, floor:"vitrified", ceiling:"gypsum", part:0,  glaze:0, doors:3, sanitary:12, ac:0 },
  { id:"pantry",      name:"Pantry / tuck shop",       area:220,  conf:"med",  demo:1, wet:1, floor:"vitrified", ceiling:"gypsum", part:0,  glaze:0, doors:1, sanitary:2, joinery:8, ac:1 },
  { id:"hub_room",    name:"Server / hub room",        area:120,  conf:"low",  demo:0, floor:"raised",    ceiling:"grid",   part:1.3,  glaze:0,    doors:1, db:1, data:24, elv:8, ac:1 },
  { id:"services",    name:"Store / services",         area:157,  conf:"low",  demo:0, floor:"vinyl",     ceiling:"none",   part:0.6,  glaze:0,    doors:1, db:2, storage:6, ac:0 },
];

// ---- the take-off recipe: zone traits -> task quantities -------------
// Each factor is a standard fit-out ratio, written where it is used.
function zoneTasks(z) {
  const A = z.area, M = A * SQFT, T = [];
  const add = (code, qty, note) => { if (qty >= 0.5) T.push({
    id: z.id + ":" + code, code, zone: z.id, qty: Math.round(qty), conf: z.conf,
    src: note || "deck area × factor" }); };

  // demolition — strip existing floor finish, old ceiling, some walls
  if (z.demo) {
    add("demo_floor_finish", M,        "strip floor finish · full zone");
    add("demo_ceiling",      M * 0.9,  "old ceiling out · 90% of zone");
    add("demo_partition",    M * 0.25, "existing walls out · 0.25 m2 per m2 floor");
  }

  // wet chain (washrooms, pantry) — masonry, waterproof, screed, tile walls+floor
  if (z.wet) {
    add("blockwork",     M * 1.2, "wet-area walls · 1.2 m2 wall per m2 floor");
    add("plaster",       M * 2.4, "both faces of blockwork");
    add("waterproofing", M * 1.1, "floor + upturns");
    add("screed",        M,       "full wet floor");
    add("tile_vitrified",M * 2.7, "floor (0.95) + wall tiling to height (1.75)");
    add("cpvc_pipe",     A * 0.35,"supply+drain runs · 0.35 m per sqft");
    add("sanitary_fixture", z.sanitary || 0, "Kohler free-issue · install only");
    add("washroom_accessories", 2, "dispensers, mirrors, holders — per wet zone");
    if (z.id === "washrooms") add("toilet_cubicle", 6, "M/F cubicle sets — Addverb norm");
  }

  // partitions (dry zones)
  if (z.part) {
    const frame = M * z.part;
    add("gi_stud_frame",  frame,     "partition walls · " + z.part + " m2 wall per m2 floor");
    add("board_one_face", frame,     "first side of the frame");
    if (z.part >= 1.0) add("insulation_partition", frame, "acoustic infill — cabins & meeting rooms");
    add("board_close",    frame,     "second side — closes only after in-wall services clear");
    add("partition_tape", frame * 2, "tape + joint both faces");
  }

  // in-wall / overhead electrical
  const needsRaceway=(z.ws||0)>0||(z.data||0)>=8;
  if (needsRaceway) add("floor_raceway", A*0.10, "power+data to mid-floor clusters — laid before screed (panel D4: 0.25 was 2-3x over; cluster runs, not full grid)");
  if (needsRaceway && !z.wet && z.floor!=="stone" && z.floor!=="vitrified" && z.floor!=="raised")
    add("screed", M*0.95, "cover screed over floor raceways (video: raceways then screed)");
  add("wiring_point", A / 35,  "1 point per 35 sqft");
  add("circuit_wiring", A / 35, "wire pull per point — in wall & void");
  add("conduit",      A * 0.3, "overhead runs · 0.3 m per sqft");

  // ceiling
  if (z.ceiling === "gypsum") add("ceiling_gypsum",    M * 0.92, "92% of zone ceilinged");
  if (z.ceiling === "grid")   { add("ceiling_grid_tile", M * 0.92, "grid + frame · 92% of zone"); add("ceiling_tiles", M * 0.92, "lay-in tiles — late, after paint"); }

  // flooring (wet zones already tiled above)
  if (!z.wet) {
    if (z.floor === "stone")     { add("screed", M * 0.95, "bed under stone"); add("stone_marble", M * 0.95, "95% of zone"); }
    if (z.floor === "vitrified") { add("screed", M * 0.95, "bed under tile");  add("tile_vitrified", M * 0.95, "95% of zone"); }
    if (z.floor === "carpet")    add("carpet_tile", M * 0.95, "95% of zone");
    if (z.floor === "vinyl")     add("vinyl_lvt",   M * 0.95, "95% of zone");
    if (z.floor === "raised")    add("raised_floor",M * 0.95, "95% of zone");
    add("skirting", M * 0.4, "≈0.4 m per m2 floor");
  }

  // finishes — gypsum ceilings get puttied and painted too (panel D4:
  // the underside was silently unpainted; grid/tile ceilings are not)
  const ceilPaint = z.ceiling === "gypsum" ? M * 0.92 : 0;
  const wallPaint = (z.part ? M * z.part * 2 : 0) + M * 0.5 + ceilPaint; // partitions both faces + shell walls + gypsum underside
  add("putty_primer",  wallPaint, "partition faces + shell walls" + (ceilPaint ? " + gypsum ceiling underside" : ""));
  add("paint_emulsion",wallPaint, "same surfaces, finish coats" + (ceilPaint ? " incl. ceiling" : ""));
  add("paint_final",   wallPaint, "final coat + touch-up before snag — corpus 3-witness law");
  if (z.texture) add("texture_paint", z.texture, "feature/accent walls · designed m2");

  // joinery & glazing
  if (z.glaze)   { add("glazing_partition", M * z.glaze, "glazed fronts · " + z.glaze + " per m2 floor");
                   add("blinds_film", M * z.glaze * 0.4, "privacy/branding film + blinds on glazed fronts — contract exhibit, confirm extent"); }
  if (["reception","caf_town","caf_dining"].includes(z.id))
    add("graphics_planters", Math.max(4, Math.round(A / 250)), "wall graphics, signage & planters — contract exhibit, confirm count");
  if (z.doors)   add("door_install", z.doors, "count of rooms");
  if (z.joinery) add("joinery_panel", z.joinery, "designed feature/panelling m2");
  if (z.storage) add("storage_unit", z.storage, "count");
  if (z.ws)      { add("workstation", z.ws, "42 WS · Aspen deck"); add("ws_power_data", z.ws, "power+data terminated into each workstation — after furniture (his catch + BFIL)"); }

  // HVAC (AC zones) — refnet + condensate were NEVER CALLED (panel D5:
  // a VRF system without branch piping or drains cannot exist)
  if (z.ac) {
    const duct = A * 0.5, fcus = Math.max(1, Math.round(A / 550));
    add("duct_gi",        duct,       "0.5 kg per sqft served");
    add("duct_insulation",duct * 0.17,"duct surface · 0.17 m2 per kg (panel D4: 0.09 undercounted the wrap)");
    add("fcu_unit",       fcus,       "1 FCU per ~550 sqft");
    add("refnet_pipe",    A * 0.12,   "VRF branch piping · ~0.12 m per sqft served — confirm IDU/ODU layout");
    add("condensate_drain", fcus * 4, "insulated drain ~4 m per IDU to riser");
    add("grille_diffuser",A / 160,    "1 per ~160 sqft");
  } else {
    add("grille_diffuser", A / 200, "ventilation only");
  }
  if (z.wet) add("toilet_exhaust", Math.max(1, Math.round(A / 400)), "exhaust fan + stub per washroom block");
  if (z.wet || z.kitchen) {
    const cores = Math.max(2, Math.round(A / 300));
    add("core_cut", cores, "slab penetrations — wet/kitchen stacks · confirm against GFC");
    add("firestop", cores, "seal every penetration · fire compartment integrity");
  }

  // power/data/fire/ELV
  add("cable_pull",     A * 0.28, "power circuits · 0.28 m per sqft (panel D4: 0.45 double-counted data — CAT6A ~100% reuse per KT)");
  add("light_fixture",  A / 55,   "1 fixture per 55 sqft");
  add("sprinkler_pipe", A * 0.045,"0.045 m per sqft — NBC/NFPA grid (panel D4: 0.12 was a ft→m slip; FLSS is refurbishment)");
  add("sprinkler_head", A / 130,  "NBC spacing · 1 per 130 sqft");
  add("fa_device",      A / 350,  "smoke detection + sounders · IS 2189 ~1 per 350 sqft — FLSS refurbishment scope (LIFE hole #1)");
  if (z.data) add("data_drop", z.data, "seat/room count");
  add("elv_device", (z.elv || 0) + A / 150, "access/CCTV/AV · 1 per 150 sqft" + (z.elv ? " + room devices" : ""));
  if (z.db) add("db_panel", z.db, "distribution boards · design count");
  if (z.id === "hub_room") add("network_rack", 2, "server room racks — data package");

  // kitchen & dishwash package (contract exhibits: equipment, SS works,
  // drainage, exhaust — proxy rates until the as-sold BOQ V5 is read)
  if (z.kitchen) {
    const kadd=(code,qty,note)=>T.push({ id:z.id+":kitchen_"+code, code, zone:z.id,
      qty:Math.round(qty), conf:"low", src:note });
    kadd("cpvc_pipe",   60,  "kitchen drainage + trenching · contract kitchen package, confirm");
    kadd("duct_gi",     450, "kitchen exhaust ducting · contract kitchen package, confirm");
    kadd("kitchen_hood", 2,  "SS exhaust hoods + MUA tie-in · contract kitchen package (panel D5), confirm");
    kadd("joinery_panel", 14, "SS counters & kitchen works · proxy rate, confirm");
    kadd("sanitary_fixture", 4, "dishwash fixtures & sinks · contract kitchen package, confirm");
  }

  // closeout
  add("final_clean", M, "full zone");
  return T;
}

// site-wide tasks — the pre-construction runway + system-level work
// (PERT corpus + the live design thread: R9 at ~90%, GFC being chased)
const SITE_TASKS = [
  ["mobilisation",       3, "site setup, labour, temporary works — KT: mobilise day 1", "high"],
  ["gfc_pack",          12, "remaining GFC issue + formal approval — design thread 11 Jul: R9 pending sign-off", "med"],
  ["samples_mockups",    5, "sampling day ~Tue 14 Jul + approvals — internal WhatsApp", "med"],
  ["pest_control",       4, "post strip-out, before civil — BFIL 3d / TCS 5d", "high"],
  ["temporary_lighting", 3, "temporary power & lighting for trades", "high"],
  ["odu_unit",           3, "VRF outdoor units — terrace/service area · KT: ODU lead 8-10wk CRITICAL (D8), qty from HVAC design, CONFIRM", "low"],
  ["protection_covering",2, "protect finished floors before furniture waves", "high"],
  ["tc_electrical",      3, "panel + circuits T&C", "high"],
  ["tc_hvac",            2, "HVAC T&C incl. dry run", "high"],
  ["tc_plumbing",        2, "pipe test + commissioning", "high"],
  ["tc_fire",            4, "sprinkler + FA T&C — FLSS refurbishment scope", "high"],
  ["tc_elv",             3, "data/ELV T&C — validate reused CAT6A with Kohler IT", "med"],
  ["signage_evac",       2, "extinguishers, exit signage, evacuation maps — in scope per contract", "high"],
  ["snag_cycle",        10, "pre-snag, consultant snag, de-snag, verification — course norm 2-4wk overlapped", "high"],
  ["handover_file",      8, "as-builts, O&M, test certs, warranties — collection starts at PO stage; feeds Kohler's NOC file", "high"],
  ["fm_training",        2, "FM training on commissioned systems, recorded", "high"],
];
function siteTasks() {
  return SITE_TASKS.map(([code, days, note, conf]) => ({
    id: "site:" + code, code, zone: "site", qty: days, conf, src: note }));
}
function buildTasks() {
  let T = [];
  ZONES.forEach(z => { T = T.concat(zoneTasks(z)); });
  T = T.concat(siteTasks());
  // the enabling chain (his point 9): design, client approvals, POs,
  // submittals, manufacture, deliveries — dated tasks, engine-general
  const present = new Set(T.map(t => t.code));
  T = T.concat(SEQ.enablingTasks(present));
  // design disciplines (Emirates): draw -> approve -> release the trade
  T = T.concat(SEQ.drawingTasks(present));
  return T;
}

// quantity lookup for the UI (schedule() output doesn't carry qty)
function qtyMap() {
  const m = {};
  buildTasks().forEach(t => m[t.id] = { qty: t.qty, conf: t.conf, src: t.src });
  return m;
}

const PROJECT = {
  id: "kohler-pune-7f",
  name: "Kohler · Pune 7F",
  sub: "Design & build fit-out · 11,900 sq ft",
  carpetSqft: 11900,
  areas: { deck: 11900, boq: 14400 },   // the two competing area bases
  hasBoq: true,
  boqRef: "PROJ_BOQ",
  defaults: { intStart: "2026-07-01", extStart: "2026-07-01", extEnd: "2026-10-29" },
  actors: ["Vikash","Prafull Tale","Prince Kumar","Sagar Shivaji","Md. Gufran","Shagun Gupta","Shubhangi Satpute"],
  team: { Design:"Shagun Gupta", Execution:"Sagar Shivaji", MEP:"Md. Gufran", Purchase:"Prince Kumar", Commercial:"Shubhangi Satpute" },
  escalation: ["Atish Parganiha (AVP-Ops)","Tarun Kondepudi (HOD-Ops)","Ashish Kumar (Director-Ops)","Abhijeet Pawar (Director-Business)"],
  spm: "Prafull Tale",
  shellHold: true, // occupied 4-floor HQ + KT "cleared shell handover" — trades wait for demolition
  kt: {
    docName:"Kohler_KT_Internal.docx (BD → Ops handover)",
    clock:{ basis:"advance received", days:120, phase1Days:30 },
    ld:"0.5%/week on the UNPERFORMED portion, cap 5% (GCC Cl.38, signed contract) · DLP 6 months",
    raGates:[ // baskets completed per panel D9 — a gate description names work its basket must carry
      { ra:"RA1", day:45,  pay:"20%", gate:"demolition, partition framing, civil walls + plaster, plumbing first fix, conduiting & raceway",
        codes:["demo_floor_finish","demo_ceiling","demo_partition","gi_stud_frame","board_one_face","blockwork","plaster","conduit","cpvc_pipe","floor_raceway"] },
      { ra:"RA2", day:70,  pay:"15%", gate:"partitions closed both sides, electrical wiring, fire sprinkler piping + FA loop wiring",
        codes:["board_close","circuit_wiring","cable_pull","sprinkler_pipe"] },  // FA loop WIRING = cable_pull; devices are second-fix (RA4)
      { ra:"RA3", day:85,  pay:"15%", gate:"paint base-coat, HVAC duct installation, false-ceiling framing, glazing channel",
        codes:["putty_primer","duct_gi","ceiling_grid_tile","glazing_partition"] },
      { ra:"RA4", day:110, pay:"15%", gate:"switches/sockets, sanitary fixtures, carpentry ready, flush doors, first coat, false ceiling",
        codes:["wiring_point","sanitary_fixture","door_install","joinery_panel","ceiling_gypsum","ceiling_tiles","paint_emulsion","fa_device"] },
      { ra:"RA5", day:120, pay:"5%",  gate:"T&C complete, snags closed, handover documentation — released against BG",
        codes:["tc_electrical","tc_hvac","tc_plumbing","tc_fire","tc_elv","snag_cycle","final_clean","fm_training","signage_evac","handover_file","paint_final"] },
    ],
    sweep:{ date:"11 Jul 2026", took:"signed contract (RA days 45/70/85/110/120 + LD Cl.38 + night-work rule) · KT note · SOW · MOM #1 + #2 · design thread to 11 Jul (layout R9, GFC gated on formal sign-off) · daily-updates + internal WhatsApp · contacts", blocked:"FS V5 BOQ xlsx (19.6 MB > read limit — drop it in the project folder and say refresh) · [EXT] WhatsApp zip (20 MB) · site pictures, base-building DWGs (need the file reader)" },
    areaEvidence:"KT note: client documents carry 14,905 sqft built-up as cushion; our own ordering and QA run on ~11,900 sqft carpet",
    buffers:{
      cable_pull:"~100% CAT6A reuse expected — validate live ports with Kohler IT (Mayur Bhalodiya), buy minimal new",
      data_drop:"outlet lines carried as billing buffer — reuse existing, validate with Kohler IT",
      sprinkler_pipe:"FLSS is refurbishment with minimum modification — actuals well below BOQ",
      duct_gi:"BOQ duct/copper deliberately high — order at actual after GFC take-off; existing AC salvaged, complete new AC supplied",
      light_fixture:"order at actual from GFC after reconciling fixtures, wiring points and decorative lighting",
      demo_partition:"demolition/debris carried as billing buffer — salvage vendor removes debris in the strip-out"
    },
    extraQueries:[
      { id:"Q-KT-OPTIONS", sev:"high", owner:"Design",
        text:"Design sign-off: client email (10 Jul) lists Design Finalization as Done and Aditi gave a verbal go-ahead for building submittals (8 Jul) — but the FORMAL sign-off on layout R9 + 3D is still pending, and GFC cannot start without it. Sampling day on site ~Tue 14 Jul. Confirm the formal sign-off date.",
        impact:"md_cabin, cafeteria, all zones" },
      { id:"Q-KT-GFC", sev:"high", owner:"Design",
        text:"GFC drawings gate the whole chain: Vivek (10 Jul) — 'for the drawing, GFC we need your support, try to close it ASAP'. GFC waits on the formal R9 + 3D approval; it also unlocks drawing-true quantities in this engine (most quantity queries close themselves).",
        impact:"all zones" },
      { id:"Q-KT-R9", sev:"high", owner:"Design",
        text:"Layout R9 changes scope vs the deck this plan is built on: reception gets a 100mm level drop + 1:10 ramp (civil work back in), dishwash area +140 sqft for a future industrial dishwasher, cafeteria seat count reduced, Bain Marie 5 to 7, a 150mm stage platform added, HOD area has 2 options (option 1 turns collab into product display), washroom doors shifted, and MOM #2 says no raised floor. Share the R9 zone areas (or the GFC) so the engine re-draws its zones.",
        impact:"reception, cafeteria, hod_cabins, collab, washrooms, hub_room" },
      { id:"Q-KT-SALVAGE", sev:"high", owner:"Execution",
        text:"Salvage audit + tagging must run BEFORE demolition (chairs, AC cassettes, glass + DORMA hardware, LED panels, steel racks) with three salvage-vendor visits — debris removal rides on the salvage vendor. Confirm it sits inside the day 1–3 mobilisation window.",
        impact:"demolition, all zones" },
      { id:"Q-KT-SANITARY", sev:"med", owner:"Purchase",
        text:"Kohler free-issues all sanitaryware (install-only in our scope) — we must issue Kohler the required-material list early or the washroom chain waits on it. Confirm the list has gone.",
        impact:"washrooms, pantry" }
    ],
    raOrders:[
      ["HVAC package","by RA1"],["Fire alarm","by RA1"],["Carpentry","by RA1"],
      ["Modular furniture + chairs","by RA2"],["Carpet","by RA2"],["Glass partitions","by RA2"],
      ["Sanitaryware required-material list to Kohler","immediately — free-issue dependency"]
    ],
    clientDeps:[
      ["Formal sign-off: layout R9 + 3D views","immediate — GFC drawings follow this sign-off"],
      ["MD cabin & cafeteria option selection + Phase-1 sample approvals","within 2-3 days of the on-site sampling review"],
      ["As-built drawings of the existing floor","this week — required to complete remaining layouts"],
      ["Sanitaryware free-issue delivery (material list already submitted)","on site by mid-September (RA3 stage)"],
      ["Gate & dock protocol + material-movement windows with P5 building management","before mobilisation completes"],
      ["Night / weekend work permissions when requested (contract Cl.10)","48-hour turnaround assumed"],
      ["Fire-NOC amendment for the floor, if triggered — authority approvals are Kohler's scope","after fire T&C; we hand over FLSS test certificates and completion evidence"],
    ],
    contacts:[
      ["Vivek Kokare","Kohler Strategic Sourcing — primary"],
      ["Aditi Gaikwad","Kohler ITC design coordination"],
      ["Mayur Bhalodiya","Kohler IT — cable & live-port validation"],
      ["Madhukar Tarade","Kohler Facilities"],
      ["Sujay M · Yogesh P · Vinay J · Harshal P","Kohler review group (daily 10:30 call)"]
    ],
    siteNotes:"Night/holiday work needs the Employer's PRIOR written permission (GCC Cl.10) — no rate premium, noise limits · client runs a DAILY 10:30 progress call + plan-of-the-day in the WhatsApp group · No mathadi labour in Magarpatta — plan own labour for unloading · occupied 4-floor HQ: dust/noise control, timed material movement, night/weekend work likely · existing columns retained as cafeteria feature seating · Kohler owns authority approvals and as-built drawings"
  },

  extraInputs: [
    { name:"Signed contract Proc-C-INDIA-42719-2026", status:"read",
      took:"effective 30 Jun, signed 29 Jun (Pawar / Bondre) · Schedule-3 RA gates: RA1 d45 20% (demo+frames+civil+plumbing first fix) · RA2 d70 15% (partitions closed, wiring, sprinklers) · RA3 d85 15% (base-coat, ducting, ceiling framing) · RA4 d110 15% (switches, sanitary, doors, first coat) · RA5 d120 5% vs BG · LD Cl.38 = 0.5%/wk on UNPERFORMED portion cap 5% · night/holiday work needs prior written permission (Cl.10) · payment 15 days, PF/ESI proof per bill", conf:"high" },
    { name:"MOMs #1+#2 & design thread (to 11 Jul)", status:"read",
      took:"layout at R9, verbal go-ahead for submittals (Aditi 8 Jul), FORMAL sign-off pending — GFC gated on it, client chasing ASAP · R9 scope shifts: reception level drop is back, dishwash +140 sqft, cafeteria seats reduced, stage platform, HOD 2 options, no raised floor (MOM#2) · many client asks tagged cost-will-increase = VO candidates under lumpsum · 3D at ~90%, tracker live · sampling day ~Tue 14 Jul", conf:"high" },
    { name:"KT note — BD→Ops handover", status:"read",
      took:"120-day clock from advance · Phase-1 cleared shell by day 30 · LD 0.5%/wk cap 5% (GCC Cl.38) · RA1–RA5 stages · area: orders & QA on 11,900 carpet, 14,905 is client-doc cushion · BOQ buffers named (electrical, duct/copper, CAT6A, demolition) · sanitaryware free-issue, list to Kohler · salvage audit before demo · MD cabin + cafeteria options unfrozen", conf:"high" },
    { name:"Contract exhibits (Drive)", status:"read",
      took:"lump-sum turnkey D&B · VO + EOT regime (baseline freeze matters) · sanitary INSTALL in our scope, fixtures by Kohler · kitchen & dishwash package incl. equipment + SS works · signage, graphics, planters in scope", conf:"high" },
    { name:"Team & escalation (Drive)", status:"read",
      took:"SPM Prafull Tale · C&I Sagar · MEP Gufran · Design Shagun · 4-level escalation to Abhijeet Pawar", conf:"high" },
    { name:"As-sold BOQ FS V5 (Drive)", status:"pending",
      took:"xlsx now exists in Drive (19.6 MB) but is over the reader's 10 MB limit — drop the file into the project folder and say 'refresh'; preamble read: IS-1200 measurement, net-as-fixed, basic rates schedule", conf:"" },
    { name:"Site pictures & WhatsApp [EXT] chat", status:"pending",
      took:"19+ site photos and the 20 MB client chat export are beyond this reader — salvage-relevant photos already summarised in the KT note", conf:"" },
    { name:"Team schedule V2 (Drive)", status:"read",
      took:"27 phases over 120 days — shown as reference on Long-lead & critical", conf:"med" },
  ],
  teamSchedule: [
    ["Mobilisation & site setup",1,7],["Shop drawings & coordination",1,14],["Procurement release (long leads)",1,14],
    ["Demolition & debris",7,26],["Partitions & masonry, screed",18,40],["Waterproofing",28,42],
    ["HVAC first fix (+kitchen exhaust)",22,60],["Electrical first fix",22,55],["Fire & FA rough-in",25,58],
    ["Plumbing first fix",25,55],["Kitchen infrastructure",30,50],["AV first fix",30,55],
    ["Ceiling framework",50,72],["Flooring",60,82],["Joinery & feature elements",70,95],
    ["Painting & graphics",78,100],["Glass installation",80,98],["Electrical second fix",85,105],
    ["Kitchen equipment install",85,100],["HVAC balancing",88,106],["Furniture installation",96,112],
    ["Technology & AV hardware",98,112],["QAQC / T&C",108,116],["Snag closure",114,118],["Handover",118,120],
  ],
  zones: ZONES,
  buildTasks, qtyMap,
  version: "v0 — deck areas × standard factors; PE-4 replaces with BOQ-read quantities",
};

(function (g) {
  g.PROJ_KOHLER = PROJECT;
  g.PROJ_REGISTRY = g.PROJ_REGISTRY || [];
  g.PROJ_REGISTRY.push(PROJECT);
})(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = PROJECT;

})();
