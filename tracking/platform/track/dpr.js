// ===================================================================
// DnB-OS . platform/track/dpr.js . THE DPR MANPOWER LAW
// One job: read the headcount out of a pasted daily report, and nothing
// else. The DPR carries a lot of words. This law takes the manpower and
// leaves the rest alone, because a number a person wrote down beats a
// number the engine guessed from a photograph.
//
// The laws:
//   . a stated total wins. If the report says "total manpower 47" that
//     is the number, whatever the trade lines add up to.
//   . otherwise the trade lines are summed, and the law says it summed.
//   . the two are never silently reconciled. When a stated total and the
//     trade sum disagree, both are kept and the disagreement is named.
//   . a report with no readable headcount is refused, never guessed at.
//     A refusal carries the reason so a human can fix the paste.
//   . reading is pure: text in, verdict out, no clock and no storage.
// ===================================================================

;(function (root) {

const KEY = "dnbos-track:skf:dpr";

// "total manpower 47", "manpower: 47", "total strength - 47"
const TOTAL_RE = [
  /\btotal\s*(?:man\s*power|manpower|strength|labour|labor|workers?|head\s*count|headcount)\b\D{0,12}(\d{1,4})/i,
  /\b(?:man\s*power|manpower|strength|head\s*count|headcount)\b\s*[:\-–]?\s*(\d{1,4})\b/i,
  /\btotal\b\s*[:\-–]\s*(\d{1,4})\b/i
];

// a trade line: "Electrical - 5", "Civil : 5", "Housekeeping 7"
const TRADE_RE = /^[\s*•\-]*([A-Za-z][A-Za-z&/ .]{2,28}?)\s*[:\-–]?\s+(\d{1,3})\s*(?:nos?\.?|pax|men|persons?)?\s*$/;

// words that look like a trade line but are not people
const NOT_TRADE = /\b(date|day|time|weather|total|temp|temperature|hours?|am|pm|percent|%|floor|level|sqft|sqm|rev|drawing|po|invoice|man\s*power|manpower|strength|head\s*count|headcount|labour|labor|workers?)\b/i;

function readManpower(text) {
  const raw = String(text || "");
  if (!raw.trim()) return { ok: false, why: "nothing was pasted" };

  // the trade lines first, so a stated total can be compared against them
  const trades = {};
  let tradeSum = 0;
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(TRADE_RE);
    if (!m) continue;
    const name = m[1].trim().replace(/\s+/g, " ");
    const n = Number(m[2]);
    if (!(n > 0) || n > 999) continue;
    if (NOT_TRADE.test(name)) continue;
    if (/^(total|sub\s*total|grand\s*total)$/i.test(name)) continue;
    trades[name] = (trades[name] || 0) + n;
    tradeSum += n;
  }

  let stated = null;
  for (const re of TOTAL_RE) {
    const m = raw.match(re);
    if (m && Number(m[1]) > 0) { stated = Number(m[1]); break; }
  }

  if (stated == null && tradeSum <= 0)
    return { ok: false, why: "no headcount found. The engine needs a stated total, or trade lines it can add up." };

  const total = stated != null ? stated : tradeSum;
  const how = stated != null ? "stated in the report" : "summed from the trade lines";
  // the disagreement is surfaced, never resolved behind the user's back
  const mismatch = (stated != null && tradeSum > 0 && stated !== tradeSum)
    ? { stated: stated, tradeSum: tradeSum } : null;

  return { ok: true, total: total, trades: trades, tradeSum: tradeSum || null,
           stated: stated, how: how, mismatch: mismatch };
}

// ---- storage. One record per day, the last paste for that day wins. ----
function load() {
  try { const r = localStorage.getItem(KEY); return r ? JSON.parse(r) : {}; }
  catch (e) { return {}; }
}
function save(all) { try { localStorage.setItem(KEY, JSON.stringify(all)); } catch (e) {} }

function put(day, rec) {
  const all = load();
  all[day] = rec;
  save(all);
  return all;
}
function forDay(day) { const all = load(); return all[day] || null; }
function clear(day) { const all = load(); delete all[day]; save(all); }
function days() { return Object.keys(load()).sort(); }

// ---- the override law -------------------------------------------------
// The pack holds what the engine read before. A DPR record for the same
// day replaces the day shift number, because a person counted it. The
// pack is never edited: the merge happens at read time, so removing the
// DPR record returns the original number.
function mergePack(pack, overrides) {
  const ov = overrides || load();
  const out = [];
  const seen = {};
  for (const d of ((pack && pack.days) || [])) {
    if (d.shift !== "night" && ov[d.day]) {
      const o = ov[d.day];
      seen[d.day] = 1;
      out.push(Object.assign({}, d, { total: o.total,
        trades: Object.keys(o.trades || {}).length ? o.trades : d.trades,
        fromDpr: true }));
    } else out.push(d);
  }
  // a DPR for a day the pack never had still counts
  for (const day of Object.keys(ov)) {
    if (seen[day]) continue;
    if (((pack && pack.days) || []).some(d => d.day === day && d.shift !== "night")) continue;
    const o = ov[day];
    out.push({ day: day, shift: "day", total: o.total, trades: o.trades || {}, fromDpr: true });
  }
  return Object.assign({}, pack, { days: out });
}

root.TRACK_DPR = { KEY, readManpower, load, save, put, forDay, clear, days, mergePack };
if (typeof module !== "undefined") module.exports = root.TRACK_DPR;

})(typeof window !== "undefined" ? window : globalThis);
