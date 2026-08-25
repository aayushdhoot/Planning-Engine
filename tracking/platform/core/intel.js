// ===================================================================
// DnB-OS · platform/core/intel.js
// The intelligence & testing layer. No assumptions:
//  1. reads what the engine has (input register, with what each gave)
//  2. confronts BOQ quantities with the plan's own take-off, line by line
//  3. turns every gap/conflict into a QUERY with an owner and due date
//  4. re-quantifies the plan from the BOQ where the BOQ is clean
//  5. scores overall readiness, honestly
// ===================================================================

;(function () {

const req = (typeof require !== "undefined");
const DUR = req ? require("../kb/durations.js") : (typeof window!=="undefined"?window.KB_DUR :globalThis.KB_DUR);

const pct = (a, b) => b ? Math.round((a - b) / b * 100) : 100;

// ---- 2. quantity reconciliation ------------------------------------
// v0Totals: {code: qty} from the deck take-off · boqByCode from boq_map
// ROOT-CAUSE STEP: if most quantities are off by roughly the SAME
// ratio, that is one systematic cause (the BOQ's area basis vs the
// deck's), not thirty separate mistakes. Detect it, judge the rest on
// the RESIDUAL — ask once, not thirty times (the QA ask-once cascade).
function reconcile(v0Totals, boqByCode) {
  const codes = {};
  Object.keys(v0Totals).forEach(c => codes[c] = 1);
  Object.keys(boqByCode).forEach(c => codes[c] = 1);

  // systematic bias: median boq/own ratio over codes that have both
  const ratios = [];
  Object.keys(codes).forEach(code => {
    const own = v0Totals[code] || 0, e = boqByCode[code];
    if (own && e && e.qty) ratios.push(e.qty / own);
  });
  ratios.sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
  const basisRatio = (median > 1.05 && median < 1.6 && ratios.length >= 5) ? +median.toFixed(2) : 1;

  const rows = Object.keys(codes).map(code => {
    const norm = DUR.get(code) || {};
    const own = Math.round(v0Totals[code] || 0);
    const boq = boqByCode[code] ? boqByCode[code].qty : null;
    let verdict, delta = null, residual = null;
    if (boq == null) verdict = "no-boq";          // plan has it, BOQ silent
    else if (!own)   verdict = "boq-only";        // BOQ has it, take-off missed it
    else {
      delta = pct(boq, own);
      residual = pct(boq, own * basisRatio);      // after the one systematic cause
      const d = Math.abs(residual);
      verdict = d <= 20 ? "ok" : d <= 45 ? "check" : "conflict";
    }
    return { code, name: norm.name || code, unit: norm.unit || "", trade: norm.trade || "",
      own, boq, delta, residual, verdict,
      lines: boqByCode[code] ? boqByCode[code].lines : [],
      why: boqByCode[code] ? boqByCode[code].why : "" };
  }).sort((a, b) => {
    const w = { conflict: 0, "boq-only": 1, check: 2, "no-boq": 3, ok: 4 };
    return w[a.verdict] - w[b.verdict];
  });
  rows.basisRatio = basisRatio;
  rows.explained = basisRatio !== 1 ? rows.filter(r => r.delta != null && Math.abs(r.residual) <= 20 && Math.abs(r.delta) > 20).length : 0;
  return rows;
}

// ---- 3. queries -----------------------------------------------------
// Every one: plain words, an owner (5 org departments), a due date.
function buildQueries(recon, boqRead, suggestions, ctx) {
  const q = [];
  const add = (id, sev, owner, text, impact) => {
    const e = { id, sev, owner, text, impact, due: ctx.dueISO, status: "open" };
    q.push(e); return e;
  };

  // THE root query: one systematic cause explains many gaps — ask once
  if (recon.basisRatio && recon.basisRatio !== 1)
    add("Q-AREA", "high", "Design",
      `One root issue: the BOQ quantities run ~${Math.round((recon.basisRatio - 1) * 100)}% above the layout take-off across the board (BOQ header says ${(ctx.boqSqft || 14400).toLocaleString("en-IN")} sqft; the deck zones add to ${(ctx.deckSqft || 11900).toLocaleString("en-IN")} sqft carpet). Confirm the true area basis — this one answer settles ${recon.explained} quantity gaps at once.`,
      "all zones");
  else if (ctx.deckSqft && ctx.boqSqft && Math.abs(ctx.boqSqft - ctx.deckSqft) / ctx.deckSqft > 0.1)
    add("Q-AREA", "high", "Design",
      `The BOQ works on ${ctx.boqSqft.toLocaleString("en-IN")} sqft but the design deck zones add up to ${ctx.deckSqft.toLocaleString("en-IN")} sqft carpet. Which area is the truth?`,
      "all zones");

  // the enabling chain runs on an ASSUMED client approval window until
  // the user confirms the contract SLA — no silent assumptions
  if (!(ctx.answers && ctx.answers.aprWd))
    add("Q-APR-SLA", "med", "Commercial",
      "The programme assumes 5 working days for each client design approval (joinery, glazing & doors, furniture, HVAC equipment, ducting, switchgear). Confirm the contractual approval SLA — answer in chat: \"approvals take N days\". To compress further, \"pre-order joinery\" (or \"pre-order everything\") awards POs on approved typicals with client approval running in parallel to gate delivery only.",
      "every design-gated procurement package");

  // corpus contradiction (Emirates vs DHL): duct insulation method differs
  // by site — wrap-after-hang (rule) vs pre-insulated on ground. Ask, don't assume.
  if (!(ctx.answers && ctx.answers.ductMethod))
    add("Q-DUCT-METHOD", "med", "MEP",
      "Duct insulation method is a genuine 2-2 split across the corpus: Emirates + Firstsource wrap AFTER hanging (current default); DHL + TCS Noida pre-insulate on the ground. Site practice, not physics — confirm for THIS site: \"ducts are pre-insulated\" flips the sequence and drops the in-void leak gate; \"wrap after hanging\" keeps the default.",
      "duct_gi, duct_insulation, g_duct_test");

  const askedLines = {};   // one BOQ line -> one question (partition system = 1 ask, not 3)
  recon.forEach(r => {
    const owner = ["hvac","electrical","plumbing","fire","elv"].includes(r.trade) ? "MEP" : "Execution";
    const sig = r.lines.join("+");
    if (sig && askedLines[sig]) { askedLines[sig].impact += ", " + r.code; return; }
    let entry = null;
    if (r.verdict === "conflict")
      entry = add("Q-" + r.code, "high", owner,
        `${r.name}: even after the area basis, the BOQ carries ${r.boq.toLocaleString("en-IN")} ${r.unit} vs the take-off's ${r.own.toLocaleString("en-IN")} ${r.unit} (${r.residual > 0 ? "+" : ""}${r.residual}% beyond it). Which is right? (BOQ ${r.lines.join(", ")})`,
        r.code);
    if (r.verdict === "check")
      entry = add("Q-" + r.code, "med", owner,
        `${r.name}: BOQ ${r.boq.toLocaleString("en-IN")} vs take-off ${r.own.toLocaleString("en-IN")} ${r.unit} (${r.residual > 0 ? "+" : ""}${r.residual}% after the area basis). Confirm before this work is bought.`,
        r.code);
    if (entry && sig) askedLines[sig] = entry;
  });

  // takt-truth: a zone too big for one crew-flow serialises the whole plan
  (ctx.zonesFull || []).forEach(z => {
    if (z.area > 2500)
      add("Q-ZONE-" + z.id, "med", "Execution",
        `${z.name} is ${z.area.toLocaleString("en-IN")} sqft as a single zone — one crew chain through it will sit on the critical path for months. Split it into 2-3 work areas (takt: zones sized to crew flow, by work density). Reply like "split ${z.name.toLowerCase()} into dining and kitchen" with areas, and the engine re-draws.`,
        z.id);
  });

  // time-truth: a plan that starts in the past is fiction — say so, loudly
  if (ctx.todayISO && ctx.intStart && ctx.intStart < ctx.todayISO) {
    const behind = Math.round((new Date(ctx.todayISO) - new Date(ctx.intStart)) / 864e5);
    add("Q-PAST", "high", "Execution",
      `The plan starts ${ctx.intStart} — ${behind} days in the past, and no progress has been recorded against it. Everything scheduled in those ${behind} days is fiction. Say "start from today" (or give the real start) and the engine replans; the contract clock and RA gates stay where the contract put them, so the true pressure becomes visible.`,
      "all zones");
  }

  // KT/handover document context — the engine quotes what the doc says next to its own numbers
  if (ctx.kt) {
    if (ctx.kt.buffers) q.forEach(e => {
      const code = e.id.slice(2);
      if (ctx.kt.buffers[code]) e.text += " · KT note: " + ctx.kt.buffers[code] + ".";
    });
    const area = q.find(e => e.id === "Q-AREA");
    if (area && ctx.kt.areaEvidence)
      area.text += " " + ctx.kt.areaEvidence + " — the engine recommends the layout figure.";
    (ctx.kt.extraQueries || []).forEach(x =>
      q.push({ id: x.id, sev: x.sev, owner: x.owner, text: x.text, impact: x.impact, due: ctx.dueISO, status: "open" }));
  }

  // scopes the plan carries but the BOQ never priced (only meaningful when a BOQ exists)
  const noBoq = ctx.hasBoq === false ? [] : recon.filter(r => r.verdict === "no-boq").map(r => r.name);
  if (noBoq.some(n => /waterproof/i.test(n)))
    add("Q-WET", "high", "Commercial",
      "The BOQ has no waterproofing, blockwork or plaster lines — the wet-area works (washrooms, pantry) are unpriced. Is that scope with the landlord, a separate package, or missing from the BOQ?",
      "washrooms, pantry");
  if (noBoq.some(n => /putty|primer/i.test(n)))
    add("Q-PREP", "med", "Execution",
      "The BOQ prices paint but no putty/primer line. Is surface prep inside the paint rate, or missing? The plan carries prep days either way.",
      "painting, all zones");
  if (recon.find(r => r.code === "sanitary_fixture" && r.verdict !== "ok"))
    add("Q-SANITARY", "high", "Purchase",
      "Kohler sanitaryware is free-issue, but the BOQ prices no washroom fixture installation labour (only sinks/geysers/RO). Who carries the install of the free-issue fixtures?",
      "washrooms");
  if (noBoq.some(n => /raised/i.test(n)))
    add("Q-RAISED", "low", "Design",
      "The plan assumes a raised floor in the server/hub room; the BOQ has no such line. Confirm the hub-room floor spec.",
      "hub room");

  // real work the BOQ prices that the plan has no task for
  suggestions.forEach(s =>
    add("Q-ADD-" + s.line, "med", ["hvac"].includes(s.phase) ? "MEP" : ["electrical","elv"].includes(s.phase) ? "MEP" : "Execution",
      `The BOQ prices "${s.name}" (${s.qty}, line ${s.line}) but the plan has no such task. Say OK and the engine adds it to the right phase (${s.phase}).`,
      s.phase));

  const w = { high: 0, med: 1, low: 2 };
  return q.sort((a, b) => w[a.sev] - w[b.sev]);
}

// ---- 4. re-quantify the plan from the BOQ ---------------------------
// Where the BOQ gives a clean total for a code, scale that code's zone
// tasks so they sum to the BOQ figure (zone shares kept). Confidence:
// boq-backed -> high (ok) / med (check|conflict, until the query closes)
// deck-factor only -> stays the zone's own confidence, flagged assumption.
function applyQuantities(tasks, recon, resolved) {
  resolved = resolved || {};
  const byCode = {}; recon.forEach(r => byCode[r.code] = r);
  const totals = {};
  tasks.forEach(t => totals[t.code] = (totals[t.code] || 0) + t.qty);
  return tasks.map(t => {
    const r = byCode[t.code], pick = resolved[t.code];
    if (!r || !totals[t.code])
      return Object.assign({}, t, { src: "deck area × factor — assumption, confirm", qsrc: "factor" });
    // your resolution wins; else BOQ where it speaks; else factor
    let target = null, src = "", conf = null;
    if (pick === "own")      { target = r.own; src = "layout take-off confirmed by you (areas × factors — not from drawings)"; conf = "high"; }
    else if (pick === "boq") { target = r.boq; src = "BOQ confirmed by you (" + r.lines.join("+") + ")"; conf = "high"; }
    else if (r.boq != null)  { target = r.boq; src = "BOQ " + r.lines.join("+") + " · zone share from deck"; conf = r.verdict === "ok" ? "high" : "med"; }
    if (target == null)
      return Object.assign({}, t, { src: "deck area × factor — assumption, confirm", qsrc: "factor" });
    const scaled = Math.max(1, Math.round(t.qty * target / totals[t.code]));
    return Object.assign({}, t, { qty: scaled, conf, src, qsrc: pick ? "resolved" : "boq" });
  });
}

// ---- 5. readiness ----------------------------------------------------
function readiness(recon, queries, inputs) {
  const total = recon.length;
  const okQty = recon.filter(r => r.verdict === "ok" || r.verdict === "resolved").length;
  const highQ = queries.filter(x => x.sev === "high" && x.status === "open").length;
  const inputsIn = inputs.filter(i => i.status === "read").length;
  const score = Math.round(
    50 * (okQty / Math.max(1, total)) +
    30 * Math.max(0, 1 - highQ / 5) +
    20 * (inputsIn / inputs.length));
  return { score, band: score >= 80 ? "High" : score >= 55 ? "Medium" : "Low",
    okQty, total, highQ, inputsIn, inputsTotal: inputs.length };
}

const INTEL = { reconcile, buildQueries, applyQuantities, readiness };
(function (g) { g.CORE_INTEL = INTEL; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = INTEL;

})();
