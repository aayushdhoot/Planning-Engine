// ===================================================================
// DnB-OS · platform/core/takt.js
// The speed lever. The CPM (cpm.js) answers "what order, what dates,
// one gang per job, every zone in parallel" — an unlimited-crew upper
// bound. This module answers the real question:
//
//   "With F gangs per trade flowing zone to zone, when do we finish —
//    and how many gangs do we need to hit the client date?"
//
// Model (plain words):
//  - A "front" = one gang of each trade. fronts=3 means up to 3 zones
//    can host the same trade at the same time.
//  - A gang finishes its job in one zone, then flows to the next zone
//    that is ready for it. That flow is all "takt" means here.
//  - A small zone can only hold so many workers (congestion): the cap
//    is area / 225 sqft per worker — past that, more men slow work.
//  - Physics stays: sequence links, cure lags, coordination holds,
//    long-lead deliveries, the working calendar and weather.
//
// level(tasks, cal, opts)  -> one dated, crew-feasible plan
//   opts: { start, fronts, zoneCaps:{zoneId:maxWorkers}, crewOf:{code:n} }
// sweep(tasks, cal, opts)  -> [ {fronts, projectEnd, workingDays,
//   calendarDays, peakWorkers, overDays} ] for fronts = 1..max
// recommend(rows, targetISO) -> the smallest fronts that hits target,
//   else the fastest row (unachievable flagged by caller).
// ===================================================================

;(function () {

const req = (typeof require !== "undefined");
const CAL = req ? require("../kb/calendar.js")  : (typeof window!=="undefined"?window.KB_CAL :globalThis.KB_CAL);
const DUR = req ? require("../kb/durations.js") : (typeof window!=="undefined"?window.KB_DUR :globalThis.KB_DUR);
const SEQ = req ? require("../kb/sequence.js")  : (typeof window!=="undefined"?window.KB_SEQ :globalThis.KB_SEQ);
const CPM = req ? require("./cpm.js")           : (typeof window!=="undefined"?window.CORE_CPM:globalThis.CORE_CPM);
const COND= req ? require("../kb/conditions.js"): (typeof window!=="undefined"?window.KB_COND:globalThis.KB_COND);

const _d = iso => CAL._d(iso), _iso = dt => CAL._iso(dt);
const addCal = (iso, n) => _iso(CAL._add(_d(iso), n));
const maxIso = (a, b) => a > b ? a : b;

function level(taskInputs, cal, opts) {
  opts = opts || {};
  const fronts = Math.max(1, opts.fronts || 1);
  const zoneCaps = opts.zoneCaps || {};
  const pins = opts.pins || [];   // recorded actuals: [{id?|code, zone?, as?, af?}]
  const holds = opts.holds || []; // material holds: [{code, zone?, notBefore}]
  const splitAbove = opts.splitAbove || 10; // working days — longer than this, split the area across gangs
  const projectStart = CAL.nextWorkingDay(opts.start || "2026-07-01", cal);
  // The re-plan has to give the same answer twice. A wall clock inside the
  // scheduler made "how much is left" depend on when you asked, so a revision
  // could not be reproduced or guarded. Passed in; defaulted, so nothing
  // that used to call this changes behaviour.
  const todayISO = opts.today || new Date().toISOString().slice(0, 10);

  // ---- intra-zone splitting: a big slab of one kind of work (36 days
  // of tiling in the cafeteria) really runs as 2-4 gangs on sub-areas.
  // Split when: duration > splitAbove, gangs exist, congestion allows.
  taskInputs = taskInputs.reduce((acc, t) => {
    if (t.zone === "site") { acc.push(t); return acc; } // site-wide tasks (runway, T&C) never split into gangs
    const hpd0 = COND ? COND.hoursFor(DUR.get(t.code), opts.conditions).hours : undefined;
    const d = DUR.deriveDays(t.code, t.qty, { crew: t.crew, hoursPerDay: hpd0 });
    const cap = zoneCaps[t.zone] || Infinity;
    const S = Math.min(
      Math.ceil(d.days / splitAbove),          // enough parts to get under the threshold
      fronts,                                   // can't use more gangs than fronts
      Math.max(1, Math.floor(cap / d.crew)),    // all parts must fit the zone at once
      4                                         // beyond 4 gangs on one work face they trip on each other
    );
    if (S <= 1) { acc.push(t); return acc; }
    // D3 fix: rounding every part lost/created quantity (10/3 -> 3+3+3=9).
    // The last part carries the remainder; the parts SUM to the original.
    const per = Math.round(t.qty / S);
    for (let i = 1; i <= S; i++)
      acc.push(Object.assign({}, t, {
        id: t.id + "#" + i, qty: i === S ? t.qty - per * (S - 1) : per,
        splitOf: t.id, part: i, parts: S,
      }));
    return acc;
  }, []);

  // ---- priorities from the unlimited CPM (float first, then ES) ----
  const base = CPM.schedule(taskInputs, cal, { start: opts.start, conditions: opts.conditions, holds: opts.holds });
  const prio = {}; base.tasks.forEach((t, i) => prio[t.id] = t.floatWD * 10000 + i);

  // ---- graph ----
  const linked = SEQ.deriveLinks(taskInputs);
  const nodes = linked.nodes.map(n => Object.assign({}, n)), edges = linked.edges;
  const byId = {}; nodes.forEach(n => byId[n.id] = n);
  nodes.forEach(n => {
    if (n.gate) { n.baseDays = 0; n.act = {}; n.crew = 0; n.name = n.name || "Hold"; return; }
    // same conditions as the split pass above, so a task cannot be split on
    // one duration and then scheduled on another
    const hpd = COND ? COND.hoursFor(DUR.get(n.code), opts.conditions).hours : undefined;
    const d = DUR.deriveDays(n.code, n.qty, { crew: n.crew, hoursPerDay: hpd });
    n.baseDays = d.days; n.act = { rainSensitive: d.rain, heatSensitive: d.heat, exposure: d.exposure };
    n.name = n.name || d.name; n.trade = d.trade; n.conf = n.conf || d.conf; n.crew = d.crew;
  });
  const edgesTo = {}; edges.forEach(e => (edgesTo[e.to] = edgesTo[e.to] || []).push(e));

  // ---- resources ----
  // gangs: per trade, `fronts` gangs. Each gang keeps a calendar of busy
  // intervals so a task can BACKFILL an idle window between two existing
  // jobs — without this, everything serialises in processing order.
  const gangs = {};
  const gangPool = trade => gangs[trade] = gangs[trade] || Array.from({ length: fronts }, () => ({ busy: [] }));
  // zone congestion: workers per working day, capped
  const zoneLoad = {};   // zone -> { iso: workers }
  const zoneLast = {};   // zone -> latest finishing task (for the "what blocked me" chain)

  const workingDaysOf = (from, to) => {
    const out = [];
    for (let d = from; d <= to; d = addCal(d, 1)) if (CAL.isWorkingDay(d, cal)) out.push(d);
    return out;
  };
  const zoneConflictDay = (zone, days, crew, cap) => {
    if (!cap || !isFinite(cap)) return null;
    const load = zoneLoad[zone] = zoneLoad[zone] || {};
    for (const d of days) if ((load[d] || 0) + crew > cap) return d;
    return null;
  };
  const gangConflict = (gang, from, to) =>
    gang.busy.find(iv => !(iv.end < from || iv.start > to)) || null;
  // earliest {start,end,span} for this gang at/after es (interval search)
  function gangSlot(gang, es, n) {
    let candidate = es, guard = 0, lastConflict = null;
    while (guard++ < 400) {
      const span = CAL.effectiveSpan(candidate, n.baseDays, n.act, cal);
      const c = gangConflict(gang, span.start, span.end);
      if (!c) return { start: span.start, span, conflict: lastConflict };
      lastConflict = c;
      candidate = CAL.nextWorkingDay(addCal(c.end, 1), cal);
    }
    return null;
  }

  // ---- serial schedule generation, priority order ----
  const order = CPM.topo(nodes.map(n => n.id), edges)
    .sort((a, b) => (prio[a] ?? 1e9) - (prio[b] ?? 1e9));
  // topo-safety: process only when all preds are done; queue otherwise
  const done = {}; const pending = order.slice(); const seq = [];
  while (pending.length) {
    const i = pending.findIndex(id => (edgesTo[id] || []).every(e => done[e.from]));
    const id = pending.splice(i === -1 ? 0 : i, 1)[0];
    seq.push(id); done[id] = true;
  }

  Object.keys(done).forEach(k => delete done[k]);
  seq.forEach(id => {
    const n = byId[id];
    // 1) physics floor: predecessors + lags + long-lead delivery
    // D3 fix: an edge FROM a zero-duration gate carries min lag 0, not 1 —
    // the inspection happens in the morning and work follows the same day.
    // The old Math.max(1,...) charged every gated hand-off a PHANTOM DAY
    // (5 gate types x ~18 zones = weeks of fictitious duration).
    // Explicit gate lags (ponding 2d, hydro 1d) still hold via e.lag.
    let es = projectStart, bound = { type: "start", ref: null };
    (edgesTo[id] || []).forEach(e => {
      const p = byId[e.from];
      const cand = e.type === "SS"
        ? CAL.addWorkingDays(p.ES, e.lag || 0, cal)
        : CAL.nextWorkingDay(addCal(p.EF, Math.max(p.gate ? 0 : 1, e.lag || 0)), cal);
      if (cand > es) { es = cand; bound = { type: "pred", ref: p.id }; }
    });
    if (n.leadWeeks) {
      const floor = CAL.nextWorkingDay(addCal(projectStart, n.leadWeeks * 7), cal);
      if (floor > es) { es = floor; bound = { type: "lead", ref: null }; }
    }

    // MATERIAL HOLD. A short delivery with a promised balance date means the
    // work that consumes that material cannot start before the balance lands.
    // This is the door the material law writes through, and it is the only
    // thing that lets a shortfall on Tuesday move Thursday's work by itself.
    // A shortfall with NO promised date produces no hold at all . the engine
    // will not invent a date to move a programme with.
    for (const h of holds) {
      if (h.code !== n.code) continue;
      if (h.zone && h.zone !== n.zone) continue;
      const floor = CAL.nextWorkingDay(h.notBefore, cal);
      if (floor > es) { es = floor; bound = { type: "material", ref: null }; }
    }

    if (n.gate) {
      n.ES = es; n.EF = es; n.bound = bound;
      zoneLast[n.zone] = zoneLast[n.zone] || null;
      return;
    }

    // ACTUALS PIN (the Emirates lesson: a plan without recorded reality
    // re-plans work that already happened). A "done" fact freezes the
    // task at its actual dates; a "started" fact pins the start and
    // reschedules only the REMAINING working days from today. Facts
    // consume no future gang time.
    {
      const pin = pins.find(p => (p.id && p.id === n.id) ||
        (p.code && p.code === n.code && (!p.zone || p.zone === n.zone)));
      if (pin && !n.gate) {
        if (pin.eta) {
          // site says "this runs till <date>" — pin the expected finish;
          // start stays at the physics floor (or recorded start)
          const ES2 = pin.as || es;
          n.ES = ES2; n.EF = pin.eta > ES2 ? pin.eta : ES2;
          n.spanWD = Math.max(1, CAL.workingDaysBetween(n.ES, addCal(n.EF, 1), cal));
          n.drivers = []; n.bound = { type: "actual", ref: null }; n.gangNo = 0; n.started = true;
          return;
        }
        if (pin.af) {
          n.ES = pin.as || pin.af; n.EF = pin.af;
          n.spanWD = Math.max(1, CAL.workingDaysBetween(n.ES, addCal(n.EF, 1), cal));
          n.drivers = []; n.bound = { type: "actual", ref: null }; n.gangNo = 0; n.done = true;
          return;
        }
        if (pin.as || pin.pct != null) {
          const today = CAL.nextWorkingDay(todayISO, cal);
          const spent = pin.as ? Math.max(0, CAL.workingDaysBetween(pin.as, today, cal)) : 0;
          // a recorded % (TCS-style weekly tracking) beats elapsed-time guessing
          const rem = pin.pct != null ? Math.max(1, Math.ceil(n.baseDays * (1 - Math.min(0.99, pin.pct))))
                                      : Math.max(1, Math.ceil(n.baseDays - spent));
          const from = today > es ? today : es;
          const span = CAL.effectiveSpan(from, rem, n.act, cal);
          n.ES = pin.as || es; n.EF = span.end;
          n.spanWD = spent + span.workingDays; n.drivers = span.drivers;
          n.bound = { type: "actual", ref: null }; n.gangNo = 0; n.started = true;
          return;
        }
      }
    }

    // desk & vendor work (the enabling chain): no site gang, no zone cap.
    // Twelve vendors design, submit and manufacture IN PARALLEL — forcing
    // them through the site gang pool serialized independent chains and
    // blew the plan out by weeks (caught on first chain run, 13 Jul).
    if (n.trade === "enabling") {
      const span = CAL.effectiveSpan(es, n.baseDays, n.act, cal);
      n.ES = span.start; n.EF = span.end; n.spanWD = span.workingDays;
      n.drivers = span.drivers; n.bound = bound; n.gangNo = 0;
      return;
    }

    // 2) resource floor: the gang (of my trade) and the zone headroom
    //    that give me the EARLIEST feasible slot — backfilling idle
    //    windows between a gang's existing jobs.
    const pool = gangPool(n.trade);
    // D3 guard: a crew bigger than the zone ceiling can never fit — the
    // old code span-searched forever and threw. Let it in; CR-2 flags it.
    let cap = zoneCaps[n.zone];
    if (cap && n.crew > cap) cap = n.crew;
    let chosen = null, guard = 0, from = es;
    while (guard++ < 400 && !chosen) {
      // best slot across the pool from this floor — with CONTINUITY:
      // the gang that last did THIS work follows it to the next zone
      // (takt flow, Hanna: fragmented crews lose 0-41%). It wins any
      // tie and may cost up to 2 calendar days against the absolute
      // earliest start; beyond that, flow yields to the date.
      let best = null, cont = null;
      pool.forEach((gang, gi) => {
        const s = gangSlot(gang, from, n);
        if (!s) return;
        if (!best || s.start < best.slot.start) best = { gang, gi, slot: s };
        const last = gang.busy[gang.busy.length - 1];
        if (last && last.code === n.code && (!cont || s.start < cont.slot.start)) cont = { gang, gi, slot: s };
      });
      if (cont && best && cont.gi !== best.gi && cont.slot.start <= addCal(best.slot.start, 2)) best = cont;
      if (!best) break;
      const days = workingDaysOf(best.slot.span.start, best.slot.span.end);
      const zc = zoneConflictDay(n.zone, days, n.crew, cap);
      if (!zc) {
        chosen = best;
        if (best.slot.start > es) bound = best.slot.conflict
          ? { type: "gang", ref: best.slot.conflict.id }
          : bound;
      } else {
        bound = { type: "zone", ref: zoneLast[n.zone] };
        from = CAL.nextWorkingDay(addCal(zc, 1), cal);  // step past the congested day
      }
    }
    if (!chosen) throw new Error("takt: no feasible slot for " + n.id);

    const span = chosen.slot.span, days = workingDaysOf(span.start, span.end);
    n.ES = span.start; n.EF = span.end; n.spanWD = span.workingDays;
    n.drivers = span.drivers; n.bound = bound; n.gangNo = chosen.gi + 1;
    chosen.gang.busy.push({ start: n.ES, end: n.EF, id: n.id, code: n.code });
    chosen.gang.busy.sort((a, b) => a.start < b.start ? -1 : 1);
    const load = zoneLoad[n.zone] = zoneLoad[n.zone] || {};
    days.forEach(d => load[d] = (load[d] || 0) + n.crew);
    if (!zoneLast[n.zone] || n.EF > byId[zoneLast[n.zone]].EF) zoneLast[n.zone] = n.id;
  });

  const projectEnd = nodes.reduce((m, n) => n.EF > m ? n.EF : m, projectStart);

  // ---- peak manpower (site-wide, per working day) ----
  // The same walk also splits the load BY TRADE, because "180 men on site"
  // is not a number anybody can act on . "14 carpenters on Tuesday" is.
  // Desk and vendor work (enabling) is excluded: it is nobody's headcount
  // on the floor, and counting it would inflate every day of the curve.
  const site = {}, byTrade = {};
  nodes.forEach(n => {
    if (n.gate || n.trade === "enabling") return;
    const tr = n.trade || "other";
    workingDaysOf(n.ES, n.EF).forEach(d => {
      site[d] = (site[d] || 0) + n.crew;
      (byTrade[d] = byTrade[d] || {})[tr] = (byTrade[d][tr] || 0) + n.crew;
    });
  });
  const peakWorkers = Object.values(site).reduce((m, v) => Math.max(m, v), 0);

  // ---- "drives the finish" chain: walk the binding constraints back ----
  const chain = [];
  let cur = nodes.filter(n => n.EF === projectEnd).sort((a, b) => (a.gate ? 1 : 0) - (b.gate ? 1 : 0))[0];
  const seen = {};
  while (cur && !seen[cur.id]) {
    seen[cur.id] = true; chain.push(cur.id);
    cur = cur.bound && cur.bound.ref ? byId[cur.bound.ref] : null;
  }
  const drives = {}; chain.forEach(id => drives[id] = true);

  // ---- free slack (working days before I delay my successor) ----
  const WD = workingDaysOf(projectStart, projectEnd);
  const idx = {}; WD.forEach((d, i) => idx[d] = i);
  const at = iso => { let d = iso; while (idx[d] == null && d > projectStart) d = addCal(d, -1); return idx[d] || 0; };
  const succOf = {}; edges.forEach(e => (succOf[e.from] = succOf[e.from] || []).push(e));
  nodes.forEach(n => {
    const outs = succOf[n.id] || [];
    let s = at(projectEnd) - at(n.EF);
    outs.forEach(e => {
      const t = byId[e.to];
      // D3 fix: FS free slack must subtract the edge lag — a 7-day cure
      // is not slack, moving into it violates the cure. 6-day-week conv.
      const fsLagWD = (e.lag || 0) > 1 ? Math.round(e.lag * 6 / 7) : 0;
      const gap = e.type === "SS" ? at(t.ES) - (at(n.ES) + (e.lag || 0)) : at(t.ES) - at(n.EF) - 1 - fsLagWD;
      if (gap < s) s = gap;
    });
    n.slackWD = Math.max(0, s);
  });

  const out = nodes.map(n => ({
    id: n.id, code: n.code, zone: n.zone, name: n.name, gate: !!n.gate, trade: n.trade,
    ES: n.ES, EF: n.EF, durWD: n.gate ? 0 : (at(n.EF) - at(n.ES) + 1),
    slackWD: n.slackWD, drives: !!drives[n.id], critical: !!drives[n.id],
    floatWD: n.slackWD, leadWeeks: n.leadWeeks || 0, conf: n.conf,
    gangNo: n.gangNo || 0, drivers: n.drivers || [],
    boundBy: n.bound ? n.bound.type : "start", done: !!n.done, started: !!n.started,
    qty: n.qty, part: n.part || 0, parts: n.parts || 0, splitOf: n.splitOf || null,
  })).sort((a, b) => a.ES < b.ES ? -1 : a.ES > b.ES ? 1 : 0);

  return {
    fronts, projectStart, projectEnd,
    manpower: { byDay: site, byDayTrade: byTrade },
    workingDays: WD.length,
    calendarDays: Math.round((_d(projectEnd) - _d(projectStart)) / 86400000) + 1,
    peakWorkers,
    tasks: out, gates: out.filter(t => t.gate),
    criticalPath: chain.slice().reverse(),
  };
}

function sweep(taskInputs, cal, opts) {
  opts = opts || {};
  const max = opts.max || 6, rows = [];
  for (let f = opts.min || 1; f <= max; f++) {
    const p = level(taskInputs, cal, Object.assign({}, opts, { fronts: f }));
    rows.push({ fronts: f, projectEnd: p.projectEnd, workingDays: p.workingDays,
      calendarDays: p.calendarDays, peakWorkers: p.peakWorkers });
  }
  return rows;
}

function recommend(rows, targetISO) {
  const hit = rows.filter(r => r.projectEnd <= targetISO).sort((a, b) => a.fronts - b.fronts)[0];
  if (hit) return { fronts: hit.fronts, hits: true };
  const best = rows.slice().sort((a, b) => a.projectEnd < b.projectEnd ? -1 : 1)[0];
  return { fronts: best.fronts, hits: false };
}

const TAKT = { level, sweep, recommend };
(function (g) { g.CORE_TAKT = TAKT; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = TAKT;

})();
