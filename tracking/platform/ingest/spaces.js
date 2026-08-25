// ===================================================================
// DnB-OS . platform/ingest/spaces.js . WHICH LABELS ARE ROOMS
// A GFC drawing carries a few hundred pieces of text and only some of
// them name a place. The rest are the title block, the door schedule,
// the flooring legend, ceiling specs, furniture and sheet names. Reading
// them all as rooms is how a 26,000 sqft floor turns into a 60,000 sqft
// plan.
//
//   classify(label)       room | notRoom(reason) | unknown
//   normalise(label)      the canonical name for a room said three ways
//   rooms(facts)          the room schedule, with what was rejected
//
// THE LAWS
//   . THE VOCABULARY IS DECLARED, NOT LEARNED. Every word that makes a
//     label a room, and every word that rules one out, is written here
//     where a person can read and argue with it. Nothing is inferred
//     from shape, size or position.
//   . RULING OUT BEATS RULING IN. "PHONE BOOTH TABLE" contains PHONE
//     BOOTH; it is furniture. A label that matches both lists is NOT a
//     room, because the cost of inventing a room is a whole trade's
//     quantities against a place that does not exist.
//   . A LABEL THE VOCABULARY DOES NOT KNOW IS REPORTED. Never guessed
//     into a room, never silently dropped. It comes back as unknown with
//     its measured area, so a person decides once and the word joins the
//     vocabulary.
//   . ONE ROOM SAID THREE WAYS IS ONE ROOM. "BOARD ROOM", "BOARDROOM -
//     20 PAX" and "BOARD ROOM- 20 PAX" are the same place. They collapse
//     to one canonical name . but if their AREAS differ, that is a
//     conflict and it is raised, never averaged.
//
// Pure: labels in, a classification out. No clock, no I/O.
// ===================================================================

;(function (root) {

// ---- what makes a label a place --------------------------------------
// Read off the real SKF GFC drawing. Adding a word is one line here.
const ROOM_WORDS = [
  "reception", "waiting", "boardroom", "board room", "cabin", "meeting room", "mr-",
  "cafeteria", "pantry", "dishwash", "dish wash", "handwash", "hand wash",
  "collab", "breakout", "library", "phone booth", "focus pod", "workstation",
  "washroom", "restroom", "wellness", "wc", "toilet",
  "server room", "ups", "battery room", "ahu", "electrical room", "ele./ ups",
  "compactor", "storage", "repro", "payroll", "manager cabin", "visiting",
  "passage", "lobby", "corridor", "circulation", "refuge", "balcony", "ramp",
  "elevator", "lift", "staircase", "shaft", "duct room", "hub room",
  "serving counter", "coffee station",
];

// ---- what rules a label OUT, whatever else it contains -----------------
// Ruling out beats ruling in: "PHONE BOOTH TABLE" is furniture.
const NOT_ROOM = [
  // title block and sheet metadata
  { re: /^(client|date|scale|version|dwg|drawing|project prefix|path|location|north|purpose|designed by|changed by|check(ed)? by|revision|rev\b|sheet)\b/i, why: "title block" },
  { re: /^(for approval|for execution|for construction|as built)$/i, why: "issue stamp" },
  { re: /^d:[\\/]/i, why: "a file path in the title block" },
  { re: /^v\d+$/i, why: "a version number" },
  { re: /^skf .*floor$/i, why: "the sheet's own project name" },
  // legends and schedules
  { re: /\b(legend|schedule|indication|hatch|layout|type|particulars|description)\b/i, why: "a legend or schedule heading" },
  { re: /^(qty|nos\.?|total|required|achieved|areas?|sq\.?m|carpet area|note)\s*:?$/i, why: "a schedule column heading" },
  { re: /^size\s*[\(:]/i, why: "a schedule column heading" },
  { re: /^type\s*\d+\s*:/i, why: "a door or window schedule row" },
  // materials, finishes and ceilings . these describe a surface, not a place
  { re: /\b(tile|tiles|carpet|epoxy|terrazzo|vitrified|lvt|micro concrete|screed)\b/i, why: "a floor finish" },
  { re: /\b(paneling|panelling|wallpaper|laminate|veneer|lacquered|fluted|fabric|rubber wood|mdf|duco)\b/i, why: "a wall finish" },
  { re: /\bceiling\b/i, why: "a ceiling specification" },
  { re: /\b(paint|wall finish(es)?)\b/i, why: "a finish note" },
  { re: /^start tile$/i, why: "a tile-setting-out note" },
  // furniture, fittings and equipment
  { re: /\b(table|counter|credenza|planter|vending|dispenser|machine|light|luminaire|partition|door|furniture|modular)\b/i, why: "furniture, a fitting or a light" },
  { re: /^(sugar|sugar free|stirrer|tea bag|coffee vending|high counter)$/i, why: "a pantry consumable on the furniture layout" },
  // service abbreviations and matrix codes
  { re: /^(ap|fa|fp|pe|phe|sp|lp|lg|l g|chws|matrix|m p d|rw p|l\.h\.s\.|d\d+)$/i, why: "a services abbreviation or grid code" },
];

// a legend cell that lists several rooms is not one room
const MULTI = /(,| & | and )/i;

function classify(label) {
  const s = String(label == null ? "" : label).trim();
  if (!s) return { verdict: "notRoom", why: "empty" };
  const low = s.toLowerCase();

  // RULING OUT BEATS RULING IN . checked first, on purpose
  for (const r of NOT_ROOM) if (r.re.test(s)) return { verdict: "notRoom", why: r.why };

  const hit = ROOM_WORDS.find(w => low.indexOf(w) !== -1);
  if (!hit) return { verdict: "unknown",
    why: "no word in the declared vocabulary makes this a place" };

  // a legend row naming several rooms is a legend row
  if (MULTI.test(s) && ROOM_WORDS.filter(w => low.indexOf(w) !== -1).length > 1)
    return { verdict: "notRoom", why: "a legend row listing several rooms, not one room" };

  return { verdict: "room", matched: hit };
}

// ---- one room said three ways ----------------------------------------
// "BOARD ROOM", "BOARDROOM - 20 PAX", "BOARD ROOM- 20 PAX" are one place.
// The pax count is kept on the canonical name where it is given, because
// it is real information . but it does not make two rooms.
function normalise(label) {
  let s = String(label || "").trim().toLowerCase()
    .replace(/\s*[-–—]\s*/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\.$/, "")
    .trim();
  // the same place, spelled apart
  s = s.replace(/^board ?room/, "boardroom")
       .replace(/^mr /, "meeting room ")
       .replace(/^ele\.?\/ ?ups room$/, "ups and elec room")
       .replace(/^electrical room$/, "ups and elec room")
       .replace(/^visiting meeting room/, "visiting meeting room")
       .replace(/^reception \+ waiting area$/, "reception")
       .replace(/^reception waiting area$/, "reception")
       .replace(/^collab area \/ breakout area$/, "collab area")
       .replace(/^phone booth \/ focus pod$/, "phone booth")
       .replace(/^payroll team$/, "payroll")
       .replace(/^washroom$/, "restroom");
  // strip a trailing pax count so "boardroom 20 pax" == "boardroom"
  const pax = /(\d+)\s*pax/.exec(s);
  s = s.replace(/\s*\d+\s*pax\s*/, " ").replace(/\s+/g, " ").trim();
  return { key: s, pax: pax ? Number(pax[1]) : null };
}

// ---- the room schedule -------------------------------------------------
// facts: the area facts from the ingest. Returns rooms, rejects and the
// unknown words . every label accounted for, none dropped.
function rooms(facts) {
  const kept = {}, rejected = [], unknown = [];
  for (const f of (facts || [])) {
    if (f.kind !== "area") continue;
    const c = classify(f.subject);
    if (c.verdict === "notRoom") { rejected.push({ label: f.subject, why: c.why, sqft: f.value, source: f.source }); continue; }
    if (c.verdict === "unknown") { unknown.push({ label: f.subject, sqft: f.value, source: f.source, why: c.why }); continue; }
    const n = normalise(f.subject);
    const r = kept[n.key] = kept[n.key] || { key: n.key, name: f.subject, pax: n.pax,
      saidAs: [], readings: [] };
    if (r.saidAs.indexOf(f.subject) === -1) r.saidAs.push(f.subject);
    if (n.pax && !r.pax) r.pax = n.pax;
    r.readings.push({ sqft: f.value, conf: f.conf, source: f.source, note: f.note || null });
  }

  const out = [];
  for (const k of Object.keys(kept).sort()) {
    const r = kept[k];
    const areas = [...new Set(r.readings.map(x => x.sqft))];
    const shared = r.readings.some(x => x.conf === "inferred");
    out.push({
      key: r.key, name: title(r.key), pax: r.pax, saidAs: r.saidAs,
      sqft: areas.length === 1 ? areas[0] : null,
      // ONE ROOM SAID THREE WAYS IS ONE ROOM . but two different areas for
      // it is a conflict, raised rather than averaged or majority-voted.
      conflict: areas.length > 1 ? areas.slice().sort((a, b) => b - a) : null,
      shared,                                  // its polygon carried more than one label
      readings: r.readings,
      conf: areas.length > 1 ? "conflict" : (shared ? "ambiguous" : "measured"),
    });
  }
  return { rooms: out.sort((a, b) => (b.sqft || 0) - (a.sqft || 0)),
    rejected, unknown,
    total: out.reduce((s, r) => s + (r.sqft || 0), 0),
    settled: out.filter(r => r.conf === "measured").length,
    ask: out.filter(r => r.conf !== "measured").length };
}

const title = (s) => String(s).replace(/\b[a-z]/g, c => c.toUpperCase());

const SPACES = { ROOM_WORDS, NOT_ROOM, classify, normalise, rooms, title };
root.INGEST_SPACES = SPACES;
if (typeof module !== "undefined" && module.exports) module.exports = SPACES;

})(typeof window !== "undefined" ? window : globalThis);
