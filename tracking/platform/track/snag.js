// ===================================================================
// DnB-OS . platform/track/snag.js . THE OWNER AND SNAG LAW
// Two things the site sheets did that the engine did not:
//
//   . every open point has a face and a date. An owner (a side: FS,
//     client or GC, and optionally a person), the day it was raised,
//     and the day it is due. Age is computed from the raised date and
//     is never typed by anyone.
//
//   . a defect is not closed because somebody says it is. A snag is a
//     query with a photo and a pin. It moves open -> wip -> closed,
//     and THE CLOSING LAW is absolute: no proof photo, no closure.
//     There is no override, no force flag and no admin bypass.
//
// Every move appends a dated fact to the ledger, so the append only
// trail stays whole even though the query row itself carries state.
//
// Clocks: human dates (raised, due, overdue, the burn down weeks) run
// on the real calendar, because a promise ages in real time. Evidence
// and the status law keep the pack clock and are not touched here.
// ===================================================================

;(function (root) {

const DAY = 86400000;
const SIDES = ["FS", "client", "GC"];
const STATES = ["open", "wip", "closed"];

// ---- dates, built from parts so no timezone can shift a day ----
function parseDay(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ""));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function fmtDay(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function todayReal() { return fmtDay(new Date()); }
function addDays(s, n) { const d = parseDay(s); if (!d) return null; d.setDate(d.getDate() + n); return fmtDay(d); }
function daysBetween(a, b) { const x = parseDay(a), y = parseDay(b); return (x && y) ? Math.round((y - x) / DAY) : null; }
function weekStart(s) { const d = parseDay(s); if (!d) return null; d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return fmtDay(d); }

// ---- owners ----
function normOwner(o) {
  if (!o) return null;
  if (typeof o === "string") {
    const bits = o.split(":");
    const side = SIDES.find(s => s.toLowerCase() === String(bits[0] || "").trim().toLowerCase());
    if (!side) return null;
    const person = (bits[1] || "").trim();
    return { side, person: person || null };
  }
  const side = SIDES.find(s => s.toLowerCase() === String(o.side || "").trim().toLowerCase());
  if (!side) return null;
  const person = String(o.person || "").trim();
  return { side, person: person || null };
}
function ownerKey(o) { const n = normOwner(o); return n ? (n.person ? n.side + ":" + n.person : n.side) : ""; }
function ownerLabel(o) { const n = normOwner(o); return n ? (n.person ? n.side + " · " + n.person : n.side) : "unassigned"; }
// a picked user matches their exact key, and a picked side matches everyone on that side
function isMine(q, me) {
  if (!me) return false;
  const k = ownerKey(q && q.owner);
  if (!k) return false;
  if (k === me) return true;
  const n = normOwner(q && q.owner);
  return !!n && n.side === me;
}
// every owner the rows actually carry. The roster builds itself from
// the work, so nobody has to be invented up front.
function roster(queries) {
  const seen = {}, out = [];
  for (const s of SIDES) { seen[s] = 1; out.push({ key: s, label: s, side: s, person: null }); }
  for (const q of (queries || [])) {
    const n = normOwner(q && q.owner);
    if (!n || !n.person) continue;
    const k = ownerKey(n);
    if (seen[k]) continue;
    seen[k] = 1; out.push({ key: k, label: ownerLabel(n), side: n.side, person: n.person });
  }
  return out;
}

// ---- query reading ----
function isSnag(q) { return !!q && q.kind === "snag"; }
function isObservation(q) { return !!q && q.kind === "observation"; }
function raisedOf(q) { return (q && q.raised) || (q && q.ts ? String(q.ts).slice(0, 10) : null); }
function isClosed(q) { return !!q && (q.snagState === "closed" || q.status !== "open"); }
function ageDays(q, today) { const r = raisedOf(q); const d = daysBetween(r, today || todayReal()); return d == null ? 0 : Math.max(0, d); }
function overdueBy(q, today) {
  if (!q || !q.due || isClosed(q)) return 0;
  const d = daysBetween(q.due, today || todayReal());
  return d != null && d > 0 ? d : 0;
}
function isOverdue(q, today) { return overdueBy(q, today) > 0; }
function dueState(q, today) {
  if (isClosed(q)) return "closed";
  if (!q || !q.due) return "none";
  return overdueBy(q, today) > 0 ? "overdue" : "due";
}
function snagState(q) { return isSnag(q) ? (q.snagState || "open") : null; }

// ---- the inbox order ----
// When a user is picked their items come first. Inside every block the
// most overdue comes first, then the oldest.
function sortInbox(queries, me, today) {
  const t = today || todayReal();
  return (queries || []).slice().sort((a, b) => {
    if (me) {
      const am = isMine(a, me) ? 0 : 1, bm = isMine(b, me) ? 0 : 1;
      if (am !== bm) return am - bm;
    }
    const ao = overdueBy(a, t), bo = overdueBy(b, t);
    if (ao !== bo) return bo - ao;
    const ag = ageDays(a, t), bg = ageDays(b, t);
    if (ag !== bg) return bg - ag;
    return String(a.id) < String(b.id) ? -1 : 1;
  });
}

// ---- raising ----
function raiseSnag(LED, s) {
  s = s || {};
  if (!s.photo || !s.photo.photoId)
    return { ok: false, error: "A snag is a query with a photo. Attach the photo that shows the defect." };
  if (s.pin == null || s.pin === "" || isNaN(Number(s.pin)))
    return { ok: false, error: "A snag needs the pin where it was seen, so anyone can find it again." };
  if (!s.question || !String(s.question).trim())
    return { ok: false, error: "A snag needs a description of the defect." };
  const raised = s.raised || todayReal();
  const owner = normOwner(s.owner) || { side: "FS", person: null };
  const q = LED.addQuery({
    about: s.about || ("snag pin " + s.pin),
    question: String(s.question).trim(),
    blocking: !!s.blocking,
    kind: "snag", owner, raised,
    due: s.due || addDays(raised, 7),
    pin: Number(s.pin), photo: s.photo, proof: null,
    snagState: "open", wipOn: null, closedOn: null, actions: []
  });
  LED.addFact({ day: raised, source: "user_answer", kind: "snag_raised", confidence: "high",
    text: "Snag " + q.id + " raised at pin " + q.pin + ", owner " + ownerLabel(owner)
      + ", due " + q.due + ": " + q.question });
  return { ok: true, query: q };
}

// ---- the chain ----
// THE CLOSING LAW lives here and nowhere else.
function setState(LED, q, next, opts) {
  opts = opts || {};
  if (!isSnag(q)) return { ok: false, error: "only a snag moves through the snag chain" };
  if (STATES.indexOf(next) === -1) return { ok: false, error: "a snag state must be one of " + STATES.join(", ") };
  const day = opts.day || todayReal();
  const was = snagState(q);

  if (next === "closed") {
    const proof = opts.proof || q.proof || null;
    if (!proof || !proof.photoId) {
      return { ok: false, error: "A snag never closes without a closure photo. Attach the proof photo first." };
    }
    q.proof = proof;
    q.closedOn = day;
    q.snagState = "closed";
    q.status = "answered";
    q.answer = String(opts.note || "").trim() || ("Closed with proof photo " + (proof.name || proof.photoId));
    q.answeredTs = new Date().toISOString();
  } else if (next === "wip") {
    q.snagState = "wip";
    q.wipOn = q.wipOn || day;
    q.closedOn = null;
    q.status = "open";
  } else {
    q.snagState = "open";
    q.wipOn = null;
    q.closedOn = null;
    q.status = "open";
  }

  LED.addFact({ day, source: "user_answer", kind: "snag_move", confidence: "high",
    text: "Snag " + q.id + " (" + q.about + ") moved " + was + " to " + next
      + (next === "closed" ? " with proof photo " + (q.proof.name || q.proof.photoId) : "") });
  return { ok: true, query: q };
}

function logAction(LED, q, text, by, day) {
  if (!q) return { ok: false, error: "no such open point" };
  if (!text || !String(text).trim()) return { ok: false, error: "an action needs words" };
  const d = day || todayReal();
  q.actions = q.actions || [];
  q.actions.push({ day: d, text: String(text).trim(), by: by || null });
  LED.addFact({ day: d, source: "user_answer", kind: "snag_action", confidence: "high",
    text: "Action logged on " + q.id + " (" + q.about + "): " + String(text).trim() });
  return { ok: true, query: q };
}

function setOwner(LED, q, owner, due) {
  const n = normOwner(owner);
  if (!n) return { ok: false, error: "an owner must be one of " + SIDES.join(", ") + ", with an optional person" };
  q.owner = n;
  if (due) q.due = due;
  if (!q.raised) q.raised = raisedOf(q) || todayReal();
  LED.addFact({ day: todayReal(), source: "user_answer", kind: "owner_set", confidence: "high",
    text: "Open point " + q.id + " (" + q.about + ") owned by " + ownerLabel(n)
      + (q.due ? ", due " + q.due : ", no due date") });
  return { ok: true, query: q };
}

// ---- the burn down ----
// A weekly series computed from the rows and from nothing else. Every
// number here is a count of query rows at that week's cut off, so it
// cannot be typed, cannot drift, and moves the moment a snag moves.
function burnDown(queries, today) {
  const t = today || todayReal();
  const snags = (queries || []).filter(isSnag);
  if (!snags.length) return { weeks: [], total: 0, asOf: t };

  let first = null;
  for (const q of snags) {
    const r = raisedOf(q);
    if (r && (!first || r < first)) first = r;
  }
  if (!first) return { weeks: [], total: snags.length, asOf: t };

  const weeks = [];
  const lastWs = weekStart(t);
  let ws = weekStart(first), guard = 0;
  while (ws && ws <= lastWs && guard++ < 520) {
    const we = addDays(ws, 6);
    const cut = we > t ? t : we;   // the running week is cut at today
    let open = 0, wip = 0, closed = 0, raisedThis = 0, closedThis = 0;
    for (const q of snags) {
      const r = raisedOf(q);
      if (!r || r > cut) continue;
      if (r >= ws) raisedThis++;
      const c = q.closedOn || null, w = q.wipOn || null;
      if (c && c <= cut) { closed++; if (c >= ws) closedThis++; }
      else if (w && w <= cut) wip++;
      else open++;
    }
    const total = open + wip + closed;
    const pct = n => total ? Math.round(100 * n / total) : 0;
    weeks.push({ start: ws, end: we, cut, total, open, wip, closed,
      pctOpen: pct(open), pctWip: pct(wip), pctClosed: pct(closed),
      raisedThis, closedThis });
    ws = addDays(ws, 7);
  }
  return { weeks, total: snags.length, asOf: t };
}

// headline counts for the tab, same rows as the burn down
function summary(queries, today) {
  const t = today || todayReal();
  const snags = (queries || []).filter(isSnag);
  const by = { open: 0, wip: 0, closed: 0 };
  let overdue = 0;
  for (const q of snags) {
    by[snagState(q)] = (by[snagState(q)] || 0) + 1;
    if (overdueBy(q, t) > 0) overdue++;
  }
  const openPoints = (queries || []).filter(q => q.status === "open");
  return { snags: snags.length, by, overdue,
    pctClosed: snags.length ? Math.round(100 * by.closed / snags.length) : 0,
    openPoints: openPoints.length,
    overduePoints: openPoints.filter(q => overdueBy(q, t) > 0).length,
    unowned: openPoints.filter(q => !normOwner(q.owner)).length };
}

root.TRACK_SNAG = { SIDES, STATES, DAY,
  parseDay, fmtDay, todayReal, addDays, daysBetween, weekStart,
  normOwner, ownerKey, ownerLabel, isMine, roster,
  isSnag, isObservation, raisedOf, isClosed, ageDays, overdueBy, isOverdue, dueState, snagState,
  sortInbox, raiseSnag, setState, logAction, setOwner, burnDown, summary };
if (typeof module !== "undefined") module.exports = root.TRACK_SNAG;

})(typeof window !== "undefined" ? window : globalThis);
