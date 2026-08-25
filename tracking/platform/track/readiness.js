// ===================================================================
// DnB-OS . platform/track/readiness.js . WHAT THIS REPORT STILL NEEDS
// A report that quietly writes "to be updated after the next walk" is a
// report that looks finished and is not. This law names the missing
// input instead, on the cover, before anyone reads the rest.
//
// The laws:
//   . every gap is named as an input a human can supply, not as a shrug.
//     "Needs the 25 Jul walk read" beats "data pending".
//   . every gap says who closes it and how, so the cover is actionable.
//   . a blocking gap means the report cannot be trusted as issued. A
//     soft gap means one section is thin but the rest stands.
//   . the check is pure. Facts in, verdict out, no clock and no storage,
//     so the guards can break it offline.
//   . silence is not readiness. A report with nothing to declare returns
//     ready true and an empty list, never an assumption.
// ===================================================================

;(function (root) {

// what each report cannot be honest without. blocking means the number
// on the page would be wrong, not merely thin.
const NEEDS = {
  dailyDigest: [
    { id: "walk_read", blocking: true },
    { id: "walk_shot", blocking: true }
  ],
  formalDpr: [
    { id: "walk_read", blocking: true },
    { id: "walk_shot", blocking: true },
    { id: "dpr_manpower", blocking: false }
  ],
  clientWeekly: [
    { id: "walk_read", blocking: true },
    { id: "renders", blocking: false },
    { id: "site_pct", blocking: false }
  ],
  formalWpr: [
    { id: "walk_read", blocking: true },
    { id: "dpr_manpower", blocking: false },
    { id: "site_pct", blocking: false }
  ],
  hseReport: [
    { id: "walk_read", blocking: true },
    { id: "hse_log", blocking: false }
  ],
  hseClient: [
    { id: "walk_read", blocking: true },
    { id: "hse_log", blocking: false }
  ],
  twoWeekLookAhead: [
    { id: "walk_read", blocking: false },
    { id: "site_pct", blocking: false }
  ],
  managementOnepager: [{ id: "walk_read", blocking: true }, { id: "site_pct", blocking: false }],
  siteWalkDeck: [{ id: "walk_shot", blocking: true }],
  clientWalkthrough: [{ id: "walk_shot", blocking: true }, { id: "walk_route", blocking: false }],
  plannedVsAchieved: [{ id: "site_pct", blocking: false }],
  manpowerTrend: [{ id: "dpr_manpower", blocking: false }],
  delayRegister: [], gfcStatus: [], procurementWeekly: [], poRegister: []
};

// how each gap reads on the cover. Named input, named owner, named fix.
const WORDING = {
  walk_read: {
    what: "The walk for this day is not read",
    who: "site team",
    fix: "Open the Drive tab and press Read with my Claude for this day. Every number that comes from the walk is missing until then."
  },
  walk_shot: {
    what: "No pin photos for this day",
    who: "site supervisor",
    fix: "Shoot the 81 pin walk on the capture link. Without photos this report has no site evidence at all."
  },
  dpr_manpower: {
    what: "No DPR manpower for this day",
    who: "site engineer",
    fix: "Paste the daily report into Add DPR on the Drive tab. Headcount and the trade split stay unstated until then."
  },
  renders: {
    what: "Some areas have no approved render",
    who: "design team",
    fix: "Upload the missing renders to the Drive 3D folder. Those areas show the site photo alone, never a stand in."
  },
  site_pct: {
    what: "Package percentages were judged on an earlier date",
    who: "planning",
    fix: "Re read the packages against this week's walk, or read this report against the date the percentages carry."
  },
  hse_log: {
    what: "No safety log for this window",
    who: "HSE officer",
    fix: "Record the walk observations, toolbox talks and any incident in the HSE log so this report counts them."
  },
  walk_route: {
    what: "No walkthrough route saved",
    who: "project manager",
    fix: "Pick the rooms and their order on the Reports tab so the pack follows the route you will actually walk."
  }
};

// check(key, facts) . facts is what the caller already knows:
//   { dayRead, dayShot, hasDprManpower, renderShort, siteAsOf, reportAsOf,
//     hasHseLog, hasRoute }
// Returns { ready, blocking, gaps:[{id,what,who,fix,blocking}] }.
function check(key, facts) {
  const f = facts || {};
  const wants = NEEDS[key] || [];
  const gaps = [];
  const fail = {
    walk_read:    f.dayRead === false,
    walk_shot:    f.dayShot === false,
    dpr_manpower: f.hasDprManpower === false,
    renders:      Number(f.renderShort) > 0,
    site_pct:     !!(f.siteAsOf && f.reportAsOf && f.siteAsOf !== f.reportAsOf),
    hse_log:      f.hasHseLog === false,
    walk_route:   f.hasRoute === false
  };
  for (const w of wants) {
    if (!fail[w.id]) continue;
    const word = WORDING[w.id];
    if (!word) continue;
    let what = word.what;
    if (w.id === "renders" && Number(f.renderShort) > 0)
      what = Number(f.renderShort) + " area" + (f.renderShort > 1 ? "s have" : " has") + " no approved render";
    if (w.id === "site_pct" && f.siteAsOf)
      what = "Package percentages were judged on " + f.siteAsOf + ", this report is dated " + f.reportAsOf;
    gaps.push({ id: w.id, what: what, who: word.who, fix: word.fix, blocking: !!w.blocking });
  }
  const blocking = gaps.filter(g => g.blocking).length;
  return { ready: gaps.length === 0, blocking: blocking, gaps: gaps };
}

// one line for a cover strip, built from the gaps so it cannot disagree
function line(res) {
  if (!res || res.ready) return "";
  const n = res.gaps.length;
  return n + " input" + (n > 1 ? "s" : "") + " missing" +
    (res.blocking ? ", " + res.blocking + " of them blocking" : "") +
    ". This report is not complete until they land.";
}

root.TRACK_READINESS = { NEEDS, WORDING, check, line };
if (typeof module !== "undefined") module.exports = root.TRACK_READINESS;

})(typeof window !== "undefined" ? window : globalThis);
