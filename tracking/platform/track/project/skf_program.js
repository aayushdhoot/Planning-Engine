// ===================================================================
// DnB-OS . platform/track/project/skf_program.js
// THE ROOM PROGRAM PACK . SKF Pune . as of 18 Jul 2026
// The office program: room types with the count the job must deliver,
// each number tied to a source, nothing invented. Sources used:
//   . Furniture PO FSL2026272129 (305 workstations, 414 chairs)
//   . Call booth PO FSL2026272165 (2 + 2)
//   . Toilet cubicle PO FSL2026272212 (16 nos), plumbing PO 16 toilets
//   . The frozen 49 space registry (skf_pins.js), from the GFC layout
//   . BOQ R5 summary (26,484 sq ft)
// Where the layout numbering implies more rooms than are pinned (cabins,
// meeting rooms), the required count is left null and queried, never
// guessed. Achieved counts are not seeded: no counted delivery survey
// has reached the engine, so every room reads "awaiting count" until a
// dated reading or answer arrives. The room program law scores this.
// ===================================================================

;(function (root) {

const PROGRAM = {
  project: "SKF Pune",
  asOf: "2026-07-18",
  area_sqft: 26484,
  queryPrefix: "program ",

  rooms: [
    // ---- work areas ----
    { key: "workstations", name: "Workstations", group: "Work areas", unit: "seats",
      required: 305, reqSource: "Furniture PO FSL2026272129 (305 workstations), across Open Workstation Zones 1 to 3" },
    { key: "task_chairs", name: "Task chairs", group: "Work areas", unit: "chairs",
      required: 414, reqSource: "Furniture PO FSL2026272129 (414 chairs)" },
    { key: "collab_area", name: "Collaboration area", group: "Work areas", unit: "areas",
      required: 1, reqSource: "Layout: Collab Area - 1" },

    // ---- meeting and private ----
    { key: "boardroom_20", name: "Boardroom, 20 pax", group: "Meeting and private", unit: "rooms",
      required: 1, reqSource: "Layout: Boardroom - 20 Pax" },
    { key: "mr_12", name: "Meeting room, 12 pax", group: "Meeting and private", unit: "rooms",
      required: null, reqSource: null,
      note: "The registry pins one 12 pax MR (MR - 12 Pax 01). The 01 suffix implies more. True count queried." },
    { key: "mr_8", name: "Meeting room, 8 pax", group: "Meeting and private", unit: "rooms",
      required: null, reqSource: null,
      note: "The registry pins one 8 pax MR (MR- 8 Pax 01). True count queried." },
    { key: "mr_4", name: "Meeting room, 4 pax", group: "Meeting and private", unit: "rooms",
      required: null, reqSource: null,
      note: "The registry pins MR- 4 Pax 04, the numbering implies four. True count queried." },
    { key: "cabins", name: "Cabins", group: "Meeting and private", unit: "cabins",
      required: null, reqSource: null,
      note: "The registry pins Cabin 01, 04, 05, 06. The numbering implies 02 and 03 exist. True cabin count queried." },
    { key: "payroll_7", name: "Payroll room, 7 pax", group: "Meeting and private", unit: "rooms",
      required: 1, reqSource: "Layout: Payroll- 7 Pax" },
    { key: "call_booths", name: "Call and phone booths", group: "Meeting and private", unit: "booths",
      required: 4, reqSource: "Call booth PO FSL2026272165 (2 + 2)",
      note: "The layout also pins one Phone Booth. Whether it is one of the four is queried." },
    { key: "wellness", name: "Wellness rooms", group: "Meeting and private", unit: "rooms",
      required: 2, reqSource: "Layout: Male Wellness Room, Female Wellness Room" },

    // ---- amenity ----
    { key: "cafeteria", name: "Cafeteria seats", group: "Amenity", unit: "pax",
      required: 52, reqSource: "Layout: Cafeteria- 52 Pax" },
    { key: "library", name: "Library", group: "Amenity", unit: "rooms",
      required: 1, reqSource: "Layout: Library" },
    { key: "tea_point", name: "Tea point / pantry", group: "Amenity", unit: "points",
      required: 1, reqSource: "Layout: Tea Bag" },
    { key: "dishwash", name: "Dishwash", group: "Amenity", unit: "rooms",
      required: 1, reqSource: "Layout: Dishwash" },

    // ---- washrooms ----
    { key: "toilet_cubicles", name: "Toilet cubicles", group: "Washrooms", unit: "cubicles",
      required: 16, reqSource: "Cubicle PO FSL2026272212 (16 nos), plumbing PO FSL2026272077 (16 toilets)" },

    // ---- service rooms ----
    { key: "server_room", name: "Server room", group: "Service rooms", unit: "rooms",
      required: 1, reqSource: "Layout: Server Room" },
    { key: "ups_elec", name: "UPS and electrical room", group: "Service rooms", unit: "rooms",
      required: 1, reqSource: "Layout: UPS And Elec Room" },
    { key: "battery_room", name: "Battery room", group: "Service rooms", unit: "rooms",
      required: 1, reqSource: "Layout: Battery Room" },
    { key: "compactor_room", name: "Compactor room", group: "Service rooms", unit: "rooms",
      required: 1, reqSource: "Layout: Compactor Room" },
    { key: "storage", name: "Low height storage", group: "Service rooms", unit: "rooms",
      required: 2, reqSource: "Layout: Low Ht Storage, Low Ht Storage 2" },

    // ---- lockers ----
    { key: "lockers", name: "Lockers", group: "Storage and lockers", unit: "nos",
      required: null, reqSource: null,
      note: "No locker count in the absorbed BOQ, PO or layout. The Emirates deck kept lockers in its scoreboard, so the row is held and queried." }
  ],

  // The counts the engine still needs a source for, raised as queries so
  // the required side is honest, plus one query for the achieved side.
  queries: [
    { about: "program meeting rooms",
      question: "The room program needs the true count of meeting rooms. The frozen registry pins one 12 pax, one 8 pax and MR- 4 Pax 04 (four implied). How many 12 pax, 8 pax and 4 pax meeting rooms does the layout actually carry?", blocking: false },
    { about: "program cabins",
      question: "How many cabins are in the program? The registry pins Cabin 01, 04, 05 and 06, so 02 and 03 are implied but not pinned. Confirm the full cabin count.", blocking: false },
    { about: "program call booths",
      question: "The call booth PO FSL2026272165 is 2 + 2, and the layout also pins one Phone Booth. Is the Phone Booth one of the four call booths, or a separate fifth booth?", blocking: false },
    { about: "program lockers",
      question: "How many lockers does SKF want? No locker count appears in the absorbed BOQ, PO or layout. The room program holds the row and needs the number.", blocking: false },
    { about: "program delivered counts",
      question: "The room program shows the required counts. Achieved is empty because no counted delivery survey has reached the engine, only qualitative pin photos. When the site counts built workstations, cabins, cubicles and cafeteria seats, drop the dated counts so the scoreboard fills. Nothing is counted as delivered until then.", blocking: false }
  ],

  // idempotent: the pack raises its queries once
  apply: function (ledger) {
    if (ledger.state.queries.some(q => q.about === "program delivered counts")) {
      return { applied: false, reason: "program pack queries already raised" };
    }
    for (const q of PROGRAM.queries) ledger.addQuery(q);
    return { applied: true, queries: PROGRAM.queries.length };
  }
};

root.TRACK_PROGRAM_SKF = PROGRAM;
if (typeof module !== "undefined") module.exports = root.TRACK_PROGRAM_SKF;

})(typeof window !== "undefined" ? window : globalThis);
