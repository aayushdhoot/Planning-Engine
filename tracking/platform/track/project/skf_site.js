// ===================================================================
// DnB-OS . platform/track/project/skf_site.js
// SITE TRACKING PACK . SKF Pune . as of 16 Jul 2026 (last DPR day)
// The whole site: every baseline task (plan xlsx-v1, 63 rows) grouped
// by trade, scored by the status law. Curated from absorbed sources,
// nothing invented:
//   . baseline dates + actuals: "Ptoject Schedule & Milestone - SKF.xlsx"
//   . commitments: the 30 Vizdom PO extracts (Drive 03.1)
//   . evidence: WhatsApp DPR verbatim (04 to 16 Jul), Wk4 tracker
//     (flagged 10 days stale), schedule actual columns
// Civil Works stays deep in skf_track_civil.js; this pack points at it
// so the site view shows one site under one law without duplication.
// ===================================================================

;(function (root) {

// Wk4 tracker rows are dated around 07 Jul and were 10 days old when
// absorbed. Every Wk4 claim below carries this flag.
const STALE = "Wk4 tracker claim, sheet was 10 days stale when absorbed";

const SITE = {

  name: "SKF Pune site",
  asOf: "2026-07-18",
  queryPrefix: "site ",
  planVersion: "xlsx-v1",

  context: {
    note: "63 baseline tasks from plan xlsx-v1, grouped by trade. Civil Works is tracked deep in its own pack and pointed at here.",
    line: "Baseline plan xlsx-v1 · 63 tasks · evidence to 16 Jul 2026 · DPR chat covers 04 to 16 Jul, earlier windows lean on the schedule's own actual columns"
  },

  // ---- input channels: how evidence reaches the engine ---------------
  channels: [
    { id: "pins_app", name: "Supervisor pin photos", carries: "daily 12pm walk, 81 frozen pins, ghost overlay",
      cadence: "daily", status: "waiting", lastSeen: null,
      note: "capture app live on the Apps Script link since 17 Jul 2026, supervisor link shared, first upload awaited. The Site tab's walk map reads the same link back." },
    { id: "dpr", name: "WhatsApp DPR export", carries: "daily manpower and progress report, photos, site chatter",
      cadence: "daily posts, exported in batches", status: "live", lastSeen: "2026-07-16" },
    { id: "design_register", name: "GFC drawing tracker", carries: "58 drawings, status and approval per sheet",
      cadence: "weekly", status: "live", lastSeen: "2026-07-16" },
    { id: "po", name: "Vizdom PO extracts", carries: "30 POs, committed value 6,19,93,631",
      cadence: "on release", status: "live", lastSeen: "2026-07-16",
      note: "Vizdom prints the latest revision date as Order Date on every PO, release dates are unreliable" },
    { id: "grn", name: "GRN and delivery notes", carries: "material arrivals, quantities, damage",
      cadence: "on delivery", status: "waiting", lastSeen: null,
      note: "arrivals are known only from DPR chat lines (plumbing 07 Jul, blocks 13 Jul, tiles 15 Jul with a damaged box, ducting 16 Jul). No GRN document has reached the engine." },
    { id: "email", name: "Email export", carries: "client and vendor threads",
      cadence: "once or twice a week, manual export by Sourabh", status: "waiting", lastSeen: null },
    { id: "makelist", name: "Makelist brand check", carries: "approved brands vs what packaging photos show",
      cadence: "with deliveries", status: "waiting", lastSeen: null,
      note: "makelist sits with the BOQ, brand checks start when the capture app photographs packaging" },
    { id: "cctv", name: "CCTV frames (ezykam+, CP Plus)", carries: "3 frames per day when live",
      cadence: "daily", status: "hold", lastSeen: null, note: "integration parked by decision, placeholder kept" },
    { id: "img360", name: "360 walk dump", carries: "inference reading only, never area mapped",
      cadence: "daily dump to Drive", status: "hold", lastSeen: null, note: "integration parked by decision, placeholder kept" }
  ],

  // ---- commitments referenced by tasks (from the 30 absorbed POs) ----
  commitments: [
    { po: "FSL2026272024", vendor: "M.N. ELECTRICALS", value: 1817757, scope: "fire sprinkler and drencher works" },
    { po: "FSL2026272062", vendor: "METRO AIR", value: 11209561, scope: "HVAC VRF package, low and high side" },
    { po: "FSL2026272077", vendor: "A.R KHAN", value: 600000, scope: "plumbing works, 16 toilets" },
    { po: "FSL2026272212", vendor: "PACIFIC", value: 396480, scope: "toilet cubicles, 16 nos" },
    { po: "FSL2026272068", vendor: "ARSELEX", value: 11800000, scope: "complete electrical works" },
    { po: "FSL2026272128", vendor: "TRIANGULAR", value: 2124000, scope: "UPS 80/20/6 KVA" },
    { po: "FSL2026272072", vendor: "POWER ZONE", value: 1216238, scope: "Philips light fixtures" },
    { po: "FSL2026272161", vendor: "M.N. ELECTRICALS", value: 2451810, scope: "fire alarm + PA + rodent + WLD + CCTV" },
    { po: "FSL2026272008", vendor: "RAZA INTERIOR", value: 3969890, scope: "gypsum partitions 735 sqm + ceiling 550 sqm" },
    { po: "FSL2026272193", vendor: "EUROCEIL", value: 413720, scope: "stretch ceiling 377 sqft" },
    { po: "FSL2026272194", vendor: "UNITED ACCESS", value: 137140, scope: "raised floor 30 sqm" },
    { po: "FSL2026272195", vendor: "WESTCHEM", value: 91173, scope: "epoxy flooring 30 + 15 sqm" },
    { po: "FSL2026272167", vendor: "WELSPUN", value: 1881144, scope: "carpet tiles 1270 + 225 sqmt" },
    { po: "FSL2026272122", vendor: "JYOTI ENTERPRISES", value: 964060, scope: "painting 2100 + 2200 sqm" },
    { po: "FSL2026272129", vendor: "FEATHERLITE", value: 9148057.4, scope: "modular furniture, 305 workstations + 414 chairs" },
    { po: "FSL2026272180", vendor: "TRIANGULAR", value: 5254233.4, scope: "networking, Cat6A" },
    { po: "FSL2026272165", vendor: "AYUSHRI", value: 1286200, scope: "call booths 2 + 2" }
  ],

  // ---- material arrivals: the delivered layer ------------------------
  // No GRN document has reached the engine. Every arrival below is
  // known from a DPR chat line, so each is a claim, never verified.
  grn: [
    { day: "2026-07-06", material: "Plumbing material", po: "FSL2026272077", vendor: "A.R KHAN",
      tag: "claimed", note: "DPR: Plumbing material received at site", issue: null },
    { day: "2026-07-13", material: "AAC blocks / block work material", po: null, vendor: null,
      tag: "claimed", note: "DPR: block material received (civil)", issue: null },
    { day: "2026-07-15", material: "Vitrified tiles", po: null, vendor: null,
      tag: "claimed", note: "DPR: tiles received", issue: "one box reported damaged in the DPR, no GRN raised" },
    { day: "2026-07-16", material: "HVAC ducting material", po: "FSL2026272062", vendor: "METRO AIR",
      tag: "claimed", note: "DPR: ducting material received at site", issue: null }
  ],

  // ---- the site groups, every baseline task under the law ------------
  // Civil Works is injected at runtime from TRACK_CIVIL (see groups()).
  groupsRaw: [

    { name: "Preliminaries", tasks: [
      { name: "Mobilization Period", sub: "Enabling",
        planned: { start: "2026-06-03", finish: "2026-06-04" },
        commitments: [], materials: [], measured: null,
        evidence: [
          { day: "2026-07-04", kind: "claim", completes: true,
            text: "No mobilization record exists, but daily DPR reports run from 04 Jul with a manned, working site. Mobilization is evidently complete, claimed on that basis, not verified." }
        ] },
      { name: "Site Marking & preparation works", sub: "Enabling",
        planned: { start: "2026-06-08", finish: "2026-06-14" },
        commitments: [], materials: [], measured: null,
        evidence: [
          { day: "2026-06-16", kind: "schedule", completes: true,
            text: "Schedule actuals: started 07 Jun, finished 16 Jun, marked Completed (schedule entry, no visual proof)" }
        ] },
      { name: "Temporary Power", sub: "Enabling",
        planned: { start: "2026-06-10", finish: "2026-06-12" },
        commitments: [], materials: [], measured: null,
        evidence: [
          { day: "2026-06-12", kind: "schedule", completes: true,
            text: "Schedule actuals: started 11 Jun, finished 12 Jun, marked Completed (schedule entry, no visual proof)" }
        ] }
    ] },

    { name: "Fire Sprinklers", boqCode: "G1", tasks: [
      { name: "C' Class Sprinkler Piping (Grooved)", sub: "Wet side",
        planned: { start: "2026-06-27", finish: "2026-07-15" },
        commitments: ["FSL2026272024"], materials: [], measured: null,
        evidence: [
          { day: "2026-07-05", kind: "claim", text: "DPR: FS: Headers Joining; Main Header line Connecting" },
          { day: "2026-07-06", kind: "claim", text: "DPR: FS: Headers Joining; Main Header line Connecting" },
          { day: "2026-07-11", kind: "claim", text: "DPR: Fire Fighting: Main header Connection (fire fighting labour 03)" }
        ] },
      { name: "Alarm Valve Assembly & Flow Switch installation", sub: "Wet side",
        planned: { start: "2026-06-29", finish: "2026-07-18" },
        commitments: ["FSL2026272024"], materials: [], measured: null, evidence: [] },
      { name: "Pendent/Upright Sprinklers & Flexible Drops", sub: "Wet side",
        planned: { start: "2026-07-02", finish: "2026-07-20" },
        commitments: ["FSL2026272024"], materials: [], measured: null, evidence: [] },
      { name: "Sprinkler Testing and Commissioning", sub: "T&C",
        planned: { start: "2026-07-18", finish: "2026-07-21" },
        commitments: ["FSL2026272024"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "HVAC Low Side", boqCode: "D1", tasks: [
      { name: "G.I. Sheet Ducting Fabrication & Installation", sub: "Ducting",
        planned: { start: "2026-07-04", finish: "2026-07-22" },
        commitments: ["FSL2026272062"],
        materials: [{ day: "2026-07-16", text: "DPR chat: ducting material arrival noted 16 Jul, no GRN document" }],
        measured: null,
        evidence: [
          { day: "2026-07-05", kind: "claim", text: "DPR: HVAC: Duct Insulation; Supporting installation; Duct Shifting and Stacking" },
          { day: "2026-07-06", kind: "claim", text: "DPR: HVAC: Duct Insulation; Supporting installation; Duct Installation; Duct Fabrication" },
          { day: "2026-07-07", kind: "claim", text: "DPR: HVAC: Duct Insulation; Duct Fabrication. Separate chat line: Ducting work in progress" },
          { day: "2026-07-07", kind: "claim", text: "Wk4 tracker: HVAC ducting Blocked, 15%, reason GFC M-100 not released. Conflicts with same-week DPR fabrication lines. " + STALE },
          { day: "2026-07-12", kind: "claim", text: "DPR (report of 11 Jul): HVAC: Duct Fabrication (HVAC labour 02)" },
          { day: "2026-07-13", kind: "claim", text: "DPR (report of 12 Jul): HVAC: Duct Fabrication" }
        ] },
      { name: "Milestone: Duct Light Testing (Pre-Insulation)", sub: "Milestone",
        planned: { start: "2026-07-16", finish: "2026-07-18" },
        commitments: ["FSL2026272062"], materials: [], measured: null, evidence: [] },
      { name: "Thermal & Acoustic Insulation (Armasound/Nitrile)", sub: "Insulation",
        planned: { start: "2026-07-18", finish: "2026-07-27" },
        commitments: ["FSL2026272062"], materials: [], measured: null,
        evidence: [
          { day: "2026-07-05", kind: "claim", text: "DPR names Duct Insulation from 05 Jul, well before this window and before the pre-insulation light test. Likely factory pre-insulated duct, but the sequence conflict is real and is raised as a query." },
          { day: "2026-07-07", kind: "claim", text: "DPR: Duct Insulation continuing" }
        ] },
      { name: "Grilles, Diffusers, Fire Dampers, Attenuators & Actuators", sub: "Air side",
        planned: { start: "2026-07-21", finish: "2026-07-30" },
        commitments: ["FSL2026272062"], materials: [], measured: null, evidence: [] },
      { name: "Battery Room Ventilation", sub: "Air side",
        planned: { start: "2026-07-18", finish: "2026-07-22" },
        commitments: ["FSL2026272062"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "HVAC High Side", boqCode: "D1", tasks: [
      { name: "Refrigerant Piping & cable Trays", sub: "VRF",
        planned: { start: "2026-07-05", finish: "2026-07-16" },
        commitments: ["FSL2026272062"], materials: [], measured: null, evidence: [] },
      { name: "Indoor Units Installations", sub: "VRF",
        planned: { start: "2026-07-21", finish: "2026-07-28" },
        commitments: ["FSL2026272062"], materials: [], measured: null, evidence: [] },
      { name: "VRV Equipments and ODUs", sub: "VRF",
        planned: { start: "2026-07-16", finish: "2026-07-21" },
        commitments: ["FSL2026272062"], materials: [], measured: null, evidence: [] },
      { name: "HVAC Testing and Commissioning", sub: "T&C",
        planned: { start: "2026-07-28", finish: "2026-07-31" },
        commitments: ["FSL2026272062"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Plumbing & Drainage", boqCode: "E1", tasks: [
      { name: "uPVC SWR Soil/Waste pipes (In-filling/Chasing)", sub: "Drainage",
        planned: { start: "2026-06-29", finish: "2026-07-06" },
        commitments: ["FSL2026272077"],
        materials: [{ day: "2026-07-06", text: "DPR: Plumbing: Material Received and Shifting to site (arrival only, no work line, no GRN)" }],
        measured: null, evidence: [] },
      { name: "Internal Water Supply Piping", sub: "Supply",
        planned: { start: "2026-07-04", finish: "2026-07-11" },
        commitments: ["FSL2026272077"], materials: [], measured: null, evidence: [] },
      { name: "Grease Traps, Multi Traps & Floor Grating", sub: "Drainage",
        planned: { start: "2026-07-10", finish: "2026-07-12" },
        commitments: ["FSL2026272077"], materials: [], measured: null, evidence: [] },
      { name: "Toilet Wall & Ceiling finishes", sub: "Finishes",
        planned: { start: "2026-07-12", finish: "2026-07-21" },
        commitments: ["FSL2026272077"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Toilet Fittings & Fixtures", boqCode: "E1", tasks: [
      { name: "Toilet Cubicle Installation", sub: "Fixtures",
        planned: { start: "2026-07-18", finish: "2026-07-23" },
        commitments: ["FSL2026272212"], materials: [], measured: null, evidence: [] },
      { name: "Sanitary Fixtures & Fittings, Second Fix", sub: "Fixtures",
        planned: { start: "2026-07-21", finish: "2026-07-26" },
        commitments: ["FSL2026272077"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Electrical", boqCode: "C1", tasks: [
      { name: "GI Cable Trays, Trunking & MS Support Fix", sub: "Containment",
        planned: { start: "2026-07-02", finish: "2026-07-23" },
        commitments: ["FSL2026272068"], materials: [], measured: null,
        evidence: [
          { day: "2026-07-05", kind: "claim", text: "DPR: Electricals: Raceway Laying; Raceway Cutting and Chipping" },
          { day: "2026-07-06", kind: "claim", text: "DPR: Electricals: Raceway Laying" },
          { day: "2026-07-07", kind: "claim", text: "DPR: Electricals: Raceway Laying" },
          { day: "2026-07-11", kind: "claim", text: "DPR night shift (10 Jul): Floor cutting work and MS conduit routing carried out" },
          { day: "2026-07-12", kind: "claim", text: "DPR: Floor Cutting and Chipping for Raceway, work station area. Night shift: revised raceway marking" },
          { day: "2026-07-13", kind: "claim", text: "DPR: Floor Cutting and Chipping for Raceway continuing. Night shift: floor raceway cutting in progress" }
        ] },
      { name: "GI Conduiting & Switch/Point Back-boxes", sub: "Containment",
        planned: { start: "2026-07-09", finish: "2026-07-30" },
        commitments: ["FSL2026272068"], materials: [], measured: null,
        evidence: [
          { day: "2026-07-05", kind: "claim", text: "DPR: Electricals: Conduit Installation in gypsum partition" },
          { day: "2026-07-07", kind: "claim", text: "Wk4 tracker: Electrical 1st fix In progress, 20%. " + STALE },
          { day: "2026-07-08", kind: "claim", text: "DPR night shift (07 Jul): Junction Box Fixing in gypsum Partition; Conducting" },
          { day: "2026-07-08", kind: "claim", text: "DPR: Electricals: Conduiting in partition" },
          { day: "2026-07-10", kind: "claim", text: "DPR night shift (09 Jul): Cabin ceiling conduit work is going on" },
          { day: "2026-07-11", kind: "claim", text: "DPR: Conduiting in partition at Compactor Room, Cabins, Reception area" },
          { day: "2026-07-12", kind: "claim", text: "DPR: Ceiling Conduit, Passage area and Work Station Area" },
          { day: "2026-07-13", kind: "claim", text: "DPR: Ceiling Conduit, Passage area and Work Station Area continuing" }
        ] },
      { name: "Point wiring Circuits mains and DB's", sub: "Wiring",
        planned: { start: "2026-07-16", finish: "2026-08-06" },
        commitments: ["FSL2026272068"], materials: [], measured: null, evidence: [] },
      { name: "LT Panel Cabling", sub: "High side",
        planned: { start: "2026-07-21", finish: "2026-08-01" },
        commitments: ["FSL2026272068", "FSL2026272128"], materials: [], measured: null, evidence: [] },
      { name: "Panel Installation, Testing & Commissioning", sub: "High side",
        planned: { start: "2026-07-30", finish: "2026-08-02" },
        commitments: ["FSL2026272068", "FSL2026272128"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "FAS & PA", boqCode: "C1", tasks: [
      { name: "Red/Black Armored Cabling for FAS/PA/CCTV", sub: "Cabling",
        planned: { start: "2026-07-11", finish: "2026-07-26" },
        commitments: ["FSL2026272161"], materials: [], measured: null,
        evidence: []
        // FAS labour (03) appears in DPR counts from 05 Jul but no DPR line
        // names FAS cabling work. Labour count alone is not work evidence.
      },
      { name: "Detectors, Hooters & PAVA Rack Commissioning", sub: "Devices",
        planned: { start: "2026-07-20", finish: "2026-07-29" },
        commitments: ["FSL2026272161"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Access, CCTV & Protection", boqCode: "C1", tasks: [
      { name: "EM Locks (Fail Safe), Biometric Readers & CCTV", sub: "Security",
        planned: { start: "2026-07-18", finish: "2026-07-27" },
        commitments: ["FSL2026272161"], materials: [], measured: null, evidence: [] },
      { name: "Emergency Exit Signage (Flush & Surface Mount)", sub: "Safety",
        planned: { start: "2026-07-22", finish: "2026-07-31" },
        commitments: [], materials: [], measured: null, evidence: [] },
      { name: "Rodent Repellent System", sub: "Protection",
        planned: { start: "2026-07-22", finish: "2026-07-29" },
        commitments: ["FSL2026272161"], materials: [], measured: null, evidence: [] },
      { name: "Water Leak Detection system", sub: "Protection",
        planned: { start: "2026-07-22", finish: "2026-07-29" },
        commitments: ["FSL2026272161"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Carpentry & Gypsum", boqCode: "A2", tasks: [
      { name: "100mm Gypsum Board Full Height Partition", sub: "Partitions",
        planned: { start: "2026-06-24", finish: "2026-07-09" },
        commitments: ["FSL2026272008"], materials: [], measured: null,
        evidence: [
          { day: "2026-07-05", kind: "claim", text: "DPR: Gypsum Partition for payroll Room, Board Room and 11 pax meeting room" },
          { day: "2026-07-06", kind: "claim", text: "DPR: Gypsum Partition continuing; Rock wool installation at payroll, 4 pax meeting room" },
          { day: "2026-07-08", kind: "claim", text: "DPR: Rock wool installation at 12 pax meeting room, 4 pax meeting room and Cabins opp to wellness room" },
          { day: "2026-07-10", kind: "claim", text: "DPR: Rock wool installation and board fixing at Reception area, Wellness male and female room. Board fixing after rockwool means those partitions are closing, which also closes the conduit inside them." },
          { day: "2026-07-11", kind: "claim", text: "DPR: Rock wool installation at 12 pax, 4 pax, cabins opp wellness, board rooms and cabins" },
          { day: "2026-07-12", kind: "claim", text: "DPR: Rock wool installation continuing (gypsum labour 04)" },
          { day: "2026-07-13", kind: "claim", text: "DPR: Rock wool installation continuing (gypsum labour 02)" }
        ] },
      { name: "Gypsum Column Cladding with Ply paneling", sub: "Cladding",
        planned: { start: "2026-06-29", finish: "2026-07-14" },
        commitments: ["FSL2026272008"], materials: [], measured: null, evidence: [] },
      { name: "Ply backing, Decorative Cladding", sub: "Millwork",
        planned: { start: "2026-07-06", finish: "2026-07-17" },
        commitments: [], materials: [], measured: null, evidence: [] },
      { name: "Seating Areas, Reception, Window Sills, booth seating and other Millworks", sub: "Millwork",
        planned: { start: "2026-07-09", finish: "2026-07-20" },
        commitments: [], materials: [], measured: null, evidence: [] },
      { name: "Wooden raised floor & Epoxy", sub: "Floors",
        planned: { start: "2026-07-17", finish: "2026-07-19" },
        commitments: ["FSL2026272194", "FSL2026272195"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Ceiling Works", boqCode: "A2", tasks: [
      { name: "Painting / Gyp-roc bondit for True Ceiling", sub: "True ceiling",
        planned: { start: "2026-07-11", finish: "2026-07-18" },
        commitments: ["FSL2026272122"], materials: [], measured: null,
        evidence: [
          { day: "2026-07-07", kind: "claim", text: "DPR: Painting: Putti work for Ceiling (painter 03)" },
          { day: "2026-07-08", kind: "claim", text: "DPR: Putti work for Ceiling. Chat photo caption: Putti work" },
          { day: "2026-07-10", kind: "claim", text: "DPR (report of 09 Jul): Putti work for Ceiling (painter 03)" },
          { day: "2026-07-11", kind: "claim", text: "DPR: Putti work for Ceiling (painter 04)" },
          { day: "2026-07-12", kind: "claim", text: "DPR: Putti work for Ceiling (painter 05)" },
          { day: "2026-07-13", kind: "claim", text: "DPR: Putti work for Ceiling continuing" }
        ] },
      { name: "Ceiling works for Meeting rooms, Board Rooms", sub: "Rooms",
        planned: { start: "2026-07-27", finish: "2026-08-07" },
        commitments: ["FSL2026272008"], materials: [], measured: null, evidence: [] },
      { name: "Ceiling works, Acoustics & Designer (Collab Area + Cafeteria)", sub: "Feature",
        planned: { start: "2026-07-27", finish: "2026-08-07" },
        commitments: ["FSL2026272008", "FSL2026272193"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Carpet Flooring", boqCode: "B1", tasks: [
      { name: "Carpet flooring Type 1", sub: "Flooring",
        planned: { start: "2026-07-20", finish: "2026-08-03" },
        commitments: ["FSL2026272167"], materials: [], measured: null, evidence: [] },
      { name: "Carpet flooring Type 2", sub: "Flooring",
        planned: { start: "2026-07-23", finish: "2026-08-03" },
        commitments: ["FSL2026272167"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Paint & Wall Finish", boqCode: "A2", tasks: [
      { name: "Acrylic Emulsion Paint (Wall / Partitions / Column)", sub: "Paint",
        planned: { start: "2026-07-29", finish: "2026-08-05" },
        commitments: ["FSL2026272122"], materials: [], measured: null, evidence: [] },
      { name: "50mm HT Aluminium Wall Skirting & Corner Guard", sub: "Trim",
        planned: { start: "2026-07-31", finish: "2026-08-07" },
        commitments: [], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Glass Partitions", boqCode: "A2", tasks: [
      { name: "Glass Partitions Frames, Doors & Fitting", sub: "Partitions",
        planned: { start: "2026-07-18", finish: "2026-07-29" },
        commitments: [], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Modular & Networking", boqCode: "F1", tasks: [
      { name: "Workstation Linear Sharing/Non sharing 1500mm x 750mm", sub: "Furniture",
        planned: { start: "2026-07-28", finish: "2026-08-09" },
        commitments: ["FSL2026272129"], materials: [], measured: null,
        evidence: [
          { day: "2026-06-16", kind: "schedule", text: "Schedule actual start column says 16 Jun for a task planned to start 28 Jul. This looks like a data entry error and is raised as a query." },
          { day: "2026-07-11", kind: "claim", text: "DPR: Work Stations marking (marking labour 4). Floor marking only, no furniture on site." }
        ] },
      { name: "Tables: Meeting, Cabin, Booths, Conference room", sub: "Furniture",
        planned: { start: "2026-07-25", finish: "2026-08-05" },
        commitments: ["FSL2026272129"], materials: [], measured: null, evidence: [] },
      { name: "Cafeteria Tables (6-Seater/4-Seater Corian Top)", sub: "Furniture",
        planned: { start: "2026-07-25", finish: "2026-08-05" },
        commitments: ["FSL2026272129"], materials: [], measured: null, evidence: [] },
      { name: "Planterboxes, storage units, Bookshelf", sub: "Furniture",
        planned: { start: "2026-07-25", finish: "2026-08-05" },
        commitments: ["FSL2026272129", "FSL2026272165"], materials: [], measured: null, evidence: [] },
      { name: "Cable Laying termination and Testing", sub: "Networking",
        planned: { start: "2026-08-02", finish: "2026-08-12" },
        commitments: ["FSL2026272180"], materials: [], measured: null, evidence: [] }
    ] },

    { name: "Finishing & Handover", tasks: [
      { name: "Supply & Installation of Motorized Blinds", sub: "Blinds",
        planned: { start: "2026-07-28", finish: "2026-08-04" },
        commitments: [], materials: [], measured: null, evidence: [] },
      { name: "Door & Directions Signages", sub: "Signage",
        planned: { start: "2026-07-30", finish: "2026-08-06" },
        commitments: [], materials: [], measured: null, evidence: [] },
      { name: "Graphics: Wall, Wall paper & glass films", sub: "Graphics",
        planned: { start: "2026-08-01", finish: "2026-08-08" },
        commitments: [], materials: [], measured: null, evidence: [] },
      { name: "Integrated Fire Trip & Evacuation Testing", sub: "T&C",
        planned: { start: "2026-08-09", finish: "2026-08-12" },
        commitments: [], materials: [], measured: null, evidence: [] },
      { name: "Deep Cleaning & Snags Rectification", sub: "Closeout",
        planned: { start: "2026-08-05", finish: "2026-08-14" },
        commitments: [], materials: [], measured: null, evidence: [] },
      { name: "Final Handover & Snag Rectification", sub: "Closeout",
        planned: { start: "2026-08-13", finish: "2026-08-18" },
        commitments: [], materials: [], measured: null, evidence: []
        // contract handover reads ~22 Aug, SSOT says 15 Aug, plan says 18 Aug.
        // The date conflict query is already open from absorb2.
      }
    ] }
  ],

  // groups(): injects the deep Civil Works pack after Preliminaries so
  // the site is whole. One task list, one law, no duplication.
  groups: function () {
    const civil = root.TRACK_CIVIL;
    const out = SITE.groupsRaw.slice();
    if (civil) out.splice(1, 0, { name: civil.category, boqCode: civil.boqCode, tasks: civil.tasks, deep: true });
    return out;
  },

  // ---- queries this pass raises --------------------------------------
  queries: [
    { about: "site sprinkler piping",
      question: "C' Class sprinkler piping was planned 27 Jun to 15 Jul and is past its finish. The only evidence is header joining and connection lines (05, 06, 11 Jul). How much piping is actually done in metres, and have alarm valve assembly and pendent installation started at all? Neither has a single DPR mention.", blocking: false },
    { about: "site hvac ducting conflict",
      question: "The Wk4 tracker says HVAC ducting is Blocked at 15% because GFC M-100 is not released, and the design register shows 0 of 23 MEP GFCs released. Yet the DPR reports duct fabrication and installation on 05, 06, 07, 11, 12 Jul. What is being fabricated without a released GFC, and what is the true blocked state?", blocking: false },
    { about: "site duct light test sequence",
      question: "The plan has a pre-insulation duct light test milestone 16 to 18 Jul, but DPR lines name Duct Insulation from 05 Jul. If ducts are factory pre-insulated say so; if insulation is running on site before the light test, the test sequence is broken. Which is it?", blocking: false },
    { about: "site hvac high side",
      question: "Refrigerant piping and cable trays were planned 05 to 16 Jul. The window has elapsed with zero DPR mentions. Metro Air holds the VRF PO. Has high side work started?", blocking: false },
    { about: "site plumbing",
      question: "uPVC drainage (window ended 06 Jul), internal water supply piping (ended 11 Jul) and traps (ended 12 Jul) have all elapsed with no work evidence. Only a material receipt on 06 Jul is known. A.R Khan holds the plumbing PO. What is the real plumbing status, toilet by toilet?", blocking: false },
    { about: "site fas cabling",
      question: "FAS labour (3 nos) appears in DPR counts from 05 Jul but no DPR line names FAS/PA cabling work, and the armored cabling window opened 11 Jul. Labour count alone is not work evidence. Has cabling started, and where?", blocking: false },
    { about: "site cladding and millwork",
      question: "Gypsum column cladding (window ended 14 Jul), ply backing (ends 17 Jul) and millworks (ends 20 Jul) have zero DPR mentions. No millwork PO was found among the 30 absorbed POs either. What is their status and who is the vendor?", blocking: false },
    { about: "site workstation actual start",
      question: "The schedule's actual start column says workstations started 16 Jun, but the task is planned 28 Jul to 09 Aug and only floor marking was seen (10, 11 Jul). This looks like a data entry error in the sheet. Confirm and correct it.", blocking: false },
    { about: "site glass partition po",
      question: "Glass partition works start 18 Jul per plan. No glass partition PO exists among the 30 absorbed POs. Is the PO released, and to whom?", blocking: false },
    { about: "site short lead pos",
      question: "Blinds (start 28 Jul), signages (30 Jul) and graphics (01 Aug) have no POs among the 30 absorbed. The procurement pack already flags short lead matching at 4 of 24. Which of these are ordered?", blocking: false }
  ],

  // registry zones this pack pins confidently (never silent-create)
  pins: ["server-room", "ups-electrical-room", "hub-room"],

  // ---- apply: idempotent ---------------------------------------------
  apply: function (ledger, zones) {
    if (ledger.state.queries.some(q => q.about === "site sprinkler piping")) {
      return { applied: false, reason: "site pack queries already raised" };
    }
    let pinsOk = 0, pinsMissed = 0;
    for (const id of SITE.pins) {
      const r = zones.pin(id);
      if (r.ok) pinsOk++;
      else { pinsMissed++; ledger.addQuery(r.query); }
    }
    for (const q of SITE.queries) ledger.addQuery(q);
    return { applied: true, queries: SITE.queries.length, pinsOk, pinsMissed };
  }
};

root.TRACK_SITE_PACK = SITE;
if (typeof module !== "undefined") module.exports = root.TRACK_SITE_PACK;

})(typeof window !== "undefined" ? window : globalThis);
