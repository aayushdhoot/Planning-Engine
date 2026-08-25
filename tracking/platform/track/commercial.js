// ===================================================================
// DnB-OS . platform/track/commercial.js . THE COMMERCIAL LAW
// The money and buying laws the Procurement Weekly and the PO register
// read. Pure: every input is passed in, so the guards drive it offline.
//   . rupees in Indian style, Rs X.XX Cr and Rs X.X L, never a bare number
//   . committed total and the 14 Jul batch value, both summed from the PO
//     list at call time, never a stored figure
//   . committed against the BOQ internal cost (BCS) by head, with the gap
//   . the material call law: the pill is one of five words, and on track
//     or expedite can never be claimed without a PO held
//   . the receipt crowd window, read from the material receipt dates
// It holds no data of its own and touches no DOM or ledger.
// ===================================================================

;(function (root) {

// ---- dates, built from parts so no timezone shifts a day ------------
function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function daysBetween(a, b) { var x = parse(a), y = parse(b); return (x && y) ? Math.round((y - x) / 86400000) : null; }
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function niceShort(iso) { var d = parse(iso); return d ? d.getDate() + " " + MON[d.getMonth()] : String(iso || ""); }

// ---- money, Indian style --------------------------------------------
// group by the last three digits then in twos, so 6199363 reads 61,99,363.
function indianComma(n) {
  n = Math.round(Number(n) || 0);
  var neg = n < 0; n = Math.abs(n);
  var s = String(n);
  if (s.length <= 3) return (neg ? "-" : "") + s;
  var last3 = s.slice(-3), rest = s.slice(0, -3);
  rest = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",");
  return (neg ? "-" : "") + rest + "," + last3;
}
// Rs X.XX Cr at a crore and up, Rs X.X L at a lakh and up, else Rs with commas.
function rupeesCrL(v) {
  if (v == null || isNaN(Number(v))) return "not captured";
  v = Number(v);
  if (v >= 1e7) return "Rs " + (v / 1e7).toFixed(2) + " Cr";
  if (v >= 1e5) return "Rs " + (v / 1e5).toFixed(1) + " L";
  return "Rs " + indianComma(v);
}
function rupeesFull(v) { return v == null ? "not captured" : "Rs " + indianComma(v); }

// ---- committed totals, summed from the PO list ----------------------
function committed(poPack) {
  var pos = (poPack && poPack.pos) || [];
  var total = pos.reduce(function (a, p) { return a + (Number(p.value) || 0); }, 0);
  var taxable = pos.reduce(function (a, p) { return a + (Number(p.taxable) || 0); }, 0);
  var batchIds = (poPack && poPack.batch) || pos.filter(function (p) { return p.newlyPlaced; }).map(function (p) { return p.po; });
  var batch = pos.filter(function (p) { return batchIds.indexOf(p.po) !== -1; });
  var batchValue = batch.reduce(function (a, p) { return a + (Number(p.value) || 0); }, 0);
  return { count: pos.length, total: Math.round(total * 100) / 100, taxable: Math.round(taxable * 100) / 100,
    batchCount: batch.length, batchValue: Math.round(batchValue * 100) / 100, batchIds: batchIds };
}

// ---- committed against the BOQ internal cost (BCS), by head ---------
// PO taxable (ex GST) against BCS (ex GST) is apples to apples: both are
// what Flipspaces pays out. PRE (site preliminaries) carries no BOQ line,
// so its committed value is shown but its gap is left blank, never zero.
function byHead(poPack) {
  var pos = (poPack && poPack.pos) || [];
  var heads = (poPack && poPack.boqHeads) || [];
  var sumByHead = {};
  var poCountByHead = {};
  pos.forEach(function (p) {
    sumByHead[p.head] = (sumByHead[p.head] || 0) + (Number(p.taxable) || 0);
    poCountByHead[p.head] = (poCountByHead[p.head] || 0) + 1;
  });
  var rows = heads.map(function (h) {
    var committedEx = Math.round((sumByHead[h.head] || 0) * 100) / 100;
    var gap = (h.bcs == null) ? null : Math.round((h.bcs - committedEx) * 100) / 100;
    return { head: h.head, name: h.name, bcs: h.bcs, committed: committedEx,
      pos: poCountByHead[h.head] || 0, gap: gap,
      pct: (h.bcs && h.bcs > 0) ? Math.min(100, Math.round((committedEx / h.bcs) * 100)) : null };
  });
  var totBcs = heads.reduce(function (a, h) { return a + (h.bcs || 0); }, 0);
  var totCommitted = rows.reduce(function (a, r) { return a + r.committed; }, 0);
  return { rows: rows, totalBcs: totBcs, totalCommittedEx: Math.round(totCommitted * 100) / 100,
    totalGap: Math.round((totBcs - totCommitted) * 100) / 100 };
}

// ---- the material call law ------------------------------------------
var CALLS = ["act now", "expedite", "at risk", "watch", "on track"];
var CALL_ORDER = { "act now": 0, "expedite": 1, "at risk": 2, "watch": 3, "on track": 4 };
var CALL_TONE = { "act now": "rose", "expedite": "sand", "at risk": "sand", "watch": "sky", "on track": "sage" };
function callTone(c) { return CALL_TONE[String(c || "").toLowerCase()] || "neutral"; }
function callRank(c) { var r = CALL_ORDER[String(c || "").toLowerCase()]; return r == null ? 9 : r; }

// sort the board by urgency then by receipt date, so the reader meets the
// act now rows first, exactly as the reference PDF lays them out.
function sortBoard(rows) {
  return (rows || []).slice().sort(function (a, b) {
    var d = callRank(a.call) - callRank(b.call);
    if (d) return d;
    return String(a.receipt || "") < String(b.receipt || "") ? -1 : 1;
  });
}

// the law a guard drives: every call is one of the five words, on track
// and expedite always carry a PO, and act now never carries one (an act
// now item is by definition not yet ordered). Returns the offending rows.
function validateBoard(matPack) {
  var rows = (matPack && matPack.rows) || [];
  var badWord = rows.filter(function (r) { return CALLS.indexOf(String(r.call).toLowerCase()) === -1; });
  var onTrackNoPo = rows.filter(function (r) { return r.call === "on track" && !r.poHeld; });
  var expediteNoPo = rows.filter(function (r) { return r.call === "expedite" && !r.poHeld; });
  var actNowWithPo = rows.filter(function (r) { return r.call === "act now" && r.poHeld && !r.contradiction; });
  return { ok: !badWord.length && !onTrackNoPo.length && !expediteNoPo.length && !actNowWithPo.length,
    badWord: badWord, onTrackNoPo: onTrackNoPo, expediteNoPo: expediteNoPo, actNowWithPo: actNowWithPo,
    total: rows.length };
}

// packages still at quote or selection: the quote pile the weekly must
// convert. Read from the material pack's own quote list, never guessed.
function atQuoteCount(matPack) { return ((matPack && matPack.quotePile) || []).length; }

// ---- the receipt crowd window ---------------------------------------
// the window the receipts cluster in, from asOf forward. start is the
// first receipt on or after asOf, end covers the bulk (about 85 percent),
// so a couple of far tail dates do not stretch the window. Honest counts.
function receiptWindow(matPack, asOf) {
  var recs = ((matPack && matPack.rows) || []).map(function (r) { return r.receipt; })
    .filter(function (d) { return d && (!asOf || d >= asOf); }).sort();
  if (!recs.length) return { start: null, end: null, crowd: 0, total: 0 };
  var start = recs[0];
  var idx = Math.max(0, Math.ceil(0.85 * recs.length) - 1);
  var end = recs[idx];
  var crowd = recs.filter(function (d) { return d >= start && d <= end; }).length;
  // when both dates share a month, drop the first month so the label reads
  // "20 to 28 Jul" on one line, the way the reference weekly carries it.
  var ds = parse(start), de = parse(end);
  var sameMonth = ds && de && ds.getMonth() === de.getMonth();
  var label = (sameMonth ? String(ds.getDate()) : niceShort(start)) + " to " + niceShort(end);
  return { start: start, end: end, crowd: crowd, total: recs.length, label: label };
}

// overdue: a PO whose delivery date is on or before asOf. Used to flag
// the placed rows that need a fresh dated commitment.
function overduePos(poPack, asOf) {
  return ((poPack && poPack.pos) || []).filter(function (p) {
    return p.delivery && asOf && p.delivery <= asOf;
  });
}

root.TRACK_COMMERCIAL = {
  parse: parse, daysBetween: daysBetween, niceShort: niceShort,
  indianComma: indianComma, rupeesCrL: rupeesCrL, rupeesFull: rupeesFull,
  committed: committed, byHead: byHead,
  CALLS: CALLS, callTone: callTone, callRank: callRank, sortBoard: sortBoard,
  validateBoard: validateBoard, atQuoteCount: atQuoteCount,
  receiptWindow: receiptWindow, overduePos: overduePos
};
if (typeof module !== "undefined") module.exports = root.TRACK_COMMERCIAL;

})(typeof window !== "undefined" ? window : globalThis);
