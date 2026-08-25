// ===================================================================
// DnB-OS . platform/core/expectation.js . WHAT A PIN SHOULD SHOW
// Phase 7. Before anybody reads a photo, the engine writes down what it
// expects that camera position to be showing on that date. A reading
// judged against an expectation is evidence; a reading judged against
// nothing is an opinion.
//
//   zoneFor(pin, bridge)          which plan zone this pin looks at
//   compile(pins, plan, day)      the expectation for every pin, that day
//   forPin(no, pins, plan, day)   one pin
//   COVERS                        what hides what, once it is finished
//
// THE LAW THAT MATTERS MOST
//   "the pin cannot see it" and "the work is not done" are different
//   facts, and confusing them is how a tracking engine starts lying.
//   Once a ceiling closes, the duct above it is invisible to every
//   camera on the floor . forever. A reading that scores it as missing
//   is wrong, and a reading that scores it as done is guessing. So the
//   expectation carries a THIRD list: what this pin genuinely cannot
//   resolve any more, and why.
//
// THE OTHER LAWS
//   . a pin whose space does not map to a plan zone gets NO expectation
//     at all, and is reported as unmapped. An expectation built on a
//     guessed zone is worse than none, because it reads as authoritative.
//   . should-see is work that has begun by that day. Must-not-see is
//     work not due to start yet: seeing it is either good news or a
//     sequence violation, and either way somebody should look.
//   . the expectation is DERIVED, never stored. It is recompiled from
//     the plan, so a revision cannot leave a stale expectation behind.
//
// Pure: pins, a plan and a date in, expectations out.
// ===================================================================

;(function (root) {

// ---- what hides what, once the covering work is complete ------------
// These are the same physical relationships the inference law reasons
// forward along (platform/track/infer.js). Read backwards they say what
// a camera can no longer see.
const COVERS = {
  ceiling_gypsum:    ["duct_gi", "duct_insulation", "sprinkler_pipe", "cable_pull", "conduit", "cable_tray"],
  ceiling_grid_tile: ["duct_gi", "duct_insulation", "sprinkler_pipe", "cable_pull", "conduit", "cable_tray"],
  ceiling_tiles:     ["duct_gi", "duct_insulation", "sprinkler_pipe", "cable_pull", "conduit", "cable_tray"],
  metal_ceiling:     ["duct_gi", "duct_insulation", "sprinkler_pipe", "cable_pull", "conduit", "cable_tray"],
  stretch_ceiling:   ["duct_gi", "duct_insulation", "sprinkler_pipe", "cable_pull", "conduit", "cable_tray"],
  board_close:       ["conduit", "gi_stud_frame"],
  board_one_face:    ["gi_stud_frame"],
  plaster:           ["blockwork"],
  paint_emulsion:    ["plaster"],
  paint_final:       ["paint_emulsion"],
  carpet_tile:       ["screed"],
  tile_vitrified:    ["screed"],
  duct_insulation:   ["duct_gi"],
};

// ---- the pin's space, to the plan's zone -----------------------------
// The layout names rooms; the plan names zones. The bridge is declared,
// and anything not in it stays unmapped rather than being guessed at.
const SPACE_ZONE = {
  "open workstation zone 1": "workstations", "open workstation zone 2": "workstations",
  "open workstation zone 3": "workstations",
  "boardroom - 20 pax": "boardroom",
  "reception + waiting area": "reception",
  "cafeteria- 52 pax": "caf_dining", "cafeteria - 52 pax": "caf_dining",
  "dishwash": "caf_kitchen",
  "hub": "circulation",
  "collab area - 1": "collab", "library": "collab", "phone booth": "collab",
  "mr- 8 pax 01": "meeting_8", "mr - 8 pax 01": "meeting_8",
  "mr- 4 pax 04": "meeting_6", "mr - 4 pax 04": "meeting_6",
  "mr - 12 pax 01": "boardroom",
  "cabin 01": "hod_cabins", "cabin 04": "hod_cabins", "cabin 05": "hod_cabins", "cabin 06": "hod_cabins",
  "payroll- 7 pax": "meeting_6", "payroll - 7 pax": "meeting_6",
  "server room": "hub_room", "ups and elec room": "services", "battery room": "services",
  "low ht storage": "services", "low ht storage 2": "services", "compactor room": "services",
  "tea bag": "pantry",
  "male wellness room": "washrooms", "female wellness room": "washrooms",
};

function zoneFor(pin, bridge) {
  const map = bridge || SPACE_ZONE;
  const k = String((pin && pin.space) || "").trim().toLowerCase();
  return map[k] || null;
}

// ---- the expectation --------------------------------------------------
function forZone(zone, plan, day) {
  const tasks = ((plan && plan.tasks) || []).filter(t => !t.gate && t.zone === zone);

  // what has finished by this day, so we know what has been covered over
  const doneByDay = {};
  for (const t of tasks) if (t.EF && t.EF < day) doneByDay[t.code] = true;

  const coveredBy = {};
  for (const coveringCode of Object.keys(COVERS)) {
    if (!doneByDay[coveringCode]) continue;
    for (const hidden of COVERS[coveringCode]) coveredBy[hidden] = coveringCode;
  }

  const shouldSee = [], mustNotSee = [], cannotResolve = [];
  for (const t of tasks) {
    const started = !!(t.ES && t.ES <= day);
    if (coveredBy[t.code]) {
      cannotResolve.push({ id: t.id, code: t.code, name: t.name,
        why: "covered by " + coveredBy[t.code] + ", finished before this day",
        hiddenBy: coveredBy[t.code] });
      continue;
    }
    if (started) shouldSee.push({ id: t.id, code: t.code, name: t.name,
      from: t.ES, to: t.EF, finished: !!(t.EF && t.EF < day) });
    else mustNotSee.push({ id: t.id, code: t.code, name: t.name, dueFrom: t.ES });
  }
  return { shouldSee, mustNotSee, cannotResolve };
}

function compile(pins, plan, day, opts) {
  const o = opts || {};
  const bridge = o.bridge || SPACE_ZONE;
  const byPin = {}, unmapped = {};

  for (const p of (pins || [])) {
    if (!p || p.no == null) continue;
    const zone = zoneFor(p, bridge);
    if (!zone) {
      (unmapped[p.space || "(no space)"] = unmapped[p.space || "(no space)"] || []).push(p.no);
      byPin[p.no] = { pin: p.no, space: p.space || null, zone: null, unmapped: true,
        shouldSee: [], mustNotSee: [], cannotResolve: [],
        why: "this pin's space is not mapped to a plan zone, so the engine has no expectation for it" };
      continue;
    }
    const e = forZone(zone, plan, day);
    byPin[p.no] = Object.assign({ pin: p.no, space: p.space || null, zone: zone, unmapped: false, why: null }, e);
  }

  return { day, byPin,
    unmappedSpaces: Object.keys(unmapped).sort().map(s => ({ space: s, pins: unmapped[s].sort((a, b) => a - b) })),
    mapped: Object.values(byPin).filter(x => !x.unmapped).length,
    total: Object.keys(byPin).length };
}

function forPin(no, pins, plan, day, opts) {
  const c = compile((pins || []).filter(p => p && p.no === no), plan, day, opts);
  return c.byPin[no] || null;
}

// one plain sentence a reader sees beside the photo, before they read it
function line(e) {
  if (!e) return "";
  if (e.unmapped) return "No expectation: this pin's space is not mapped to a plan zone.";
  const bits = [];
  bits.push(e.shouldSee.length ? e.shouldSee.length + " thing" + (e.shouldSee.length > 1 ? "s" : "") + " should be under way or done" : "nothing should have started here yet");
  if (e.mustNotSee.length) bits.push(e.mustNotSee.length + " not due to start");
  if (e.cannotResolve.length) bits.push(e.cannotResolve.length + " no longer visible from any camera");
  return bits.join(" · ");
}

const EXP = { COVERS, SPACE_ZONE, zoneFor, forZone, compile, forPin, line };
root.CORE_EXPECT = EXP;
if (typeof module !== "undefined" && module.exports) module.exports = EXP;

})(typeof window !== "undefined" ? window : globalThis);
