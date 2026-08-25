// ===================================================================
// DnB-OS . platform/track/readings.js . THE READINGS SPINE
// A reading is what the engine extracted from one source on one day.
// Images stay in Drive, the engine stores structured readings only.
// The image is the smallest unit: pin photo -> space -> whole site.
//
// The tag law, on every item the engine holds:
//   seen      the engine saw it in the image or source itself
//   inferred  follows from what was seen, rule named, never silent
//   claimed   a person said it, no visual proof
//   measured  a counted or measured quantity, the only source of percent
//
// Discipline:
//   . a reading without a day or source is refused
//   . an unknown pin is refused and becomes a query, never silently kept
//   . an inferred item must name its rule, inference is never invisible
//   . a measured tag must carry the measure {done, of, unit}
//   . readings are append only, corrections come as new readings
// ===================================================================

;(function (root) {

const KEY = "dnbos-track:skf:readings";
const SOURCES = ["pin_photo", "dpr", "img360", "cctv", "manual"];
const TAGS = ["seen", "inferred", "claimed", "measured"];
// not_started joined the list when the render comparison arrived: a reader
// looking at an approved view has to be able to say an element the design
// calls for is simply not there yet. Without it the whole read is refused.
const STATES = ["not_started", "started", "ongoing", "done", "blocked", "material_present", "no_change"];
const CONF = ["high", "medium", "low"];

const state = { readings: [], seq: 0 };

// ---- inference rules: hidden work proven by what closes over it -----
// when a SEEN item matches, the rule adds INFERRED items. Each inferred
// item names its rule so the trail is honest.
const INFER_RULES = [
  { id: "gypsum-closes-conduit",
    when: { work: /gypsum.*partition|partition.*gypsum/i, state: "done" },
    add: [
      { work: "GI conduiting inside partition", state: "done", confidence: "medium",
        note: "a closed gypsum partition can only close after the conduit inside it is laid" },
      { work: "Rockwool infill inside partition", state: "done", confidence: "medium",
        note: "infill goes in before the second face closes" }
    ] },
  { id: "ceiling-closes-services",
    when: { work: /false ceiling|grid ceiling|ceiling tiles|true ceiling/i, state: "done" },
    add: [
      { work: "Above ceiling services in this area", state: "done", confidence: "medium",
        note: "ducting, piping, cabling and conduits above a closed ceiling must be complete before it closes" }
    ] },
  { id: "tiles-prove-screed",
    when: { work: /vitrified tile|tile laying|tiling/i, state: "done" },
    add: [
      { work: "Self leveling under tiles", state: "done", confidence: "medium",
        note: "tiles sit on a finished level base, laying done proves the base beneath" }
    ] },
  { id: "paint-proves-prep",
    when: { work: /final coat|paint.*final|top coat/i, state: "done" },
    add: [
      { work: "Putty and primer under final coat", state: "done", confidence: "high",
        note: "a final coat sits on finished putty and primer" }
    ] },
  { id: "carpet-proves-floor",
    when: { work: /carpet/i, state: "done" },
    add: [
      { work: "Floor base under carpet", state: "done", confidence: "high",
        note: "carpet is laid only on a finished level floor" }
    ] }
];

function nextId() { state.seq++; return "R-" + String(state.seq).padStart(4, "0"); }

// a percentage must be a real number in range. A string, a null or a 120
// is refused rather than clamped, because a clamped guess reads exactly
// like a measure and the engine would have no way to tell them apart.
function validPct(v) {
  if (v === undefined || v === null) return null;      // absent is allowed
  if (typeof v !== "number" || !isFinite(v)) return "a percent must be a number";
  if (v < 0 || v > 100) return "a percent must be between 0 and 100, got " + v;
  return null;
}

function validItem(it) {
  if (!it || !(it.work || it.element)) return "item needs a work name";
  const pe = validPct(it.pct);
  if (pe) return pe;
  if (!STATES.includes(it.state)) return "item state must be one of " + STATES.join("/");
  if (!TAGS.includes(it.tag)) return "item tag must be one of " + TAGS.join("/");
  if (!CONF.includes(it.confidence)) return "item confidence must be one of " + CONF.join("/");
  if (it.tag === "measured" && !(it.measured && typeof it.measured.done === "number" && typeof it.measured.of === "number" && it.measured.of > 0))
    return "a measured tag must carry measured {done, of, unit}";
  if (it.tag === "inferred" && !it.rule)
    return "an inferred item must name its rule, inference is never invisible";
  return null;
}

// addReading(r, pinsReg) . r = { day, source, pin?, space?, file?, items:[...] }
// pinsReg = root.TRACK_PINS (or compatible) for pin discipline
function addReading(r, pinsReg) {
  const reg = pinsReg || root.TRACK_PINS;
  if (!r || !r.day || !/^\d{4}-\d{2}-\d{2}$/.test(r.day))
    return { ok: false, error: "a reading needs a day (YYYY-MM-DD)" };
  if (!SOURCES.includes(r.source))
    return { ok: false, error: "reading source must be one of " + SOURCES.join("/") };

  let space = r.space || null;
  if (r.pin != null) {
    const p = reg && reg.pins.find(x => x.no === r.pin);
    if (!p) return { ok: false, error: "unknown pin " + r.pin,
      query: { about: "reading pin " + r.pin,
        question: "A reading arrived for pin " + r.pin + " which is not in the frozen 81 pin protocol. The engine never invents a pin. Name the correct pin or confirm a protocol change.", blocking: false } };
    space = p.space;
  }
  if (space && reg && !reg.spaces.some(s => s.name === space)) {
    return { ok: false, error: "unknown space " + space,
      query: { about: "reading space " + space,
        question: "A reading named space '" + space + "' which is not in the frozen space registry. Name the correct space, the engine never silently creates one.", blocking: false } };
  }

  const pctErr = validPct(r.pct);
  if (pctErr) return { ok: false, error: "the reading's own percent is bad: " + pctErr };

  // elements are the render comparison shape. items is the older shape and
  // still legal, so nothing already read has to be read again.
  const src = (r.elements && r.elements.length) ? r.elements : (r.items || []);
  const items = [];
  for (const it of src) {
    const err = validItem(it);
    if (err) return { ok: false, error: err + " (work: " + ((it && it.work) || "?") + ")" };
    // an element keeps its own name so the package classifier can read it
    items.push(Object.assign({}, it, { work: it.work || it.element }));
  }
  if (!items.length) return { ok: false, error: "a reading needs at least one item, an empty reading says nothing" };

  // pct and confidence are the render comparison. They were being dropped
  // here, so a read that measured a view landed in the spine as states only
  // and every percentage downstream fell back to a coarse guess.
  const reading = Object.freeze({
    id: nextId(), ts: r.ts || new Date().toISOString(),
    day: r.day, source: r.source, pin: r.pin != null ? r.pin : null,
    space, file: r.file || null,
    pct: (typeof r.pct === "number") ? Math.round(r.pct) : null,
    confidence: r.confidence || null,
    note: r.note || null,
    items: items.map(it => Object.freeze(Object.assign({}, it)))
  });
  state.readings.push(reading);
  return { ok: true, reading };
}

// applyInference(reading) . returns the inferred items a SEEN done item
// triggers. Caller adds them as a NEW reading (source manual is wrong,
// keep the same source), tag inferred, rule named. Never mutates input.
function applyInference(reading) {
  const out = [];
  for (const it of reading.items) {
    if (it.tag !== "seen") continue;
    for (const rule of INFER_RULES) {
      if (rule.when.state === it.state && rule.when.work.test(it.work)) {
        for (const add of rule.add) {
          out.push({ work: add.work, state: add.state, tag: "inferred",
            confidence: add.confidence, rule: rule.id,
            note: add.note + " (from: " + it.work + ")" });
        }
      }
    }
  }
  return out;
}

// latest state per space + work, scanning newest first
function latest(space, work) {
  for (let i = state.readings.length - 1; i >= 0; i--) {
    const r = state.readings[i];
    if (space && r.space !== space) continue;
    for (const it of r.items) {
      if (it.work === work) return { day: r.day, state: it.state, tag: it.tag, confidence: it.confidence, source: r.source };
    }
  }
  return null;
}

function daysCovered() {
  const days = {};
  for (const r of state.readings) days[r.day] = 1;
  return Object.keys(days).sort();
}

// movement: what changed on `day` vs the previous covered day.
// compares latest state per space+work as of each day.
function snapshotAt(day) {
  const snap = {};
  for (const r of state.readings) {
    if (r.day > day) continue;
    for (const it of r.items) {
      const k = (r.space || "site") + " · " + it.work;
      const prev = snap[k];
      if (!prev || r.day >= prev.day) snap[k] = { day: r.day, state: it.state, tag: it.tag, space: r.space, work: it.work };
    }
  }
  return snap;
}

function movement(day) {
  const days = daysCovered().filter(d => d < day);
  const prevDay = days.length ? days[days.length - 1] : null;
  const now = snapshotAt(day), before = prevDay ? snapshotAt(prevDay) : {};
  const moved = [];
  for (const k of Object.keys(now)) {
    const a = before[k], b = now[k];
    if (b.day !== day) continue;                      // nothing new on this day
    if (!a) moved.push({ space: b.space, work: b.work, from: null, to: b.state, tag: b.tag });
    else if (a.state !== b.state) moved.push({ space: b.space, work: b.work, from: a.state, to: b.state, tag: b.tag });
  }
  return { prevDay, moved };
}

// digest(day, pinsReg) . the daily pulse: what came in, what moved,
// which pins stayed dark. Dark = expected a pin photo, none arrived.
function digest(day, pinsReg) {
  const reg = pinsReg || root.TRACK_PINS;
  const todays = state.readings.filter(r => r.day === day);
  const bySource = {};
  let items = 0;
  const litPins = {};
  const spacesTouched = {};
  for (const r of todays) {
    bySource[r.source] = (bySource[r.source] || 0) + 1;
    items += r.items.length;
    if (r.source === "pin_photo" && r.pin != null) litPins[r.pin] = 1;
    if (r.space) spacesTouched[r.space] = 1;
  }
  const dark = reg ? reg.pins.filter(p => !litPins[p.no]).map(p => ({ no: p.no, space: p.space })) : [];
  const mv = movement(day);
  return {
    day, readings: todays.length, items, bySource,
    pinsLit: Object.keys(litPins).length,
    pinsExpected: reg ? reg.pins.length : 0,
    dark, darkCount: dark.length,
    spacesTouched: Object.keys(spacesTouched).sort(),
    prevDay: mv.prevDay, moved: mv.moved
  };
}

// ---- persistence (browser only, no-op under node tests) -------------
function save() {
  try { localStorage.setItem(KEY, JSON.stringify({ readings: state.readings, seq: state.seq })); } catch (e) {}
}
function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.readings = (d.readings || []).map(r => Object.freeze(r));
    state.seq = d.seq || 0;
    return true;
  } catch (e) { return false; }
}
function reset() { state.readings = []; state.seq = 0; }

root.TRACK_READINGS = { state, addReading, applyInference, latest, snapshotAt, movement, digest, daysCovered,
  save, load, reset, SOURCES, TAGS, STATES, INFER_RULES };
if (typeof module !== "undefined") module.exports = root.TRACK_READINGS;

})(typeof window !== "undefined" ? window : globalThis);
