// ===================================================================
// DnB-OS . platform/track/project/skf_track_procure.js
// PROCUREMENT TRACKING PACK . SKF Pune . as of 16 Jul 2026
// Curated from the ledger's absorbed sources, nothing invented:
//   . the plan: procurement sheet in "Ptoject Schedule & Milestone - SKF.xlsx",
//     52 works with target order dates. Its PO, vendor and closed columns
//     are blank on every row, so achievement is matched from elsewhere.
//   . the achieved: the 30 canonical PO extracts held in the ledger.
//   . sourcing signals: SKF Material Tracker notes (pulled 16 Jul).
//   . arrivals: WhatsApp DPR lines with dates and photos.
// A held PO makes a work claimed done, never verified: the only date a
// Vizdom PO prints is its latest revision stamp (all 30 read 14 Jul), so
// when it was really released is unknown and release slip is uncomputable.
// 26 of 52 works matched to POs. Every gap is a query, never a guess.
// Unmatched POs held in the ledger with no row on this sheet: 272058
// material shifting, 272102 mathadi labour, 272123 safety consumables.
// ===================================================================

;(function (root) {

const PO_DAY = "2026-07-14";  // the only date a Vizdom PO carries, its revision stamp
const MT_DAY = "2026-07-16";  // day the Material Tracker was pulled into the ledger
const VZ = "Vizdom revision stamp: printed Order Date is the latest revision date, not the original order date";
const poEv = (t) => ({ day: PO_DAY, kind: "claim", completes: true, text: t + " Only date printed is the Vizdom revision stamp of 14 Jul, original release date unknown." });
const mtEv = (t) => ({ day: MT_DAY, kind: "claim", text: "Material Tracker: " + t });
const mtNote = (t) => ({ day: MT_DAY, kind: "note", text: "Material Tracker: " + t });

const PROCURE = {

  category: "Procurement",
  boqCode: null,
  asOf: "2026-07-16",
  queryPrefix: "procurement ",

  context: {
    note: "52 works on the procurement plan against 30 POs held in the ledger. 26 works matched to a PO. The sheet's own PO, vendor and closed columns are blank on all 52 rows.",
    line: "52 planned works · 26 matched to held POs · committed across all 30 POs ₹6,19,93,631 · the sheet's own PO, vendor and closed columns are blank on every row"
  },

  commitments: [
    { po: "FSL2026272014", rev: 6, vendor: "HINDUSTAN ASSOCIATES", value: 443208, delivery: "2026-06-11", advance: "100%", scope: "Kajaria vitrified tiles supply, 4495 sqft", flags: [VZ] },
    { po: "FSL2026272011", rev: 3, vendor: "PCI Pest Control", value: 64900, delivery: "2026-06-10", scope: "anti-termite and pest control, 2 rounds, 10 year warranty", flags: [VZ] },
    { po: "FSL2026272077", rev: 0, vendor: "A.R KHAN", value: 600000, delivery: "2026-06-23", scope: "plumbing works, 16 toilets", flags: [VZ] },
    { po: "FSL2026272128", rev: 6, vendor: "TRIANGULAR", value: 2124000, delivery: "2026-07-01", scope: "UPS 80/20/6 KVA", flags: [VZ, "line total inconsistency flagged at absorb"] },
    { po: "FSL2026272067", rev: 3, vendor: "S.S. FURNITURE", value: 12242.5, delivery: "2026-06-22", scope: "site team chairs and tables", flags: [VZ] },
    { po: "FSL2026272068", rev: 5, vendor: "ARSELEX", value: 11800000, delivery: "2026-06-22", scope: "complete electrical works", flags: [VZ] },
    { po: "FSL2026272074", rev: 1, vendor: "CHETTAK", value: 129800, delivery: "2026-06-23", scope: "security, 2 guards, 2 months", flags: [VZ] },
    { po: "FSL2026272161", rev: 4, vendor: "M.N. ELECTRICALS", value: 2451810, delivery: "2026-07-07", scope: "fire alarm + PA + rodent + WLD + CCTV", flags: [VZ] },
    { po: "FSL2026272024", rev: 3, vendor: "M.N. ELECTRICALS", value: 1817757, delivery: "2026-06-16", scope: "fire sprinkler and drencher", flags: [VZ] },
    { po: "FSL2026272062", rev: 3, vendor: "METRO AIR", value: 11209561, delivery: "2026-06-22", scope: "HVAC VRF package", flags: [VZ] },
    { po: "FSL2026272027", rev: 3, vendor: "NATIONAL INFRA SOLUTIONS", value: 1872944, delivery: "2026-06-16", scope: "civil execution package", flags: [VZ] },
    { po: "FSL2026272008", rev: 8, vendor: "RAZA INTERIOR", value: 3969890, delivery: "2026-06-30", scope: "gypsum partitions 735 sqm + ceiling 550 sqm", flags: [VZ] },
    { po: "FSL2026272122", rev: 2, vendor: "JYOTI ENTERPRISES", value: 964060, delivery: "2026-06-30", scope: "painting 2100 + 2200 sqm", flags: [VZ] },
    { po: "FSL2026272072", rev: 8, vendor: "POWER ZONE", value: 1216238, delivery: "2026-06-23", scope: "Philips light fixtures", flags: [VZ] },
    { po: "FSL2026272167", rev: 4, vendor: "WELSPUN", value: 1881144, delivery: "2026-08-11", advance: "90%", scope: "carpet tiles 1270 + 225 sqmt", flags: [VZ] },
    { po: "FSL2026272129", rev: 11, vendor: "FEATHERLITE", value: 9148057.4, delivery: "2026-07-01", scope: "modular furniture, 305 workstations + 414 chairs", flags: [VZ] },
    { po: "FSL2026272180", rev: 7, vendor: "TRIANGULAR", value: 5254233.4, delivery: "2026-07-09", scope: "networking, Cat6A", flags: [VZ] },
    { po: "FSL2026272165", rev: 5, vendor: "AYUSHRI", value: 1286200, delivery: "2026-07-07", scope: "call booths 2 + 2", flags: [VZ] },
    { po: "FSL2026272187", rev: 0, vendor: "ALDON", value: 252756, delivery: "2026-07-09", scope: "compactors", flags: [VZ] },
    { po: "FSL2026272076", rev: 0, vendor: "BHARATH", value: 93998, delivery: "2026-06-23", scope: "fire doors, 3 nos", flags: [VZ] },
    { po: "FSL2026272212", rev: 2, vendor: "PACIFIC", value: 396480, delivery: "2026-07-13", scope: "toilet cubicles, 16 nos", flags: [VZ] },
    { po: "FSL2026272078", rev: 0, vendor: "SAFEX", value: 317302, delivery: "2026-06-23", scope: "fire extinguishers", flags: [VZ] },
    { po: "FSL2026272193", rev: 0, vendor: "EUROCEIL", value: 413720, delivery: "2026-07-10", scope: "stretch ceiling 377 sqft", flags: [VZ] },
    { po: "FSL2026272194", rev: 0, vendor: "UNITED ACCESS", value: 137140, delivery: "2026-07-10", advance: "100%", scope: "raised floor 30 sqm", flags: [VZ] },
    { po: "FSL2026272121", rev: 2, vendor: "SUSTAINABLE", value: 63720, delivery: "2026-06-30", scope: "housekeeping, 2 months", flags: [VZ] },
    { po: "FSL2026272195", rev: 0, vendor: "WESTCHEM", value: 91173, delivery: "2026-07-10", scope: "epoxy flooring 30 + 15 sqm", flags: [VZ] }
  ],

  tasks: [

    {
      name: "Immediate items (12 works)",
      sub: "Order targets 09 to 19 Jun",
      planned: { start: "2026-06-09", finish: "2026-06-19" },
      commitments: [], materials: [],
      measured: { done: 11, of: 12, unit: "works with a PO held" },
      evidence: [
        { day: PO_DAY, kind: "claim", text: "11 of 12 immediate works have POs held in the ledger. The one hole is Water Proofing: no PO found among all 30, and its civil window on site has already elapsed unproven." }
      ],
      items: [
        { name: "Table and Chair for Site Team (target 10 Jun)", planned: { start: "2026-06-10", finish: "2026-06-10" }, commitments: ["FSL2026272067"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272067 rev 3 held, S.S. FURNITURE, ₹12,242.50, delivery 22 Jun.")] },
        { name: "Pest Control (target 14 Jun)", planned: { start: "2026-06-14", finish: "2026-06-14" }, commitments: ["FSL2026272011"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272011 rev 3 held, PCI, ₹64,900, delivery 10 Jun.")] },
        { name: "Electrical Work (target 15 Jun)", planned: { start: "2026-06-15", finish: "2026-06-15" }, commitments: ["FSL2026272068"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272068 rev 5 held, ARSELEX, ₹1,18,00,000, delivery 22 Jun.")] },
        { name: "Security Staff (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: ["FSL2026272074"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272074 rev 1 held, CHETTAK, ₹1,29,800, 2 guards for 2 months.")] },
        { name: "Turnkey: Civil, Gypsum, Paint and Initial Carpentry (target 19 Jun)", planned: { start: "2026-06-19", finish: "2026-06-19" }, commitments: ["FSL2026272027", "FSL2026272008", "FSL2026272122"],
          materials: [{ day: "2026-07-13", text: "DPR photo: Block vehicle received (00003085-PHOTO-2026-07-13)" }], measured: null,
          evidence: [poEv("Three POs held: FSL2026272027 NATIONAL INFRA civil ₹18,72,944, FSL2026272008 rev 8 RAZA gypsum ₹39,69,890, FSL2026272122 JYOTI painting ₹9,64,060.")] },
        { name: "FA / PA (target 15 Jun)", planned: { start: "2026-06-15", finish: "2026-06-15" }, commitments: ["FSL2026272161"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272161 rev 4 held, M.N. ELECTRICALS, ₹24,51,810, covers FA + PA + rodent + WLD + CCTV.")] },
        { name: "Fire Sprinkler (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: ["FSL2026272024"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272024 rev 3 held, M.N. ELECTRICALS, ₹18,17,757, sprinkler + drencher.")] },
        { name: "HVAC (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: ["FSL2026272062"],
          materials: [{ day: "2026-07-16", text: "DPR photo: Ducting material received (00003174-PHOTO-2026-07-16)" }], measured: null,
          evidence: [poEv("PO FSL2026272062 rev 3 held, METRO AIR, ₹1,12,09,561, VRF package.")] },
        { name: "Tiles Supply (target 09 Jun)", planned: { start: "2026-06-09", finish: "2026-06-09" }, commitments: ["FSL2026272014"],
          materials: [{ day: "2026-07-15", text: "DPR: tiles arrived on site, one box damaged, team inspecting all boxes, GRN pending (Rahul Singh, 15 Jul)" }], measured: null,
          evidence: [poEv("PO FSL2026272014 rev 6 held, HINDUSTAN ASSOCIATES, ₹4,43,208, Kajaria 4495 sqft, 100% advance.")] },
        { name: "Plumbing (target 10 Jun)", planned: { start: "2026-06-10", finish: "2026-06-10" }, commitments: ["FSL2026272077"],
          materials: [{ day: "2026-07-07", text: "DPR: plumbing material received and shifting to site" }], measured: null,
          evidence: [poEv("PO FSL2026272077 rev 0 held, A.R KHAN, ₹6,00,000, 16 toilets.")] },
        { name: "UPS (target 10 Jun)", planned: { start: "2026-06-10", finish: "2026-06-10" }, commitments: ["FSL2026272128"], materials: [], measured: null,
          evidence: [
            poEv("PO FSL2026272128 rev 6 held, TRIANGULAR, ₹21,24,000, 80/20/6 KVA."),
            mtNote("still reads Quote Finalization for UPS, contradicting the held PO. Tracker looks stale.")
          ] },
        { name: "Water Proofing (target 11 Jun)", planned: { start: "2026-06-11", finish: "2026-06-11" }, commitments: [], materials: [], measured: null, evidence: [] }
      ]
    },

    {
      name: "Long lead items (16 works)",
      sub: "Order targets 12 to 22 Jun",
      planned: { start: "2026-06-12", finish: "2026-06-22" },
      commitments: [], materials: [],
      measured: { done: 11, of: 16, unit: "works with a PO held" },
      evidence: [
        { day: PO_DAY, kind: "claim", text: "11 of 16 long lead works have POs held in the ledger. Open: Loose Furniture, Turnkey 2 carpentry, Acoustic Panels, Sanitary Fixtures, Washroom Accessories, all still in sourcing per the Material Tracker." }
      ],
      items: [
        { name: "Ambient Lights (target 12 Jun)", planned: { start: "2026-06-12", finish: "2026-06-12" }, commitments: ["FSL2026272072"], materials: [], measured: null,
          evidence: [
            poEv("PO FSL2026272072 rev 8 held, POWER ZONE, ₹12,16,238, Philips fixtures."),
            mtNote("Need to change Brand, expected receipt 26 Jul. A brand change after a rev 8 PO is a conflict, raised as a query.")
          ] },
        { name: "Carpets (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: ["FSL2026272167"], materials: [], measured: null,
          evidence: [
            poEv("PO FSL2026272167 rev 4 held, WELSPUN, ₹18,81,144, 1270 + 225 sqmt, 90% advance, delivery 11 Aug."),
            mtNote("Approval pending from Design, expected receipt 21 Jul. Wk4 tracker (06 Jul) still said carpet order not started.")
          ] },
        { name: "Modular Furniture (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: ["FSL2026272129"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272129 rev 11 held, FEATHERLITE, ₹91,48,057.40, 305 workstations + 414 chairs."), mtNote("Completed, expected receipt 28 Jul.")] },
        { name: "Networking (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: ["FSL2026272180"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272180 rev 7 held, TRIANGULAR, ₹52,54,233.40, Cat6A.")] },
        { name: "Call Booth (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: ["FSL2026272165"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272165 rev 5 held, AYUSHRI, ₹12,86,200, 2 + 2 booths."), mtNote("still reads Quote Finalization, contradicting the held PO.")] },
        { name: "Chairs, workstation (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: ["FSL2026272129"], materials: [], measured: null,
          evidence: [poEv("Covered in PO FSL2026272129 FEATHERLITE, 414 chairs within the ₹91,48,057.40 order."), mtNote("Done, expected receipt 29 Jul.")] },
        { name: "Compactor (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: ["FSL2026272187"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272187 rev 0 held, ALDON, ₹2,52,756."), mtNote("still reads Quote Finalization, contradicting the held PO.")] },
        { name: "Fire Door (target 20 Jun)", planned: { start: "2026-06-20", finish: "2026-06-20" }, commitments: ["FSL2026272076"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272076 rev 0 held, BHARATH, ₹93,998, 3 doors."), mtNote("Need give MEA, expected receipt 22 Jul.")] },
        { name: "Toilet Cubicles (target 21 Jun)", planned: { start: "2026-06-21", finish: "2026-06-21" }, commitments: ["FSL2026272212"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272212 rev 2 held, PACIFIC, ₹3,96,480, 16 nos, delivery 13 Jul."), mtNote("still reads Quote Finalization, contradicting the held PO.")] },
        { name: "Loose Furniture (target 22 Jun)", planned: { start: "2026-06-22", finish: "2026-06-22" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("Quote Finalization, expected receipt 22 Jul. No PO held.")] },
        { name: "Turnkey 2: Complete Carpentry Work (target 16 Jun)", planned: { start: "2026-06-16", finish: "2026-06-16" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("Quote Finalization, expected receipt 20 Jul. No PO matched. PO FSL2026272135 AR INTERIOR ₹26,18,469.60 covers pelmets, skirting and panelling: whether that is this package is raised as a query.")] },
        { name: "Fire Extinguisher with Stand (target 17 Jun)", planned: { start: "2026-06-17", finish: "2026-06-17" }, commitments: ["FSL2026272078"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272078 rev 0 held, SAFEX, ₹3,17,302."), mtNote("Done, expected receipt 20 Jul.")] },
        { name: "Acoustic Panels and Baffle/Cloud Ceiling (target 17 Jun)", planned: { start: "2026-06-17", finish: "2026-06-17" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("Approval Pending from design (5 Jul), expected receipt 20 Jul. No PO held.")] },
        { name: "Stretch Lights (target 17 Jun)", planned: { start: "2026-06-17", finish: "2026-06-17" }, commitments: ["FSL2026272193"], materials: [], measured: null,
          evidence: [poEv("Matched to PO FSL2026272193 rev 0, EUROCEIL, ₹4,13,720, stretch ceiling 377 sqft. Scope wording differs, match raised as a query."), mtNote("still reads Quote Finalization.")] },
        { name: "Sanitary Fixtures, supply (target 18 Jun)", planned: { start: "2026-06-18", finish: "2026-06-18" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("Selection Pending from design, expected receipt 20 Jul. No PO held.")] },
        { name: "Washroom Accessories (target 18 Jun)", planned: { start: "2026-06-18", finish: "2026-06-18" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("Selection Pending from design, expected receipt 20 Jul. No PO held.")] }
      ]
    },

    {
      name: "Short lead items (24 works)",
      sub: "Order targets 18 to 25 Jun",
      planned: { start: "2026-06-18", finish: "2026-06-25" },
      commitments: [], materials: [],
      measured: { done: 4, of: 24, unit: "works with a PO held" },
      evidence: [
        { day: PO_DAY, kind: "claim", text: "4 of 24 short lead works have POs held (WD/RR, Raised flooring, Housekeeping, Epoxy). 6 more show sourcing activity on the Material Tracker. 14 works show nothing at all, every target date past." }
      ],
      items: [
        { name: "Blinds (target 18 Jun)", planned: { start: "2026-06-18", finish: "2026-06-18" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("Selection Pending from design, expected receipt 20 Jul. No PO held.")] },
        { name: "ACS / CCTV (target 19 Jun)", planned: { start: "2026-06-19", finish: "2026-06-19" }, commitments: ["FSL2026272161"], materials: [], measured: null,
          evidence: [
            { day: PO_DAY, kind: "claim", text: "PO FSL2026272161 held covers the CCTV portion. Access control (ACS) appears in no held PO. Partial coverage, raised as a query." },
            mtNote("Quote Finalization, expected receipt 20 Jul.")
          ] },
        { name: "WD / RR (target 19 Jun)", planned: { start: "2026-06-19", finish: "2026-06-19" }, commitments: ["FSL2026272161"], materials: [], measured: null,
          evidence: [poEv("Covered in PO FSL2026272161 M.N. ELECTRICALS: WLD and rodent repellent within the ₹24,51,810 order."), mtNote("still reads Quote Finalization, contradicting the held PO.")] },
        { name: "Flutted Panels, supply (target 19 Jun)", planned: { start: "2026-06-19", finish: "2026-06-19" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("QTY from Designer pending, expected receipt 20 Jul. No PO held.")] },
        { name: "Glass Partition, Doors, Lacquered Glass, Mirror, Urinal Partition (target 20 Jun)", planned: { start: "2026-06-20", finish: "2026-06-20" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("Quote Finalization, expected receipt 23 Jul. No PO held. Wk4 tracker: order-by date passed, depends on GFC A-125.")] },
        { name: "Raised flooring (target 20 Jun)", planned: { start: "2026-06-20", finish: "2026-06-20" }, commitments: ["FSL2026272194"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272194 rev 0 held, UNITED ACCESS, ₹1,37,140, 30 sqm, 100% advance.")] },
        { name: "Housekeeping (target 20 Jun)", planned: { start: "2026-06-20", finish: "2026-06-20" }, commitments: ["FSL2026272121"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272121 rev 2 held, SUSTAINABLE, ₹63,720, 2 months.")] },
        { name: "Floor Protection Sheets (target 20 Jun)", planned: { start: "2026-06-20", finish: "2026-06-20" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Decorative Lights (target 20 Jun)", planned: { start: "2026-06-20", finish: "2026-06-20" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("listed, no note, expected receipt 25 Jul. No PO held.")] },
        { name: "Fabrication Work (target 22 Jun)", planned: { start: "2026-06-22", finish: "2026-06-22" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("listed, no note, expected receipt 25 Jul. No PO held.")] },
        { name: "Fire Exit Signages, Prolite (target 22 Jun)", planned: { start: "2026-06-22", finish: "2026-06-22" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("listed, no note, expected receipt 25 Jul. No PO held.")] },
        { name: "Epoxy Flooring (target 22 Jun)", planned: { start: "2026-06-22", finish: "2026-06-22" }, commitments: ["FSL2026272195"], materials: [], measured: null,
          evidence: [poEv("PO FSL2026272195 rev 0 held, WESTCHEM, ₹91,173, 30 + 15 sqm.")] },
        { name: "Artificial Planters (target 22 Jun)", planned: { start: "2026-06-22", finish: "2026-06-22" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("Selection in progress, expected receipt 25 Jul. No PO held.")] },
        { name: "Chess Board with Table (target 23 Jun)", planned: { start: "2026-06-23", finish: "2026-06-23" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("Online Order planned, expected receipt 25 Jul. No PO held, no order proof.")] },
        { name: "Deep cleaning (target 23 Jun)", planned: { start: "2026-06-23", finish: "2026-06-23" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Graphics, Signage and Films / Suncontrol (target 23 Jun)", planned: { start: "2026-06-23", finish: "2026-06-23" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("listed, no note, expected receipt 25 Jul. No PO held.")] },
        { name: "Dustbin, supply (target 23 Jun)", planned: { start: "2026-06-23", finish: "2026-06-23" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("listed, no note, expected receipt 26 Jul. No PO held.")] },
        { name: "Entrance Mat (target 24 Jun)", planned: { start: "2026-06-24", finish: "2026-06-24" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("listed, no note, expected receipt 26 Jul. No PO held.")] },
        { name: "Hanging Frames (target 24 Jun)", planned: { start: "2026-06-24", finish: "2026-06-24" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("listed, no note, expected receipt 26 Jul. No PO held.")] },
        { name: "Insulated Rubber Mats (target 24 Jun)", planned: { start: "2026-06-24", finish: "2026-06-24" }, commitments: [], materials: [], measured: null, evidence: [] },
        { name: "Mattress 7 Inch (target 25 Jun)", planned: { start: "2026-06-25", finish: "2026-06-25" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("listed, no note, expected receipt 26 Jul. No PO held.")] },
        { name: "Metal Key Storage (target 25 Jun)", planned: { start: "2026-06-25", finish: "2026-06-25" }, commitments: [], materials: [], measured: null,
          evidence: [mtNote("listed, no note, expected receipt 26 Jul. No PO held.")] },
        { name: "Skirting, Corner Guard and Profiles, supply (target 25 Jun)", planned: { start: "2026-06-25", finish: "2026-06-25" }, commitments: [], materials: [], measured: null,
          evidence: [mtEv("Colour Finalization, expected receipt 26 Jul. No PO matched. PO FSL2026272135 AR INTERIOR includes skirting in its scope: overlap raised as a query.")] },
        { name: "Slotted Angle Racks (target 25 Jun)", planned: { start: "2026-06-25", finish: "2026-06-25" }, commitments: [], materials: [], measured: null, evidence: [] }
      ]
    }
  ],

  queries: [
    { about: "procurement sheet unmaintained",
      question: "The procurement sheet's PO, vendor and closed columns are blank on all 52 rows even though 30 POs exist. The Material Tracker still reads Quote Finalization for UPS, Call Booth, Compactor, Toilet Cubicles, WD/RR and Stretch Lights although POs are held for each. Update or retire both sheets, the engine currently trusts the POs.", blocking: false },
    { about: "procurement po release dates",
      question: "A Vizdom PO prints its latest revision stamp as the Order Date, so all 30 POs read 14 Jul 2026. The original release dates are unknown and release slip against the order targets cannot be computed for any work. Supply original release dates, from Vizdom history or email records.", blocking: false },
    { about: "procurement unmatched works",
      question: "15 planned works have no PO and no sourcing signal at all, every target date past: Water Proofing (immediate, site window already elapsed), Floor Protection Sheets, Decorative Lights, Fabrication Work, Fire Exit Signages, Chess Board, Deep cleaning, Graphics and Signage, Dustbin, Entrance Mat, Hanging Frames, Insulated Rubber Mats, Mattress, Metal Key Storage, Slotted Angle Racks. Confirm real status of each.", blocking: false },
    { about: "procurement match ambiguity",
      question: "Four matches need confirmation: (1) does PO FSL2026272135 AR INTERIOR (pelmets, skirting, panelling, ₹26,18,469.60) cover Turnkey 2 complete carpentry, the skirting supply row, both or neither? (2) is EUROCEIL FSL2026272193 stretch ceiling the Stretch Lights row? (3) which PO covers the ACS half of ACS/CCTV? (4) Material Tracker lists Server Rack as in networking scope, confirm it sits inside FSL2026272180.", blocking: false },
    { about: "procurement grn",
      question: "Zero GRN or SRN documents are absorbed while the DPR shows arrivals: plumbing material 07 Jul, AAC block vehicle 13 Jul, tiles 15 Jul with one damaged box, HVAC ducting material 16 Jul. Nothing can move past materials_on_site or be reconciled against PO quantities until GRNs arrive. Drop them in Drive 03 Procurement.", blocking: false }
  ],

  pins: [],

  apply: function (ledger, zones) {
    if (ledger.state.queries.some(q => q.about === "procurement sheet unmaintained")) {
      return { applied: false, reason: "procurement tracking queries already raised" };
    }
    let pinsOk = 0, pinsMissed = 0;
    for (const id of PROCURE.pins) {
      const r = zones.pin(id);
      if (r.ok) pinsOk++;
      else { pinsMissed++; ledger.addQuery(r.query); }
    }
    for (const q of PROCURE.queries) ledger.addQuery(q);
    return { applied: true, queries: PROCURE.queries.length, pinsOk, pinsMissed };
  }
};

root.TRACK_PROCURE = PROCURE;
if (typeof module !== "undefined") module.exports = root.TRACK_PROCURE;

})(typeof window !== "undefined" ? window : globalThis);
