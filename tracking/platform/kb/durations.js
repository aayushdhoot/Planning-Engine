// ===================================================================
// DnB-OS · platform/kb/durations.js
// How long each real task takes.  Every rate is NORMALISED to
// man-hours per unit (mh/unit) so a CPWD crew/day rate and a Methvin
// single-tradesman rate never get mixed up (the note in the research:
// mixing them is silently wrong by the crew factor).
//
//   base working-days = (qty x mhPerUnit) / (crew x hoursPerDay)
//
// The engine feeds base working-days into calendar.effectiveSpan(),
// which stretches them for monsoon / festivals / heat.  So durations
// here are the IDEAL effort; the calendar adds the real-world drag.
// Each norm carries rain/heat/exposure flags that tell the calendar
// whether to apply that drag — no double counting.
//
// Public contract:
//   NORMS                                  -> the seed table (array)
//   get(code)                              -> one norm
//   listByTrade()                          -> {trade:[norms]}
//   deriveDays(code, qty, opts)            -> {days, low, high, effortMh, crew, ...}
//   applyOnCalendar(code, qty, startISO, cal, opts) -> {start,end,days,...}
//
// mhPerUnit is precomputed from the published source rate (kept in
// `src` for traceability) as (srcCrew x srcHours) / srcRate.
// conf = how solid the number is: "high" published, "med" practitioner.
// ===================================================================

;(function () {

const HOURS_PER_DAY = 8;   // productive man-hours on an Indian fit-out day

// helper for readers: mh/unit from a man-day (crew 1) or crew-day rate
// (kept only as documentation — NORMS below store the computed value)

const NORMS = [
  // ---- DEMOLITION (interior strip-out) ----
  { code:"demo_floor_finish", name:"Removing floor finish",          trade:"demolition", unit:"m2", mhPerUnit:0.20, mhLow:0.16, mhHigh:0.24, crew:4, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin ~40 m2/man-day" },
  { code:"demo_ceiling",      name:"Removing ceiling",      trade:"demolition", unit:"m2", mhPerUnit:0.30, mhLow:0.24, mhHigh:0.36, crew:4, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin ~27 m2/man-day" },
  { code:"demo_partition",    name:"Removing partitions",           trade:"demolition", unit:"m2", mhPerUnit:0.40, mhLow:0.30, mhHigh:0.55, crew:4, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~20 m2/man-day" },

  // ---- CIVIL / WET ----
  { code:"blockwork",         name:"Block work",         trade:"civil", unit:"m2", mhPerUnit:1.60, mhLow:1.33, mhHigh:2.00, crew:3, rain:true,  heat:false, exposure:"interior", conf:"med",  src:"CPWD ~10 m2/crew-day (2)" },
  { code:"plaster",           name:"Plastering",            trade:"civil", unit:"m2", mhPerUnit:1.00, mhLow:0.80, mhHigh:1.30, crew:3, rain:true,  heat:false, exposure:"interior", conf:"med",  src:"CPWD ~8 m2/mason-day" },
  { code:"screed",            name:"Screed",                trade:"civil", unit:"m2", mhPerUnit:0.80, mhLow:0.60, mhHigh:1.10, crew:3, rain:true,  heat:false, exposure:"interior", conf:"med",  src:"~20 m2/crew-day (2); cure = lag" },
  { code:"waterproofing",     name:"Waterproofing",      trade:"civil", unit:"m2", mhPerUnit:1.07, mhLow:0.80, mhHigh:1.40, crew:2, rain:true,  heat:false, exposure:"interior", conf:"med",  src:"~15 m2/crew-day (2)" },

  // ---- DRYWALL & CEILING ----
  { code:"gi_stud_frame",     name:"Partition framing", trade:"drywall", unit:"m2", mhPerUnit:0.50, mhLow:0.44, mhHigh:0.57, crew:3, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin ~16 m2/man-day" },
  { code:"board_one_face",    name:"First side boarding",  trade:"drywall", unit:"m2", mhPerUnit:0.21, mhLow:0.20, mhHigh:0.22, crew:3, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin ~36-40 m2/man-day" },
  { code:"partition_tape",    name:"Taping and jointing", trade:"drywall", unit:"m2", mhPerUnit:0.25, mhLow:0.22, mhHigh:0.28, crew:3, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin ~32 m2/man-day" },
  { code:"ceiling_gypsum",    name:"Gypsum ceiling", trade:"ceiling", unit:"m2", mhPerUnit:0.42, mhLow:0.35, mhHigh:0.50, crew:3, rain:false, heat:false, exposure:"interior", conf:"med",  src:"Methvin ~32 m2/man-day board + grid" },
  { code:"ceiling_grid_tile", name:"Grid ceiling",   trade:"ceiling", unit:"m2", mhPerUnit:0.32, mhLow:0.27, mhHigh:0.38, crew:3, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin ~44 grid / ~57 tiles m2/man-day" },

  // ---- FLOORING ----
  { code:"tile_vitrified",    name:"Vitrified tiles",  trade:"flooring", unit:"m2", mhPerUnit:1.45, mhLow:1.07, mhHigh:2.00, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"CPWD 8-15 m2/crew-day (2)" },
  { code:"stone_marble",      name:"Stone flooring",     trade:"flooring", unit:"m2", mhPerUnit:3.20, mhLow:2.67, mhHigh:4.00, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"CPWD 4-6 m2/crew-day (2)" },
  { code:"carpet_tile",       name:"Carpet",     trade:"flooring", unit:"m2", mhPerUnit:0.12, mhLow:0.10, mhHigh:0.16, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~50-80 m2/man-day" },
  { code:"vinyl_lvt",         name:"Vinyl flooring",        trade:"flooring", unit:"m2", mhPerUnit:0.27, mhLow:0.22, mhHigh:0.35, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~30 m2/man-day" },
  { code:"raised_floor",      name:"Raised flooring",         trade:"flooring", unit:"m2", mhPerUnit:0.64, mhLow:0.50, mhHigh:0.80, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"~25 m2/crew-day (2)" },
  { code:"skirting",          name:"Skirting",                    trade:"flooring", unit:"m",  mhPerUnit:0.20, mhLow:0.15, mhHigh:0.27, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~40 m/man-day" },

  // ---- PAINTING ----
  { code:"paint_emulsion",    name:"Painting",    trade:"painting", unit:"m2", mhPerUnit:0.71, mhLow:0.64, mhHigh:0.80, crew:2, rain:false, heat:true,  exposure:"interior", conf:"high", src:"CPWD 20-25 m2/crew-day (2)" },
  { code:"putty_primer",      name:"Putty and primer",         trade:"painting", unit:"m2", mhPerUnit:0.53, mhLow:0.40, mhHigh:0.70, crew:2, rain:false, heat:true,  exposure:"interior", conf:"med",  src:"~30 m2/crew-day (2)" },
  // FINAL-COAT-LATE — 3-witness LAW (Addverb x4 floors held it to the end;
  // LS runs an explicit "Final Coat of Paint"; Firstsource holds 2nd coat
  // 15d for touch-up). The last pass is an end-of-job task, not part of
  // the main paint cycle.
  { code:"paint_final",      name:"Final coat", trade:"painting", unit:"m2", mhPerUnit:0.30, mhLow:0.24, mhHigh:0.40, crew:2, rain:false, heat:true, exposure:"interior", conf:"high", src:"corpus law (Addverb/LS/Firstsource): last coat rides just before snag & clean" },
  { code:"texture_paint",     name:"Texture finish",    trade:"painting", unit:"m2", mhPerUnit:1.60, mhLow:1.30, mhHigh:2.00, crew:2, rain:false, heat:true,  exposure:"interior", conf:"med",  src:"~10 m2/crew-day (2)" },

  // ---- JOINERY & GLAZING ----
  { code:"joinery_panel",     name:"Wall panelling",    trade:"joinery", unit:"m2", mhPerUnit:2.00, mhLow:1.60, mhHigh:2.50, crew:3, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin ~4 m2/man-day" },
  { code:"glazing_partition", name:"Glass partitions",trade:"joinery", unit:"m2", mhPerUnit:0.47, mhLow:0.32, mhHigh:0.80, crew:3, rain:false, heat:false, exposure:"interior", conf:"med",  src:"Methvin ~10-25 m2/day" },
  { code:"door_install",      name:"Doors",      trade:"joinery", unit:"no", mhPerUnit:4.00, mhLow:3.00, mhHigh:6.00, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~2 no/carpenter-day" },
  { code:"workstation",       name:"Workstations",       trade:"joinery", unit:"no", mhPerUnit:5.33, mhLow:4.00, mhHigh:7.00, crew:3, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~1.5 no/man-day" },
  { code:"storage_unit",      name:"Storage units", trade:"joinery", unit:"no", mhPerUnit:8.00, mhLow:6.00, mhHigh:11.0, crew:3, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~1 no/man-day" },

  // ---- MEP · ELECTRICAL ----
  { code:"conduit",           name:"Electrical conduit",          trade:"electrical", unit:"m",  mhPerUnit:0.11, mhLow:0.09, mhHigh:0.14, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin ~73 m/man-day" },
  { code:"cable_pull",        name:"Cable pulling",               trade:"electrical", unit:"m",  mhPerUnit:0.03, mhLow:0.025,mhHigh:0.04, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin ~267 m/man-day" },
  { code:"wiring_point",      name:"Switches and sockets",    trade:"electrical", unit:"no", mhPerUnit:0.53, mhLow:0.40, mhHigh:0.70, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~15 pt/man-day" },
  { code:"light_fixture",     name:"Light fittings",     trade:"electrical", unit:"no", mhPerUnit:0.32, mhLow:0.27, mhHigh:0.40, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~25 no/man-day" },
  { code:"db_panel",          name:"Distribution boards",        trade:"electrical", unit:"no", mhPerUnit:16.0, mhLow:12.0, mhHigh:22.0, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~1 no/crew-day (2)" },

  // ---- MEP · HVAC ----
  { code:"duct_gi",           name:"Ducting",  trade:"hvac", unit:"kg", mhPerUnit:0.11, mhLow:0.09, mhHigh:0.14, crew:3, rain:false, heat:false, exposure:"interior", conf:"high", src:"SMACNA 15-25 lb/hr (~7-11 kg/hr)" },
  { code:"duct_insulation",   name:"Duct insulation",             trade:"hvac", unit:"m2", mhPerUnit:0.53, mhLow:0.40, mhHigh:0.70, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"~30 m2/crew-day (2)" },
  { code:"fcu_unit",          name:"Indoor units", trade:"hvac", unit:"no", mhPerUnit:10.7, mhLow:8.00, mhHigh:14.0, crew:3, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~1.5 no/crew-day (2)" },
  { code:"grille_diffuser",   name:"Grills and diffusers",           trade:"hvac", unit:"no", mhPerUnit:0.67, mhLow:0.50, mhHigh:0.90, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~12 no/man-day" },
  { code:"refnet_pipe",       name:"Copper piping",          trade:"hvac", unit:"m",  mhPerUnit:0.40, mhLow:0.30, mhHigh:0.55, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~40 m/crew-day (2)" },

  // ---- MEP · PLUMBING / FIRE / ELV ----
  { code:"cpvc_pipe",         name:"Water and drainage pipes",     trade:"plumbing", unit:"m",  mhPerUnit:0.36, mhLow:0.27, mhHigh:0.50, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~45 m/crew-day (2)" },
  { code:"sanitary_fixture",  name:"Sanitary fittings",  trade:"plumbing", unit:"no", mhPerUnit:2.00, mhLow:1.50, mhHigh:3.00, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~4 no/plumber-day" },
  { code:"sprinkler_pipe",    name:"Fire sprinkler piping",       trade:"fire", unit:"m",  mhPerUnit:0.53, mhLow:0.40, mhHigh:0.70, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~30 m/crew-day (2)" },
  { code:"sprinkler_head",    name:"Sprinkler heads",              trade:"fire", unit:"no", mhPerUnit:0.40, mhLow:0.30, mhHigh:0.55, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~20 no/man-day" },
  { code:"data_drop",         name:"Data cabling",    trade:"elv", unit:"no", mhPerUnit:0.40, mhLow:0.32, mhHigh:0.53, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"BICSI 30-50 drops/day (2-tech)" },
  { code:"elv_device",        name:"CCTV and access control",     trade:"elv", unit:"no", mhPerUnit:1.00, mhLow:0.70, mhHigh:1.40, crew:2, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~8 no/man-day" },

  // ---- CLOSE-OUT ----
  { code:"final_clean",       name:"Deep cleaning",              trade:"closeout", unit:"m2", mhPerUnit:0.16, mhLow:0.12, mhHigh:0.22, crew:3, rain:false, heat:false, exposure:"interior", conf:"med",  src:"practitioner ~100 m2/crew-day (2)" },

  // ---- FROM THE FLIPSPACES PERT CORPUS (BFIL · TCS Noida · Addverb · Pivox — 4 delivered projects) ----
  // fixed-duration site tasks: unit "day", qty = planned days (corpus median)
  { code:"mobilisation",      name:"Mobilisation",      trade:"closeout", baseDays:5, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"high", src:"PERT corpus: 2-7d, median 3" },
  { code:"gfc_pack",          name:"Drawings",trade:"closeout", baseDays:10, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"med",  src:"PERT corpus: BFIL 29d full set, TCS 23d MEP; remaining scope sets qty" },
  { code:"samples_mockups",   name:"Samples",  trade:"closeout", baseDays:10, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"med",  src:"PERT corpus: TCS 8-38d by material, Pivox 4d" },
  { code:"pest_control",      name:"Pest control",  trade:"closeout", baseDays:2, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"BFIL 3d · TCS 5d" },
  { code:"temporary_lighting",name:"Temporary lighting",     trade:"electrical",baseDays:3, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"TCS 5d, first site act" },
  { code:"protection_covering",name:"Floor protection", trade:"closeout", baseDays:4, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"TCS 2d · BFIL 4d per area" },
  { code:"signage_evac",      name:"Extinguishers and signage", trade:"fire", baseDays:3, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"BFIL/TCS 1d each x3 items" },
  // per-system testing & commissioning (corpus: every system carries supply->install->T&C)
  { code:"tc_electrical",     name:"Electrical testing", trade:"electrical", baseDays:4, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"corpus 2-5d + panel T&C" },
  { code:"tc_hvac",           name:"HVAC testing", trade:"hvac", baseDays:5, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"corpus 2d + AHU dry run 2d" },
  { code:"tc_plumbing",       name:"Plumbing testing", trade:"plumbing", baseDays:3, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"corpus 2-5d incl. pipe test" },
  { code:"tc_fire",           name:"Fire system testing", trade:"fire", baseDays:4, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"corpus: sprinkler 3-10d, FA 3-7d" },
  { code:"tc_elv",            name:"ELV testing", trade:"elv", baseDays:4, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"corpus: ACS/CCTV 4d, networking 2-6d" },
  // countable installs
  { code:"toilet_cubicle",    name:"Toilet cubicles",      trade:"joinery",  unit:"no", mhPerUnit:4.0, mhLow:3.0, mhHigh:5.5, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Addverb: phenolic set 3d install" },
  { code:"washroom_accessories", name:"Washroom accessories",    trade:"plumbing", unit:"no", mhPerUnit:1.0, mhLow:0.8, mhHigh:1.5, crew:1, rain:false, heat:false, exposure:"interior", conf:"med", src:"Addverb/TCS: dispensers, mirrors, holders 1-4d" },
  { code:"floor_raceway",    name:"Floor raceways", trade:"electrical", unit:"m", mhPerUnit:0.35, mhLow:0.28, mhHigh:0.5, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Kaizen View/MyBuildGuide videos + TCS PERT (marking 6d, chipping 13d, install 10d): laid on slab, screed covers them" },
  { code:"snag_cycle",        name:"Snagging", trade:"closeout", baseDays:12, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:4, rain:false, heat:false, exposure:"interior", conf:"high", src:"course norm: 4-pass cycle, 2-4wk band overlapping Cx closeout; ~10-20 snags/1000 sqft" },
  { code:"mock_fire_drill",   name:"Fire drill", trade:"fire", baseDays:1, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"India NOC practice: internal mock T-10wd before officer visit; drill records demanded" },
  { code:"fire_noc",          name:"Fire NOC", trade:"fire", baseDays:15, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"low", src:"NBC 2016 + state practice: 30-60d post T&C; CONFIRM applicability for fit-out in OC'd building" },
  { code:"handover_file",     name:"Handover papers", trade:"closeout", baseDays:8, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"high", src:"BSRIA BG79: ~14 line items; O&M collected from PO stage, assembled at end" },
  { code:"fm_training",       name:"FM training", trade:"closeout", baseDays:2, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"ASHRAE G0 / Soft Landings: structured sessions post-FPT, recorded into handover file" },
  { code:"ceiling_tiles",     name:"Ceiling tiles", trade:"ceiling", unit:"m2", mhPerUnit:0.14, mhLow:0.11, mhHigh:0.18, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin tile lay 0.14 mh/m2 — LAST clean work after paint (R33-38)" },
  { code:"board_close",       name:"Gypsum partitions",  trade:"drywall", unit:"m2", mhPerUnit:0.22, mhLow:0.18, mhHigh:0.28, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Methvin fix-only 0.20-0.22 mh/m2; closes ONLY after in-wall MEP clears (MoS stage-2)" },
  { code:"insulation_partition", name:"Partition insulation",  trade:"drywall", unit:"m2", mhPerUnit:0.15, mhLow:0.12, mhHigh:0.20, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Methvin quilt ~0.15 mh/m2; mechanically retained (MoS R30)" },
  { code:"circuit_wiring",    name:"Circuit wiring", trade:"electrical", unit:"no", mhPerUnit:0.8, mhLow:0.6, mhHigh:1.1, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"MEP norms: wire 200m/man-day rolled to ~0.8 mh/point (research 11a)" },
  { code:"ws_power_data",     name:"Desk power and data", trade:"electrical", unit:"no", mhPerUnit:3.0, mhLow:2.2, mhHigh:4.0, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"HIS catch + BFIL: routing power/data cables & socket fixing INSIDE installed workstations, 8d/42WS" },
  { code:"network_rack",      name:"Network racks", trade:"elv",      unit:"no", mhPerUnit:8.0, mhLow:6.0, mhHigh:12.0, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"TCS: racks 10d/several · Pivox network zone 8d" },
  // LIFE agent hole #1: tc_fire tested "FA 3-7d" but NOTHING installed the
  // fire-alarm devices — detection existed only as a test scope. Closed.
  { code:"fa_device",         name:"Fire alarm", trade:"fire", unit:"no", mhPerUnit:1.0, mhLow:0.8, mhHigh:1.4, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"IS 2189 layouts; practitioner ~8-10 devices/tech-day incl. loop test" },

  // -- D5 SCOPE HOLES (panel): work that existed on site but not in the library
  { code:"condensate_drain",  name:"Drain piping", trade:"plumbing", unit:"m",  mhPerUnit:0.20, mhLow:0.16, mhHigh:0.28, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"25mm uPVC/CPVC from each IDU to riser, incl. insulation · MEP norms" },
  { code:"kitchen_hood",      name:"Kitchen exhaust",   trade:"hvac",     unit:"no", mhPerUnit:16,   mhLow:12,  mhHigh:24,  crew:3, rain:false, heat:false, exposure:"interior", conf:"med", src:"SS fabricated hood set + duct collar + balancing · practitioner" },
  { code:"toilet_exhaust",    name:"Toilet exhaust",      trade:"hvac",     unit:"no", mhPerUnit:4.0,  mhLow:3.0, mhHigh:6.0, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"inline fan + louvre + stub per washroom · practitioner" },
  { code:"core_cut",          name:"Core cutting",    trade:"civil",    unit:"no", mhPerUnit:2.5,  mhLow:2.0, mhHigh:3.5, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"100-150mm cores incl. permit handling · practitioner" },
  { code:"firestop",          name:"Firestopping",  trade:"fire",     unit:"no", mhPerUnit:1.2,  mhLow:0.9, mhHigh:1.8, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"intumescent sealant/collars per opening · IS/UL practice" },
  { code:"blinds_film",       name:"Blinds and film",                 trade:"joinery",  unit:"m2", mhPerUnit:0.25, mhLow:0.20, mhHigh:0.35, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"roller blinds + frost/branding film · practitioner ~30-40 m2/day" },
  { code:"graphics_planters", name:"Graphics and planters",        trade:"closeout", unit:"no", mhPerUnit:2.0,  mhLow:1.5, mhHigh:3.0, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"wall graphics/branding + planter placement · contract exhibit" },

  // -- EMIRATES CORPUS GROWTH (13 Jul): 23 codes the Mumbai plan proved
  //    exist on real Flipspaces sites but not in this library. Durations
  //    cite corpus.js evidence (elapsed-day bands; rates refine when a
  //    plan arrives with quantities).
  { code:"lineout_marking",  name:"Marking",       trade:"civil",    baseDays:3, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Emirates: 2d marking + 1d checking&approval before civil" },
  { code:"self_leveling",    name:"Floor levelling",  trade:"civil",    unit:"m2", mhPerUnit:0.10, mhLow:0.08, mhHigh:0.14, crew:3, rain:true, heat:false, exposure:"interior", conf:"high", src:"Emirates: SL 7d + PCC 10d + modifoam 7d passes" },
  { code:"pop_punning",      name:"POP punning",                       trade:"civil",    unit:"m2", mhPerUnit:0.35, mhLow:0.28, mhHigh:0.45, crew:3, rain:true, heat:false, exposure:"interior", conf:"high", src:"CPWD punning norms · Emirates 6d after plaster" },
  { code:"epoxy_flooring",   name:"Epoxy flooring",          trade:"flooring", unit:"m2", mhPerUnit:0.25, mhLow:0.20, mhHigh:0.35, crew:3, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: epoxy 7d + engineered concrete 10d, late-stage pours" },
  { code:"wall_dado",        name:"Dado tiles",      trade:"flooring", unit:"m2", mhPerUnit:1.45, mhLow:1.07, mhHigh:2.00, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"CPWD tiling rate · Emirates dado 14d" },
  { code:"wallpaper",        name:"Wallpaper",   trade:"painting", unit:"m2", mhPerUnit:0.30, mhLow:0.24, mhHigh:0.40, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Emirates: base prep 7d + install 15d after paint" },
  { code:"lacquered_glass",  name:"Lacquered glass", trade:"joinery", unit:"m2", mhPerUnit:1.20, mhLow:0.95, mhHigh:1.60, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: 20d late wall finish" },
  { code:"fluted_panel",     name:"Acoustic panelling",       trade:"joinery",  unit:"m2", mhPerUnit:0.80, mhLow:0.64, mhHigh:1.05, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: 14d after paint" },
  { code:"stretch_ceiling",  name:"Stretch ceiling",trade:"ceiling",  unit:"m2", mhPerUnit:0.35, mhLow:0.28, mhHigh:0.48, crew:3, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: ply frame 10d, material ~6wk lead, install 5d" },
  { code:"metal_ceiling",    name:"Designer ceiling",  trade:"ceiling",  unit:"m2", mhPerUnit:0.90, mhLow:0.70, mhHigh:1.20, crew:3, rain:false, heat:false, exposure:"interior", conf:"high", src:"Emirates: fabricated 15d / decorative 20d" },
  { code:"fire_door",        name:"Fire doors",       trade:"joinery",  unit:"no", mhPerUnit:6.0, mhLow:4.5, mhHigh:8.0, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Emirates: order 15 Nov -> install 22 Jan, ~10wk order-to-done" },
  { code:"vav_unit",         name:"VAV boxes",                 trade:"hvac",     unit:"no", mhPerUnit:6.0, mhLow:4.8, mhHigh:8.0, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: 5d for the floor's VAVs" },
  { code:"fire_damper",      name:"Fire dampers", trade:"hvac",     unit:"no", mhPerUnit:4.0, mhLow:3.2, mhHigh:5.5, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: dampers 10d + control panels 7d" },
  { code:"ahu_unit",         name:"AHU", trade:"hvac", baseDays:6, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:4, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: install 10d + acoustic insulation 7d + dry run 3d (supply 30d = lead)" },
  { code:"precision_ac",     name:"Precision AC",        trade:"hvac",     baseDays:6, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:3, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: supply 15d + install 10d" },
  { code:"ups_battery",      name:"UPS",trade:"electrical",baseDays:6, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Emirates: install 5+5 + T&C 2+2 (supplies = lead)" },
  { code:"pa_system",        name:"PA system",trade:"elv",      baseDays:6, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: cabling 20d + speakers 7d + T&C 4d" },
  { code:"wld_system",       name:"Water leak detection",       trade:"elv",      baseDays:4, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Emirates: raceway 10 + cabling 10 + devices 7 + T&C 2" },
  { code:"rodent_system",    name:"Rodent repellent",           trade:"elv",      baseDays:3, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"high", src:"Emirates: 31d chain in server/critical areas" },
  { code:"gas_suppression",  name:"Gas suppression",           trade:"fire",     baseDays:6, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: supply 10 + install 7 + T&C 2 (+VESDA parallel)" },
  { code:"bms_integration",  name:"BMS",                   trade:"elv",      baseDays:8, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: 15d after systems land" },
  { code:"av_system",        name:"AV systems",                   trade:"elv",      baseDays:6, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: cabling 10 + delivery 5 + install 5 — the LAST system on site" },
  { code:"white_goods",      name:"White goods",    trade:"closeout", baseDays:3, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"Emirates: supply 2 + install 3, final week" },
  { code:"plywood_backing",  name:"Ply backing", trade:"drywall", unit:"m2", mhPerUnit:0.30, mhLow:0.24, mhHigh:0.40, crew:2, rain:false, heat:false, exposure:"interior", conf:"med", src:"DHL ply supports + LS 'Ply backing' x3 (3-18d) — backing for TVs, joinery, sanitaryware fixing" },
  { code:"odu_unit",         name:"Outdoor units", trade:"hvac", unit:"no", mhPerUnit:12, mhLow:9, mhHigh:16, crew:3, rain:true, heat:false, exposure:"exterior", conf:"med", src:"DHL: ODU install 5d (pulled -30 early) · Kohler KT: ODU lead 8-10wk CRITICAL (D8)" },
  { code:"statutory_liaison",name:"Statutory approvals", trade:"statutory", baseDays:15, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"low", src:"Emirates Mumbai: BMC 15d + Fire NOC & Mathadi 86d from day 1 — CONFIRM per city" },

  // -- THE ENABLING CHAIN (his point 9): design, approvals, procurement,
  //    vendor onboarding and delivery as FIRST-CLASS DATED TASKS, not
  //    invisible lead-time offsets. One generic norm per stage; the
  //    package table in sequence.js sets each package's quantities.
  //    Day-unit: duration-driven — desks and vendors, not site crews.
  { code:"pkg_design",    name:"Shop drawings",      trade:"enabling", baseDays:15, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"med",  src:"D&B practice: package drawing production 5-12wd by complexity" },
  { code:"pkg_approval",  name:"Client approval",    trade:"enabling", baseDays:7, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"med",  src:"client SLA — default 5wd; CONFIRM contract approval windows" },
  { code:"pkg_po",        name:"Vendor order",           trade:"enabling", baseDays:7, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"med",  src:"award + PO + vendor onboarding · practitioner 2-4wd" },
  { code:"pkg_submittal", name:"Material approval",  trade:"enabling", baseDays:10, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"med",  src:"vendor submits, client/PMC approves · CSI practice 5wd" },
  { code:"pkg_mfg",       name:"Manufacturing",     trade:"enabling", baseDays:20, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"med",  src:"LONGLEAD weeks converted to working days minus PO+submittal+delivery" },
  { code:"pkg_delivery",  name:"Delivery",            trade:"enabling", baseDays:3, unit:"day", mhPerUnit:8, mhLow:8, mhHigh:8, crew:1, rain:false, heat:false, exposure:"interior", conf:"high", src:"receipt, inspection, storage · 1wd" },
];

const BY_CODE = {};
NORMS.forEach(n => BY_CODE[n.code] = n);

function get(code) { return BY_CODE[code] || null; }

function listByTrade() {
  const out = {};
  NORMS.forEach(n => { (out[n.trade] = out[n.trade] || []).push(n); });
  return out;
}

// base working-days of effort (before the calendar's weather drag)
// LAW (panel D1): unit==="day" norms are DURATION-driven, not effort-driven.
// qty IS the working days; crew sizes the cost, never the calendar. Adding
// men to a fire-NOC wait, a T&C dry-run or a snag cycle does not shorten it.
// The old path (qty*8 / crew*8 = qty/crew) silently halved every crew-2
// closeout task and quartered 4-crew snagging.
function deriveDays(code, qty, opts) {
  opts = opts || {};
  const n = BY_CODE[code];
  if (!n) throw new Error("deriveDays: unknown code " + code);
  const crew = opts.crew || n.crew;
  const hpd = opts.hoursPerDay || HOURS_PER_DAY;
  if (n.unit === "day") {
    const days = qty;                          // days in = days out
    return {
      code, name: n.name, trade: n.trade, unit: n.unit, qty,
      crew, hoursPerDay: hpd,
      effortMh: +(qty * crew * hpd).toFixed(1), // honest effort: crew held for the duration
      days: +days.toFixed(2),
      low: +days.toFixed(2),
      high: +days.toFixed(2),
      conf: n.conf, rain: n.rain, heat: n.heat, exposure: n.exposure, src: n.src,
    };
  }
  const div = crew * hpd;
  const effortMh = qty * n.mhPerUnit;
  const days = effortMh / div;
  return {
    code, name: n.name, trade: n.trade, unit: n.unit, qty,
    crew, hoursPerDay: hpd,
    effortMh: +effortMh.toFixed(1),
    days: +days.toFixed(2),
    low: +(qty * n.mhLow / div).toFixed(2),
    high: +(qty * n.mhHigh / div).toFixed(2),
    conf: n.conf, rain: n.rain, heat: n.heat, exposure: n.exposure, src: n.src,
  };
}

// full chain: base days -> real start/finish on a project calendar
// (weather drag applied here, once, via the calendar)
function applyOnCalendar(code, qty, startISO, cal, opts) {
  const d = deriveDays(code, qty, opts);
  const CAL = (typeof require !== "undefined") ? require("./calendar.js")
            : (typeof window !== "undefined" ? window.KB_CAL : globalThis.KB_CAL);
  const act = { rainSensitive: d.rain, heatSensitive: d.heat, exposure: d.exposure };
  const span = CAL.effectiveSpan(startISO, d.days, act, cal);
  return Object.assign(d, {
    start: span.start, end: span.end,
    calendarDays: span.calendarDays, drivers: span.drivers,
  });
}

// ---- dual-mode export ----
const DUR = { NORMS, get, listByTrade, deriveDays, applyOnCalendar, HOURS_PER_DAY };
(function (g) { g.KB_DUR = DUR; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = DUR;

})();
