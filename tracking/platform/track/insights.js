// ===================================================================
// DnB-OS . platform/track/insights.js . WHAT THE READS ADD UP TO
//
// The reports carried hand written cards. They were true the week someone
// wrote them and stale every week after, which is why a report dated 28
// Jul still warned about a 21 Jul crane slot. This law writes those cards
// from the reads instead, so a report says what the site said.
//
// The laws:
//   . every sentence is built from rows the caller can point at. No card
//     exists without the numbers behind it.
//   . a card that has no data is not written. Silence beats filler, and
//     the readiness law names the missing input on the cover.
//   . nothing is shaded. The same rows produce the client card and the
//     internal card: what differs is which cards are asked for and in what
//     order, never the numbers inside them.
//   . a fall is reported as a fall. If a trade reads lower than it did,
//     the card says so and calls it a read to check, not progress.
//   . pure. Rows in, sentences out, no clock, no storage.
// ===================================================================

;(function (root) {

function pctWord(n) { return (n > 0 ? "up " : n < 0 ? "down " : "level, ") + (n ? Math.abs(n) + " points" : ""); }
function list(xs, n) {
  const a = xs.slice(0, n || 3);
  if (!a.length) return "";
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
}

// ---- the headline: where the floor stands and whether it is moving ----
function headline(prog, readings, day, pinsReg) {
  const o = prog.overall(readings, day, pinsReg);
  if (o.pct === null) return null;
  const mv = prog.movement(readings, day, pinsReg);
  const d = mv.overall && mv.overall.delta;
  const body = mv.prevDay
    ? "The floor reads " + o.pct + " percent against the approved views, " +
      (d === null ? "with no comparable earlier read" : pctWord(d) + " since " + mv.prevDay) +
      ". Read across " + o.pinsRead + " of " + o.pinsTotal + " pins."
    : "The floor reads " + o.pct + " percent against the approved views, from " +
      o.pinsRead + " of " + o.pinsTotal + " pins. This is the first read, so there is nothing to compare it with yet.";
  return { head: "Where the floor stands", body: body, kind: "headline" };
}

// ---- what moved, and what did not --------------------------------------
function movers(prog, readings, day, pinsReg) {
  const mv = prog.movement(readings, day, pinsReg);
  if (!mv.prevDay) return null;
  const up = (mv.packages || []).filter(p => p.delta != null && p.delta > 0);
  const flat = (mv.packages || []).filter(p => p.delta === 0);
  if (!up.length && !flat.length) return null;
  const parts = [];
  if (up.length) parts.push(list(up.map(p => p.pkg + " " + p.pct + " percent, up " + p.delta)) + ".");
  if (flat.length) parts.push(list(flat.map(p => p.pkg)) + " did not move at all since " + mv.prevDay + ".");
  return { head: "What moved on the floor", body: parts.join(" "), kind: "movers" };
}

// ---- the trades that are not moving, for an internal push ---------------
function stalled(prog, readings, day, pinsReg) {
  const mv = prog.movement(readings, day, pinsReg);
  if (!mv.prevDay) return null;
  const stuck = (mv.packages || []).filter(p => p.delta != null && p.delta <= 0);
  if (!stuck.length) return null;
  const worst = stuck.slice().sort((a, b) => a.delta - b.delta);
  const body = list(worst.map(p =>
    p.pkg + " at " + p.pct + " percent" + (p.delta < 0 ? ", reading " + Math.abs(p.delta) + " lower than " + mv.prevDay : ", unchanged"))) +
    ". " + (mv.gapDays ? mv.gapDays + " days have passed since that read." : "") +
    " A trade that does not move between two walks is either not manned or is waiting on something.";
  return { head: "Not moving, and why that matters", body: body.trim(), kind: "stalled" };
}

// ---- a fall is a read to check, never quiet -----------------------------
function regressions(prog, readings, day, pinsReg) {
  const mv = prog.movement(readings, day, pinsReg);
  const back = (mv.packages || []).filter(p => p.regression);
  if (!back.length) return null;
  return { head: "Reads to check", kind: "regression",
    body: list(back.map(p => p.pkg + ", " + p.was + " to " + p.pct)) +
      ". Work does not go backwards, so one of the two reads is wrong or the camera moved. Worth a look before this goes out." };
}

// ---- the rooms a client cares about, most complete first ---------------
function rooms(prog, readings, day, pinsReg, n) {
  const sp = prog.bySpace(readings, day, pinsReg);
  if (!sp.length) return null;
  const top = sp.slice().sort((a, b) => b.pct - a.pct).slice(0, n || 4);
  return { head: "Furthest along", kind: "rooms",
    body: list(top.map(s => s.space + " at " + s.pct + " percent"), n || 4) + "." };
}

// ---- the rooms with the most left to do --------------------------------
function behindRooms(prog, readings, day, pinsReg, n) {
  const sp = prog.bySpace(readings, day, pinsReg);
  if (!sp.length) return null;
  const low = sp.slice().sort((a, b) => a.pct - b.pct).slice(0, n || 4);
  return { head: "Most left to do", kind: "behind",
    body: list(low.map(s => s.space + " at " + s.pct + " percent"), n || 4) + "." };
}

// ---- the run rate, and whether it is enough ----------------------------
// Only ever from two real reads. It says points per day, not a date, because
// a date from two points would be a forecast dressed as a measurement.
function rate(prog, readings, day, pinsReg) {
  const mv = prog.movement(readings, day, pinsReg);
  if (!mv.prevDay || !mv.gapDays || !mv.overall || mv.overall.delta == null) return null;
  const perDay = mv.overall.delta / mv.gapDays;
  const left = 100 - (mv.overall.pct || 0);
  const body = "The floor moved " + mv.overall.delta + " points in " + mv.gapDays +
    " days, about " + (Math.round(perDay * 10) / 10) + " points a day. " +
    (perDay > 0
      ? "At that rate the remaining " + left + " points take about " + Math.ceil(left / perDay) + " more days of the same pace."
      : "At that rate nothing closes, so the pace has to change.") +
    " This is a run rate from two reads, not a forecast.";
  return { head: "The rate the floor is moving", body: body, kind: "rate" };
}

// ---- the sets a report asks for ---------------------------------------
// The same builders, ordered for the audience. A client report leads with
// where the floor is and what moved. An internal one leads with what did
// not move, because that is the meeting.
function build(prog, readings, day, pinsReg, mode) {
  const all = [];
  const push = c => { if (c && c.body) all.push(c); };
  if (mode === "internal") {
    push(stalled(prog, readings, day, pinsReg));
    push(regressions(prog, readings, day, pinsReg));
    push(headline(prog, readings, day, pinsReg));
    push(behindRooms(prog, readings, day, pinsReg));
    push(movers(prog, readings, day, pinsReg));
    push(rate(prog, readings, day, pinsReg));
  } else {
    push(headline(prog, readings, day, pinsReg));
    push(movers(prog, readings, day, pinsReg));
    push(rooms(prog, readings, day, pinsReg));
    push(rate(prog, readings, day, pinsReg));
    push(stalled(prog, readings, day, pinsReg));
  }
  return all;
}

root.TRACK_INSIGHTS = { build, headline, movers, stalled, regressions, rooms, behindRooms, rate, list, pctWord };
if (typeof module !== "undefined") module.exports = root.TRACK_INSIGHTS;

})(typeof window !== "undefined" ? window : globalThis);
