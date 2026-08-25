// ===================================================================
// DnB-OS . platform/track/gfc.js . THE DRAWING REGISTER LAW
// The law the Design and GFC status report reads. Pure: the register is
// passed in, nothing invented.
//   . released is a drawing the internal team marked Completed and issued.
//   . every drawing carries exactly one current holder: SKF when it is
//     released and waiting on the client, FS Design or the MEP consultant
//     when it is still in production. Client approvals stand at zero, so
//     no drawing is fully signed off.
//   . aging counts days from the register's planned end to the report
//     date. A drawing with no end date on the register is refused, listed
//     apart, never given a made up age.
// No DOM, no ledger. The renderer draws what this returns.
// ===================================================================

;(function (root) {

function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function daysBetween(a, b) { var x = parse(a), y = parse(b); return (x && y) ? Math.round((y - x) / 86400000) : null; }

var STATUSES = ["Completed", "In Progress", "Under Revision R1", "Not Started"];

// released: the internal team issued it. The register's Completed status.
function isReleased(d) { return d.intStatus === "Completed"; }
function isSignedOff(d) { return d.skf === "Approved"; }

// the one current holder of the next sign off.
function holderOf(d) {
  if (isReleased(d)) return isSignedOff(d) ? "Signed off" : "SKF (client)";
  return d.group === "MEP" ? "MEP consultant" : "FS Design";
}

// aging in days from the planned end to the report date. null when the
// register carries no end date (the law refuses to age an undated row).
function agingOf(d, asOf) {
  if (!d.end) return null;
  var n = daysBetween(d.end, asOf);
  return (n == null) ? null : Math.max(0, n);
}

// the full rollup the report and the guards read.
function rollup(pack, asOf) {
  var dws = (pack && pack.drawings) || [];
  asOf = asOf || (pack && pack.asOf) || null;
  var released = dws.filter(isReleased).length;
  var signedOff = dws.filter(isSignedOff).length;
  var inProduction = dws.length - released;          // not yet Completed
  var skfPending = released - signedOff;             // Completed, client not approved

  var byStatus = {};
  STATUSES.forEach(function (s) { byStatus[s] = dws.filter(function (d) { return d.intStatus === s; }).length; });

  var byGroup = ["GFC", "TD", "ELEV", "MEP"].map(function (g) {
    var rows = dws.filter(function (d) { return d.group === g; });
    return { group: g, total: rows.length, released: rows.filter(isReleased).length };
  });

  // every drawing gets its holder and age; undated ones are split out.
  var rows = dws.map(function (d) {
    return { group: d.group, name: d.name, crit: d.crit, intStatus: d.intStatus, skf: d.skf,
      start: d.start, end: d.end, released: isReleased(d), holder: holderOf(d),
      aging: agingOf(d, asOf), dated: !!d.end };
  });
  var undated = rows.filter(function (r) { return !r.dated; });
  var dated = rows.filter(function (r) { return r.dated; });

  // pending by holder: one bar per holder, most drawings first.
  var holders = {};
  rows.forEach(function (r) { if (r.holder !== "Signed off") holders[r.holder] = (holders[r.holder] || 0) + 1; });
  var pendingByHolder = Object.keys(holders).map(function (h) { return { holder: h, count: holders[h] }; })
    .sort(function (a, b) { return b.count - a.count; });

  // the oldest overdue drawings, dated only, worst first.
  var aged = dated.slice().sort(function (a, b) { return (b.aging || 0) - (a.aging || 0); });

  return {
    total: dws.length, released: released, inProduction: inProduction,
    signedOff: signedOff, skfPending: skfPending,
    byStatus: byStatus, byGroup: byGroup,
    rows: rows, dated: dated, undated: undated, aged: aged,
    pendingByHolder: pendingByHolder,
    releasedPct: dws.length ? Math.round((released / dws.length) * 100) : 0,
    asOf: asOf
  };
}

root.TRACK_GFC = {
  STATUSES: STATUSES, isReleased: isReleased, isSignedOff: isSignedOff,
  holderOf: holderOf, agingOf: agingOf, rollup: rollup
};
if (typeof module !== "undefined") module.exports = root.TRACK_GFC;

})(typeof window !== "undefined" ? window : globalThis);
