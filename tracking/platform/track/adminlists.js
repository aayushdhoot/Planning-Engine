// ===================================================================
// DnB-OS . platform/track/adminlists.js . THE SMALL ADMIN LISTS LAW
// Day one site rituals the sheets held and the engine did not: the
// approved sample boards with their sign marks, the site readiness
// checklist, the client visit itinerary, and the housekeeping count per
// day. Plain lists, no ceremony. They live behind the admin door.
//   . a list item is done, present or signed only from a dated fact or a
//     seeded dated entry, never a guess. An unknown is a query.
//   . the housekeeping count is a daily claimed number, tag law applies,
//     the same as manpower.
// The SKF lists live in project/skf_adminlists.js.
// ===================================================================

;(function (root) {

function doneFor(item, facts) {
  let best = (item.on) ? { day: item.on, source: item.source || "seed" } : null;
  for (const f of (facts || [])) {
    if (f.kind !== "adminlist_done" || f.item !== item.key || !f.day) continue;
    if (!best || f.day >= best.day) best = { day: f.day, source: f.source || "user_answer" };
  }
  return best;
}

function scoreList(items, facts) {
  return (items || []).map(it => {
    const d = doneFor(it, facts);
    return { key: it.key, text: it.text, done: !!d, on: d ? d.day : null,
      source: d ? d.source : null, note: it.note || null };
  });
}

function lists(pack, facts) {
  const out = {};
  for (const name of Object.keys(pack.lists || {})) {
    const rows = scoreList(pack.lists[name], facts);
    out[name] = { rows: rows, total: rows.length, done: rows.filter(r => r.done).length };
  }
  return out;
}

// housekeeping is a daily claimed count, oldest first
function housekeeping(pack) {
  return (pack.housekeeping || []).slice().sort((a, b) => a.day < b.day ? -1 : 1)
    .map(d => ({ day: d.day, count: d.count, tag: "claimed", note: d.note || null }));
}

root.TRACK_ADMINLISTS = { doneFor: doneFor, scoreList: scoreList, lists: lists, housekeeping: housekeeping };
if (typeof module !== "undefined") module.exports = root.TRACK_ADMINLISTS;

})(typeof window !== "undefined" ? window : globalThis);
