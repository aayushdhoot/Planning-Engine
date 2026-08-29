// ===================================================================
// DnB-OS . platform/track/walkdeck.js . THE PHOTO DECK LAW
// The pure law behind the three photo led reports of Reports batch 5:
//   . the Site Walk photo deck (completion by package, day stats, the
//     curated frame picks come from digest.js, the grid is all 81 pins)
//   . the Client walkthrough pack (the room list off the frozen pin
//     register, and one client safe read of each room)
// Pure, node and window, so the guards drive every law offline. No DOM,
// no fetch. The template composes the pages, this file holds the rules.
//
// Laws:
//   . completion by package reads the site % straight from the compare
//     law, never a second guess. A package with no reading is dropped,
//     never shown at zero.
//   . the walkthrough room list is the frozen pin register, real named
//     rooms only, so a client is never walked into an unnamed shaft.
//   . a room read is built from the day's readings, then run through the
//     client safe strip: no vendor, no amount, no blame word ever prints.
// ===================================================================

;(function (root) {

function esc(s) {
  var RC = root.TRACK_REPORTCSS;
  return RC ? RC.esc(s) : String(s == null ? "" : s);
}

// ---- Site Walk deck: completion by package -------------------------
// each friendly package maps to one or more compare rows and a fixed
// pastel tone, so the deck bars read the same colours every walk.
var DECK_PACKAGES = [
  { label: "Fire fighting piping",     tone: "sage",  names: ["Sprinkler piping", "Heads and flexible drops"] },
  { label: "Drywall partitions",       tone: "sky",   names: ["Gypsum partitions"] },
  { label: "Blockwork and plaster",    tone: "sand",  names: ["Blockwork, AAC, plaster"] },
  { label: "HVAC ducting",             tone: "sky",   names: ["GI ducting, low side"] },
  { label: "Electrical first fix",     tone: "lilac", names: ["Trays and containment", "Conduiting and back boxes"] },
  { label: "Glass partitions",         tone: "sage",  names: ["Glass partitions"] },
  { label: "Plaster and putty finish", tone: "sand",  names: ["Putty and prep", "Column cladding, ply"] },
  { label: "False ceiling",            tone: "rose",  names: ["True ceiling coat"] },
  { label: "Floor finishes",           tone: "rose",  names: ["Vitrified tile"] }
];

function firstNote(pack, names) {
  for (var i = 0; i < (pack.groups || []).length; i++)
    for (var j = 0; j < pack.groups[i].rows.length; j++) {
      var r = pack.groups[i].rows[j];
      if (names.indexOf(r.name) !== -1 && r.note) return r.note;
    }
  return "";
}

// completion(pack, CMP, today) -> [{label, tone, pct, chip, note}]
// site % from the compare law only. No reading, the package is dropped.
// sorted most complete first, like the reference deck.
function completion(pack, CMP, today) {
  var t = today || pack.asOf;
  var rows = [];
  for (var i = 0; i < DECK_PACKAGES.length; i++) {
    var p = DECK_PACKAGES[i];
    var mp = CMP.mappedPair(pack, p.names, t);
    if (!mp || mp.site == null) continue;
    rows.push({ label: p.label, tone: p.tone, pct: mp.site, chip: mp.chip, note: firstNote(pack, p.names) });
  }
  rows.sort(function (a, b) { return b.pct - a.pct; });
  return rows;
}

// ---- Site Walk deck: the day in one glance -------------------------
// deckStats(sum, readings, day, workers, flagCount) -> the five numbers
// on page two. Every number is a real count, never invented.
function dayReadings(readings, day) {
  var arr = readings && readings.state ? readings.state.readings : (readings || []);
  return (arr || []).filter(function (r) { return r.day === day; });
}
function deckStats(sum, readings, day, workers, flagCount) {
  var recs = dayReadings(readings, day);
  var obs = 0, trades = {};
  for (var i = 0; i < recs.length; i++) {
    obs += (recs[i].items || []).length;
    for (var j = 0; j < recs[i].items.length; j++) {
      var w = String(recs[i].items[j].work || "").toLowerCase();
      if (w) trades[w] = 1;
    }
  }
  var TG = root.TRACK_DIGEST;
  var tradeBuckets = {};
  if (TG) for (var k = 0; k < recs.length; k++) for (var m = 0; m < recs[k].items.length; m++) {
    var tr = TG.tradeFor(recs[k].items[m].work);
    if (tr) tradeBuckets[tr.key] = 1;
  }
  return {
    pinsShot: sum ? sum.shot : recs.length,
    total: sum ? sum.total : (root.TRACK_PINS ? root.TRACK_PINS.pins.length : 81),
    observations: obs,
    workers: (workers == null ? null : workers),
    tradesActive: Object.keys(tradeBuckets).length || Object.keys(trades).length,
    safetyPoints: flagCount || 0
  };
}

// ---- Client walkthrough: the room list -----------------------------
// rooms(pinsReg) -> the real named rooms a client is walked through, one
// entry per space that carries a pin, unnamed shafts and duplicate
// passages dropped, so the route is only rooms a client would recognise.
function isRealRoom(name) {
  if (!name) return false;
  if (/^unnamed space/i.test(name)) return false;
  return true;
}
function rooms(pinsReg) {
  var reg = pinsReg || root.TRACK_PINS;
  if (!reg || !reg.pins) return [];
  var order = [], seen = {};
  for (var i = 0; i < reg.pins.length; i++) {
    var p = reg.pins[i];
    if (!isRealRoom(p.space)) continue;
    if (!seen[p.space]) { seen[p.space] = { space: p.space, type: p.type, pins: [] }; order.push(p.space); }
    seen[p.space].pins.push(p.no);
  }
  return order.map(function (s) { return seen[s]; });
}

// ---- Client walkthrough: the client safe read of one room ----------
// friendly trade names and plain verbs, so a client hears rooms, not
// site jargon. The raw reading words never reach the page.
var TRADE_NAME = [
  { re: /sprinkler/i,                         name: "Fire sprinkler system" },
  { re: /hvac|duct/i,                          name: "Air conditioning" },
  { re: /aac|blockwork|masonry|\bblock\b/i,    name: "Room walls" },
  { re: /plaster/i,                            name: "Wall plaster" },
  { re: /drywall|gypsum|partition(?! glass)/i, name: "Partition walls" },
  { re: /glass/i,                              name: "Glass fronts" },
  { re: /ceiling/i,                            name: "Ceiling" },
  { re: /tile|screed|vitrified|floor(?!.*trench)|self level/i, name: "Flooring" },
  { re: /putty|paint|primer|prime|finish/i,    name: "Wall finishing" },
  { re: /plumb|water proof|waterproof|cpvc|drain|sanitary/i, name: "Plumbing" },
  { re: /electric|conduit|first fix|raceway|cable|back box/i, name: "Electrical points" },
  { re: /column cladding/i,                    name: "Column cladding" }
];
function friendly(work) {
  for (var i = 0; i < TRADE_NAME.length; i++) if (TRADE_NAME[i].re.test(work || "")) return TRADE_NAME[i].name;
  return null;
}
// the strip law: drop any clause that names a vendor, an amount or blame,
// so a client page can never carry an internal word.
function clientSafe(text) {
  if (!text) return "";
  var parts = String(text).split(/[.;·]/).map(function (s) { return s.trim(); }).filter(Boolean)
    .filter(function (s) {
      return !/vendor|purchase order|\bpo\b|\brs\b|₹|\bcr\b|\blakh\b|\blac\b|quote|not ordered|not appointed|not awarded|selection pending|query|delay|slip|behind|\blate\b|blame|fault|rubble|debris/i.test(s);
    });
  return parts.length ? parts[0].charAt(0).toUpperCase() + parts[0].slice(1) + "." : "";
}

var DONE_STATES = { done: 1 };
var WIP_STATES = { ongoing: 1, started: 1, material_present: 1 };

// roomStatus(space, readings, day, pinsReg) -> { done:[], progress:[], say:[] }
// built from the day's readings for the room's pins, folded to friendly
// trade names, then split into what is done and what is in progress. The
// talking points are generated plain and client safe.
function roomStatus(space, readings, day, pinsReg) {
  var reg = pinsReg || root.TRACK_PINS;
  var pinNos = {};
  for (var i = 0; i < reg.pins.length; i++) if (reg.pins[i].space === space) pinNos[reg.pins[i].no] = 1;
  var recs = dayReadings(readings, day).filter(function (r) { return pinNos[r.pin]; });
  var doneSet = {}, wipSet = {};
  for (var j = 0; j < recs.length; j++) for (var k = 0; k < recs[j].items.length; k++) {
    var it = recs[j].items[k], fn = friendly(it.work);
    if (!fn) continue;
    if (DONE_STATES[it.state]) doneSet[fn] = 1;
    else if (WIP_STATES[it.state]) { if (!doneSet[fn]) wipSet[fn] = 1; }
  }
  for (var d in doneSet) if (wipSet[d]) delete wipSet[d];   // done wins over in progress
  var done = Object.keys(doneSet), progress = Object.keys(wipSet);
  var say = talkingPoints(space, done, progress);
  return { space: space, done: done, progress: progress, say: say, pins: Object.keys(pinNos).map(Number) };
}

// plain client facing lines, generated, never from raw site notes
function talkingPoints(space, done, progress) {
  var out = [];
  var total = done.length + progress.length;
  if (total === 0) { return ["This area is being set up. The next walk will show the first trades in place."]; }
  if (done.length) out.push(done.slice(0, 3).join(", ") + (done.length === 1 ? " is complete here." : " are complete here."));
  if (progress.length) out.push(progress.slice(0, 3).join(", ") + (progress.length === 1 ? " is currently in progress." : " are currently in progress."));
  out.push("The room is on the walkthrough route, so the team can show the work live.");
  return out.slice(0, 3);
}

root.TRACK_WALKDECK = {
  DECK_PACKAGES: DECK_PACKAGES, completion: completion, deckStats: deckStats,
  rooms: rooms, isRealRoom: isRealRoom, roomStatus: roomStatus,
  friendly: friendly, clientSafe: clientSafe, talkingPoints: talkingPoints
};
if (typeof module !== "undefined") module.exports = root.TRACK_WALKDECK;

})(typeof window !== "undefined" ? window : globalThis);
