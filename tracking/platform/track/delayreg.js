// ===================================================================
// DnB-OS . platform/track/delayreg.js . THE DELAY AND RISK REGISTER LAW
// Every package that is behind its plan line or held at a gate, in one
// register: what slipped, why, who owns the recovery, and the date it is
// due back. The status comes straight from the compare law, so this
// register can never disagree with the Compare tab or the reports.
//
// The rules:
//   . a row is listed only when the compare law scores it "behind" or
//     "risk". Done, ahead, on plan and not due rows never appear here.
//   . the reason is the row's own words: the gate reason for a risk, the
//     plain site note for a behind row. Never invented.
//   . the owner defaults to the FS trade lead responsible for that kind
//     of work (site, MEP or procurement). Where a package sits behind a
//     client or statutory gate already on record, that external owner is
//     shown beside the FS owner, traced not guessed.
//   . the recovery date is never guessed. It is blank ("not captured")
//     until a human types it. Owner and recovery both come from an
//     editable overlay the UI writes, so the register is corrected in
//     place and the correction is the source of truth.
//
// Pure. No DOM, no fetch, no ledger. buildGroups comes from the compare
// law (passed in or read off root), everything else is arithmetic, so the
// guards drive it offline.
// ===================================================================

;(function (root) {

var DAY = 86400000;
function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function daysBetween(a, b) { var x = parse(a), y = parse(b); return (x && y) ? Math.round((y - x) / DAY) : null; }

// the two statuses this register carries, worst first
var LISTED = ["behind", "risk"];

// ---- the FS trade lead default owner -------------------------------
// Owner by trade lead, the way Sourabh asked. A buy or selection gate is
// procurement's to chase, mechanical and electrical trades are the MEP
// lead's, everything built on the floor is the site lead's. These are
// role owners, editable to a real name in the UI in one click.
var OWNER_PROCURE = "FS Procurement lead";
var OWNER_MEP = "FS MEP lead";
var OWNER_SITE = "FS Site lead";

var PROCURE_RE = /not ordered|order|vendor not appointed|not awarded|PO not placed|\bpo\b|quote stage|at quote|selection pending|fixture selection|sample|material still/i;
var MEP_GROUPS = { "HVAC": 1, "Electrical": 1, "Plumbing": 1, "ELV and low voltage": 1, "Fire fighting": 1 };

function defaultOwner(group, reason, note) {
  var text = String(reason || "") + " " + String(note || "");
  if (PROCURE_RE.test(text)) return OWNER_PROCURE;
  if (MEP_GROUPS[group]) return OWNER_MEP;
  return OWNER_SITE;
}

// ---- linked external gates -----------------------------------------
// Some packages are held by a client or statutory decision already on the
// dependency register. Naming that gate beside the FS owner is a trace,
// not a guess: the fact is in the deps pack. A package with no linked gate
// simply has none.
var DEFAULT_GATES = {
  "Carpet flooring":     { who: "SKF", ask: "carpet sample approval" },
  "Sanitary second fix": { who: "SKF", ask: "sanitary fixture selection" },
  "Toilet cubicles":     { who: "SKF", ask: "cubicle finish selection" }
};

// ---- the reason, in the row's own words ----------------------------
function reasonFor(row, chip) {
  if (chip === "risk" && row.reason) return String(row.reason);
  if (row.note) return String(row.note);
  return chip === "risk" ? "held at a gate" : "behind its plan line";
}

// ---- the overlay: owner and recovery a human typed -----------------
// shape { byName: { "<package name>": { owner, recovery } } }. A blank
// string clears back to the default, so the UI can undo an edit.
function overlayFor(overlay, name) {
  var o = overlay && overlay.byName ? overlay.byName[name] : null;
  return o || {};
}

// score one register row from a compare row already assessed
function makeRow(row, a, group, today, overlay, gates) {
  var chip = a.chip;
  var reason = reasonFor(row, chip);
  var ownerDef = defaultOwner(group, row.reason, row.note);
  var ov = overlayFor(overlay, row.name);
  var gate = (gates && gates[row.name]) || DEFAULT_GATES[row.name] || null;
  var overdue = row.pf ? Math.max(0, daysBetween(row.pf, today) || 0) : 0;
  var ownerSet = (typeof ov.owner === "string" && ov.owner.trim().length > 0);
  var recSet = (typeof ov.recovery === "string" && ov.recovery.trim().length > 0);
  return {
    name: row.name, group: group, chip: chip,
    plan: a.plan, site: a.site,
    reason: reason,
    windowStart: row.ps || null, windowFinish: row.pf || null,
    overdueDays: overdue,
    owner: ownerSet ? ov.owner.trim() : ownerDef,
    ownerDefault: ownerDef, ownerEdited: ownerSet,
    gate: gate,                                  // external client or statutory gate, or null
    recovery: recSet ? ov.recovery.trim() : null, // null prints "not captured", never a guess
    recoveryEdited: recSet,
    note: row.note || null
  };
}

// the register: every behind or risk row, worst first (behind above risk,
// then the widest gap). overlay and gates optional.
function build(pack, today, overlay, opts) {
  opts = opts || {};
  var CMP = opts.CMP || root.TRACK_COMPARE;
  var gates = opts.gates || null;
  var t = today || (pack && pack.asOf);
  var out = [];
  if (CMP && CMP.buildGroups && pack) {
    var bg = CMP.buildGroups(pack, t);
    for (var i = 0; i < bg.groups.length; i++) {
      var g = bg.groups[i];
      for (var j = 0; j < g.rows.length; j++) {
        var x = g.rows[j];
        if (LISTED.indexOf(x.a.chip) === -1) continue;
        out.push(makeRow(x.row, x.a, g.label, t, overlay, gates));
      }
    }
  }
  var RANK = { behind: 2, risk: 1 };
  out.sort(function (p, q) {
    if (RANK[q.chip] !== RANK[p.chip]) return RANK[q.chip] - RANK[p.chip];
    var gp = (p.plan || 0) - (p.site || 0), gq = (q.plan || 0) - (q.site || 0);
    return gq - gp;
  });
  return out;
}

// the counts a header quotes: total listed, behind, at risk, how many
// still need an owner or a recovery date typed, how many overdue.
function summary(rows) {
  rows = rows || [];
  var behind = 0, risk = 0, noRecovery = 0, overdue = 0, gated = 0;
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (r.chip === "behind") behind++; else if (r.chip === "risk") risk++;
    if (!r.recovery) noRecovery++;
    if (r.overdueDays > 0) overdue++;
    if (r.gate) gated++;
  }
  return { total: rows.length, behind: behind, risk: risk,
    noRecovery: noRecovery, overdue: overdue, gated: gated };
}

root.TRACK_DELAYREG = {
  LISTED: LISTED, DEFAULT_GATES: DEFAULT_GATES,
  OWNER_PROCURE: OWNER_PROCURE, OWNER_MEP: OWNER_MEP, OWNER_SITE: OWNER_SITE,
  defaultOwner: defaultOwner, reasonFor: reasonFor, daysBetween: daysBetween,
  build: build, summary: summary, makeRow: makeRow
};
if (typeof module !== "undefined") module.exports = root.TRACK_DELAYREG;

})(typeof window !== "undefined" ? window : globalThis);
