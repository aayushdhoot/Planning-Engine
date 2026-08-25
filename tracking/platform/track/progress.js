// ===================================================================
// DnB-OS . platform/track/progress.js . THE COMPLETION LAW
//
// The engine could always say what work was happening. It could never say
// how far along it was, so every percentage on every screen came from a
// hand judged pack and nothing moved when the day moved. This is the law
// that closes that gap.
//
// The idea: each pin has an approved render, which is that view finished.
// The walk photo is that view now. Comparing the two gives a completion
// for the pin, element by element. Roll the pins up and you have the
// space, the package and the project, on the day the walk was shot.
//
// The laws:
//   . a percentage exists only where a read exists. A pin nobody read is
//     null, printed as not captured, never zero. Zero is a claim.
//   . an average always carries how many pins it came from. Four pins out
//     of forty is a reading, not a project percentage, and the caller is
//     told so it can say which it has.
//   . the reader's own number wins. If the reader compared render to photo
//     and said 35, that is 35. The engine derives one only when the reader
//     gave none, and marks it derived so nobody mistakes it for a measure.
//   . a fall is never smoothed. If a pin reads lower than it did, that is
//     surfaced as a regression for a human to explain, because it usually
//     means the read was wrong, not that the building came apart.
//   . movement is only ever between two days that were actually read.
//     Gaps are named, never interpolated.
//   . the whole module is pure. Readings in, verdicts out, no clock, no
//     storage, so the guards can break every rule offline.
// ===================================================================

;(function (root) {

// ---- the trades a work item can belong to ---------------------------
// One classifier for the whole engine. It used to live in the view, which
// meant a second copy could drift from this one.
const PACKAGES = [
  { key: "Fire fighting",          re: /sprinkler|fire\b|firefight|fire fighting|hydrant|drencher|smoke detect/gi },
  { key: "HVAC",                   re: /hvac|duct|vrv|vrf\b|odu\b|refrigerant|diffuser|grille|ahu\b/gi },
  { key: "ELV and low voltage",    re: /\bfas\b|\bpa\b|cctv|access control|cat ?6|network|data cabl|\belv\b/gi },
  { key: "Electrical",             re: /electric|conduit|wiring|cable tray|containment|\bdb\b|back box|light fixture|lighting/gi },
  { key: "Plumbing",               re: /plumb|drain|waste pipe|sanitary|toilet|cubicle|\bcp fitting/gi },
  { key: "Interiors and finishes", re: /partition|gypsum|ceiling|glaz|glass|putty|paint|carpet|cladding|\bply\b|plywood|panel|furniture|workstation|door|laminate|veneer|finish|soffit|joinery|carpentry|millwork|counter|desk|table|chair|seating|screen|blind|planter|planting|feature wall|\bwall\b|skirting|signage|upholstery|monitor/gi },
  { key: "Civil and wet works",    re: /block|aac|plaster|screed|tile|waterproof|termite|civil|trench|vitrified|floor/gi }
];

function packageFor(text) {
  const t = String(text || "");
  let best = null, bestN = 0;
  for (const p of PACKAGES) {
    const n = (t.match(p.re) || []).length;
    if (n > bestN) { best = p.key; bestN = n; }
  }
  return best || "Other";
}

// ---- turning a state into a number, only when the reader gave none ---
// Coarse on purpose. A state was never meant to be a measure, so anything
// derived this way is labelled derived and a caller may choose to ignore it.
const STATE_PCT = {
  not_started: 0, no_change: 0, blocked: 0, material_present: 5,
  started: 15, ongoing: 50, done: 100
};

// null and undefined are absent, not zero. Number(null) is 0, so a plain
// isFinite test turned "this pin was never measured" into "this pin is at
// zero percent", which is a claim the reader never made. The spine stores
// pct as null when none was given, so this is the difference between a
// blank report and a report saying the floor has not started.
function clampPct(n) {
  if (n === null || n === undefined || n === "") return null;
  const v = Number(n);
  if (!isFinite(v)) return null;
  return Math.max(0, Math.min(100, Math.round(v)));
}

// ---- one pin on one day ---------------------------------------------
// Three ways a pin gets a percentage, strongest first:
//   stated    the reader compared render to photo and gave a number
//   elements  the reader gave a number per element, averaged here
//   derived   only states were given, mapped coarsely and flagged
function pinPercent(rec) {
  if (!rec) return null;
  const stated = clampPct(rec.pct);
  if (stated !== null) {
    const n = (rec.elements && rec.elements.length) ? rec.elements.length : (rec.items || []).length;
    return { pct: stated, from: "stated", confidence: rec.confidence || "medium", elements: n };
  }
  // elements survive storage as items, so look in both. This is the shape
  // the spine hands back, not the shape the reader sent.
  const els = (rec.elements && rec.elements.length) ? rec.elements : (rec.items || []);
  const withPct = els.map(e => clampPct(e.pct)).filter(v => v !== null);
  if (withPct.length) {
    const mean = withPct.reduce((a, b) => a + b, 0) / withPct.length;
    return { pct: Math.round(mean), from: "elements", confidence: rec.confidence || "medium",
             elements: els.length };
  }
  const states = els.map(i => STATE_PCT[i.state]).filter(v => v !== undefined);
  if (states.length) {
    const mean = states.reduce((a, b) => a + b, 0) / states.length;
    return { pct: Math.round(mean), from: "derived", confidence: "low", elements: els.length };
  }
  return null;   // nothing to go on, and the law will not invent one
}

// every pin read on a day
function byPin(readings, day) {
  const out = {};
  for (const r of (readings || [])) {
    if (r.day !== day || r.source !== "pin_photo" || r.pin == null) continue;
    const p = pinPercent(r);
    if (!p) continue;
    // a pin read twice on one day keeps the later record
    out[r.pin] = Object.assign({ pin: r.pin, space: r.space || null }, p, { rec: r });
  }
  return out;
}

// ---- a space is the mean of the pins that were read in it ------------
// It always says how many of the space's pins that mean came from, so a
// one pin reading is never mistaken for a whole room.
function bySpace(readings, day, pinsReg) {
  const pins = byPin(readings, day);
  const spaceOf = {}, totalIn = {};
  for (const p of ((pinsReg && pinsReg.pins) || [])) {
    spaceOf[p.no] = p.space;
    totalIn[p.space] = (totalIn[p.space] || 0) + 1;
  }
  const acc = {};
  for (const no in pins) {
    const sp = pins[no].space || spaceOf[no];
    if (!sp) continue;
    const e = acc[sp] || (acc[sp] = { space: sp, sum: 0, read: 0, pins: [], derived: 0 });
    e.sum += pins[no].pct; e.read++; e.pins.push(Number(no));
    if (pins[no].from === "derived") e.derived++;
  }
  return Object.keys(acc).map(sp => {
    const e = acc[sp];
    return { space: sp, pct: Math.round(e.sum / e.read), pinsRead: e.read,
             pinsTotal: totalIn[sp] || e.read, pins: e.pins.sort((a, b) => a - b),
             allDerived: e.derived === e.read };
  }).sort((a, b) => a.space < b.space ? -1 : 1);
}

// ---- a package is the mean of its elements, wherever they were seen --
// Element level on purpose: a pin can carry HVAC at 80 and partitions at
// 20, and averaging the pin would tell you nothing about either trade.
function byPackage(readings, day) {
  const acc = {};
  for (const r of (readings || [])) {
    if (r.day !== day || r.source !== "pin_photo") continue;
    const items = (r.elements && r.elements.length) ? r.elements : (r.items || []);
    for (const it of items) {
      const pkg = packageFor(it.element || it.work || "");
      let pct = clampPct(it.pct);
      let derived = false;
      if (pct === null && STATE_PCT[it.state] !== undefined) { pct = STATE_PCT[it.state]; derived = true; }
      if (pct === null) continue;
      const e = acc[pkg] || (acc[pkg] = { pkg, sum: 0, n: 0, derived: 0, pins: {} });
      e.sum += pct; e.n++; if (derived) e.derived++;
      if (r.pin != null) e.pins[r.pin] = 1;
    }
  }
  return Object.keys(acc).map(k => {
    const e = acc[k];
    return { pkg: e.pkg, pct: Math.round(e.sum / e.n), readings: e.n,
             pins: Object.keys(e.pins).length, allDerived: e.derived === e.n };
  }).sort((a, b) => PACKAGES.findIndex(p => p.key === a.pkg) - PACKAGES.findIndex(p => p.key === b.pkg));
}

// ---- the project on a day, and how much of it was actually seen ------
function overall(readings, day, pinsReg) {
  const pins = byPin(readings, day);
  const nos = Object.keys(pins);
  const total = ((pinsReg && pinsReg.pins) || []).length || nos.length;
  if (!nos.length) return { pct: null, pinsRead: 0, pinsTotal: total, coverage: 0 };
  const sum = nos.reduce((a, no) => a + pins[no].pct, 0);
  return { pct: Math.round(sum / nos.length), pinsRead: nos.length, pinsTotal: total,
           coverage: Math.round(100 * nos.length / total) };
}

// the days that carry a pin read, oldest first
function readDays(readings) {
  const d = {};
  for (const r of (readings || [])) if (r.source === "pin_photo" && r.pin != null) d[r.day] = 1;
  return Object.keys(d).sort();
}

function previousReadDay(readings, day) {
  const days = readDays(readings).filter(d => d < day);
  return days.length ? days[days.length - 1] : null;
}

// ---- what moved, between two days that were both read ----------------
// Never between a read day and a guess. If there is no earlier read the
// answer is "no earlier read", not a comparison against nothing.
function movement(readings, day, pinsReg) {
  const prev = previousReadDay(readings, day);
  if (!prev) return { day, prevDay: null, gapDays: null, spaces: [], packages: [], overall: null,
                      note: "no earlier read to compare against" };
  const gap = Math.round((new Date(day) - new Date(prev)) / 86400000);

  const nowS = bySpace(readings, day, pinsReg), wasS = bySpace(readings, prev, pinsReg);
  const wasSMap = {}; wasS.forEach(s => wasSMap[s.space] = s);
  const spaces = nowS.map(s => {
    const w = wasSMap[s.space];
    return { space: s.space, pct: s.pct, was: w ? w.pct : null,
             delta: w ? s.pct - w.pct : null, pinsRead: s.pinsRead, pinsTotal: s.pinsTotal,
             regression: !!(w && s.pct < w.pct) };
  }).sort((a, b) => (b.delta == null ? -1 : b.delta) - (a.delta == null ? -1 : a.delta));

  const nowP = byPackage(readings, day), wasP = byPackage(readings, prev);
  const wasPMap = {}; wasP.forEach(p => wasPMap[p.pkg] = p);
  const packages = nowP.map(p => {
    const w = wasPMap[p.pkg];
    return { pkg: p.pkg, pct: p.pct, was: w ? w.pct : null,
             delta: w ? p.pct - w.pct : null, pins: p.pins,
             regression: !!(w && p.pct < w.pct) };
  }).sort((a, b) => (b.delta == null ? -1 : b.delta) - (a.delta == null ? -1 : a.delta));

  const oNow = overall(readings, day, pinsReg), oWas = overall(readings, prev, pinsReg);
  return { day, prevDay: prev, gapDays: gap, spaces, packages,
    overall: { pct: oNow.pct, was: oWas.pct,
               delta: (oNow.pct != null && oWas.pct != null) ? oNow.pct - oWas.pct : null },
    note: null };
}

// ---- the whole timeline, one row per read day ------------------------
// This is what a chart of real progress is drawn from, and what tells you
// a package sat still for four days.
function series(readings, pinsReg) {
  return readDays(readings).map(day => {
    const o = overall(readings, day, pinsReg);
    return { day, pct: o.pct, pinsRead: o.pinsRead, pinsTotal: o.pinsTotal, coverage: o.coverage };
  });
}

// a package's own line through the days
function packageSeries(readings, pkg) {
  return readDays(readings).map(day => {
    const row = byPackage(readings, day).filter(p => p.pkg === pkg)[0];
    return { day, pct: row ? row.pct : null, pins: row ? row.pins : 0 };
  });
}

// ---- has this day been read well enough to quote? --------------------
// A percentage from six pins is honest about six pins. This is the test a
// screen uses to decide between printing a number and printing the reason
// it will not.
function quotable(readings, day, pinsReg, minCoverage) {
  const o = overall(readings, day, pinsReg);
  const need = minCoverage == null ? 50 : minCoverage;
  if (o.pct === null) return { ok: false, why: "this day carries no pin read", coverage: 0 };
  if (o.coverage < need)
    return { ok: false, coverage: o.coverage,
             why: "only " + o.pinsRead + " of " + o.pinsTotal + " pins were read on this day" };
  return { ok: true, coverage: o.coverage, pct: o.pct };
}

root.TRACK_PROGRESS = {
  PACKAGES, STATE_PCT, packageFor, clampPct,
  pinPercent, byPin, bySpace, byPackage, overall,
  readDays, previousReadDay, movement, series, packageSeries, quotable
};
if (typeof module !== "undefined") module.exports = root.TRACK_PROGRESS;

})(typeof window !== "undefined" ? window : globalThis);
