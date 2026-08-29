// ===================================================================
// DnB-OS · platform/kb/calendar_project.js
// Per-project working calendar (NO company master — each project owns
// its own).  A new project's calendar is SEEDED from the region/year
// defaults in calendar.js, then a user edits it and signs it off.
//
// The object this makes IS a valid cfg for every function in
// calendar.js — so isWorkingDay / effectiveSpan / etc. run straight on
// a project calendar with no glue.
//
// Rules baked in:
//  - every edit is stamped with who + when (audit trail)
//  - editing an APPROVED calendar drops it back to DRAFT (needs re-sign)
//  - a holiday is either "site fully shut" (siteOff:true) or
//    "open, fewer men" (siteOff:false, workFactor 0..1)
//
// Public contract:
//   createProjectCalendar(projectId, name, {region,year}, who) -> cal
//   addHoliday(cal, {date,name,kind,siteOff,workFactor}, who)
//   removeHoliday(cal, date, who)
//   setSiteOff(cal, date, siteOff, who)     // true = shut, false = fewer men
//   setWorkFactor(cal, date, factor, who)   // strength on a fewer-men day
//   setWeeklyOffs(cal, [0..6], who)          // [] = 7-day, [0]=Sun, [0,6]=wknd
//   setMonsoon(cal, {from,to}, who)
//   setHeat(cal, {from,to}, who)
//   upsertFestival(cal, {key,name,from,to,floor}, who)
//   removeFestival(cal, key, who)
//   approve(cal, who) / reopen(cal, who)
//   validate(cal) -> [issues]
//   summary(cal)   -> {status, workingDaysInYear, ...}
// ===================================================================

;(function () {   // sealed scope — nothing leaks except window.KB_CALP / module.exports

const CAL = (typeof require !== "undefined") ? require("./calendar.js")
          : (typeof window !== "undefined" ? window.KB_CAL : globalThis.KB_CAL);

const _ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
function _now() { return new Date().toISOString(); }
function _log(cal, who, action, detail) {
  cal.audit.push({ ts: _now(), who: who || "system", action, detail: detail || "" });
}
// any change to an approved calendar sends it back to draft
function _touch(cal, who, action, detail) {
  if (cal.status === "approved") {
    cal.status = "draft"; cal.approvedBy = null; cal.approvedAt = null;
    _log(cal, who, "reopen", "edited after approval — needs re-sign-off");
  }
  _log(cal, who, action, detail);
  return cal;
}

function createProjectCalendar(projectId, name, opts, who) {
  opts = opts || {};
  const seed = CAL.defaultConfig(opts.region, opts.year);
  const cal = {
    projectId: projectId,
    name: name || projectId,
    region: seed.region,
    year: seed.year,
    weeklyOffs: seed.weeklyOffs.slice(),
    holidays: seed.holidays.map(h => Object.assign({}, h)),
    festivals: seed.festivals.map(f => Object.assign({}, f)),
    monsoon: Object.assign({}, seed.monsoon),
    heat: Object.assign({}, seed.heat),
    factors: seed.factors,           // shared tunables; day-level edits go via ops
    status: "draft",
    approvedBy: null,
    approvedAt: null,
    audit: [],
  };
  _log(cal, who, "create", "seeded from " + cal.region + " " + cal.year +
       " — " + cal.holidays.length + " holidays");
  return cal;
}

function addHoliday(cal, h, who) {
  if (!h || !_ISO_RE.test(h.date || "")) throw new Error("addHoliday: date must be YYYY-MM-DD");
  cal.holidays = cal.holidays.filter(x => x.date !== h.date); // replace if same day
  const rec = {
    date: h.date,
    name: h.name || "Holiday",
    kind: h.kind || "custom",
    siteOff: h.siteOff !== false,                 // default = fully shut
  };
  if (rec.siteOff === false) rec.workFactor = (h.workFactor != null ? h.workFactor : 0.7);
  cal.holidays.push(rec);
  cal.holidays.sort((a, b) => a.date < b.date ? -1 : 1);
  return _touch(cal, who, "add-holiday", rec.date + " " + rec.name +
    (rec.siteOff ? " (shut)" : " (fewer men " + rec.workFactor + ")"));
}

function removeHoliday(cal, date, who) {
  const before = cal.holidays.length;
  cal.holidays = cal.holidays.filter(x => x.date !== date);
  if (cal.holidays.length === before) return cal; // nothing removed, no log
  return _touch(cal, who, "remove-holiday", date);
}

function setSiteOff(cal, date, siteOff, who) {
  const h = cal.holidays.find(x => x.date === date);
  if (!h) throw new Error("setSiteOff: no holiday on " + date);
  h.siteOff = !!siteOff;
  if (h.siteOff) delete h.workFactor;
  else if (h.workFactor == null) h.workFactor = 0.7;
  return _touch(cal, who, "set-siteoff", date + " -> " + (h.siteOff ? "shut" : "fewer men"));
}

function setWorkFactor(cal, date, factor, who) {
  const h = cal.holidays.find(x => x.date === date);
  if (!h) throw new Error("setWorkFactor: no holiday on " + date);
  h.siteOff = false; h.workFactor = Math.max(0.1, Math.min(1, factor));
  return _touch(cal, who, "set-workfactor", date + " -> " + h.workFactor);
}

function setWeeklyOffs(cal, days, who) {
  if (!Array.isArray(days)) throw new Error("setWeeklyOffs: array of 0..6");
  cal.weeklyOffs = days.slice().sort();
  const label = days.length === 0 ? "7-day week" : ("off: " + days.join(","));
  return _touch(cal, who, "set-weekly-offs", label);
}

function setMonsoon(cal, w, who) {
  if (!w || !_ISO_RE.test(w.from || "") || !_ISO_RE.test(w.to || "")) throw new Error("setMonsoon: {from,to} ISO");
  cal.monsoon = { from: w.from, to: w.to };
  return _touch(cal, who, "set-monsoon", w.from + " .. " + w.to);
}

function setHeat(cal, w, who) {
  if (!w || !_ISO_RE.test(w.from || "") || !_ISO_RE.test(w.to || "")) throw new Error("setHeat: {from,to} ISO");
  cal.heat = { from: w.from, to: w.to };
  return _touch(cal, who, "set-heat", w.from + " .. " + w.to);
}

function upsertFestival(cal, f, who) {
  if (!f || !f.key || !_ISO_RE.test(f.from || "") || !_ISO_RE.test(f.to || "")) throw new Error("upsertFestival: {key,from,to,floor}");
  cal.festivals = cal.festivals.filter(x => x.key !== f.key);
  cal.festivals.push({ key: f.key, name: f.name || f.key, from: f.from, to: f.to, floor: (f.floor != null ? f.floor : 0.8) });
  cal.festivals.sort((a, b) => a.from < b.from ? -1 : 1);
  return _touch(cal, who, "set-festival", f.key + " " + f.from + ".." + f.to + " floor " + (f.floor != null ? f.floor : 0.8));
}

function removeFestival(cal, key, who) {
  const before = cal.festivals.length;
  cal.festivals = cal.festivals.filter(x => x.key !== key);
  if (cal.festivals.length === before) return cal;
  return _touch(cal, who, "remove-festival", key);
}

function approve(cal, who) {
  const issues = validate(cal);
  if (issues.length) throw new Error("approve blocked: " + issues.join("; "));
  cal.status = "approved"; cal.approvedBy = who || "unknown"; cal.approvedAt = _now();
  _log(cal, who, "approve", "signed off");
  return cal;
}

function reopen(cal, who) {
  cal.status = "draft"; cal.approvedBy = null; cal.approvedAt = null;
  _log(cal, who, "reopen", "manually reopened");
  return cal;
}

function validate(cal) {
  const issues = [];
  const seen = {};
  for (const h of cal.holidays) {
    if (!_ISO_RE.test(h.date)) issues.push("bad holiday date: " + h.date);
    if (seen[h.date]) issues.push("duplicate holiday: " + h.date);
    seen[h.date] = 1;
    if (h.siteOff === false && h.workFactor != null && (h.workFactor <= 0 || h.workFactor > 1))
      issues.push("bad workFactor on " + h.date); // missing => 0.7 default applies
  }
  if (cal.weeklyOffs.length >= 7) issues.push("no working weekday left");
  if (cal.monsoon && cal.monsoon.from > cal.monsoon.to) issues.push("monsoon from>to");
  return issues;
}

function summary(cal) {
  const y = cal.year;
  const jan1 = y + "-01-01", nextJan1 = (y + 1) + "-01-01";
  return {
    project: cal.name,
    status: cal.status,
    approvedBy: cal.approvedBy,
    weeklyOffs: cal.weeklyOffs,
    holidaysShut: cal.holidays.filter(h => h.siteOff).length,
    holidaysFewerMen: cal.holidays.filter(h => h.siteOff === false).length,
    festivals: cal.festivals.length,
    workingDaysInYear: CAL.workingDaysBetween(jan1, nextJan1, cal),
    edits: cal.audit.length,
  };
}

// ---- dual-mode export ----------------------------------------------
const CALP = {
  createProjectCalendar, addHoliday, removeHoliday, setSiteOff, setWorkFactor,
  setWeeklyOffs, setMonsoon, setHeat, upsertFestival, removeFestival,
  approve, reopen, validate, summary,
};
(function (g) { g.KB_CALP = CALP; })(typeof window !== "undefined" ? window : globalThis);
if (typeof module !== "undefined" && module.exports) module.exports = CALP;

})();
