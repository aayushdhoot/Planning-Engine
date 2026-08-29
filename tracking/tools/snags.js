#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/snags.js . THE DEFECT REGISTER
//   node tools/snags.js
//
// Builds snags.json from snags-raised.json, which is where raised defects
// live. It starts empty, and that is correct: there is not one snag
// anywhere on this engine, and there is no honest way to invent one.
//
// WHAT I DID NOT DO, AND WHY IT MATTERS
//   The obvious trick is to read defects out of the walk notes — 1,872 of
//   them contain the word "broken", "gap", "crack" or "patch". Nearly every
//   one is the reader saying the OPPOSITE: "no broken slab edges", "no
//   perimeter cove or shadow gap", "patch panels" (which is a network
//   term). A candidate list built on that word search would manufacture
//   nine hundred defects out of sentences saying there are none. So the
//   register stays empty until a person raises something.
//
// WHAT THE ENGINE CAN HONESTLY SAY WITHOUT A SINGLE ROW
//   . WHEN. The client's own tracker snags 5 to 14 August. The levelled
//     programme does not start snagging until 21 August. Both dates are on
//     the engine, they disagree by more than a fortnight, and nobody has
//     ever seen them side by side.
//   . WHERE. Which spaces are finished enough to be worth walking, from
//     the same reading the progress page publishes.
//   . WHAT IT IS WORTH. RA6 is 5% of the contract — Rs 41.05 L before tax
//     — released against virtual completion, close-out documents and a
//     twelve month DLP guarantee. A snag list is not admin; it is the last
//     gate on the last payment.
//
// THE LAWS, all of them in platform/kb/snag.js
//   . AGE IS COMPUTED FROM THE RAISED DATE, never typed.
//   . NO PROOF, NO CLOSURE — and a row marked closed without proof is
//     reopened here, loudly, rather than believed.
//   . A BURN DOWN NEEDS A RATE. With nothing closed there is no rate, and
//     the answer is "nobody has closed one yet", not a projection off zero.
// ===================================================================
const fs = require("fs"), path = require("path");
const SNAG = require(path.join(__dirname, "../platform/kb/snag.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const raised = read("snags-raised.json") || [];
const S = read("schedule.json"), L = read("layout.json"), T = read("target.json");
const facts = (read("facts.json") || {}).facts || [];

const today = new Date().toISOString().slice(0, 10);

// ---- the register -------------------------------------------------------
const rows = SNAG.register(raised, today)
  .sort((a, b) => (b.sev === "high") - (a.sev === "high") ||
                  ((a.due || "9999") < (b.due || "9999") ? -1 : 1));
const counts = SNAG.summary(raised, today);
const burn = SNAG.burnDown(raised, today);

// ---- when: two windows that do not agree --------------------------------
const stated = {};
facts.filter(f => /snag/i.test(String(f.subject)) &&
    /planned (start|finish)/.test(f.role || "")).forEach(f => {
  const k = String(f.subject);
  (stated[k] = stated[k] || { task: k })[f.role === "planned start" ? "start" : "finish"] = f.value;
});
const planned = [];
if (S) S.wbs.forEach(c => c.packages.forEach(k => {
  if (/snag|deep clean|handover paper/i.test(k.name))
    planned.push({ code: k.code, name: k.name, ES: k.ES, EF: k.EF });
}));
const snagPkg = planned.find(p => /snag/i.test(p.name)) || null;
const trackerFirst = Object.values(stated).map(x => x.start).filter(Boolean).sort()[0] || null;
const windowGap = (trackerFirst && snagPkg)
  ? SNAG.between(trackerFirst, snagPkg.ES) : null;

// ---- where: what is finished enough to be worth walking -----------------
// THE SAME READING THE PROGRESS PAGE PUBLISHES. A space at 20% is not a
// space with defects in it; it is a space that is not built yet.
const spaces = ((L && L.spaces) || []).filter(s => s.pct != null)
  .map(s => ({ name: s.name, pins: s.pins.length, pct: s.pct, sqft: s.sqft || null,
    ready: s.pct >= 70 }))
  .sort((a, b) => b.pct - a.pct);

// ---- what it is worth ---------------------------------------------------
const money = (() => {
  const ra = facts.find(f => f.role === "RA amount before tax" &&
    /bank guarantee|unconditional/i.test(String(f.subject)));
  const dlp = facts.find(f => /defects liability/i.test(String(f.subject)));
  const trig = facts.find(f => f.role === "payment" && /RA6/i.test(String(f.subject)));
  return {
    retention: ra ? Number(ra.value) : null,
    trigger: trig ? String(trig.value) : null,
    dlp: dlp ? String(dlp.value) : null,
  };
})();

const out = {
  builtAt: new Date().toISOString(), today,
  counts, rows, burn,
  when: {
    trackerWindows: Object.values(stated),
    programme: planned,
    gapDays: windowGap,
    why: windowGap == null ? null
      : "the client's own tracker starts snagging " + trackerFirst + " and the levelled " +
        "programme does not reach it until " + snagPkg.ES + " — " + windowGap + " days apart. " +
        "Neither is wrong; they are two different plans and nobody has put them side by side",
  },
  where: { spaces, ready: spaces.filter(s => s.ready).length, total: spaces.length,
    why: "a space below 70% is not a space with defects in it, it is a space that is not built " +
         "yet. Only what is finished enough to walk is worth a snag round" },
  money,
  empty: rows.length === 0,
  why: "there is not one defect on this engine and none has been invented. The walk notes " +
       "contain 1,872 mentions of broken, cracked, gap and patch, and nearly every one is the " +
       "reader saying there is none — a candidate list built off that word search would " +
       "manufacture defects out of sentences denying them",
};
fs.writeFileSync(path.join(ENGINE, "snags.json"), JSON.stringify(out));

const cr = (n) => n == null ? "—" : n >= 1e7 ? "Rs " + (n / 1e7).toFixed(2) + " Cr"
                : n >= 1e5 ? "Rs " + (n / 1e5).toFixed(1) + " L" : "Rs " + Math.round(n);
console.log("\n  THE DEFECT REGISTER  (as on " + today + ")");
if (out.empty) {
  console.log("    empty — not one defect has been raised, and none has been invented");
} else {
  console.log("    " + counts.total + " raised · " + counts.open + " open · " + counts.wip +
    " in hand · " + counts.closed + " closed · " + counts.overdue + " past their date");
  if (counts.reopened) console.log("    " + counts.reopened +
    " were marked closed with no proof and have been REOPENED");
  console.log("    " + burn.why);
}
if (out.when.why) { console.log("\n  WHEN"); console.log("    " + out.when.why); }
console.log("\n  WHERE  " + out.where.ready + " of " + out.where.total +
  " spaces are finished enough to walk");
spaces.slice(0, 8).forEach(s => console.log("    " + String(s.pct).padStart(3) + "%  " +
  s.name.slice(0, 34).padEnd(36) + s.pins + " pins"));
console.log("\n  WHAT IT IS WORTH");
console.log("    " + cr(money.retention) + " sits on RA6, released against virtual completion,");
console.log("    close-out documents and a twelve month DLP guarantee.");
console.log("\n→ engines/skf/snags.json\n");
