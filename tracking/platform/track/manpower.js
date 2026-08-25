// ===================================================================
// DnB-OS . platform/track/manpower.js . THE MANPOWER AND SAFETY LAW
// India runs on the DPR: headcount per trade per day. The engine tracked
// the work but not the labour on the floor. This law holds the daily
// count, under the tag law:
//   . a headcount is a claim. It is what the DPR said, not a measured
//     turnstile number, so it carries the claimed tag until a gate count
//     measures it.
//   . the reported grand total and the sum of the trade lines are both
//     kept. When they disagree the day is flagged, never silently fixed.
//   . safety manhours and near miss have no SKF source yet, so they are a
//     query, never a zero. A zero would read as "nobody got hurt", which
//     the engine cannot know.
// The SKF daily records live in project/skf_manpower.js.
// ===================================================================

;(function (root) {

function sumTrades(rec) {
  let n = 0;
  for (const k in (rec.trades || {})) n += Number(rec.trades[k]) || 0;
  return n;
}

// one day's record scored: the trade sum, the reported total, and a flag
// when the two disagree by more than a rounding wobble (checked both with
// and without the FS staff folded in, because reports vary on that).
function scoreDay(rec) {
  const traded = sumTrades(rec);
  const reported = (typeof rec.total === "number") ? rec.total : null;
  const fsStaff = (typeof rec.fsStaff === "number") ? rec.fsStaff : null;
  // only reconcilable when a trade breakdown exists; a bare head count
  // (a walk tally) has nothing to reconcile and is never flagged
  const mismatch = (reported != null) && (traded > 0)
    && Math.abs(traded - reported) > 1
    && Math.abs((traded + (fsStaff || 0)) - reported) > 1;
  return { day: rec.day, shift: rec.shift || "day", trades: rec.trades || {}, traded: traded,
    reported: reported, fsStaff: fsStaff, ehs: rec.ehs != null ? rec.ehs : null,
    mismatch: mismatch, tag: "claimed", note: rec.note || null };
}

function series(pack) {
  return (pack.days || []).map(scoreDay).sort((a, b) =>
    a.day < b.day ? -1 : (a.day > b.day ? 1 : (a.shift === "day" ? -1 : 1)));
}

// the latest day shift record, the one the Today line quotes
function latest(pack) {
  const s = series(pack).filter(r => r.shift !== "night");
  return s.length ? s[s.length - 1] : null;
}

// the one line for Today. Plain words, the claimed tag on the number.
function todayLine(pack) {
  const l = latest(pack);
  if (!l) return { text: "No manpower report yet.", day: null, total: null, trades: 0, safety: false };
  const total = l.reported != null ? l.reported : l.traded;
  const trades = Object.keys(l.trades).length;
  const where = trades ? " across " + trades + " trades" : "";
  const how = trades ? "claimed from the DPR" : "counted on the walk";
  return { day: l.day, total: total, trades: trades, tag: "claimed", safety: false,
    text: total + " on site on " + l.day + where + ", " + how + ". "
      + "Safety manhours and near miss are not logged yet." };
}

// trades rolled up across the whole series, day shift only
function byTrade(pack) {
  const out = {};
  for (const r of series(pack)) if (r.shift !== "night")
    for (const k in r.trades) out[k] = (out[k] || 0) + (Number(r.trades[k]) || 0);
  return out;
}

root.TRACK_MANPOWER = { sumTrades: sumTrades, scoreDay: scoreDay, series: series,
  latest: latest, todayLine: todayLine, byTrade: byTrade };
if (typeof module !== "undefined") module.exports = root.TRACK_MANPOWER;

})(typeof window !== "undefined" ? window : globalThis);
