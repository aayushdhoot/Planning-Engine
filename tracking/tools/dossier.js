#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/dossier.js . WHAT HAS TO BE HANDED OVER
//   node tools/dossier.js
//
// Builds dossier.json.
//
// A handover dossier is the last thing anybody builds and the first thing
// that holds up the last payment. RA6 — five per cent, Rs 41.1 L — is
// released against "virtual completion / handover and submission of
// required close-out documents", the performance guarantee runs to handover
// plus thirty days, and the twelve month defects period does not start
// until a certified handover date exists. Three separate things wait on a
// folder nobody has opened.
//
// WHAT IS DIFFERENT ABOUT THIS REGISTER
//   Most of it cannot be filled by an engine, and it does not pretend to.
//   But some of it can: this project has 385 approved makes, 30 purchase
//   orders with vendors on them, a drawing register of 58, four goods
//   received notes and a photographic record of 81 positions across 12
//   walks. That is a real part of an as-built and a real part of a warranty
//   pack, and it has been sitting in the engine unused.
//
//   So every item says three things: what the contract wants, WHAT THIS
//   ENGINE CAN ALREADY SUPPLY toward it, and what a person still has to
//   produce. The third is never confused with the first two.
//
// THE LAWS
//   . AN ENGINE EXTRACT IS NOT A DOCUMENT. Thirty purchase orders are not
//     warranty certificates. Where the engine can help it says what it has
//     and what is still missing, and the item stays open.
//   . NOTHING IS LODGED WITHOUT A DATE AND A NAME. Same discipline as the
//     snag register: no evidence, no closure.
//   . READINESS IS COUNTED ON WHAT IS LODGED, never on what could be
//     supplied. A dossier that scores itself on its own potential is a
//     dossier that reads finished and is empty.
//   . WHAT EACH ITEM HOLDS UP IS NAMED. An item nobody can price is an
//     item nobody chases.
// ===================================================================
const fs = require("fs"), path = require("path");

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const facts = (read("facts.json") || {}).facts || [];
const G = read("registers.json"), P = read("po.json"), D = read("design.json");
const A = read("assess.json"), BL = read("billing.json"), S = read("schedule.json");
const filed = read("dossier-filed.json") || [];

const today = new Date().toISOString().slice(0, 10);
const factOf = (rx, role) => { const f = facts.find(x => rx.test(String(x.subject)) &&
  (!role || x.role === role)); return f ? String(f.value) : null; };

// ---- WHAT THIS ENGINE CAN ALREADY SUPPLY --------------------------------
// Counted live, so it moves when the engine does. None of it is a document.
const supply = {
  makes: (() => { const n = new Set(facts.filter(f => f.role === "approved make")
    .map(f => String(f.subject))).size;
    return n ? { n, what: n + " materials with an approved make named",
      from: "the sampling register", covers: "part of the material record" } : null; })(),
  orders: P ? { n: P.totals.pos, what: P.totals.pos + " purchase orders with vendor, scope and value",
    from: "the PO register", covers: "who to claim a warranty from, per package" } : null,
  grns: P && P.grns.length ? { n: P.grns.length,
    what: P.grns.length + " dated goods-received notes",
    from: "the daily reports", covers: "part of the delivery record" } : null,
  drawings: G ? { n: G.drawings.counts.total,
    what: G.drawings.counts.total + " drawings on the register, " +
      G.drawings.counts.approvedByClient + " approved by the client",
    from: "the drawing tracker", covers: "the base set an as-built is drawn over" } : null,
  photos: A ? { n: A.counts.observations,
    what: (A.days || []).length + " walks across 81 positions, " +
      A.counts.observations.toLocaleString("en-IN") + " recorded judgements",
    from: "the site walk", covers: "a dated photographic record of the works" } : null,
  samples: D ? { n: D.counts.register,
    what: D.counts.register + " sampling rows, " + D.counts.settled + " closed",
    from: "the approval register", covers: "the specification trail" } : null,
};

// ---- what the contract asks for -----------------------------------------
// Every row here traces to the closeout register or to a clause. Nothing is
// invented; where the register named it, the register's own words are kept.
const closeoutDocs = ((G && G.closeout.rows) || [])
  .filter(r => ["document", "compliance", "handover"].indexOf(r.kind) >= 0);

const ITEMS = [
  { key: "asbuilt", name: "As-built drawings", kind: "document",
    wants: "the drawing set marked up to what was actually built",
    gates: ["RA6", "O&M"], engine: ["drawings"],
    still: "the marked-up revisions themselves — the register holds the base set, and not one " +
           "of the 58 has a client approval against it yet" },
  { key: "om", name: "Operation and maintenance manuals", kind: "document",
    wants: "one manual per installed system, from the vendor",
    gates: ["RA6"], engine: ["orders"],
    still: "the manuals. The PO register names which vendor owes each one" },
  { key: "warranty", name: "Warranty certificates assigned to SKF", kind: "document",
    wants: factOf(/^Warranty$/, "spec") ||
           "warranties endorsed to the client before handover",
    gates: ["RA6", "DLP"], engine: ["orders", "makes"],
    still: "the certificates, endorsed. The contract states chairs and workstations at 5 years, " +
           "service 1 year and DLP 12 months" },
  { key: "tests", name: "Test reports", kind: "document",
    wants: "pressure, insulation, earthing and HVAC air balance",
    gates: ["RA6", "RA5"], engine: [],
    still: "every one of them. Nothing on this engine records a test of any kind" },
  { key: "cfo", name: "Fire CFO", kind: "compliance",
    wants: "the fire department's certificate of occupancy",
    gates: ["occupancy"], engine: [],
    still: "the certificate. The provisional NOC is on the dependency register and open" },
  { key: "bmc", name: "Occupancy audit and BMC approval", kind: "compliance",
    wants: "the municipal occupancy approval", gates: ["occupancy"], engine: [],
    still: "the approval" },
  { key: "phoenix", name: "Builder pre-occupancy sign-off", kind: "compliance",
    wants: "Phoenix building guidelines sign-off", gates: ["occupancy"], engine: [],
    still: "the sign-off" },
  { key: "server", name: "Server room handover", kind: "handover",
    wants: "the critical room handed over and signed", gates: ["occupancy"],
    engine: ["photos"], still: "the signed handover note" },
  { key: "ups", name: "UPS and electrical room handover", kind: "handover",
    wants: "the critical room handed over and signed", gates: ["occupancy"],
    engine: ["photos"], still: "the signed handover note" },
  { key: "battery", name: "Battery room handover", kind: "handover",
    wants: "the critical room handed over and signed", gates: ["occupancy"],
    engine: ["photos"], still: "the signed handover note" },
  { key: "dlpbg", name: "DLP bank guarantee", kind: "billing",
    wants: factOf(/RA6 payment trigger/, "payment") ||
           "unconditional guarantee, 5%, twelve months",
    gates: ["RA6"], engine: [],
    still: "the guarantee itself — this is the instrument RA6 releases against" },
  { key: "pbg", name: "Performance guarantee closed out", kind: "billing",
    wants: factOf(/Performance security/, "payment") ||
           "5% of contract price, valid to handover plus 30 days",
    gates: ["closeout"], engine: [],
    still: "the release" },
  { key: "finalbill", name: "Final bill and re-measurement", kind: "billing",
    wants: "the item-rate contract re-measured and agreed",
    gates: ["RA6"], engine: ["orders"],
    still: "the re-measurement. The engine holds the priced quantities it was planned against" },
  { key: "record", name: "Photographic record of the works", kind: "document",
    wants: "a dated record of what was built, room by room",
    gates: [], engine: ["photos", "samples"],
    still: "nothing — this one the engine can supply in full" },
];

// ---- what somebody has actually filed ------------------------------------
// NOTHING IS LODGED WITHOUT A DATE AND A NAME.
const byKey = {}; filed.forEach(r => byKey[r.key] = r);
const rows = ITEMS.map(it => {
  const f = byKey[it.key] || null;
  const lodged = !!(f && f.on && f.by);
  const can = (it.engine || []).map(k => supply[k]).filter(Boolean);
  return Object.assign({}, it, {
    lodged, filed: lodged ? { on: f.on, by: f.by, what: f.what || null, note: f.note || null } : null,
    // AN ENGINE EXTRACT IS NOT A DOCUMENT. This is help, not closure.
    engineHas: can,
    engineCovers: can.length ? can.map(c => c.covers).join("; ") : null,
    incomplete: !!(f && (!f.on || !f.by)),
    incompleteWhy: f && (!f.on || !f.by)
      ? "filed with " + (!f.on ? "no date" : "nobody's name") + " against it, so it is not lodged"
      : null,
  });
});

// ---- what it holds up ---------------------------------------------------
const ra6 = BL ? (BL.stages || []).find(s => s.key === "RA6") : null;
const GATES = {
  RA6: { name: "RA6 retention", value: ra6 ? ra6.value : null,
    why: "released against virtual completion, handover and the close-out documents" },
  RA5: { name: "RA5 certification", value: BL ? ((BL.stages || []).find(s => s.key === "RA5") || {}).value : null,
    why: "each RA bill needs measurement and test support" },
  occupancy: { name: "Occupancy", value: null,
    why: "the floor cannot be occupied without the statutory approvals" },
  DLP: { name: "Defects liability", value: null,
    why: factOf(/Defects Liability Period/) || "twelve months from certified handover" },
  "O&M": { name: "Operation and maintenance", value: null,
    why: "the client cannot run the floor without them" },
  closeout: { name: "Contract close-out", value: null, why: "the performance guarantee is released" },
};
const gateRows = Object.keys(GATES).map(g => {
  const on = rows.filter(r => (r.gates || []).indexOf(g) >= 0);
  return Object.assign({ gate: g }, GATES[g], {
    items: on.length, lodged: on.filter(r => r.lodged).length,
    open: on.filter(r => !r.lodged).map(r => r.name) });
}).filter(x => x.items > 0);

// READINESS IS COUNTED ON WHAT IS LODGED, never on what could be supplied.
const counts = {
  items: rows.length,
  lodged: rows.filter(r => r.lodged).length,
  open: rows.filter(r => !r.lodged).length,
  incomplete: rows.filter(r => r.incomplete).length,
  engineCanHelp: rows.filter(r => r.engineHas.length).length,
  engineCanSupplyWhole: rows.filter(r => r.engineHas.length && /^nothing/.test(r.still)).length,
  readiness: Math.round(rows.filter(r => r.lodged).length / Math.max(1, rows.length) * 100),
};

const out = {
  builtAt: new Date().toISOString(), today,
  counts, rows, gates: gateRows, supply,
  handoverDate: S ? S.landsOnDate || null : null,
  why: "readiness counts what is lodged, never what could be supplied. Some of this register the " +
       "engine can help with — 385 approved makes, 30 purchase orders, a drawing register and a " +
       "photographic record across 12 walks — and none of that is a document. Where the engine " +
       "can help it says what it has and what is still missing, and the item stays open",
};
fs.writeFileSync(path.join(ENGINE, "dossier.json"), JSON.stringify(out));

const cr = (n) => n == null ? "—" : n >= 1e7 ? "Rs " + (n / 1e7).toFixed(2) + " Cr"
                : n >= 1e5 ? "Rs " + (n / 1e5).toFixed(1) + " L" : "Rs " + Math.round(n);
console.log("\n  THE HANDOVER DOSSIER  (as on " + today + ")");
console.log("    " + counts.lodged + " of " + counts.items + " lodged · readiness " +
  counts.readiness + "%");
console.log("    the engine can supply toward " + counts.engineCanHelp + " of them, and " +
  counts.engineCanSupplyWhole + " in full");
console.log("\n  WHAT IT HOLDS UP");
gateRows.forEach(g => console.log("    " + g.name.padEnd(30) +
  (g.value ? cr(g.value).padStart(11) : "".padStart(11)) + "   " +
  g.lodged + " of " + g.items + " lodged"));
console.log("\n  THE REGISTER");
rows.forEach(r => console.log("    " + (r.lodged ? "[x] " : "[ ] ") +
  r.name.slice(0, 34).padEnd(36) + r.kind.padEnd(12) +
  (r.engineHas.length ? "engine has: " + r.engineHas.map(e => e.n).join("/") : "")));
console.log("\n  WHAT THE ENGINE CAN SUPPLY TODAY");
Object.keys(supply).forEach(k => { const s = supply[k]; if (s)
  console.log("    " + s.what + "  (" + s.from + ")"); });
console.log("\n→ engines/skf/dossier.json\n");
