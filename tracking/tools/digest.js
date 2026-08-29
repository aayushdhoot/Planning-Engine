#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/digest.js . WHAT THE FLOOR SHOWED, ON ONE DAY
//   node tools/digest.js
//
// Builds digest.json.
//
// Every other screen on this engine is cumulative. The schedule says 18%,
// the material page says what is here, the delay register says what is
// behind — all of them true of the whole job and none of them able to
// answer the question a project manager asks every evening: WHAT MOVED
// TODAY.
//
// Twelve walks are on the log and the difference between two consecutive
// ones is the day's news. Nothing has ever shown it.
//
// WHAT A DAY IS WORTH READING FOR
//   . the movement, by trade, in one line each
//   . which pins carry that line, so the claim is checkable
//   . six frames worth publishing, chosen by the reading rather than by
//     whoever was building the deck
//   . the watch list — what to stand in front of on the next walk
//
// THE LAWS
//   . A DAY IS MEASURED AGAINST THE WALK BEFORE IT, never against the
//     start of the job. Two walks a week apart are not a day's work and
//     the row says how many days it covers.
//   . A PARTIAL ROUND IS NOT A QUIET DAY. Where a walk reached 38 of 81
//     pins the digest says so and refuses to read the difference as
//     progress or as its absence.
//   . EVERY LINE NAMES ITS PINS. A trade that moved says which positions
//     showed it, so anybody can go and look.
//   . NOTHING IS PUBLISHED THAT NOBODY PHOTOGRAPHED.
// ===================================================================
const fs = require("fs"), path = require("path");

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const S = read("schedule.json"), A = read("assess.json"), H = read("hse.json");
const L = read("layout.json"), PA = read("pairs.json"), M = read("manpower.json");

const days = (S && S.days) || [];
const between = (a, b) => a && b
  ? Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) : null;

// package -> trade, name, and THE CHECKLIST ITEMS ITS STEPS LOOK AT.
// A package is "Wall panelling" and the walk records "Wall cladding —
// laminate, veneer, fluted, fabric". Keying pins on the package name found
// nothing at all, and every trade line came out with no evidence behind it.
// The schedule already carries the link: each step declares what it sees.
const meta = {};
if (S) S.wbs.forEach(c => c.packages.forEach(k => {
  if (k.track === false) return;
  const sees = new Set();
  (k.tasks || []).forEach(t => (t.sees || []).forEach(x => sees.add(x)));
  meta[k.id] = { code: k.code, name: k.name, trade: k.trade || "other",
    sees: [...sees] }; }));

// ---- one walk day, against the walk before it ---------------------------
const digests = days.map((day, i) => {
  const pr = S.progress[day];
  const prev = i ? S.progress[days[i - 1]] : null;
  const prevDay = i ? days[i - 1] : null;

  // A DAY IS MEASURED AGAINST THE WALK BEFORE IT.
  const moved = [];
  if (prev) Object.keys(pr.byPkg).forEach(id => {
    if (!meta[id]) return;
    const y = pr.byPkg[id], x = prev.byPkg[id];
    if (!x || !y || x.actual == null || y.actual == null) return;
    if (y.actual === x.actual) return;
    moved.push(Object.assign({}, meta[id], { from: x.actual, to: y.actual,
      by: y.actual - x.actual, weight: y.weight || 0 }));
  });
  moved.sort((a, b) => b.by - a.by);

  // ---- one line per trade -------------------------------------------------
  const byTrade = {};
  moved.forEach(m => { const t = byTrade[m.trade] = byTrade[m.trade] ||
    { trade: m.trade, packages: [], by: 0, weight: 0 };
    t.packages.push(m); t.by += m.by * (m.weight || 0); t.weight += m.weight || 0; });
  const trades = Object.values(byTrade).map(t => Object.assign(t, {
    // weighted by what each package is worth, so one big mover does not
    // read the same as one small one
    points: t.weight ? Math.round(t.by / t.weight * 10) / 10 : 0,
    line: t.packages.slice(0, 3).map(p => p.name + " " + p.from + "→" + p.to + "%").join(", ") +
      (t.packages.length > 3 ? " and " + (t.packages.length - 3) + " more" : ""),
  })).sort((a, b) => (b.weight * b.points) - (a.weight * a.points));

  // ---- which pins carry the line -----------------------------------------
  // EVERY LINE NAMES ITS PINS.
  const pinsFor = {};
  if (A) Object.keys(A.pins).forEach(k => { const P = A.pins[k];
    const h = P.history && P.history[day]; if (!h) return;
    (P.rows || []).forEach(r => { if (!r.saw || r.saw.answer !== "yes") return;
      (pinsFor[r.item] = pinsFor[r.item] || []).push(P.pin); }); });
  moved.forEach(m => { const seen = new Set();
    (m.sees || []).forEach(it => (pinsFor[it] || []).forEach(n => seen.add(n)));
    m.pins = [...seen].sort((a, b) => a - b); });
  trades.forEach(t => { const seen = new Set();
    t.packages.forEach(p => (p.pins || []).forEach(n => seen.add(n)));
    t.pins = [...seen].sort((a, b) => a - b).slice(0, 14); });

  // ---- six frames worth publishing ---------------------------------------
  // NOTHING IS PUBLISHED THAT NOBODY PHOTOGRAPHED. Chosen by the reading:
  // the places that moved most, then the places furthest from the render.
  const frames = [];
  if (PA) {
    const shot = (n) => PA.pins.find(p => p.pin === n && p.photoDays.indexOf(day) >= 0);
    const movers = new Set();
    trades.slice(0, 4).forEach(t => (t.pins || []).slice(0, 2).forEach(n => movers.add(n)));
    // THE FRAME THAT DAY, LOOKED UP — never the latest frame's name with the
    // date swapped into it. That trick assumed every photograph of a pin is
    // named the same way bar the date, and a retake breaks it: pin 1 is
    // P01_2026-08-10_r1.jpg on 10 Aug, so 3 Aug was published as
    // P01_2026-08-03_r1.jpg, a file that has never existed.
    const relOn = (p) => (p.shots && p.shots[day]) || null;
    [...movers].forEach(n => { const p = shot(n); if (p && relOn(p) && frames.length < 6)
      frames.push({ pin: n, area: p.area, why: "moved this walk",
        photo: relOn(p), render: p.render ? p.render.rel : null }); });
    PA.worst.forEach(w => { if (frames.length >= 6 || frames.some(f => f.pin === w.pin)) return;
      const p = shot(w.pin); if (!p || !relOn(p)) return;
      frames.push({ pin: w.pin, area: w.area,
        why: w.missing + " things the render asks for are not there",
        photo: relOn(p), render: p.render ? p.render.rel : null }); });
  }

  // ---- what to stand in front of next time -------------------------------
  const watch = [];
  if (A) { const unread = [];
    Object.keys(A.pins).forEach(k => { const P = A.pins[k];
      if (!(P.history && P.history[day])) unread.push(P.pin); });
    if (unread.length) watch.push({ what: unread.length + " pins were not read on this round",
      detail: "pins " + unread.slice(0, 14).join(", ") + (unread.length > 14 ? " and more" : ""),
      kind: "coverage" }); }
  const stalled = Object.keys(pr.byPkg).filter(id => meta[id])
    .filter(id => { const y = pr.byPkg[id]; return y.actual > 0 && y.actual < 95 &&
      (!prev || !prev.byPkg[id] || prev.byPkg[id].actual === y.actual); })
    .map(id => meta[id]).slice(0, 8);
  if (stalled.length && prev) watch.push({
    what: stalled.length + " packages under way that did not move since " + prevDay,
    detail: stalled.map(x => x.name).join(", "), kind: "stalled" });
  const hd = H && H.days.find(d => d.day === day);
  if (hd && hd.items.ppe.rate != null && hd.items.ppe.rate < 60) watch.push({
    what: "PPE was visible in only " + hd.items.ppe.rate + "% of the frames showing people",
    detail: hd.framesWithPeople + " frames had somebody in them", kind: "safety" });

  return {
    day, i, prevDay, coversDays: prevDay ? between(prevDay, day) : null,
    overall: pr.overall.actual,
    // ROUND ONCE, AT THE END. This used to be the difference of the two
    // published whole per cents, which on a job moving a third of a point
    // between walks reported nothing had happened on days when eight packages
    // moved. Both sides now come off the unrounded roll-up and the answer is
    // rounded to a tenth — the first place the movement on this project is
    // actually visible.
    moveOverall: prev && pr.overall.actualRaw != null && prev.overall.actualRaw != null
      ? Math.round((pr.overall.actualRaw - prev.overall.actualRaw) * 10) / 10 : null,
    overallRaw: pr.overall.actualRaw == null ? null
      : Math.round(pr.overall.actualRaw * 100) / 100,
    pinsWalked: pr.pinsWalked, pinsTotal: pr.pinsTotal,
    coverage: pr.coverage, confidence: pr.confidence,
    // A PARTIAL ROUND IS NOT A QUIET DAY.
    partial: pr.coverage < 90,
    partialWhy: pr.coverage < 90
      ? "this round reached " + pr.pinsWalked + " of " + pr.pinsTotal + " pins, so what did not " +
        "move may simply not have been looked at" : null,
    moved, trades, frames, watch,
    safety: hd ? { ppe: hd.items.ppe.rate, of: hd.framesWithPeople,
      hotWork: hd.items.hot_work.seen } : null,
    labour: M && M.actual.byDay[day]
      ? { labour: M.actual.byDay[day].labour, staff: M.actual.byDay[day].staff } : null,
  };
});

const latest = digests[digests.length - 1] || null;
const out = {
  builtAt: new Date().toISOString(),
  days, latest: latest ? latest.day : null,
  digests,
  why: "every other screen here is cumulative. This is the difference between one walk and the one " +
       "before it — the only thing on the engine that answers what moved today. A round that " +
       "reached half the pins says so, because what did not move may simply not have been looked at",
};
fs.writeFileSync(path.join(ENGINE, "digest.json"), JSON.stringify(out));

console.log("\n  THE DAILY DIGEST  ·  " + days.length + " walks");
if (latest) {
  console.log("\n  " + latest.day + (latest.prevDay ? "  against " + latest.prevDay +
    " (" + latest.coversDays + " days)" : "") + "  ·  " + latest.overall + "%" +
    (latest.moveOverall != null ? " (" + (latest.moveOverall >= 0 ? "+" : "") + latest.moveOverall + ")" : ""));
  console.log("    " + latest.pinsWalked + " of " + latest.pinsTotal + " pins · " +
    latest.confidence + " confidence" + (latest.partial ? "  PARTIAL ROUND" : ""));
  console.log("\n  WHAT MOVED, BY TRADE");
  latest.trades.forEach(t => { console.log("    " + t.trade.padEnd(12) + t.line);
    if (t.pins.length) console.log("      pins " + t.pins.join(", ")); });
  if (latest.safety) console.log("\n  SAFETY   PPE " + latest.safety.ppe + "% of " +
    latest.safety.of + " frames with people · hot work in " + latest.safety.hotWork);
  if (latest.labour) console.log("  LABOUR   " + latest.labour.labour + " on the tools, " +
    latest.labour.staff + " staff");
  console.log("\n  FRAMES TO PUBLISH: " + latest.frames.length);
  latest.frames.forEach(f => console.log("    pin " + String(f.pin).padStart(2) + "  " +
    String(f.area || "").slice(0, 28).padEnd(30) + f.why));
  console.log("\n  WATCH LIST");
  latest.watch.forEach(w => console.log("    " + w.what + "\n      " + String(w.detail).slice(0, 90)));
}
console.log("\n→ engines/skf/digest.json\n");
