// ===================================================================
// DnB-OS . platform/track/project/skf_layout.js
// WHAT THE SKF LAYOUT SHEETS SPECIFY, PIN BY PIN
//
// Read off the drawing itself, not off the GFC register. The sheet is a
// vector PDF, so the symbols are geometry the engine can count rather
// than pixels it has to guess at.
//
// How pin 1 was placed on the sheet, so anyone can repeat it:
//   1. The room polygons come from SKF_R1_GFC_FINAL LAYOUT.dxf, in mm.
//      The floor runs 122.30 m by 27.15 m.
//   2. Room name labels on the sheet were matched to room names in the
//      dxf. Only names that matched exactly once were kept, six of them.
//   3. The transform was solved with a uniform scale and a flipped y,
//      three unknowns, not four. An earlier attempt let x and y scale
//      separately and produced 0.016346 against 0.011620, which cannot
//      be a plan. Forcing one scale is what made the fit honest.
//   4. Five of the six anchors agree. The sixth, a boardroom tag, sits
//      12 m out and was rejected: it is a schedule tag, not a room label.
//   5. Result: 0.016707 points per mm, about 1 to 170. Two anchors land
//      within 0.15 m, the worst kept anchor within 1.28 m.
//   6. Checked by eye. Pin 1 lands on the bottom edge of the open
//      workstation block with the Ø100 header callout inside its cone,
//      and every symbol the extractor found sits on a drawn symbol.
//
// Only pin 1 and only sprinklers are in here. The other 80 pins have no
// layout read yet, and the law returns null for them rather than an
// empty scope that would read as "nothing specified".
// ===================================================================

;(function (root) {

root.TRACK_LAYOUT_SKF = {
  note: "Sprinkler scope at pin 1, read off the sheet on 30 Jul 2026. One pin of 81.",

  sheets: [{
    id: "spr1",
    discipline: "sprinkler",
    name: "SKF_03_Sprinkler_Layout_1.pdf",
    driveId: "1UoX-u0l1vl6y9ccYHSzzMzB121xkMMLV",
    rev: "V4, dated 08.06.2026",
    by: "MAARS TECH ENGINEERS",
    status: "FOR APPROVAL",
    size: "A1, 841 by 594 mm, titled NTS",
    issued: "2026-07-01",
    // What the sheet's own legend says a symbol means. Read from the
    // legend block, not assumed. The legend gives types, no quantities,
    // so there is no stated total on this sheet to check a count against.
    legend: [
      "cyan starburst, new upright sprinkler, quick response K80 at 68 deg",
      "red filled circle, new pendent sprinkler, quick response K80 at 68 deg",
      "magenta, side wall sprinkler, quick response K80 at 68 deg",
      "new sprinkler drencher",
      "pipe colours, pink 25, orange 32, green 40, blue 50, cyan 65, all GI C class",
      "thick red, 100 header and drencher line",
      "existing sprinkler pipe is called out separately from new"
    ],
    reg: {
      method: "room name labels, uniform scale, y flipped",
      scale: 0.016707,          // points per mm
      plotScale: "about 1 to 170",
      ox: -23207.6, oy: 18473.9,
      anchors: 6, inliers: 5,
      bestM: 0.13, worstM: 1.28,
      rejected: "Boardroom - 20 Pax, 12.02 m out, a schedule tag not a room label",
      checkedByEye: true
    }
  }],

  scopes: [{
    pin: 1,
    space: "Open Workstation Zone 1",
    discipline: "sprinkler",
    sheet: "spr1",
    view: "south west across the open floor, 68 deg cone, 12 m reach",
    pinOnSheet: { x: 374.1, y: 1045.1 },   // pdf points
    // Counted as vector symbols inside the cone, then each one checked
    // against the drawn sheet. Nine for nine, no false positives.
    items: [
      { one: "upright head", many: "upright heads", count: 9,
        type: "new upright, quick response K80 at 68 deg",
        at: [{ m: 3.59 }, { m: 5.80 }, { m: 7.84 }, { m: 8.36 }, { m: 8.82 },
             { m: 9.64 }, { m: 10.58 }, { m: 11.27 }, { m: 11.62 }] },
      { one: "side wall head", many: "side wall heads", count: 1,
        type: "side wall, quick response K80 at 68 deg",
        at: [{ m: 11.45 }] }
    ],
    runs: [
      { label: "Ø100 sprinkler header AV-04", bop: 3300 },
      { label: "Ø50 branch, typical in this bay", bop: null }
    ],
    grid: "heads about 2.9 to 3.3 m apart across, rows about 3.1 to 3.6 m apart",
    // The detail block on the same sheet, which fixes how a head is hung.
    fixing: "header on hi tech pipe supports at 3 to 3.5 m, 25Ø flexible hose drop, reducer nib, head below false ceiling",
    sheetSplit: "the western 76 m of the 122.30 m floor, sheet 1 of 2",
    gaps: [
      "The open bay in this view is drawn with heads but almost no coverage circles. One circle of the 146 on the sheet reaches this cone, radius 1.46 m. The bay to the east is drawn with circles throughout. So spacing here is shown, but coverage is not demonstrated on this sheet.",
      "The sheet separates new heads from existing ones and gives no quantities in its legend, so the drawn count cannot be reconciled against a stated total.",
      "Ceiling height and any bulkhead in this bay are not on the sprinkler sheet, so whether a head clears a bulkhead cannot be answered from here."
    ]
  }],

  // Every upright head the sheet specifies inside Open Workstation Zone 1,
  // by position, so each one has a name that survives a re read. Read off
  // the same registration as the pin 1 brief and clipped to the zone
  // polygon from the pin register.
  //
  // 38 heads, one per 7.8 sqm across 296.1 sqm. The four pins in this zone
  // between them can see 20 of the 38, and 6 of those 20 fall in more than
  // one pin's cone. So adding pin counts up would report 31 sightings of 20
  // heads, and 18 heads would never be looked at by any pin at all.
  itemSets: [{
    space: "Open Workstation Zone 1",
    discipline: "sprinkler",
    kind: "upright head",
    sheet: "spr1",
    spec: "new upright, quick response K80 at 68 deg",
    pins: [1, 2, 3, 4],
    items: [
      { id: "SPR-U-1392635-1042156", mm: [1392635, 1042156] },
      { id: "SPR-U-1400223-1042496", mm: [1400223, 1042496] },
      { id: "SPR-U-1406454-1042496", mm: [1406454, 1042496] },
      { id: "SPR-U-1409381-1042496", mm: [1409381, 1042496] },
      { id: "SPR-U-1412308-1042496", mm: [1412308, 1042496] },
      { id: "SPR-U-1397297-1042504", mm: [1397297, 1042504] },
      { id: "SPR-U-1392605-1043543", mm: [1392605, 1043543] },
      { id: "SPR-U-1392609-1044928", mm: [1392609, 1044928] },
      { id: "SPR-U-1406454-1046106", mm: [1406454, 1046106] },
      { id: "SPR-U-1409381-1046106", mm: [1409381, 1046106] },
      { id: "SPR-U-1412308-1046106", mm: [1412308, 1046106] },
      { id: "SPR-U-1400223-1046107", mm: [1400223, 1046107] },
      { id: "SPR-U-1397297-1046114", mm: [1397297, 1046114] },
      { id: "SPR-U-1403150-1046118", mm: [1403150, 1046118] },
      { id: "SPR-U-1394370-1046121", mm: [1394370, 1046121] },
      { id: "SPR-U-1392633-1046313", mm: [1392633, 1046313] },
      { id: "SPR-U-1392609-1047700", mm: [1392609, 1047700] },
      { id: "SPR-U-1392608-1049084", mm: [1392608, 1049084] },
      { id: "SPR-U-1406454-1049220", mm: [1406454, 1049220] },
      { id: "SPR-U-1409381-1049220", mm: [1409381, 1049220] },
      { id: "SPR-U-1400223-1049716", mm: [1400223, 1049716] },
      { id: "SPR-U-1411160-1049716", mm: [1411160, 1049716] },
      { id: "SPR-U-1397297-1049724", mm: [1397297, 1049724] },
      { id: "SPR-U-1403150-1049728", mm: [1403150, 1049728] },
      { id: "SPR-U-1394370-1049732", mm: [1394370, 1049732] },
      { id: "SPR-U-1392633-1050471", mm: [1392633, 1050471] },
      { id: "SPR-U-1392613-1051856", mm: [1392613, 1051856] },
      { id: "SPR-U-1392605-1053242", mm: [1392605, 1053242] },
      { id: "SPR-U-1394370-1053334", mm: [1394370, 1053334] },
      { id: "SPR-U-1397297-1053334", mm: [1397297, 1053334] },
      { id: "SPR-U-1400223-1053334", mm: [1400223, 1053334] },
      { id: "SPR-U-1392632-1054627", mm: [1392632, 1054627] },
      { id: "SPR-U-1392611-1056012", mm: [1392611, 1056012] },
      { id: "SPR-U-1397300-1056910", mm: [1397300, 1056910] },
      { id: "SPR-U-1400227-1056910", mm: [1400227, 1056910] },
      { id: "SPR-U-1394370-1056911", mm: [1394370, 1056911] },
      { id: "SPR-U-1392608-1057398", mm: [1392608, 1057398] },
      { id: "SPR-U-1392608-1058784", mm: [1392608, 1058784] }
    ]
  }],

  // Sheets seen in Drive but not read yet. Named so the gap is visible
  // rather than looking like the work is finished.
  pending: [
    { name: "SKF_04_Sprinkler_Layout_2.pdf", driveId: "1XLJVO9_QUi_2FC54juZPdAD9yGyTiNGc",
      why: "carries the eastern 46 m of the floor, so pins from Open Workstation Zone 3 eastward" },
    { name: "the other 17 MEP sheets issued 01 Jul 2026", driveId: null,
      why: "one read per revision would give every pin a countable scope" }
  ]
};

if (typeof module !== "undefined") module.exports = root.TRACK_LAYOUT_SKF;

})(typeof window !== "undefined" ? window : globalThis);
