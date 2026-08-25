// ===================================================================
// DnB-OS . platform/track/project/skf_material.js . MATERIAL RISK PACK
// SKF Pune . the material risk board rows for the Procurement Weekly.
// Source: SKF Material Tracker (Sheet3, pulled 16 Jul) for the item,
// the expected material receipt date and the sourcing status, cross read
// with the held POs (skf_po.js) and the Compare pack challenges.
//
// receipt is the tracker's expected receipt date. tracker is the raw
// sourcing status. poHeld names a PO the ledger holds for the item, or
// null. call is the buying team read for the week (act now / at risk /
// expedite / watch / on track); the commercial law checks the word is in
// the set and that on track and expedite are never claimed without a PO.
// contradiction marks an item where a PO is held but the tracker still
// reads unordered, so the row shows both honestly.
// stand is one plain sentence, no number invented.
// ===================================================================

;(function (root) {

var MAT = {
  project: "SKF Pune",
  asOf: "2026-07-20",
  source: "SKF Material Tracker Sheet3 (16 Jul) for the item, receipt date and status, cross read with the held POs and the Compare pack",
  // the trivial short lead consumables the tracker also lists (dustbins,
  // mats, frames, mattress, key storage, chess board): summarised, not
  // itemised, so the board stays the risk view the reference PDF is.
  minorNote: "Nine low value short lead items (dustbins, mats, frames, mattress, key storage and similar) sit at 25 to 26 Jul with no PO. Low risk, on the sheet, not listed here.",

  rows: [
    { item: "Carpets", receipt: "2026-07-21", target: "2026-06-16", lead: "long",
      tracker: "Approval pending from Design", poHeld: "FSL2026272167", contradiction: true,
      call: "act now", stand: "Not ordered. Design approval at 50 percent. Install starts now." },
    { item: "ELV, networking", receipt: "2026-07-21", target: "2026-06-16", lead: "long",
      tracker: "Vendor not appointed", poHeld: null, contradiction: false,
      call: "act now", stand: "Vendor not appointed, package already inside its window." },
    { item: "Sanitary fixtures", receipt: "2026-07-20", target: "2026-06-18", lead: "short",
      tracker: "Selection pending from design", poHeld: null, contradiction: false,
      call: "act now", stand: "Selection pending from design. Second fix due 21 to 26 Jul." },
    { item: "Blinds", receipt: "2026-07-20", target: "2026-06-18", lead: "short",
      tracker: "Selection pending from design", poHeld: null, contradiction: false,
      call: "act now", stand: "Selection pending from design." },
    { item: "Ambient lights", receipt: "2026-07-26", target: "2026-06-12", lead: "long",
      tracker: "Need to change brand", poHeld: "FSL2026272072", contradiction: true,
      call: "at risk", stand: "Brand change needed, order not final." },
    { item: "Toilet cubicles", receipt: "2026-07-22", target: "2026-06-21", lead: "long",
      tracker: "Quote finalization", poHeld: "FSL2026272212", contradiction: true,
      call: "expedite", stand: "PO placed 14 Jul, committed delivery already passed." },
    { item: "UPS", receipt: "2026-07-31", target: "2026-06-10", lead: "long",
      tracker: "Quote finalization", poHeld: "FSL2026272128", contradiction: true,
      call: "at risk", stand: "Quote finalization on the sheet, PO held. BOQ near Rs 33 L.",
      boqNote: "BOQ C3 UPS internal cost near Rs 33 L" },
    { item: "Loose furniture", receipt: "2026-07-22", target: "2026-06-22", lead: "long",
      tracker: "Quote finalization", poHeld: null, contradiction: false,
      call: "at risk", stand: "Quote finalization." },
    { item: "Turnkey 2 carpentry", receipt: "2026-07-20", target: "2026-06-16", lead: "long",
      tracker: "Quote finalization", poHeld: null, contradiction: false,
      call: "at risk", stand: "Quote finalization, gates millwork already due." },
    { item: "Acoustic panels", receipt: "2026-07-20", target: "2026-06-17", lead: "long",
      tracker: "Approval pending from design", poHeld: null, contradiction: false,
      call: "at risk", stand: "Design approval pending." },
    { item: "Raised floor, epoxy", receipt: "2026-07-24", target: "2026-06-20", lead: "short",
      tracker: "Quantity from operations", poHeld: "FSL2026272194", contradiction: true,
      call: "at risk", stand: "Quantity still open from operations." },
    { item: "Fire door", receipt: "2026-07-22", target: "2026-06-20", lead: "long",
      tracker: "Need give MEA", poHeld: "FSL2026272076", contradiction: true,
      call: "at risk", stand: "MEA details to be given." },
    { item: "Skirting, profiles", receipt: "2026-07-26", target: "2026-06-25", lead: "short",
      tracker: "Colour finalization", poHeld: null, contradiction: false,
      call: "watch", stand: "Colour finalization pending." },
    { item: "Modular furniture", receipt: "2026-07-28", target: "2026-06-16", lead: "long",
      tracker: "Completed", poHeld: "FSL2026272129", contradiction: false,
      call: "on track", stand: "Ordered, on track per sheet." },
    { item: "Workstation chairs", receipt: "2026-07-29", target: "2026-06-16", lead: "long",
      tracker: "Done", poHeld: "FSL2026272129", contradiction: false,
      call: "on track", stand: "Ordered, done per sheet." },
    { item: "Compactor", receipt: "2026-07-18", target: "2026-06-16", lead: "long",
      tracker: "Quote finalization", poHeld: "FSL2026272187", contradiction: true,
      call: "expedite", stand: "PO placed 14 Jul to Aldon, chase delivery." }
  ],

  // quotes still to convert to POs this week (page 3, convert list)
  quotePile: ["Call booth", "Loose furniture", "Turnkey 2 carpentry", "UPS", "AV and VC",
    "ACS and CCTV", "WD and RR", "Stretch lights", "Glass package regularised"],
  // design and client selections that release a waiting purchase (page 3)
  gates: ["Sanitary fixtures", "Washroom accessories", "Blinds", "Skirting colours",
    "Fluted panel quantities", "Artificial planters", "Carpet sample"],

  // confirm in writing this week (page 1 card). Traced to the Compare
  // pack challenges and the held PO list, one line each.
  confirm: [
    "Furniture PO around Rs 1.8 Cr shows Completed on the sheet. Attach the PO copy.",
    "Glass installs on site but the tracker still reads quote stage. Log its PO.",
    "Three of the 14 Jul POs show past delivery dates. Get dated commitments."
  ],
  // page 3 closing cards
  oneNumber: "Receipts crowd into 20 to 28 July, the same window installs begin. There is no slack between a truck arriving and a crew starting. Any PO not placed by Wednesday pushes its trade straight past its window.",
  discipline: [
    "Log every receipt against its PO in the tracker the day it lands.",
    "Attach the furniture PO copy.",
    "Get dated delivery commitments on the three overdue 14 Jul POs.",
    "Flag any vendor who cannot commit by Wednesday."
  ]
};

root.TRACK_MATERIAL_SKF = MAT;
if (typeof module !== "undefined") module.exports = MAT;

})(typeof window !== "undefined" ? window : globalThis);
