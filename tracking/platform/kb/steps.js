// ===================================================================
// DnB-OS . platform/kb/steps.js . HOW EACH PACKAGE IS ACTUALLY BUILT
// A package is not one act. "Blockwork & masonry" is set-out, then blocks,
// then lintels, then curing, then CHASING FOR CONDUIT — which is an
// electrician's job inside a civil package — then the conduit itself, then
// making good. A programme that shows "Blockwork, 49 rooms, 100%" tells a
// PM nothing he can act on; a programme that shows the chasing is done and
// the conduit is not tells him exactly who to ring.
//
// So the third level of the breakdown is the METHOD STATEMENT, not the room.
// Which rooms each step happened in is still known — it is how the per cent
// is computed — but it belongs behind the number, not in front of it.
//
//   STEPS[code]   the ordered steps of that package
//   stepsFor(code)  with shares normalised and order resolved
//
// EACH STEP DECLARES
//   id        stable, so progress can be kept against it
//   name      what a foreman would call it
//   trade     WHO does it. A civil package contains electrical steps and
//             that is the single most useful thing this table says: the
//             chase and the conduit sit inside blockwork because that is
//             when they physically happen, not when the BOQ files them.
//   share     its portion of the package's work. They sum to 1.
//   sees      the checklist items that evidence it, if any can
//   stage     the stage on that item's ladder that means this step is DONE
//   with      the step it runs alongside, where two trades genuinely overlap
//
// THE LAWS
//   . STEPS ARE SEQUENTIAL UNLESS DECLARED OTHERWISE, AND LATER PROVES
//     EARLIER. You cannot plaster a wall you have not chased, so plaster
//     under way means the chasing and the conduit in it are done. This is
//     the same reasoning as platform/core/entail.js, applied within a
//     package instead of across one.
//   . A TRADE TAG IS NOT A RESEQUENCING. Tagging the chase as electrical
//     tells you who to chase; it does NOT move it out of the civil window.
//     Work is ordered by when it physically happens.
//   . WHAT CANNOT BE SEEN IS STILL DECLARED. A step with no `sees` is real
//     work that no camera can confirm — curing, testing, snagging. It is
//     carried at the package's own rate rather than scored at nought.
//   . THE SHARES ARE JUDGEMENT AND THEY SAY SO. They are a practitioner's
//     split of the effort, not a measurement, and every one is arguable in
//     one place rather than buried in an estimate.
// ===================================================================

;(function (root) {

const S = (code, steps) => [code, steps];

const STEPS = Object.fromEntries([

// ---- strip out ---------------------------------------------------------
S("demo_partition", [
  { id: "protect",  name: "Barricading",        trade: "civil", share: .10 },
  { id: "softstrip",name: "Removing fittings",trade: "civil", share: .25, sees: ["demolition"], stage: "in_progress" },
  { id: "isolate",  name: "Making services safe",    trade: "electrical", share: .10 },
  { id: "breakdown",name: "Breaking walls",           trade: "civil", share: .35, sees: ["demolition"], stage: "in_progress" },
  { id: "cartaway", name: "Clearing debris",      trade: "civil", share: .20, sees: ["housekeeping"] },
]),
S("demo_floor_finish", [
  { id: "lift",     name: "Lifting old flooring",      trade: "civil", share: .45, sees: ["demolition"], stage: "in_progress" },
  { id: "chip",     name: "Chipping to slab",          trade: "civil", share: .35 },
  { id: "clean",    name: "Cleaning and level check",             trade: "civil", share: .20, sees: ["housekeeping"] },
]),

// ---- civil -------------------------------------------------------------
// THE PACKAGE A PM MOST NEEDS BROKEN UP. Two of its seven steps belong to
// the electrician, and they are the two that hold up the plaster.
S("blockwork", [
  { id: "setout",   name: "Marking walls",          trade: "civil", share: .06, sees: ["blockwork"], stage: "set_out" },
  { id: "lay",      name: "Laying blocks",                trade: "civil", share: .30, sees: ["blockwork"], stage: "in_progress" },
  { id: "lintel",   name: "Lintels and sills",          trade: "civil", share: .08, sees: ["blockwork"] },
  { id: "cure",     name: "Curing",                          trade: "civil", share: .06 },
  { id: "chase",    name: "Cutting chases for conduit",trade: "electrical", share: .14, sees: ["conduit"] },
  { id: "conduit",  name: "Laying conduit in chases", trade: "electrical", share: .16, sees: ["conduit"], stage: "rough_in" },
  { id: "makegood", name: "Filling chases",   trade: "civil", share: .12 },
  { id: "handover", name: "Wall ready for plaster",     trade: "civil", share: .08, sees: ["blockwork"], stage: "complete" },
]),
S("plaster", [
  { id: "hack",     name: "Surface preparation",   trade: "civil", share: .10 },
  { id: "dots",     name: "Dots and level check",     trade: "civil", share: .10, sees: ["plaster"], stage: "substrate" },
  { id: "coat",     name: "Plastering",                    trade: "civil", share: .45, sees: ["plaster"], stage: "applied" },
  { id: "cure2",    name: "Curing",                          trade: "civil", share: .10 },
  { id: "punning",  name: "POP punning",         trade: "civil", share: .20, sees: ["plaster"], stage: "complete" },
  { id: "snagp",    name: "Snag and make good",                trade: "civil", share: .05, sees: ["plaster"], stage: "made_good" },
]),
S("waterproofing", [
  { id: "prep",     name: "Surface preparation",   trade: "civil", share: .25 },
  { id: "apply",    name: "Laying membrane",            trade: "civil", share: .45, sees: ["waterproofing"], stage: "rough_in" },
  { id: "pond",     name: "Ponding test",         trade: "civil", share: .20, sees: ["waterproofing"], stage: "tested" },
  { id: "protect2", name: "Protection screed",               trade: "civil", share: .10, sees: ["waterproofing"], stage: "concealed" },
]),
S("self_leveling", [
  { id: "primeslab",name: "Priming the slab",                  trade: "civil", share: .15 },
  { id: "pour",     name: "Pouring screed",       trade: "civil", share: .55, sees: ["screed"], stage: "in_progress" },
  { id: "cure3",    name: "Curing",                          trade: "civil", share: .15 },
  { id: "levelchk", name: "Level check",          trade: "civil", share: .15, sees: ["screed"], stage: "complete" },
]),
S("core_cut", [
  { id: "mark",     name: "Marking and scanning",   trade: "civil", share: .30 },
  { id: "cut",      name: "Core cutting",      trade: "civil", share: .50, sees: ["core_cut"], stage: "in_progress" },
  { id: "sleeve",   name: "Sleeving and sealing",              trade: "fire", share: .20, sees: ["core_cut"], stage: "complete" },
]),

// ---- partitions --------------------------------------------------------
S("board_close", [
  { id: "frame",    name: "GI framing",         trade: "drywall", share: .22, sees: ["stud_frame"], stage: "complete" },
  { id: "side1",    name: "First side boarding",                trade: "drywall", share: .18, sees: ["board_one_side"], stage: "complete" },
  { id: "conduitw", name: "Conduit and back boxes",    trade: "electrical", share: .14, sees: ["conduit"], stage: "rough_in" },
  { id: "wirew",    name: "Pulling wires",       trade: "electrical", share: .10, sees: ["wiring"], stage: "rough_in" },
  { id: "rockwool", name: "Rockwool filling",      trade: "drywall", share: .10, sees: [] },
  { id: "side2",    name: "Second side boarding",               trade: "drywall", share: .16, sees: ["gypsum_board"], stage: "complete" },
  { id: "tape",     name: "Taping and jointing",         trade: "drywall", share: .10, sees: ["gypsum_board"], stage: "made_good" },
]),
S("glazing_partition", [
  { id: "survey",   name: "Site survey",      trade: "joinery", share: .10 },
  { id: "delgl",    name: "Glass delivery",    trade: "joinery", share: .12 },
  { id: "trackg",   name: "Track fixing",       trade: "joinery", share: .16 },
  { id: "glassin",  name: "Fixing glass",              trade: "joinery", share: .45, sees: ["glass_partition"], stage: "installed" },
  { id: "sealg",    name: "Sealing and alignment",    trade: "joinery", share: .20, sees: ["glass_partition"], stage: "aligned" },
]),

// ---- services ----------------------------------------------------------
S("conduit", [
  { id: "route",    name: "Marking routes",   trade: "electrical", share: .15 },
  { id: "lay",      name: "Laying conduit",trade: "electrical", share: .50, sees: ["conduit"], stage: "rough_in" },
  { id: "box",      name: "Back boxes",     trade: "electrical", share: .20, sees: ["conduit"] },
  { id: "fishtape", name: "Fish wire and checking",    trade: "electrical", share: .15, sees: ["conduit"], stage: "tested" },
]),
S("cable_pull", [
  { id: "drum",     name: "Setting drums",   trade: "electrical", share: .20, sees: ["cable_tray"] },
  { id: "pulllt",   name: "Light circuit wiring",       trade: "electrical", share: .24, sees: ["wiring"], stage: "rough_in" },
  { id: "pullpw",   name: "Power circuit wiring",       trade: "electrical", share: .21, sees: ["wiring"], stage: "rough_in" },
  { id: "dress",    name: "Dressing and tagging",    trade: "electrical", share: .20, sees: ["wiring"] },
  { id: "megger",   name: "Megger testing",     trade: "electrical", share: .15, sees: ["wiring"], stage: "tested" },
]),
S("wiring_point", [
  { id: "term",     name: "Terminating points",              trade: "electrical", share: .40, sees: ["switch_socket"], stage: "installed" },
  { id: "plate",    name: "Fixing plates",      trade: "electrical", share: .30, sees: ["switch_socket"], stage: "aligned" },
  { id: "circuit",  name: "Circuit testing",     trade: "electrical", share: .20, sees: ["switch_socket"], stage: "snagged" },
  { id: "energise", name: "Energising",             trade: "electrical", share: .10, sees: ["switch_socket"], stage: "made_good" },
]),
S("db_panel", [
  { id: "deldb",    name: "Panel delivery",      trade: "electrical", share: .15 },
  { id: "mount",    name: "Mounting boards",           trade: "electrical", share: .25, sees: ["db_panel"], stage: "installed" },
  { id: "incomer",  name: "Terminations", trade: "electrical", share: .30, sees: ["db_panel"] },
  { id: "schedule", name: "Labelling",    trade: "electrical", share: .15 },
  { id: "testdb",   name: "Testing",          trade: "electrical", share: .20, sees: ["db_panel"], stage: "made_good" },
]),
S("duct_gi", [
  { id: "fab",      name: "Fabrication and delivery",          trade: "hvac", share: .30 },
  { id: "support",  name: "Supports and hangers",              trade: "hvac", share: .15 },
  { id: "erect",    name: "Erecting ducts",        trade: "hvac", share: .30, sees: ["duct"], stage: "rough_in" },
  { id: "leak",     name: "Leak test",                       trade: "hvac", share: .10, sees: ["duct"], stage: "tested" },
  { id: "insul",    name: "Duct insulation",                 trade: "hvac", share: .15, sees: ["duct_insulation"], stage: "concealed" },
]),
S("refnet_pipe", [
  { id: "route2",   name: "Marking routes",        trade: "hvac", share: .20 },
  { id: "braze",    name: "Copper piping",         trade: "hvac", share: .40, sees: ["copper_piping"], stage: "rough_in" },
  { id: "pressure", name: "Pressure test",          trade: "hvac", share: .20, sees: ["copper_piping"], stage: "tested" },
  { id: "draino",   name: "Drain piping",         trade: "hvac", share: .12 },
  { id: "insul2",   name: "Pipe insulation",               trade: "hvac", share: .13, sees: ["copper_piping"], stage: "concealed" },
  { id: "tchvac",   name: "Testing",         trade: "hvac", share: .10 },
]),
S("cpvc_pipe", [
  { id: "routep",   name: "Marking and clamping",        trade: "plumbing", share: .20 },
  { id: "layp",     name: "Laying pipes",          trade: "plumbing", share: .45, sees: ["plumbing_line"], stage: "rough_in" },
  { id: "testp",    name: "Pressure test",     trade: "plumbing", share: .20, sees: ["plumbing_line"], stage: "tested" },
  { id: "chasep",   name: "Chasing and making good",        trade: "civil", share: .15, sees: ["plumbing_line"], stage: "concealed" },
]),
S("data_drop", [
  { id: "traydd",   name: "Trays and conduit",         trade: "elv", share: .20, sees: ["cable_tray"] },
  { id: "pulldd",   name: "Pulling Cat6",     trade: "elv", share: .40, sees: ["data_cabling"], stage: "rough_in" },
  { id: "punch",    name: "Punching down",    trade: "elv", share: .20, sees: ["data_cabling"] },
  { id: "fluke",    name: "Fluke testing",          trade: "elv", share: .20, sees: ["data_cabling"], stage: "tested" },
]),
S("sprinkler_pipe", [
  { id: "routes",   name: "Marking and hangers",          trade: "fire", share: .20 },
  { id: "mains",    name: "Laying pipes",           trade: "fire", share: .40, sees: ["sprinkler_pipe"], stage: "rough_in" },
  { id: "hydro",    name: "Hydro test",                      trade: "fire", share: .20, sees: ["sprinkler_pipe"], stage: "tested" },
  { id: "enamel",   name: "Painting pipes",        trade: "fire", share: .08 },
  { id: "flexi",    name: "Flexible drops", trade: "fire", share: .10 },
  { id: "heads",    name: "Fixing heads",   trade: "fire", share: .12, sees: ["sprinkler_head"], stage: "installed" },
  { id: "tcfire",   name: "Testing",         trade: "fire", share: .10 },
]),
S("floor_raceway", [
  { id: "setr",     name: "Marking raceways",            trade: "electrical", share: .20 },
  { id: "layr",     name: "Laying raceways",    trade: "electrical", share: .50, sees: ["conduit"], stage: "rough_in" },
  { id: "levelr",   name: "Levelling and sealing",          trade: "civil", share: .30, sees: ["conduit"], stage: "concealed" },
]),

// ---- ceilings ----------------------------------------------------------
S("ceiling_gypsum", [
  { id: "levelc",   name: "Level marking", trade: "ceiling", share: .15, sees: ["ceiling_grid"], stage: "set_out" },
  { id: "framec",   name: "Framing",            trade: "ceiling", share: .30, sees: ["ceiling_grid"], stage: "in_progress" },
  { id: "svccoord", name: "Coordinating services", trade: "ceiling", share: .15 },
  { id: "boardc",   name: "Boarding",                    trade: "ceiling", share: .25, sees: ["ceiling_grid"], stage: "complete" },
  { id: "tapec",    name: "Taping and jointing",         trade: "ceiling", share: .15 },
]),
S("ceiling_grid_tile", [
  { id: "delg",     name: "Grid and tile delivery",        trade: "ceiling", share: .10 },
  { id: "levelg",   name: "Level marking",      trade: "ceiling", share: .15, sees: ["ceiling_grid"], stage: "set_out" },
  { id: "gridg",    name: "Erecting grid",       trade: "ceiling", share: .35, sees: ["ceiling_grid"], stage: "complete" },
  { id: "svcg",     name: "Cut-outs for services",     trade: "ceiling", share: .15 },
  { id: "tileg",    name: "Laying tiles",                     trade: "ceiling", share: .30, sees: ["ceiling_tile"], stage: "complete" },
]),

// ---- flooring ----------------------------------------------------------
S("carpet_tile", [
  { id: "subchk",   name: "Substrate check", trade: "flooring", share: .15, sees: ["flooring_finish"], stage: "substrate" },
  { id: "setoutf",  name: "Setting out",               trade: "flooring", share: .15 },
  { id: "glue",     name: "Laying carpet",          trade: "flooring", share: .50, sees: ["flooring_finish"], stage: "applied" },
  { id: "trimf",    name: "Trims and cleaning",       trade: "flooring", share: .20, sees: ["flooring_finish"], stage: "complete" },
]),
S("vinyl_lvt", [
  { id: "subchk2",  name: "Substrate and primer",        trade: "flooring", share: .20, sees: ["flooring_finish"], stage: "substrate" },
  { id: "layv",     name: "Laying vinyl",                      trade: "flooring", share: .55, sees: ["flooring_finish"], stage: "applied" },
  { id: "weldv",    name: "Welding and trims",          trade: "flooring", share: .25, sees: ["flooring_finish"], stage: "complete" },
]),
S("raised_floor", [
  { id: "gridr",    name: "Pedestals and levelling",       trade: "flooring", share: .40, sees: ["raised_floor"], stage: "in_progress" },
  { id: "panelr",   name: "Laying panels",                    trade: "flooring", share: .30, sees: ["raised_floor"], stage: "complete" },
  { id: "cutoutr",  name: "Cut-outs for power", trade: "electrical", share: .15 },
  { id: "checkr",   name: "Alignment and lock down", trade: "flooring", share: .15 },
]),
S("epoxy_flooring", [
  { id: "prepe",    name: "Grinding and priming",              trade: "flooring", share: .30 },
  { id: "coate",    name: "Epoxy coats",                     trade: "flooring", share: .50, sees: ["flooring_finish"], stage: "applied" },
  { id: "cure4",    name: "Curing and protection",             trade: "flooring", share: .20, sees: ["floor_protect"] },
]),
S("wall_dado", [
  { id: "setd",     name: "Setting out",             trade: "flooring", share: .20 },
  { id: "fixd",     name: "Fixing tiles",                     trade: "flooring", share: .55, sees: ["wall_finish"], stage: "applied" },
  { id: "groutd",   name: "Grouting",             trade: "flooring", share: .25, sees: ["wall_finish"], stage: "complete" },
]),
S("skirting", [
  { id: "cutsk",    name: "Cutting",               trade: "joinery", share: .30 },
  { id: "fixsk",    name: "Fixing skirting",                  trade: "joinery", share: .45, sees: ["skirting"], stage: "applied" },
  { id: "finsk",    name: "Filling and sanding",     trade: "joinery", share: .25, sees: ["skirting"], stage: "made_good" },
]),

// ---- finishes ----------------------------------------------------------
S("putty_primer", [
  { id: "sand",     name: "Sanding",      trade: "painting", share: .25, sees: ["paint"], stage: "substrate" },
  { id: "putty",    name: "Putty",               trade: "painting", share: .45 },
  { id: "prime",    name: "Primer",                     trade: "painting", share: .30, sees: ["paint"], stage: "substrate" },
]),
// THE PERT RUNS WALLS AND CEILING AS TWO STREAMS, and it is right to: they
// are different gangs, different access and different days, and a single
// "painting 60%" hides which of the two is holding up the handover.
S("paint_emulsion", [
  { id: "mask",     name: "Masking",            trade: "painting", share: .08 },
  { id: "wsand",    name: "Wall primer and sanding",        trade: "painting", share: .12, sees: ["paint"], stage: "substrate" },
  { id: "wcoat1",   name: "Wall first coat",              trade: "painting", share: .18, sees: ["paint"], stage: "applied" },
  { id: "wcoat2",   name: "Wall second coat",             trade: "painting", share: .18, sees: ["paint"], stage: "complete" },
  { id: "csand",    name: "Ceiling primer and sanding",      trade: "painting", share: .10 },
  { id: "ccoat1",   name: "Ceiling first coat",            trade: "painting", share: .13 },
  { id: "ccoat2",   name: "Ceiling second coat",           trade: "painting", share: .13 },
  { id: "duct",     name: "Duct painting",               trade: "painting", share: .04 },
  { id: "touch",    name: "Touch up",           trade: "painting", share: .04, sees: ["paint"], stage: "made_good" },
]),
S("joinery_panel", [
  { id: "shop",     name: "Shop drawings",      trade: "joinery", share: .10 },
  { id: "fabj",     name: "Factory work",            trade: "joinery", share: .25 },
  { id: "groundj",  name: "Backing frame",         trade: "joinery", share: .15, sees: ["carcass"], stage: "in_progress" },
  { id: "fixj",     name: "Fixing panels",                    trade: "joinery", share: .30, sees: ["joinery_finish"], stage: "installed" },
  { id: "finj",     name: "Beading and polish",      trade: "joinery", share: .15, sees: ["joinery_finish"], stage: "aligned" },
  { id: "snagj",    name: "Snag and make good",                trade: "joinery", share: .05, sees: ["joinery_finish"], stage: "made_good" },
]),
S("fluted_panel", [
  { id: "groundf",  name: "Grounds and levelling",             trade: "joinery", share: .25, sees: ["carcass"] },
  { id: "fixf",     name: "Fixing panels",  trade: "joinery", share: .50, sees: ["wall_finish"], stage: "applied" },
  { id: "finf",     name: "Trims",               trade: "joinery", share: .25, sees: ["wall_finish"], stage: "complete" },
]),
S("lacquered_glass", [
  { id: "surveyl",  name: "Survey",               trade: "joinery", share: .25 },
  { id: "fixl",     name: "Fixing glass",                    trade: "joinery", share: .50, sees: ["wall_finish"], stage: "applied" },
  { id: "seall",    name: "Sealing",              trade: "joinery", share: .25, sees: ["wall_finish"], stage: "complete" },
]),
S("wallpaper", [
  { id: "prepw",    name: "Base preparation",       trade: "painting", share: .35, sees: ["wall_finish"], stage: "substrate" },
  { id: "hangw",    name: "Hanging paper",                         trade: "painting", share: .45, sees: ["wall_finish"], stage: "applied" },
  { id: "trimw",    name: "Trimming",         trade: "painting", share: .20, sees: ["wall_finish"], stage: "complete" },
]),
S("blinds_film", [
  { id: "measb",    name: "Brackets",        trade: "joinery", share: .35 },
  { id: "instb",    name: "Fixing blinds",       trade: "joinery", share: .45, sees: [], stage: "installed" },
  { id: "opb",      name: "Operation check",      trade: "joinery", share: .20, sees: [], stage: "aligned" },
]),
S("door_install", [
  { id: "framed",   name: "Fixing frames",         trade: "joinery", share: .35, sees: ["door_shutter"], stage: "installed" },
  { id: "shutterd", name: "Hanging shutters",                 trade: "joinery", share: .35, sees: ["door_shutter"], stage: "installed" },
  { id: "ironmg",   name: "Ironmongery",           trade: "joinery", share: .20, sees: ["door_shutter"], stage: "aligned" },
  { id: "snagd",    name: "Alignment",                trade: "joinery", share: .10, sees: ["door_shutter"], stage: "made_good" },
]),

// ---- fitments & second fix ----------------------------------------------
S("workstation", [
  { id: "delw",     name: "Delivery",              trade: "joinery", share: .15, sees: ["workstation"] },
  { id: "legw",     name: "Legs and beams",             trade: "joinery", share: .25 },
  { id: "topw",     name: "Worktops and screens",         trade: "joinery", share: .25, sees: ["workstation"], stage: "installed" },
  { id: "elecw",    name: "Power and data to desk",            trade: "electrical", share: .20, sees: ["switch_socket"] },
  { id: "alignw",   name: "Alignment",                trade: "joinery", share: .15, sees: ["workstation"], stage: "aligned" },
]),
S("storage_unit", [
  { id: "dels",     name: "Delivery",              trade: "joinery", share: .20, sees: ["storage_unit"] },
  { id: "assems",   name: "Assembly",            trade: "joinery", share: .40, sees: ["storage_unit"], stage: "installed" },
  { id: "shutters", name: "Shutters and handles",       trade: "joinery", share: .25, sees: ["storage_unit"], stage: "aligned" },
  { id: "snags",    name: "Snag and make good",                trade: "joinery", share: .15, sees: ["storage_unit"], stage: "made_good" },
]),
S("light_fixture", [
  { id: "cutl",     name: "Cut-outs",              trade: "electrical", share: .20 },
  { id: "instl",    name: "Recessed lights",trade: "electrical", share: .25, sees: ["light_fitting"], stage: "installed" },
  { id: "decol",    name: "Decorative lights",   trade: "electrical", share: .15, sees: ["light_fitting"], stage: "installed" },
  { id: "terml",    name: "Terminations",            trade: "electrical", share: .20, sees: ["light_fitting"] },
  { id: "testl",    name: "Burn in test",           trade: "electrical", share: .20, sees: ["light_fitting"], stage: "aligned" },
]),
S("grille_diffuser", [
  { id: "cutg",     name: "Cut-outs and collars",              trade: "hvac", share: .30 },
  { id: "fixg",     name: "Fixing grills",        trade: "hvac", share: .45, sees: ["grille"], stage: "installed" },
  { id: "balg",     name: "Air balancing",                   trade: "hvac", share: .25, sees: ["grille"], stage: "aligned" },
]),
S("fcu_unit", [
  { id: "hangf",    name: "Hanging units", trade: "hvac", share: .35, sees: ["indoor_unit"], stage: "installed" },
  { id: "connf",    name: "Pipe connections",        trade: "hvac", share: .30, sees: ["indoor_unit"] },
  { id: "elecf",    name: "Power and controls",                trade: "electrical", share: .20 },
  { id: "commf",    name: "Commissioning",                   trade: "hvac", share: .15, sees: ["indoor_unit"], stage: "made_good" },
]),
S("vav_unit", [
  { id: "hangv",    name: "Hanging VAV boxes",                    trade: "hvac", share: .35, sees: ["indoor_unit"], stage: "installed" },
  { id: "ductv",    name: "Duct connections",         trade: "hvac", share: .30, sees: ["duct"] },
  { id: "ctrlv",    name: "Controls wiring",      trade: "electrical", share: .20 },
  { id: "commv",    name: "Commissioning",       trade: "hvac", share: .15 },
]),
S("odu_unit", [
  { id: "baseo",    name: "Base frames",     trade: "hvac", share: .25 },
  { id: "placeo",   name: "Placing units",             trade: "hvac", share: .30, sees: [], stage: "installed" },
  { id: "conno",    name: "Pipe and power",        trade: "hvac", share: .25, sees: [] },
  { id: "chargeo",  name: "Gas charging",    trade: "hvac", share: .20, sees: [], stage: "made_good" },
]),
S("sanitary_fixture", [
  { id: "roughs",   name: "Marking",        trade: "plumbing", share: .20 },
  { id: "fixs",     name: "Fixing fittings",                  trade: "plumbing", share: .45, sees: ["sanitaryware"], stage: "installed" },
  { id: "conns",    name: "Connections",           trade: "plumbing", share: .20, sees: ["sanitaryware"] },
  { id: "tests",    name: "Water test",               trade: "plumbing", share: .15, sees: ["sanitaryware"], stage: "made_good" },
]),
S("toilet_cubicle", [
  { id: "setc",     name: "Setting out",       trade: "joinery", share: .35 },
  { id: "panelc",   name: "Panels and doors",            trade: "joinery", share: .40, sees: ["cubicle"], stage: "installed" },
  { id: "hardc",    name: "Hardware",            trade: "joinery", share: .25, sees: ["cubicle"], stage: "aligned" },
]),
S("fa_device", [
  { id: "cabceil",  name: "Ceiling cabling",           trade: "fire", share: .16 },
  { id: "cabwall",  name: "Wall cabling",trade: "fire", share: .14 },
  { id: "multi",    name: "Smoke detectors",          trade: "fire", share: .18, sees: ["fa_device"], stage: "installed" },
  { id: "heat",     name: "Heat detectors",                  trade: "fire", share: .10, sees: ["fa_device"], stage: "installed" },
  { id: "ri",       name: "Response indicators",             trade: "fire", share: .08 },
  { id: "mcp",      name: "Modules and call points",         trade: "fire", share: .14, sees: ["fa_device"] },
  { id: "commfa",   name: "Panel commissioning", trade: "fire", share: .20, sees: ["fa_device"], stage: "made_good" },
]),
S("elv_device", [
  { id: "backelv",  name: "Back boxes",        trade: "elv", share: .25 },
  { id: "develv",   name: "Fixing cameras and readers",     trade: "elv", share: .35, sees: ["cctv_camera"], stage: "installed" },
  { id: "termelv",  name: "Configuration",     trade: "elv", share: .20, sees: ["cctv_camera"] },
  { id: "commelv",  name: "Commissioning",        trade: "elv", share: .20, sees: ["cctv_camera"], stage: "made_good" },
]),
S("network_rack", [
  { id: "placer",   name: "Placing racks",       trade: "elv", share: .30, sees: ["rack"], stage: "installed" },
  { id: "panelr2",  name: "Patch panels",      trade: "elv", share: .25 },
  { id: "dressr",   name: "Dressing and labelling",      trade: "elv", share: .25, sees: ["rack"], stage: "aligned" },
  { id: "commr",    name: "Testing & handover",              trade: "elv", share: .20 },
]),
S("fire_damper", [
  { id: "fixfd",    name: "Fixing dampers",           trade: "hvac", share: .40, sees: [], stage: "installed" },
  { id: "actfd",    name: "Actuators and wiring",               trade: "electrical", share: .30 },
  { id: "commfd",   name: "Interlock test",  trade: "fire", share: .30, sees: [], stage: "made_good" },
]),
S("toilet_exhaust", [
  { id: "ducte",    name: "Duct and grill",              trade: "hvac", share: .40, sees: ["duct"] },
  { id: "fane",     name: "Fan mounting",           trade: "hvac", share: .35 },
  { id: "teste",    name: "Airflow test",                    trade: "hvac", share: .25 },
]),
S("graphics_planters", [
  { id: "proofg",   name: "Artwork approval",        trade: "joinery", share: .25 },
  { id: "applyg",   name: "Fixing graphics",  trade: "joinery", share: .45, sees: ["signage"], stage: "installed" },
  { id: "plantg",   name: "Placing planters",    trade: "joinery", share: .30, sees: ["signage"], stage: "installed" },
]),
]);


// ===================================================================
// FROM THE LAST-MILE PERT OF A COMPLETED FLIPSPACES FIT-OUT
// Everything below was read out of "PERT CHART.xlsx" — 197 steps under 26
// heads from TCS Coimbatore. Three patterns in it were missing here
// altogether, and each is a way a real programme goes wrong:
//
//   SUPPLY IS A STEP. A UPS, a network rack, grid tiles, glass, gas
//   cylinders — the item arriving is a dated event that slips, and a
//   statement that starts at "install" cannot show the slip until the
//   installer is standing there with nothing to install.
//
//   TESTING AND COMMISSIONING IS A STEP. Every system on that plan ends
//   with one, and it is the step that finds the problem. Rolling it into
//   "install" is how a package reads 100% and then fails a witness test.
//
//   THE HANDOVER PHASE IS WORK. Extinguishers, exit signage, evacuation
//   maps, deep clean — nobody's package, everybody's problem, and the
//   thing that actually stands between practical completion and the keys.
// ===================================================================
const FROM_PERT = Object.fromEntries([

S("ups_battery", [
  { id: "supups",   name: "UPS delivery",    trade: "electrical", share: .30 },
  { id: "instups",  name: "Installing UPS",  trade: "electrical", share: .30 },
  { id: "termups",  name: "Terminations",     trade: "electrical", share: .20 },
  { id: "tcups",    name: "Testing",         trade: "electrical", share: .20 },
]),
S("precision_ac", [
  { id: "suppac",   name: "Delivery",              trade: "hvac", share: .30 },
  { id: "instpac",  name: "Installation",  trade: "hvac", share: .35 },
  { id: "pipepac",  name: "Piping and power",           trade: "hvac", share: .20 },
  { id: "tcpac",    name: "Testing",         trade: "hvac", share: .15 },
]),
S("pa_system", [
  { id: "cabpa",    name: "Cabling",                      trade: "elv", share: .35 },
  { id: "spkpa",    name: "Fixing speakers",            trade: "elv", share: .35, sees: ["pa_speaker"], stage: "installed" },
  { id: "ampa",     name: "Amplifier and zones",         trade: "elv", share: .15 },
  { id: "tcpa",     name: "Testing",         trade: "elv", share: .15, sees: ["pa_speaker"], stage: "made_good" },
]),
S("wld_system", [
  { id: "condwld",  name: "Conduit and raceway",            trade: "elv", share: .25 },
  { id: "cabwld",   name: "Cabling",                         trade: "elv", share: .25 },
  { id: "devwld",   name: "Fixing devices",         trade: "elv", share: .30 },
  { id: "tcwld",    name: "Testing",         trade: "elv", share: .20 },
]),
S("rodent_system", [
  { id: "condrod",  name: "Conduit and raceway",            trade: "elv", share: .25 },
  { id: "cabrod",   name: "Cabling",                         trade: "elv", share: .25 },
  { id: "devrod",   name: "Fixing devices",   trade: "elv", share: .30 },
  { id: "tcrod",    name: "Testing",         trade: "elv", share: .20 },
]),
S("gas_suppression", [
  { id: "supgas",   name: "Delivery",     trade: "fire", share: .30 },
  { id: "pipegas",  name: "Piping and nozzles",    trade: "fire", share: .30, sees: ["gas_suppression"], stage: "installed" },
  { id: "detgas",   name: "Detection wiring",        trade: "fire", share: .20 },
  { id: "tcgas",    name: "Testing",         trade: "fire", share: .20, sees: ["gas_suppression"], stage: "made_good" },
]),
S("network_rack", [
  { id: "supfib",   name: "Fibre delivery",trade: "elv", share: .18 },
  { id: "suprack",  name: "Rack delivery",         trade: "elv", share: .14 },
  { id: "placer",   name: "Placing racks",       trade: "elv", share: .20, sees: ["rack"], stage: "installed" },
  { id: "panelr2",  name: "Patch panels",      trade: "elv", share: .16 },
  { id: "backbone", name: "Fibre termination",    trade: "elv", share: .16 },
  { id: "commr",    name: "Testing",         trade: "elv", share: .16 },
]),
S("white_goods", [
  { id: "supwg",    name: "Delivery",           trade: "closeout", share: .45 },
  { id: "instwg",   name: "Installation",       trade: "closeout", share: .35 },
  { id: "tcwg",     name: "Function check",       trade: "closeout", share: .20 },
]),
S("av_system", [
  { id: "supav",    name: "Delivery",     trade: "elv", share: .30 },
  { id: "mountav",  name: "Fixing displays",    trade: "elv", share: .25, sees: ["av_display"], stage: "installed" },
  { id: "cabav",    name: "Cabling",      trade: "elv", share: .25 },
  { id: "tcav",     name: "Testing and calibration", trade: "elv", share: .20, sees: ["av_display"], stage: "made_good" },
]),

// ---- the steps nobody owns, which is why they slip ----------------------
S("lineout_marking", [
  { id: "mark",     name: "Marking to drawing",         trade: "civil", share: .55 },
  { id: "check",    name: "Checking and approval",  trade: "civil", share: .45 },
]),
S("temporary_lighting", [
  { id: "tempdb",   name: "Temporary board",           trade: "electrical", share: .40 },
  { id: "templt",   name: "Lights and sockets",    trade: "electrical", share: .40 },
  { id: "tempsafe", name: "Earthing check",         trade: "electrical", share: .20 },
]),
S("pest_control", [
  { id: "pestprep", name: "Preparing surfaces",        trade: "civil", share: .30 },
  { id: "pestdose", name: "Anti termite dosing",             trade: "civil", share: .50 },
  { id: "pestcert", name: "Certificate",          trade: "civil", share: .20 },
]),
S("protection_covering", [
  { id: "layprot",  name: "Laying protection", trade: "flooring", share: .60, sees: ["floor_protect"] },
  { id: "maintprot",name: "Maintaining protection", trade: "flooring", share: .40 },
]),
S("signage_evac", [
  { id: "supsig",   name: "Delivery", trade: "closeout", share: .30 },
  { id: "extg",     name: "Fixing extinguishers",  trade: "fire", share: .25 },
  { id: "exitsig",  name: "Exit signage",  trade: "fire", share: .25, sees: ["signage"], stage: "installed" },
  { id: "evacmap",  name: "Evacuation maps",     trade: "fire", share: .20 },
]),
S("final_clean", [
  { id: "roughcl",  name: "Builders clean",                  trade: "closeout", share: .35 },
  { id: "deepcl",   name: "Deep cleaning",                   trade: "closeout", share: .45, sees: ["housekeeping"] },
  { id: "glasscl",  name: "Glass cleaning",            trade: "closeout", share: .20 },
]),
S("snag_cycle", [
  { id: "presnag",  name: "Our own snag list",               trade: "closeout", share: .25 },
  { id: "consnag",  name: "Client snag list",        trade: "closeout", share: .20 },
  { id: "desnag",   name: "Clearing snags",                     trade: "closeout", share: .35 },
  { id: "verify",   name: "Sign off",         trade: "closeout", share: .20 },
]),
S("handover_file", [
  { id: "asbuilt",  name: "As built drawings",               trade: "closeout", share: .35 },
  { id: "oandm",    name: "Manuals and warranties",        trade: "closeout", share: .35 },
  { id: "certs",    name: "Test certificates",  trade: "closeout", share: .30 },
]),
// TESTING AND COMMISSIONING IS WHERE A PROGRAMME FINDS OUT IT WAS WRONG.
S("tc_electrical", [
  { id: "ir",       name: "Insulation and earth test",   trade: "electrical", share: .30 },
  { id: "loadtest", name: "Load test",          trade: "electrical", share: .35 },
  { id: "witness",  name: "Witness test",         trade: "electrical", share: .35 },
]),
S("tc_hvac", [
  { id: "airbal",   name: "Air balancing",                   trade: "hvac", share: .35 },
  { id: "dryrun",   name: "Dry run",            trade: "hvac", share: .35 },
  { id: "witnessh", name: "Witness test",         trade: "hvac", share: .30 },
]),
S("tc_fire", [
  { id: "causeeff", name: "Cause and effect test",      trade: "fire", share: .40 },
  { id: "drill",    name: "Fire drill",           trade: "fire", share: .25 },
  { id: "witnessf", name: "Witness test",         trade: "fire", share: .35 },
]),
S("tc_elv", [
  { id: "flukeall", name: "Fluke testing",            trade: "elv", share: .35 },
  { id: "integ",    name: "Integration check",        trade: "elv", share: .35 },
  { id: "witnesse", name: "Witness test",         trade: "elv", share: .30 },
]),
S("tc_plumbing", [
  { id: "presstest",name: "Pressure test",            trade: "plumbing", share: .40 },
  { id: "flush",    name: "Flushing",         trade: "plumbing", share: .30 },
  { id: "witnessp", name: "Witness test",         trade: "plumbing", share: .30 },
]),
// THESE TWO WERE FALLING BACK TO THE GENERIC THREE, so the programme showed
// "Doing the work" against BMS and against the FM training, which tells a PM
// nothing. Both are real sequences a site runs, so they are written out.
S("bms_integration", [
  { id: "bmspanel", name: "Panel and controllers",  trade: "elv", share: .25 },
  { id: "bmsfield", name: "Field wiring",           trade: "elv", share: .25 },
  { id: "bmspoint", name: "Point to point check",   trade: "elv", share: .25 },
  { id: "bmsgraph", name: "Graphics and trends",    trade: "elv", share: .15 },
  { id: "bmshand",  name: "Demo and sign off",      trade: "elv", share: .10 },
]),
S("fm_training", [
  { id: "trainmat", name: "Training material",      trade: "closeout", share: .25 },
  { id: "trainmep", name: "MEP systems training",   trade: "closeout", share: .35 },
  { id: "trainelv", name: "ELV systems training",   trade: "closeout", share: .25 },
  { id: "trainlog", name: "Attendance record",      trade: "closeout", share: .15 },
]),
]);
Object.assign(STEPS, FROM_PERT);

// ---- the default, for a package with no method statement yet ------------
// A PACKAGE WITH NO STEPS DECLARED STILL HAS THREE. Every trade prepares,
// does the work, and checks it; saying so is honest, and saying nothing
// would silently drop the package out of the breakdown.
const DEFAULT = [
  { id: "prep",  name: "Preparation", trade: null, share: .25 },
  { id: "exec",  name: "Doing the work",             trade: null, share: .55 },
  { id: "check", name: "Check and snag",    trade: null, share: .20 },
];

// shares normalised, order fixed, so a caller never has to trust the table
function stepsFor(code) {
  const raw = STEPS[code] || DEFAULT;
  const total = raw.reduce((t, s) => t + (s.share || 0), 0) || 1;
  let acc = 0;
  return raw.map((s, i) => { const share = (s.share || 0) / total;
    const row = { ...s, share, order: i, from: acc, to: acc + share,
      trade: s.trade || null, sees: s.sees || [], generic: !STEPS[code] };
    acc += share; return row; });
}

const K = { STEPS, DEFAULT, stepsFor };
root.KB_STEPS = K;
if (typeof module !== "undefined" && module.exports) module.exports = K;

})(typeof window !== "undefined" ? window : globalThis);
