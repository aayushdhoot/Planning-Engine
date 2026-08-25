// ===================================================================
// DnB-OS . platform/core/areas.js . THE UNIT OF ACCOUNT
// An area is the only thing a quantity may hang on, and every area
// appears exactly once. That is where double counting dies — at the
// source of the number, not later at the reading. A pin is a witness to
// an area; it never contributes a quantity, only a verdict.
//
//   register(spaces, geometry, pins, opts)  the canonical area list
//   proposals(reg)                          names for the unnamed, with evidence
//   witnesses(reg)                          which areas more than one pin sees
//   reconcile(reg, tolerance)               pack area vs drawing area
//   apply(reg, decisions)                   a person's answers, applied
//
// THE LAWS
//   . ONE AREA, ONE ENTRY, ONE QUANTITY. Two pins looking at a boardroom
//     do not make two boardrooms and must never make two ceilings.
//   . AN UNNAMED AREA CANNOT HOLD A STUDY. Nothing can be looked for in a
//     place that has no name, so an unnamed area is a blocker with a
//     square footage on it, not a cosmetic gap.
//   . A NAME IS PROPOSED, NEVER TAKEN. Every proposal carries the label,
//     the polygon it was read from and the pin that saw it, and waits for
//     a person. The engine writes no name into the register itself.
//   . THE PACK AND THE DRAWING MUST AGREE, OR SAY SO. Where the pin pack's
//     outline and the drawing's measured polygon differ by more than the
//     tolerance, that is a conflict and it is raised, never averaged —
//     the same discipline the fact store already keeps.
//   . A GUESSED OUTLINE IS CARRIED AS GUESSED. An area whose shape was
//     drawn by hand may be tracked, but its square footage may not be
//     spent as though it were measured.
//
// Pure: registers in, findings out. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

const R = (typeof require !== "undefined") ? require("../ingest/readers.js") : root.INGEST_READERS;
const SP = (typeof require !== "undefined") ? require("../ingest/spaces.js") : root.INGEST_SPACES;

const SQFT = 10.7639;
const UNNAMED = /^unnamed\s+space/i;

function centroid(pts) {
  let x = 0, y = 0;
  for (const p of pts) { x += p[0]; y += p[1]; }
  return [x / pts.length, y / pts.length];
}

// shoelace, in the drawing's own units
function areaOf(pts) {
  let a = 0;
  for (let i = 0, n = pts.length; i < n; i++) {
    const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % n];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

// ---- the register ------------------------------------------------------
// spaces:   the pin pack's outlines — the areas, and the unit of account
// geometry: the drawing's labelled polygons, from the ingest
// pins:     the frozen camera positions
// opts.renderNames: { pinNo: "Dry Pantry" } read off the delivered renders
function register(spaces, geometry, pins, opts) {
  const o = opts || {};
  const rooms = (geometry && geometry.rooms) || [];
  const renderNames = o.renderNames || {};

  const areas = (spaces || []).map((s, i) => {
    const sqft = Math.round((s.area_sqm || areaOf(s.pts) / 1e6) * SQFT);
    return { id: s.id != null ? String(s.id) : "a" + (i + 1),
      name: s.name, named: !UNNAMED.test(String(s.name || "")),
      type: s.type || null, guessed: !!s.guessed,
      sqft, pts: s.pts, pins: [], labels: [], renderSays: [] };
  });
  const byName = {}; areas.forEach(a => byName[a.name] = a);

  // pins are witnesses. Which area each one stands in comes from the pack.
  for (const p of (pins || [])) {
    const a = byName[p.space];
    if (!a) continue;
    a.pins.push(p.no);
    const rn = renderNames[p.no];
    if (rn && a.renderSays.indexOf(rn) === -1) a.renderSays.push(rn);
  }

  // THE DRAWING'S LABELS, PLACED BY GEOMETRY. A labelled polygon whose
  // centre falls inside an area is evidence about that area — nothing more.
  for (const rm of rooms) {
    if (!rm.pts || rm.pts.length < 3) continue;
    const c = centroid(rm.pts);
    for (const a of areas) {
      if (!R.inside(c[0], c[1], a.pts)) continue;
      for (const lb of (rm.labels || [])) {
        const cl = SP.classify(lb);
        a.labels.push({ label: lb, sqft: rm.sqft, layer: rm.layer, polygon: rm.poly,
          verdict: cl.verdict, why: cl.why || null,
          // a polygon carrying several labels cannot name anything on its own
          shared: (rm.labels || []).length > 1 });
      }
      break;                                    // an area holds a polygon once
    }
  }

  return { areas,
    named: areas.filter(a => a.named).length,
    unnamed: areas.filter(a => !a.named).length,
    guessed: areas.filter(a => a.guessed).length,
    sqft: areas.reduce((t, a) => t + a.sqft, 0),
    unnamedSqft: areas.filter(a => !a.named).reduce((t, a) => t + a.sqft, 0) };
}

// ---- names for the unnamed, proposed and never taken -------------------
function proposals(reg) {
  const out = [];
  for (const a of (reg.areas || [])) {
    if (a.named) continue;
    const cands = [];

    // 1. a room word on a polygon inside this area, on its own polygon
    const solo = a.labels.filter(l => l.verdict === "room" && !l.shared);
    for (const l of solo) {
      const n = SP.normalise(l.label);
      if (!cands.some(c => c.key === n.key))
        cands.push({ key: n.key, name: SP.title ? SP.title(n.key) : n.key, conf: "measured",
          evidence: "the drawing labels polygon " + l.polygon + " on layer " + l.layer +
                    " \"" + l.label + "\", and that polygon sits inside this outline" });
    }
    // 2. a room word on a polygon that carries other labels too — weaker
    const shared = a.labels.filter(l => l.verdict === "room" && l.shared);
    for (const l of shared) {
      const n = SP.normalise(l.label);
      if (!cands.some(c => c.key === n.key))
        cands.push({ key: n.key, name: SP.title ? SP.title(n.key) : n.key, conf: "inferred",
          evidence: "the drawing labels polygon " + l.polygon + " \"" + l.label +
                    "\", but that polygon carries other labels too, so which room it names is not established" });
    }
    // 3. what the design team called the pin when they delivered its render
    for (const rs of a.renderSays) {
      const n = SP.normalise(rs);
      if (!cands.some(c => c.key === n.key))
        cands.push({ key: n.key, name: rs, conf: "stated",
          evidence: "the design team named the render for pin " +
                    a.pins.filter(p => true).join(" / ") + " \"" + rs + "\"" });
    }

    out.push({ id: a.id, area: a.name, sqft: a.sqft, pins: a.pins.slice(),
      guessed: a.guessed, candidates: cands,
      why: cands.length
        ? null
        : "no label inside this outline names a place and no render names its pins — " +
          "somebody who knows the floor has to name it",
      blocks: "nothing can be looked for at pin " + (a.pins.join(", ") || "—") +
              " until this " + a.sqft + " sqft has a name" });
  }
  return out.sort((x, y) => y.sqft - x.sqft);
}

// ---- who sees what: the double-count exposure, counted -----------------
function witnesses(reg) {
  const multi = (reg.areas || []).filter(a => a.pins.length > 1);
  const blind = (reg.areas || []).filter(a => a.pins.length === 0);
  return { multi: multi.map(a => ({ area: a.name, pins: a.pins.slice(), sqft: a.sqft })),
    blind: blind.map(a => ({ area: a.name, sqft: a.sqft })),
    why: multi.length + " of " + reg.areas.length + " areas are seen by more than one pin. " +
      "Those pins are witnesses to one area, never two — agreeing raises confidence, " +
      "disagreeing raises a query, and neither ever adds up." +
      (blind.length ? " " + blind.length + " areas no pin sees at all." : "") };
}

// ---- the pack against the drawing --------------------------------------
function reconcile(reg, tolerance) {
  const tol = tolerance == null ? 0.10 : tolerance;
  const out = [];
  for (const a of (reg.areas || [])) {
    const solo = a.labels.filter(l => !l.shared && l.verdict === "room");
    if (!solo.length) continue;
    const drawn = solo.reduce((t, l) => t + (l.sqft || 0), 0);
    if (!drawn) continue;
    const diff = Math.abs(drawn - a.sqft) / Math.max(1, a.sqft);
    if (diff <= tol) continue;
    out.push({ area: a.name, pack: a.sqft, drawing: drawn,
      offBy: Math.round(diff * 100) + "%", guessed: a.guessed,
      why: "the pin pack calls this " + a.sqft + " sqft and the drawing measures " + drawn +
           " sqft" + (a.guessed ? ", and the pack's outline is marked guessed" : "") +
           " — raised, never averaged" });
  }
  return out.sort((x, y) => Math.abs(y.pack - y.drawing) - Math.abs(x.pack - x.drawing));
}

// ---- a person's answers, applied ---------------------------------------
// decisions: { areaId: "Dry Pantry" }. Returns a NEW register; the old one
// is never mutated, so a rejected round cannot leak into the next render.
// A DECISION MAY ARRIVE AS A BARE NAME OR AS A NAME WITH ITS BASIS. The
// second is what should always be written: a name inferred from what a
// render showed is not the same kind of thing as one read off a drawing,
// and six months from now the difference is the only way to know which
// names to re-check.
function apply(reg, decisions) {
  const d = decisions || {}, applied = [], refused = [];
  const areas = (reg.areas || []).map(a => {
    const dec = d[a.id];
    if (dec == null) return a;
    const name = typeof dec === "string" ? dec : dec.name;
    const by   = typeof dec === "string" ? "unstated" : (dec.by || "unstated");
    const why  = typeof dec === "string" ? null : (dec.why || null);
    if (name == null) return a;
    const t = String(name).trim();
    if (!t) { refused.push({ id: a.id, why: "an empty name is not a name" }); return a; }
    if ((reg.areas || []).some(x => x.id !== a.id && x.name.toLowerCase() === t.toLowerCase())) {
      refused.push({ id: a.id, why: "\"" + t + "\" is already the name of another area, and two areas " +
        "with one name is exactly the double count this register exists to prevent" }); return a; }
    applied.push({ id: a.id, was: a.name, now: t, by, why });
    return { ...a, name: t, named: true, wasCalled: a.name, namedBy: by, namedWhy: why };
  });
  const named = areas.filter(a => a.named).length;
  return { ...reg, areas, named, unnamed: areas.length - named, applied, refused,
    unnamedSqft: areas.filter(a => !a.named).reduce((t, a) => t + a.sqft, 0) };
}

const A = { register, proposals, witnesses, reconcile, apply, areaOf, centroid };
root.CORE_AREAS = A;
if (typeof module !== "undefined" && module.exports) module.exports = A;

})(typeof window !== "undefined" ? window : globalThis);
