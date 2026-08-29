#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/trend.js . THE SAME PIN, DAY AFTER DAY
//   node tools/trend.js [--item flooring_finish] [--area "Boardroom - 20 Pax"]
//
// One day says what the site looks like. Several days say which way it is
// going, and that is the only thing worth escalating on. A trade that was
// behind on Monday and is still behind on Friday, at the same pins, with
// nothing moved, is a different fact from a trade that slipped once.
//
//   . MOVEMENT IS MEASURED AT THE PIN, NOT IN THE TOTAL. A count that
//     stays at fifty while twenty pins finish and twenty more fall behind
//     is a site in motion reported as a site standing still.
//   . STALLED MEANS THE SAME PIN, THE SAME ITEM, EVERY WALK. Anything
//     less is noise, and a register full of noise gets ignored exactly
//     when it matters.
//   . A DAY NOT WALKED IS NOT A DAY WITH NOTHING WRONG. Gaps are named,
//     never counted as clean.
// ===================================================================
const fs = require("fs"), path = require("path");
const LOG = require(path.join(__dirname, "../platform/core/log.js"));
const OBS = require(path.join(__dirname, "../platform/core/observe.js"));
const CHK = require(path.join(__dirname, "../platform/signals/checklist.js"));

const args = process.argv.slice(2);
const arg = (n, d) => (args.indexOf(n) >= 0 ? args[args.indexOf(n) + 1] : d);
const ENGINE = path.join(__dirname, "../engines/skf");
const ONLY_ITEM = arg("--item", null), ONLY_AREA = arg("--area", null);

const events = LOG.read(ENGINE);
const frame = {};
events.filter(e => e.kind === "expectation.set").forEach(e => {
  const a = e.value.address || {}; if (a.pin == null) return;
  (frame[a.pin] = frame[a.pin] || {})[e.value.item] = e.value;
});
const seen = {};
// ---- PHOTOGRAPHS THAT ARE NOT THIS SITE --------------------------------
// A yes now beats a no, so one wrong frame can never be outvoted. The
// refusal list is what keeps that rule safe. See engines/skf/frames-refused.json.
const REFUSED = (() => { try {
  return new Set((JSON.parse(fs.readFileSync(path.join(ENGINE, "frames-refused.json"),
    "utf8")).frames || []).map(f => f.doc));
} catch (e) { return new Set(); } })();
events.filter(e => e.kind === "observation.record").forEach(e => {
  const a = e.value.address || {}; if (a.pin == null) return;
  if (REFUSED.has(e.value.doc)) return;
  // TWO FRAMES OF ONE PIN: the stronger reading stands, not the later one.
  const at = ((seen[a.day] = seen[a.day] || {})[a.pin] = seen[a.day][a.pin] || {});
  at[e.value.item] = OBS.stronger(at[e.value.item], e.value);
});
const days = Object.keys(seen).sort();
if (days.length < 2) { console.error("need at least two walks; the log has " + days.length); process.exit(1); }

const plan = fs.existsSync(path.join(ENGINE, "plan.json"))
  ? JSON.parse(fs.readFileSync(path.join(ENGINE, "plan.json"), "utf8")) : null;
const dueBy = {};
((plan && plan.plan && plan.plan.tasks) || []).filter(t => !t.gate).forEach(t => {
  const z = t.zone || "floor"; (dueBy[z] = dueBy[z] || {});
  if (!dueBy[z][t.code] || t.EF > dueBy[z][t.code]) dueBy[z][t.code] = t.EF;
});
const areaOf = {};
Object.keys(frame).forEach(p => { const any = Object.values(frame[p])[0];
  if (any && any.address) areaOf[p] = any.address.area; });
const dueFor = (area, item) => {
  const j = CHK.codesFor(item); if (!j.codes.length) return null;
  const here = dueBy[area] || {}, floor = dueBy.floor || {};
  const dates = j.codes.map(c => here[c] || floor[c]).filter(Boolean).sort();
  return dates.length ? { finish: dates[dates.length - 1] } : null;
};

// ---- every walk, judged the same way ----------------------------------
const byDay = {};
for (const day of days) {
  const pins = Object.keys(seen[day]).map(Number).sort((a, b) => a - b);
  byDay[day] = OBS.day(pins.map(p => OBS.pin(
    Object.values(frame[p] || {}), Object.values(seen[day][p] || {}),
    { pin: p, area: areaOf[p] || null, day,
      due: (item) => dueFor(areaOf[p], item),
      isCondition: (item) => { const j = CHK.codesFor(item); return !j.codes.length && !j.stage; },
      hiddenBy: (item) => CHK.hiddenBy(item) })));
  byDay[day].walked = pins.length;
}

const pad = (s, n) => String(s).padEnd(n);
console.log("WALKS ON THE LOG");
console.log("  day          pins   behind  unplanned   present  confirm-now");
days.forEach(d => { const x = byDay[d];
  console.log("  " + d + "  " + String(x.walked).padStart(5) +
    String(x.counts.behind || 0).padStart(9) + String(x.counts.unplanned || 0).padStart(11) +
    String((x.counts.present || 0) + (x.counts.on_the_way || 0)).padStart(10) +
    String(x.confirmNow.length).padStart(13) +
    (x.walked < 60 ? "   partial walk" : "")); });

// ---- what moved, pin by pin -------------------------------------------
// MOVEMENT IS MEASURED AT THE PIN. Two walks, the same pin, the same item.
const first = days[0], last = days[days.length - 1];
const at = (day) => { const m = {};
  byDay[day].behind.forEach(r => m[r.pin + "|" + r.item] = r); return m; };
const wasBehind = at(first), nowBehind = at(last);
const fixed = Object.keys(wasBehind).filter(k => !nowBehind[k]);
const fresh = Object.keys(nowBehind).filter(k => !wasBehind[k]);
const stuck = Object.keys(nowBehind).filter(k => wasBehind[k]);

console.log("\nBETWEEN " + first + " AND " + last);
console.log("  cleared    " + String(fixed.length).padStart(4) + "  pin-items that were behind and no longer are");
console.log("  new        " + String(fresh.length).padStart(4) + "  that were not behind and now are");
console.log("  STUCK      " + String(stuck.length).padStart(4) + "  behind on both walks, at the same pin");

// ---- stalled: the same pin, the same item, EVERY walk ------------------
const walked = {};
days.forEach(d => Object.keys(seen[d]).forEach(p => (walked[p] = walked[p] || []).push(d)));
const behindOn = {};
days.forEach(d => byDay[d].behind.forEach(r => (behindOn[r.pin + "|" + r.item] = behindOn[r.pin + "|" + r.item] || []).push(d)));
const stalled = Object.entries(behindOn)
  .filter(([k, ds]) => { const pin = k.split("|")[0];
    return ds.length >= 3 && ds.length === (walked[pin] || []).length; })
  .map(([k, ds]) => ({ pin: Number(k.split("|")[0]), item: k.split("|")[1],
    walks: ds.length, since: ds[0], area: areaOf[k.split("|")[0]] }))
  .filter(s => (!ONLY_ITEM || s.item === ONLY_ITEM) && (!ONLY_AREA || s.area === ONLY_AREA));

console.log("\nSTALLED — behind on EVERY walk of that pin, three walks or more");
if (!stalled.length) console.log("  nothing is stalled on this evidence");
else {
  const byItem = {};
  stalled.forEach(s => (byItem[s.item] = byItem[s.item] || []).push(s));
  Object.entries(byItem).sort((a, b) => b[1].length - a[1].length).forEach(([item, rows]) => {
    const areas = [...new Set(rows.map(r => r.area))];
    console.log("  " + pad(item, 18) + String(rows.length).padStart(3) + " pins, " +
      rows[0].walks + " walks, since " + rows[0].since);
    console.log("       " + areas.slice(0, 4).join(" · ").slice(0, 84) +
      (areas.length > 4 ? "  +" + (areas.length - 4) + " more areas" : ""));
  });
  console.log("\n  " + stalled.length + " pin-items have not moved across every walk that saw them.");
  console.log("  That is not a slip. That is work nobody has started.");
}

const gaps = days.filter(d => byDay[d].walked < 60);
if (gaps.length) console.log("\nPARTIAL WALKS (a day not walked is not a day with nothing wrong)\n  " +
  gaps.map(d => d + " (" + byDay[d].walked + " pins)").join(", "));

fs.writeFileSync(path.join(ENGINE, "trend.json"), JSON.stringify({ days, byDay:
  Object.fromEntries(days.map(d => [d, { walked: byDay[d].walked, counts: byDay[d].counts }])),
  fixed: fixed.length, fresh: fresh.length, stuck: stuck.length, stalled }, null, 1));
console.log("\n→ engines/skf/trend.json");
