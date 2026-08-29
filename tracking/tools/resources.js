#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/resources.js . WHAT HAS TO BE ON THE FLOOR, AND BY WHEN
//   node tools/resources.js [--as 2026-08-10]
//
// The manpower page answers "who". This answers "what with". A floor with
// a hundred and ninety people on it and no vinyl is a floor with a hundred
// and ninety people standing around, and the date that decides whether the
// vinyl is there is not the date it is laid — it is the date somebody had
// to place the order, weeks earlier, and nobody was ever shown it.
//
// WHAT THIS KNOWS AND WHAT IT DOES NOT
//   It knows what the bill buys, how much of it, when the levelled
//   programme installs it, and — for the packages that declare one — how
//   long the lead time is. Those four give a NEEDED ON SITE date and an
//   ORDER BY date, and both are arithmetic.
//
//   It does NOT know what has actually been ordered. There is no purchase
//   order and no delivery note anywhere on this log. So this page never
//   says "late" about a purchase — it says the date somebody had to act by,
//   and whether that date has passed. What follows from that is written as
//   the conditional it is: IF this has not been ordered, here is what it
//   now costs.
//
// THE LAWS
//   . NEEDED ON SITE IS TWO DAYS BEFORE THE WORK STARTS. Material landing
//     the morning the gang arrives is material that holds the gang up.
//   . NO DECLARED LEAD TIME, NO ORDER-BY INVENTED. The row still carries
//     its needed-on-site date and says the lead is unknown.
//   . AN ORDER-BY THAT HAS PASSED IS NOT A CLAIM THAT NOBODY ORDERED IT.
//     It is a date, and whether it was met is a question for a human.
//   . THE DATES COME FROM THE LEVELLED PROGRAMME, not the unresourced one.
//     Ordering against a schedule nobody is working to is how material
//     arrives six weeks before there is anywhere to put it.
// ===================================================================
const fs = require("fs"), path = require("path");
const MAT = require(path.join(__dirname, "../platform/core/material.js"));
const CAL = require(path.join(__dirname, "../platform/kb/calendar.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8"));
const plan = read("plan.json");
const sched = (() => { try { return read("schedule.json"); } catch (e) { return null; } })();
const target = (() => { try { return read("target.json"); } catch (e) { return null; } })();

const argAs = (() => { const i = process.argv.indexOf("--as");
  return i > 0 ? process.argv[i + 1] : null; })();
const asOf = argAs || new Date().toISOString().slice(0, 10);

const cal = CAL.defaultConfig ? CAL.defaultConfig("pune", 2026) : null;
const isWD = (iso) => { const d = new Date(iso + "T00:00:00Z");
  if (cal && cal.holidays) { const h = cal.holidays.find(x => x.date === iso); if (h && h.siteOff) return false; }
  return d.getUTCDay() !== 0; };
const daysBetween = (a, b) => Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000);

// ---- what the bill buys, package by package -----------------------------
const scope = (plan.scope && plan.scope.tasks) || [];
const leadOf = plan.leadWeeks || {};

// ---- when the levelled programme installs it ----------------------------
// THE LEVELLED DATES, not the critical path bound. A material plan built on
// the unresourced schedule orders everything for the week the whole job
// could theoretically start, which is how a floor ends up stacked to the
// ceiling with board nobody can hang yet.
const installOf = {};
if (sched) sched.wbs.forEach(c => c.packages.forEach(k => {
  if (!k.code) return;
  const cur = installOf[k.code];
  if (!cur || (k.ES && k.ES < cur.ES)) installOf[k.code] = { ES: k.ES, EF: k.EF,
    zones: k.zones || [], rooms: (k.rooms || []).length, trade: k.trade, id: k.id };
}));

// ---- and what the site has already answered for itself ------------------
// THE WALK SETTLES MOST OF THIS WITHOUT ANYBODY BEING ASKED. If the camera
// can see ducting installed at twenty five pins, the duct is on site and the
// order-by date is a question nobody needs to answer. A material list that
// asks about material already hanging off the slab is a list nobody reads.
const seenOf = {};
if (sched && sched.days && sched.days.length) {
  const last = sched.days[sched.days.length - 1];
  const pr = sched.progress[last];
  if (pr) sched.wbs.forEach(c => c.packages.forEach(k => {
    const r = pr.byPkg[k.id];
    if (r && r.actual != null) seenOf[k.code] = Math.max(seenOf[k.code] || 0, r.actual);
  }));
}

// ---- THE ENGINE TAKES A POSITION ON EVERY ROW ---------------------------
// A list of dates with no view on them is a list somebody has to work out
// for themselves. The walk has an opinion about every package: it has either
// seen the stuff going in or it has not, and the successor work says more
// again — nobody hangs a ceiling under a duct that never arrived.
//
// So each row gets a called state and a confidence, and where there is
// nothing to go on the confidence is NONE and the row says so. That is a
// real answer. Anybody can overrule it in one click.
const SEQ = require(path.join(__dirname, "../platform/kb/sequence.js"));
const needsMe = {};                      // code -> codes that wait on it
Object.keys(SEQ.AFTER || {}).forEach(after => {
  (SEQ.AFTER[after] || []).forEach(r => (needsMe[r.of] = needsMe[r.of] || []).push(after));
});

function callIt(code, seen, orderByPassed, leadKnown) {
  const bought = boughtOf[code] || null;
  // 1. THE CAMERA SAW IT GOING IN. Nothing beats that.
  if (seen != null && seen >= 30)
    return { state: "here", confidence: "high",
      why: "the walk sees it " + seen + "% installed" };
  if (seen != null && seen > 0)
    return { state: "here", confidence: "medium",
      why: "the walk sees it " + seen + "% installed — enough to prove it arrived, "
         + "not enough to say all of it did" };
  // 1b. A GOODS-RECEIVED NOTE SAYS IT LANDED. Read out of a daily report
  //     rather than off a signed note, and carrying no quantity — so it
  //     proves arrival and never proves the full order.
  if (bought && bought.grns.length) {
    const g = bought.grns[0];
    return { state: "here", confidence: "medium",
      why: "received " + g.day + " (" + g.material + ")" +
           (g.issue ? " — " + g.issue : "") + ". No quantity was counted" };
  }
  // 2. SOMETHING THAT WAITS ON IT HAS MOVED. Nobody boards a ceiling under a
  //    duct that never came.
  const movers = (needsMe[code] || []).filter(c => seenOf[c] > 0);
  if (movers.length)
    return { state: "here", confidence: "low",
      why: movers[0].replace(/_/g, " ") + " is under way and cannot be, unless this arrived" };
  // 3. A PURCHASE ORDER EXISTS. Somebody bought it; nothing says it landed.
  //    A PROMISED DATE THAT HAS PASSED WITH NOTHING SEEN is not the same
  //    question as "was it ordered" — that one is answered. This one is
  //    "the vendor said a date and the date went", which is worse.
  if (bought && bought.pos.length) {
    const p = bought.pos.slice().sort((a, b) =>
      (a.promisedOn || "9999") < (b.promisedOn || "9999") ? -1 : 1)[0];
    const late = p.promisedOn && p.promisedOn < asOf;
    return { state: late ? "overdue" : "ordered",
      confidence: p.how === "head" ? "low" : "high",
      why: p.po + " to " + p.vendor +
        (p.promisedOn ? (late ? ", promised " + p.promisedOn + " and nothing seen since"
                              : ", due " + p.promisedOn) : "") +
        (p.how === "head" ? ". That order covers the whole head and does not name this package" : "") };
  }
  // 4. NOTHING SEEN, NOTHING BOUGHT, AND THE DAY TO ORDER IT HAS GONE.
  if (orderByPassed)
    return { state: "pending", confidence: "medium",
      why: "no purchase order on the register, and nothing has ever been seen of it" };
  // 4. NOTHING SEEN, AND IT IS NOT DUE YET.
  if (leadKnown)
    return { state: "not due", confidence: "medium",
      why: "not needed on site yet" };
  return { state: "unknown", confidence: "none",
    why: "no lead time declared and nothing seen — the engine has nothing to go on" };
}

// ---- AND WHAT SOMEBODY ACTUALLY BOUGHT ---------------------------------
// Thirty purchase orders and four goods-received notes, joined to the
// packages by tools/orders.js. This is the evidence the page spent its first
// draft insisting did not exist.
const po = (() => { try { return read("po.json"); } catch (e) { return null; } })();
const boughtOf = (po && po.byCode) || {};

// ---- and what a person has said about it -------------------------------
// The only thing that can settle "has this been bought" is somebody who
// knows. One line each: ordered on, lands on, who said so. A row with a
// landing date stops being a question; a row somebody marks ordered with
// NO landing date is still a question, because "it's ordered" does not
// tell a programme anything it can use.
const orders = (() => { try { return read("orders.json"); } catch (e) { return {}; } })();

// ---- the approved make, where the sampling file names one ---------------
const makeOf = (() => {
  const out = {};
  let facts = []; try { facts = read("facts.json").facts || []; } catch (e) {}
  facts.filter(f => f.role === "approved make" && f.value).forEach(f => {
    const s = String(f.subject || "").toLowerCase();
    (out[s] = out[s] || []).push(String(f.value));
  });
  return out;
})();
const makeFor = (row) => {
  const words = String(row.name || "").toLowerCase().split(/\W+/).filter(w => w.length > 3);
  for (const subj of Object.keys(makeOf))
    if (words.some(w => subj.indexOf(w) >= 0)) return { subject: subj, makes: [...new Set(makeOf[subj])] };
  return null;
};

// A QUANTITY IN DAYS IS NOT A TAKE-OFF. Eighteen of these packages carry a
// duration where a material list expects a quantity — "UPS, 6 day" is six
// days of commissioning, not six of anything you can put on a lorry. Twelve
// of them buy nothing at all: testing, training, snagging, handover papers.
// A material list that asks somebody to order snagging is a list nobody
// reads twice.
const TIME_UNIT = /^(day|days|week|wk|month|lot|ls|job|no of days)$/i;

// ---- one row per package -------------------------------------------------
const rows = scope.map(t => {
  const inst = installOf[t.code] || null;
  const firstInstall = inst ? inst.ES : null;
  const neededOn = firstInstall ? MAT.shift(firstInstall, -MAT.STAGING_DAYS) : null;
  const weeks = leadOf[t.code] == null ? null : Number(leadOf[t.code]);
  const orderBy = (weeks == null || !neededOn) ? null : MAT.shift(neededOn, -weeks * 7);
  // IF IT HAS NOT BEEN ORDERED — a conditional, never a claim. Nothing on
  // this log says what has been bought.
  const couldLandOn = weeks == null ? null : MAT.shift(asOf, weeks * 7);
  const slip = (couldLandOn && neededOn && couldLandOn > neededOn)
    ? daysBetween(neededOn, couldLandOn) : 0;
  const make = makeFor(t);
  const seen = seenOf[t.code] == null ? null : seenOf[t.code];
  const said = orders[t.code] || null;
  // A LANDING DATE SOMEBODY GAVE BEATS THE ENGINE'S CONDITIONAL. A claim
  // that it is ordered with no date attached does not — it answers a
  // different question from the one a programme asks.
  const lands = said && said.landsOn ? said.landsOn : null;
  // THE ENGINE'S CALL, and then whatever a person said over the top of it.
  const guess = callIt(t.code, seen, !!(orderBy && orderBy < asOf), weeks != null);
  const told  = said && said.state ? said.state : null;
  const state = told || guess.state;
  const answered = !!told || state === "here";
  return {
    code: t.code, name: t.name, trade: t.trade,
    qty: t.qty, unit: t.unit, value: t.value || 0,
    lines: (t.lines || []).length,
    firstInstall, neededOn,
    leadWeeks: weeks, leadKnown: weeks != null,
    orderBy,
    orderByPassed: !!(orderBy && orderBy < asOf),
    orderByIn: orderBy ? daysBetween(asOf, orderBy) : null,
    couldLandOn, slipIfNotOrdered: slip,
    zones: inst ? inst.zones : [], rooms: inst ? inst.rooms : 0,
    scheduled: !!inst,
    // THE WALK IS THE PROOF OF DELIVERY THIS PROJECT NEVER FILED
    seenPct: seen,
    onSite: seen != null && seen > 0,
    said, lands, answered,
    state, guess,
    bought: boughtOf[t.code] || null,
    settled: !!told,
    confidence: told ? "stated" : guess.confidence,
    qtyIsEffort: TIME_UNIT.test(String(t.unit || "")),
    // does this package buy anything at all?
    buys: (t.value || 0) > 0 || (t.lines || []).length > 0,
    // where a date was given, that is the arrival; otherwise the conditional
    arrivesOn: lands || couldLandOn,
    lateBy: (lands || couldLandOn) && neededOn && (lands || couldLandOn) > neededOn
      ? daysBetween(neededOn, lands || couldLandOn) : 0,
    approvedMake: make ? make.makes.slice(0, 4) : null,
  };
}).sort((a, b) => {
  const A = a.orderBy || a.neededOn || "9999-99-99", B = b.orderBy || b.neededOn || "9999-99-99";
  return A < B ? -1 : A > B ? 1 : 0;
});

// THE MATERIAL LIST IS THE PACKAGES THAT BUY SOMETHING. The rest are on the
// programme and on nobody's order book.
const buys = rows.filter(r => r.buys);
const activities = rows.filter(r => !r.buys);
const money = buys.reduce((t, r) => t + r.value, 0);
const late = buys.filter(r => r.orderByPassed);
const noLead = buys.filter(r => !r.leadKnown);
// THE ONES STILL WORTH ASKING ABOUT. An order-by that passed on something
// the walk can see going in is answered; an order-by that passed on
// something nothing has ever seen is the whole question.
// ORDERED IS NOT THE SAME QUESTION AS PENDING. "Has anybody bought it" is
// answered; "has it landed" is not. Only the first belongs on a list that
// asks procurement to go and buy something.
const open = buys.filter(r => !r.settled &&
    (r.state === "pending" || r.state === "unknown" || r.state === "overdue"))
  .sort((a, b) => (b.couldLandOn || "") < (a.couldLandOn || "") ? -1 : 1);
// AND WHAT SOMEBODY HAS ANSWERED, WHICH STILL LANDS LATE
const dated = buys.filter(r => r.lands && r.lateBy > 0)
  .sort((a, b) => b.lateBy - a.lateBy);

// THE LONGEST LEAD IS A FLOOR UNDER THE PROGRAMME, not the oldest order-by.
// Sorting by how late the order-by is sorts by the order-by date, because
// every one of them passed at roughly the same moment. What decides when
// the job can finish is the last date anything can physically arrive.
const floorUnderIt = open.length ? open[0] : null;

const out = {
  builtAt: new Date().toISOString(),
  asOf,
  stagingDays: MAT.STAGING_DAYS,
  totals: {
    packages: buys.length,
    activities: activities.length,
    value: Math.round(money),
    scheduled: buys.filter(r => r.scheduled).length,
    leadKnown: buys.filter(r => r.leadKnown).length,
    orderByPassed: late.length,
    orderByPassedValue: Math.round(late.reduce((t, r) => t + r.value, 0)),
    onSite: buys.filter(r => r.onSite).length,
    answered: buys.filter(r => r.said).length,
    qtyIsEffort: buys.filter(r => r.qtyIsEffort).length,
    here: buys.filter(r => r.state === "here").length,
    ordered: buys.filter(r => r.state === "ordered").length,
    overdue: buys.filter(r => r.state === "overdue").length,
    overdueValue: Math.round(buys.filter(r => r.state === "overdue").reduce((t, r) => t + r.value, 0)),
    pending: buys.filter(r => r.state === "pending").length,
    onOrderValue: Math.round(buys.filter(r => r.state === "ordered")
      .reduce((t, r) => t + r.value, 0)),
    notDue: buys.filter(r => r.state === "not due").length,
    unknown: buys.filter(r => r.state === "unknown").length,
    settled: buys.filter(r => r.settled).length,
    noEvidence: buys.filter(r => r.confidence === "none").length,
    datedLate: dated.length,
    stillOpen: open.length,
    stillOpenValue: Math.round(open.reduce((t, r) => t + r.value, 0)),
    noLead: noLead.length,
    noLeadValue: Math.round(noLead.reduce((t, r) => t + r.value, 0)),
    withMake: rows.filter(r => r.approvedMake).length,
  },
  floorUnderIt: floorUnderIt ? {
    code: floorUnderIt.code, name: floorUnderIt.name,
    leadWeeks: floorUnderIt.leadWeeks, couldLandOn: floorUnderIt.couldLandOn,
    neededOn: floorUnderIt.neededOn, slip: floorUnderIt.slipIfNotOrdered,
    value: floorUnderIt.value,
  } : null,
  dated: dated.map(r => ({ code: r.code, name: r.name, lands: r.lands, neededOn: r.neededOn,
    lateBy: r.lateBy, by: r.said && r.said.by })),
  handover: target ? target.target : null,
  lands: target && target.built ? target.built.conditionsBy : null,
  why: "needed on site is " + MAT.STAGING_DAYS + " days before the levelled programme starts " +
       "installing it. Order by walks the declared lead time back from there. Nothing on this " +
       "log records a purchase order or a delivery, so an order-by that has passed is a date, " +
       "not an accusation — what it would cost if the order was missed is stated as the " +
       "conditional it is",
  rows: buys,
  activities: activities.map(r => ({ code: r.code, name: r.name, unit: r.unit, qty: r.qty })),
};
fs.writeFileSync(path.join(ENGINE, "resources.json"), JSON.stringify(out));

// ---- what it found -------------------------------------------------------
const cr = (n) => n >= 1e7 ? "Rs " + (n / 1e7).toFixed(2) + " Cr"
                : n >= 1e5 ? "Rs " + (n / 1e5).toFixed(1) + " L" : "Rs " + Math.round(n);
console.log("\n  WHAT THE FLOOR NEEDS  (as on " + asOf + ")");
console.log("    " + out.totals.packages + " packages buy something, " + cr(out.totals.value) + " of bill value");
console.log("    " + out.totals.activities + " buy nothing at all — testing, training, snagging, " +
  "handover papers — and are on nobody's order book");
console.log("    " + out.totals.leadKnown + " declare a lead time, " + out.totals.noLead +
  " do not (" + cr(out.totals.noLeadValue) + ")");
console.log("\n  ORDER-BY DATES ALREADY PASSED: " + late.length + " packages, " +
  cr(out.totals.orderByPassedValue));
console.log("    of those, " + (late.length - open.length) + " the walk can already see going in — " +
  "the material is on site and the date is moot");
console.log("\n  STILL OPEN: " + open.length + " packages, " + cr(out.totals.stillOpenValue) +
  ", nothing has ever seen any of it");
console.log("    EARLIEST ON SITE IF ORDERED TODAY   NEEDED ON     LEAD  PACKAGE");
open.slice(0, 16).forEach(r => console.log("      " + r.couldLandOn + "                      " +
  r.neededOn + "  " + String(r.leadWeeks).padStart(3) + "w  " + r.name));
if (open.length > 16) console.log("      ... and " + (open.length - 16) + " more");

if (floorUnderIt) {
  console.log("\n  THE FLOOR UNDER THE PROGRAMME");
  console.log("    " + floorUnderIt.name + " is " + floorUnderIt.leadWeeks + " weeks. Ordered this " +
    "morning it lands " + floorUnderIt.couldLandOn + ",");
  console.log("    and it was needed " + floorUnderIt.neededOn + ". Until somebody confirms it was " +
    "bought earlier,");
  console.log("    nothing finishes before then plus the time to install it — whatever the manpower does.");
  console.log("    Handover is " + (out.handover || "?") + ".");
}
console.log("\n→ engines/skf/resources.json\n");
