// ===================================================================
// DnB-OS . platform/track/layout.js . WHAT THE DRAWINGS SPECIFY AT A PIN
//
// The engine had two pictures of a pin: the render, which is design
// intent, and the photo, which is what is built. Both are pictures, so
// "is the sprinkler work done here" came down to a judgement about a
// judgement. A layout sheet is different. It is a countable instruction:
// nine upright heads, this pipe size, this height. Measured against a
// count, a read stops being an opinion.
//
// This law holds what a layout sheet says inside one pin's field of
// view, and it insists the reader can check every number:
//   . a scope entry carries the sheet it came from, its revision, and
//     how the pin was placed on that sheet. A count with no sheet behind
//     it is not a count, it is a rumour.
//   . registration quality travels with the scope. A fit good to 1.3 m
//     can say "nine heads in this room". It cannot say which side of a
//     partition one of them sits on, and fitWord says so.
//   . a sheet marked for approval is not a sheet to build from. status
//     carries that through to the reader instead of quietly dropping it.
//   . absent is not zero. A pin nobody has read a layout for returns
//     null, never an empty scope that reads as "nothing specified here".
//   . pure. Packs in, sentences out, no clock, no fetch.
// ===================================================================

;(function (root) {

// A sheet the team may not build from yet. The words are the drawing's
// own, so nobody has to remember which stamp means what.
const HOLD = ["for approval", "for review", "preliminary", "not for construction"];

function sheetOnHold(sheet) {
  if (!sheet || !sheet.status) return false;
  const s = String(sheet.status).toLowerCase();
  return HOLD.some(h => s.indexOf(h) !== -1);
}

// How much the placement can be trusted, in the reader's words. Driven by
// the worst inlier residual of the fit, in metres, because that is the
// number that decides whether a head can be put in the right room.
function fitWord(reg) {
  if (!reg || reg.worstM === null || reg.worstM === undefined) return "not measured";
  const m = Number(reg.worstM);
  if (!isFinite(m)) return "not measured";
  if (m <= 0.5) return "tight, good to half a metre";
  if (m <= 1.5) return "good to about " + (Math.round(m * 10) / 10) + " m";
  if (m <= 3.0) return "loose, about " + (Math.round(m * 10) / 10) + " m";
  return "too loose to place items in rooms";
}

// True when the fit is tight enough to say which room an item is in.
// A 3 m error is wider than most of the cabins on this floor.
function placesInRooms(reg) {
  if (!reg || reg.worstM === null || reg.worstM === undefined) return false;
  const m = Number(reg.worstM);
  return isFinite(m) && m <= 1.5;
}

// ---- the scope at one pin, from one discipline -------------------------
// Returns null when no layout has been read for that pin, which is the
// honest answer for 80 of the 81 pins today.
function at(pack, pin, discipline) {
  if (!pack || !pack.scopes) return null;
  const hit = pack.scopes.filter(s =>
    Number(s.pin) === Number(pin) &&
    (!discipline || s.discipline === discipline));
  if (!hit.length) return null;
  return hit.length === 1 ? hit[0] : hit;
}

function disciplinesAt(pack, pin) {
  if (!pack || !pack.scopes) return [];
  return pack.scopes.filter(s => Number(s.pin) === Number(pin)).map(s => s.discipline);
}

function sheetFor(pack, scope) {
  if (!pack || !pack.sheets || !scope) return null;
  return pack.sheets.filter(s => s.id === scope.sheet)[0] || null;
}

// ---- the countable line: what the photo has to be measured against ----
// This is the sentence that changes a read. Instead of "sprinklers
// ongoing" the reader gets "nine upright heads and one side wall head",
// and can answer with a number.
function countLine(scope) {
  if (!scope || !scope.items || !scope.items.length) return null;
  const parts = scope.items
    .filter(i => i.count !== null && i.count !== undefined)
    .map(i => i.count + " " + (i.count === 1 ? i.one : i.many));
  if (!parts.length) return null;
  if (parts.length === 1) return parts[0];
  return parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1];
}

// The nearest item, because that is the one the camera sees best and the
// one a supervisor can check without walking.
function nearest(scope) {
  if (!scope || !scope.items) return null;
  let best = null;
  scope.items.forEach(i => (i.at || []).forEach(a => {
    if (a.m === null || a.m === undefined) return;
    if (!best || a.m < best.m) best = { m: a.m, what: i.one };
  }));
  return best;
}

// ---- what the read should now answer ----------------------------------
// Every question is a number the walk can return, not a feeling. A pin
// with a scope gets asked these; a pin without one keeps the old prompt.
function questions(scope) {
  if (!scope || !scope.items) return [];
  const qs = [];
  scope.items.forEach(i => {
    if (i.count === null || i.count === undefined) return;
    qs.push("Of the " + i.count + " " + (i.count === 1 ? i.one : i.many) + " specified here, how many are in place?");
  });
  (scope.runs || []).forEach(r => {
    qs.push("Is the " + r.label + " run" + (r.bop ? " at " + r.bop + " mm" : "") + " present, and is it hung or loose?");
  });
  return qs;
}

// ---- the brief a person reads -----------------------------------------
// Short lines, in the order a supervisor needs them: where the pin is,
// what the sheet says is there, what to count, and what the sheet does
// not settle. The last part is the point. A brief that hides its gaps is
// worse than no brief, because it gets believed.
function brief(pack, pin, discipline) {
  const scope = at(pack, pin, discipline);
  if (!scope || Array.isArray(scope)) return null;
  const sheet = sheetFor(pack, scope);
  const reg = scope.reg || (sheet && sheet.reg) || null;
  const rows = [];
  rows.push({ k: "Pin", v: "Pin " + scope.pin + ", " + scope.space });
  rows.push({ k: "Looking", v: scope.view || "not captured" });
  rows.push({ k: "Sheet", v: sheet ? (sheet.name + (sheet.rev ? ", " + sheet.rev : "")) : "not captured" });
  rows.push({ k: "Placed", v: fitWord(reg) });
  const cl = countLine(scope);
  if (cl) rows.push({ k: "In view", v: cl });
  (scope.runs || []).forEach(r =>
    rows.push({ k: "Feed", v: r.label + (r.bop ? ", bottom of pipe " + r.bop + " mm" : "") }));
  if (scope.grid) rows.push({ k: "Spacing", v: scope.grid });
  const n = nearest(scope);
  if (n) rows.push({ k: "Nearest", v: n.what + " about " + (Math.round(n.m * 10) / 10) + " m away" });
  return {
    pin: scope.pin, space: scope.space, discipline: scope.discipline,
    rows: rows,
    questions: questions(scope),
    gaps: gaps(pack, scope, sheet, reg),
    onHold: sheetOnHold(sheet),
    canPlace: placesInRooms(reg)
  };
}

// ---- what the sheet does not settle ------------------------------------
// Named out loud, on the brief, so a reader never has to guess whether
// silence means "nothing there" or "nobody looked".
function gaps(pack, scope, sheet, reg) {
  const out = [];
  if (sheetOnHold(sheet))
    out.push("This sheet is stamped " + sheet.status + ". Treat the counts as the current design, not an instruction to build.");
  if (!placesInRooms(reg))
    out.push("The pin is placed on the sheet to " + fitWord(reg) + ", so an item near a partition may belong to the room next door.");
  if (scope.sheetSplit)
    out.push("The layout runs across more than one sheet. This brief covers " + scope.sheetSplit + ".");
  (scope.gaps || []).forEach(g => out.push(g));
  return out;
}

// ---- roll up: how much of the floor has a layout read at all ----------
function coverage(pack, pinsReg) {
  const total = (pinsReg && pinsReg.pins) ? pinsReg.pins.length : null;
  if (!pack || !pack.scopes) return { read: 0, total: total, pct: total ? 0 : null };
  const pins = {};
  pack.scopes.forEach(s => { pins[Number(s.pin)] = 1; });
  const read = Object.keys(pins).length;
  return { read: read, total: total,
           pct: total ? Math.round(read / total * 100) : null,
           discipline: (pack.sheets || []).map(s => s.discipline)
             .filter((v, i, a) => a.indexOf(v) === i) };
}

root.TRACK_LAYOUT = { at, brief, countLine, questions, gaps, nearest, coverage,
                      fitWord, placesInRooms, sheetOnHold, sheetFor, disciplinesAt, HOLD };
if (typeof module !== "undefined") module.exports = root.TRACK_LAYOUT;

})(typeof window !== "undefined" ? window : globalThis);
