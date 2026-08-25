// ===================================================================
// DnB-OS . platform/track/client.js . THE CLIENT VIEW LAW
// The team proved the need twice. They hand forked an EXT workbook and a
// weekly deck for the client, and both rotted, because a fork rots the
// moment the live truth moves and nobody re types it. This law makes the
// client view a projection of the same live rows, never a copy:
//
//   . one source. The client model is built from the very same weekly
//     model the internal tabs read (TRACK_EXPORT.wprModel). It selects,
//     it never re enters. Nothing here is typed by hand.
//
//   . the strip law. Three walls stand between the live rows and the
//     client, in order:
//       1. the section allowlist. Only the sections a client may see
//          pass. Procurement, the delay ledger, the PO register, the
//          snag inbox text, the evidence ledger, the admin door and the
//          query internals never enter the client model at all.
//       2. per section shaping. Inside an allowed section, the fields
//          that carry a face or a private detail are dropped: an owner
//          becomes a plain side word, a vendor name and an internal note
//          are removed, a file id and a drive path never travel.
//       3. the deep scrub. A last pass walks the whole model and redacts
//          anything that still looks like money, a phone number, an INT
//          marker, a drive link, a fact id or a known private name. This
//          is the backstop the leak test drives.
//
//   . the date law. The client sees the client date. Where a row carries
//     both a client date and an internal date and they differ, the
//     client view shows the client date and the internal view flags the
//     gap. Two truths on one finish date is the exact disease this kills.
//     The mechanism is wired here. It fires wherever a client date is
//     recorded, and it invents nothing on its own.
//
// Pure. No DOM, no fetch, no ledger writes. The client model is a plain
// object the template paints, so the guards can drive the whole strip
// offline and prove nothing leaks.
// ===================================================================

;(function (root) {

// ---- who the client is, and the door they come through --------------
// The door law lives in TRACK_SHELL, which owns tabs and landings. This
// delegates to it and only falls back to a local check when the strip law
// is driven on its own in a test.
var CLIENT_ROLE = "client";
function isClientRole(role) {
  if (root.TRACK_SHELL && root.TRACK_SHELL.isClientRole) return root.TRACK_SHELL.isClientRole(role);
  return String(role == null ? "" : role).trim().toLowerCase() === CLIENT_ROLE;
}

// ---- the section allowlist. The first and strongest wall. -----------
// These are the only weekly sections a client ever sees, in this order.
// Everything else the engine holds (procurement, the delay ledger, the
// snag inbox, the ledger, the admin door) is simply never selected.
var CLIENT_SECTIONS = ["timeWork", "packages", "renderActual", "burnDown",
  "headcount", "asks", "compliance", "layout"];

// the dependency sides a client may see. FS internal rows never show:
// the client's world is their own asks, the builder's and the statutory
// bodies', not Flipspaces' internal compliance.
var CLIENT_DEP_SIDES = ["client", "GC", "statutory"];

// ---- the forbidden keys. The second wall. ---------------------------
// Any object key in this set is dropped wherever it appears in the model,
// at any depth. These carry a face, a price, a private handle or an
// engine internal, none of which a client view may render.
var FORBIDDEN_KEYS = {
  note: 1, notes: 1, remark: 1, remarks: 1, internalNote: 1,
  owner: 1, person: 1, by: 1, phone: 1, mobile: 1, email: 1,
  vendor: 1, vendors: 1, chargeable: 1, chargedOn: 1, rate: 1,
  value: 1, poValue: 1, amount: 1, price: 1, cost: 1,
  reason: 1, source: 1, tag: 1, tags: 1,
  driveId: 1, drive: 1, fileId: 1, fileName: 1, renderFile: 1, renderSrc: 1,
  question: 1, answer: 1, actions: 1, photo: 1, proof: 1, id: 1
};

// ---- the deep scrub patterns. The third wall. -----------------------
// A last pass redacts any survivor that still matches money, a phone
// number, an INT marker, a link, or a fact or query id. The leak test
// seeds exactly these and asserts none reach the rendered model.
var LEAK_PATTERNS = [
  { name: "rupee_amount", re: /(?:₹|Rs\.?|INR)\s?[\d,]+(?:\.\d+)?\s?(?:cr|crore|lakh|lac|L|K)?/gi },
  { name: "amount_unit", re: /\b\d+(?:\.\d+)?\s?(?:cr|crore|lakh|lac)\b/gi },
  { name: "grouped_number", re: /\b\d{1,3}(?:,\d{2,3}){2,}(?:\.\d+)?\b/g },
  { name: "phone", re: /(?:\+?91[\-\s]?)?\b\d{5}[\-\s]?\d{5}\b/g },
  { name: "phone10", re: /(?<!\d)\d{10}(?!\d)/g },
  { name: "int_marker", re: /[\[(]\s*INT\s*[\])]/g },
  { name: "int_word", re: /\bINT\b/g },
  { name: "url", re: /https?:\/\/[^\s)]+/gi },
  { name: "google_host", re: /\b[\w.-]*\b(?:drive|docs|sheets)\.google\.com[^\s)]*/gi },
  { name: "fact_id", re: /\b[FQ]-\d{3,}\b/g }
];

// ---- private names, derived from the live data, never guessed -------
// A client safe text can still carry a builder or a person name in a
// parenthetical, for example "sign off (Phoenix)". namesFrom reads the
// owners the data already carries and returns the private names to
// redact. It keeps the client's own aliases (SKF) and skips generic
// authorities (a fire department, a municipal body), because those are
// safe to name and appear in legitimate client text.
var GENERIC_OWNER = /department|authority|municipal|corporation|bmc|council|board|govt|government/i;
function looksLikeName(s) {
  return /^[A-Z][a-z]+(?:\s+[A-Z][a-z.]+)*$/.test(String(s || "").trim());
}
function namesFrom(env) {
  env = env || {};
  var aliases = (env.clientAliases || ["SKF"]).map(function (s) { return String(s).toLowerCase(); });
  var out = {};
  function consider(raw) {
    if (!raw) return;
    // "Phoenix / Alyssum" carries two, "Rajesh Pillai (SKF)" carries one
    String(raw).split("/").forEach(function (part) {
      var clean = part.replace(/\([^)]*\)/g, "").trim();
      if (!clean) return;
      if (GENERIC_OWNER.test(clean)) return;
      if (!looksLikeName(clean)) return;
      if (aliases.indexOf(clean.toLowerCase()) !== -1) return;
      out[clean] = 1;
    });
  }
  var deps = (env.depsPack && env.depsPack.deps) || [];
  for (var i = 0; i < deps.length; i++) consider(deps[i].owner);
  for (var j = 0; j < (env.extraNames || []).length; j++) out[env.extraNames[j]] = 1;
  return Object.keys(out);
}

// redact the private names out of one string, then tidy the empty
// parentheses and doubled spaces a removal leaves behind.
function redactNames(str, names) {
  var s = String(str);
  for (var i = 0; i < (names || []).length; i++) {
    var n = names[i];
    if (!n) continue;
    var re = new RegExp(n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    s = s.replace(re, "");
  }
  return s;
}
function tidy(s) {
  return String(s)
    .replace(/\(\s*[,/]?\s*\)/g, "")   // "()" or "( / )" left by a removal
    .replace(/\[\s*\]/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:])/g, "$1")
    .replace(/[,/]\s*\)/g, ")")
    .trim();
}

// scrub one string: redact the patterns, redact the names, then tidy.
function scrubString(s, names) {
  var out = String(s);
  for (var i = 0; i < LEAK_PATTERNS.length; i++) out = out.replace(LEAK_PATTERNS[i].re, "");
  out = redactNames(out, names);
  return tidy(out);
}

// the deep scrub. Walk the value, drop forbidden keys, scrub every
// surviving string. Arrays keep their entries (order matters for a
// report). Objects lose the forbidden keys entirely.
function scrub(value, names) {
  if (value == null) return value;
  if (typeof value === "string") return scrubString(value, names);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map(function (v) { return scrub(v, names); });
  if (typeof value === "object") {
    var out = {};
    for (var k in value) {
      if (!Object.prototype.hasOwnProperty.call(value, k)) continue;
      if (FORBIDDEN_KEYS[k]) continue;          // the whole field never travels
      out[k] = scrub(value[k], names);
    }
    return out;
  }
  return value;
}

// a scan the guards and the runtime self check use: does any leak
// pattern or private name survive in this object? Returns the hits.
function leakScan(value, names) {
  var text = JSON.stringify(value == null ? "" : value);
  var hits = [];
  for (var i = 0; i < LEAK_PATTERNS.length; i++) {
    var m = text.match(LEAK_PATTERNS[i].re);
    if (m) hits.push({ pattern: LEAK_PATTERNS[i].name, sample: m[0] });
  }
  for (var j = 0; j < (names || []).length; j++) {
    if (names[j] && new RegExp(names[j].replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(text))
      hits.push({ pattern: "private_name", sample: names[j] });
  }
  return hits;
}

// ---- the date law ---------------------------------------------------
// A row may carry a client date and an internal date. The client always
// sees the client date. The internal side flags the gap when the two
// differ. With only one date on a row the law returns that date and no
// gap, so a row that has never had two truths reads cleanly.
var DAY = 86400000;
function parseDay(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function daysBetween(a, b) { var x = parseDay(a), y = parseDay(b); return (x && y) ? Math.round((y - x) / DAY) : null; }
function dateLaw(row) {
  row = row || {};
  var client = row.clientDate != null ? row.clientDate : (row.plan != null ? row.plan : (row.date != null ? row.date : null));
  var internal = row.internalDate != null ? row.internalDate : null;
  var differ = !!(client && internal && client !== internal);
  return { client: client, internal: internal || client, differ: differ,
    gap: differ ? daysBetween(client, internal) : 0 };
}
// what the client sees on a row, and the flag the internal view carries.
function clientShow(row) { return dateLaw(row).client; }
function internalFlag(row) {
  var d = dateLaw(row);
  if (!d.differ) return null;
  var ahead = d.gap < 0;
  return "internal target " + d.internal + ", " + Math.abs(d.gap) + " days "
    + (ahead ? "before" : "after") + " the client date";
}
// apply the date law to a row in place, setting the shown date to the
// client date. Pure per row, returns a fresh row.
function applyDateLaw(row) {
  if (!row) return row;
  var out = {}; for (var k in row) if (Object.prototype.hasOwnProperty.call(row, k)) out[k] = row[k];
  var shown = clientShow(row);
  if (shown != null) { if (out.plan !== undefined) out.plan = shown; if (out.date !== undefined) out.date = shown; }
  delete out.internalDate; delete out.clientDate;
  return out;
}

// ===================================================================
// THE CLIENT MODEL
// ===================================================================
// Take the internal weekly model and return the curated client model.
// wpr is TRACK_EXPORT.wprModel(env). opts carries the project name, the
// client name, the run day and the private names to redact.
function clientModel(wpr, opts) {
  opts = opts || {};
  var names = opts.names || [];
  var allowed = {};
  for (var i = 0; i < CLIENT_SECTIONS.length; i++) allowed[CLIENT_SECTIONS[i]] = i;

  // wall 1: only the allowed sections, kept in the client order
  var picked = (wpr.sections || []).filter(function (s) { return allowed[s.key] != null; });
  picked.sort(function (a, b) { return allowed[a.key] - allowed[b.key]; });

  // wall 2: per section shaping, before the deep scrub
  var sections = picked.map(function (s) {
    if (s.empty) return { key: s.key, title: s.title, empty: true, line: s.line, data: null };
    var d = s.data;
    if (s.key === "asks") return shapeAsks(s, d);
    if (s.key === "compliance") return shapeCompliance(s, d);
    if (s.key === "headcount") return shapeHeadcount(s, d);
    if (s.key === "packages") return shapePackages(s, d);
    if (s.key === "renderActual") return shapeRender(s, d);
    if (s.key === "layout") return shapeLayout(s, d);
    // timeWork and burnDown carry only numbers and generated lines
    return { key: s.key, title: s.title, empty: false, data: d };
  });

  // wall 3: the deep scrub over the whole set
  sections = scrub(sections, names);

  var meta = scrub({
    project: (wpr.meta && wpr.meta.project) || opts.project || "Project",
    client: opts.client || null,
    mode: opts.mode || "live",
    issued: opts.runDay || (wpr.meta && wpr.meta.issued) || null,
    asOf: opts.asOf || (wpr.meta && wpr.meta.reading) || null,
    week: (wpr.meta && wpr.meta.week) || null,
    day: wpr.meta ? wpr.meta.day : null,
    days: wpr.meta ? wpr.meta.days : null,
    reading: wpr.meta ? wpr.meta.reading : null,
    pmNote: (wpr.meta && wpr.meta.pmNote) || null
  }, names);

  return { kind: "CLIENT", meta: meta, sections: sections };
}

// ---- the section shapers. Each returns a minimal client object. -----
function shapeAsks(s, d) {
  var keep = function (a) { return CLIENT_DEP_SIDES.indexOf(a.side) !== -1; };
  var openRows = (d.open || []).filter(keep).map(function (a) {
    var r = applyDateLaw(a);
    return { ask: r.ask, side: r.side, plan: r.plan, aging: r.aging, late: r.late, blocking: r.blocking };
  });
  var doneRows = (d.done || []).filter(keep).map(function (a) {
    var r = applyDateLaw(a);
    return { ask: r.ask, side: r.side, actual: r.actual };
  });
  var empty = !(openRows.length || doneRows.length);
  if (empty) return { key: s.key, title: s.title, empty: true,
    line: "No standing ask sits on the client, the builder or a statutory body this week.", data: null };
  var overdue = openRows.filter(function (r) { return r.late; }).length;
  return { key: s.key, title: s.title, empty: false,
    data: { open: openRows, done: doneRows, openN: openRows.length, doneN: doneRows.length, overdueN: overdue } };
}

function shapeCompliance(s, d) {
  var items = (d.items || []).map(function (it) {
    var r = applyDateLaw(it);
    return { text: r.text, done: r.done, doneOn: r.doneOn };
  });
  return { key: s.key, title: s.title, empty: false,
    data: { items: items, done: items.filter(function (i) { return i.done; }).length, total: items.length } };
}

function shapeHeadcount(s, d) {
  var groups = (d.groups || []).map(function (g) {
    return { label: g.label, rooms: (g.rooms || []).map(function (r) {
      return { name: r.name, unit: r.unit, required: r.required, achieved: r.achieved,
        deliveredPct: r.deliveredPct, state: r.state }; }) };
  });
  return { key: s.key, title: s.title, empty: false,
    data: { groups: groups, total: d.total, requiredKnown: d.requiredKnown, counted: d.counted, awaiting: d.awaiting } };
}

function shapePackages(s, d) {
  var groups = (d.groups || []).map(function (g) {
    return { label: g.label, planMean: g.planMean, siteMean: g.siteMean,
      rows: (g.rows || []).map(function (r) { return { name: r.name, plan: r.plan, site: r.site, chip: r.chip }; }) };
  });
  return { key: s.key, title: s.title, empty: false, data: { groups: groups } };
}

// render vs actual keeps the pin (a plumbing number the painter uses for
// the photo slot and the plan snippet) and the space and date. It drops
// the file id, the file name and the drive path. The painter fetches the
// photo by pin from the live walk, so no private handle rides the model.
function shapeRender(s, d) {
  var areas = (d.areas || []).map(function (a) {
    return { pin: a.pin, space: a.space, captureDay: a.captureDay, stale: a.stale,
      hasRender: a.hasRender, checked: a.checked, matchDay: a.matchDay };
  });
  return { key: s.key, title: s.title, empty: false,
    data: { areas: areas, shown: d.shown, total: d.total, more: d.more,
      renderCount: d.renderCount, fresh: d.fresh, week: d.week } };
}

function shapeLayout(s, d) {
  var revisions = (d.revisions || []).map(function (r) { return { day: r.day, label: r.label || null }; });
  return { key: s.key, title: s.title, empty: false, data: { revisions: revisions } };
}

root.TRACK_CLIENT = {
  CLIENT_ROLE: CLIENT_ROLE, isClientRole: isClientRole,
  CLIENT_SECTIONS: CLIENT_SECTIONS, CLIENT_DEP_SIDES: CLIENT_DEP_SIDES,
  FORBIDDEN_KEYS: FORBIDDEN_KEYS, LEAK_PATTERNS: LEAK_PATTERNS,
  namesFrom: namesFrom, redactNames: redactNames, scrub: scrub, scrubString: scrubString,
  leakScan: leakScan,
  dateLaw: dateLaw, clientShow: clientShow, internalFlag: internalFlag, applyDateLaw: applyDateLaw,
  clientModel: clientModel
};
if (typeof module !== "undefined") module.exports = root.TRACK_CLIENT;

})(typeof window !== "undefined" ? window : globalThis);
