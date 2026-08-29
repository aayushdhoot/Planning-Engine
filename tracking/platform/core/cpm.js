// ===================================================================
// DnB-OS · platform/core/cpm.js
// The scheduling engine.  Quantities + durations + sequence + calendar
// -> a real dated plan with the critical path.
//
// How it works:
//   1. deriveDays (durations.js) turns each task's quantity into base
//      working-days of effort.
//   2. deriveLinks (sequence.js) gives the dependency edges + gates.
//   3. FORWARD pass in real-DATE space: every task gets a real early
//      start / early finish on the working calendar, with monsoon /
//      festival drag applied by calendar.effectiveSpan.  Lags:
//        - FS lag = CALENDAR days (cure / dry / test wait over weekends)
//        - SS lag = WORKING days (work-overlap offset)
//   4. BACKWARD pass in WORKING-DAY index space (durations fixed from
//      the forward pass): late start / late finish, total float, and
//      the critical path (float <= 0).
//
// The dates are exact; float / critical is the management indicator.
//
//   schedule(taskInputs, cal, opts) -> {
//     projectStart, projectEnd, workingDays, calendarDays,
//     tasks:[ {id,code,zone,name,ES,EF,LS,LF,floatWD,critical,
//              spanWD,drivers,leadWeeks,gate} ],
//     criticalPath:[id...], gates:[...] }
//   taskInputs: [ {id, code, zone, qty, crew?} ]
// ===================================================================

;(function () {

const req = (typeof require !== "undefined");
const CAL = req ? require("../kb/calendar.js")  : (typeof window!=="undefined"?window.KB_CAL :globalThis.KB_CAL);
const DUR = req ? require("../kb/durations.js") : (typeof window!=="undefined"?window.KB_DUR :globalThis.KB_DUR);
const SEQ = req ? require("../kb/sequence.js")  : (typeof window!=="undefined"?window.KB_SEQ :globalThis.KB_SEQ);
const COND= req ? require("../kb/conditions.js"): (typeof window!=="undefined"?window.KB_COND:globalThis.KB_COND);

const _d = iso => CAL._d(iso), _iso = dt => CAL._iso(dt), _add = (dt,n)=>CAL._add(dt,n);
const addCal = (iso,n) => _iso(_add(_d(iso), n));

function topo(ids, edges) {
  const indeg = {}, out = {};
  ids.forEach(id => { indeg[id] = 0; out[id] = []; });
  edges.forEach(e => { if (out[e.from] && indeg[e.to] != null) { out[e.from].push(e.to); indeg[e.to]++; } });
  const q = ids.filter(id => indeg[id] === 0), order = [];
  while (q.length) { const n = q.shift(); order.push(n); out[n].forEach(m => { if (--indeg[m] === 0) q.push(m); }); }
  if (order.length !== ids.length) throw new Error("cycle in plan graph");
  return order;
}

function schedule(taskInputs, cal, opts) {
  opts = opts || {};
  const projectStart = CAL.nextWorkingDay(opts.start || "2026-07-01", cal);

  // ---- build graph (tasks + gates) ----
  const linked = SEQ.deriveLinks(taskInputs);
  const nodes = linked.nodes, edges = linked.edges;
  const byId = {}; nodes.forEach(n => byId[n.id] = n);

  // base working-days + weather flags per real task
  nodes.forEach(n => {
    if (n.gate) { n.baseDays = 0; n.act = {}; n.name = n.name || "Hold"; return; }
    // site conditions decide how many productive hours this task gets in a
    // day (shift, noise window, material access). Unset conditions fall back
    // to one day shift, which is what the law's conservative default gives.
    const hpd = COND ? COND.hoursFor(DUR.get(n.code), opts.conditions).hours : undefined;
    const d = DUR.deriveDays(n.code, n.qty, { crew: n.crew, hoursPerDay: hpd });
    n.baseDays = d.days; n.act = { rainSensitive: d.rain, heatSensitive: d.heat, exposure: d.exposure };
    n.name = n.name || d.name; n.unit = d.unit; n.conf = d.conf; n.trade = d.trade;
  });

  const ids = nodes.map(n => n.id);
  const order = topo(ids, edges);
  const edgesTo = {}, edgesFrom = {};
  edges.forEach(e => { (edgesTo[e.to] = edgesTo[e.to] || []).push(e); (edgesFrom[e.from] = edgesFrom[e.from] || []).push(e); });

  // ---- FORWARD pass (date space, exact) ----
  order.forEach(id => {
    const n = byId[id];
    let es = projectStart;
    if (n.leadWeeks) { const floor = CAL.nextWorkingDay(addCal(projectStart, n.leadWeeks * 7), cal); if (floor > es) es = floor; }
    // material holds, the same door takt honours, so the two never disagree
    for (const h of (opts.holds || [])) {
      if (h.code !== n.code) continue;
      if (h.zone && h.zone !== n.zone) continue;
      const floor = CAL.nextWorkingDay(h.notBefore, cal);
      if (floor > es) es = floor;
    }
    (edgesTo[id] || []).forEach(e => {
      const p = byId[e.from];
      let cand;
      if (e.type === "SS") cand = CAL.addWorkingDays(p.ES, e.lag || 0, cal);
      // from a gate: min lag 0 (morning inspection, work follows same day) —
      // max(1,...) charged a phantom day per gated hand-off (D3)
      else cand = CAL.nextWorkingDay(addCal(p.EF, Math.max(p.gate ? 0 : 1, e.lag || 0)), cal); // FS, calendar-day lag
      if (cand > es) es = cand;
    });
    n.ES = es;
    const span = CAL.effectiveSpan(es, n.baseDays, n.act, cal);
    n.EF = span.end; n.spanWD = span.workingDays; n.calDays = span.calendarDays; n.drivers = span.drivers;
  });

  const projectEnd = nodes.reduce((m, n) => n.EF > m ? n.EF : m, projectStart);

  // ---- working-day index over [projectStart .. projectEnd] ----
  const WD = [], idx = {};
  for (let d = projectStart; d <= projectEnd; d = addCal(d, 1)) if (CAL.isWorkingDay(d, cal)) { idx[d] = WD.length; WD.push(d); }
  const endIdx = idx[projectEnd];
  const clamp = i => Math.max(0, Math.min(WD.length - 1, i));

  nodes.forEach(n => {
    n.ESi = idx[n.ES]; n.EFi = idx[n.EF];
    n.durWD = n.gate ? 0 : (n.EFi - n.ESi + 1);
  });

  // ---- BACKWARD pass (index space) ----
  order.slice().reverse().forEach(id => {
    const n = byId[id];
    const outs = edgesFrom[id] || [];
    let lf;
    if (!outs.length) lf = endIdx;
    else {
      lf = Infinity;
      outs.forEach(e => {
        const s = byId[e.to];
        let cand;
        if (e.type === "SS") cand = s.LSi - (e.lag || 0) + Math.max(n.durWD, 1) - 1;
        else { const extra = e.lag > 1 ? Math.round(e.lag * 6 / 7) : 0; cand = s.LSi - 1 - extra; } // 6-day week (D3)
        if (cand < lf) lf = cand;
      });
    }
    n.LFi = lf;
    n.LSi = n.gate ? lf : (lf - n.durWD + 1);
    n.floatWD = n.LSi - n.ESi;
    n.critical = n.floatWD <= 0;
    n.LS = WD[clamp(n.LSi)]; n.LF = WD[clamp(n.LFi)];
  });

  // ---- assemble ----
  const out = nodes.map(n => ({
    id: n.id, code: n.code, zone: n.zone, name: n.name, gate: !!n.gate, trade: n.trade,
    ES: n.ES, EF: n.EF, LS: n.LS, LF: n.LF,
    floatWD: n.floatWD, critical: n.critical, durWD: n.durWD,
    spanWD: n.spanWD, drivers: n.drivers || [], leadWeeks: n.leadWeeks || 0, conf: n.conf,
  })).sort((a, b) => a.ES < b.ES ? -1 : a.ES > b.ES ? 1 : 0);

  const criticalPath = out.filter(t => t.critical && !t.gate).map(t => t.id);

  return {
    projectStart, projectEnd,
    workingDays: WD.length,
    calendarDays: Math.round((_d(projectEnd) - _d(projectStart)) / 86400000) + 1,
    tasks: out,
    gates: out.filter(t => t.gate),
    criticalPath,
    // THE EDGES ARE THE SCHEDULE, NOT AN IMPLEMENTATION DETAIL OF IT. Two
    // bars sitting one after the other on a chart say nothing about WHY;
    // the link says the second cannot start until the first is done, and
    // that is the only part of a programme anybody argues with. They were
    // computed here and thrown away, so nothing downstream could draw them.
    edges,
  };
}

// ---- dual-mode export ----
const CPM = { schedule, topo };
(function (g) { g.CORE_CPM = CPM; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = CPM;

})();
