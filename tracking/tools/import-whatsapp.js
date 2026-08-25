#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/import-whatsapp.js . THE DPRs NOBODY EVER FILED
//   node tools/import-whatsapp.js "<path to _chat.txt>" [--dry]
//
// A site's daily manpower report is posted to a WhatsApp group every morning
// and then it is gone. Nobody files it, nobody adds it up, and the one number
// a programme most wants to be measured against — how many people actually
// turned up — spends its whole life scrolling past a phone.
//
// This reads the group export and gets every one of them onto the log.
//
// WHAT A DAY LOOKS LIKE IN THAT CHAT
//   A single message can carry TWO reports: the day shift, and a night shift
//   block appended under "Shift: Night Shift" with its own date. They are the
//   same floor on the same day and both are people who turned up, so they are
//   added — and the count of shifts is kept, because a day that reported one
//   shift is not the same evidence as a day that reported two.
//
// THE LAWS
//   . THE REPORT'S OWN DATE WINS, never the message timestamp. A report
//     posted at 08:12 is almost always yesterday's.
//   . A GRAND TOTAL IS A CHECK. Every block states one; where the rows do
//     not add to it, the difference is kept and reported, not smoothed.
//   . SUPERVISION IS NOT A CREW. PM, SPM, SUP and EHS are on the floor and
//     are not a trade, so they are counted apart from the labour the demand
//     curve is made of.
//   . NOTHING IS OVERWRITTEN SILENTLY. A day already on the log is only
//     replaced when this import has more shifts for it than the log does.
//   . A STATED DATE FAR FROM ITS POSTING DATE IS NOT BELIEVED. The report's
//     own date wins over the clock, which is right — and is exactly why a
//     month typed wrong lands a month away and nobody notices. A block
//     claiming a day more than a week before it was posted, or any day after
//     it was posted, is held for a person instead of filed.
//   . ONLY A PERSON MAY OVERRULE A STATED DATE, in dpr-corrections.json, one
//     block at a time, with the evidence that identified it. Nothing here
//     guesses that 07 meant 08.
// ===================================================================
const fs = require("fs"), path = require("path");
const DPR = require(path.join(__dirname, "../platform/kb/dpr.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const src = process.argv[2];
const dry = process.argv.indexOf("--dry") >= 0;
// A merge cannot unfile anything. When a correction moves a block off the day
// it was wrongly filed under, that day has to be built again from nothing or
// the bad reading simply stays. --rebuild says so out loud and prints what it
// dropped, rather than a merge quietly keeping both.
const rebuild = process.argv.indexOf("--rebuild") >= 0;
if (!src) { console.error("usage: node tools/import-whatsapp.js <_chat.txt> [--dry]"); process.exit(1); }

const raw = fs.readFileSync(src, "utf8").replace(/‎/g, "");

// ---- what a person has already ruled on ---------------------------------
const CORR = (() => { try {
  return JSON.parse(fs.readFileSync(path.join(ENGINE, "dpr-corrections.json"), "utf8")).corrections || [];
} catch (e) { return []; } })();
const usedCorr = new Set();
const correctionFor = (postedOn, stated, night) => CORR.find(c =>
  c.postedOn === postedOn && c.stated === stated &&
  (c.shift == null || c.shift === (night ? "night" : "day")));

// HOW FAR A REPORT MAY REASONABLY LAG. This group has never filed one more
// than two days late; a week is generous and still catches a wrong month by
// three weeks. A date AFTER the posting date is not a lag at all.
const LAG_MAX = 7, AHEAD_MAX = 0;
const gapDays = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

// ---- one message per post ------------------------------------------------
// [05/07/26, 12:11:00] Vishal SKF Pune SPM: ...
const HEAD = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s*[\d:apm\s]+\]\s*([^:]{1,60}):\s?/i;
const messages = [];
raw.split(/\r?\n/).forEach(line => {
  const m = line.match(HEAD);
  if (m) messages.push({ postedBy: m[4].trim(),
    postedOn: (m[3].length === 2 ? "20" + m[3] : m[3]) + "-" +
              String(+m[2]).padStart(2, "0") + "-" + String(+m[1]).padStart(2, "0"),
    text: line.slice(m[0].length) });
  else if (messages.length) messages[messages.length - 1].text += "\n" + line;
});

// ---- a message can hold more than one report ------------------------------
// THE GRAND TOTAL IS WHERE A REPORT ENDS, and nothing else is. Splitting on
// the date line instead looked reasonable and was wrong twice over: a report
// that carries no date of its own got swallowed into the next one that did,
// and everything below the total — "Block work & plastering in washroom",
// "Ply panelling of columns" — was still being read for numbers. Between them
// they turned a floor of 76 into a floor of 98.
const ENDS = /\b(grand\s*total|total\s*manpower)\b/i;
// AND A REPORT BEGINS AT ITS OWN HEADING. Cutting only at the total left the
// night block starting where the day block's total ended, so it inherited the
// whole of the day's narrative — "Duct Insulation & Duct hanging", "Ply
// panelling of columns" — and read seven more men off it every single day.
const STARTS = /^(shift\s*[:\-]|manpower\s+deployment|daily\s+manpower|.*daily\s+manpower)/i;
function blocks(text) {
  const lines = text.split(/\r?\n/);
  const bare = (l) => l.replace(/[*_~`]/g, "").trim();
  const out = [];
  let from = 0;
  lines.forEach((l, i) => {
    if (!ENDS.test(bare(l))) return;
    let body = lines.slice(from, i + 1);
    from = i + 1;
    const h = body.findIndex(b => STARTS.test(bare(b)));
    if (h > 0) body = body.slice(h);
    const t = body.join("\n");
    // the date line inside this block, if it has one
    let day = null;
    for (const b of body) { const s = bare(b);
      if (/^(date|dt)\b/i.test(s) && DPR.dateIn(s)) { day = DPR.dateIn(s); break; } }
    out.push({ text: t, day, night: /night\s*shift/i.test(t) });
  });
  return out;
}

// ---- read every one -------------------------------------------------------
const byDay = {};              // day -> merged reading
const problems = [], unknownLabels = {}, held = [], corrected = [];
let blockCount = 0, readCount = 0;

messages.forEach(msg => {
  if (!/manpower|man power|grand total|total manpower/i.test(msg.text)) return;
  const bs = blocks(msg.text);
  // A BLOCK WITH NO DATE TAKES ITS SIBLING'S, NOT THE CLOCK'S. Half of these
  // reports carry no date at all — the day shift is posted bare and the night
  // block underneath it states one. That is the same day, written down once.
  // Where no block in the message states a date, nothing is assumed: the
  // posting time is not evidence, because a report filed at 08:12 is usually
  // yesterday's and a report filed at noon is usually today's.
  const stated = [...new Set(bs.map(b => b.day).filter(Boolean))];
  const borrowed = stated.length === 1 ? stated[0] : null;
  bs.forEach(b => {
    blockCount++;
    if (!b.day && !borrowed) {
      // HELD, NOT DISCARDED. This is a real headcount somebody typed out; all
      // it is missing is the one line saying which day it is for. Thrown away
      // it is gone, and the engine reports a silence the site did not have.
      held.push({ postedOn: msg.postedOn, night: b.night, stated: null, lag: null,
        total: (b.text.match(/(?:grand\s*)?total[^0-9]{0,12}([0-9]{1,3})/i) || [])[1] || null,
        why: "no date anywhere in the message, and a posting time is not a report date",
        preview: b.text.split("\n").filter(x => x.trim()).slice(0, 4).join(" · ").slice(0, 160) });
      problems.push({ postedOn: msg.postedOn, night: b.night,
        why: "no date anywhere in the message, and a posting time is not a report date" });
      return;
    }
    // ---- IS THE DATE IT STATES CREDIBLE FROM WHERE IT WAS POSTED? --------
    // Only for a date the block states itself. A borrowed one already came
    // from a sibling that passed this same test, and the posting date is
    // never used to derive a day — only to sanity-check one.
    let want = b.day || borrowed;
    if (b.day && msg.postedOn) {
      const lag = gapDays(b.day, msg.postedOn);
      const fix = correctionFor(msg.postedOn, b.day, b.night);
      if (fix) { usedCorr.add(fix.postedOn + "|" + fix.stated + "|" + (fix.shift || "*"));
        want = fix.actual; corrected.push({ postedOn: msg.postedOn, from: b.day,
          to: fix.actual, night: b.night, why: fix.why }); }
      else if (lag > LAG_MAX || lag < -AHEAD_MAX) {
        held.push({ postedOn: msg.postedOn, night: b.night, stated: b.day,
          lag, total: (b.text.match(/total[^0-9]{0,12}([0-9]{1,3})/i) || [])[1] || null,
          why: lag > 0
            ? "it states " + b.day + ", which is " + lag + " days before it was posted — " +
              "beyond the " + LAG_MAX + " days a late report can reasonably lag, so the month " +
              "is more likely wrong than the report"
            : "it states " + b.day + ", which is after the day it was posted",
          preview: b.text.split("\n").filter(x => x.trim()).slice(0, 4).join(" · ").slice(0, 160) });
        problems.push({ postedOn: msg.postedOn, night: b.night, day: b.day,
          why: "stated date is " + Math.abs(lag) + " days " + (lag > 0 ? "before" : "after") +
               " the posting date — held for a person, not filed" });
        return;
      }
    }
    const r = DPR.parse(b.text, { day: want });
    if (!r.ok) { problems.push({ postedOn: msg.postedOn, why: r.why || "unreadable",
      night: b.night }); return; }
    if (!b.day) r.dateBorrowed = true;
    readCount++;
    r.unknown.forEach(u => unknownLabels[u.label] = (unknownLabels[u.label] || 0) + 1);

    const d = byDay[r.day] = byDay[r.day] || { day: r.day, byTrade: {}, labour: 0,
      staff: 0, total: 0, unplaced: 0, unknown: [], shifts: [], stated: 0,
      rows: 0, disagreements: [] };
    // A DAY IS THE SUM OF ITS SHIFTS. The same shift posted twice is not.
    const tag = b.night ? "night" : "day";
    if (d.shifts.indexOf(tag) >= 0) {
      problems.push({ postedOn: msg.postedOn, day: r.day,
        why: "a second " + tag + " shift report for the same date — kept the first" });
      return;
    }
    d.shifts.push(tag);
    Object.keys(r.byTrade).forEach(t => d.byTrade[t] = (d.byTrade[t] || 0) + r.byTrade[t]);
    d.labour += r.labour; d.staff += r.staff; d.total += r.total;
    d.unplaced += r.unplaced; d.unknown = d.unknown.concat(r.unknown);
    d.rows += r.rows.length;
    if (r.stated != null) d.stated += r.stated;
    if (r.disagrees) d.disagreements.push({ shift: tag, stated: r.stated, rows: r.total });
  });
});

const days = Object.keys(byDay).sort();

// ---- what it found --------------------------------------------------------
console.log("\n  READ " + readCount + " REPORTS OUT OF " + blockCount + " BLOCKS  ·  " +
  days.length + " days from " + (days[0] || "—") + " to " + (days[days.length - 1] || "—"));
console.log("\n  DAY          LABOUR  STAFF  TOTAL  SHIFTS  TRADES");
days.forEach(d => { const x = byDay[d];
  console.log("  " + d + "  " + String(x.labour).padStart(6) + String(x.staff).padStart(7) +
    String(x.total).padStart(7) + "  " + x.shifts.join("+").padEnd(10) +
    Object.keys(x.byTrade).sort((a, b) => x.byTrade[b] - x.byTrade[a])
      .map(t => t + " " + x.byTrade[t]).join(" · ")); });

const gaps = (() => {
  if (days.length < 2) return [];
  const out = [], A = Date.parse(days[0] + "T00:00:00Z"), B = Date.parse(days[days.length - 1] + "T00:00:00Z");
  for (let t = A; t <= B; t += 86400000) { const iso = new Date(t).toISOString().slice(0, 10);
    if (!byDay[iso] && new Date(t).getUTCDay() !== 0) out.push(iso); }
  return out;
})();
if (gaps.length) console.log("\n  NO REPORT ON " + gaps.length + " working day" +
  (gaps.length === 1 ? "" : "s") + " inside that range: " + gaps.join(" "));

const dis = days.filter(d => byDay[d].disagreements.length);
if (dis.length) { console.log("\n  THE REPORT'S OWN TOTAL DISAGREES WITH ITS ROWS on " + dis.length + " day(s):");
  dis.forEach(d => byDay[d].disagreements.forEach(x =>
    console.log("    " + d + " " + x.shift + " shift: it says " + x.stated + ", its rows add to " + x.rows))); }

const uk = Object.keys(unknownLabels);
if (uk.length) { console.log("\n  " + uk.length + " LABEL(S) THIS ENGINE COULD NOT PLACE IN A TRADE " +
  "— counted on the floor, not on any trade curve:");
  uk.sort((a, b) => unknownLabels[b] - unknownLabels[a]).forEach(l =>
    console.log("    " + String(unknownLabels[l]).padStart(3) + "x  " + l)); }

if (problems.length) { console.log("\n  " + problems.length + " BLOCK(S) NOT READ:");
  problems.slice(0, 12).forEach(p => console.log("    posted " + p.postedOn +
    (p.day ? " for " + p.day : "") + ": " + p.why)); }

if (dry) { console.log("\n  --dry, nothing written\n"); process.exit(0); }

// ---- onto the log ---------------------------------------------------------
const f = path.join(ENGINE, "dpr.json");
let prior = {}; try { prior = JSON.parse(fs.readFileSync(f, "utf8")); } catch (e) {}
const before = prior;
// --rebuild: start from nothing, so a day that only ever held a misfiled
// block disappears instead of surviving a merge that can only ever add.
if (rebuild) prior = {};
let added = 0, replaced = 0, kept = 0;
days.forEach(d => {
  const x = byDay[d];
  const was = prior[d];
  // NOTHING IS OVERWRITTEN SILENTLY. Somebody may have pasted a day by hand
  // with more in it than the chat carried.
  if (was && (was.shifts || []).length > x.shifts.length) { kept++; return; }
  if (was) replaced++; else added++;
  prior[d] = { day: d, byTrade: x.byTrade, total: x.total, labour: x.labour,
    staff: x.staff, unplaced: x.unplaced, unknown: x.unknown,
    stated: x.stated || null, disagrees: x.disagreements.length > 0,
    shifts: x.shifts, rows: x.rows,
    source: "whatsapp:" + path.basename(src), pastedAt: new Date().toISOString() };
});
fs.writeFileSync(f, JSON.stringify(prior, null, 1));

// ---- THE BLOCKS THAT DID NOT GET IN --------------------------------------
// A refusal that only ever prints to a terminal is a refusal nobody acts on.
// This is the file the action register reads, so every headcount this import
// would not file reaches a person as a question with the reading attached.
fs.writeFileSync(path.join(ENGINE, "dpr-held.json"), JSON.stringify({
  builtAt: new Date().toISOString(), source: path.basename(src),
  counts: { held: held.length, corrected: corrected.length },
  why: "Each of these is a headcount somebody typed out that this import would " +
       "not file, because the day it belongs to could not be established. None " +
       "of them is lost and none of them is guessed at.",
  held, corrected,
}, null, 1));

console.log("\n  → dpr.json  " + added + " added, " + replaced + " replaced, " + kept +
  " left alone (the log already had more shifts)");
if (rebuild) {
  const gone = Object.keys(before).filter(d => !prior[d]);
  const moved = Object.keys(prior).filter(d => before[d] &&
    JSON.stringify(before[d].byTrade) !== JSON.stringify(prior[d].byTrade));
  console.log("  → REBUILT from nothing" +
    (gone.length ? "\n     dropped entirely: " + gone.join(", ") : "") +
    (moved.length ? "\n     changed:          " + moved.join(", ") : ""));
}
if (corrected.length) { console.log("\n  " + corrected.length +
  " BLOCK(S) RE-DATED by a person's ruling in dpr-corrections.json:");
  corrected.forEach(c => console.log("    posted " + c.postedOn + ": " + c.from +
    " → " + c.to + " (" + (c.night ? "night" : "day") + ")")); }
const unused = CORR.filter(c => !usedCorr.has(c.postedOn + "|" + c.stated + "|" + (c.shift || "*")));
if (unused.length) { console.log("\n  " + unused.length + " CORRECTION(S) MATCHED NOTHING in this " +
  "export — the block moved, or the correction is wrong:");
  unused.forEach(c => console.log("    " + c.postedOn + " stated " + c.stated)); }
console.log("  → dpr-held.json  " + held.length + " block(s) held for a person\n");
