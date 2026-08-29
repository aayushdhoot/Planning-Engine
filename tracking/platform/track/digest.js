// ===================================================================
// DnB-OS . platform/track/digest.js . THE DAILY SITE DIGEST LAW
// Turns one walk day of pin readings into the digest the project team
// reads: what the floor showed (one line per trade), which pins carry the
// line, six frames to publish, and the day's watch list. Pure, node and
// window, so the guards drive it offline and the template only paints it.
//
// Laws:
//   . a floor line is a rollup of real readings, never invented. It names
//     how many pins carried it and the plain state, nothing more.
//   . a frame caption comes from the pin's own reading note. No note, the
//     pin is not chosen. Captions are never written by hand here.
//   . watch and next items come from the compare pack's look ahead rows,
//     so the digest cannot disagree with the Compare tab.
// ===================================================================

;(function (root) {

// ---- trades: the buckets a walk read rolls up into, in display order ----
// each maps many raw work strings to one plain trade, with a pastel tone.
var TRADES = [
  { key: "sprinkler", label: "Fire sprinklers", tone: "sage", re: /sprinkler/i },
  { key: "hvac",      label: "HVAC ducting",    tone: "sky",  re: /hvac|duct/i },
  { key: "block",     label: "Blockwork",       tone: "sand", re: /aac|blockwork|masonry|\bblock\b|plaster|punning/i },
  { key: "drywall",   label: "Drywall",         tone: "sky",  re: /drywall|gypsum/i },
  { key: "glass",     label: "Glass fronts",    tone: "sky",  re: /glass/i },
  { key: "electrical",label: "Electrical",      tone: "sand", re: /electric|conduit|first fix|raceway|cable|trench/i },
  { key: "ceiling",   label: "Ceilings",        tone: "lilac",re: /ceiling/i },
  { key: "floor",     label: "Flooring",        tone: "sand", re: /screed|tile|vitrified|floor(?!.*trench)|self level/i },
  { key: "finishes",  label: "Putty and paint", tone: "rose", re: /putty|paint|primer|prime|top coat/i },
  { key: "plumbing",  label: "Plumbing",        tone: "sky",  re: /plumb|water proof|waterproof|cpvc|drain|sanitary/i }
];

function tradeFor(work) {
  for (var i = 0; i < TRADES.length; i++) if (TRADES[i].re.test(work || "")) return TRADES[i];
  return null;
}

// readings for one day: accept the readings law state, or a plain array.
function dayReadings(readings, day) {
  var arr = readings && readings.state ? readings.state.readings : (readings || []);
  return (arr || []).filter(function (r) { return r.day === day; });
}
function spaceOf(rec, pins) {
  if (rec.space) return rec.space;
  var reg = pins || root.TRACK_PINS;
  var p = reg && reg.pins ? reg.pins.filter(function (x) { return x.no === rec.pin; })[0] : null;
  return p ? p.space : null;
}

// the plain verb for a bucket, from the count of item states inside it.
function verbFor(counts) {
  var done = counts.done || 0, ongoing = counts.ongoing || 0, started = counts.started || 0;
  var mat = counts.material_present || 0, none = counts.no_change || 0;
  var live = done + ongoing + started + mat;
  if (live === 0) return "not started on the floor yet";
  if (done >= Math.max(1, Math.round(live * 0.6))) return "done or near done";
  if (ongoing >= started && ongoing >= mat) return "in progress";
  if (mat > ongoing && mat >= started) return "material staged, little built yet";
  return "just started";
}

// ---- floorRollup: one dot row per trade seen on the day ----------------
// rows carry pins so the UI can expand a line to its pin evidence.
function floorRollup(readings, day, pins) {
  var recs = dayReadings(readings, day);
  var bucket = {};
  for (var i = 0; i < recs.length; i++) {
    var rec = recs[i], space = spaceOf(rec, pins);
    for (var j = 0; j < rec.items.length; j++) {
      var it = rec.items[j], t = tradeFor(it.work);
      if (!t) continue;
      var b = bucket[t.key] || (bucket[t.key] = { trade: t, counts: {}, pins: {}, states: [] });
      b.counts[it.state] = (b.counts[it.state] || 0) + 1;
      if (!b.pins[rec.pin]) b.pins[rec.pin] = { no: rec.pin, space: space, note: it.note || "", work: it.work, state: it.state };
    }
  }
  var rows = [];
  for (var k = 0; k < TRADES.length; k++) {
    var key = TRADES[k].key, b = bucket[key];
    if (!b) continue;
    var pinList = Object.keys(b.pins).map(function (n) { return b.pins[n]; })
      .sort(function (a, c) { return a.no - c.no; });
    var n = pinList.length;
    rows.push({
      key: key, tone: b.trade.tone, lead: b.trade.label,
      body: verbFor(b.counts) + " across " + n + (n === 1 ? " pin" : " pins") + ".",
      pinCount: n, pins: pinList, counts: b.counts
    });
  }
  // busiest trades first, but keep at most 8 so the page stays calm
  rows.sort(function (a, c) { return c.pinCount - a.pinCount; });
  return rows.slice(0, 8);
}

// ---- pickFrames: six pins to publish, captions from their own notes -----
// scenes are matched in order, first matching pin wins, none repeats. A
// pin with no usable note is skipped. Fills any gap from the lowest pins.
var SCENES = [
  { want: /sprinkler/i },
  { want: /aac|blockwork|masonry|\bblock\b/i },
  { want: /drywall|gypsum|glass/i },
  { want: /tile|screed|vitrified/i },
  { want: /ceiling/i },
  { want: /plumb|waterproof|standing water|water/i }
];
function pickFrames(readings, day, pins, n) {
  n = n || 6;
  var recs = dayReadings(readings, day).slice().sort(function (a, c) { return a.pin - c.pin; });
  var used = {}, frames = [];
  function noteAt(rec, re) {
    var best = null;
    for (var j = 0; j < rec.items.length; j++) {
      var it = rec.items[j];
      if (re && !re.test(it.work) && !(it.note && re.test(it.note))) continue;
      if (it.note && it.note.length > 3) { best = it; break; }
      if (!best) best = it;
    }
    return best;
  }
  for (var s = 0; s < SCENES.length && frames.length < n; s++) {
    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i];
      if (used[rec.pin]) continue;
      var it = noteAt(rec, SCENES[s].want);
      if (!it || !it.note) continue;
      used[rec.pin] = 1;
      frames.push(frameOf(rec, it, pins));
      break;
    }
  }
  for (var i2 = 0; i2 < recs.length && frames.length < n; i2++) {
    var rec2 = recs[i2]; if (used[rec2.pin]) continue;
    var it2 = noteAt(rec2, null); if (!it2 || !it2.note) continue;
    used[rec2.pin] = 1; frames.push(frameOf(rec2, it2, pins));
  }
  return frames.slice(0, n);
}
function sentence(s) {
  s = String(s || "").trim(); if (!s) return "";
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return /[.!?]$/.test(s) ? s : s + ".";
}
function frameOf(rec, it, pins) {
  var space = spaceOf(rec, pins) || ("Pin " + rec.pin);
  return { pin: rec.pin, space: space,
    lead: "Pin " + String(rec.pin).padStart(2, "0") + " · " + space,
    body: sentence(it.note) };
}

// ---- watch today and next: from the compare pack look ahead -------------
// bad and warn rows are the watch list. ok rows are the next slice.
function watchItems(comparePack, cap) {
  cap = cap || 3;
  var wk = (comparePack && comparePack.week) || [];
  var watch = wk.filter(function (w) { return w.tone === "bad" || w.tone === "warn"; });
  return watch.slice(0, cap).map(function (w) {
    return { name: w.name, note: w.note, tone: w.tone === "bad" ? "rose" : "sand" };
  });
}
function nextItems(comparePack, cap) {
  cap = cap || 5;
  var wk = (comparePack && comparePack.week) || [];
  return wk.slice(0, cap).map(function (w) {
    return { name: w.name, note: w.note, tone: w.tone === "bad" ? "rose" : (w.tone === "warn" ? "sand" : "sage") };
  });
}

root.TRACK_DIGEST = {
  TRADES: TRADES, tradeFor: tradeFor, dayReadings: dayReadings,
  floorRollup: floorRollup, pickFrames: pickFrames,
  watchItems: watchItems, nextItems: nextItems, sentence: sentence
};
if (typeof module !== "undefined") module.exports = root.TRACK_DIGEST;

})(typeof window !== "undefined" ? window : globalThis);
