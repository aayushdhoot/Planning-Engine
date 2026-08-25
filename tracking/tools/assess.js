#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/assess.js . WHAT THE WALK ACTUALLY SAW, PIN BY PIN
//   node tools/assess.js
//
// Sixty three thousand observations are on this log. Six readers spent an
// hour on the 6 August round alone, judging eighty one photographs item by
// item, and every judgement carries the sentence explaining what was seen.
// None of it was visible anywhere in the app. It survived only as a per
// cent on the programme.
//
// That is the wrong shape. When the number says ducting is 70%, the next
// question is always WHICH ROOMS AND WHAT DID YOU SEE, and the answer was
// "open the JSON". This builds the file that answers it.
//
// THE LAWS
//   . THE FRAME AND THE WALK SIT SIDE BY SIDE. What the finished room is
//     meant to hold, and what was there on the day. A reading is only ever
//     meaningful against its own expectation.
//   . THE REASON TRAVELS. Every judgement keeps the sentence that justifies
//     it. A verdict without its evidence is an opinion.
//   . THE LATEST WALK IN FULL, THE REST IN OUTLINE. Six point seven
//     megabytes of history in one file is a page nobody waits for. The walk
//     you are looking at comes whole; the ones behind it come as counts,
//     and the server hands over any older day on request.
//   . A PIN WITH NO FRAME IS NAMED. Five positions on this floor were
//     photographed and read and can never score, because no render was
//     delivered for them. That is a fact about the tracking set and it
//     belongs on the page, not buried.
// ===================================================================
const fs = require("fs"), path = require("path");
const LOG = require(path.join(__dirname, "../platform/core/log.js"));
const OBS = require(path.join(__dirname, "../platform/core/observe.js"));
const CHK = require(path.join(__dirname, "../platform/signals/checklist.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const OUT = path.join(ENGINE, "assess.json");
const events = LOG.read(ENGINE);

// ---- the frame: what each pin's finished room holds --------------------
const frame = {}, area = {};
events.filter(e => e.kind === "expectation.set").forEach(e => {
  const a = e.value.address || {}; if (a.pin == null) return;
  (frame[a.pin] = frame[a.pin] || {})[e.value.item] =
    { answer: e.value.answer, stage: e.value.stage || null, why: e.value.why || null };
  if (a.area) area[a.pin] = a.area;
});

// ---- the walks ---------------------------------------------------------
// ---- PHOTOGRAPHS THAT ARE NOT THIS SITE --------------------------------
// A yes now beats a no, so one wrong frame can never be outvoted. The
// refusal list is what keeps that rule safe. See engines/skf/frames-refused.json.
const REFUSED = (() => { try {
  return new Set((JSON.parse(fs.readFileSync(path.join(ENGINE, "frames-refused.json"),
    "utf8")).frames || []).map(f => f.doc));
} catch (e) { return new Set(); } })();
const walk = {};                        // day -> pin -> item -> judgement
events.filter(e => e.kind === "observation.record").forEach(e => {
  const a = e.value.address || {}; if (a.pin == null || !a.day) return;
  if (REFUSED.has(e.value.doc)) return;
  // TWO FRAMES OF ONE PIN: the stronger reading stands, not the later one.
  const at = ((walk[a.day] = walk[a.day] || {})[a.pin] = walk[a.day][a.pin] || {});
  at[e.value.item] = OBS.stronger(at[e.value.item], { answer: e.value.answer,
    stage: e.value.stage || null, why: e.value.why || null, doc: e.value.doc || null });
  if (!area[a.pin] && a.area) area[a.pin] = a.area;
});
const days = Object.keys(walk).sort();
const latest = days[days.length - 1] || null;

// how much floor each pin answers for, so the page can say why one matters
const sqft = {};
try {
  const A = JSON.parse(fs.readFileSync(path.join(ENGINE, "areas.json"), "utf8")).areas || [];
  A.filter(a => a.named && (a.pins || []).length).forEach(a =>
    a.pins.forEach(p => sqft[Number(p)] = Math.round((a.sqft || 0) / a.pins.length)));
} catch (e) {}

// ---- one pin ------------------------------------------------------------
const allPins = [...new Set([].concat(Object.keys(frame), Object.keys(walk[latest] || {}))
  .map(Number))].sort((a, b) => a - b);

const pins = {};
for (const pin of allPins) {
  const f = frame[pin] || null;
  const seen = (walk[latest] || {})[pin] || {};
  // A ROW PER ITEM, JOINING THE TWO. Ordered the way a floor is built, so
  // the page reads top to bottom the way the work happened.
  const rows = [];
  const items = [...new Set([].concat(Object.keys(f || {}), Object.keys(seen)))];
  for (const item of items) {
    const it = CHK.BY_ID[item]; if (!it) continue;
    const e = (f || {})[item] || null, o = seen[item] || null;
    rows.push({ item, name: it.name || item, ladder: it.ladder || "buildup",
      expected: e ? { answer: e.answer, stage: e.stage } : null,
      // WHY THE FRAME SAYS WHAT IT SAYS matters as much as the walk's reason.
      // "no" from a finished render means the room has none of this — unless
      // it is a concealed service, where it means the ceiling hides it.
      expectedWhy: e ? e.why : null,
      concealed: (it.ladder === "service"),
      saw: o ? { answer: o.answer, stage: o.stage } : null,
      why: o ? o.why : null,
      // the one thing a person reading this page is deciding
      scored: !!(o && o.answer !== "cannot_tell" &&
                 (!e || e.answer !== "no" || it.ladder === "service")),
    });
  }
  const order = { buildup: 0, service: 1, finish: 2, fitment: 3, condition: 4 };
  rows.sort((a, b) => (order[a.ladder] - order[b.ladder]) || a.name.localeCompare(b.name));

  const history = {};
  for (const d of days) {
    const s = (walk[d] || {})[pin]; if (!s) continue;
    let yes = 0, no = 0, cant = 0;
    Object.values(s).forEach(v => v.answer === "yes" ? yes++ : v.answer === "no" ? no++ : cant++);
    history[d] = { yes, no, cannot: cant, judged: yes + no + cant };
  }

  pins[pin] = {
    pin, area: area[pin] || null, sqft: sqft[pin] || null,
    // A PIN WITH NO FRAME CAN NEVER SCORE, and the page has to say so
    framed: !!f,
    why: f ? null : "no design render was delivered for this position, so nothing " +
                    "seen here can ever be scored against a finished state",
    rows, history,
    walkedOn: Object.keys(history).sort(),
  };
}

const out = {
  builtAt: new Date().toISOString(),
  days, latest,
  counts: {
    pins: allPins.length,
    framed: allPins.filter(p => frame[p]).length,
    unframed: allPins.filter(p => !frame[p]),
    observations: days.reduce((t, d) =>
      t + Object.values(walk[d] || {}).reduce((n, s) => n + Object.keys(s).length, 0), 0),
    onLatest: Object.values(walk[latest] || {}).reduce((n, s) => n + Object.keys(s).length, 0),
  },
  pins,
};
fs.writeFileSync(OUT, JSON.stringify(out));

const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log("WHAT THE WALK SAW, PIN BY PIN");
console.log("  pins              " + out.counts.pins + "   with a frame " + out.counts.framed +
  (out.counts.unframed.length ? "   NO FRAME: " + out.counts.unframed.join(", ") : ""));
console.log("  walk days         " + days.length + "   latest " + latest);
console.log("  observations      " + out.counts.observations.toLocaleString("en-IN") +
  "   on the latest walk " + out.counts.onLatest.toLocaleString("en-IN"));
console.log("  file              " + kb + " KB");
console.log("\n→ engines/skf/assess.json");
