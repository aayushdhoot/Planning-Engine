// ===================================================================
// DnB-OS · platform/core/verify.js
// The pre-publish testing layers. We rely on an AI plan completely,
// so the plan must PROVE itself before it carries a signature.
// Descended from the QA engine's verify harness (3.0, 68 checks) —
// same spirit, deeper physics: this one audits the schedule itself.
//
// Ten layers:  1 inputs · 2 scope · 3 quantities · 4 durations
//              5 logic/physics · 6 calendar · 7 crews · 8 commitment
//              9 regression · 10 sign-off
//
// verify(ctx) -> { checks:[{id,layer,name,status,detail}],
//                  summary:{pass,warn,fail,total}, layers:[...] }
// status: pass · warn (needs acknowledgment) · fail (blocks publish)
// ===================================================================

;(function () {

const req = (typeof require !== "undefined");
const CAL = req ? require("../kb/calendar.js")  : (typeof window!=="undefined"?window.KB_CAL :globalThis.KB_CAL);
const DUR = req ? require("../kb/durations.js") : (typeof window!=="undefined"?window.KB_DUR :globalThis.KB_DUR);
const SEQ = req ? require("../kb/sequence.js")  : (typeof window!=="undefined"?window.KB_SEQ :globalThis.KB_SEQ);

const SQFT = 0.0929;
const addCal = (iso, n) => CAL._iso(CAL._add(CAL._d(iso), n));
const dayDiff = (a, b) => Math.round((CAL._d(b) - CAL._d(a)) / 86400000);

function verify(ctx) {
  const C = [];
  const add = (id, layer, name, status, detail) => C.push({ id, layer, name, status, detail: detail || "" });
  const P = (id, l, n, d) => add(id, l, n, "pass", d);
  const W = (id, l, n, d) => add(id, l, n, "warn", d);
  const F = (id, l, n, d) => add(id, l, n, "fail", d);
  const T = (id, l, n, ok, dPass, dFail, failHard) =>
    ok ? P(id, l, n, dPass) : (failHard ? F(id, l, n, dFail) : W(id, l, n, dFail));

  const plan = ctx.plan, tasks = ctx.tasks || [];
  const real = plan.tasks.filter(t => !t.gate);
  const intel = ctx.intel || {};
  const win = ctx.win, cal = ctx.cal, ans = ctx.answers || {};
  const zones = (ctx.zones || []).filter(z => !(ans.zonesOff || []).includes(z.id));
  const L = { in: "1 · Inputs", scope: "2 · Scope", qty: "3 · Quantities", dur: "4 · Durations",
    logic: "5 · Logic & physics", cal: "6 · Calendar", crew: "7 · Crews", commit: "8 · Commitment",
    reg: "9 · Regression", sign: "10 · Sign-off" };

  // ================= 1 · INPUTS =====================================
  const read = intel.read || {};
  if (ctx.boqLines > 0)
    T("IN-1", L.in, "Every BOQ line read and accounted for",
      (read.unread || []).length === 0,
      ctx.boqLines + " lines: all mapped or classified",
      (read.unread || []).length + " BOQ lines unaccounted — money with no home", true);
  else
    W("IN-1", L.in, "No BOQ read yet", "plan rides on layout areas × standard factors — drop the priced BOQ to harden it");
  T("IN-2", L.in, "Must-have inputs present (BOQ, layout, dates)",
    (intel.inputs || []).slice(0, 3).every(i => i.status === "read"),
    "BOQ + zones + dates all in",
    "a must-have input is missing or unconfirmed");
  T("IN-3", L.in, "Area basis settled",
    !!ans.areaBasis || !(intel.recon && intel.recon.basisRatio > 1),
    ans.areaBasis ? "you confirmed: " + (ans.areaBasis === "boq" ? "the BOQ area" : "the layout area") : "sources agree",
    "the two sources still disagree on the floor area itself — answer it on Inputs");
  T("IN-4", L.in, "All four dates confirmed by a human",
    !!ans.datesConfirmed && !!win.intEnd,
    "internal " + win.intStart + "→" + win.intEnd + " · external " + win.extStart + "→" + win.extEnd,
    "dates are typed in but not confirmed");

  // ================= 2 · SCOPE ======================================
  const noSource = tasks.filter(t => !t.src && !t.qsrc);
  T("SC-1", L.scope, "Every task traces to a source", noSource.length === 0,
    "all " + tasks.length + " tasks carry provenance (BOQ line, deck factor, or your word)",
    noSource.length + " orphan tasks with no source", true);
  const factorShare = tasks.length ? tasks.filter(t => t.qsrc === "factor").length / tasks.length : 0;
  T("SC-2", L.scope, "Assumption share is contained", factorShare <= 0.35,
    Math.round(factorShare * 100) + "% of tasks on deck factors (flagged), rest BOQ/your word",
    Math.round(factorShare * 100) + "% of tasks still ride on assumptions — feed more inputs");
  // zone-trait completeness
  const byZone = {}; tasks.forEach(t => (byZone[t.zone] = byZone[t.zone] || new Set()).add(t.code));
  const missTrait = [];
  zones.forEach(z => {
    const has = byZone[z.id] || new Set();
    if (z.wet && !has.has("waterproofing")) missTrait.push(z.name + ": wet zone, no waterproofing");
    if (z.wet && !has.has("tile_vitrified")) missTrait.push(z.name + ": wet zone, no tiling");
    if (z.ac && !has.has("fcu_unit")) missTrait.push(z.name + ": AC zone, no indoor units");
    if (!has.has("final_clean")) missTrait.push(z.name + ": no final clean");
    if (z.demo && !has.has("demo_floor_finish")) missTrait.push(z.name + ": demolition expected, none planned");
  });
  T("SC-3", L.scope, "Every zone carries the work its nature demands", missTrait.length === 0,
    zones.length + " zones complete against their traits (wet→waterproofing, AC→units, all→clean)",
    missTrait.slice(0, 3).join(" · ") + (missTrait.length > 3 ? " · +" + (missTrait.length - 3) + " more" : ""), true);
  const openAdds = (intel.queries || []).filter(q => q.id.startsWith("Q-ADD-")).length;
  T("SC-4", L.scope, "BOQ-priced work with no task: decided", openAdds === 0,
    "every suggestion accepted or dismissed",
    openAdds + " priced works still undecided (add or dismiss on Intelligence)");
  const badZone = tasks.filter(t => t.zone && t.zone !== "site" && !ctx.zones.find(z => z.id === t.zone));
  T("SC-5", L.scope, "No task points at an unknown zone", badZone.length === 0,
    "all zones known", badZone.length + " tasks in unknown zones", true);
  P("SC-6", L.scope, "Conscious exclusions",
    (ans.zonesOff || []).length ? "excluded by your instruction: " + ans.zonesOff.join(", ") : "full scope in play");

  // ================= 3 · QUANTITIES =================================
  const zeroQ = tasks.filter(t => !(t.qty > 0));
  T("QT-1", L.qty, "No zero or negative quantities", zeroQ.length === 0,
    "all " + tasks.length + " quantities positive", zeroQ.length + " tasks with no quantity", true);
  const floorM2 = zones.reduce((s, z) => s + z.area, 0) * SQFT;
  const sumBy = codes => tasks.filter(t => codes.includes(t.code)).reduce((s, t) => s + t.qty, 0);
  const band = (id, name, val, lo, hi, unit) =>
    T(id, L.qty, name, val >= lo && val <= hi,
      val.toFixed(2) + " " + unit + " — inside the sane band " + lo + "–" + hi,
      val.toFixed(2) + " " + unit + " — outside the sane band " + lo + "–" + hi + " (decimal slip? unit slip?)");
  band("QT-2", "Floor finishes ≈ floor area", sumBy(["tile_vitrified","carpet_tile","stone_marble","vinyl_lvt","raised_floor"]) / floorM2, 0.6, 1.6, "× floor");
  band("QT-3", "Paint area vs floor area", sumBy(["paint_emulsion"]) / floorM2, 0.8, 3.0, "× floor");
  band("QT-4", "Light fixtures density", (zones.reduce((s,z)=>s+z.area,0)) / Math.max(1, sumBy(["light_fixture"])), 15, 130, "sqft per fixture");
  band("QT-5", "Ceiling cover vs floor area", sumBy(["ceiling_gypsum","ceiling_grid_tile"]) / floorM2, 0.5, 1.3, "× floor");
  // both faces count — board_one_face + board_close together must skin
  // the frame twice (the old check counted one face: ratio pinned at 1.0)
  const frame = sumBy(["gi_stud_frame"]), board = sumBy(["board_one_face", "board_close"]);
  T("QT-6", L.qty, "Partition system consistent (both faces ≈ 2× frame)",
    frame === 0 || (board / frame >= 1.5 && board / frame <= 2.5),
    "board/frame ratio " + (frame ? (board / frame).toFixed(2) : "—"),
    "board vs frame ratio " + (frame ? (board / frame).toFixed(2) : "—") + " — one of them is wrong");
  const openConf = (intel.recon || []).filter(r => r.verdict === "conflict").length;
  T("QT-7", L.qty, "Source conflicts settled", openConf === 0,
    "no open BOQ-vs-drawings conflicts",
    openConf + " quantity conflicts still open — resolve on Intelligence");

  // ================= 4 · DURATIONS ==================================
  const badCode = tasks.filter(t => !DUR.get(t.code));
  T("DU-1", L.dur, "Every task priced by a published rate", badCode.length === 0,
    "all durations derive from sourced rates (Methvin/CPWD/SMACNA/BICSI)",
    badCode.length + " tasks with unknown rate codes", true);
  // enabling-chain waits (manufacture legs) are vendor time, not gang
  // work — splitting them across crews is meaningless
  const longOnes = real.filter(t => t.durWD > 15 && !t.parts && t.trade !== "enabling");
  T("DU-2", L.dur, "No unsplit marathon task", longOnes.length === 0,
    "nothing runs beyond 15 working days on one gang",
    longOnes.length + " tasks exceed 15 days unsplit: " + longOnes.slice(0, 2).map(t => t.name).join(", "));
  const lowConfWD = real.filter(t => t.conf === "low").reduce((s, t) => s + t.durWD, 0);
  const totWD = real.reduce((s, t) => s + t.durWD, 0);
  T("DU-3", L.dur, "Low-confidence share of the work", totWD === 0 || lowConfWD / totWD <= 0.25,
    Math.round(lowConfWD / Math.max(1, totWD) * 100) + "% of working days on low-confidence rates",
    Math.round(lowConfWD / Math.max(1, totWD) * 100) + "% of working days ride on low-confidence rates");

  // ================= 5 · LOGIC & PHYSICS ============================
  // ---- LG-0: the rulebook itself is sound. Every code the library
  // references must resolve to a published norm — a typo in AFTER or a
  // gate pointing at a code that doesn't exist produces ZERO links and
  // fails silently everywhere downstream. Check the library first.
  {
    const badRefs = [];
    const chk = (c, where) => { if (!DUR.get(c)) badRefs.push(c + " (" + where + ")"); };
    Object.keys(SEQ.AFTER || {}).forEach(k => {
      chk(k, "AFTER key");
      (SEQ.AFTER[k] || []).forEach(r => chk(r.of, "AFTER pred of " + k));
    });
    (SEQ.GATE_RULES || []).forEach(g => {
      (g.from || []).forEach(c => chk(c, g.id + ".from"));
      (g.to || []).forEach(c => chk(c, g.id + ".to"));
    });
    const SR = SEQ.SITE_RULES || {};
    (SR.runway || []).forEach(r => chk(r.from, "runway.from"));
    Object.keys(SR.tc || {}).forEach(k => { chk(k, "tc key"); SR.tc[k].forEach(c => chk(c, "tc." + k)); });
    (SR.protectionAfter || []).forEach(c => chk(c, "protectionAfter"));
    (SR.chain || []).forEach(c => { chk(c.code, "chain.code"); (c.afterCodes || []).forEach(a => chk(a, "chain.after of " + c.code)); });
    ((SEQ.CONCURRENCY || {}).never_together || []).forEach((r, i) => {
      (r.a || []).forEach(c => chk(c, "never_together[" + i + "].a"));
      if (Array.isArray(r.b)) r.b.forEach(c => chk(c, "never_together[" + i + "].b"));
    });
    Object.keys(SEQ.LONGLEAD || {}).forEach(k => chk(k, "LONGLEAD"));
    (SEQ.PACKAGES || []).forEach(p => p.codes.forEach(c => chk(c, "PACKAGES." + p.id)));
    // reachability: an EMPTY table means the rulebook is invisible to this
    // verifier (not exported / renamed) — that is a failure, never a pass
    [["AFTER", Object.keys(SEQ.AFTER || {}).length],
     ["GATE_RULES", (SEQ.GATE_RULES || []).length],
     ["SITE_RULES.chain", ((SEQ.SITE_RULES || {}).chain || []).length],
     ["CONCURRENCY.never_together", (((SEQ.CONCURRENCY || {}).never_together) || []).length],
     ["LONGLEAD", Object.keys(SEQ.LONGLEAD || {}).length],
    ].forEach(([nm, n]) => { if (!n) badRefs.push(nm + " EMPTY/UNREACHABLE"); });
    T("LG-0", L.logic, "Rulebook integrity: every table reachable, every referenced code resolves",
      badRefs.length === 0,
      "AFTER, gates, site rules, concurrency and leads all present and referencing real codes",
      [...new Set(badRefs)].slice(0, 4).join(" · ") + " — dead references and invisible tables fail SILENTLY", true);
  }
  // rebuild the exact graph the leveler used (same splitting rule)
  let split = tasks.reduce((acc, t) => {
    if (t.zone === "site") { acc.push(t); return acc; } // same exemption as the leveler
    const d = DUR.deriveDays(t.code, t.qty, { crew: t.crew });
    const cap = (ctx.zoneCaps || {})[t.zone] || Infinity;
    const S = Math.min(Math.ceil(d.days / 10), plan.fronts || 1, Math.max(1, Math.floor(cap / d.crew)), 4);
    if (S <= 1) { acc.push(t); return acc; }
    // mirrors takt EXACTLY: last part carries the remainder (D3)
    const per = Math.round(t.qty / S);
    for (let i = 1; i <= S; i++) acc.push(Object.assign({}, t, { id: t.id + "#" + i, qty: i === S ? t.qty - per * (S - 1) : per }));
    return acc;
  }, []);
  const linked = SEQ.deriveLinks(split);
  const byId = {}; plan.tasks.forEach(t => byId[t.id] = t);
  let cyc = false;
  try { const CPM = req ? require("./cpm.js") : (window.CORE_CPM || globalThis.CORE_CPM); CPM.topo(linked.nodes.map(n => n.id), linked.edges); }
  catch (e) { cyc = true; }
  T("LG-1", L.logic, "No circular logic in the plan graph", !cyc, linked.edges.length + " dependencies, zero cycles", "the dependency graph loops on itself", true);
  let fsBad = 0, ssBad = 0, cureBad = 0, missNode = 0, factDefied = 0;
  const isFact = t => t && (t.done || t.started || t.boundBy === "actual");
  linked.edges.forEach(e => {
    const a = byId[e.from], b = byId[e.to];
    if (!a || !b) { missNode++; return; }
    // recorded ACTUALS may defy the rulebook — the site already did it.
    // Facts are never "violations"; they are LEARNING (PR-3 counts them).
    const fact = isFact(a) || isFact(b);
    if (e.type === "SS") { if (b.ES < a.ES) { fact ? factDefied++ : ssBad++; } }
    else {
      // same law as the scheduler: work may start the DAY of a zero-lag
      // gate (morning inspection), but never before a real predecessor ends
      if (a.gate ? b.ES < a.EF : b.ES <= a.EF) { fact ? factDefied++ : fsBad++; }
      if (e.lag >= 7 && dayDiff(a.EF, b.ES) < e.lag) { fact ? factDefied++ : cureBad++; }
    }
  });
  T("LG-2", L.logic, "Every finish-to-start link honored", fsBad === 0 && missNode === 0,
    "all sequence links hold in the final dates", fsBad + " links violated, " + missNode + " nodes missing", true);
  T("LG-3", L.logic, "Every overlap link honored", ssBad === 0, "start-to-start offsets hold", ssBad + " overlap links violated", true);
  T("LG-4", L.logic, "Physics lags kept (screed cure, drying)", cureBad === 0,
    "7-day cures preserved across weekends too", cureBad + " cure lags squeezed", true);
  // ---- LG-7: the research-backed ORDER RULES, verified on final dates
  // (each rule: every "after" task must start at/after every "before" task's finish, per zone or site-wide)
  if (SEQ.ORDER_RULES) {
    let orBad = [], orChecked = 0;
    SEQ.ORDER_RULES.forEach(rule => {
      const scopeKeys = rule.scope === "zone"
        ? [...new Set(real.map(t => t.zone).filter(z => z && z !== "site"))]
        : ["__site__"];
      scopeKeys.forEach(zk => {
        const inScope = t => rule.scope === "zone" ? t.zone === zk : true;
        const noFact = t => !(t.done || t.started || t.boundBy === "actual");
        const A = real.filter(t => rule.after.includes(t.code) && inScope(t) && noFact(t));
        const B = real.filter(t => rule.before.includes(t.code) && inScope(t) && noFact(t));
        if (!A.length || !B.length) return;
        orChecked++;
        const aStart = A.map(t => t.ES).sort()[0];
        if (rule.ss) { // declared overlap: A may run alongside B but never start first
          const bStart = B.map(t => t.ES).sort()[0];
          if (aStart < bStart) orBad.push(rule.id + (rule.scope === "zone" ? " @" + zk : ""));
        } else {
          const bEnd = B.map(t => t.EF || t.end).sort().pop();
          if (aStart < bEnd) orBad.push(rule.id + (rule.scope === "zone" ? " @" + zk : ""));
        }
      });
    });
    T("LG-7", L.logic, "Site physics rulebook (researched, " + SEQ.ORDER_RULES.length + " rules)",
      orBad.length === 0,
      orChecked + " rule-instances hold — no wall closes on unfinished services, no ceiling seals an unsigned void",
      orBad.slice(0, 4).join(" · ") + (orBad.length > 4 ? " +" + (orBad.length - 4) + " more" : ""), true);
  }
  // ---- LG-8..10: schedule-quality (DCMA-style, on the derived graph)
  {
    const hasPred = new Set(), hasSucc = new Set();
    linked.edges.forEach(e => { hasPred.add(e.to); hasSucc.add(e.from); });
    const mids = linked.nodes.filter(n => !n.gate && !["mobilisation","final_clean","signage_evac","gfc_pack","samples_mockups"].includes(n.code));
    const dangling = mids.filter(n => !hasPred.has(n.id) && !hasSucc.has(n.id)).length;
    const share = mids.length ? dangling / mids.length : 0;
    T("LG-8", L.logic, "No dangling tasks (DCMA point 1, ≤5%)", share <= 0.05,
      Math.round(share * 100) + "% of tasks unlinked — the logic net is dense",
      dangling + " tasks float free of all logic (" + Math.round(share * 100) + "%)");
    const ss = linked.edges.filter(e => e.type === "SS").length;
    T("LG-9", L.logic, "Link mix mostly finish-to-start (DCMA point 4, ≥90%)",
      ss / linked.edges.length <= 0.10,
      Math.round((1 - ss / linked.edges.length) * 100) + "% FS links",
      "SS share " + Math.round(ss / linked.edges.length * 100) + "% — overlap logic hiding hand-offs");
    const negLag = linked.edges.filter(e => (e.lag || 0) < 0).length;
    T("LG-10", L.logic, "Zero negative lags (DCMA point 2)", negLag === 0,
      "no leads faking overlap", negLag + " negative lags", true);
  }
  // ---- LG-11: CONCURRENCY.never_together verified on FINAL dates.
  // The rulebook declares what may never share a zone-day (nothing under
  // live strip-out, no sanding over laid carpet, nobody on green screed).
  // Declared but unverified = decoration. This is the verifier.
  {
    const NT = ((SEQ.CONCURRENCY || {}).never_together) || [];
    const shareWD = (t1, t2) => {
      const s = t1.ES > t2.ES ? t1.ES : t2.ES;
      const e = t1.EF < t2.EF ? t1.EF : t2.EF;
      if (!s || !e || s > e) return false;
      for (let d = s; d <= e; d = addCal(d, 1)) if (CAL.isWorkingDay(d, cal)) return true;
      return false;
    };
    const zn = {};
    real.forEach(t => { if (t.done || t.started || t.boundBy === "actual") return; // facts beat physics — PR-3 owns them
      if (t.zone && t.zone !== "site") (zn[t.zone] = zn[t.zone] || []).push(t); });
    const viol = new Set();
    Object.keys(zn).forEach(z => {
      const zs = zn[z];
      NT.forEach(r => {
        const As = zs.filter(t => r.a.includes(t.code));
        if (!As.length) return;
        const Bs = r.b === "*" ? zs.filter(t => !r.a.includes(t.code))
                               : zs.filter(t => Array.isArray(r.b) && r.b.includes(t.code));
        As.forEach(a => Bs.forEach(b => { if (shareWD(a, b)) viol.add(z + ": " + a.code + " × " + b.code); }));
      });
    });
    const vv = [...viol];
    if (!NT.length)
      // an empty rule table means the rulebook is unreachable — that is
      // a wiring failure, never a pass (this exact check once passed
      // vacuously because CONCURRENCY was not exported)
      F("LG-11", L.logic, "Never-together pairs never share a zone-day",
        "ZERO concurrency rules visible to the verifier — CONCURRENCY is missing or not exported; the check cannot run");
    else
      T("LG-11", L.logic, "Never-together pairs never share a zone-day (" + NT.length + " rules)",
        vv.length === 0,
        "no trade works under strip-out, over green screed or beside sanding dust — on final dates",
        vv.slice(0, 4).join(" · ") + (vv.length > 4 ? " +" + (vv.length - 4) + " more" : ""), true);
  }

  const gates = plan.gates || [];
  const wetZones = zones.filter(z => z.wet).map(z => z.id);
  const wpGates = gates.filter(g => g.id.startsWith("g_waterproof")).map(g => g.zone);
  T("LG-5", L.logic, "Coordination holds land where the work is",
    wetZones.every(z => wpGates.includes(z)),
    gates.length + " holds placed; waterproofing tests in every wet zone",
    "a wet zone is missing its waterproofing hold", true);
  // islands: every task reachable from a start
  const indeg = {}; linked.nodes.forEach(n => indeg[n.id] = 0);
  linked.edges.forEach(e => { if (indeg[e.to] != null) indeg[e.to]++; });
  const qq = linked.nodes.filter(n => indeg[n.id] === 0).map(n => n.id);
  const outMap = {}; linked.edges.forEach(e => (outMap[e.from] = outMap[e.from] || []).push(e.to));
  const seen = new Set(qq);
  while (qq.length) { const n = qq.shift(); (outMap[n] || []).forEach(m => { if (!seen.has(m)) { seen.add(m); qq.push(m); } }); }
  T("LG-6", L.logic, "No orphan islands", seen.size === linked.nodes.length,
    "every task connected to the chain", (linked.nodes.length - seen.size) + " tasks float unconnected", true);

  // ================= 6 · CALENDAR ===================================
  let nonWork = 0;
  plan.tasks.forEach(t => {
    if (t.gate) return;
    if (!CAL.isWorkingDay(t.ES, cal)) nonWork++;
    if (!CAL.isWorkingDay(t.EF, cal)) nonWork++;
  });
  T("CA-1", L.cal, "No task starts or ends on a dead day", nonWork === 0,
    "Sundays and shut-days clean", nonWork + " task edges land on non-working days", true);
  // CA-2 (rebuilt — the old form counted tasks spanning a shut day that
  // isWorkingDay already refused: a tautology, it could never fire).
  // The honest check: every declared shut day inside the plan span must
  // actually be REJECTED by the calendar function. This catches the real
  // failure class — a mis-formatted date or unwired holiday entry
  // (exactly how Dussehra went missing) — where the list says "shut"
  // but the working-day math happily books work on it.
  const deadShut = (cal.holidays || []).filter(h =>
    h.siteOff && h.date >= plan.projectStart && h.date <= plan.projectEnd && CAL.isWorkingDay(h.date, cal));
  T("CA-2", L.cal, "Every declared shut day is honoured by the calendar math",
    deadShut.length === 0,
    (cal.holidays || []).filter(h => h.siteOff).length + " shut days all refuse work",
    deadShut.map(h => h.date + " (" + (h.name || "?") + ")").slice(0, 3).join(" · ") + " — declared shut but the calendar still books work on it", true);
  T("CA-3", L.cal, "Plan starts on/after the internal start",
    plan.projectStart >= win.intStart, "starts " + plan.projectStart, "plan starts before " + win.intStart, true);
  // CA-4 (rebuilt — the old form ended in "|| true": it could never fail).
  // Honest form: every rain-sensitive task with working days inside the
  // monsoon window must carry a recorded weather driver. If drag were
  // silently disabled, every monsoon date in the plan would be fiction.
  {
    const mw = cal.monsoon || {};
    const overlapsMonsoon = t => mw.from && mw.to && t.ES <= mw.to && t.EF >= mw.from;
    const rainy = real.filter(t => (DUR.get(t.code) || {}).rain && overlapsMonsoon(t));
    // any recorded driver counts: festival windows re-tag monsoon days,
    // so demanding the literal "monsoon" cause would false-fail those
    const undragged = rainy.filter(t => !(t.drivers || []).length);
    T("CA-4", L.cal, "Monsoon drag applied where rain bites",
      rainy.length === 0 || undragged.length === 0,
      rainy.length ? rainy.length + " rain-sensitive tasks in the monsoon window, all carrying weather drag" : "no rain-sensitive work falls inside the monsoon window",
      undragged.length + " rain-sensitive tasks sit in the monsoon window with NO drag recorded: " + undragged.slice(0, 3).map(t => t.code).join(", ") + " — the weather engine is not biting", true);
  }

  const todayISO = new Date().toISOString().slice(0, 10);
  if (win.intStart && win.intStart < todayISO)
    W("CA-5", L.cal, "Plan starts in the past",
      dayDiff(win.intStart, todayISO) + " days of the plan are behind today with no recorded progress — replan from the real start ('start from today') or record what is actually done");
  else
    P("CA-5", L.cal, "Plan starts today or later", "the programme begins at " + win.intStart);

  // ================= 6b · PROGRESS (recorded reality) ===============
  {
    const todayI = new Date().toISOString().slice(0, 10);
    const doneT = real.filter(t => t.done);
    const runT  = real.filter(t => t.started && !t.done);
    const stale = real.filter(t => !t.done && !t.started && t.EF < todayI);
    if (doneT.length || runT.length)
      P("PR-0", L.cal, "Recorded reality drives the plan",
        doneT.length + " done + " + runT.length + " running — facts pinned, remainder rescheduled");
    T("PR-1", L.cal, "No task silently past its finish", stale.length === 0,
      "everything past-due carries a recorded fact",
      stale.length + " tasks are past their planned finish with NO progress recorded (" + stale.slice(0, 3).map(t => t.name || t.code).join(" · ") + ") — say \"<task> done\" or \"<task> started\"");
    if (doneT.length) {
      // rate learning applies to SITE work; approval/PO facts calibrate SLAs, not rates
      const deltas = doneT.filter(t => t.qty > 0 && t.trade !== "enabling").map(t => {
        const lib = DUR.deriveDays(t.code, t.qty).days;
        return { code: t.code, plan: +lib.toFixed(1), act: t.durWD };
      }).filter(d => d.plan > 0 && Math.abs(d.act - d.plan) / d.plan > 0.3).slice(0, 4);
      P("PR-2", L.cal, "Actuals vs library (the learning feed)",
        deltas.length ? "corpus candidates: " + deltas.map(d => d.code + " " + d.plan + "→" + d.act + "wd").join(" · ") : "completed work ran within ±30% of the library rates");
    }
    T("PR-3", L.cal, "Recorded facts vs the rulebook", factDefied === 0,
      "no recorded actual contradicts the sequence rules",
      factDefied + " rulebook relations were DEFIED by recorded actuals — the site did it differently; tell the LEARNING panel why (rule wrong, or site took the rework risk)");
  }

  // ================= 7 · CREWS ======================================
  const gk = {};
  real.forEach(t => { if (t.gangNo) (gk[t.trade + "#" + t.gangNo] = gk[t.trade + "#" + t.gangNo] || []).push(t); });
  let overlap = 0;
  Object.values(gk).forEach(list => {
    const iv = list.slice().sort((a, b) => a.ES < b.ES ? -1 : 1);
    for (let i = 1; i < iv.length; i++) if (iv[i].ES <= iv[i - 1].EF) overlap++;
  });
  T("CR-1", L.crew, "No gang in two places at once", overlap === 0,
    Object.keys(gk).length + " gangs, zero double-booking", overlap + " gang overlaps", true);
  let capBreach = 0;
  const load = {};
  real.forEach(t => {
    const crew = (DUR.get(t.code) || {}).crew || 2;
    for (let d = t.ES; d <= t.EF; d = addCal(d, 1)) {
      if (!CAL.isWorkingDay(d, cal)) continue;
      const k = t.zone + "|" + d;
      load[k] = (load[k] || 0) + crew;
    }
  });
  Object.keys(load).forEach(k => { const z = k.split("|")[0]; const cap = (ctx.zoneCaps || {})[z]; if (cap && load[k] > cap) capBreach++; });
  T("CR-2", L.crew, "Zone congestion inside the ceiling", capBreach === 0,
    "225 sqft per worker respected in every zone on every day", capBreach + " zone-day breaches", true);
  T("CR-3", L.crew, "Peak site manpower is realistic", plan.peakWorkers <= 60,
    plan.peakWorkers + " workers on the busiest day", plan.peakWorkers + " workers on the busiest day — check the site can hold it");
  const today = new Date().toISOString().slice(0, 10);
  const lateOrders = (ctx.leads || []).filter(l => l.orderBy < today);
  T("CR-4", L.crew, "No purchase order already late", lateOrders.length === 0,
    "all order-by dates ahead of today", lateOrders.length + " long-leads must be ordered NOW: " + lateOrders.map(l => l.name).slice(0, 2).join(", "));

  // CR-5: overmanning (Hanna JCEM 2007 — peak/avg crew per trade; losses 0-41%)
  {
    const byTrade = {};
    real.forEach(t => {
      const n = DUR.get(t.code); if (!n) return;
      if (n.trade === "enabling") return; // desks and vendors, not site manpower
      const tr = n.trade; const b = byTrade[tr] = byTrade[tr] || [];
      b.push({ s: t.ES, e: t.EF, crew: n.crew || 1 });
    });
    const bad = [];
    Object.keys(byTrade).forEach(tr => {
      const xs = byTrade[tr]; if (xs.length < 4) return;
      const bounds = [...new Set(xs.flatMap(x => [x.s, x.e]))].sort();
      let peak = 0, area = 0, span = 0;
      for (let i = 0; i < bounds.length - 1; i++) {
        const day = bounds[i];
        const load = xs.filter(x => x.s <= day && x.e > day).reduce((a, x) => a + x.crew, 0);
        const w = Math.max(1, dayDiff(bounds[i], bounds[i + 1]));
        peak = Math.max(peak, load); area += load * w; span += w;
      }
      const avg = span ? area / span : 0;
      if (avg > 0 && peak / avg > 1.8) bad.push(tr + " " + (peak / avg).toFixed(1) + "x (peak " + peak + ")");
    });
    T("CR-5", L.crew, "Trade manpower histograms are single-peaked (overmanning)",
      bad.length === 0,
      "peak-to-average within 1.8x on every trade — crews flow, not stack",
      bad.slice(0, 3).join(" · ") + " — Hanna: overmanning costs 0-41% productivity; level the histogram or split zones");
  }

  // ================= 8 · COMMITMENT =================================
  const STAT_WAIT = ["fire_noc"]; // statutory windows run past works completion; contract completion = works done
  const worksEnd = real.filter(t => !STAT_WAIT.includes(t.code)).map(t => t.EF).sort().pop() || plan.projectEnd;
  T("CM-1", L.commit, "Works complete inside the external (client) date",
    worksEnd <= win.extEnd,
    worksEnd + " vs committed " + win.extEnd + " — " + dayDiff(worksEnd, win.extEnd) + " days clear" + (worksEnd !== plan.projectEnd ? " (statutory window runs to " + plan.projectEnd + ")" : ""),
    "works run to " + worksEnd + ", breaching the client commitment by " + dayDiff(win.extEnd, worksEnd) + " days", true);
  T("CM-2", L.commit, "Finish inside the internal deadline",
    !win.intEnd || plan.projectEnd <= win.intEnd,
    win.intEnd ? dayDiff(plan.projectEnd, win.intEnd) + " days before internal" : "no internal deadline set",
    "past the internal deadline by " + (win.intEnd ? dayDiff(win.intEnd, plan.projectEnd) : "?") + " days — accept or recover");
  // CM-3 (fixed quantity: gates on the chain inflated the numerator —
  // count only real tasks on the critical path against real tasks)
  const critReal = (plan.criticalPath || []).filter(id => { const t = byId[id]; return t && !t.gate; });
  const critShare = real.length ? critReal.length / real.length : 0;
  T("CM-3", L.commit, "Plan is not brittle", critShare <= 0.2,
    Math.round(critShare * 100) + "% of tasks on the critical chain — healthy slack elsewhere",
    Math.round(critShare * 100) + "% of the plan sits at zero float — one sneeze moves the date");
  T("CM-4", L.commit, "Compression within the rework threshold",
    (plan.fronts || 1) <= 6,
    plan.fronts + " fronts — inside the congestion-safe range",
    plan.fronts + " fronts — deadline-first manpower (his call): zone congestion caps still hold, but past ~6 fronts research says every compressed week breeds 1.4-1.8 weeks of rework (R25) — supervise accordingly");
  // CM-5..CM-9 (fixed: an EMPTY basket used to pass — a contract gate
  // with no mapped tasks is not "clear", it is UNVERIFIABLE. Warn loud.)
  if (ctx.kt && ctx.kt.clock && ctx.kt.clock.phase1Days && win.extStart) {
    const gate = addCal(win.extStart, ctx.kt.clock.phase1Days);
    const demo = real.filter(t => (t.code || "").startsWith("demo_"));
    const demoEnd = demo.length ? demo.map(t => t.EF || t.end).sort().pop() : null;
    if (!demoEnd)
      W("CM-5", L.commit, "KT internal target: cleared shell by day " + ctx.kt.clock.phase1Days,
        "KT sets a cleared-shell clock but NO demolition tasks are mapped — the target is unverifiable, not met");
    else
      T("CM-5", L.commit, "KT internal target: cleared shell by day " + ctx.kt.clock.phase1Days,
        demoEnd <= gate,
        "demolition clears " + demoEnd + " vs target " + gate + " — " + dayDiff(demoEnd, gate) + " days clear",
        "demolition runs to " + demoEnd + " past the internal day-" + ctx.kt.clock.phase1Days + " target " + gate + " (contract hard gate is RA1 day 45)");
  }
  if (ctx.kt && ctx.kt.raGates && win.extStart) {
    ctx.kt.raGates.forEach((g, i) => {
      const gateDate = addCal(win.extStart, g.day);
      const inBasket = real.filter(t => g.codes.includes(t.code));
      const basketEnd = inBasket.length ? inBasket.map(t => t.EF || t.end).sort().pop() : null;
      if (!basketEnd)
        W("CM-" + (6 + i), L.commit, "Contract " + g.ra + " gate (day " + g.day + ", " + g.pay + "): " + g.gate,
          "NO tasks mapped to this gate's basket — " + g.pay + " of contract value rides on a gate the engine cannot see; map the codes");
      else
        T("CM-" + (6 + i), L.commit, "Contract " + g.ra + " gate (day " + g.day + ", " + g.pay + "): " + g.gate,
          basketEnd <= gateDate,
          "basket clears " + basketEnd + " vs " + g.ra + " " + gateDate + " — " + dayDiff(basketEnd, gateDate) + " days clear (approx. mapping, " + inBasket.length + " tasks)",
          "mapped tasks run to " + basketEnd + " but " + g.ra + " (" + g.pay + " payment) expects them by " + gateDate + " — money waits on this basket");
    });
  }

  // ================= 9 · REGRESSION =================================
  if (ctx.plan2)
    T("RG-1", L.reg, "Determinism: same inputs, same plan",
      ctx.plan2.projectEnd === plan.projectEnd && ctx.plan2.tasks.length === plan.tasks.length,
      "engine re-run reproduces " + plan.projectEnd + " exactly",
      "two runs disagree — the engine is not deterministic", true);
  // RG-2/RG-3 (rebuilt: these were informational P() — unconditional
  // passes. A slip against the baseline must DEMAND a recorded cause.)
  if (ctx.baseline) {
    const slip = dayDiff(ctx.baseline.projectEnd, plan.projectEnd);
    T("RG-2", L.reg, "Against the frozen baseline",
      slip <= 0,
      "baseline v1 " + ctx.baseline.projectEnd + " → current " + plan.projectEnd + (slip === 0 ? " — on baseline" : " — " + (-slip) + " days ahead"),
      "+" + slip + " days beyond the frozen baseline (" + ctx.baseline.projectEnd + " → " + plan.projectEnd + ") — a slip is only legitimate with a traceable cause: new input, answer or instruction");
  }
  if (ctx.lastVersion) {
    const drift = dayDiff(ctx.lastVersion.projectEnd, plan.projectEnd);
    T("RG-3", L.reg, "Against the last published version",
      drift === 0,
      "v" + ctx.lastVersion.v + " " + ctx.lastVersion.projectEnd + " — unchanged",
      "end moved " + (drift > 0 ? "+" : "") + drift + " days since published v" + ctx.lastVersion.v + " (" + ctx.lastVersion.projectEnd + " → " + plan.projectEnd + ") — every change must trace to an input, answer or instruction before republishing");
  }

  // ================= 10 · SIGN-OFF ==================================
  const highQ = (intel.queries || []).filter(q => q.sev === "high").length;
  T("SO-1", L.sign, "High questions to the team", highQ === 0,
    "none open", highQ + " high questions still open — publishing anyway must be a conscious call");
  const ready = intel.ready || {};
  T("SO-2", L.sign, "Readiness score", (ready.score || 0) >= 55,
    ready.score + "/100 — " + ready.band, (ready.score || 0) + "/100 — " + (ready.band || "?") + ": the intelligence layer is not calm yet");
  P("SO-3", L.sign, "Calendar approved", cal.status === "approved" ? "signed by " + cal.approvedBy : "still draft — approve it on the calendar screen");
  if (cal.status !== "approved") { C[C.length - 1].status = "warn"; }

  // ---- summarize ----
  const summary = { pass: 0, warn: 0, fail: 0, total: C.length };
  C.forEach(c => summary[c.status]++);
  const layerNames = [...new Set(C.map(c => c.layer))];
  const layers = layerNames.map(ln => {
    const cs = C.filter(c => c.layer === ln);
    return { name: ln, pass: cs.filter(c => c.status === "pass").length,
      warn: cs.filter(c => c.status === "warn").length, fail: cs.filter(c => c.status === "fail").length };
  });
  return { checks: C, summary, layers };
}

const VERIFY = { verify };
(function (g) { g.CORE_VERIFY = VERIFY; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = VERIFY;

})();
