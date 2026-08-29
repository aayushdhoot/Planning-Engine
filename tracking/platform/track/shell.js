// ===================================================================
// DnB-OS . platform/track/shell.js . THE SHELL LAWS
// Presentation only. This module holds no data, touches no ledger and
// changes no status. It exists so the new shell's rules can be tested
// like every other law in the engine:
//   . six team tabs. The admin door is never one of them.
//   . the landing law. Management opens Compare, everyone else opens
//     Today. Same data underneath, only the first screen differs.
//   . the copy law. Any Compare sentence carrying a number is built
//     from the live rows at render time. Hand typed copy rotted once
//     already (74 and 49 printed against a live 61 and 40) and this
//     law exists so it cannot come back.
//   . one inbox. A tab shows a count chip, never its own query list,
//     and that count comes from the same filter the inbox opens with.
// ===================================================================

;(function (root) {

// ---- the eight the team sees. The admin door is a gear, not a tab ----
// Reports joined as the seventh: the publishing surface, still a team tab.
// Drive joined as the eighth: what the walk put in Drive and whether the
// engine has read it. It is a team tab on purpose. The question "did the
// site shoot today, and did anyone read it" is a daily operational one,
// so it does not belong behind the admin gear with the plumbing.
// Engine Read joined as the ninth, next to Drive: Drive says what the walk
// put in, Engine Read says what the engine took out of it. The pair is the
// read pipeline, so they sit together.
const TEAM_TABS = ["today", "compare", "site", "design", "procurement", "queries", "reports", "drive", "engineread"];
const ADMIN_VIEW = "admin";

function isTeamTab(id) { return TEAM_TABS.indexOf(id) !== -1; }

// ---- the client door ----
// A third landing, outside the team tabs. A client link opens the curated
// read only view (built by TRACK_CLIENT). It is never a team tab and never
// the admin door, so a client link can reach neither one.
const CLIENT_ROLE = "client";
function isClientRole(role) {
  return String(role == null ? "" : role).trim().toLowerCase() === CLIENT_ROLE;
}

// ---- the landing law ----
// One portal, three doors. Ops lands on Today, management lands on
// Compare, a client lands on the curated client view. Anything else lands
// on Today, never on a blank.
const MGMT_ROLES = ["mgmt", "management", "manager", "md", "leadership"];
function landingTab(role) {
  const r = String(role == null ? "" : role).trim().toLowerCase();
  if (r === CLIENT_ROLE) return "client";
  return MGMT_ROLES.indexOf(r) !== -1 ? "compare" : "today";
}

// ---- the three modes (Phase 0c) ----
// One app, three modes over one spine. The mode decides which surface a
// person lands on; the landing law above still decides which TAB inside
// the tracking surface once they are there. The two are deliberately
// separate: a management user lands in Track mode AND on the Compare
// tab, and neither rule needs to know the other.
const MODES = ["plan", "track", "site"];
function isMode(m) { return MODES.indexOf(String(m == null ? "" : m).trim().toLowerCase()) !== -1; }

// Who lands where. A role is a job, and the job says which surface is
// the front door:
//   . the people who AUTHOR a plan land in Plan
//   . the people who WATCH one land in Track, client included, because
//     the client surface is the tracking engine's curated read only view
//   . the people who DO the work land in Site, which is the phone view
// An unknown role lands in Plan, because a project is authored before it
// is tracked, and a plan is the thing everything else reads.
const PLAN_ROLES  = ["planner", "planning", "design", "purchase", "procurement", "commercial", "pmo", "lead"];
const SITE_ROLES  = ["site", "supervisor", "engineer", "foreman", "crew", "contractor"];
const TRACK_ROLES = ["mgmt", "management", "manager", "md", "leadership", "ops", "client"];

function landingMode(role) {
  const r = String(role == null ? "" : role).trim().toLowerCase();
  if (SITE_ROLES.indexOf(r) !== -1) return "site";
  if (TRACK_ROLES.indexOf(r) !== -1) return "track";
  if (PLAN_ROLES.indexOf(r) !== -1) return "plan";
  return "plan";
}

// A client link is a track link, and it must stay stripped. This is the
// one place the two laws meet, so it is stated once here rather than
// re-derived in the shell: a client never reaches Plan or Site.
function modesFor(role) {
  return isClientRole(role) ? ["track"] : MODES.slice();
}

// ---- one inbox ----
// The only place a query count is ever computed. A tab chip and the
// inbox itself must call this with the same prefix, so the number on
// the chip is the number of rows the inbox opens with.
function openQueries(queries, prefix) {
  const open = (queries || []).filter(q => q && q.status === "open");
  if (!prefix) return open;
  return open.filter(q => String(q.about || "").indexOf(prefix) === 0);
}

// ---- the copy law ----
// Heads of hand written insight cards whose body carries live numbers.
// The view drops these from the pack and prints a generated card in
// their place. The pack itself is never edited, only filtered.
const LIVE_HEADS = ["Time vs work"];

function interpretiveInsights(pack) {
  return ((pack && pack.insights) || []).filter(p => LIVE_HEADS.indexOf(p.head) === -1);
}

const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function niceDay(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return String(iso);
  return d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear();
}

// Everything a Compare sentence needs, computed from the live rows.
// Nothing below is typed by hand, so nothing below can rot.
function compareCopy(CMP, pack, today) {
  const t = today || pack.asOf;
  const sum = CMP.summary(pack, t);
  const b = CMP.buildGroups(pack, t);
  // the calendar used, for the day being looked at. The pack states one
  // anchor (day N of M, as of a date), so the start is derived from it and
  // the count moves with the day. Nothing new is hand typed, and picking a
  // different day cannot leave the time line frozen on the pack's own date.
  const DAY_MS = 86400000;
  const anchor = new Date(pack.asOf);
  const start = new Date(anchor.getTime() - (pack.day - 1) * DAY_MS);
  const dayNow = Math.max(1, Math.min(pack.days,
    Math.round((new Date(t) - start) / DAY_MS) + 1));
  const timePct = Math.round(100 * dayNow / pack.days);
  const gap = sum.planMean - sum.siteMean;

  const live = [];
  for (const g of b.groups) for (const x of g.rows) {
    if (x.a.site == null || x.a.chip === "not_due") continue;
    live.push({ name: x.row.name, group: g.label, plan: x.a.plan, site: x.a.site,
      chip: x.a.chip, under: x.a.plan - x.a.site });
  }
  const worst = live.slice().sort((p, q) => q.under - p.under).slice(0, 3);
  const gated = live.filter(r => r.chip === "risk");
  const groupGaps = b.groups
    .filter(g => g.planMean != null && g.siteMean != null)
    .map(g => ({ label: g.label, plan: g.planMean, site: g.siteMean, under: g.planMean - g.siteMean }))
    .sort((p, q) => q.under - p.under);

  const behind = sum.by.behind || 0;
  const onOrAhead = (sum.by.on || 0) + (sum.by.ahead || 0);
  const risk = sum.by.risk || 0;
  const done = sum.by.done || 0;
  const topGroup = groupGaps.length ? groupGaps[0] : null;

  const worstTxt = worst.map(w => w.name + " (plan " + w.plan + ", site " + w.site + ")").join(", ");
  const gatedTxt = gated.map(g => g.name).join(", ");

  return {
    asOf: t, timePct, planMean: sum.planMean, siteMean: sum.siteMean, gap,
    liveRows: sum.live, by: sum.by, behind, onOrAhead, risk, done,
    worst, gated, groupGaps, topGroup,

    verdict: timePct + " percent of the time is used and live packages average "
      + sum.siteMean + " percent against a plan ask of " + sum.planMean + ". The gap is "
      + (gap > 0 ? gap : 0) + " points"
      + (topGroup ? ", and the widest one sits in " + topGroup.label + ", " + topGroup.under
        + " points under its line." : "."),

    timeVsWork: timePct + " percent of the calendar is gone. " + sum.live
      + " live packages average " + sum.siteMean + " percent against a plan ask of "
      + sum.planMean + ". " + behind + " behind, " + onOrAhead + " on plan or ahead, "
      + risk + " waiting on a gate.",

    worstLine: worst.length
      ? "Furthest under the plan line right now: " + worstTxt + "."
      : "No package is under its plan line.",

    gatedLine: gated.length
      ? risk + " package" + (risk > 1 ? "s are" : " is") + " held by a gate outside labour: " + gatedTxt + "."
      : "No package is held by a gate outside labour."
  };
}

root.TRACK_SHELL = { TEAM_TABS, ADMIN_VIEW, CLIENT_ROLE, isTeamTab, isClientRole, landingTab, openQueries,
  MODES, isMode, landingMode, modesFor, PLAN_ROLES, SITE_ROLES, TRACK_ROLES,
  LIVE_HEADS, interpretiveInsights, compareCopy, niceDay };
if (typeof module !== "undefined") module.exports = root.TRACK_SHELL;

})(typeof window !== "undefined" ? window : globalThis);
