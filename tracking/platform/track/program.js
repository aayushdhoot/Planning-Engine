// ===================================================================
// DnB-OS . platform/track/program.js . THE ROOM PROGRAM LAW
// The client deck kept a headcount matrix: every room type with its
// required count and what was actually built (workstations 300/300,
// cafeteria 50 pax planned 52 built). The 6 tab engine held no room
// program. This law holds it, under the same discipline as the rest:
//   . required comes from a source (a PO, the layout, the BOQ). A
//     required count with no source stays null, never a guess, and it
//     becomes a query.
//   . achieved is only ever a counted number, dated and sourced: a
//     reading or a dated human answer. The engine never counts a room
//     as delivered because it feels done.
//   . a delivered percent shows only when both numbers are known.
// The SKF program lives in project/skf_program.js.
// ===================================================================

;(function (root) {

// achieved counts arrive as dated facts on the ledger, kind
// "program_count", carrying { room, count, day, source }. The latest
// dated fact for a room wins. Nothing here is invented.
function achievedFor(roomKey, facts) {
  let best = null;
  for (const f of (facts || [])) {
    if (f.kind !== "program_count" || f.room !== roomKey || !f.day) continue;
    if (!best || f.day >= best.day) best = { count: f.count, day: f.day, source: f.source || "user_answer" };
  }
  return best;
}

// one room scored. required may be null (unknown, queried). achieved is
// a dated count or null. delivered percent only when both are numbers.
function scoreRoom(room, facts) {
  const seeded = (typeof room.achieved === "number" && room.achievedDay)
    ? { count: room.achieved, day: room.achievedDay, source: room.achievedSource || "seed" } : null;
  const led = achievedFor(room.key, facts);
  const got = (led && (!seeded || led.day >= seeded.day)) ? led : seeded;   // latest dated wins
  const required = (typeof room.required === "number") ? room.required : null;
  const achieved = got ? got.count : null;
  let state;
  if (required == null) state = "unknown_required";
  else if (achieved == null) state = "awaiting_count";
  else if (achieved > required) state = "over";
  else if (achieved === required) state = "delivered";
  else state = "short";
  const pct = (required != null && achieved != null && required > 0)
    ? Math.round(100 * achieved / required) : null;
  return { key: room.key, name: room.name, group: room.group || "", unit: room.unit || "nos",
    required: required, reqSource: room.reqSource || null, achieved: achieved,
    achievedInfo: got, deliveredPct: pct, state: state, note: room.note || null };
}

function score(pack, facts) {
  const rooms = (pack.rooms || []).map(r => scoreRoom(r, facts));
  const by = {};
  for (const r of rooms) by[r.state] = (by[r.state] || 0) + 1;
  const known = rooms.filter(r => r.required != null);
  const counted = rooms.filter(r => r.achieved != null);
  return { rooms: rooms, by: by, total: rooms.length,
    requiredKnown: known.length, requiredUnknown: rooms.length - known.length,
    counted: counted.length, awaiting: known.length - counted.length };
}

// group the scored rooms for a scoreboard
function groups(scored) {
  const out = {}, order = [];
  for (const r of scored.rooms) {
    if (!out[r.group]) { out[r.group] = []; order.push(r.group); }
    out[r.group].push(r);
  }
  return order.map(g => ({ label: g, rooms: out[g] }));
}

root.TRACK_PROGRAM = { achievedFor: achievedFor, scoreRoom: scoreRoom, score: score, groups: groups };
if (typeof module !== "undefined") module.exports = root.TRACK_PROGRAM;

})(typeof window !== "undefined" ? window : globalThis);
