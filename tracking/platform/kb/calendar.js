// ===================================================================
// DnB-OS · platform/kb/calendar.js
// The working-calendar engine.  Every date in the plan is computed on
// THIS, not on a flat 5-day week.  This is the layer P6 / MSP / ALICE
// fake — they schedule on ideal calendar days.  We schedule on real
// working days, stretched by monsoon, festivals, heat and site access.
//
// Public contract (all dates are ISO 'YYYY-MM-DD' strings):
//   isWorkingDay(iso, cfg)              -> bool
//   nextWorkingDay(iso, cfg)            -> iso   (iso itself if working)
//   addWorkingDays(iso, n, cfg)         -> iso   (n working days AFTER iso)
//   workingDaysBetween(a, b, cfg)       -> int   (working days in [a,b))
//   productivityFactor(iso, act, cfg)   -> 0..1  (1 = ideal day)
//   effectiveSpan(startISO, baseDays, act, cfg)
//                                       -> {start,end,workingDays,
//                                           calendarDays,avgFactor,drivers}
//   holidaysInRange(a, b, cfg)          -> [{date,name,kind}]
//   defaultConfig(region, year)         -> cfg
//
// An `act` (activity) may carry:  { rainSensitive, heatSensitive, exposure }
//   exposure: 'interior' (default) | 'exterior'
// Config is data, so the engine is GENERAL: point it at any region/year.
// ===================================================================

;(function () {   // sealed scope — nothing leaks except window.KB_CAL / module.exports

// ---- date helpers (UTC noon, so DST / TZ never shifts a day) --------
function _d(iso) { return new Date(iso + "T12:00:00Z"); }
function _iso(dt) { return dt.toISOString().slice(0, 10); }
function _add(dt, n) { const x = new Date(dt); x.setUTCDate(x.getUTCDate() + n); return x; }
function _dow(dt) { return dt.getUTCDay(); } // 0 Sun .. 6 Sat
function _within(iso, from, to) { return iso >= from && iso <= to; }

// ---- tunable factors (each traceable to a source) -------------------
// Sources: Pune IMD monsoon onset/withdrawal norms; LCI/lean-construction
// congestion + absenteeism findings; ASHRAE/ILO heat-labour curves;
// Maharashtra migrant-labour festival-exodus field data.
const FACTORS = {
  monsoon:       { siteWide: 0.96, rainSensitive: 0.75, peakRainSensitive: 0.70, peakFrom: "07-01", peakTo: "08-31" },
  heat:          { heatSensitive: 0.92, exteriorExtra: 0.95 },
  festivalFloor: { ganesh: 0.80, diwali: 0.55, dussehra: 0.85, holi: 0.85 }, // trough manpower multiplier
};

// ---- 2026 Maharashtra / Pune holiday + festival calendar ------------
// siteOff = construction site actually closes that day (majors only).
// Non-siteOff gazetted days: sites usually work them, so they do NOT
// remove a working day, but they may still dip manpower slightly.
const HOLIDAYS_MH_2026 = [
  { date: "2026-01-26", name: "Republic Day",         kind: "national", siteOff: true },
  { date: "2026-03-03", name: "Holi (Dhuli Vandan)",  kind: "festival", siteOff: true },
  { date: "2026-03-20", name: "Gudi Padwa",           kind: "regional", siteOff: true },
  { date: "2026-03-26", name: "Ram Navami",           kind: "festival", siteOff: false, workFactor: 0.7 },
  { date: "2026-03-31", name: "Mahavir Jayanti",      kind: "festival", siteOff: false, workFactor: 0.7 },
  { date: "2026-04-03", name: "Good Friday",          kind: "festival", siteOff: false, workFactor: 0.7 },
  { date: "2026-04-14", name: "Ambedkar Jayanti",     kind: "regional", siteOff: true  },
  { date: "2026-05-01", name: "Maharashtra Day",      kind: "regional", siteOff: true  }, // also Buddha Purnima 2026
  { date: "2026-08-15", name: "Independence Day",     kind: "national", siteOff: true  },
  { date: "2026-07-24", name: "Ashadhi Ekadashi (Palkhi)", kind: "regional", siteOff: false, workFactor: 0.7 }, // Pune pilgrimage — thin gangs (panel D7)
  { date: "2026-08-27", name: "Id-e-Milad",           kind: "festival", siteOff: false, workFactor: 0.7 },
  { date: "2026-09-14", name: "Ganesh Chaturthi",     kind: "festival", siteOff: true  },
  { date: "2026-09-25", name: "Anant Chaturdashi (visarjan)", kind: "festival", siteOff: true  }, // Pune sites shut for immersion (panel D7)
  { date: "2026-10-02", name: "Gandhi Jayanti",       kind: "national", siteOff: true  },
  { date: "2026-10-20", name: "Dussehra",             kind: "festival", siteOff: true  },
  { date: "2026-11-08", name: "Diwali (Laxmi Pujan)", kind: "festival", siteOff: true  },
  { date: "2026-11-09", name: "Diwali (Padwa)",       kind: "festival", siteOff: true  },
  { date: "2026-12-25", name: "Christmas",            kind: "national", siteOff: false, workFactor: 0.7 },
];

// ---- festival manpower ramp-down windows (migrant labour leaves) ----
// A window dips manpower BEFORE and AFTER the day itself; floor = trough.
const FESTIVAL_WINDOWS_2026 = [
  { key: "holi",     name: "Holi",     from: "2026-03-02", to: "2026-03-05", floor: FACTORS.festivalFloor.holi },
  { key: "ganesh",   name: "Ganesh",   from: "2026-09-14", to: "2026-09-25", floor: FACTORS.festivalFloor.ganesh },   // Chaturthi -> Anant Chaturdashi visarjan
  { key: "dussehra", name: "Dussehra", from: "2026-10-18", to: "2026-10-20", floor: FACTORS.festivalFloor.dussehra },
  { key: "diwali",   name: "Diwali",   from: "2026-11-04", to: "2026-11-21", floor: FACTORS.festivalFloor.diwali },   // longest exodus; migrant gangs trickle back to ~21 Nov (panel D7)
];

// ---- monsoon window (Pune): IMD onset ~8 Jun, withdrawal ~early Oct --
// withdrawal from Pune runs into the second week of October (IMD norms; panel D7)
const MONSOON_MH_2026 = { from: "2026-06-08", to: "2026-10-12" };
// ---- heat window (Pune peak): mid-Apr to onset of monsoon ------------
const HEAT_MH_2026 = { from: "2026-04-15", to: "2026-06-07" };

function defaultConfig(region, year) {
  // Only Pune/2026 is seeded for now; the shape is general.
  return {
    region: region || "Pune",
    year: year || 2026,
    weeklyOffs: [0],                 // Sunday only (6-day construction week)
    holidays: HOLIDAYS_MH_2026,      // siteOff ones remove a working day
    festivals: FESTIVAL_WINDOWS_2026,
    monsoon: MONSOON_MH_2026,
    heat: HEAT_MH_2026,
    factors: FACTORS,
  };
}

// ---- working-day predicates -----------------------------------------
function isWorkingDay(iso, cfg) {
  cfg = cfg || defaultConfig();
  const dt = _d(iso);
  if (cfg.weeklyOffs.indexOf(_dow(dt)) !== -1) return false;
  for (const h of cfg.holidays) if (h.date === iso && h.siteOff) return false;
  return true;
}

function nextWorkingDay(iso, cfg) {
  let cur = iso, guard = 0;
  while (!isWorkingDay(cur, cfg)) { cur = _iso(_add(_d(cur), 1)); if (++guard > 60) break; }
  return cur;
}

// n working days AFTER iso (n=1 -> the next working day). n can be 0.
function addWorkingDays(iso, n, cfg) {
  let cur = _d(iso), left = n;
  if (n === 0) return nextWorkingDay(iso, cfg);
  while (left > 0) {
    cur = _add(cur, 1);
    if (isWorkingDay(_iso(cur), cfg)) left--;
  }
  return _iso(cur);
}

// working days in the half-open range [a, b)
function workingDaysBetween(a, b, cfg) {
  if (a >= b) return 0;
  let cur = _d(a), count = 0, guard = 0;
  while (_iso(cur) < b) {
    if (isWorkingDay(_iso(cur), cfg)) count++;
    cur = _add(cur, 1);
    if (++guard > 4000) break;
  }
  return count;
}

// ---- productivity factor for a single working day -------------------
// 1.0 = ideal.  Multiplies monsoon x heat x festival effects.
function productivityFactor(iso, act, cfg) {
  cfg = cfg || defaultConfig();
  act = act || {};
  const F = cfg.factors, ex = act.exposure === "exterior";
  let f = 1.0;
  const md = iso.slice(5); // 'MM-DD'

  // monsoon
  if (cfg.monsoon && _within(iso, cfg.monsoon.from, cfg.monsoon.to)) {
    const peak = md >= F.monsoon.peakFrom && md <= F.monsoon.peakTo;
    if (act.rainSensitive || ex) f *= peak ? F.monsoon.peakRainSensitive : F.monsoon.rainSensitive;
    else f *= F.monsoon.siteWide;
  }
  // heat
  if (cfg.heat && _within(iso, cfg.heat.from, cfg.heat.to)) {
    if (act.heatSensitive) f *= F.heat.heatSensitive;
    if (ex) f *= F.heat.exteriorExtra;
  }
  // festival ramp-down: deepest at window centre, linear ramp to edges
  for (const w of cfg.festivals) {
    if (_within(iso, w.from, w.to)) {
      const a = _d(w.from).getTime(), b = _d(w.to).getTime(), x = _d(iso).getTime();
      const mid = (a + b) / 2, half = (b - a) / 2 || 1;
      const closeness = 1 - Math.abs(x - mid) / half;        // 0 at edge, 1 at centre
      const mult = 1 - (1 - w.floor) * closeness;            // floor at centre, ~1 at edge
      f *= mult;
    }
  }
  // a gazetted day the site keeps OPEN but with fewer men (siteOff=false)
  for (const h of cfg.holidays) {
    if (h.date === iso && h.siteOff === false) { f *= (h.workFactor || 0.7); break; }
  }
  return Math.max(0.25, Math.min(1, f));
}

// ---- effective span: turn "N ideal working-days of effort" into real
// start/finish, absorbing every non-working day AND every productivity
// dip across the span.  This is what the CPM calls for each task, so
// monsoon and Diwali automatically push the critical path.
function effectiveSpan(startISO, baseDays, act, cfg) {
  cfg = cfg || defaultConfig();
  const need = Math.max(0, baseDays);
  if (need === 0) { const s = nextWorkingDay(startISO, cfg); return { start: s, end: s, workingDays: 0, calendarDays: 0, avgFactor: 1, drivers: [] }; }
  let cur = nextWorkingDay(startISO, cfg);
  const start = cur;
  let acc = 0, wdays = 0, guard = 0, last = cur;
  const drivers = {};
  while (acc < need - 1e-9) {
    if (isWorkingDay(cur, cfg)) {
      const f = productivityFactor(cur, act, cfg);
      acc += f; wdays++; last = cur;
      if (f < 0.999) {                      // record WHY it stretched
        const md = cur.slice(5);
        let tag = "monsoon";
        for (const w of cfg.festivals) if (_within(cur, w.from, w.to)) tag = w.name;
        if (cfg.heat && _within(cur, cfg.heat.from, cfg.heat.to) && (act||{}).heatSensitive) tag = tag === "monsoon" ? "heat" : tag;
        drivers[tag] = (drivers[tag] || 0) + (1 - f);
      }
    }
    if (acc < need - 1e-9) cur = _iso(_add(_d(cur), 1));
    if (++guard > 4000) break;
  }
  const end = last;
  const calendarDays = Math.round((_d(end).getTime() - _d(start).getTime()) / 86400000) + 1;
  return {
    start, end, workingDays: wdays, calendarDays,
    avgFactor: +(need / wdays).toFixed(3),
    drivers: Object.keys(drivers).map(k => ({ cause: k, daysLost: +drivers[k].toFixed(2) }))
                   .sort((a, b) => b.daysLost - a.daysLost),
  };
}

function holidaysInRange(a, b, cfg) {
  cfg = cfg || defaultConfig();
  return cfg.holidays.filter(h => h.date >= a && h.date <= b);
}

// ---- dual-mode export (browser global + node require) ---------------
const CAL = {
  isWorkingDay, nextWorkingDay, addWorkingDays, workingDaysBetween,
  productivityFactor, effectiveSpan, holidaysInRange, defaultConfig,
  _iso, _d, _add, // small helpers reused by other modules
  HOLIDAYS_MH_2026, FESTIVAL_WINDOWS_2026, MONSOON_MH_2026, HEAT_MH_2026, FACTORS,
};
(function (g) { g.KB_CAL = CAL; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = CAL;

})();
