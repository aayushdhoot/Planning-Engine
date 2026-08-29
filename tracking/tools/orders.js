#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/orders.js . WHAT HAS ACTUALLY BEEN BOUGHT
//   node tools/orders.js
//
// Builds po.json.
//
// The Resources page was written on the belief that nothing on this engine
// records a purchase. That was true of engines/skf and false of the repo:
// the tracking engine holds thirty purchase orders worth Rs 6.20 Cr, four
// dated goods-received notes read out of the daily reports, and the internal
// cost of every BOQ head. All of it sat unread while the material page asked
// a foreman whether the ducting had been ordered.
//
// This joins that register to the packages the programme schedules.
//
// HOW A PO FINDS ITS PACKAGE
//   1. BY ITS OWN WORDS. The PO scope is a description, and this engine
//      already has a tested description matcher — the one that reads 1,472
//      bill lines. Eighteen of the thirty read straight off it.
//   2. BY A DECLARED ALIAS. A handful say things the bill never says
//      ("Acoustic call booths", "Mathadi labour"). Those are mapped by hand,
//      here, in the open — rather than by bending a rule that is under test
//      against the whole bill to fit thirty rows.
//   3. BY HEAD, but ONLY where the PO says it covers a whole head. "Complete
//      HVAC package, SITC" for Rs 1.12 Cr does cover the ducting, the units
//      and the grilles. "Philips light fixtures" on the same head does not
//      cover the whole of electrical, and must never be read that way.
//
// THE LAWS
//   . A PO IS AN ORDER, NOT A DELIVERY. It says somebody bought it. Only a
//     GRN, or the camera, says it arrived.
//   . A GRN WITH NO QUANTITY IS "IT CAME, NOBODY COUNTED IT". None of these
//     four carry one, and none is read as a full delivery.
//   . A PO THAT MATCHES NO PACKAGE IS REPORTED, never dropped. Six of these
//     are site preliminaries — labour, security, housekeeping — and buy no
//     package at all. That is an answer, and it is on the file.
//   . WHOLE-HEAD COVERAGE IS WEAKER EVIDENCE THAN A NAMED SCOPE, and the
//     row says which it was.
// ===================================================================
const fs = require("fs"), path = require("path");
const SCOPE = require(path.join(__dirname, "../platform/core/scope.js"));
const PO   = require(path.join(__dirname, "../platform/track/project/skf_po.js"));
const SITE = require(path.join(__dirname, "../platform/track/project/skf_site.js"));
// THE SAME THIRTY ORDERS, WITH THE DATE THE VENDOR PROMISED. The PO pack
// carries the head and the tax split; the procurement pack carries the
// promised delivery and the advance. Neither is complete on its own.
const PROC = require(path.join(__dirname, "../platform/track/project/skf_track_procure.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const res = read("resources.json");
const pkgs = (res && res.rows) || [];
const nameOf = {}; pkgs.forEach(p => nameOf[p.code] = p.name);
const tradeOf = {}; pkgs.forEach(p => tradeOf[p.code] = p.trade);

// ---- what the matcher cannot read, said out loud -----------------------
// Every one of these is a scope the bill has no words for. Written here so
// somebody can argue with it, rather than buried in a regular expression.
const ALIAS = {
  FSL2026272008: { codes: ["board_close", "ceiling_gypsum"],
    why: "gypsum partitions 735 sqm and ceiling 550 sqm — two packages on one order" },
  FSL2026272076: { codes: ["door_install"], why: "metal fire doors, 3 nos — the doors package" },
  FSL2026272077: { codes: ["sanitary_fixture", "cpvc_pipe"],
    why: "internal plumbing to 16 toilets — fittings and the pipework to them" },
  FSL2026272165: { codes: ["joinery_panel"], why: "acoustic call booths, built as joinery" },
  // THE SCOPE SAYS "PA" IN SO MANY WORDS and two letters match no rule, so
  // the matcher read four of this order's five packages and dropped the fifth.
  FSL2026272161: { codes: ["fa_device", "pa_system", "rodent_system", "elv_device"],
    why: "fire alarm, PA, rodent, WLD and CCTV — four packages this engine schedules, on one order" },
  // NO STRETCH CEILING PACKAGE IS SCHEDULED. The order is real and the
  // programme has nowhere to put it — said out loud rather than forced into
  // the nearest ceiling package, which would put 377 sqft of the wrong
  // material on a gypsum crew.
  FSL2026272193: { codes: [], why: "stretch fabric ceiling, 377 sqft — the programme schedules no " +
    "stretch ceiling package, so this order sits against nothing" },
  FSL2026272194: { codes: ["raised_floor"], why: "raised access flooring" },
  // and the ones that buy no package at all
  FSL2026272058: { codes: [], why: "material shifting and transport — a preliminary" },
  FSL2026272067: { codes: [], why: "site team chairs and tables — a preliminary" },
  FSL2026272074: { codes: [], why: "security guards — a preliminary" },
  FSL2026272102: { codes: [], why: "mathadi labour — a preliminary" },
  FSL2026272121: { codes: [], why: "housekeeping for two months — a preliminary" },
  FSL2026272123: { codes: [], why: "site safety and fire consumables — a preliminary" },
};

// A PO that says it covers a whole head, and only those.
const WHOLE_HEAD = /\bcomplete\b|\bpackage\b.*\bsitc\b|\bper boq\b|\bentire\b/i;
const HEAD_TRADE = {
  A: ["civil", "joinery", "painting", "flooring", "ceiling", "drywall"],
  B: ["joinery"], C: ["electrical"], D: ["hvac"], E: ["elv"],
  F: ["plumbing"], G: ["fire"], PRE: [],
};

function codesFor(p) {
  const a = ALIAS[p.po];
  if (a) return { codes: a.codes, how: "declared", why: a.why };
  // 1. the PO's own words, through the matcher the bill already uses
  const parts = String(p.scope).split(/[,;]| and | plus /i).map(x => x.trim()).filter(x => x.length > 2);
  const hits = new Set();
  parts.forEach(x => { const m = SCOPE.match("", x, "no");
    if (m && m.code && m.by === "description") hits.add(m.code); });
  if (hits.size) return { codes: [...hits], how: "scope",
    why: "the order says " + JSON.stringify(p.scope) };
  // 2. a whole-head order, and only a whole-head order
  if (WHOLE_HEAD.test(p.scope)) {
    const trades = HEAD_TRADE[p.head] || [];
    const codes = pkgs.filter(x => trades.indexOf(x.trade) >= 0).map(x => x.code);
    if (codes.length) return { codes, how: "head",
      why: "the order covers the whole of head " + p.head + " (" +
           (PO.boqHeads.find(h => h.head === p.head) || {}).name + ")" };
  }
  return { codes: [], how: "none",
    why: "nothing in this order names a package the programme schedules" };
}

const promised = {};
(PROC.commitments || []).forEach(c => promised[c.po] = c);

// EVERY DECLARED ALIAS MUST NAME A PACKAGE THAT EXISTS. A typo here binds a
// real purchase order to nothing and quietly puts a bought package back on
// the "nobody has ordered this" list.
{
  const realCodes = new Set(pkgs.map(p => p.code));
  const bad = [];
  Object.keys(ALIAS).forEach(po => (ALIAS[po].codes || []).forEach(c => {
    if (!realCodes.has(c)) bad.push(po + " -> " + c); }));
  if (bad.length) { console.error("\n  ALIAS NAMES A PACKAGE THAT DOES NOT EXIST:\n    " +
    bad.join("\n    ") + "\n"); process.exit(2); }
}

// A CODE THE PROGRAMME DOES NOT SCHEDULE IS NOT A BINDING. "Civil works
// package, plaster and screed" names screed, and there is no screed package
// on this floor — so the order covers work nothing is tracking, which is
// worth saying rather than filing against a package that does not exist.
const scheduled = new Set(pkgs.map(x => x.code));

const orders = PO.pos.map(p => {
  const m = codesFor(p);
  const c = promised[p.po] || {};
  const unscheduled = m.codes.filter(x => !scheduled.has(x));
  m.codes = m.codes.filter(x => scheduled.has(x));
  return { po: p.po, rev: p.rev, head: p.head, vendor: p.vendor, scope: p.scope,
    unscheduled,
    value: p.value, taxable: p.taxable,
    newlyPlaced: !!p.newlyPlaced,
    // THE DATE THE VENDOR GAVE. A promised date that has passed with nothing
    // seen is a different and more urgent question than "was it ordered".
    promisedOn: c.delivery || null,
    advance: c.advance || null,
    flags: c.flags || [],
    codes: m.codes, packages: m.codes.map(c2 => nameOf[c2] || c2),
    how: m.how, why: m.why };
});

// ---- and what actually turned up ---------------------------------------
// Four GRNs, all read out of a daily report rather than off a signed note.
// None carries a quantity. One records a damaged box and no GRN raised.
const GRN_ALIAS = {
  "Plumbing material": ["sanitary_fixture", "cpvc_pipe"],
  "AAC blocks / block work material": ["blockwork"],
  "Vitrified tiles": ["tile_vitrified"],
  "HVAC ducting material": ["duct_gi"],
};
const grns = (SITE.grn || []).map(g => {
  const codes = GRN_ALIAS[g.material] || (() => {
    const m = SCOPE.match("", g.material, "no");
    return m && m.code ? [m.code] : []; })();
  return { day: g.day, material: g.material, po: g.po || null, vendor: g.vendor || null,
    codes, packages: codes.map(c => nameOf[c] || c),
    // A GRN WITH NO QUANTITY IS "IT CAME, NOBODY COUNTED IT"
    qty: null, counted: false,
    tag: g.tag, note: g.note || null, issue: g.issue || null,
    from: "read out of the daily report, not off a signed goods-received note" };
});

// ---- package -> what is on order and what has landed --------------------
const byCode = {};
orders.forEach(o => o.codes.forEach(c => {
  const b = byCode[c] = byCode[c] || { code: c, name: nameOf[c] || c, pos: [], grns: [] };
  b.pos.push({ po: o.po, vendor: o.vendor, value: o.value, how: o.how, scope: o.scope,
    promisedOn: o.promisedOn || null, advance: o.advance || null }); }));
grns.forEach(g => g.codes.forEach(c => {
  const b = byCode[c] = byCode[c] || { code: c, name: nameOf[c] || c, pos: [], grns: [] };
  b.grns.push({ day: g.day, material: g.material, issue: g.issue }); }));

// ---- committed against the internal cost, head by head -----------------
const heads = (PO.boqHeads || []).map(h => {
  const on = orders.filter(o => o.head === h.head);
  const committed = on.reduce((t, o) => t + o.value, 0);
  return { head: h.head, name: h.name, bcs: h.bcs, committed,
    pos: on.length, gap: h.bcs - committed,
    over: committed > h.bcs };
});
// PRELIMINARIES CARRY NO BOQ HEAD COST, so they have no gap to report — and
// they are already on the head list, so appending them again prints the row
// twice and doubles the committed total on any page that sums it.
heads.forEach(h => { if (h.head === "PRE") { h.gap = null; h.over = false; } });

const out = {
  builtAt: new Date().toISOString(),
  asOf: PO.asOf,
  source: "platform/track/project/skf_po.js and skf_site.js — the tracking engine's registers",
  totals: {
    pos: orders.length,
    bcs: heads.reduce((t, h) => t + (h.bcs || 0), 0),
    headsOver: heads.filter(h => h.over).length,
    committed: PO.committed, committedTaxable: PO.committedTaxable,
    placed: orders.filter(o => o.codes.length).length,
    preliminaries: orders.filter(o => o.how === "declared" && !o.codes.length).length,
    unmatched: orders.filter(o => o.how === "none").length,
    coversUnscheduled: orders.filter(o => o.unscheduled.length).length,
    byHead: orders.filter(o => o.how === "head").length,
    packagesOnOrder: Object.keys(byCode).length,
    grns: grns.length,
    promised: orders.filter(o => o.promisedOn).length,
    promisePassed: orders.filter(o => o.promisedOn && o.promisedOn < new Date().toISOString().slice(0, 10)).length,
    grnsWithIssue: grns.filter(g => g.issue).length,
  },
  heads, orders, grns, byCode,
  // WHAT THE PROCUREMENT PACK COULD NOT ANSWER, carried through rather than
  // dropped — these are questions for a person, not defects in the read.
  queries: (PROC.queries || []).map(q => ({ about: q.about, question: q.question })),
  why: "a purchase order says somebody bought it. Only a goods-received note, or the camera, " +
       "says it arrived. None of these four GRNs carries a quantity — each is read out of a " +
       "daily report, so each is 'it came, nobody counted it' and never a full delivery",
};
fs.writeFileSync(path.join(ENGINE, "po.json"), JSON.stringify(out));

// A NEGATIVE GAP IS THE WHOLE POINT OF THE COLUMN. "Rs -1665642" is not a
// number anybody reads; the sign goes in front of the unit.
const cr = (x) => { const n = Math.abs(x || 0), s = (x || 0) < 0 ? "-Rs " : "Rs ";
  return n >= 1e7 ? s + (n / 1e7).toFixed(2) + " Cr"
       : n >= 1e5 ? s + (n / 1e5).toFixed(1) + " L" : s + Math.round(n).toLocaleString("en-IN"); };
console.log("\n  THE PO REGISTER  (as on " + PO.asOf + ")");
console.log("    " + out.totals.pos + " orders, " + cr(PO.committed) + " committed");
console.log("    " + out.totals.placed + " name a package · " + out.totals.preliminaries +
  " are preliminaries and buy none · " + out.totals.unmatched + " match nothing");
console.log("    " + out.totals.packagesOnOrder + " of the programme's packages are on order");
console.log("\n    HEAD  NAME                             BCS      COMMITTED        GAP");
heads.forEach(h => console.log("    " + String(h.head).padEnd(5) + h.name.slice(0, 30).padEnd(32) +
  cr(h.bcs).padStart(9) + cr(h.committed).padStart(14) +
  (h.gap == null ? "        —" : cr(h.gap).padStart(11)) + (h.over ? "  OVER" : "")));
if (out.totals.coversUnscheduled) { console.log("\n  ORDERS THAT NAME WORK THE PROGRAMME DOES NOT SCHEDULE:");
  orders.filter(o => o.unscheduled.length).forEach(o =>
    console.log("    " + o.po + "  " + o.vendor.slice(0, 22).padEnd(24) +
      o.unscheduled.join(", ") + "   — " + o.scope)); }
if (out.totals.unmatched) { console.log("\n  ORDERS THAT NAME NO PACKAGE:");
  orders.filter(o => o.how === "none").forEach(o =>
    console.log("    " + o.po + "  " + o.vendor.slice(0, 24).padEnd(26) + o.scope)); }
console.log("\n  GOODS RECEIVED: " + grns.length);
grns.forEach(g => console.log("    " + g.day + "  " + g.material.slice(0, 34).padEnd(36) +
  (g.packages.join(", ") || "—") + (g.issue ? "   ISSUE: " + g.issue : "")));
console.log("\n→ engines/skf/po.json\n");
