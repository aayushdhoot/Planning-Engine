// ===================================================================
// DnB-OS . platform/track/deps.js . THE DEPENDENCY LAW
// The site sheets kept a standing client and builder dependency tracker:
// the things somebody outside the crew owes the job (power, water,
// statutory approvals, IT, access, drawings, selections). Our asks list
// covered one week. A standing register with aging covers the whole
// relationship, and it is never re typed.
//   . every row has an owner side (client, GC, a statutory body, or FS),
//     a plan date it was wanted by, and an actual date it landed.
//   . aging counts on the real calendar from the plan date until the row
//     is done. A promise ages in real time.
//   . done needs a date. Done with no date is not done.
//   . an actual date arrives from a dated human answer, never invented.
// The SKF register lives in project/skf_deps.js.
// ===================================================================

;(function (root) {

const DAY = 86400000;
const SIDES = ["client", "GC", "statutory", "FS"];

function parseDay(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function daysBetween(a, b) { const x = parseDay(a), y = parseDay(b); return (x && y) ? Math.round((y - x) / DAY) : null; }

// a landed date can come from the pack (seeded, sourced) or from a dated
// answer on the ledger, kind "dep_actual" { dep, day }. The latest wins.
function actualFor(dep, facts) {
  let best = dep.actual || null;
  for (const f of (facts || [])) {
    if (f.kind !== "dep_actual" || f.dep !== dep.key || !f.day) continue;
    if (!best || f.day >= best) best = f.day;
  }
  return best;
}

function scoreRow(dep, facts, today) {
  const actual = actualFor(dep, facts);
  const done = !!actual;                       // done needs a date
  const late = (!done && dep.plan && (daysBetween(dep.plan, today) || 0) > 0);
  const aging = (!done && dep.plan) ? Math.max(0, daysBetween(dep.plan, today) || 0) : 0;
  return { key: dep.key, ask: dep.ask, side: dep.side, owner: dep.owner || null,
    plan: dep.plan || null, actual: actual, done: done, aging: aging, late: !!late,
    note: dep.note || null, blocking: !!dep.blocking };
}

function register(pack, facts, today) {
  const rows = (pack.deps || []).map(d => scoreRow(d, facts, today));
  const open = rows.filter(r => !r.done);
  const done = rows.filter(r => r.done);
  const overdue = open.filter(r => r.late);
  return { rows: rows, open: open, done: done, overdue: overdue,
    total: rows.length, openN: open.length, doneN: done.length, overdueN: overdue.length };
}

// the open dependencies, oldest promise first, to feed the Compare asks
function feedAsks(pack, facts, today, n) {
  const reg = register(pack, facts, today);
  const sorted = reg.open.slice().sort((a, b) => (b.aging - a.aging));
  return n ? sorted.slice(0, n) : sorted;
}

root.TRACK_DEPS = { SIDES: SIDES, parseDay: parseDay, daysBetween: daysBetween,
  actualFor: actualFor, scoreRow: scoreRow, register: register, feedAsks: feedAsks };
if (typeof module !== "undefined") module.exports = root.TRACK_DEPS;

})(typeof window !== "undefined" ? window : globalThis);
