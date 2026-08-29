#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/hse.js . SAFETY, FROM THE SAME PHOTOGRAPHS
//   node tools/hse.js
//
// Every walk already answers six safety questions at every pin — PPE,
// access, edge protection, housekeeping, hot work, and whether anybody is
// working there at all. Twelve walk days, a thousand answers, and not one
// of them has ever been on a screen.
//
// THE DENOMINATOR IS THE WHOLE POINT
//   The checklist asks "is PPE in use" of a PHOTOGRAPH. A "no" is usually
//   "there is nobody in this frame", not "somebody is working bareheaded".
//   Read against every pin, PPE looks like 27% and the number is a libel.
//   Read against the frames that actually show people at work, it is the
//   figure a safety officer would recognise.
//
//   So two numbers are carried and both are named: how many frames showed
//   it, and how many of the frames WITH PEOPLE IN THEM showed it. Only the
//   second is ever called a rate.
//
// THE LAWS
//   . A FLAG IS PRESENT BECAUSE A PHOTOGRAPH SHOWED IT. Absence is not
//     safety; it is absence.
//   . NOTHING IS CLOSED WITHOUT A DATED CLOSURE. With no HSE log on this
//     project every flag reads open, and the page says that is why.
//   . A RATE IS ONLY EVER OUT OF THE FRAMES THAT COULD HAVE SHOWN IT.
// ===================================================================
const fs = require("fs"), path = require("path");
const HSE = (() => { try { return require(path.join(__dirname,
  "../platform/track/project/skf_hse.js")); } catch (e) { return { flags: [], good: [], categories: [] }; } })();

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const mp = read("manpower.json");
const site = (mp && mp.site) || { days: [], byDay: {} };

// NOT EVERY "YES" MEANS THE SAME THING, and dividing them all by the same
// denominator produced housekeeping at 557%. Three things differ per item:
// what a yes actually asserts, what it can honestly be divided by, and
// whether the result deserves to be called a rate at all.
//
//   ppe        a yes says protective equipment was IN USE. Only meaningful
//              where somebody is in the frame, and it is a compliance rate.
//   hot_work   a yes says welding or cutting was HAPPENING. Also only
//              meaningful where people are — but it is an activity count,
//              never a safety score.
//   the rest   a yes says the reader could see and assess the condition.
//              What "assessable" means is not written down anywhere on
//              this project, so these carry counts and no rate at all.
const ITEMS = [
  { id: "ppe", name: "PPE in use", ask: "helmet, shoes, harness, gloves",
    basis: "people", rate: true,
    means: "protective equipment was in use in the frame" },
  { id: "hot_work", name: "Hot work running", ask: "welding, cutting, permits, screens",
    basis: "people", rate: false,
    means: "welding or cutting was happening — an activity, not a safety score" },
  { id: "edge_protection", name: "Edge protection", ask: "barricading and signage",
    basis: "frames", rate: false,
    means: "the reader could see and assess barricading. What a no means is not written down" },
  { id: "scaffold", name: "Access and scaffold", ask: "ladders and platforms",
    basis: "frames", rate: false,
    means: "the reader could see and assess access. What a no means is not written down" },
  { id: "housekeeping", name: "Housekeeping", ask: "debris, storage, blocked routes",
    basis: "frames", rate: false,
    means: "the reader could see and assess housekeeping. What a no means is not written down" },
];

// ---- day by day, against the only honest denominator --------------------
const days = (site.days || []).map(day => {
  const d = site.byDay[day] || {};
  const people = d.manpower || { yes: 0, no: 0, cannot: 0 };
  const framesWithPeople = d.withPeople != null ? d.withPeople : people.yes;
  const row = { day, framesWithPeople,
    framesJudged: people.yes + people.no + people.cannot, items: {} };
  ITEMS.forEach(it => {
    const x = d[it.id] || { yes: 0, no: 0, cannot: 0 };
    const judged = x.yes + x.no + x.cannot;
    // A RATE IS ONLY EVER OUT OF THE FRAMES THAT COULD HAVE SHOWN IT, and
    // only where the question's yes supports being called one.
    //
    // "Could have shown it" has to mean THE SAME FRAMES on both sides of the
    // divide. It did not: the numerator came from every frame that showed
    // PPE and the denominator from every frame that showed people, two tallies
    // that were never the same set. A frame with people in it whose PPE could
    // not be judged could only ever sit in the denominator, so every hard-to-
    // read photograph pushed a compliance figure down — 3 to 21 points a day
    // on this project, always the same way.
    //
    // manpower.js now carries a joined count, taken frame by frame: of the
    // frames with somebody in them, the ones where this could be judged, and
    // of those, the ones where it was there. That is the pair of numbers a
    // rate can honestly be made from.
    const j = (d.joined || {})[it.id];
    const usejoin = it.basis === "people" && j;
    const of = usejoin ? j.judged : it.basis === "people" ? framesWithPeople : judged;
    const seen = usejoin ? j.yes : x.yes;
    row.items[it.id] = {
      seen, judged, of, basis: it.basis,
      // the frames that had people but could not be read either way — stated,
      // because a rate taken over fewer frames has to say how many it dropped
      unreadable: usejoin ? Math.max(0, framesWithPeople - j.judged) : null,
      rate: it.rate && of > 0 ? Math.round(seen / of * 100) : null,
    };
  });
  return row;
});

// ---- the trend on the one that matters ----------------------------------
const ppeTrend = days.filter(d => d.framesWithPeople >= 5)
  .map(d => ({ day: d.day, rate: d.items.ppe.rate, of: d.framesWithPeople }));
const first = ppeTrend[0], last = ppeTrend[ppeTrend.length - 1];

// ---- the flags somebody wrote down --------------------------------------
// NOTHING IS CLOSED WITHOUT A DATED CLOSURE. There is no HSE log on this
// project, so every one of these reads open — which is a statement about
// the record, not about the site.
const flags = (HSE.flags || []).map(f => Object.assign({}, f, {
  closed: null,
  why: "no dated closure exists anywhere on this project, so this reads open",
}));
const bySev = { high: 0, med: 0, low: 0 };
flags.forEach(f => bySev[f.sev] = (bySev[f.sev] || 0) + 1);
const byCat = {};
flags.forEach(f => byCat[f.cat] = (byCat[f.cat] || 0) + 1);

const out = {
  builtAt: new Date().toISOString(),
  latest: site.latest || null,
  walkDays: days.length,
  items: ITEMS,
  days,
  ppe: {
    latest: last ? last.rate : null, latestOf: last ? last.of : null,
    first: first ? first.rate : null, firstOn: first ? first.day : null,
    trend: ppeTrend,
    why: "the share of frames showing people at work in which protective equipment was also " +
         "visible. Read against every pin instead it would look far worse and mean nothing, " +
         "because most frames have nobody in them",
  },
  flags, good: HSE.good || [],
  counts: { flags: flags.length, high: bySev.high || 0, med: bySev.med || 0, low: bySev.low || 0,
    open: flags.length, closed: 0, categories: Object.keys(byCat).length,
    good: (HSE.good || []).length },
  byCat,
  why: "six safety questions answered at every pin on every walk, plus the flags a reader wrote " +
       "down on 18 July. A flag is present because a photograph showed it — absence is not " +
       "safety, it is absence. No dated closure exists on this project, so nothing reads closed",
};
fs.writeFileSync(path.join(ENGINE, "hse.json"), JSON.stringify(out));

console.log("\n  SAFETY, FROM THE WALK  ·  " + days.length + " walk days");
console.log("\n    DAY         FRAMES  PEOPLE   PPE      HOT WORK   EDGE     ACCESS   HOUSEKEEP");
days.forEach(d => console.log("    " + d.day + String(d.framesJudged).padStart(7) +
  String(d.framesWithPeople).padStart(8) +
  ITEMS.map(it => { const x = d.items[it.id];
    return (x.rate != null ? x.rate + "%" : x.seen + "/" + x.of).padStart(10); }).join("")));
if (last) console.log("\n  PPE VISIBLE IN " + last.rate + "% OF THE FRAMES SHOWING PEOPLE on " +
  last.day + " (" + last.of + " frames), against " + first.rate + "% on " + first.day);
console.log("\n  FLAGS: " + out.counts.flags + " · " + out.counts.high + " high · " +
  out.counts.med + " medium · " + out.counts.low + " low · none closed");
flags.filter(f => f.sev === "high").forEach(f => console.log("    HIGH  " + f.cat.padEnd(16) +
  f.text + (f.pins.length ? "  pins " + f.pins.join(",") : "")));
console.log("\n→ engines/skf/hse.json\n");
