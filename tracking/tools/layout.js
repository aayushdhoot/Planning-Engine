#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/layout.js . THE FLOOR PLATE, WITH EVERY PIN ON IT
//   node tools/layout.js
//
// Eighty one pins, each with a position, a direction it faces, and the room
// it stands in. Everything else on this engine reads a pin as a row in a
// table; a floor is not a table, and "the ceiling is behind in the north
// east corner" is a sentence no list can produce.
//
// THE LAWS
//   . THE COORDINATES ARE THE SURVEY'S, normalised and not redrawn. This
//     places pins on a plate; it does not invent a floor plan.
//   . A PIN'S COLOUR IS ITS OWN READING, from the same walk the progress
//     page publishes. Nothing is smoothed across neighbours — two pins a
//     metre apart can honestly disagree, and hiding that would hide the
//     thing a plan view is for.
//   . A PIN NO RENDER COVERS IS DRAWN AND SAID TO BE UNSCORABLE, never
//     dropped and never counted as nought.
// ===================================================================
const fs = require("fs"), path = require("path");

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const P = read("pins.json"), A = read("areas.json"), AS = read("assess.json");

const pins = (P && P.pins) || [];
if (!pins.length) { console.error("no pins on pins.json"); process.exit(2); }

// ---- normalise the survey's coordinates onto a unit plate ---------------
const xs = pins.map(p => p.x), ys = pins.map(p => p.y);
const minX = Math.min(...xs), maxX = Math.max(...xs);
const minY = Math.min(...ys), maxY = Math.max(...ys);
const w = Math.max(1, maxX - minX), h = Math.max(1, maxY - minY);
// A CAD Y AXIS RUNS UP AND A SCREEN Y AXIS RUNS DOWN. Getting this wrong
// mirrors the floor and every "north east" sentence written off it is wrong.
const nx = (x) => (x - minX) / w;
const ny = (y) => 1 - (y - minY) / h;

// ---- what the latest walk made of each pin ------------------------------
const seen = {};
if (AS && AS.pins) Object.keys(AS.pins).forEach(k => {
  const p = AS.pins[k], day = AS.latest;
  const hst = p.history && p.history[day];
  seen[p.pin] = hst ? { yes: hst.yes, judged: hst.judged,
    pct: hst.judged ? Math.round(hst.yes / hst.judged * 100) : null,
    walkedOn: p.walkedOn || [] } : { pct: null, walkedOn: p.walkedOn || [] };
});
const unframed = new Set(((AS && AS.counts && AS.counts.unframed) || []).map(Number));

// ---- and which named area it stands in ----------------------------------
const areaOfPin = {};
((A && A.areas) || []).forEach(a => (a.pins || []).forEach(n => areaOfPin[n] = a));

const rows = pins.map(p => {
  const s = seen[p.no] || { pct: null, walkedOn: [] };
  const ar = areaOfPin[p.no] || null;
  const aim = p.aim ? { dx: nx(p.aim[0]) - nx(p.x), dy: ny(p.aim[1]) - ny(p.y) } : null;
  return {
    no: p.no, space: p.space, type: p.type,
    x: Math.round(nx(p.x) * 10000) / 10000,
    y: Math.round(ny(p.y) * 10000) / 10000,
    aim, area: ar ? ar.name : null, areaId: ar ? ar.id : null,
    areaSqft: ar ? ar.sqft : null, areaGuessed: ar ? !!ar.guessed : null,
    seen: s.yes == null ? null : s.yes, judged: s.judged == null ? null : s.judged,
    pct: s.pct, walks: (s.walkedOn || []).length,
    // A PIN NO RENDER COVERS CAN NEVER BE SCORED, and nought would be a lie
    scorable: !unframed.has(p.no),
  };
}).sort((a, b) => a.no - b.no);

const bySpace = {};
rows.forEach(r => { const k = r.area || r.space || "unnamed";
  const b = bySpace[k] = bySpace[k] || { name: k, pins: [], pct: null, sqft: r.areaSqft };
  b.pins.push(r.no); });
Object.values(bySpace).forEach(b => {
  const scored = b.pins.map(n => rows.find(r => r.no === n)).filter(r => r && r.pct != null);
  b.pct = scored.length ? Math.round(scored.reduce((t, r) => t + r.pct, 0) / scored.length) : null;
  b.walked = b.pins.filter(n => (rows.find(r => r.no === n) || {}).walks > 0).length;
});

const out = {
  builtAt: new Date().toISOString(),
  latest: AS ? AS.latest : null,
  days: AS ? AS.days : [],
  extent: { minX, maxX, minY, maxY, aspect: Math.round(w / h * 1000) / 1000 },
  counts: {
    pins: rows.length,
    scorable: rows.filter(r => r.scorable).length,
    unframed: [...unframed].sort((a, b) => a - b),
    walked: rows.filter(r => r.walks > 0).length,
    spaces: Object.keys(bySpace).length,
    named: rows.filter(r => r.area).length,
  },
  spaces: Object.values(bySpace).sort((a, b) => b.pins.length - a.pins.length),
  pins: rows,
  fov: P.fov || null,
  why: "the coordinates are the survey's own, normalised onto a unit plate — this places pins, " +
       "it does not draw a floor plan. Each pin's colour is its own reading from the latest " +
       "walk, never smoothed across its neighbours: two pins a metre apart can honestly " +
       "disagree, and a plan view exists to show exactly that",
};
fs.writeFileSync(path.join(ENGINE, "layout.json"), JSON.stringify(out));

console.log("\n  THE FLOOR PLATE");
console.log("    " + out.counts.pins + " pins across " + out.counts.spaces + " spaces · " +
  out.counts.walked + " walked · " + out.counts.scorable + " scorable · aspect " + out.extent.aspect);
if (out.counts.unframed.length) console.log("    pins " + out.counts.unframed.join(", ") +
  " have no render and can never be scored");
console.log("\n    SPACE                              PINS   READ");
Object.values(bySpace).sort((a, b) => (b.pct == null ? -1 : b.pct) - (a.pct == null ? -1 : a.pct))
  .slice(0, 14).forEach(b => console.log("    " + String(b.name).slice(0, 32).padEnd(34) +
    String(b.pins.length).padStart(4) + "   " + (b.pct == null ? "—" : b.pct + "%")));
console.log("\n→ engines/skf/layout.json\n");
