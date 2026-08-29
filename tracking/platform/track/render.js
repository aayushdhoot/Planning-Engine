// ===================================================================
// DnB-OS . platform/track/render.js . THE RENDER REGISTER AND MATCH LAW
// The design side of the daily walk. An approved render is the picture a
// space is meant to become. This module holds two things and no more:
//   1. a register that ties one approved render to one pin
//   2. the match law: a green check exists only from a dated confirmation,
//      a user answer or a read, never from the engine's own opinion
//
// Rules, the same spine as the rest of the engine:
//   . a render registers against a pin in the frozen protocol, an unknown
//     pin is refused and becomes a query, never a silent new pin
//   . a render must name a file, a register row with no file is refused
//   . no render registered means no pair, the walk photo stands alone,
//     the engine never invents a render
//   . a match is recorded only from a dated confirmation, the engine
//     never sets a match itself
//   . the check is standing: the latest dated confirmation wins, so a
//     match can be set and later cleared by a newer dated answer
//   . every confirmation may append a dated fact to the ledger so the
//     trail of who confirmed what, when, stays whole
// ===================================================================

;(function (root) {

var MATCH_KEY = "dnbos-track:skf:match";

// the register, seeded by the project pack at boot and rebuilt each time,
// never persisted (the pack is the source of truth). pin -> row.
var registry = {};

// confirmations, append only, persisted so a user answer survives reload.
// { pin, day, matched, source:"user"|"read", by, ts, renderFile }
var matches = [];
var loaded = false;

function isDay(d) { return typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d); }
function nowIso() { try { return new Date().toISOString(); } catch (e) { return ""; } }

// ---- the register ---------------------------------------------------
// register one approved render against one pin. pinsReg = TRACK_PINS.
// entry = { pin, file:{ name, src, driveId? }, approvedDay?, note? }
// src is where the bytes live: a local path like
// "data/skf/renders/P20.b64" (lazy fetched by the view) or an inline
// "data:image/jpeg;base64,..." url.
function register(pinsReg, entry) {
  var reg = pinsReg || root.TRACK_PINS;
  if (!entry || entry.pin == null) return { ok: false, error: "a render register row needs a pin" };
  var p = reg && reg.pins.find(function (x) { return x.no === entry.pin; });
  if (!p) return { ok: false, error: "unknown pin " + entry.pin,
    query: { about: "render pin " + entry.pin,
      question: "An approved render was registered for pin " + entry.pin + " which is not in the frozen 81 pin protocol. The engine never invents a pin. Name the correct pin or confirm a protocol change.", blocking: false } };
  if (!entry.file || !entry.file.name || !entry.file.src)
    return { ok: false, error: "a render must name a file with a name and a source (pin " + entry.pin + ")" };
  var row = { pin: entry.pin, space: p.space,
    file: { name: entry.file.name, src: entry.file.src, driveId: entry.file.driveId || null },
    approvedDay: entry.approvedDay || null, note: entry.note || null };
  registry[entry.pin] = row;
  return { ok: true, entry: row };
}

// the file record the ledger keeps, so a render is tracked like any other
// absorbed file. The pack apply hands this to LED.addFile.
function fileRecord(row) {
  return { name: row.file.name, type: "render",
    about: "approved render for pin " + row.pin + " (" + row.space + ")",
    driveId: row.file.driveId || null, approvedDay: row.approvedDay || null };
}

function registered(pin) { return registry[pin] || null; }
function count() { return Object.keys(registry).length; }

// ---- the pair -------------------------------------------------------
// pairFor(pin) . the shape the walk view needs to decide what to draw.
// hasRender false means: no pair, the photo stands alone, never faked.
function pairFor(pin) {
  var r = registry[pin] || null;
  var m = matchFor(pin);
  return { pin: pin, hasRender: !!r, render: r, match: m || null, checked: !!(m && m.matched) };
}

// ---- the match law --------------------------------------------------
function ensureLoaded() {
  if (loaded) return; loaded = true;
  try {
    var raw = (typeof localStorage !== "undefined") ? localStorage.getItem(MATCH_KEY) : null;
    if (raw) { var d = JSON.parse(raw); matches = d.matches || []; }
  } catch (e) {}
}

function save() {
  try { if (typeof localStorage !== "undefined") localStorage.setItem(MATCH_KEY, JSON.stringify({ matches: matches })); } catch (e) {}
}

// confirmMatch . THE MATCH LAW. Records a dated confirmation, matched
// true or false, from a user answer or a read. Refuses without a
// registered render, without a valid day, or from an unknown source.
// Idempotent per (pin, day, source, verdict). If a ledger is passed a
// dated fact is appended so the trail stays whole.
function confirmMatch(conf, ledger) {
  ensureLoaded();
  if (!conf || conf.pin == null) return { ok: false, error: "a match needs a pin" };
  var row = registry[conf.pin];
  if (!row) return { ok: false, error: "no render is registered for pin " + conf.pin + ", nothing to match against" };
  if (!isDay(conf.day)) return { ok: false, error: "a match needs a day (YYYY-MM-DD), the engine never sets an undated match" };
  var source = (conf.source === "read") ? "read" : (conf.source === "user" ? "user" : null);
  if (!source) return { ok: false, error: "a match source must be user or read" };
  var matched = conf.matched !== false;   // default true
  var dup = matches.find(function (x) { return x.pin === conf.pin && x.day === conf.day && x.source === source && x.matched === matched; });
  if (dup) return { ok: true, conf: dup, already: true };
  var rec = { pin: conf.pin, day: conf.day, matched: matched, source: source,
    by: conf.by || null, ts: conf.ts || nowIso(), renderFile: row.file.name };
  matches.push(rec);
  save();
  if (ledger && typeof ledger.addFact === "function") {
    ledger.addFact({ source: source === "user" ? "user_answer" : "read",
      kind: "render_match", confidence: "medium", day: conf.day,
      text: "Pin " + conf.pin + " (" + row.space + ") " + (matched ? "matches" : "does not match") +
            " its approved render " + row.file.name + ", confirmed " + conf.day + (conf.by ? " by " + conf.by : "") });
  }
  return { ok: true, conf: rec };
}

// the standing verdict: the latest dated confirmation for a pin, or null.
function matchFor(pin) {
  ensureLoaded();
  var best = null;
  for (var i = 0; i < matches.length; i++) {
    var m = matches[i];
    if (m.pin !== pin) continue;
    if (!best || m.day > best.day || m.day === best.day) best = m;   // newest day, last answer that day wins
  }
  return best;
}

// every dated confirmation for a pin, oldest first, for the history view.
function matchesFor(pin) {
  ensureLoaded();
  return matches.filter(function (m) { return m.pin === pin; })
    .slice().sort(function (a, b) { return a.day < b.day ? -1 : (a.day > b.day ? 1 : 0); });
}

// a read may carry match assertions: [{ pin, day, matched }]. The absorb
// gate hands them here so a read can set the check, same law, same store.
function absorbMatches(list, ledger) {
  var out = { set: 0, refused: [] };
  for (var i = 0; i < (list || []).length; i++) {
    var a = list[i];
    var res = confirmMatch({ pin: a.pin, day: a.day, matched: a.matched, source: "read", by: a.by || "read" }, ledger);
    if (res.ok) out.set++; else out.refused.push({ pin: a.pin, why: res.error });
  }
  return out;
}

function reset() { registry = {}; matches = []; loaded = false; }
// clear only the confirmations (the answers), keep the registry, which is
// code seeded like the pins. Used by Reseed. Persists the empty store.
function clearMatches() { matches = []; loaded = true; save(); }
function load() { loaded = false; ensureLoaded(); }

root.TRACK_RENDER = { register: register, fileRecord: fileRecord, registered: registered, count: count,
  pairFor: pairFor, confirmMatch: confirmMatch, matchFor: matchFor, matchesFor: matchesFor,
  absorbMatches: absorbMatches, save: save, load: load, reset: reset, clearMatches: clearMatches,
  get registry() { return registry; }, get matches() { return matches; } };
if (typeof module !== "undefined") module.exports = root.TRACK_RENDER;

})(typeof window !== "undefined" ? window : globalThis);
