// ===================================================================
// DnB-OS . platform/signals/checklist.js . THE THINGS THERE ARE TO SEE
// There are only so many things a fit-out floor can be showing. This is
// that list, closed and declared. Every picture — a 3D render, a daily
// site photo — is put through the WHOLE list, and every item comes back
// present, absent, or cannot-tell. That is what makes "we did not miss
// anything" a fact rather than a hope.
//
//   ITEMS                 the closed list, tagged by discipline
//   forDiscipline(id)     the items a trade is responsible for
//   stagesOf(itemId)      the states that item passes through, in order
//   hiddenBy(itemId)      what, once finished, makes it unseeable
//   coverage(answers)     what a set of answers did and did not settle
//   ANSWERS               yes | no | cannot_tell — and nothing else
//
// THE LAWS
//   . NEVER ASK "WHAT DO YOU SEE". Ask, for every item on this list, "is
//     it there". An open question returns what happened to catch the eye;
//     a closed one returns the thing nobody thought to mention.
//   . THREE ANSWERS, NEVER TWO. "cannot_tell" is the one that keeps the
//     engine honest — out of frame, too dark, behind a stack of boards,
//     or covered over for good. A missing third answer turns every
//     invisible thing into a missing thing.
//   . ONCE IT IS COVERED, IT IS COVERED FOREVER. A duct above a closed
//     ceiling is not "not done", it is unresolvable by any camera on this
//     floor, and it must have been confirmed BEFORE the cover went on.
//     `hiddenBy` is what lets the engine say that at plan time.
//   . STAGES, NOT DONE/NOT-DONE. Mid-build is the only state a site is
//     ever in. An item with no stage ladder can only be scored wrongly.
//   . AN ITEM NOT ON THIS LIST IS REPORTED, NOT FILED. Seeing something
//     the list does not name is a finding about the list.
//
// Pure: declarations and lookups. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

const ANSWERS = ["yes", "no", "cannot_tell"];

// ---- what a visible thing is, in the plan's own words ------------------
// A VISUAL SIGNAL MUST TRACE TO A WORK SIGNAL, or it can never be called
// late. The checklist asks what a camera sees; the plan schedules task
// codes; this is the join. Three honest cases:
//   codes: [...]  the task codes this item is evidence of. Several,
//                 because "flooring_finish" is carpet in one room and
//                 vitrified tile in the next, and only the plan for that
//                 area says which.
//   codes: []     seen, but not scheduled work — PPE, housekeeping, the
//                 number of people on site. Real findings, never late.
//   stageOf: x    not a task but a STAGE of one. A boarded-one-side
//                 partition is not a separate job; scoring it against a
//                 date of its own would invent a milestone nobody set.
const TASK = {
  demolition:      { codes: ["demo_partition", "demo_ceiling", "demo_floor_finish"] },
  blockwork:       { codes: ["blockwork"] },
  plaster:         { codes: ["plaster", "pop_punning"] },
  screed:          { codes: ["screed", "self_leveling"] },
  waterproofing:   { codes: ["waterproofing"] },
  core_cut:        { codes: ["core_cut"] },
  stud_frame:      { codes: ["gi_stud_frame"] },
  board_one_side:  { stageOf: "gi_stud_frame", why: "a partition boarded on one face is mid-task, not a task" },
  gypsum_board:    { codes: ["board_close", "partition_tape"] },
  glass_partition: { codes: ["glazing_partition"] },
  door_frame:      { stageOf: "door_install", why: "a frame with no shutter is the door task half done" },
  ceiling_grid:    { stageOf: "ceiling_grid_tile", why: "the grid is the first half of the ceiling task" },
  ceiling_tile:    { codes: ["ceiling_grid_tile", "ceiling_gypsum", "ceiling_tiles", "metal_ceiling", "stretch_ceiling"] },
  cove_pelmet:     { codes: ["ceiling_gypsum"] },
  ceiling_cutouts: { stageOf: "ceiling_grid_tile", why: "cutouts are made during ceiling work, not after it" },
  flooring_finish: { codes: ["carpet_tile", "vinyl_lvt", "tile_vitrified", "stone_marble", "epoxy_flooring"] },
  raised_floor:    { codes: ["raised_floor"] },
  skirting:        { codes: ["skirting"] },
  floor_protect:   { codes: [], why: "protection is site practice, not a scheduled task" },
  paint:           { codes: ["paint_emulsion", "putty_primer", "paint_final", "texture_paint"] },
  wall_finish:     { codes: ["joinery_panel", "fluted_panel", "lacquered_glass", "wall_dado"] },
  acoustic_panel:  { codes: ["joinery_panel"] },
  wallpaper:       { codes: ["wallpaper"] },
  carcass:         { stageOf: "joinery_panel", why: "a raw carcass is joinery in progress" },
  joinery_finish:  { codes: ["joinery_panel"] },
  counter:         { codes: ["joinery_panel"] },
  door_shutter:    { codes: ["door_install", "fire_door"] },
  workstation:     { codes: ["workstation"] },
  loose_furniture: { codes: ["storage_unit"] },
  storage_unit:    { codes: ["storage_unit"] },
  signage:         { codes: ["signage_evac"] },
  manifestation:   { codes: ["blinds_film"] },
  duct:            { codes: ["duct_gi"] },
  duct_insulation: { codes: ["duct_insulation"] },
  indoor_unit:     { codes: ["fcu_unit", "vav_unit"] },
  grille:          { codes: ["grille_diffuser"] },
  copper_piping:   { codes: ["refnet_pipe"] },
  conduit:         { codes: ["conduit"] },
  cable_tray:      { codes: ["conduit"] },
  wiring:          { codes: ["cable_pull", "wiring_point", "circuit_wiring"] },
  db_panel:        { codes: ["db_panel"] },
  light_fitting:   { codes: ["light_fixture"] },
  switch_socket:   { codes: ["wiring_point"] },
  plumbing_line:   { codes: ["cpvc_pipe"] },
  sanitaryware:    { codes: ["sanitary_fixture"] },
  cubicle:         { codes: ["toilet_cubicle"] },
  data_cabling:    { codes: ["data_drop"] },
  rack:            { codes: ["network_rack"] },
  access_point:    { codes: ["data_drop"] },
  sprinkler_pipe:  { codes: ["sprinkler_pipe"] },
  sprinkler_head:  { codes: ["sprinkler_head"] },
  hydrant:         { codes: ["sprinkler_head"] },
  fa_device:       { codes: ["fa_device"] },
  fa_panel:        { codes: ["fa_device"] },
  pa_speaker:      { codes: ["pa_system"] },
  acs_device:      { codes: ["elv_device"] },
  cctv_camera:     { codes: ["elv_device"] },
  av_display:      { codes: ["av_system"] },
  gas_suppression: { codes: ["gas_suppression"] },
  ppe:             { codes: [], why: "safety is observed every day and is never late" },
  edge_protection: { codes: [], why: "safety is observed every day and is never late" },
  scaffold:        { codes: [], why: "access equipment is a site condition, not a task" },
  housekeeping:    { codes: [], why: "a site condition — it gates tomorrow's trade but has no date of its own" },
  hot_work:        { codes: [], why: "a permit condition observed on the day" },
  manpower:        { codes: [], why: "people counted, not work scheduled" },
  material_onsite: { codes: [], why: "delivery is tracked by the material plan, not by a task date" },
};

// the task codes an item is evidence of, or an honest empty answer
function codesFor(id) {
  const t = TASK[id];
  if (!t) return { codes: [], why: "no join is declared between " + id + " and any task code — " +
    "it can be observed but never called late" };
  if (t.stageOf) return { codes: [t.stageOf], stage: true,
    why: id + " is a stage of " + t.stageOf + ", not a task of its own: " + t.why };
  if (!t.codes.length) return { codes: [], why: t.why };
  return { codes: t.codes.slice() };
}

// the stage ladders. A fit-out item is mid-build almost all of the time,
// so the ladder — not a percentage — is what a picture can actually settle.
const LADDER = {
  buildup:   ["not_started", "set_out", "in_progress", "complete", "snagged", "made_good"],
  service:   ["not_started", "rough_in", "tested", "concealed", "terminated", "commissioned"],
  finish:    ["not_started", "substrate", "applied", "complete", "snagged", "made_good"],
  fitment:   ["not_started", "delivered", "installed", "aligned", "snagged", "made_good"],
  condition: ["absent", "present"],
};

// discipline ids match platform/ingest/trades.js
const ITEMS = [
  // ---- civil -----------------------------------------------------------
  { id: "demolition",     d: "civil",      name: "Demolition and debris removal", ladder: "buildup",
    marks: "broken slab edges, rubble bags, exposed reinforcement", countable: false, where: "any" },
  { id: "blockwork",      d: "civil",      name: "Blockwork / AAC masonry", ladder: "buildup",
    marks: "grey block courses with mortar joints, unplastered", countable: false, where: "any",
    hiddenBy: ["plaster", "wall_finish"] },
  { id: "plaster",        d: "civil",      name: "Plaster / punning", ladder: "finish",
    marks: "flat grey render over blockwork, no joint lines", countable: false, where: "any",
    hiddenBy: ["wall_finish", "paint"] },
  { id: "screed",         d: "civil",      name: "Floor screed / levelling", ladder: "buildup",
    marks: "grey level floor, trowel marks, no finish laid", countable: false, where: "any",
    hiddenBy: ["flooring_finish", "raised_floor"] },
  { id: "waterproofing",  d: "civil",      name: "Waterproofing", ladder: "service",
    marks: "coloured membrane coating, ponding test water", countable: false, where: "wet",
    hiddenBy: ["screed", "flooring_finish"] },
  { id: "core_cut",       d: "civil",      name: "Core cuts and sleeves", ladder: "buildup",
    marks: "round holes through slab or wall, sleeve collars", countable: true, where: "any",
    hiddenBy: ["ceiling_grid", "wall_finish"] },

  // ---- partitions and glazing -----------------------------------------
  { id: "stud_frame",     d: "partition",  name: "GI stud framing", ladder: "buildup",
    marks: "vertical metal studs on track, open cavity visible", countable: false, where: "any",
    hiddenBy: ["board_one_side", "gypsum_board"] },
  { id: "board_one_side", d: "partition",  name: "Boarded one side", ladder: "buildup",
    marks: "board on one face, studs and services visible on the other", countable: false, where: "any",
    hiddenBy: ["gypsum_board"] },
  { id: "gypsum_board",   d: "partition",  name: "Boarded both sides / taped", ladder: "buildup",
    marks: "flat board faces, taped and jointed seams, screw dimples", countable: false, where: "any",
    hiddenBy: ["wall_finish", "paint"] },
  { id: "glass_partition",d: "partition",  name: "Glazed partition", ladder: "fitment",
    marks: "glass panels in mullions or frameless, protective film often on", countable: true, where: "any" },
  { id: "door_frame",     d: "partition",  name: "Door frames", ladder: "fitment",
    marks: "frame fixed in opening, no shutter hung yet", countable: true, where: "any" },

  // ---- ceiling ---------------------------------------------------------
  { id: "ceiling_grid",   d: "ceiling",    name: "False ceiling grid / framing", ladder: "buildup",
    marks: "suspended T-grid or GI framing, services still visible above", countable: false, where: "any",
    hiddenBy: ["ceiling_tile"] },
  { id: "ceiling_tile",   d: "ceiling",    name: "Ceiling boards / tiles / baffles closed", ladder: "buildup",
    marks: "closed ceiling plane, nothing above it visible", countable: false, where: "any" },
  { id: "cove_pelmet",    d: "ceiling",    name: "Cove, pelmet, shadow gap", ladder: "finish",
    marks: "recessed detail at ceiling perimeter, often with LED channel", countable: false, where: "any" },
  { id: "ceiling_cutouts",d: "ceiling",    name: "Ceiling cutouts for services", ladder: "buildup",
    marks: "square or round openings in a closed ceiling, no fitting in yet", countable: true, where: "any" },

  // ---- flooring --------------------------------------------------------
  { id: "flooring_finish",d: "flooring",   name: "Floor finish laid", ladder: "finish",
    marks: "tile, vitrified, carpet, LVT or micro-concrete surface, set pattern", countable: false, where: "any" },
  { id: "raised_floor",   d: "flooring",   name: "Raised access floor", ladder: "buildup",
    marks: "pedestals and panels above slab, void beneath", countable: false, where: "any" },
  { id: "skirting",       d: "flooring",   name: "Skirting", ladder: "finish",
    marks: "continuous strip at wall base, mitred at corners", countable: false, where: "any" },
  { id: "floor_protect",  d: "flooring",   name: "Floor protection", ladder: "condition",
    marks: "sheeting or board taped over a finished floor", countable: false, where: "any" },

  // ---- interior finishes ----------------------------------------------
  { id: "paint",          d: "interior",   name: "Paint / putty / primer", ladder: "finish",
    marks: "uniform colour over board or plaster, cut lines at edges", countable: false, where: "any" },
  { id: "wall_finish",    d: "interior",   name: "Wall cladding — laminate, veneer, fluted, fabric", ladder: "finish",
    marks: "applied panel face with visible joints and grain, not painted board", countable: false, where: "any" },
  { id: "acoustic_panel", d: "interior",   name: "Acoustic panels", ladder: "fitment",
    marks: "fabric or slatted panel with visible absorbent backing", countable: true, where: "closed" },
  { id: "wallpaper",      d: "interior",   name: "Wallpaper / graphics film", ladder: "finish",
    marks: "printed or patterned surface, seams at panel widths", countable: false, where: "any" },

  // ---- carpentry and joinery ------------------------------------------
  { id: "carcass",        d: "carpentry",  name: "Joinery carcass", ladder: "buildup",
    marks: "raw ply or MDF box fixed in place, no shutters or finish", countable: true, where: "any",
    hiddenBy: ["joinery_finish"] },
  { id: "joinery_finish", d: "carpentry",  name: "Joinery finished — shutters, laminate, hardware", ladder: "fitment",
    marks: "faced shutters with handles, edges banded, gaps even", countable: true, where: "any" },
  { id: "counter",        d: "carpentry",  name: "Counters and reception desk", ladder: "fitment",
    marks: "worktop over carcass, edge profile, often stone or solid surface", countable: true, where: "any" },
  { id: "door_shutter",   d: "carpentry",  name: "Door shutters hung", ladder: "fitment",
    marks: "leaf hung on frame, ironmongery fitted", countable: true, where: "any" },

  // ---- modular furniture ----------------------------------------------
  { id: "workstation",    d: "modular",    name: "Workstations", ladder: "fitment",
    marks: "desk runs with legs, screens and wire management", countable: true, where: "open" },
  { id: "loose_furniture",d: "modular",    name: "Loose furniture — chairs, sofas, tables", ladder: "fitment",
    marks: "free-standing pieces, often still wrapped on delivery", countable: true, where: "any" },
  { id: "storage_unit",   d: "modular",    name: "Storage and pedestals", ladder: "fitment",
    marks: "cabinets and drawer units, keys and handles fitted", countable: true, where: "any" },

  // ---- signage ---------------------------------------------------------
  { id: "signage",        d: "signage",    name: "Signage and wayfinding", ladder: "fitment",
    marks: "lettering, room plates, branding elements on wall or glass", countable: true, where: "any" },
  { id: "manifestation",  d: "signage",    name: "Glass manifestation film", ladder: "finish",
    marks: "frosted band or pattern applied to glazing", countable: false, where: "any" },

  // ---- HVAC ------------------------------------------------------------
  { id: "duct",           d: "hvac",       name: "Ducting run", ladder: "service",
    marks: "rectangular GI or spiral duct on supports, flanged joints", countable: false, where: "any",
    hiddenBy: ["ceiling_tile"] },
  { id: "duct_insulation",d: "hvac",       name: "Duct insulation", ladder: "service",
    marks: "foil or nitrile wrap over duct, taped seams", countable: false, where: "any",
    hiddenBy: ["ceiling_tile"] },
  { id: "indoor_unit",    d: "hvac",       name: "Indoor units / FCU / VAV", ladder: "fitment",
    marks: "boxed unit above ceiling or wall mounted, refrigerant and drain connected", countable: true, where: "any",
    hiddenBy: ["ceiling_tile"] },
  { id: "grille",         d: "hvac",       name: "Diffusers and grilles", ladder: "fitment",
    marks: "louvred or slot face set into the ceiling plane", countable: true, where: "any" },
  { id: "copper_piping",  d: "hvac",       name: "Refrigerant / chilled water piping", ladder: "service",
    marks: "insulated copper or MS pipe on hangers, pressure gauge at test", countable: false, where: "any",
    hiddenBy: ["ceiling_tile"] },

  // ---- electrical ------------------------------------------------------
  { id: "conduit",        d: "electrical", name: "Conduiting", ladder: "service",
    marks: "PVC or MS conduit runs, junction boxes at ends", countable: false, where: "any",
    hiddenBy: ["ceiling_tile", "gypsum_board", "plaster", "screed"] },
  { id: "cable_tray",     d: "electrical", name: "Cable tray / raceway", ladder: "service",
    marks: "perforated tray on threaded rods, cables laid and tied", countable: false, where: "any",
    hiddenBy: ["ceiling_tile"] },
  { id: "wiring",         d: "electrical", name: "Wiring pulled", ladder: "service",
    marks: "cable tails at boxes, colour coded, megger tags", countable: false, where: "any",
    hiddenBy: ["ceiling_tile", "gypsum_board"] },
  { id: "db_panel",       d: "electrical", name: "Distribution boards and panels", ladder: "fitment",
    marks: "wall or floor mounted metal enclosure, breakers and labels inside", countable: true, where: "closed" },
  { id: "light_fitting",  d: "electrical", name: "Light fittings", ladder: "fitment",
    marks: "luminaire in ceiling cutout or surface, lens or lamp visible", countable: true, where: "any" },
  { id: "switch_socket",  d: "electrical", name: "Switches and sockets", ladder: "fitment",
    marks: "faceplates on walls, floor boxes in raised floor", countable: true, where: "any" },

  // ---- plumbing --------------------------------------------------------
  { id: "plumbing_line",  d: "plumbing",   name: "Water supply and drainage lines", ladder: "service",
    marks: "CPVC or UPVC pipe runs with clamps, test plugs at ends", countable: false, where: "wet",
    hiddenBy: ["gypsum_board", "screed", "ceiling_tile"] },
  { id: "sanitaryware",   d: "plumbing",   name: "Sanitaryware and fittings", ladder: "fitment",
    marks: "WC, basin, faucet, trap set and sealed", countable: true, where: "wet" },
  { id: "cubicle",        d: "plumbing",   name: "Toilet cubicles", ladder: "fitment",
    marks: "compact laminate panels with pilasters and hardware", countable: true, where: "wet" },

  // ---- networking and low voltage --------------------------------------
  { id: "data_cabling",   d: "network",    name: "Structured cabling", ladder: "service",
    marks: "bundled Cat6 in tray, labelled at both ends", countable: false, where: "any",
    hiddenBy: ["ceiling_tile"] },
  { id: "rack",           d: "network",    name: "Racks and passive termination", ladder: "fitment",
    marks: "floor or wall rack, patch panels dressed, cable manager", countable: true, where: "closed" },
  { id: "access_point",   d: "network",    name: "Wireless access points", ladder: "fitment",
    marks: "flat disc on ceiling with a data tail", countable: true, where: "any" },

  // ---- fire fighting ---------------------------------------------------
  { id: "sprinkler_pipe", d: "fire",       name: "Sprinkler piping", ladder: "service",
    marks: "red or black MS pipe on hangers, pressure gauge during test", countable: false, where: "any",
    hiddenBy: ["ceiling_tile"] },
  { id: "sprinkler_head", d: "fire",       name: "Sprinkler heads / rosettes", ladder: "fitment",
    marks: "pendant head through ceiling with escutcheon", countable: true, where: "any" },
  { id: "hydrant",        d: "fire",       name: "Hydrant, hose reel, extinguisher", ladder: "fitment",
    marks: "red cabinet or cylinder on stand with signage", countable: true, where: "any" },

  // ---- detection, alarm, security, AV ----------------------------------
  { id: "fa_device",      d: "fa",         name: "Fire alarm devices — detectors, hooters, MCP", ladder: "fitment",
    marks: "small ceiling disc, red hooter, break-glass call point", countable: true, where: "any" },
  { id: "fa_panel",       d: "fa",         name: "Fire alarm panel", ladder: "fitment",
    marks: "wall panel with display and zone labels", countable: true, where: "closed" },
  { id: "pa_speaker",     d: "pa",         name: "PA speakers and amplifier", ladder: "fitment",
    marks: "ceiling speaker grille, rack mounted amplifier", countable: true, where: "any" },
  { id: "acs_device",     d: "acs",        name: "Access control — readers, EM locks, barriers", ladder: "fitment",
    marks: "card reader beside a door, lock body on the frame head", countable: true, where: "any" },
  { id: "cctv_camera",    d: "cctv",       name: "CCTV cameras and NVR", ladder: "fitment",
    marks: "dome or bullet camera on ceiling or wall, NVR in rack", countable: true, where: "any" },
  { id: "av_display",     d: "av",         name: "AV displays and VC units", ladder: "fitment",
    marks: "screen on bracket, camera bar, table connectivity plate", countable: true, where: "closed" },
  { id: "gas_suppression",d: "novec",      name: "Gas suppression — cylinders, nozzles", ladder: "fitment",
    marks: "cylinder on bracket, discharge nozzle at ceiling", countable: true, where: "closed" },

  // ---- safety, site condition and people -------------------------------
  { id: "ppe",            d: "statutory",  name: "PPE in use — helmet, shoes, harness, gloves", ladder: "condition",
    marks: "worn by people in frame; count heads without it", countable: true, where: "any" },
  { id: "edge_protection",d: "statutory",  name: "Edge protection, barricading, signage", ladder: "condition",
    marks: "rails, tape, cones, warning boards at openings and shafts", countable: false, where: "any" },
  { id: "scaffold",       d: "statutory",  name: "Scaffold, ladders, access platform", ladder: "condition",
    marks: "tube or mobile tower, tagged, with base plates", countable: true, where: "any" },
  { id: "housekeeping",   d: "statutory",  name: "Housekeeping — debris, storage, blocked routes", ladder: "condition",
    marks: "material stacked in walkways, offcuts, uncovered bins", countable: false, where: "any" },
  { id: "hot_work",       d: "statutory",  name: "Hot work — welding, cutting, permit and screens", ladder: "condition",
    marks: "sparks, screens, extinguisher stationed, permit board", countable: false, where: "any" },
  { id: "manpower",       d: "programme",  name: "People at work, by trade if it can be told", ladder: "condition",
    marks: "count heads; trade from tools, dress and what they are touching", countable: true, where: "any" },
  { id: "material_onsite",d: "commercial", name: "Material stacked on site", ladder: "condition",
    marks: "boxed or bundled goods with maker's marks, still wrapped", countable: true, where: "any" },
];

const BY_ID = {}; ITEMS.forEach(i => BY_ID[i.id] = i);

function forDiscipline(d) { return ITEMS.filter(i => i.d === d); }
function stagesOf(id) { const i = BY_ID[id]; return i ? LADDER[i.ladder].slice() : null; }

// what, once finished, makes this item unresolvable to any camera
function hiddenBy(id) { const i = BY_ID[id]; return i && i.hiddenBy ? i.hiddenBy.slice() : []; }

// the reverse: given an item that is now complete, what did it just bury
function buries(id) { return ITEMS.filter(i => (i.hiddenBy || []).indexOf(id) !== -1).map(i => i.id); }

// ---- what a set of answers settled, and what it did not ----------------
// answers: [{item, answer, stage?, count?, why?}]
function coverage(answers) {
  const seen = {}, bad = [], out = { yes: [], no: [], cannot_tell: [] };
  for (const a of (answers || [])) {
    if (!BY_ID[a.item]) { bad.push({ item: a.item, why: "not on the checklist — reported, not filed" }); continue; }
    if (ANSWERS.indexOf(a.answer) === -1) {
      bad.push({ item: a.item, why: "answer must be one of " + ANSWERS.join(", ") + ", got \"" + a.answer + "\"" }); continue; }
    if (a.stage && stagesOf(a.item).indexOf(a.stage) === -1) {
      bad.push({ item: a.item, why: "\"" + a.stage + "\" is not a stage of " + a.item }); continue; }
    if (a.answer === "cannot_tell" && !a.why) {
      bad.push({ item: a.item, why: "cannot_tell with no reason is the same as not looking" }); continue; }
    seen[a.item] = 1; out[a.answer].push(a);
  }
  const unasked = ITEMS.filter(i => !seen[i.id]).map(i => i.id);
  return { ...out, refused: bad, unasked,
    asked: Object.keys(seen).length, total: ITEMS.length,
    complete: unasked.length === 0,
    why: unasked.length
      ? unasked.length + " of " + ITEMS.length + " checklist items were never asked of this view — the read is partial and says so"
      : null };
}

const CHK = { ITEMS, BY_ID, LADDER, ANSWERS, TASK, codesFor, forDiscipline, stagesOf, hiddenBy, buries, coverage };
root.SIGNAL_CHECKLIST = CHK;
if (typeof module !== "undefined" && module.exports) module.exports = CHK;

})(typeof window !== "undefined" ? window : globalThis);
