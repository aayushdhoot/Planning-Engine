// ===================================================================
// DnB-OS . platform/kb/minutes.js . A MEETING IS A REGISTER, NOT A PILE
//
// The site sheets on this project kept thirty meeting tabs. Every meeting
// spawned a new one, and open points from the last meeting never rolled
// into the next — so the same observation was re-typed week after week until
// somebody got tired and stopped. The record was a pile.
//
// A meeting here is four things: a date, who was in the room, what was
// decided, and numbered observations.
//
// THE MINUTES LAW
//   An observation always lands as an OWNED POINT WITH A DUE DATE. Never a
//   note, never a bullet that dies in a deck. If the room did not name an
//   owner it goes to us; if the room did not name a date it is due in a
//   week. It always lands, and the row says which parts were defaulted.
//
//   POINTS STILL OPEN AT THE NEXT MEETING ARE CARRIED FORWARD by the
//   engine, keeping the meeting they were raised at and their age. Nobody
//   ever re-types one, and nothing quietly stops being carried.
//
//   A POINT IS CLOSED BY A DECISION, not by falling off a list. Closing
//   needs a date and what was decided.
//
//   AN ACTION ON SOMEBODY WHO WAS NOT IN THE ROOM is flagged. It may be
//   perfectly reasonable — it is also the most common way a point dies.
//
// Pure: meetings in, register out. Today is passed in.
// ===================================================================

;(function (root) {

const SIDES = ["us", "client", "builder", "vendor", "consultant"];
const GRACE_DAYS = 7;

const DAY = 86400000;
const parse = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) ? Date.parse(s + "T00:00:00Z") : null;
const between = (a, b) => { const x = parse(a), y = parse(b);
  return (x != null && y != null) ? Math.round((y - x) / DAY) : null; };
const shift = (s, n) => { const x = parse(s);
  return x == null ? null : new Date(x + n * DAY).toISOString().slice(0, 10); };

// ---- what a meeting must carry to be a meeting -------------------------
function faults(m, today) {
  const bad = [];
  if (!m || !parse(m.date)) bad.push("no date");
  // A MEETING DATED TOMORROW HAS NOT HAPPENED. Minuting one gives every
  // point it raises a negative age, and an age that counts backwards is
  // worse than no age at all.
  else if (today && m.date > today) bad.push("dated " + m.date +
    ", which has not happened yet — that is an agenda, not minutes");
  if (!m || !Array.isArray(m.room) || !m.room.length) bad.push("nobody in the room");
  const obs = (m && m.observations || []).filter(o => o && String(o.text || "").trim().length > 3);
  // A MEETING WITH NO OBSERVATIONS IS NOT MINUTES. It is an attendance list.
  if (!obs.length) bad.push("no observations — that is an attendance list, not minutes");
  return bad;
}

// ---- one observation, landed -------------------------------------------
// IT ALWAYS LANDS. What the room did not say is defaulted and declared.
function land(o, meeting, no) {
  const text = String(o.text || "").trim();
  const ownerGiven = !!(o.owner && String(o.owner).trim());
  const sideGiven = SIDES.indexOf(o.side) >= 0;
  const dueGiven = !!parse(o.due);
  return {
    id: meeting.id + "." + no, no,
    text,
    side: sideGiven ? o.side : "us",
    owner: ownerGiven ? String(o.owner).trim() : null,
    due: dueGiven ? o.due : shift(meeting.date, GRACE_DAYS),
    defaulted: [!sideGiven && "side", !dueGiven && "due date"].filter(Boolean),
    defaultedWhy: (sideGiven && dueGiven) ? null
      : "the room did not name " +
        [!sideGiven && "who owns it", !dueGiven && "a date"].filter(Boolean).join(" or ") +
        ", so it goes to us" + (!dueGiven ? " and is due in a week" : "") +
        " rather than being lost",
    raisedAt: meeting.id, raisedOn: meeting.date,
    state: "open", closedOn: null, decision: null,
    // AN ACTION ON SOMEBODY WHO WAS NOT IN THE ROOM
    absent: ownerGiven && (meeting.room || []).every(p =>
      String(p).toLowerCase().indexOf(String(o.owner).toLowerCase()) < 0),
  };
}

// ---- the register --------------------------------------------------------
function register(meetings, today) {
  const ms = (meetings || []).slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  const points = [];
  ms.forEach(m => {
    m.faults = faults(m, today);
    m.valid = !m.faults.length;
    if (!m.valid) return;
    (m.observations || []).filter(o => o && String(o.text || "").trim().length > 3)
      .forEach((o, i) => {
        const p = land(o, m, i + 1);
        // a decision recorded on the meeting closes it
        const dec = (m.closed || []).find(c => c.id === p.id);
        if (dec && dec.on && dec.decision) {
          p.state = "closed"; p.closedOn = dec.on; p.decision = dec.decision; p.closedBy = dec.by || null;
        }
        points.push(p);
      });
  });
  // and anything closed at a LATER meeting
  ms.forEach(m => (m.closed || []).forEach(c => {
    const p = points.find(x => x.id === c.id);
    if (p && p.state !== "closed" && c.on && c.decision) {
      p.state = "closed"; p.closedOn = c.on; p.decision = c.decision;
      p.closedBy = c.by || null; p.closedAt = m.id;
    }
  }));

  points.forEach(p => {
    p.age = p.state === "closed" ? between(p.raisedOn, p.closedOn) : between(p.raisedOn, today);
    p.overdue = p.state !== "closed" && !!p.due && !!today && p.due < today;
    p.lateBy = p.overdue ? between(p.due, today) : 0;
    // POINTS STILL OPEN AT THE NEXT MEETING ARE CARRIED FORWARD.
    p.carriedThrough = p.state === "closed"
      ? ms.filter(m => m.valid && m.date > p.raisedOn && m.date <= p.closedOn).length
      : ms.filter(m => m.valid && m.date > p.raisedOn).length;
  });
  return { meetings: ms, points };
}

// ---- what the next meeting opens with ----------------------------------
// Never re-typed. Whatever is still open, in the order it will be argued.
function carriedForward(meetings, today) {
  const { points } = register(meetings, today);
  return points.filter(p => p.state !== "closed")
    .sort((a, b) => (b.overdue - a.overdue) ||
      ((a.due || "9999") < (b.due || "9999") ? -1 : 1));
}

function summary(meetings, today) {
  const { meetings: ms, points } = register(meetings, today);
  const open = points.filter(p => p.state !== "closed");
  const closed = points.filter(p => p.state === "closed");
  return {
    meetings: ms.length, valid: ms.filter(m => m.valid).length,
    points: points.length, open: open.length, closed: closed.length,
    overdue: open.filter(p => p.overdue).length,
    defaulted: points.filter(p => p.defaulted.length).length,
    absentOwners: open.filter(p => p.absent).length,
    oldest: open.length ? Math.max.apply(null, open.map(p => p.age || 0)) : 0,
    // how long a point survives before somebody decides it
    meanToClose: closed.length
      ? Math.round(closed.reduce((t, p) => t + (p.age || 0), 0) / closed.length) : null,
    carriedMost: open.length ? Math.max.apply(null, open.map(p => p.carriedThrough || 0)) : 0,
  };
}

const MIN = { SIDES, GRACE_DAYS, faults, land, register, carriedForward, summary,
              between, shift };
root.KB_MINUTES = MIN;
if (typeof module !== "undefined" && module.exports) module.exports = MIN;

})(typeof globalThis !== "undefined" ? globalThis : this);
