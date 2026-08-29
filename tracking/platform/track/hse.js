// ===================================================================
// DnB-OS . platform/track/hse.js . THE HSE ROLLUP LAW
// The weekly safety picture, rolled up from the daily walk flags. Pure,
// node and window, so the guards drive it offline.
//
// Laws:
//   . a flag is present because a photo showed it. Presence is honest.
//   . closure needs a dated closed state. With no HSE log yet, flags read
//     open and the rollup says so, it never guesses a closure rate up.
//   . a repeat is a category seen on two or more walk days inside the
//     window. With one walk day in range, there are no repeats yet, and
//     the rollup states that plainly rather than implying a clean week.
// ===================================================================

;(function (root) {

var SEV_ORDER = { high: 0, med: 1, low: 2 };

function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? m[0] : null; }
function inWindow(day, week) {
  if (!week) return true;
  return (!week.start || day >= week.start) && (!week.end || day <= week.end);
}

// the walk days that carry flags inside the window, sorted
function daysIn(pack, week) {
  var d = {};
  (pack.flags || []).forEach(function (f) { if (inWindow(f.day, week)) d[f.day] = 1; });
  return Object.keys(d).sort();
}

// rollup(pack, week): the whole weekly picture the report and guard read.
function rollup(pack, week) {
  var flags = (pack.flags || []).filter(function (f) { return inWindow(f.day, week); });
  var good = (pack.good || []).filter(function (g) { return inWindow(g.day, week); });
  var days = daysIn(pack, week);

  // flags grouped by day, each day sorted worst first
  var byDay = days.map(function (day) {
    var list = flags.filter(function (f) { return f.day === day; })
      .slice().sort(function (a, b) { return (SEV_ORDER[a.sev] || 9) - (SEV_ORDER[b.sev] || 9); });
    return { day: day, flags: list, count: list.length,
      high: list.filter(function (f) { return f.sev === "high"; }).length };
  });

  // categories and the days each was seen on. A repeat is two or more days.
  var cat = {};
  flags.forEach(function (f) {
    var c = cat[f.cat] || (cat[f.cat] = { cat: f.cat, count: 0, days: {}, worst: "low" });
    c.count++; c.days[f.day] = 1;
    if ((SEV_ORDER[f.sev] || 9) < (SEV_ORDER[c.worst] || 9)) c.worst = f.sev;
  });
  var categories = Object.keys(cat).map(function (k) {
    var c = cat[k]; c.dayCount = Object.keys(c.days).length; c.repeat = c.dayCount >= 2; return c;
  }).sort(function (a, b) { return b.count - a.count; });
  var repeats = categories.filter(function (c) { return c.repeat; });

  var openN = flags.filter(function (f) { return f.state !== "closed"; }).length;
  var closedN = flags.filter(function (f) { return f.state === "closed"; }).length;
  var total = flags.length;
  var highN = flags.filter(function (f) { return f.sev === "high"; }).length;

  return {
    total: total, high: highN, openN: openN, closedN: closedN,
    closureRate: total ? Math.round((closedN / total) * 100) : null,
    days: days, dayCount: days.length, byDay: byDay,
    categories: categories, repeats: repeats, good: good,
    empty: total === 0,
    oneDayOnly: days.length === 1,
    // the honest line the report prints under the flags
    note: total === 0
      ? "No walk with safety flags falls inside this week yet."
      : (days.length === 1
        ? "Only one walk day sits in this week, so repeat trends across days cannot be read yet. Every flag below is open, no HSE closure log exists."
        : "Flags across " + days.length + " walk days. Repeat categories are highlighted. Every flag is open until an HSE log records a dated closure.")
  };
}


// ---- safety seen on the walk -----------------------------------------
// The pack is what a human logged. This is what the reader saw in the pin
// photos on a given day. They are kept apart in storage and merged only at
// read time, so a live observation never overwrites the logged one and
// removing the read returns the pack untouched.
//
// The laws:
//   . an observation needs a day, a severity and words. Anything else is
//     refused, never stored half formed.
//   . severity is one of high, med, low. An unknown severity is refused
//     rather than quietly downgraded.
//   . a live observation is always open when it lands. Only a dated
//     closure closes it, and the reader cannot write one.
//   . good practice seen in a photo is carried too, so the client report
//     has evidence and not just an absence of flags.
var LIVE_KEY = "dnbos-track:skf:hselive";
var SEVS = { high: 1, med: 1, low: 1 };

function readObs(o, day) {
  if (!o) return { ok: false, why: "empty observation" };
  var d = parse(o.day || day);
  if (!d) return { ok: false, why: "an observation without a day" };
  var text = String(o.text || "").trim();
  if (!text) return { ok: false, why: "an observation without words" };
  var sev = String(o.sev || "").toLowerCase();
  if (!SEVS[sev]) return { ok: false, why: "severity must be high, med or low, got " + (o.sev || "nothing") };
  return { ok: true, obs: { day: d, cat: String(o.cat || "Site").trim() || "Site", sev: sev,
    pins: Array.isArray(o.pins) ? o.pins.slice() : [], state: "open", text: text, fromRead: true } };
}

function loadLive() {
  try { var r = localStorage.getItem(LIVE_KEY); return r ? JSON.parse(r) : {}; }
  catch (e) { return {}; }
}
function saveLive(all) { try { localStorage.setItem(LIVE_KEY, JSON.stringify(all)); } catch (e) {} }
function putLive(day, flags, good) {
  var all = loadLive();
  all[day] = { flags: flags || [], good: good || [] };
  saveLive(all);
  return all;
}
function clearLive(day) { var all = loadLive(); delete all[day]; saveLive(all); }

// the pack a report should read: logged plus seen, never one overwriting
// the other. A day present in both keeps both sets of rows.
function mergePack(pack, live) {
  var lv = live || loadLive();
  var flags = ((pack && pack.flags) || []).slice();
  var good = ((pack && pack.good) || []).slice();
  for (var day in lv) {
    var e = lv[day] || {};
    for (var i = 0; i < (e.flags || []).length; i++) flags.push(e.flags[i]);
    for (var j = 0; j < (e.good || []).length; j++) good.push(e.good[j]);
  }
  var out = {};
  for (var k in pack) out[k] = pack[k];
  out.flags = flags; out.good = good;
  return out;
}

root.TRACK_HSE = { SEV_ORDER: SEV_ORDER, daysIn: daysIn, rollup: rollup, inWindow: inWindow,
  LIVE_KEY: LIVE_KEY, SEVS: SEVS, readObs: readObs, loadLive: loadLive, saveLive: saveLive,
  putLive: putLive, clearLive: clearLive, mergePack: mergePack };
if (typeof module !== "undefined") module.exports = root.TRACK_HSE;

})(typeof window !== "undefined" ? window : globalThis);
