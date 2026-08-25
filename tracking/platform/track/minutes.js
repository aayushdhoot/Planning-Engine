// ===================================================================
// DnB-OS . platform/track/minutes.js . MINUTES AS A FIRST CLASS OBJECT
// The site sheets kept thirty meeting tabs. Every meeting spawned a new
// tab, and open points from one meeting never rolled into the next, so
// the same observation was re typed until somebody forgot it. The
// record was a pile, not a register.
//
// Here a meeting is four things: a date, who was in the room, the rows
// that were argued, and numbered observations.
//
// THE MINUTES LAW: an observation always lands as an owned query with a
// due date. Never a note, never a bullet that dies in a deck. If the
// room did not name an owner it goes to FS, and if the room did not
// name a date it is due in a week, but it always lands. Points still
// open at the next meeting are carried forward by the engine, so
// nobody ever re types them.
// ===================================================================

;(function (root) {

const KEY = "dnbos-track:skf:minutes";
const state = { meetings: [], seq: 0 };

// ---- the law ----
function addMeeting(LED, SNAG, m) {
  m = m || {};
  const date = m.date || SNAG.todayReal();
  const raw = (m.observations || []).filter(o => o && String(o.text || "").trim());
  if (!raw.length) return { ok: false, error: "A meeting with no observations is not minutes." };

  state.seq++;
  const id = "M" + String(state.seq).padStart(3, "0");
  const observations = [];

  raw.forEach((o, i) => {
    const no = i + 1;
    // the law: an owner and a due date, defaulted rather than dropped
    const owner = SNAG.normOwner(o.owner) || { side: "FS", person: null };
    const due = o.due || SNAG.addDays(date, 7);
    const text = String(o.text).trim();
    const q = LED.addQuery({
      about: "minutes " + date + " #" + no,
      question: text,
      blocking: !!o.blocking,
      kind: "observation",
      owner: owner, raised: date, due: due, actions: []
    });
    observations.push({ no, text, owner, due, queryId: q.id });
  });

  const meeting = {
    id, date,
    attendees: (m.attendees || []).map(a => String(a).trim()).filter(Boolean),
    rowsArgued: (m.rowsArgued || []).slice(),
    carried: (m.carried || []).slice(),
    observations,
    ts: new Date().toISOString()
  };
  state.meetings.push(meeting);
  save();

  LED.addFact({ day: date, source: "user_answer", kind: "minutes", confidence: "high",
    text: "Minutes " + id + " on " + date + " with " + meeting.attendees.length + " attendee(s): "
      + observations.length + " observation(s), each raised as an owned query with a due date" });

  return { ok: true, meeting };
}

// Points from earlier meetings whose query is still open. This is what
// rolls into the next meeting, computed every time, never stored twice.
function carriedForward(LED, SNAG, today) {
  const t = today || SNAG.todayReal();
  const out = [];
  for (const mt of state.meetings) {
    for (const o of mt.observations) {
      const q = (LED.state.queries || []).find(x => x.id === o.queryId);
      if (!q || q.status !== "open") continue;
      out.push({ meeting: mt.id, date: mt.date, no: o.no, text: o.text,
        owner: q.owner || o.owner, due: q.due || o.due, queryId: o.queryId,
        age: SNAG.ageDays(q, t), overdue: SNAG.overdueBy(q, t) });
    }
  }
  // oldest and most overdue at the top, the same order the inbox uses
  return out.sort((a, b) => (b.overdue - a.overdue) || (b.age - a.age));
}

function lastMeeting() { return state.meetings.length ? state.meetings[state.meetings.length - 1] : null; }
function byId(id) { return state.meetings.find(m => m.id === id) || null; }

// ---- the export ----
// Plain markdown. Numbers in the rows argued come from the live compare
// rows at the moment of export, never from anyone's memory.
function exportText(meeting, LED, SNAG, project) {
  if (!meeting) return "";
  const L = [];
  const own = o => SNAG.ownerLabel(o);
  L.push("# Site meeting minutes");
  L.push("");
  L.push("Project: " + (project || "SKF Pune"));
  L.push("Date: " + meeting.date);
  L.push("Attendees: " + (meeting.attendees.length ? meeting.attendees.join(", ") : "not recorded"));
  L.push("Minutes id: " + meeting.id);
  L.push("");

  if (meeting.rowsArgued && meeting.rowsArgued.length) {
    L.push("## The rows argued");
    L.push("");
    L.push("Plan and site figures are the live compare rows as they stood when these minutes were exported.");
    L.push("");
    for (const r of meeting.rowsArgued) {
      L.push("- " + r.name + ": plan " + r.plan + ", site " + (r.site == null ? "no reading" : r.site)
        + ", " + r.chip + (r.note ? ". " + r.note : ""));
    }
    L.push("");
  }

  if (meeting.carried && meeting.carried.length) {
    L.push("## Open points carried forward");
    L.push("");
    L.push("These were raised in earlier meetings and are still open. Nobody re typed them.");
    L.push("");
    for (const c of meeting.carried) {
      L.push("- [" + c.date + " #" + c.no + "] " + c.text
        + " (owner " + own(c.owner) + ", due " + c.due
        + (c.overdue > 0 ? ", overdue by " + c.overdue + " days" : "") + ")");
    }
    L.push("");
  }

  L.push("## Observations raised in this meeting");
  L.push("");
  L.push("Every line below is a live query in the engine with an owner and a due date.");
  L.push("");
  for (const o of meeting.observations) {
    L.push(o.no + ". " + o.text + "  \n   Owner: " + own(o.owner) + ". Due: " + o.due + ". Query: " + o.queryId + ".");
  }
  L.push("");
  L.push("---");
  L.push("");
  L.push("Raised as " + meeting.observations.length + " owned queries in the DnB-OS Tracking Engine. "
    + "Track them on the Queries tab. Points still open at the next meeting roll forward on their own.");
  return L.join("\n");
}

function fileName(meeting) {
  return "SKF_Pune_Minutes_" + (meeting ? meeting.date : "draft") + ".md";
}

// ---- persistence ----
function save() {
  if (typeof localStorage === "undefined") return true;
  try { localStorage.setItem(KEY, JSON.stringify({ meetings: state.meetings, seq: state.seq })); return true; }
  catch (e) { return false; }
}
function load() {
  if (typeof localStorage === "undefined") return false;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const d = JSON.parse(raw);
    state.meetings = d.meetings || []; state.seq = d.seq || 0;
    return true;
  } catch (e) { return false; }
}
function reset() { state.meetings = []; state.seq = 0; save(); }

root.TRACK_MINUTES = { state, addMeeting, carriedForward, lastMeeting, byId,
  exportText, fileName, save, load, reset, KEY };
if (typeof module !== "undefined") module.exports = root.TRACK_MINUTES;

})(typeof window !== "undefined" ? window : globalThis);
