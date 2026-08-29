#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/billing.js . WHAT CAN BE BILLED, AND WHAT HAS BEEN
//   node tools/billing.js
//
// Builds billing.json.
//
// The cashflow page shows value EARNED — the walk's reading priced. That is
// not money. Money on this job moves against six running-account stages
// written into the contract, and every one of them is on this engine and
// none has ever been on a screen:
//
//   RA1  Day  0    0%   mobilisation, no advance payable
//   RA2  Day 20   20%   partitions marked and framed, plaster, conduiting
//   RA3  Day 40   25%   partitions closed, wiring, sprinkler pipe, key orders
//   RA4  Day 55   25%   paint prep, duct, ceiling framing, key orders
//   RA5  Day 70   25%   switches, sanitary, doors, first coat, ceiling
//   RA6  Day 75    5%   against a 12 month DLP bank guarantee at handover
//
// Commencement is 8 June 2026 and completion is 75 calendar days, which is
// how the contract arrives at 22 August — the same date the programme is
// measured against.
//
// TWO THINGS AN RA STAGE NEEDS, AND THE ENGINE ONLY HAS ONE
//   A stage falls due on a DATE and is earned by WORK. The dates are
//   arithmetic. The work is described in the milestone text, and this reads
//   it against the packages the walk has actually seen — loosely, because
//   the milestone is prose, so every match is named and can be argued with.
//
//   Whether a bill was RAISED, CERTIFIED or COLLECTED is not recorded
//   anywhere on this project. That is a human input and it starts empty.
//
// THE LAWS
//   . A DATE FALLING DUE IS NOT AN ENTITLEMENT. A stage is claimable when
//     its work is done, not when its day arrives, and the two are shown
//     apart.
//   . RAISED, CERTIFIED AND COLLECTED ARE THREE DIFFERENT THINGS. A bill
//     raised is not money. Nothing here collapses them.
//   . NOTHING IS BILLED THAT WAS NOT BUILT. The exposure figure is the
//     value the walk can see minus what has been certified, and it is never
//     the stage percentage just because the day has passed.
//   . TAX IS CARRIED, NEVER ASSUMED INTO THE PRINCIPAL. Every figure says
//     whether it is before or after tax.
// ===================================================================
const fs = require("fs"), path = require("path");
const SCOPE = require(path.join(__dirname, "../platform/core/scope.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const facts = (read("facts.json") || {}).facts || [];
const S = read("schedule.json"), CF = read("cashflow.json"), R = read("resources.json");
const raisedRows = read("billing-raised.json") || [];

const today = new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000)
  .toISOString().slice(0, 10);
const between = (a, b) => a && b
  ? Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) : null;

// ---- the contract, in its own words -------------------------------------
const factOf = (subj, role) => { const f = facts.find(x => String(x.subject) === subj &&
  (!role || x.role === role)); return f ? f.value : null; };
const num = (subj, role) => { const f = facts.find(x => String(x.subject) === subj && x.role === role);
  return f ? Number(f.value) : null; };

const contract = (() => {
  const priceText = String(factOf("Total Contract Price") || "");
  const m = priceText.replace(/,/g, "").match(/(\d{6,})/);
  const exTax = m ? Number(m[1]) : num("FINAL SUMMARY · GRAND TOTAL (EXCLUSIVE OF TAXES)", "cost head amount");
  const withTax = num("FINAL SUMMARY · GRAND TOTAL (WITH TAXES)", "cost head amount");
  const bcs = num("FINAL SUMMARY · GRAND TOTAL (EXCLUSIVE OF TAXES)", "cost head BCS amount");
  // COMMENCEMENT IS WRITTEN IN WORDS. "08th June, 2026".
  const cText = String(factOf("Agreement commencement date") || "");
  const MON = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"];
  const cm = cText.toLowerCase().match(/(\d{1,2})\w*\s+([a-z]+),?\s+(\d{4})/);
  const start = cm ? cm[3] + "-" + String(MON.indexOf(cm[2].slice(0, 3)) + 1).padStart(2, "0") +
    "-" + String(+cm[1]).padStart(2, "0") : null;
  const dText = String(factOf("Time for Completion") || "");
  const dm = dText.match(/(\d{2,3})\s*calendar days|seventy-?five/i);
  const days = dm && dm[1] ? Number(dm[1]) : /seventy-?five/i.test(dText) ? 75 : null;
  return { exTax, withTax, bcs,
    taxRate: exTax && withTax ? Math.round((withTax / exTax - 1) * 1000) / 10 : null,
    start, days, completion: start && days ? addDays(start, days) : null,
    priceText, advance: String(factOf("No Advance", "what releases this payment") || "") };
})();

// ---- the six stages -----------------------------------------------------
const stages = [];
for (let n = 1; n <= 6; n++) {
  const key = "RA" + n;
  const ms = facts.find(x => /^RA\s?\d/.test(String(x.subject)) &&
    String(x.subject).indexOf(key) === 0 && x.role === "milestone");
  const pay = facts.find(x => String(x.subject).indexOf(key) === 0 && x.role === "payment");
  if (!ms && !pay) continue;
  const msText = ms ? String(ms.value) : "";
  const payText = pay ? String(pay.value) : "";
  const dayM = msText.match(/Day\s+(\d+)/i);
  const pctM = payText.match(/(\d+(?:\.\d+)?)\s*%/);
  const day = dayM ? Number(dayM[1]) : null;
  const pct = pctM ? Number(pctM[1]) : null;
  stages.push({ no: n, key, day, pct,
    dueOn: contract.start && day != null ? addDays(contract.start, day) : null,
    value: contract.exTax && pct != null ? Math.round(contract.exTax * pct / 100) : null,
    valueWithTax: contract.withTax && pct != null
      ? Math.round(contract.withTax * pct / 100) : null,
    milestone: msText, trigger: payText });
}

// ---- what work each stage asks for, and how much of it the walk sees ----
// THE MILESTONE IS PROSE. It is matched to packages with the same matcher
// that reads the bill, and every match is named so anybody can argue with
// it. Nothing here is a certification.
const walkDay = S && S.days ? S.days[S.days.length - 1] : null;
const pr = walkDay ? S.progress[walkDay] : null;
const seenOf = {}, weightOf = {}, nameOf = {};
if (pr) S.wbs.forEach(c => c.packages.forEach(k => {
  const r = pr.byPkg[k.id]; if (!r || k.track === false) return;
  seenOf[k.code] = Math.max(seenOf[k.code] || 0, r.actual || 0);
  weightOf[k.code] = Math.max(weightOf[k.code] || 0, r.weight || 0);
  nameOf[k.code] = k.name;
}));

stages.forEach(s => {
  const bits = String(s.milestone).replace(/^Day\s+\d+\s*[—-]?\s*/i, "")
    .split(/[,;]| and |\bincluding\b/i).map(x => x.trim()).filter(x => x.length > 4);
  const hit = {};
  bits.forEach(b => { const m = SCOPE.match("", b, "no");
    if (m && m.code && m.by === "description" && seenOf[m.code] != null) hit[m.code] = b; });
  const codes = Object.keys(hit);
  // weighted by what each package is worth, not by how many were named
  const w = codes.reduce((t, c) => t + (weightOf[c] || 0), 0);
  s.asks = codes.map(c => ({ code: c, name: nameOf[c], seen: seenOf[c],
    weight: weightOf[c] || 0, from: hit[c] }))
    .sort((a, b) => b.weight - a.weight);
  s.workDone = w > 0
    ? Math.round(codes.reduce((t, c) => t + (weightOf[c] || 0) * seenOf[c], 0) / w)
    : null;
  s.matched = codes.length;
  s.due = !!(s.dueOn && s.dueOn <= today);
  s.lateBy = s.due ? between(s.dueOn, today) : 0;
});

// ---- raised, certified, collected — three different things -------------
// None of this is recorded anywhere on the project. It starts empty.
const said = {};
raisedRows.forEach(r => said[r.key] = r);
stages.forEach(s => {
  const r = said[s.key] || null;
  s.raised = r && r.raisedOn ? { on: r.raisedOn, amount: r.raisedAmount == null ? null : Number(r.raisedAmount) } : null;
  s.certified = r && r.certifiedOn ? { on: r.certifiedOn, amount: r.certifiedAmount == null ? null : Number(r.certifiedAmount) } : null;
  s.collected = r && r.collectedOn ? { on: r.collectedOn, amount: r.collectedAmount == null ? null : Number(r.collectedAmount) } : null;
  s.note = r ? r.note || null : null;
  // A STAGE WITH NOTHING PAYABLE HAS NOTHING TO RAISE. RA1 is the
  // mobilisation stage at 0% — the contract says no advance is payable —
  // and reporting it as 63 days overdue would be reporting a debt of nought.
  s.state = s.pct === 0 ? "nothing payable"
          : s.collected ? "collected" : s.certified ? "certified" : s.raised ? "raised"
          : s.due ? "due, not raised" : "not due";
  if (s.pct === 0) { s.due = false; s.lateBy = 0; }
});

// ---- what is built and not billed ---------------------------------------
// NOTHING IS BILLED THAT WAS NOT BUILT. The exposure is the value the walk
// can see, minus what has actually been certified — never the stage
// percentage because a day passed.
const earned = CF ? CF.totals.earned : null;
const certified = stages.reduce((t, s) => t + (s.certified && s.certified.amount != null
  ? s.certified.amount : 0), 0);
const collected = stages.reduce((t, s) => t + (s.collected && s.collected.amount != null
  ? s.collected.amount : 0), 0);
const raisedTotal = stages.reduce((t, s) => t + (s.raised && s.raised.amount != null
  ? s.raised.amount : 0), 0);

const dueStages = stages.filter(s => s.due && s.pct > 0);
const dueValue = dueStages.reduce((t, s) => t + (s.value || 0), 0);

const out = {
  builtAt: new Date().toISOString(), today, walkDay,
  contract, stages,
  totals: {
    stages: stages.length,
    due: dueStages.length,
    dueValue,
    raised: raisedTotal, certified, collected,
    earned,
    // THE ONE NUMBER THIS PAGE EXISTS FOR
    exposure: earned != null ? Math.round(earned - certified) : null,
    // A NEGATIVE EXPOSURE IS NOT A SMALLER PROBLEM, it is a different one:
    // more has been certified than the walk can see standing on the floor.
    overCertified: earned != null && certified > earned ? Math.round(certified - earned) : 0,
    unbilledDue: Math.round(dueValue - raisedTotal),
    pctBilled: contract.exTax ? Math.round(raisedTotal / contract.exTax * 1000) / 10 : null,
    pctEarned: contract.exTax && earned != null
      ? Math.round(earned / contract.exTax * 1000) / 10 : null,
  },
  empty: raisedRows.length === 0,
  // WHERE TWO DOCUMENTS DISAGREE, BOTH ARE SHOWN. The weekly task tracker
  // carries a job to confirm RA1 was raised and collected, and the contract
  // says no advance is payable against RA1 at all. Somebody is working to
  // the wrong one of those.
  contradictions: (() => {
    const out = [];
    const t = facts.find(x => /Confirm RA1 raised/i.test(String(x.subject)) && x.role === "declared status");
    const ra1 = stages.find(x => x.key === "RA1");
    if (t && ra1 && ra1.pct === 0) {
      const due = facts.find(x => /Confirm RA1 raised/i.test(String(x.subject)) && x.role === "due");
      const own = facts.find(x => /Confirm RA1 raised/i.test(String(x.subject)) && x.role === "owner");
      out.push({ what: "The tracker has a job to confirm RA1 was raised and collected",
        against: "the contract says RA1 is 0% and no mobilisation advance is payable",
        detail: "owned by " + (own ? own.value : "nobody named") +
          (due ? ", due " + due.value : "") + ", status " + t.value,
        why: "one of the two is wrong and the difference is whether anybody should be chasing a bill" });
    }
    return out;
  })(),
  why: "the RA schedule is the contract's own: six stages at fixed days from commencement, " +
       "0/20/25/25/25/5 per cent. A stage falling due is not an entitlement — it is claimable " +
       "when its work is done, and the two are shown apart. Raised, certified and collected are " +
       "three different things and nothing here collapses them. None of the three is recorded " +
       "anywhere on this project, so they start empty and a person fills them",
};
fs.writeFileSync(path.join(ENGINE, "billing.json"), JSON.stringify(out));

const cr = (x) => x == null ? "—" : (x < 0 ? "-Rs " : "Rs ") +
  (Math.abs(x) >= 1e7 ? (Math.abs(x) / 1e7).toFixed(2) + " Cr"
   : Math.abs(x) >= 1e5 ? (Math.abs(x) / 1e5).toFixed(1) + " L" : Math.round(Math.abs(x)));
console.log("\n  THE CONTRACT");
console.log("    " + cr(contract.exTax) + " before tax · " + cr(contract.withTax) + " with tax at " +
  contract.taxRate + "% · internal cost " + cr(contract.bcs));
console.log("    commencement " + contract.start + " · " + contract.days +
  " calendar days · completion " + contract.completion);
console.log("\n  THE RUNNING ACCOUNT  (as on " + today + ")");
console.log("    STAGE  DAY   DUE ON       %      VALUE     WORK THE WALK SEES   STATE");
stages.forEach(s => console.log("    " + s.key.padEnd(6) + String(s.day).padStart(3) + "   " +
  String(s.dueOn || "—").padEnd(12) + String(s.pct + "%").padStart(4) + "  " +
  cr(s.value).padStart(10) + "   " +
  (s.workDone == null ? "not matched" : s.workDone + "% of " + s.matched + " packages").padEnd(20) +
  s.state + (s.due && !s.raised ? "  (" + s.lateBy + "d)" : "")));
console.log("\n  " + out.totals.due + " stages are past their date, worth " + cr(dueValue) +
  " — " + cr(out.totals.unbilledDue) + " of that has not been raised");
console.log("  the walk can see " + cr(earned) + " built; " + cr(certified) + " has been certified.");
console.log(out.totals.overCertified
  ? "  OVER CERTIFIED by " + cr(out.totals.overCertified) + " — more has been certified than the " +
    "walk can see standing on the floor"
  : "  Exposure " + cr(out.totals.exposure) + " built and not certified");
console.log("\n→ engines/skf/billing.json\n");
