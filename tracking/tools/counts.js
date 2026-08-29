#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/counts.js . COUNTED WORK GETS A ROOM
//   node tools/counts.js [--write]
//
// A quantity measured in square metres can be spread across a floor by
// each room's share of it. A COUNT CANNOT. Six hundred data drops are not
// laid out in proportion to floor area — they are where the desks are, and
// the only honest way to place them is for somebody to have counted them
// per room. Until that happens the work sits at floor level, which means
// one crew in series however many gangs are put on it, and it is why the
// resourced plan stops improving after six fronts.
//
// Somebody HAS counted them. The BOQ's own "Networking - Nodes" tab is a
// node break-up by room type — 305 workstations, 6 cabins, one 12-pax
// meeting room — with the active, redundant and total points for each.
// This tool crosses that against the area register the drawing produced
// and writes engines/skf/counts.json, which platform/core/zoning.js reads.
//
// THE LAWS
//   . A ROOM TYPE IS NOT A ROOM. "4 Pax Meeting Room" is a kind of room;
//     "MR - 4 Pax 02" is a room. Matching one to the other is an INFERENCE
//     and every one of them is printed, with what it matched on, so a
//     person can disagree with a line rather than with a total.
//   . WHERE THE TWO DISAGREE ABOUT HOW MANY, NOTHING IS QUIETLY PICKED.
//     The node schedule assumes six cabins; the drawing has seven. That is
//     a real difference between what was designed and what is being built,
//     and it is worth more than a number — it is reported and the type is
//     left unplaced rather than spread over the wrong number of rooms.
//   . A TYPE THAT IS NOT A ROOM AT ALL STAYS AT FLOOR LEVEL. "CCTV Approx",
//     "WIFI approx", "Buffer", "Repro" and the room schedulers are floor-
//     wide allowances. They are named as such, never forced into a room.
//   . NOTHING IS SCALED TO FIT. zoning.js already refuses counts that do
//     not add to the bill, and this tool does not pre-empt that by
//     adjusting either side. Where they disagree, both numbers are shown.
//
// --write actually writes counts.json. Without it, nothing is written and
// the report is the whole output — because a file that silently changes
// the critical path should take a deliberate keystroke.
// ===================================================================
const fs = require("fs"), path = require("path");

const args = process.argv.slice(2);
const WRITE = args.indexOf("--write") >= 0;
const ENGINE = path.join(__dirname, "../engines/skf");
const facts = JSON.parse(fs.readFileSync(path.join(ENGINE, "facts.json"), "utf8"));
const areas = JSON.parse(fs.readFileSync(path.join(ENGINE, "areas.json"), "utf8"));
const named = (areas.areas || []).filter(a => a.named);

// ---- what the node schedule says --------------------------------------
const LOCS = "how many rooms of this type", PTS = "points across all rooms of this type";
const byType = {};
facts.facts.filter(f => f.role === LOCS || f.role === PTS).forEach(f => {
  const t = String(f.subject).replace(/^.*?·\s*/, "").trim();
  (byType[t] = byType[t] || { type: t })[f.role === LOCS ? "locations" : "points"] = Number(f.value);
});
// the sheet's own subtotal rows are not room types
Object.keys(byType).forEach(k => { if (/^total$/i.test(k)) delete byType[k]; });

// AV/TV IS THE SAME ROOM AGAIN, WITH A SCREEN IN IT. The schedule lists
// "4 Pax Meeting Room" and "4 Pax Meeting Room AV/TV" as separate lines
// because the second adds points to the first — not because there are
// twelve rooms. The points add; the ROOM COUNT comes from the base line
// only. The AV/TV line counts screen positions, not rooms — the boardroom
// has one room and two of them — and taking the larger of the two reported
// a boardroom that the drawing had somehow lost.
const folded = {};
Object.values(byType).forEach(v => {
  const isAV = /\s*AV\s*\/\s*TV\s*$/i.test(v.type);
  const base = v.type.replace(/\s*AV\s*\/\s*TV\s*$/i, "").trim();
  const f = folded[base] = folded[base] || { type: base, locations: null, points: 0, lines: [] };
  f.points += v.points || 0;
  if (!isAV) f.locations = v.locations || 0;
  f.lines.push(v.type);
});
Object.values(folded).forEach(f => { if (f.locations == null) f.locations = 0; });

// ---- what is a room, and what is a floor-wide allowance ----------------
// Declared, not guessed: these are named in the schedule as approximations
// and buffers, and no drawing puts them anywhere.
const FLOORWIDE = [/^cctv/i, /^wifi/i, /^buffer$/i, /^repro$/i, /room scheduler/i];

// ---- the room-type vocabulary, crossed with the drawing's ---------------
// Each entry says which named areas a room type covers. The match is on the
// area's NAME as the drawing gave it (or as a person renamed it), and the
// pattern is declared here where it can be read and argued with.
const COVERS = [
  // A DESK IS NOT A ROOM. "No of Location" is the count of ROOMS for every
  // other line on this schedule, but for workstations it is the count of
  // DESKS — 305 of them, inside three open zones. Checking 305 against the
  // three zones reported the drawing as missing 302 rooms, which is not a
  // finding, it is a units error. `perPosition` says the count is of things
  // inside these areas, so no room-count check applies to it.
  { type: /^workstation$/i,              is: /^open workstation zone/i,        perPosition: true,
    by: "the three open workstation zones — 305 desks inside them, not 305 rooms" },
  { type: /^cabin$/i,                    is: /^cabin \d/i,                     by: "the numbered cabins" },
  { type: /^4 pax meeting room$/i,       is: /^mr\s*-?\s*4 pax/i,              by: "the 4-pax meeting rooms" },
  { type: /^6 pax meeting room$/i,       is: /^mr\s*-?\s*6 pax/i,              by: "the 6-pax meeting rooms" },
  { type: /^8 pax meeting room$/i,       is: /^mr\s*-?\s*8 pax/i,              by: "the 8-pax meeting rooms" },
  { type: /^12 pax meeting room$/i,      is: /^mr\s*-?\s*12 pax/i,             by: "the 12-pax meeting room" },
  { type: /^20 pax broad ?room$/i,       is: /^boardroom/i,                    by: "the boardroom — the schedule spells it \"Broad Room\"" },
  { type: /^phone booth$/i,              is: /^phone booth/i,                  by: "the phone booths" },
  { type: /^cafeteria/i,                 is: /^cafeteria/i,                    by: "the cafeteria — the schedule says 47 pax, the drawing says 52" },
  { type: /^server room$/i,              is: /^server room$/i,                 by: "the server room" },
  { type: /^ups and electrical room$/i,  is: /^ups and elec/i,                 by: "the UPS and electrical room" },
  { type: /^battery room$/i,             is: /^battery room$/i,                by: "the battery room" },
  { type: /^compactor room$/i,           is: /^compactor room$/i,              by: "the compactor room" },
  { type: /^wellness room$/i,            is: /wellness room$/i,                by: "the male and female wellness rooms" },
  { type: /^collab\/breakout area$/i,    is: /^collab area/i,                  by: "the collaboration areas" },
  { type: /^dry pantry$/i,               is: /^dry pantry|^tea bag$|^coffee station/i, by: "the pantry, tea point and coffee station" },
  { type: /^reception \+ waiting area$/i, is: /^reception/i,                   by: "reception" },
];

const rows = [], floorwide = [], unmatched = [], mismatched = [];
Object.values(folded).sort((a, b) => (b.points || 0) - (a.points || 0)).forEach(v => {
  if (FLOORWIDE.some(r => r.test(v.type))) { floorwide.push(v); return; }
  const rule = COVERS.find(c => c.type.test(v.type));
  if (!rule) { unmatched.push(v); return; }
  const hits = named.filter(a => rule.is.test(a.name));
  if (!hits.length) { unmatched.push(v); return; }
  const row = { ...v, areas: hits, by: rule.by, perPosition: !!rule.perPosition,
    agrees: rule.perPosition || hits.length === v.locations };
  (row.agrees ? rows : mismatched).push(row);
});

// ---- points to rooms ---------------------------------------------------
// Where a type covers several rooms of the same kind, its points divide
// between them evenly — the schedule counted per room and every one of
// those rooms is the same kind. Where the rooms differ in size (the three
// open workstation zones), the split is by measured floor area, because
// desks are laid out on floor and nothing else in the file says otherwise.
const perArea = {};
const note = [];
rows.forEach(r => {
  const total = r.points || 0;
  if (!total) return;
  const bySize = r.perPosition;   // desks lie on floor; rooms of one kind do not
  const denom = bySize ? r.areas.reduce((t, a) => t + (a.sqft || 0), 0) : r.areas.length;
  if (!denom) return;
  let handed = 0;
  r.areas.forEach((a, i) => {
    const share = bySize ? (a.sqft || 0) / denom : 1 / denom;
    // the last room takes the remainder, so the parts add back exactly
    const n = i === r.areas.length - 1 ? total - handed : Math.round(total * share);
    handed += n;
    perArea[a.name] = (perArea[a.name] || 0) + n;
  });
  note.push(r.type + " → " + r.areas.length + (bySize ? " by floor area" : " evenly"));
});

// ---- report -------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
const designTotal = Object.values(folded).reduce((t, v) => t + (v.points || 0), 0);
const placedTotal = Object.values(perArea).reduce((t, n) => t + n, 0);

console.log("THE NODE SCHEDULE, AGAINST THE DRAWING");
console.log("  " + Object.keys(folded).length + " room types in the BOQ's node break-up · " +
  named.length + " named areas on the drawing");
console.log("  " + designTotal + " network points designed in total\n");

console.log("PLACED — the type and the rooms agree on how many");
rows.forEach(r => console.log("  " + pad(r.type, 30) + String(r.locations).padStart(4) + (r.perPosition ? " desks " : " rooms ") +
  String(r.points).padStart(5) + " pts   " + r.areas.map(a => a.name).join(", ").slice(0, 62)));
console.log("  " + placedTotal + " points placed into " + Object.keys(perArea).length + " rooms");

if (mismatched.length) {
  console.log("\nTHE DESIGN AND THE DRAWING DISAGREE ABOUT HOW MANY ROOMS THERE ARE");
  console.log("  Not a rounding problem. The node schedule was written against one layout and the");
  console.log("  drawing shows another, so these points are NOT placed — spreading them over the");
  console.log("  wrong number of rooms would bury the difference instead of raising it.");
  mismatched.forEach(r => console.log("  " + pad(r.type, 30) +
    "schedule says " + String(r.locations).padStart(2) + ", drawing has " + String(r.areas.length).padStart(2) +
    "   (" + r.areas.map(a => a.name).join(", ").slice(0, 46) + ")"));
}
if (floorwide.length) {
  console.log("\nFLOOR-WIDE ALLOWANCES — named as approximations, never forced into a room");
  floorwide.forEach(r => console.log("  " + pad(r.type, 30) + String(r.points).padStart(5) + " pts"));
}
if (unmatched.length) {
  console.log("\nNO ROOM ON THE DRAWING ANSWERS TO THESE");
  unmatched.forEach(r => console.log("  " + pad(r.type, 30) + String(r.points).padStart(5) + " pts"));
}

// ---- what the bill says the same work is --------------------------------
const plan = fs.existsSync(path.join(ENGINE, "plan.json"))
  ? JSON.parse(fs.readFileSync(path.join(ENGINE, "plan.json"), "utf8")) : null;
const dd = plan && (plan.scope.tasks || []).find(t => t.code === "data_drop");
if (dd) {
  console.log("\nAGAINST THE BILL");
  console.log("  the drawing designs   " + designTotal + " network points");
  console.log("  the bill prices       " + Math.round(dd.qty) + " " + dd.unit + " of data_drop");
  const ratio = dd.qty / Math.max(1, designTotal);
  if (ratio > 1.5) {
    console.log("  That is " + ratio.toFixed(1) + " times as many, and the bill already says why: it prices the");
    console.log("  SAME points at each stage — laying, testing, labelling, the outlet, the patch cord —");
    console.log("  and the engine sums them. The node schedule is independent evidence of the real");
    console.log("  count, and it is the first thing on this project that can settle it.");
    console.log("  Until somebody does, zoning will refuse these counts rather than scale either side.");
  }
}

// ---- the same schedule answers a second trade --------------------------
// THE NODE SCHEDULE COUNTS DESKS BEFORE IT COUNTS POINTS. Its "No of
// Location" for workstations is 305 — and 305 desks is the furniture task,
// not just the network one. That count was sitting unused while
// `workstation` ran as 620 units in a single zone, one crew in series, on
// the critical path. It is the same evidence, read for the other trade.
const perAreaDesks = {};
const desks = rows.find(r => r.perPosition && /^workstation$/i.test(r.type));
if (desks && desks.locations) {
  const denom = desks.areas.reduce((t, a) => t + (a.sqft || 0), 0);
  let handed = 0;
  desks.areas.forEach((a, i) => {
    const n = i === desks.areas.length - 1
      ? desks.locations - handed
      : Math.round(desks.locations * (a.sqft || 0) / denom);
    handed += n; perAreaDesks[a.name] = n;
  });
}

const out = { data_drop: perArea };
if (Object.keys(perAreaDesks).length) {
  out.workstation = perAreaDesks;
  console.log("\nTHE SAME SCHEDULE, READ FOR THE FURNITURE");
  console.log("  " + desks.locations + " desks across the open zones, split by measured floor area:");
  Object.entries(perAreaDesks).forEach(([k, n]) =>
    console.log("    " + pad(k, 30) + String(n).padStart(5) + " desks"));
  console.log("  workstation was running as one zone on the critical path with this count unused.");
}
if (WRITE) {
  fs.writeFileSync(path.join(ENGINE, "counts.json"), JSON.stringify(out, null, 1));
  console.log("\n→ engines/skf/counts.json   (" + placedTotal + " points across " +
    Object.keys(perArea).length + " rooms)");
} else {
  console.log("\nNothing was written. Run with --write to put this in front of the planner.");
}
