// ===================================================================
// DnB-OS . platform/core/trend.js . WHAT KEEPS HAPPENING
// Phase 9. A single bad day is weather. The same bad day, three times,
// against the same trade, is a problem somebody should hear about
// before the client says it first. This law reads ACROSS days and fires
// on patterns, never on a day.
//
//   vendorFor(code, pos)        who holds this work, from the PO register
//   series(dayDiffs)            zone x code, day by day
//   patterns(series, opts)      the runs worth naming
//   vendorPatterns(pats, pos)   one vendor failing in more than one place
//   actions(patterns, opts)     a remedy and an escalation level for each
//   escalate(action, seenBefore) what happens when nobody answers
//
// THE LAWS
//   . A PATTERN, NOT A DAY. Nothing fires on one miss. One thin day is
//     weather, a delivery, a festival, a funeral. Three running is a
//     problem. A report that cries on day one is a report nobody reads
//     by week three.
//   . A VENDOR IS NAMED ONLY WHEN THEY FAIL IN MORE THAN ONE PLACE.
//     One late package is a package. The same vendor late on two at
//     once is a vendor, and that is a different conversation.
//   . AN UNANSWERED ALERT RISES. The ladder is site, lead, BU head,
//     management. It rises on repetition and it rises faster on the
//     critical path, because that is where a week costs the end date.
//   . THE REMEDY IS NAMED, NOT IMPLIED. More men, a second shift, a
//     re-sequence, a different vendor. An alert with no proposed move
//     is a complaint.
//   . NOTHING HERE CHANGES THE PLAN. Every action is a proposal with an
//     owner, and a human accepts it. The engine reports and suggests;
//     it does not re-plan behind anybody's back.
//
// Pure: day diffs and a PO list in, patterns out. No clock, no storage.
// ===================================================================

;(function (root) {

const LADDER = ["site", "lead", "bu_head", "management"];

// ---- who holds this work --------------------------------------------
// The PO register describes scope in words. The bridge is declared, and
// a code nobody's scope covers returns null rather than a guessed vendor:
// naming the wrong firm is worse than naming none.
const SCOPE_WORDS = {
  gypsum: ["ceiling_gypsum", "board_one_face", "board_close", "gi_stud_frame"],
  ceiling: ["ceiling_gypsum", "ceiling_grid_tile", "ceiling_tiles", "metal_ceiling"],
  partition: ["gi_stud_frame", "board_one_face", "board_close"],
  electric: ["conduit", "cable_pull", "cable_tray", "db_panel"],
  "air condition": ["duct_gi", "duct_insulation", "fcu_unit"],
  hvac: ["duct_gi", "duct_insulation", "fcu_unit"],
  duct: ["duct_gi", "duct_insulation"],
  // NOT a bare "fire": it catches "fire rated laminate ceiling", which is a
  // gypsum scope, and hands the sprinklers to the ceiling contractor.
  "fire fighting": ["sprinkler_pipe", "sprinkler_head"],
  "fire protect": ["sprinkler_pipe", "sprinkler_head"],
  "fire alarm": ["cable_pull"],
  sprinkler: ["sprinkler_pipe", "sprinkler_head"],
  furniture: ["workstation", "storage_unit", "joinery_panel"],
  "loose furniture": ["workstation", "storage_unit"],
  "modular furniture": ["workstation", "storage_unit"],
  flooring: ["carpet_tile", "tile_vitrified", "stone_marble", "screed"],
  paint: ["paint_emulsion", "paint_final", "texture_paint"],
  civil: ["blockwork", "plaster", "screed", "waterproofing"],
  plumb: ["plumbing_first_fix", "plumbing_second_fix"],
  security: ["cable_pull", "cable_tray"],
};

function vendorFor(code, pos) {
  const list = (pos && (pos.pos || pos)) || [];
  const hits = [];
  for (const p of list) {
    if (!p || !p.vendor) continue;
    const text = String((p.scope || "") + " " + (p.headSub || "") + " " + (p.fullScope || "")).toLowerCase();
    for (const w of Object.keys(SCOPE_WORDS)) {
      if (text.indexOf(w) === -1) continue;
      if (SCOPE_WORDS[w].indexOf(code) === -1) continue;
      hits.push({ vendor: p.vendor, po: p.po, value: p.value || 0 });
      break;
    }
  }
  if (!hits.length) return null;
  // the biggest order wins when several vendors touch the same code
  hits.sort((a, b) => (b.value || 0) - (a.value || 0));
  return hits[0];
}

// ---- the series ------------------------------------------------------
// zone x code, day by day, from the Phase 8 diffs.
function series(dayDiffs) {
  const out = {};
  const days = (dayDiffs || []).slice().sort((a, b) => (a.day < b.day ? -1 : 1));
  for (const d of days) {
    for (const no of Object.keys((d && d.byPin) || {})) {
      const p = d.byPin[no];
      if (!p || p.unmapped || !p.read) continue;      // a dark pin says nothing either way
      for (const r of p.rows) {
        const key = p.zone + "|" + r.code;
        (out[key] = out[key] || { zone: p.zone, code: r.code, name: r.name, days: [] })
          .days.push({ day: d.day, verdict: r.verdict, pin: p.pin });
      }
    }
  }
  // one verdict per zone/code/day: the worst wins, so a single good pin
  // cannot bury a miss reported by three others
  const RANK = { contradiction: 0, not_seen: 1, early: 2, unplanned: 3, seen: 4 };
  for (const k of Object.keys(out)) {
    const byDay = {};
    for (const e of out[k].days) {
      if (!byDay[e.day] || RANK[e.verdict] < RANK[byDay[e.day].verdict]) byDay[e.day] = e;
    }
    out[k].days = Object.keys(byDay).sort().map(d => byDay[d]);
  }
  return out;
}

// ---- the patterns ----------------------------------------------------
function patterns(ser, opts) {
  const o = opts || {};
  const run = o.runNeeded || 3;
  const critical = o.criticalCodes || {};     // { "zone|code": true }
  const out = [];

  for (const key of Object.keys(ser || {})) {
    const s = ser[key];
    let streak = [];
    const flush = () => {
      if (streak.length >= run) {
        const isCrit = !!critical[key];
        out.push({ kind: "miss_run", zone: s.zone, code: s.code, name: s.name,
          days: streak.length, from: streak[0].day, to: streak[streak.length - 1].day,
          critical: isCrit,
          what: s.name + " in " + s.zone + " has not been seen for " + streak.length +
                " reads running" + (isCrit ? ", and it sits on the chain that sets the finish" : "") });
      }
      streak = [];
    };
    for (const e of s.days) {
      if (e.verdict === "not_seen") streak.push(e); else flush();
    }
    flush();

    // a contradiction that keeps coming back is not a bad photo
    const contras = s.days.filter(e => e.verdict === "contradiction");
    if (contras.length >= 2) {
      out.push({ kind: "contradiction_run", zone: s.zone, code: s.code, name: s.name,
        days: contras.length, from: contras[0].day, to: contras[contras.length - 1].day,
        critical: !!critical[key],
        what: s.name + " in " + s.zone + " has contradicted the plan on " + contras.length +
              " separate reads. One read can be wrong; " + contras.length + " is the plan being wrong." });
    }
  }
  out.sort((a, b) => (b.critical - a.critical) || (b.days - a.days));
  return out;
}

// ---- one vendor, failing in more than one place ----------------------
// One late package is a package. The same firm late on two at once is a
// vendor, and that is a different conversation with a different remedy.
function vendorPatterns(pats, pos, opts) {
  const o = opts || {};
  const need = o.placesNeeded || 2;
  const by = {};
  for (const p of (pats || [])) {
    const v = vendorFor(p.code, pos);
    if (!v) continue;
    const b = by[v.vendor] = by[v.vendor] || { vendor: v.vendor, pos: {}, places: {}, pats: [] };
    b.pos[v.po] = 1; b.places[p.zone + "|" + p.code] = 1; b.pats.push(p);
  }
  return Object.values(by)
    .filter(b => Object.keys(b.places).length >= need)
    .map(b => ({ kind: "vendor", vendor: b.vendor,
      places: Object.keys(b.places).length, pos: Object.keys(b.pos),
      critical: b.pats.some(p => p.critical),
      patterns: b.pats,
      what: b.vendor + " is behind in " + Object.keys(b.places).length +
            " separate places at once (" + b.pats.map(p => p.name + " in " + p.zone).join(", ") +
            "). That is the vendor, not the package." }))
    .sort((a, b) => (b.critical - a.critical) || (b.places - a.places));
}

// ---- the remedy and the ladder ---------------------------------------
// An alert with no proposed move is a complaint.
const REMEDIES = {
  miss_run: ["put more men on it", "run a second shift on this front", "re-sequence around it"],
  contradiction_run: ["walk the area and settle what is actually built",
    "re-read the pins for this area", "correct the plan if the site is right"],
  vendor: ["press the vendor with a written recovery plan", "add a second vendor to this scope",
    "change the vendor"],
};

function levelFor(p, seenBefore) {
  // repetition raises it, and the critical path raises it faster
  let i = 0;
  if ((seenBefore || 0) >= 1) i++;
  if ((seenBefore || 0) >= 3) i++;
  if (p.critical) i++;
  if (p.kind === "vendor" && p.places >= 3) i++;
  return LADDER[Math.min(i, LADDER.length - 1)];
}

function actions(pats, opts) {
  const o = opts || {};
  const seen = o.seenBefore || {};      // { patternId: timesRaisedWithNoAnswer }
  return (pats || []).map(p => {
    const id = p.kind + ":" + (p.vendor || (p.zone + "|" + p.code));
    const before = seen[id] || 0;
    return {
      id, kind: p.kind, critical: !!p.critical,
      what: p.what,
      remedies: REMEDIES[p.kind] || [],
      level: levelFor(p, before),
      raisedBefore: before,
      // the engine proposes; a human accepts. Nothing here re-plans.
      accepted: false,
      note: before >= 1
        ? "Raised " + before + " time" + (before > 1 ? "s" : "") + " already with no answer, so it has gone up the line."
        : null,
    };
  }).sort((a, b) => LADDER.indexOf(b.level) - LADDER.indexOf(a.level));
}

function line(acts) {
  if (!acts || !acts.length) return "Nothing has repeated often enough to raise.";
  const top = acts[0];
  const mgmt = acts.filter(a => a.level === "management" || a.level === "bu_head").length;
  return acts.length + " thing" + (acts.length > 1 ? "s" : "") + " worth raising"
    + (mgmt ? ", " + mgmt + " of them above the site" : "") + ". Top of the list: " + top.what;
}

const TREND = { LADDER, SCOPE_WORDS, REMEDIES, vendorFor, series, patterns,
  vendorPatterns, actions, levelFor, line };
root.CORE_TREND = TREND;
if (typeof module !== "undefined" && module.exports) module.exports = TREND;

})(typeof window !== "undefined" ? window : globalThis);
