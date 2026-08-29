#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/day.js . WHAT THE WALK SAW, AGAINST WHAT WAS DUE
//   node tools/day.js 2026-08-03
//
// The whole engine points here. The render said what each camera sees
// when its room is finished. The plan said when each trade is due in that
// room. The walk says what is there now. This puts the three together and
// reports one day.
//
// It is careful about two things above all:
//   . an item the frame said this view can NEVER resolve is not scored
//   . an item that is simply not built yet is not "behind" unless the
//     plan says it should have finished
// Everything else is arithmetic.
// ===================================================================
const fs = require("fs"), path = require("path");
const LOG = require(path.join(__dirname, "../platform/core/log.js"));
const OBS = require(path.join(__dirname, "../platform/core/observe.js"));
const CHK = require(path.join(__dirname, "../platform/signals/checklist.js"));

const args = process.argv.slice(2);
const DAY = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a));
const ENGINE = path.join(__dirname, "../engines/skf");
if (!DAY) { console.error("usage: node tools/day.js <YYYY-MM-DD>"); process.exit(2); }

const events = LOG.read(ENGINE);

// ---- each pin's finished-state frame ----------------------------------
const frame = {};
events.filter(e => e.kind === "expectation.set").forEach(e => {
  const a = e.value.address || {}; if (a.pin == null) return;
  (frame[a.pin] = frame[a.pin] || {})[e.value.item] = e.value;
});

// ---- what the walk saw that day ---------------------------------------
// ---- PHOTOGRAPHS THAT ARE NOT THIS SITE --------------------------------
// A yes now beats a no, so one wrong frame can never be outvoted. The
// refusal list is what keeps that rule safe. See engines/skf/frames-refused.json.
const REFUSED = (() => { try {
  return new Set((JSON.parse(fs.readFileSync(path.join(ENGINE, "frames-refused.json"),
    "utf8")).frames || []).map(f => f.doc));
} catch (e) { return new Set(); } })();
const seen = {};
events.filter(e => e.kind === "observation.record").forEach(e => {
  const a = e.value.address || {}; if (a.pin == null || a.day !== DAY) return;
  if (REFUSED.has(e.value.doc)) return;
  // TWO FRAMES OF ONE PIN: the stronger reading stands, not the later one.
  const at = (seen[a.pin] = seen[a.pin] || {});
  at[e.value.item] = OBS.stronger(at[e.value.item], e.value);
});
const pinsWalked = Object.keys(seen).map(Number).sort((a, b) => a - b);
if (!pinsWalked.length) { console.error("no walk recorded for " + DAY); process.exit(1); }

// ---- when each trade is due, per area ---------------------------------
const plan = fs.existsSync(path.join(ENGINE, "plan.json"))
  ? JSON.parse(fs.readFileSync(path.join(ENGINE, "plan.json"), "utf8")) : null;
const dueBy = {};    // area -> code -> finish
((plan && plan.plan && plan.plan.tasks) || []).filter(t => !t.gate).forEach(t => {
  const z = t.zone || "floor";
  (dueBy[z] = dueBy[z] || {});
  if (!dueBy[z][t.code] || t.EF > dueBy[z][t.code]) dueBy[z][t.code] = t.EF;
});
const areaOf = {};
Object.keys(frame).forEach(p => { const any = Object.values(frame[p])[0];
  if (any && any.address) areaOf[p] = any.address.area; });

// THE PLAN SPEAKS IN TASK CODES, THE CAMERA IN THINGS YOU CAN SEE. The
// join is declared in the checklist; where an item maps to several codes
// only the ones actually planned in THIS area count, and the latest of
// them is the date the item has to beat.
const dueFor = (area, item) => {
  const j = CHK.codesFor(item);
  if (!j.codes.length) return null;
  const here = dueBy[area] || {}, floor = dueBy.floor || {};
  const dates = j.codes.map(c => here[c] || floor[c]).filter(Boolean).sort();
  return dates.length ? { finish: dates[dates.length - 1] } : null;
};

const perPin = pinsWalked.map(p => OBS.pin(
  Object.values(frame[p] || {}), Object.values(seen[p] || {}),
  { pin: p, area: areaOf[p] || null, day: DAY,
    due: (item) => dueFor(areaOf[p], item),
    isCondition: (item) => { const j = CHK.codesFor(item); return !j.codes.length && !j.stage; },
    hiddenBy: (item) => CHK.hiddenBy(item) }));
const d = OBS.day(perPin);

// ---- report ------------------------------------------------------------
const pad = (s, n) => String(s).padEnd(n);
console.log("THE WALK OF " + DAY);
console.log("  " + pinsWalked.length + " pins of 81 walked" +
  (pinsWalked.length < 81 ? "   (not walked: " +
    Array.from({ length: 81 }, (_, i) => i + 1).filter(n => !seen[n]).length + " pins)" : ""));
console.log("  " + d.why);

console.log("\nVERDICTS");
Object.entries(d.counts).sort((a, b) => b[1] - a[1]).forEach(([k, n]) =>
  console.log("    " + pad(k, 14) + String(n).padStart(6)));

if (d.behind.length) {
  console.log("\nBEHIND — the frame wants it, the plan says it finished, the camera does not see it");
  const byItem = {};
  d.behind.forEach(r => (byItem[r.item] = byItem[r.item] || []).push(r));
  Object.entries(byItem).sort((a, b) => b[1].length - a[1].length).slice(0, 12).forEach(([item, rows]) =>
    console.log("    " + pad(item, 18) + String(rows.length).padStart(3) + " pins   due " +
      rows[0].dueOn + "   " + [...new Set(rows.map(r => r.area))].slice(0, 3).join(", ").slice(0, 46)));
} else console.log("\nNOTHING IS BEHIND on this day's evidence.");

if (d.unplanned.length) {
  console.log("\nUNPLANNED — it is there, and the finished room has no such thing");
  const byItem = {};
  d.unplanned.forEach(r => (byItem[r.item] = byItem[r.item] || []).push(r));
  Object.entries(byItem).sort((a, b) => b[1].length - a[1].length).slice(0, 8).forEach(([item, rows]) =>
    console.log("    " + pad(item, 18) + String(rows.length).padStart(3) + " pins   " +
      [...new Set(rows.map(r => r.area))].slice(0, 3).join(", ").slice(0, 50)));
  console.log("    Either the render is wrong or the work is. The engine does not choose.");
}

if (d.neverVisible.length) {
  console.log("\nNO CAMERA ON THIS FLOOR CAN EVER CONFIRM THESE (" + d.neverVisible.length + ")");
  console.log("    " + d.neverVisible.join(", "));
  console.log("    They need a named person's report, a DPR line or a GRN — not a photo.");
}

if (d.confirmNow.length) {
  console.log("\nCONFIRM TODAY — under way now, and the finished room hides it");
  const byItem = {};
  d.confirmNow.forEach(r => (byItem[r.item] = byItem[r.item] || []).push(r));
  Object.entries(byItem).sort((a, b) => b[1].length - a[1].length).slice(0, 10).forEach(([item, rows]) =>
    console.log("    " + pad(item, 18) + String(rows.length).padStart(3) + " pins   goes behind " +
      [...new Set(rows.flatMap(r => r.coveredBy || []))].join(", ").slice(0, 40)));
  console.log("    Once those close, no camera on this floor can ever see this work again.");
}

const moving = perPin.flatMap(p => p.rows).filter(r => r.verdict === "present" || r.verdict === "on_the_way");
if (moving.length) {
  console.log("\nWHAT IS ACTUALLY THERE (" + moving.length + " sightings)");
  const byItem = {};
  moving.forEach(r => (byItem[r.item] = byItem[r.item] || []).push(r));
  Object.entries(byItem).sort((a, b) => b[1].length - a[1].length).slice(0, 12).forEach(([item, rows]) => {
    const stages = [...new Set(rows.map(r => r.stage).filter(Boolean))];
    console.log("    " + pad(item, 18) + String(rows.length).padStart(3) + " pins   " + stages.join(", ").slice(0, 52));
  });
}

fs.writeFileSync(path.join(ENGINE, "day-" + DAY + ".json"),
  JSON.stringify({ day: DAY, pins: perPin, rollup: { ...d, findings: undefined } }, null, 1));
console.log("\n→ engines/skf/day-" + DAY + ".json");
