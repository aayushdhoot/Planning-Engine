// ===================================================================
// DnB-OS . platform/track/lookahead.js . THE TWO WEEK LOOK AHEAD LAW
// Reads the working schedule (each package carries a planned start and
// finish) and answers one question: over the next two weeks, what opens,
// what closes, and what does each one need to hold its date. Grouped by
// week, so the site and the client see the near horizon the same way.
//
// The rules:
//   . the schedule is the compare pack's own plan dates. No second copy.
//   . an "opens" item is a package whose planned start falls in the
//     window. A "closes" item is one whose planned finish falls in it.
//     A package can do both if it is a short one.
//   . the need is read from the package's own gate reason and note: a
//     buy, a drawing, or a client decision. A package with no gate in its
//     words carries no need line, never a made up one.
//   . week one is the issue day plus six, week two the seven after.
//
// Pure. No DOM, no fetch. Dates are built from parts so no timezone
// shifts a day, and every input is passed in, so the guards drive it.
// ===================================================================

;(function (root) {

var DAY = 86400000;
function pad(n) { return String(n).padStart(2, "0"); }
function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function fmt(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function addDays(s, n) { var d = parse(s); if (!d) return null; d.setDate(d.getDate() + n); return fmt(d); }
function inRange(day, start, end) { return !!(day && start && end && day >= start && day <= end); }
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function nice(iso) { var d = parse(iso); return d ? d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() : String(iso || ""); }
function niceShort(iso) { var d = parse(iso); return d ? d.getDate() + " " + MON[d.getMonth()] : String(iso || ""); }

// ---- the need: read from the package's own words -------------------
// A gate is one of three things the site can act on: a material to buy, a
// drawing to release, a client decision to close. The reason and note are
// scanned in that order of certainty. No gate words means no need line.
var NEED = [
  { type: "decision", tone: "sky",  re: /selection|fixture|sample|approv|sign off|colour|finish tds|decide/i, label: "Client decision" },
  { type: "drawing",  tone: "sand", re: /drawing|layout|gfc|coordination|released|revision|rcp/i, label: "Drawing" },
  { type: "material", tone: "rose", re: /not ordered|order|\bpo\b|quote|material|delivery|vendor|crane|procure/i, label: "Material" }
];
function needFor(row) {
  var text = String(row.reason || "") + " " + String(row.note || "");
  for (var i = 0; i < NEED.length; i++) {
    if (NEED[i].re.test(text)) {
      return { type: NEED[i].type, tone: NEED[i].tone, label: NEED[i].label,
        text: row.reason ? String(row.reason) : String(row.note || "") };
    }
  }
  return null;
}

// build the two week horizon from the pack. issueDay defaults to the pack
// reading day. horizon is 14 days: week one and week two.
function build(pack, issueDay, opts) {
  opts = opts || {};
  var issue = issueDay || (pack && pack.asOf);
  var w1s = issue, w1e = addDays(issue, 6);
  var w2s = addDays(issue, 7), w2e = addDays(issue, 13);
  var weeks = [
    { key: "w1", label: niceShort(w1s) + " to " + niceShort(w1e), start: w1s, end: w1e, items: [] },
    { key: "w2", label: niceShort(w2s) + " to " + niceShort(w2e), start: w2s, end: w2e, items: [] }
  ];

  function place(item) {
    for (var k = 0; k < weeks.length; k++) {
      if (inRange(item.date, weeks[k].start, weeks[k].end)) { weeks[k].items.push(item); return; }
    }
  }

  var opens = 0, closes = 0;
  for (var gi = 0; gi < ((pack && pack.groups) || []).length; gi++) {
    var g = pack.groups[gi];
    for (var ri = 0; ri < (g.rows || []).length; ri++) {
      var r = g.rows[ri];
      var need = needFor(r);
      if (inRange(r.ps, w1s, w2e)) {
        opens++;
        place({ name: r.name, group: g.label, event: "opens", date: r.ps,
          dateNice: niceShort(r.ps), need: need, note: r.note || null, site: (r.site == null ? null : r.site) });
      }
      if (inRange(r.pf, w1s, w2e)) {
        closes++;
        place({ name: r.name, group: g.label, event: "closes", date: r.pf,
          dateNice: niceShort(r.pf), need: need, note: r.note || null, site: (r.site == null ? null : r.site) });
      }
    }
  }

  // inside a week, order by date, then closes before opens on the same day
  for (var w = 0; w < weeks.length; w++) {
    weeks[w].items.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      if (a.event !== b.event) return a.event === "closes" ? -1 : 1;
      return a.name < b.name ? -1 : 1;
    });
  }

  return { issue: issue, horizonEnd: w2e, weeks: weeks,
    opens: opens, closes: closes, total: opens + closes,
    label: niceShort(w1s) + " to " + nice(w2e) };
}

root.TRACK_LOOKAHEAD = {
  NEED: NEED, needFor: needFor, build: build,
  addDays: addDays, nice: nice, niceShort: niceShort, inRange: inRange
};
if (typeof module !== "undefined") module.exports = root.TRACK_LOOKAHEAD;

})(typeof window !== "undefined" ? window : globalThis);
