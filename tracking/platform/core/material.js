// ===================================================================
// DnB-OS . platform/core/material.js . THE MATERIAL PLAN
// Phase 5. What has to be on site, in what quantity, by when . and what
// happens to the programme when it turns up short.
//
//   schedule(plan, opts)      -> the dated, quantified delivery list
//   confirm(rows, grns)       -> the site's arrivals applied to it
//   shortfalls(rows)          -> what did not fully land
//   holds(rows)               -> the dates the shortfalls push
//   queries(rows)             -> the shortfalls the engine refuses to guess
//   tasksFor(rows, ownerFn)   -> the confirm-arrival jobs, for a task list
//
// THE LAWS
//   . needed on site is the EARLIEST install start for that material,
//     minus a staging lag. Material that lands the morning work starts
//     is material that holds the work up.
//   . order by walks the lead time back from needed on site. A code with
//     no declared lead time gets none invented for it: it carries null
//     and says the lead time is unknown.
//   . a GRN is a dated, counted fact. An arrival with no quantity is
//     "arrived, count unknown", never assumed to be the full order.
//   . A SHORT DELIVERY WITH A PROMISED BALANCE DATE moves the dates: the
//     work that consumes it cannot start before the balance lands.
//   . A SHORT DELIVERY WITH NO PROMISED DATE MOVES NOTHING. The engine
//     does not know by how much, and inventing a date would publish a
//     programme built on a number nobody gave. It becomes a blocking
//     query instead, and the affected work is flagged as held.
//   . over delivery is reported, never netted off somewhere else.
//
// Pure: a plan and some GRNs in, a schedule out. No clock, no storage.
// ===================================================================

;(function (root) {

const DAY = 86400000;
const STAGING_DAYS = 2;     // material lands two days before the work starts

function iso(d) { return new Date(d).toISOString().slice(0, 10); }
function shift(isoDay, n) {
  const d = new Date(isoDay + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// ---- the schedule ---------------------------------------------------
// One row per material code: everything the plan installs of it, the
// earliest date it is needed, and the date it has to be ordered by.
function schedule(plan, opts) {
  const o = opts || {};
  const leadOf = o.leadWeeks || {};          // code -> weeks
  const unitOf = o.unitOf || (() => "");
  const nameOf = o.nameOf || (c => c);
  const staging = o.stagingDays == null ? STAGING_DAYS : o.stagingDays;

  const by = {};
  for (const t of ((plan && plan.tasks) || [])) {
    if (t.gate || t.trade === "enabling") continue;      // gates and desk work consume nothing
    if (!t.code || !(t.qty > 0)) continue;
    const r = by[t.code] = by[t.code] || { code: t.code, name: nameOf(t.code), unit: unitOf(t.code),
      qty: 0, zones: {}, firstES: t.ES, forTasks: [] };
    r.qty += t.qty;
    r.zones[t.zone || "site"] = (r.zones[t.zone || "site"] || 0) + t.qty;
    if (t.ES && (!r.firstES || t.ES < r.firstES)) r.firstES = t.ES;
    r.forTasks.push({ id: t.id, zone: t.zone, qty: t.qty, ES: t.ES, EF: t.EF });
  }

  return Object.values(by).map(r => {
    const weeks = leadOf[r.code];
    const neededOn = r.firstES ? shift(r.firstES, -staging) : null;
    return {
      code: r.code, name: r.name, unit: r.unit,
      qty: Math.round(r.qty * 100) / 100,
      zones: Object.keys(r.zones).sort(),
      qtyByZone: r.zones,
      firstInstall: r.firstES,
      neededOn: neededOn,
      leadWeeks: (weeks == null ? null : weeks),
      // no declared lead time means no order-by is invented for it
      orderBy: (weeks == null || !neededOn) ? null : shift(neededOn, -weeks * 7),
      leadKnown: weeks != null,
      forTasks: r.forTasks,
    };
  }).sort((a, b) => (a.orderBy || a.neededOn || "9999") < (b.orderBy || b.neededOn || "9999") ? -1 : 1);
}

// ---- the site's arrivals --------------------------------------------
// grns: [{ code, day, qty?, promisedOn?, note? }]
// A GRN with no qty is "arrived, count unknown" . it is never read as the
// full order, because that is the assumption that hides a short delivery.
function confirm(rows, grns) {
  const byCode = {};
  for (const g of (grns || [])) {
    if (!g || !g.code || !g.day) continue;
    const a = byCode[g.code] = byCode[g.code] || { got: 0, counted: false, days: [], promisedOn: null, notes: [] };
    a.days.push(g.day);
    if (typeof g.qty === "number" && isFinite(g.qty)) { a.got += g.qty; a.counted = true; }
    if (g.promisedOn && (!a.promisedOn || g.promisedOn > a.promisedOn)) a.promisedOn = g.promisedOn;
    if (g.note) a.notes.push(g.note);
  }

  return rows.map(r => {
    const a = byCode[r.code];
    if (!a) return Object.assign({}, r, { state: "awaited", got: null, arrivedOn: null,
      short: null, promisedOn: null });
    const arrivedOn = a.days.slice().sort()[a.days.length - 1];
    if (!a.counted) return Object.assign({}, r, { state: "arrived_uncounted", got: null,
      arrivedOn, short: null, promisedOn: a.promisedOn, notes: a.notes });
    const short = Math.round((r.qty - a.got) * 100) / 100;
    return Object.assign({}, r, {
      got: Math.round(a.got * 100) / 100, arrivedOn, promisedOn: a.promisedOn, notes: a.notes,
      short: short > 0 ? short : 0,
      over: short < 0 ? -short : 0,
      state: short > 0.01 ? "short" : short < -0.01 ? "over" : "complete",
    });
  });
}

function shortfalls(rows) { return rows.filter(r => r.state === "short"); }

// ---- what a shortfall does to the programme -------------------------
// A promised balance date is a date somebody gave, so it moves the work.
// No promised date moves NOTHING: the engine does not know by how much,
// and a programme built on an invented date is worse than one that says
// it is waiting. Those become queries instead.
function holds(rows) {
  const out = [];
  for (const r of shortfalls(rows)) {
    if (!r.promisedOn) continue;
    for (const z of r.zones) {
      out.push({ code: r.code, zone: z, notBefore: r.promisedOn,
        reason: r.short + " " + (r.unit || "") + " of " + r.name + " short, balance promised " + r.promisedOn });
    }
  }
  return out;
}

function queries(rows) {
  return shortfalls(rows).filter(r => !r.promisedOn).map(r => ({
    id: "MAT-" + r.code, blocking: true, about: r.name,
    question: r.short + " " + (r.unit || "") + " of " + r.name + " is short and no balance date was given. "
      + "When does the rest land? Until somebody says, the engine will not move the dates it feeds.",
    held: r.forTasks.filter(t => t.ES >= (r.arrivedOn || "")).length,
  }));
}

// ---- the confirm-arrival jobs ---------------------------------------
// Every delivery is a job on somebody's list: confirm it came, confirm
// how much. Without that the schedule is a wish, not a plan.
function tasksFor(rows, ownerFn) {
  const owner = ownerFn || (() => null);
  return rows.filter(r => r.state === "awaited" || r.state === "arrived_uncounted").map(r => ({
    id: "mat:" + r.code,
    what: r.state === "awaited"
      ? "Confirm " + r.name + " lands on site (" + r.qty + " " + (r.unit || "") + ")"
      : "Count the " + r.name + " that arrived on " + r.arrivedOn + " — the quantity is unknown",
    due: r.neededOn, code: r.code, qty: r.qty, unit: r.unit,
    owner: owner(r), state: r.state,
  })).sort((a, b) => (a.due || "9999") < (b.due || "9999") ? -1 : 1);
}

const MAT = { STAGING_DAYS, schedule, confirm, shortfalls, holds, queries, tasksFor, shift };
root.CORE_MATERIAL = MAT;
if (typeof module !== "undefined" && module.exports) module.exports = MAT;

})(typeof window !== "undefined" ? window : globalThis);
