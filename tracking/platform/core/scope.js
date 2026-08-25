// ===================================================================
// DnB-OS . platform/core/scope.js . THE BILL BECOMES WORK
// A priced BOQ line is money. A task is work with a duration, a crew and
// a place. This is the crossing between them, and it is the last point at
// which a whole package can quietly disappear — so nothing is dropped
// here, ever. A line that feeds no task is PARKED, with its price on it,
// in front of a person.
//
//   PACKAGE_CODE          a bill's own section is a classification
//   RULES                 description words -> task code, declared
//   UNITS / CONVERT       the unit vocabulary and the only conversions
//   match(pkg, desc)      one line -> a task code, or honestly null
//   build(facts, norms)   the bill -> tasks, parked, and unusable
//
// THE LAWS
//   . NOTHING IS DROPPED. Every priced line ends in exactly one of three
//     places: a task, the parked list, or the unusable list. The three
//     add up to the bill, and the engine says so in money.
//   . A LINE THAT FEEDS NO TASK IS A QUESTION WITH A PRICE ON IT. Not a
//     rounding error, not an omission to be noticed in week six.
//   . NO UNIT, NO DURATION. A man-hour norm is per unit. A line whose
//     sheet states no unit cannot produce a duration, and saying so is
//     the whole difference between a plan and a guess.
//   . THE ONLY CONVERSIONS ARE DECLARED ONES. Square feet to square
//     metres, and nothing else. A line measured in KG against a norm
//     measured in m2 is reported, never scaled by something plausible.
//   . THE SECTION IS EVIDENCE. A line under "Carpet Flooring" is carpet,
//     because the people who priced the bill said so by putting it there.
//     A description word beats it where one matches, and the reason
//     travels with the answer.
//
// Pure: facts in, work out. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

// ---- a bill's own sections, as the people who priced it named them ----
// THE UNIT IS EVIDENCE ABOUT WHAT KIND OF LINE THIS IS. An electrical line
// measured in metres is cable or containment; the same section measured in
// numbers is a point or a board. Reading the section without the unit puts
// 3.7 km of cable in front of a norm written per point. "*" is the answer
// where the unit does not change it; a unit the section does not declare is
// a question, not a nearest match.
const PACKAGE_CODE = {
  "civil works":               { "*": "blockwork" },
  "carpet flooring":           { "*": "carpet_tile" },
  "blinds":                    { "*": "blinds_film" },
  "signages":                  { "*": "signage_evac" },
  "graphics and films":        { "m2": "graphics_planters", "no": "graphics_planters", "*": "graphics_planters" },
  "planters":                  { "*": "graphics_planters" },
  "modular furniture":         { "*": "workstation" },
  "loose furniture & chairs":  { "*": "storage_unit" },
  "light fixtures":            { "*": "light_fixture" },
  "electrical":                { "no": "wiring_point", "m": "cable_pull", "kg": "cable_pull" },
  "passive networking":        { "no": "data_drop", "m": "data_drop" },
  "hvac_low side":             { "kg": "duct_gi", "m2": "duct_gi", "no": "grille_diffuser", "m": "duct_insulation" },
  "hvac_vrf":                  { "m": "refnet_pipe", "no": "odu_unit" },
  "hvac_vav":                  { "no": "vav_unit" },
  "toilet works":              { "no": "sanitary_fixture", "m2": "wall_dado", "m": "cpvc_pipe" },
  "interior works":            { "m2": "joinery_panel", "no": "storage_unit", "m": "joinery_panel" },
  "gss":                       { "*": "gas_suppression" },
  "fire & security":           { "*": "fa_device" },
  "phe":                       { "m": "cpvc_pipe", "no": "sanitary_fixture" },
  "ups":                       { "*": "ups_battery" },
};

// THE ONLY CONVERSIONS ARE DECLARED ONES, AND EACH CARRIES ITS SOURCE.
// Square feet to square metres is arithmetic. GI duct by weight from duct
// by area is a trade rate, and it is written down here where somebody can
// disagree with it rather than buried in a multiplication.
const CONVERT = [
  { from: "sqft", to: "m2",  factor: 0.092903, code: null,
    why: "square feet to square metres" },
  { from: "m2",   to: "kg",  factor: 8.5,      code: "duct_gi",
    why: "GI duct sheet weighs about 8.5 kg per square metre — the same rate the BOQ map already uses" },
];

// ---- what a description says, whatever section it sits in -------------
// Longest matching phrase wins, so "fire door" is joinery and not fire
// fighting, and "cove lighting" is a light and not a ceiling.
const RULES = [
  { w: "aac block",              code: "blockwork" },
  { w: "block wall",             code: "blockwork" },
  { w: "block work",             code: "blockwork" },
  { w: "builder wall",           code: "blockwork" },
  { w: "plaster",                code: "plaster" },
  { w: "punning",                code: "pop_punning" },
  { w: "self levelling",         code: "self_leveling" },
  { w: "self-levelling",         code: "self_leveling" },
  { w: "screed",                 code: "screed" },
  { w: "waterproofing",          code: "waterproofing" },
  { w: "floor chipping",         code: "demo_floor_finish" },
  { w: "dismantling",            code: "demo_partition" },
  { w: "demolition",             code: "demo_partition" },
  { w: "pest control",           code: "pest_control" },
  { w: "anti-termite",           code: "pest_control" },
  { w: "core cut",               code: "core_cut" },
  { w: "lintel",                 code: "blockwork" },

  { w: "gi stud",                code: "gi_stud_frame" },
  // "PLAIN GYPSUM BOARD CEILING" IS A CEILING. Both phrases are the same
  // length, "gypsum board" was declared first, and 550 m2 of the main
  // ceiling — half the false ceiling on this floor — was being built as
  // partition. The longer phrase has to win, so it is spelled out.
  { w: "gypsum board ceiling",   code: "ceiling_gypsum" },
  { w: "gyp board ceiling",      code: "ceiling_gypsum" },
  { w: "board ceiling",          code: "ceiling_gypsum" },
  { w: "gypsum board",           code: "board_close" },
  { w: "glass partition",        code: "glazing_partition" },
  { w: "modular partition",      code: "glazing_partition" },
  { w: "roller blind",           code: "blinds_film" },
  { w: "frost film",             code: "blinds_film" },

  { w: "false ceiling",          code: "ceiling_gypsum" },
  { w: "grid ceiling",           code: "ceiling_grid_tile" },
  { w: "metal ceiling",          code: "metal_ceiling" },
  { w: "stretch ceiling",        code: "stretch_ceiling" },
  { w: "cove light",             code: "light_fixture" },
  { w: "cove lighting",          code: "light_fixture" },

  { w: "lvt",                    code: "vinyl_lvt", whole: true },
  { w: "vinyl",                  code: "vinyl_lvt" },
  { w: "carpet",                 code: "carpet_tile" },
  { w: "vitrified",              code: "tile_vitrified" },
  { w: "skirting",               code: "skirting" },
  { w: "epoxy",                  code: "epoxy_flooring" },
  { w: "raised floor",           code: "raised_floor" },
  { w: "wall dado",              code: "wall_dado" },

  { w: "emulsion",               code: "paint_emulsion" },
  { w: "primer",                 code: "putty_primer" },
  { w: "putty",                  code: "putty_primer" },
  { w: "wallpaper",              code: "wallpaper" },
  { w: "fluted",                 code: "fluted_panel" },
  { w: "lacquered glass",        code: "lacquered_glass" },
  { w: "veneer",                 code: "joinery_panel" },
  { w: "laminate",               code: "joinery_panel" },
  { w: "acoustic panel",         code: "joinery_panel" },
  { w: "graphics",               code: "graphics_planters" },
  { w: "signage",                code: "signage_evac" },
  { w: "planter",                code: "graphics_planters" },

  { w: "fire door",              code: "fire_door", whole: true },
  { w: "fire rated door",        code: "fire_door", whole: true },
  { w: "frd",                    code: "fire_door", whole: true },
  // "INDOOR" CONTAINS "DOOR", and an indoor CCTV camera is not a door. Same
  // family as "ODU" inside "Module", which put 175 sockets on the critical
  // path as VRF outdoor units. Whole-word, so "indoor", "outdoor" and
  // "doorway" cannot be read as a door leaf.
  { w: "door",                   code: "door_install", whole: true },
  { w: "counter",                code: "joinery_panel" },
  { w: "storage",                code: "storage_unit" },
  { w: "shelf",                  code: "storage_unit" },
  { w: "credenza",               code: "storage_unit" },
  { w: "workstation",            code: "workstation" },
  // loose furniture is bought and placed, not built. It has no man-hour norm
  // and inventing one turns three hundred chairs into a year of joinery.
  { w: "sofa",                   code: null, klass: "ffe" },
  { w: "chair",                  code: null, klass: "ffe" },
  { w: "stool",                  code: null, klass: "ffe" },
  { w: "table",                  code: null, klass: "ffe" },
  { w: "seating",                code: null, klass: "ffe" },
  { w: "bean bag",               code: null, klass: "ffe" },

  { w: "toilet cubicle",         code: "toilet_cubicle" },
  { w: "cubicle",                code: "toilet_cubicle" },
  { w: "washroom accessor",      code: "washroom_accessories" },
  { w: "sanitary",               code: "sanitary_fixture" },
  { w: "wash basin",             code: "sanitary_fixture" },
  { w: "cpvc",                   code: "cpvc_pipe" },
  { w: "upvc",                   code: "cpvc_pipe" },

  { w: "cable tray",             code: "conduit" },
  { w: "conduit",                code: "conduit" },
  { w: "raceway",                code: "floor_raceway" },
  { w: "sqmm",                   code: "cable_pull" },
  { w: "sq.mm",                  code: "cable_pull" },
  { w: "flexible cable",         code: "cable_pull" },
  { w: "armoured cable",         code: "cable_pull" },
  { w: "core x",                 code: "cable_pull" },
  // A LINE MATCHES ON WHAT IT IS, NOT ON WHAT IT MENTIONS. "FLOOR LIGHTING
  // DB" is a distribution board — two words and an abbreviation, an item's
  // NAME. But "Secondary power point ... to be controlled by the existing
  // MCB in DB" is a power point that happens to name the board it hangs off,
  // and a camera's spec sheet says "dB" because it quotes a signal-to-noise
  // ratio. Both were read as distribution boards: 848 power points and 25
  // cameras, 892 boards on a 19,000 sqft floor, 900 gang-days, and the
  // critical path. A two-letter abbreviation is only an item's name inside
  // an item's name; in a paragraph of specification it is a cross-reference,
  // and the longer phrases further down this list say what the line is.
  { w: "db",                     code: "db_panel", whole: true, maxLen: 40 },
  // "PANEL" IS THE MOST OVERLOADED WORD IN A FIT-OUT BILL. A jack panel is a
  // data termination, an acoustic panel is joinery, a control panel is BMS,
  // and only a distribution board is a board. Matching the bare word put
  // 1,602 network terminations into the electrical boards task and made it
  // the critical path.
  { w: "distribution board",     code: "db_panel", maxLen: 44 },
  { w: "main panel",             code: "db_panel" },
  { w: "lt panel",               code: "db_panel" },
  { w: "jack panel",             code: "data_drop" },
  { w: "faceplate",              code: "data_drop" },
  { w: "fiber panel",            code: "network_rack" },
  { w: "fibre panel",            code: "network_rack" },
  { w: "control panel",          code: "bms_integration" },
  { w: "light fixture",          code: "light_fixture" },
  // A DOWNLIGHT IS A LIGHT and "down" is not a prefix any rule can guess at.
  // Now that a rule word has to start a word, the compounds a bill actually
  // writes are spelled out rather than left to a substring — the same
  // technique "gypsum board ceiling" already uses to beat "gypsum board".
  { w: "downlight",              code: "light_fixture" },
  { w: "uplight",                code: "light_fixture" },
  { w: "spotlight",              code: "light_fixture" },
  { w: "wall light",             code: "light_fixture" },
  { w: "light",                  code: "light_fixture" },
  { w: "ups",                    code: "ups_battery" },
  { w: "earthing",               code: "wiring_point" },

  { w: "duct",                   code: "duct_gi" },
  { w: "duct insulation",        code: "duct_insulation" },
  { w: "diffuser",               code: "grille_diffuser" },
  { w: "grille",                 code: "grille_diffuser" },
  { w: "vav",                    code: "vav_unit", whole: true },
  { w: "fcu",                    code: "fcu_unit", whole: true },
  // "ODU" LIVES INSIDE "MODULE". A three-module back box is not a VRF
  // outdoor unit, and 175 sockets at twelve man-hours each was the whole
  // critical path. Short codes match as whole words or not at all.
  { w: "odu",                    code: "odu_unit", whole: true },
  { w: "outdoor unit",           code: "odu_unit" },
  // A DUCTABLE UNIT IS AN INDOOR MACHINE, not sheet metal. It starts with
  // "duct" so a word-start rule reads it as GI ducting, and then the bill's
  // "no" against a norm per kilogram makes it unusable and it leaves the
  // programme entirely. Spelled out ahead of "duct", as "downlight" is
  // spelled out ahead of "light".
  { w: "ductable",               code: "fcu_unit" },
  { w: "ductible",               code: "fcu_unit" },      // the bill's own spelling
  { w: "indoor unit",            code: "fcu_unit" },
  { w: "cassette",               code: "fcu_unit" },
  { w: "hi-wall",                code: "fcu_unit" },
  { w: "hiwall",                 code: "fcu_unit" },
  { w: "refrigerant",            code: "refnet_pipe" },
  { w: "refnet",                 code: "refnet_pipe" },
  { w: "copper pip",             code: "refnet_pipe" },
  { w: "fire damper",            code: "fire_damper" },
  { w: "condensate",             code: "condensate_drain" },
  { w: "exhaust",                code: "toilet_exhaust" },

  { w: "sprinkler",              code: "sprinkler_pipe" },
  { w: "smoke detector",         code: "fa_device" },
  { w: "detector",               code: "fa_device" },
  { w: "hooter",                 code: "fa_device" },
  { w: "call point",             code: "fa_device" },
  { w: "cat6",                   code: "data_drop" },
  { w: "cat 6",                  code: "data_drop" },
  { w: "patch panel",            code: "network_rack" },
  { w: "rack",                   code: "network_rack" },
  { w: "access point",           code: "data_drop" },
  { w: "camera",                 code: "elv_device" },
  { w: "cctv",                   code: "elv_device" },
  { w: "access control",         code: "elv_device" },
  { w: "speaker",                code: "pa_system" },
  { w: "novec",                  code: "gas_suppression" },
  { w: "gas suppression",        code: "gas_suppression" },
  { w: "water leak",             code: "wld_system" },
  { w: "rodent",                 code: "rodent_system" },
  { w: "bms",                    code: "bms_integration" },
  { w: "firestop",               code: "firestop" },

  // ==== WHAT THE SECTION HEADING USED TO ANSWER FOR ====================
  // Everything below was reaching the plan through a section default rather
  // than through anything the line actually said. Each one is here because
  // it landed in the wrong package and moved man-days with it.

  // --- the three that broke the programme, all filed under Interior Works
  { w: "deep cleaning",          code: "final_clean" },      // was 2,460 m2 of joinery
  { w: "floor protection",       code: "protection_covering" }, // was 2,460 m2 of joinery
  { w: "painting for true ceiling", code: "paint_emulsion" },   // was 2,415 m2 of joinery
  { w: "protection covering",    code: "protection_covering" },
  { w: "builders clean",         code: "final_clean" },

  // --- interior finishes that are not wall panelling
  { w: "tile - type",            code: "tile_vitrified" },
  { w: "printed tile",           code: "tile_vitrified" },
  { w: "tile cladding",          code: "wall_dado" },
  { w: "column cladding",        code: "board_close" },
  { w: "thick partition",        code: "board_close" },
  { w: "gyp-roc",                code: "putty_primer" },
  { w: "bondit",                 code: "putty_primer" },
  { w: "cloud ceiling",          code: "metal_ceiling" },
  { w: "baffle ceiling",         code: "metal_ceiling" },
  { w: "perforated wooden ceiling", code: "metal_ceiling" },
  { w: "designer ceiling",       code: "metal_ceiling" },
  { w: "chequered plate",        code: "firestop" },
  { w: "control film",           code: "blinds_film" },
  { w: "control flim",           code: "blinds_film" },   // the bill's own spelling
  { w: "entrance mat",           code: null, klass: "ffe" },

  // --- electrical: containment and boards are not cable and not points
  { w: "back box",               code: "conduit", maxLen: 60 },
  { w: "backbox",                code: "conduit" },
  { w: "tray",                   code: "conduit", whole: true, maxLen: 44 },
  { w: "swg grade",              code: "conduit" },
  { w: "end termination",        code: "wiring_point" },
  { w: "earth flat",             code: "wiring_point" },
  { w: "earth pit",              code: "wiring_point" },
  { w: "gi wire",                code: "wiring_point" },
  // "Secondary power point ... controlled by the existing MCB in the DB" is a
  // POWER POINT. Matching the bare abbreviation put 848 of them into the
  // boards package: 1,820 man-days, 21% of the job, and the critical path —
  // the identical failure "db" already carries a maxLen for. Switchgear is
  // named at the front of its own line and always with its rating, so the
  // pattern below reads the whole line rather than a mention inside one.
  { w: "mcb",                    code: "db_panel", whole: true, maxLen: 40 },
  { w: "mccb",                   code: "db_panel", whole: true, maxLen: 40 },
  { w: "rccb",                   code: "db_panel", whole: true, maxLen: 40 },
  { w: "busbar",                 code: "db_panel", maxLen: 60 },
  { w: "apfc",                   code: "db_panel" },
  { w: "isolator",               code: "db_panel", maxLen: 60 },

  // --- data: an accessory is not a drop
  { w: "face plate",             code: "data_drop" },
  { w: "patch cord",             code: "data_drop" },
  { w: "fluke test",             code: "data_drop" },
  { w: "wifi stand",             code: "data_drop" },
  { w: "cable organiser",        code: "network_rack" },
  { w: "cable organizer",        code: "network_rack" },
  { w: "run-way kit",            code: "network_rack" },
  { w: "runway kit",             code: "network_rack" },
  { w: "water fall kit",         code: "network_rack" },
  { w: "mounting hardware",      code: "network_rack" },

  // --- fire & security: one heading, six different trades under it
  { w: "drencher",               code: "sprinkler_pipe" },
  { w: "deluge",                 code: "sprinkler_pipe" },
  { w: "nozzle",                 code: "sprinkler_pipe", maxLen: 44 },
  { w: "u-clamp",                code: "sprinkler_pipe", maxLen: 44 },
  { w: "fastner",                code: "sprinkler_pipe", maxLen: 44 },  // the bill's own spelling
  { w: "fastener",               code: "sprinkler_pipe", maxLen: 44 },
  { w: "test valve",             code: "sprinkler_pipe" },
  { w: "extinguisher",           code: "signage_evac" },
  { w: "exit lumin",             code: "signage_evac" },
  { w: "evacuation map",         code: "signage_evac" },
  { w: "cylinder",               code: "gas_suppression", maxLen: 60 },
  { w: "gas release",            code: "gas_suppression" },
  { w: "abort and release",      code: "gas_suppression" },
  { w: "card reader",            code: "elv_device" },
  { w: "biometric",              code: "elv_device" },
  { w: "egress switch",          code: "elv_device" },
  { w: "magnetic contact",       code: "elv_device" },
  { w: "call station",           code: "pa_system" },
  { w: "master controller",      code: "pa_system" },
  { w: "amplifier",              code: "pa_system" },
  { w: "zone network router",    code: "pa_system" },

  // --- plumbing fittings the "sanitary" word never reached
  { w: "stop cock",              code: "sanitary_fixture" },
  { w: "bib cock",               code: "sanitary_fixture" },
  { w: "floor trap",             code: "sanitary_fixture" },
  { w: "nahani",                 code: "sanitary_fixture" },
  { w: "ball valve",             code: "cpvc_pipe", maxLen: 60 },

  // --- site consumables carry no man-hour norm and never did
  { w: "first aid",              code: null, klass: "consumable",
    why: "a site consumable, carried in the preliminaries and not a task with a duration" },
  { w: "danger board",           code: null, klass: "consumable",
    why: "a site consumable, carried in the preliminaries and not a task with a duration" },
  { w: "rubber mat",             code: null, klass: "consumable",
    why: "a site consumable, carried in the preliminaries and not a task with a duration" },

  // --- the joinery that IS joinery, once the section stopped guessing
  { w: "pelmet",                 code: "joinery_panel" },
  { w: "platform for",           code: "joinery_panel" },
  { w: "backdrop",               code: "joinery_panel" },
  { w: "design partition",       code: "joinery_panel" },
  { w: "fabric panel",           code: "joinery_panel" },
  { w: "tv unit",                code: "joinery_panel" },
  { w: "mdf panel",              code: "joinery_panel" },
  // "MDF Fluted Paneling" is a fluted panel, not an MDF one — the longer
  // phrase has to outrank "mdf panel" or every fluted line changes package
  { w: "fluted panel",           code: "fluted_panel" },
  { w: "shelves",                code: "storage_unit" },
  { w: "junction box",           code: "conduit", maxLen: 60 },
  { w: "corner guard",           code: "skirting" },
  { w: "transition strip",       code: "skirting" },
  { w: "aluminium trim",         code: "skirting" },
  { w: "expansion joint",        code: "skirting" },
  { w: "dustbin",                code: null, klass: "ffe" },
  { w: "water dispenser",        code: null, klass: "ffe" },

  // ==== PATTERN RULES ===================================================
  // A description that is ONLY a dimension is a sub-item whose parent
  // heading the sheet lost. The unit and the section together say what it
  // is, and the anchors mean nothing longer can trip them.
  { re: /^\s*\d+(\.\d+)?\s*mm\s+thick\s*$/i, w: "a bare insulation thickness",
    code: "duct_insulation", pkg: /hvac/ },              // "9 mm thick" = 1,550 m2
  { re: /^\s*\d+\s*g\s*(\(|$)/i, w: "a bare sheet gauge",
    code: "duct_gi", pkg: /hvac/ },                       // "24 G (0-600 mm)"
  { re: /^\s*(size\s*:?\s*)?\d+\s*x\s*\d+\s*mm/i, w: "a bare containment size",
    code: "conduit", pkg: /electrical|hvac|networking/ }, // "100 x 40mm" = tray, not cable
  { re: /^\s*\d+(\/\d+)?\s*a\b[^.]{0,40}\b(mcb|mccb|rccb|elcb|contactor)\b/i,
    w: "switchgear named with its rating at the head of the line",
    code: "db_panel", pkg: /electrical/ },
  { re: /^-?\s*(size\s*)?\d+\s*nb\.?\s*$/i, w: "a bare pipe bore",
    code: "sprinkler_pipe", pkg: /fire/ },                // "150 NB"
];
// A NAME IS READ DIFFERENTLY FROM A SPECIFICATION, AND A BILL CONTAINS BOTH.
//
// "FLOOR LIGHTING DB" is seventeen characters — an item's NAME, and its last
// word is what the item IS. The lighting is what the board is for. Rank by
// length there and a two-letter abbreviation loses to "lighting" every time,
// which turns every distribution board into a light fitting.
//
// "Supply, Installation, Testing and Commissioning of Fixed Dome 4 MP Indoor
// … SNR > 50dB" is a SPECIFICATION. Nothing in it stands as a head noun; the
// longest phrase that matches is the strongest evidence, and a bare
// abbreviation is a cross-reference to something else entirely.
//
// So the same rules are consulted in two orders, chosen by which kind of text
// this is. Getting this wrong in either direction is expensive: whole-word
// first everywhere made "Fire rated door" a door leaf instead of a fire door;
// length first everywhere made every DB a light fitting.
const NAME_LEN = 40;
const byLength = (a, b) => b.w.length - a.w.length;
// AN ANCHORED PATTERN IS STRONGER EVIDENCE THAN A SUBSTRING, so the pattern
// rules are consulted before any word rule in both orders. A line whose
// entire description is "9 mm thick" is a thickness and nothing else; a line
// that merely contains the word "duct" could be a hundred things.
const isRe = (r) => (r.re ? 1 : 0);
const SORTED_SPEC = RULES.slice().sort((a, b) => isRe(b) - isRe(a) || byLength(a, b));
const SORTED_NAME = RULES.slice().sort((a, b) =>
  isRe(b) - isRe(a) || (b.whole ? 1 : 0) - (a.whole ? 1 : 0) || byLength(a, b));

// ---- the unit vocabulary, and the ONLY conversions --------------------
const UNITS = {
  "sqm": "m2", "sq.m": "m2", "sqmt": "m2", "m2": "m2", "sq m": "m2",
  "sqft": "sqft", "sft": "sqft", "sq.ft": "sqft",
  "nos": "no", "no": "no", "nos.": "no", "each": "no", "set": "no", "box": "no",
  "per node": "no", "point": "no", "pts": "no",
  "rmt": "m", "mts": "m", "mtrs": "m", "mtr": "m", "m": "m", "rm": "m",
  "kg": "kg", "mt": "t",
  "ls": "lump", "lot": "lump", "lumpsum": "lump", "l.s": "lump",
};
const SQFT_TO_M2 = 0.092903;

function normUnit(u) {
  const k = String(u == null ? "" : u).trim().toLowerCase().replace(/\s+/g, " ");
  if (!k || /not stated/.test(k)) return null;
  return UNITS[k] || null;
}

// A SECTION THAT SPANS TRADES CANNOT SPEAK FOR A LINE IT DOES NOT DESCRIBE.
// "Interior Works" in this bill holds the deep clean, the floor protection,
// the true-ceiling paint, the tiles, the ceilings AND the joinery. Letting
// that heading default every square metre to wall panelling put 7,335 m2 of
// cleaning, protection and ceiling paint into the joinery package: 2,478
// man-days, 29% of the job, and the reason the programme could not be built
// with fewer than twenty-four times the standard crews.
//
// So a broad section is allowed to say "this is mine" only when the
// description already told us what the line is. Where it did not, the line
// becomes a QUESTION with a price on it rather than a quantity nobody chose.
// A narrow section — "Carpet Flooring", "Blinds", "UPS" — keeps its default,
// because there the heading really is the answer.
//
// "Electrical" and "Fire & Security" are wide too, but their defaults are
// keyed on the UNIT, and a unit is real evidence: metres under Electrical is
// containment or cable, numbers is a point. Those stay. Only a heading whose
// default ignores what the unit is telling us is broad.
const BROAD_SECTIONS = { "interior works": true };

// A package whose bill is written in two shapes, and which shape a counted
// line belongs to. Read by build() below.
const UNIT_SIBLING = {
  sprinkler_pipe: { no: "sprinkler_head" },   // mains by the metre, heads by the number
  joinery_panel:  { no: "storage_unit" },     // panelling by the m2, fitted units by the number
  cpvc_pipe:      { no: "sanitary_fixture" }, // pipe by the metre, valves and traps by the number
  conduit:        { no: "wiring_point" },     // containment by the metre, boxes by the number
  cable_pull:     { no: "wiring_point" },     // cable by the metre, terminations by the number
};

// ---- a rule word has to START a word --------------------------------
// "suitable" contains "table" and a volume control damper was being parked
// as loose furniture on it. "bracket" contains "rack" and two toilet
// fixings were scheduled as network racks. "conductor" contains "duct".
// This is the same family as the bare "mcb" that billed 848 power points as
// distribution boards, and "ODU" inside "Module" that put 175 sockets on
// the critical path as VRF outdoor units.
//
// WHOLE-WORD IS TOO STRICT, and that is why it was never the default: a
// bill says "Ducting", "plastering", "grilles", "workstations", "end
// terminations". The word has to START a word; whatever follows it is the
// grammar of the sentence and is nobody's business.
//
// A SHORT LIST OF PREFIXES IS STILL A WORD START. "Prelaminated Particle
// Board" is a laminate panel and always was. The list is deliberately tiny
// and construction-shaped: nothing on it turns "conductor" into a duct.
const PREFIX = ["pre", "non", "un", "semi", "re", "anti", "multi", "inter",
                "sub", "over", "under", "mini", "micro", "poly", "galv"];
function startsAWord(d, w) {
  let i = d.indexOf(w);
  while (i !== -1) {
    if (i === 0 || !/[a-z]/.test(d[i - 1])) return true;      // starts a word
    // or starts one after a prefix that is itself at a word boundary
    for (const p of PREFIX) {
      const s = i - p.length;
      if (s >= 0 && d.substr(s, p.length) === p &&
          (s === 0 || !/[a-z]/.test(d[s - 1]))) return true;
    }
    i = d.indexOf(w, i + 1);
  }
  return false;
}

// ---- one line -> one task code ----------------------------------------
function match(pkg, desc, unit) {
  const d = String(desc || "").toLowerCase();
  const p = String(pkg || "").toLowerCase().trim();
  for (const r of (d.length <= NAME_LEN ? SORTED_NAME : SORTED_SPEC)) {
    // a rule may declare that it only names an item inside an item's NAME,
    // not inside a paragraph of specification — see "db" above
    if (r.maxLen && d.length > r.maxLen) continue;
    // a pattern rule may declare which section it is allowed to speak for,
    // so "9 mm thick" is duct insulation under HVAC and nothing at all under
    // a civil heading where it would be a block
    if (r.pkg && !r.pkg.test(p)) continue;
    const hit = r.re ? r.re.test(d)
      : r.whole ? new RegExp("(^|[^a-z])" + r.w + "([^a-z]|$)", "i").test(d)
      : startsAWord(d, r.w);
    if (!hit) continue;
    const said = r.re ? 'the whole description reads "' + desc + '", which is ' + r.w
                      : 'the description contains "' + r.w + '"';
    if (r.klass) return { code: null, klass: r.klass, by: "description",
      why: said + ", which this engine classifies as " + r.klass + " — " +
           (r.why || "bought and placed inside the furniture phase, with no man-hour norm of its own") };
    return { code: r.code, by: "description", why: said };
  }
  const byPkg = PACKAGE_CODE[p];
  if (byPkg) {
    const u = normUnit(unit);
    const hit = (u && byPkg[u]) || byPkg["*"] || null;
    if (hit && BROAD_SECTIONS[p]) return { code: null, by: "package", query: true,
      why: 'nothing in the description says what this is, and "' + pkg + '" covers too many trades ' +
           'to answer for it — the section default (' + hit + ') would be a guess with man-days on it' };
    if (hit) return { code: hit, by: "package",
      why: 'nothing in the description matched, but the bill files this line under "' + pkg + '"' +
           (u && byPkg[u] ? ' and measures it in ' + u : "") };
    return { code: null, by: "package",
      why: 'the bill files this under "' + pkg + '" but measures it in ' + (u || "nothing stated") +
           ", and that section declares no task for that unit" };
  }
  return null;
}

// ---- WHAT HAPPENS WHETHER OR NOT ANYBODY PRICED IT ---------------------
// This engine builds the programme out of priced BOQ lines, which means a
// job only ever contains what somebody thought to price. The last-mile plan
// of a completed fit-out says otherwise: line-out marking and its approval,
// temporary lighting, pest control, protection to finished floors, testing
// and commissioning of every system, the snagging cycle, the handover file,
// the extinguishers and evacuation maps, and the deep clean. Not one of them
// is a line in this bill. Every one of them is on the critical path of the
// last week.
//
// So they are added — with the duration their norm declares, flagged as NOT
// from the bill, and carrying no money at all. A programme that leaves them
// out finishes on paper a fortnight before it finishes on site.
// NOT ALL OF THE TAIL HAS TO BE FINISHED BY THE HANDOVER, AND TREATING IT AS
// IF IT DOES MAKES THE DATE LOOK FURTHER AWAY THAN IT IS.
//   before  it is a CONDITION OF HANDOVER. A client cannot take a floor that
//           is untested, has no extinguishers or has not been deep cleaned.
//   after   it genuinely runs on. As-builts, O&M manuals and warranties are
//           routinely a month behind the keys and nobody waits for them.
//   spans   it starts before and finishes after. Snagging is the only real
//           one: the pre-snag and the consultant walk have to happen before
//           anybody signs, and de-snagging carries on for weeks afterwards.
//           `beforeShare` is how much of it must land inside the date.
const ALWAYS = [
  { code: "lineout_marking",     handover: "before",
    why: "no floor is built without setting it out and having that checked" },
  { code: "temporary_lighting",  handover: "before",
    why: "no trade works in the dark; it goes in before demolition finishes" },
  { code: "pest_control",        handover: "before",
    why: "anti-termite dosing after strip-out, before anything is closed" },
  { code: "protection_covering", handover: "before",
    why: "finished floors are covered the day they are laid, and maintained" },
  { code: "tc_electrical",       handover: "before",
    why: "nobody signs for an untested system, and the test is what finds the problem" },
  { code: "tc_hvac",             handover: "before",
    why: "air balancing and a dry run are days, not a formality" },
  { code: "tc_plumbing",         handover: "before", why: "pressure test, flush and chlorinate" },
  { code: "tc_fire",             handover: "before",
    why: "cause-and-effect matrix and a mock drill — an occupancy condition, not a nicety" },
  { code: "tc_elv",              handover: "before", why: "fluke, link test and system integration" },
  { code: "signage_evac",        handover: "before",
    why: "extinguishers, exit signage and evacuation maps are a condition of occupancy" },
  { code: "final_clean",         handover: "before",
    why: "builders clean then deep clean — nobody hands over a dirty floor, and it cannot follow the keys" },
  { code: "fm_training",         handover: "before",
    why: "the facilities team is shown the systems as part of taking them on" },
  { code: "snag_cycle",          handover: "spans", beforeShare: 0.45,
    why: "pre-snag and the consultant walk have to happen before anybody signs; de-snagging runs " +
         "on for weeks after the client is in, and always has" },
  { code: "handover_file",       handover: "after",
    why: "as-builts, O&M manuals, certificates and warranties routinely follow the keys by a month" },
];

// ---- the bill becomes work --------------------------------------------
// facts: the quantity facts from one BOQ revision. money: the amount facts,
// so a parked line can be reported with its price rather than as a name.
function build(facts, norms, opts) {
  const o = opts || {};
  const N = {}; (norms || []).forEach(n => N[n.code] = n);
  // ---- A LINE'S MONEY IS THE MONEY ON ITS OWN ROW ----------------------
  // Money used to be keyed on the description, and a bill repeats a
  // description every time it lists a sub-item under a heading. Seven lines
  // reading "Supply, installation, testing & commissioning of VAV boxes"
  // each collected the sum of all seven: Rs 20 lakh became Rs 1.38 crore,
  // and VAV boxes came out as 21% of the contract on a floor where they are
  // half a per cent of the work. Meanwhile carpet, workstations, wallpaper
  // and the toilet cubicles carried no value at all, because their amount
  // sits in a column the subject string never matched.
  //
  // A spreadsheet already says which quantity belongs to which amount, and
  // it says it the only way a spreadsheet can: they are on the same ROW.
  // So the row is the key. Where a row carries no amount — supply and
  // install split across two columns with the total computed elsewhere —
  // the description is the fallback, and there the sum is SHARED between
  // the lines that share it rather than handed to each of them.
  const rowOf = (where) => {
    const m = String(where || "").match(/^(.*)!([A-Z]+)(\d+)/);
    return m ? m[1] + "!" + m[3] : null;
  };
  const byRow = {}, bySubject = {}, subjectCount = {};
  (o.money || []).forEach(m => {
    const r = rowOf(m.source && m.source.where);
    if (r) byRow[r] = (byRow[r] || 0) + Number(m.value || 0);
    bySubject[m.subject] = (bySubject[m.subject] || 0) + Number(m.value || 0);
  });
  (facts || []).forEach(f => { subjectCount[f.subject] = (subjectCount[f.subject] || 0) + 1; });
  // A ROW WITH A QUANTITY AND A RATE HAS A VALUE, whether or not anybody
  // typed the multiplication into a third column. The Carpet Flooring sheet
  // states 1,292 m2 at Rs 2,150 and no total, so carpet — Rs 28 lakh of it —
  // carried no value at all, and so did the workstations, the wallpaper and
  // the toilet cubicles. Quantity times rate is arithmetic, not a guess, and
  // it is only ever used where the sheet gave no total of its own.
  const rateRow = {};
  (o.rates || []).forEach(m => {
    const r = rowOf(m.source && m.source.where);
    if (r) rateRow[r] = (rateRow[r] || 0) + Number(m.value || 0);
  });
  const moneyFor = (f) => {
    const r = rowOf(f.source && f.source.where);
    if (r && byRow[r] != null) return byRow[r];
    if (r && rateRow[r] != null && Number(f.value) > 0) return rateRow[r] * Number(f.value);
    const tot = bySubject[f.subject];
    if (tot == null) return null;
    return tot / Math.max(1, subjectCount[f.subject]);
  };

  const tasks = {}, parked = [], unusable = [];
  let lines = 0;

  for (const f of (facts || [])) {
    lines++;
    const [pkg, ...rest] = String(f.subject || "").split(" · ");
    const desc = rest.join(" · ");
    const value = moneyFor(f);
    const at = f.source ? f.source.doc + " " + f.source.where : null;
    const m = match(pkg, desc, f.unit);

    // ONE TRADE, TWO SHAPES, AND THE BILL CHOOSES WHICH. A sprinkler system
    // is priced as pipe by the metre AND as heads by the number; joinery is
    // priced as panelling by the square metre AND as counters and cupboards
    // by the number. Insisting on the first shape put 23 sprinkler heads and
    // 12 fitted units into "no conversion declared" — genuine, priced,
    // schedulable work reported as an error. Where a package has a counted
    // sibling, a counted line goes to the sibling. This is not a conversion:
    // no quantity is scaled, the line simply lands on the right norm.
    if (m && m.code) {
      const sib = UNIT_SIBLING[m.code];
      const uu = normUnit(f.unit);
      if (sib && uu && sib[uu] && N[sib[uu]]) {
        m.code = sib[uu];
        m.why = m.why + ", and the bill counts it, so it lands on " + sib[uu];
      }
    }

    if (!m || !m.code) {
      parked.push({ package: pkg, description: desc, qty: f.value, unit: f.unit, value, at,
        klass: (m && m.klass) || null,
        why: (m && m.why) ||
             "no declared rule maps this line to a task, and the section it sits under has no default — " +
             "it is real work with a price on it and the plan does not carry it" });
      continue;
    }
    const norm = N[m.code];
    if (!norm) {
      parked.push({ package: pkg, description: desc, qty: f.value, unit: f.unit, value, at, code: m.code,
        why: 'the rule maps this to "' + m.code + '" and no duration norm is declared for that code' });
      continue;
    }

    const u = normUnit(f.unit);
    if (!u) {
      unusable.push({ package: pkg, description: desc, code: m.code, qty: f.value, unit: f.unit, value, at,
        why: "the bill states no unit for this line, and a man-hour norm is per unit — " +
             "no duration can be derived from it without somebody saying what it is measured in" });
      continue;
    }
    let qty = Number(f.value), converted = null;
    if (u !== norm.unit) {
      const c = CONVERT.find(x => x.from === u && x.to === norm.unit && (!x.code || x.code === m.code));
      if (c) { qty = qty * c.factor; converted = c.why; }
      // A PACKAGE NORMED IN DAYS IS A FIXED-DURATION JOB, AND A COUNT DOES NOT
      // NEED CONVERTING INTO ONE. Commissioning a UPS, charging a gas
      // suppression system, hanging the extinguishers and evacuation maps —
      // these are normed as "so many days on site", and the bill prices them
      // as two nos or one lump. Demanding a conversion between "nos" and
      // "days" threw eight whole systems out of the programme: UPS, gas
      // suppression, PA, water leak detection, rodent repellent, BMS, pest
      // control and the entire handover pack. Every one of them is on the
      // last-mile plan of a job that finished, so every one of them is real
      // work that was silently absent from this one.
      else if (norm.unit === "day" && (u === "no" || u === "lump")) {
        // A COUNT DOES NOT MULTIPLY A FIXED DURATION. Commissioning a UPS
        // takes the days it takes; twelve priced accessories for it do not
        // make it twelve times longer. The norm carries the declared
        // duration, the bill's count is kept as the scale of the package,
        // and build() below takes the duration ONCE rather than summing it.
        qty = norm.baseDays || 5;
        converted = "a fixed-duration package: " + (norm.baseDays || 5) + " days on site as the norm " +
          "declares, with the bill's " + Math.round(Number(f.value) || 1) + " " + (u || "unstated") +
          " kept as its scale rather than multiplied into the duration";
      }
      else {
        unusable.push({ package: pkg, description: desc, code: m.code, qty: f.value, unit: f.unit, value, at,
          why: "the bill measures this in " + u + " and the norm for " + m.code + " is per " + norm.unit +
               " — no conversion between the two is declared, so it is reported rather than scaled by something plausible" });
        continue;
      }
    }

    const t = tasks[m.code] = tasks[m.code] || { code: m.code, name: norm.name, trade: norm.trade,
      unit: norm.unit, qty: 0, value: 0, lines: [] };
    // A FIXED-DURATION PACKAGE TAKES ITS DURATION ONCE. Summing it across
    // every priced line that feeds it turned twelve UPS accessories into
    // seventy-two days of commissioning. The money still adds up; the days
    // do not.
    if (norm.unit === "day") t.qty = Math.max(t.qty, qty); else t.qty += qty;
    t.value += (value || 0);
    t.lines.push({ package: pkg, description: desc, qty: f.value, unit: f.unit, value, at,
      by: m.by, why: m.why, converted });
  }

  const list = Object.keys(tasks).map(k => tasks[k]).sort((a, b) => b.value - a.value);

  // A BILL PRICES THE STAGES OF ONE ITEM AS SEPARATE LINES. "UTP cable
  // laying" 801, "Jack panel" 801, "Faceplate" 801, "Labelling" 801 is eight
  // hundred and one data outlets described four times — not 3,204 of them.
  // Summing a counted code across lines that carry the SAME quantity
  // multiplies the count, and the schedule that comes out is four times too
  // long. The engine cannot tell which reading is right, so it says what it
  // sees and leaves the arithmetic to a person.
  const suspectCounts = [];
  for (const t of list) {
    if (t.unit !== "no" || t.lines.length < 2) continue;
    const by = {};
    t.lines.forEach(l => { const k = Math.round(Number(l.qty) || 0);
      if (k > 0) (by[k] = by[k] || []).push(l); });
    for (const k of Object.keys(by)) {
      if (by[k].length < 2) continue;
      suspectCounts.push({ code: t.code, qty: Number(k), repeats: by[k].length,
        counted: Number(k) * by[k].length,
        descriptions: by[k].map(l => l.description),
        why: by[k].length + " priced lines each carry exactly " + k + " " + t.unit +
             " against " + t.code + ". That is usually one set of " + k +
             " items with its stages priced separately, not " + (Number(k) * by[k].length) +
             " items — and the difference is a schedule " + by[k].length + " times too long." });
    }
  }
  // THE OTHER READING OF THE SAME BILL. Where several lines carry the
  // identical count against one code, the sum says they are separate items
  // and the max says they are stages of one. Showing both and choosing
  // neither leaves a schedule that is knowingly several times too long —
  // which is not neutrality, it is a wrong answer with a clean conscience.
  // So the engine takes the likelier reading, SAYS it has, records how sure
  // it is, and names who can settle it. o.corroborate lets an independent
  // count from another document raise that confidence.
  const assumptions = [];
  if (o.collapseCounts) {
    for (const x of suspectCounts) {
      const t = list.find(y => y.code === x.code);
      if (!t) continue;
      // A SECOND DOCUMENT HAS TO AGREE, OR NOTHING IS COLLAPSED. Turning this
      // on without that test collapsed fifty-six groups, and most of them were
      // nonsense: six electrical lines each priced for ONE unit — a busbar, a
      // rubber mat, an earth rod — are six different items that happen to be
      // needed once each, not one item priced six times. Small integers repeat
      // in every bill ever written, so repetition ALONE is not evidence. It
      // becomes evidence when another document, prepared by different people
      // for a different purpose, lands on the same number: the node schedule
      // counts 425 active and 366 redundant data points, and the bill carries
      // lines of exactly 425 and exactly 366. That is two documents agreeing.
      // A PERSON WHO KNOWS THE PACKAGE OUTRANKS A SECOND DOCUMENT. Corroboration
      // exists because the engine cannot ask anybody; when somebody HAS been
      // asked and has answered, that is the end of the question, and holding
      // out for a matching number in another file would be pedantry.
      const said = (o.confirmed || {})[x.code];
      const ext = (o.corroborate || {})[x.code];
      const list2 = ext == null ? [] : (Array.isArray(ext) ? ext : [ext]);
      const near = (said != null && Math.abs(x.qty - said) / Math.max(1, said) < 0.05)
        ? said : list2.find(v => v && Math.abs(x.qty - v) / Math.max(1, v) < 0.05);
      if (near == null) continue;      // reported as suspect, never collapsed on a hunch
      const byPerson = said != null && near === said;
      const was = t.qty;
      t.qty -= x.qty * (x.repeats - 1);
      t.collapsed = (t.collapsed || []).concat([{ qty: x.qty, repeats: x.repeats,
        why: "read as one set of " + x.qty + " with " + x.repeats + " stages priced separately" }]);
      // A SECOND DOCUMENT THAT LANDS ON THE SAME NUMBER IS THE DIFFERENCE
      // BETWEEN A PATTERN AND A FACT. The node schedule counts 425 active and
      // 366 redundant data points; the bill carries lines of exactly 425 and
      // exactly 366. That is not the engine noticing a coincidence in one
      // document — it is two documents agreeing, and it is worth saying so.
      assumptions.push({
        id: "staged:" + x.code + ":" + x.qty,
        what: x.repeats + " lines of exactly " + x.qty + " " + t.unit + " against " + x.code +
              " are ONE set of " + x.qty + " priced at " + x.repeats + " stages, not " +
              (x.qty * x.repeats) + " separate items",
        why: (byPerson
          ? "somebody who knows this package confirmed the count is " + near +
            ", which is the number the bill repeats. "
          : "an independent count in another document lands on " + near + " for the same work, " +
            "which is the number the bill repeats — two documents agreeing, not a pattern in one. ") +
          x.repeats + " priced lines carry the identical quantity " + x.qty +
          ", and their descriptions are stages of one item: " +
          x.descriptions.slice(0, 3).map(d => String(d).slice(0, 44)).join(" · "),
        confidence: "high",
        affects: "the duration of " + x.code + ", by a factor of " + x.repeats +
                 " — " + Math.round(was) + " " + t.unit + " becomes " + Math.round(t.qty),
        settledBy: byPerson ? "already settled — recorded in settled.json"
          : "whoever priced this package saying whether those " + x.repeats +
            " lines are stages of one item or " + x.repeats + " separate items",
        instead: "carrying " + Math.round(was) + " " + t.unit + " into the programme, on a reading " +
                 "the bill's own repetition contradicts",
        value: { was: Math.round(was), now: Math.round(t.qty), repeats: x.repeats, corroboratedAt: near },
      });
    }
  }

  // THE WORK NOBODY PRICED, ADDED BEFORE THE TOTALS ARE STRUCK. It carries
  // no value, so the money still adds up to the bill exactly; it carries a
  // duration, so the programme stops finishing a fortnight early.
  const added = [];
  if (o.alwaysOn === true) {
    const have = {}; list.forEach(t => have[t.code] = 1);
    for (const a of ALWAYS) {
      if (have[a.code]) continue;
      const n = N[a.code]; if (!n) continue;
      // AN ALWAYS-ON PACKAGE IS SIZED THE WAY ITS OWN NORM IS WRITTEN. Final
      // cleaning is normed per square metre, so handing it a baseline in days
      // gave it five square metres to clean — one day for a floor of 19,000.
      // Where the norm measures area, it gets the floor.
      const qtyFor = n.unit === "day" ? (n.baseDays || 5)
        : (n.unit === "m2" && o.floorM2) ? o.floorM2
        : (n.baseDays || 5);
      list.push({ code: a.code, name: n.name, trade: n.trade, unit: n.unit,
        qty: qtyFor, value: 0, lines: [], fromBill: false,
        handover: a.handover || "before", beforeShare: a.beforeShare == null ? 1 : a.beforeShare,
        why: a.why });
      added.push({ code: a.code, days: n.baseDays || 5, qty: qtyFor, unit: n.unit, handover: a.handover || "before",
        beforeShare: a.beforeShare == null ? 1 : a.beforeShare, why: a.why });
    }
  }

  const sum = (arr) => arr.reduce((t, x) => t + (Number(x.value) || 0), 0);
  const inTasks = sum(list), inParked = sum(parked), inUnusable = sum(unusable);
  const total = inTasks + inParked + inUnusable;

  return { tasks: list, parked, unusable, suspectCounts, assumptions, alwaysOn: added,
    coverage: { lines, tasked: list.reduce((t, x) => t + x.lines.length, 0),
      parked: parked.length, unusable: unusable.length,
      value: { total, tasks: inTasks, parked: inParked, unusable: inUnusable,
        taskedShare: total ? Math.round(inTasks / total * 100) : 0 } },
    // the three lists add up to the bill, and the engine says so
    why: lines + " priced lines: " + list.reduce((t, x) => t + x.lines.length, 0) + " became work, " +
      parked.length + " are parked with no task, " + unusable.length +
      " matched a task but cannot produce a duration. Nothing was dropped." };
}

const S = { PACKAGE_CODE, RULES, UNITS, CONVERT, SQFT_TO_M2, normUnit, match, build };
root.CORE_SCOPE = S;
if (typeof module !== "undefined" && module.exports) module.exports = S;

})(typeof window !== "undefined" ? window : globalThis);
