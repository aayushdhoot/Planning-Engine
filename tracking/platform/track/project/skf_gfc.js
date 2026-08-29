// ===================================================================
// DnB-OS . platform/track/project/skf_gfc.js . THE DRAWING REGISTER
// SKF Pune . the 58 GFC drawings, one row each, transcribed from
// data/skf/trackers/gfc_tracker.txt (GFC TRACKER Google Sheet, pulled
// 16 Jul). Cross checked against skf_track_design.js.
//
// intStatus is the internal FS status on the register: Completed,
// In Progress, Under Revision R1 or Not Started. skf is the client side
// status: none are Approved, most read Not Started. start and end are
// the register's planned dates as ISO, or null where the register left
// them blank. The gfc law computes released, the pending holder and the
// aging on the real clock; it never invents a date or a status.
// Row counts: Completed 19, In Progress 4, Under Revision R1 4,
// Not Started 31 (all 23 MEP among them). Client approvals: 0 of 58.
// ===================================================================

;(function (root) {

var GFC = {
  project: "SKF Pune",
  asOf: "2026-07-20",
  source: "GFC TRACKER register (58 drawings, pulled 16 Jul), cross checked with the Wk4 tracker",
  summaryNote: "The register's own summary says 22 completed. The rows add to 19. The law trusts the rows and the discrepancy stays a query.",

  drawings: [
    // ---- GFC layouts (9) ----
    { group: "GFC", name: "Base Build Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-06-05", end: "2026-06-09" },
    { group: "GFC", name: "Furniture Layout", crit: true, intStatus: "Completed", skf: "Not Started", start: null, end: "2026-05-28" },
    { group: "GFC", name: "Furniture Dimensions Layout", crit: true, intStatus: "Under Revision R1", skf: "Not Started", start: null, end: "2026-06-01" },
    { group: "GFC", name: "Wall finish layout", crit: true, intStatus: "Under Revision R1", skf: "-", start: null, end: "2026-06-11" },
    { group: "GFC", name: "Flooring Layout", crit: true, intStatus: "Completed", skf: "Not Started", start: null, end: "2026-06-02" },
    { group: "GFC", name: "Modular layout", crit: true, intStatus: "Completed", skf: "-", start: null, end: "2026-06-11" },
    { group: "GFC", name: "Partition Layout", crit: true, intStatus: "Completed", skf: "Not Started", start: null, end: "2026-06-03" },
    { group: "GFC", name: "RCP Layout", crit: true, intStatus: "Under Revision R1", skf: "Not Started", start: "2026-06-04", end: "2026-06-13" },
    { group: "GFC", name: "Lighting Layout with dimensions", crit: true, intStatus: "Under Revision R1", skf: "Not Started", start: null, end: "2026-06-05" },

    // ---- Technical details, TD (9), all INT Completed ----
    { group: "TD", name: "Reception Table", crit: true, intStatus: "Completed", skf: "Not Started", start: "2026-06-19", end: "2026-06-19" },
    { group: "TD", name: "Ledge Seating", crit: true, intStatus: "Completed", skf: "Not Started", start: "2026-05-19", end: "2026-06-19" },
    { group: "TD", name: "Boardroom Table", crit: true, intStatus: "Completed", skf: "Not Started", start: "2026-06-17", end: "2026-06-17" },
    { group: "TD", name: "Designer partition", crit: true, intStatus: "Completed", skf: "Not Started", start: "2026-05-22", end: "2026-06-16" },
    { group: "TD", name: "Designer pod seating", crit: false, intStatus: "Completed", skf: "Not Started", start: "2026-06-17", end: "2026-06-17" },
    { group: "TD", name: "Designer Ceiling, collab area", crit: false, intStatus: "Completed", skf: "Not Started", start: null, end: null },
    { group: "TD", name: "Baffle Ceiling", crit: false, intStatus: "Completed", skf: "Not Started", start: null, end: null },
    { group: "TD", name: "High table, collab area", crit: false, intStatus: "Completed", skf: "Not Started", start: null, end: null },
    { group: "TD", name: "Pelmet detail", crit: false, intStatus: "Completed", skf: "Not Started", start: "2026-06-18", end: "2026-06-18" },

    // ---- Elevational TDs (17) ----
    { group: "ELEV", name: "Reception", crit: true, intStatus: "Completed", skf: "Not Started", start: "2026-05-25", end: "2026-06-14" },
    { group: "ELEV", name: "Meeting Room typical", crit: true, intStatus: "In Progress", skf: "Not Started", start: "2026-05-26", end: "2026-06-14" },
    { group: "ELEV", name: "Boardroom", crit: true, intStatus: "Completed", skf: "Not Started", start: "2026-05-27", end: "2026-06-14" },
    { group: "ELEV", name: "Cabin", crit: true, intStatus: "Completed", skf: "Not Started", start: "2026-05-28", end: "2026-06-14" },
    { group: "ELEV", name: "Handwash, cafe", crit: false, intStatus: "In Progress", skf: "Not Started", start: null, end: "2026-06-14" },
    { group: "ELEV", name: "Dry Pantry, collab", crit: false, intStatus: "Completed", skf: "Not Started", start: null, end: "2026-06-14" },
    { group: "ELEV", name: "Tuck Shop, cafe", crit: false, intStatus: "Not Started", skf: "Not Started", start: null, end: "2026-06-14" },
    { group: "ELEV", name: "Cafeteria wall, wallpaper", crit: false, intStatus: "In Progress", skf: "Not Started", start: null, end: null },
    { group: "ELEV", name: "12 pax meeting room", crit: false, intStatus: "Completed", skf: "Not Started", start: null, end: "2026-06-14" },
    { group: "ELEV", name: "Ledge Seating, passage", crit: false, intStatus: "Completed", skf: "Not Started", start: null, end: null },
    { group: "ELEV", name: "Phone Booth", crit: false, intStatus: "In Progress", skf: "Not Started", start: null, end: null },
    { group: "ELEV", name: "Male Washroom type 01", crit: false, intStatus: "Not Started", skf: "Not Started", start: null, end: "2026-06-11" },
    { group: "ELEV", name: "Male Washroom type 02", crit: false, intStatus: "Not Started", skf: "Not Started", start: null, end: "2026-06-11" },
    { group: "ELEV", name: "Female washroom type 01", crit: false, intStatus: "Not Started", skf: "Not Started", start: null, end: "2026-06-11" },
    { group: "ELEV", name: "Female washroom type 02", crit: false, intStatus: "Not Started", skf: "Not Started", start: null, end: "2026-06-11" },
    { group: "ELEV", name: "Handicap washroom type 01", crit: false, intStatus: "Not Started", skf: "Not Started", start: null, end: "2026-06-11" },
    { group: "ELEV", name: "Handicap washroom type 02", crit: false, intStatus: "Not Started", skf: "Not Started", start: null, end: "2026-06-11" },

    // ---- MEP (23), all Criticality 1, all Not Started, all end 12-Jun ----
    { group: "MEP", name: "UPS Calculation", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-06", end: "2026-06-12" },
    { group: "MEP", name: "HVAC DBR", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-06", end: "2026-06-12" },
    { group: "MEP", name: "Hvac layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-12", end: "2026-06-12" },
    { group: "MEP", name: "Panel and DB Position layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-11", end: "2026-06-12" },
    { group: "MEP", name: "Power and Data Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-13", end: "2026-06-12" },
    { group: "MEP", name: "Raceway Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-14", end: "2026-06-12" },
    { group: "MEP", name: "Cable Tray Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-16", end: "2026-06-12" },
    { group: "MEP", name: "Lighting Looping Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-19", end: "2026-06-12" },
    { group: "MEP", name: "Electrical SLD Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-22", end: "2026-06-12" },
    { group: "MEP", name: "Fire Sprinkler Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-22", end: "2026-06-12" },
    { group: "MEP", name: "Fire Drencher Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-25", end: "2026-06-12" },
    { group: "MEP", name: "Fire Extinguisher Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-26", end: "2026-06-12" },
    { group: "MEP", name: "FAS and PA Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-27", end: "2026-06-12" },
    { group: "MEP", name: "CCTV Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-28", end: "2026-06-12" },
    { group: "MEP", name: "WLD Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-30", end: "2026-06-12" },
    { group: "MEP", name: "Rodent Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-16", end: "2026-06-12" },
    { group: "MEP", name: "NOVEC System Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-19", end: "2026-06-12" },
    { group: "MEP", name: "Fire Exit Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-20", end: "2026-06-12" },
    { group: "MEP", name: "BMS Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-22", end: "2026-06-12" },
    { group: "MEP", name: "Access Control Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-22", end: "2026-06-12" },
    { group: "MEP", name: "Plumbing Drainage Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-25", end: "2026-06-12" },
    { group: "MEP", name: "Plumbing Water Supply Layout", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-26", end: "2026-06-12" },
    { group: "MEP", name: "Load Analysis Sheet", crit: true, intStatus: "Not Started", skf: "Not Started", start: "2026-05-28", end: "2026-06-12" }
  ]
};

root.TRACK_GFC_SKF = GFC;
if (typeof module !== "undefined") module.exports = GFC;

})(typeof window !== "undefined" ? window : globalThis);
