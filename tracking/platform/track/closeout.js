// ===================================================================
// DnB-OS . platform/track/closeout.js . THE CLOSEOUT LAW
// The status law ends at verified done. The project ends at handover.
// Between the two sits the closeout: commissioning, the critical room
// handovers, the documents register (warranties, test reports), the
// statutory approvals (CFO, BMC, occupancy audit, fire NOC) and the
// final billing. The site sheets ran this by hand at the very end. This
// law holds it as a checklist per package, kept behind the admin door
// until closeout actually starts.
//   . a checklist item is done only from a dated fact or answer, never a
//     guess. An unknown item is a query.
//   . closeout arms when the calendar is inside a window before handover,
//     or when any package reaches testing and commissioning. Before that
//     it is present but "not started yet", so nobody works it early.
// The SKF packages live in project/skf_closeout.js.
// ===================================================================

;(function (root) {

const DAY = 86400000;
const KINDS = ["commissioning", "handover", "document", "compliance", "billing"];

function parseDay(s) { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function daysBetween(a, b) { const x = parseDay(a), y = parseDay(b); return (x && y) ? Math.round((y - x) / DAY) : null; }

// arm the door: inside `windowDays` before handover, or a package at T&C.
function armed(today, handover, atTC, windowDays) {
  const w = windowDays || 21;
  const d = daysBetween(today, handover);        // days from today to handover
  const near = (d != null && d <= w);            // inside the window, and stays armed past handover
  return { armed: !!(near || atTC), near: !!near, atTC: !!atTC, daysToHandover: d, windowDays: w };
}

// an item is done only from a dated fact/answer (ledger kind
// "closeout_done" { item, day }) or a seeded dated done in the pack.
function doneFor(item, facts) {
  let best = (item.doneOn) ? { day: item.doneOn, source: item.source || "seed" } : null;
  for (const f of (facts || [])) {
    if (f.kind !== "closeout_done" || f.item !== item.key || !f.day) continue;
    if (!best || f.day >= best.day) best = { day: f.day, source: f.source || "user_answer" };
  }
  return best;
}

function scoreItem(item, facts) {
  const d = doneFor(item, facts);
  return { key: item.key, pkg: item.pkg, kind: item.kind, text: item.text,
    done: !!d, doneOn: d ? d.day : null, source: d ? d.source : null, note: item.note || null };
}

function rollup(pack, facts) {
  const items = (pack.items || []).map(it => scoreItem(it, facts));
  const pkgs = {}, order = [];
  for (const it of items) {
    if (!pkgs[it.pkg]) { pkgs[it.pkg] = { name: it.pkg, items: [], done: 0 }; order.push(it.pkg); }
    pkgs[it.pkg].items.push(it);
    if (it.done) pkgs[it.pkg].done++;
  }
  const byKind = {};
  for (const k of KINDS) {
    const of = items.filter(i => i.kind === k);
    byKind[k] = { total: of.length, done: of.filter(i => i.done).length };
  }
  return { items: items, packages: order.map(p => pkgs[p]),
    total: items.length, done: items.filter(i => i.done).length, byKind: byKind };
}

root.TRACK_CLOSEOUT = { KINDS: KINDS, parseDay: parseDay, daysBetween: daysBetween,
  armed: armed, doneFor: doneFor, scoreItem: scoreItem, rollup: rollup };
if (typeof module !== "undefined") module.exports = root.TRACK_CLOSEOUT;

})(typeof window !== "undefined" ? window : globalThis);
