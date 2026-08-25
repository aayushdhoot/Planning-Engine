// ===================================================================
// DnB-OS . platform/track/reports.js . THE REPORT REGISTRY
// The full catalog of what the engine can publish, in one law. Every
// report the Reports tab shows is one entry here, so the catalog, the
// tab and the guards all read the same list and can never disagree.
//
// One walk in, every report out. The site gives ninety minutes of
// photographs each morning and the engine turns that single input into
// the daily record, the client story, the leadership page and the
// buying chase list. This registry names all nineteen of them.
//
// Each entry carries: id, name, what it tells, audience, cadence, group,
// status (live / ready / later), a relevance score, whether it is client
// safe, and a render key. A report is enabled only when it names a render
// key the tab can resolve. Everything else shows as a quiet locked card
// with its status, never a broken button.
//
// Pure. No DOM, no data. The renderers live in the view (they touch the
// live rows and the photos), the registry only says which reports exist
// and which are switched on.
// ===================================================================

;(function (root) {

// the five groups the tab lays the cards out in, in this order.
var GROUP_ORDER = ["Daily", "Weekly", "Monthly", "Event", "Later"];
var STATUSES = ["live", "ready", "later"];

// The catalog. Monday cadence reports sit under Weekly, fortnightly, on
// demand and per visit under Event, the four not yet buildable under
// Later. render is the key the view maps to a renderer, or null (locked).
var REPORTS = [
  // ---- Daily ----
  { id: "daily-site-digest", name: "Daily Site Digest",
    tells: "What the floor showed, watch items, safety flags, photos",
    audience: "Project team", cadence: "Every walk day", group: "Daily",
    status: "live", score: 9, clientSafe: false, render: "dailyDigest" },
  { id: "formal-dpr", name: "Formal DPR",
    tells: "Record grade daily: manpower, work done, hindrances",
    audience: "Site record", cadence: "Daily", group: "Daily",
    status: "live", score: 8, clientSafe: false, render: "formalDpr" },

  // ---- Weekly (Monday pack + weekly cadence) ----
  { id: "client-weekly", name: "Client Weekly Report",
    tells: "The week told honestly to the client, progress, slips, asks",
    audience: "SKF client", cadence: "Monday", group: "Weekly",
    status: "live", score: 10, clientSafe: true, render: "clientWeekly" },
  { id: "management-onepager", name: "Management One Pager",
    tells: "Risks with reasons, decisions needed, money flags, one page",
    audience: "Leadership", cadence: "Monday", group: "Weekly",
    status: "live", score: 10, clientSafe: false, render: "managementOnepager" },
  { id: "procurement-weekly", name: "Procurement Weekly",
    tells: "POs placed, receipts due, quote pile, actions for the week",
    audience: "Buying team", cadence: "Monday", group: "Weekly",
    status: "live", score: 9, clientSafe: false, render: "procurementWeekly" },
  { id: "delay-risk-register", name: "Delay and risk register",
    tells: "Every slip with reason, owner and recovery date",
    audience: "Leadership", cadence: "Monday", group: "Weekly",
    status: "live", score: 9, clientSafe: false, render: "delayRegister" },
  { id: "design-gfc-status", name: "Design and GFC status",
    tells: "Drawing pipeline, who is holding which sign off",
    audience: "Design and client", cadence: "Weekly", group: "Weekly",
    status: "live", score: 8, clientSafe: false, render: "gfcStatus" },
  { id: "hse-report", name: "HSE report, internal",
    tells: "Every lapse on the floor, repeats, closure rate, what is not fixed",
    audience: "Site and HSE", cadence: "Weekly", group: "Weekly",
    status: "live", score: 8, clientSafe: false, render: "hseReport" },
  { id: "hse-client", name: "HSE report, client",
    tells: "The safety standard being kept on site, with photo evidence",
    audience: "SKF client", cadence: "Weekly", group: "Weekly",
    status: "live", score: 8, clientSafe: true, render: "hseClient" },
  { id: "two-week-look-ahead", name: "Two week look ahead",
    tells: "What opens, what closes, what each needs to hold",
    audience: "Site and client", cadence: "Weekly", group: "Weekly",
    status: "live", score: 8, clientSafe: false, render: "twoWeekLookAhead" },
  { id: "formal-wpr", name: "Formal WPR",
    tells: "The week in record format for the project file",
    audience: "Client and PMO", cadence: "Monday", group: "Weekly",
    status: "live", score: 7, clientSafe: false, render: "formalWpr" },
  { id: "manpower-trend", name: "Manpower trend",
    tells: "Headcount by day against what the window needs",
    audience: "Operations", cadence: "Weekly", group: "Weekly",
    status: "live", score: 7, clientSafe: false, render: "manpowerTrend" },

  // ---- Monthly ----
  { id: "po-commitment-register", name: "PO and commitment register",
    tells: "Committed value against BOQ for leadership, gaps to reconcile",
    audience: "Finance", cadence: "Monthly", group: "Monthly",
    status: "live", score: 7, clientSafe: false, render: "poRegister" },

  // ---- Event (fortnightly, on demand, per visit) ----
  { id: "planned-vs-achieved", name: "Planned vs Achieved deck",
    tells: "Package by package, plan against what the walk shows",
    audience: "Internal review", cadence: "Fortnightly", group: "Event",
    status: "live", score: 8, clientSafe: false, render: "plannedVsAchieved" },
  { id: "site-walk-deck", name: "Site Walk photo deck",
    tells: "The site in curated frames with plain captions",
    audience: "Any audience", cadence: "On demand", group: "Event",
    status: "live", score: 7, clientSafe: true, render: "siteWalkDeck" },
  { id: "client-walkthrough", name: "Client walkthrough pack",
    tells: "Photos and talking points before a client visit",
    audience: "Client visits", cadence: "Per visit", group: "Event",
    status: "live", score: 8, clientSafe: true, render: "clientWalkthrough" },

  // ---- Later (data not landed yet) ----
  { id: "handover-dossier", name: "Handover dossier",
    tells: "As builts, test records, full photo archive",
    audience: "Client", cadence: "Closeout", group: "Later",
    status: "later", score: 9, clientSafe: false, render: null,
    unlock: "Fills at closeout, once as builts and test records are logged." },
  { id: "snag-quality", name: "Snag and quality report",
    tells: "Finish stage defect list and closure tracking",
    audience: "Site and client", cadence: "Finish stage", group: "Later",
    status: "later", score: 8, clientSafe: false, render: null,
    unlock: "Switches on at finish stage, when the snag list starts filling." },
  { id: "ra-bill-cash", name: "RA bill and cash tracker",
    tells: "Bills raised, collected, exposure by head",
    audience: "Finance", cadence: "Monthly", group: "Later",
    status: "later", score: 8, clientSafe: false, render: null,
    unlock: "Needs the RA billing and collection figures to be recorded." },
  { id: "render-vs-photo", name: "Render vs photo pairing",
    tells: "Design intent against site reality, pin by pin",
    audience: "Design and client", cadence: "When renders land", group: "Later",
    status: "later", score: 7, clientSafe: true, render: null,
    unlock: "Auto enables the day approved renders load into the register." }
];

function all() { return REPORTS; }
function byId(id) { return REPORTS.filter(function (r) { return r.id === id; })[0] || null; }
function enabled(r) { return !!(r && r.render); }

// the tab reads this: the reports grouped in the fixed group order, each
// group carrying only the reports it holds, empty groups dropped.
function grouped() {
  return GROUP_ORDER.map(function (g) {
    return { group: g, reports: REPORTS.filter(function (r) { return r.group === g; }) };
  }).filter(function (x) { return x.reports.length; });
}

// what a guard checks: nineteen entries, unique ids, valid groups and
// statuses, every enabled report names a render key, every locked one
// does not. Returns a report the guard can assert field by field.
function integrity() {
  var ids = REPORTS.map(function (r) { return r.id; });
  var uniqueIds = new Set(ids).size === ids.length;
  var groupsValid = REPORTS.every(function (r) { return GROUP_ORDER.indexOf(r.group) !== -1; });
  var statusValid = REPORTS.every(function (r) { return STATUSES.indexOf(r.status) !== -1; });
  var fieldsOk = REPORTS.every(function (r) {
    return r.id && r.name && r.tells && r.audience && r.cadence &&
      typeof r.score === "number" && typeof r.clientSafe === "boolean";
  });
  var enabledOk = REPORTS.every(function (r) {
    return enabled(r) ? (typeof r.render === "string" && r.render.length > 0) : (r.render == null);
  });
  var enabledIds = REPORTS.filter(enabled).map(function (r) { return r.id; });
  return { count: REPORTS.length, uniqueIds: uniqueIds, groupsValid: groupsValid,
    statusValid: statusValid, fieldsOk: fieldsOk, enabledOk: enabledOk,
    enabledCount: enabledIds.length, enabledIds: enabledIds };
}

root.TRACK_REPORTS = {
  GROUP_ORDER: GROUP_ORDER, STATUSES: STATUSES,
  all: all, list: REPORTS, byId: byId, enabled: enabled,
  grouped: grouped, integrity: integrity
};
if (typeof module !== "undefined") module.exports = root.TRACK_REPORTS;

})(typeof window !== "undefined" ? window : globalThis);
