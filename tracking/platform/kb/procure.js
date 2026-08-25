// ===================================================================
// DnB-OS . platform/kb/procure.js . THE HALF OF THE JOB BEFORE THE SITE
// The programme started at demolition. Every long-lead package carried a
// `leadWeeks` number that pushed its start to the right, and that was the
// only trace of procurement anywhere in the engine: a constraint nobody
// could see, with no date by which a PO had to be placed and no name
// against it. Nine weeks of VRF outdoor unit lead time is not a property
// of a site task. It is six real activities with six real owners.
//
//   CHAIN        the stages between a design intent and a box on the floor
//   chainFor()   one package's lead time laid out as dated activities
//
// THE LAWS
//   . THE CHAIN LANDS WHEN THE SITE NEEDS IT, NOT WHEN IT FEELS LIKE IT.
//     Every stage is back-scheduled from the day the site task starts, so
//     the dates say "order by", not "ordered around then".
//   . IT IS SCHEDULED, NOT TRACKED. Nobody photographs a purchase order.
//     Every task here carries track:false, stays out of the completion
//     percentage, and never dilutes what the site has actually built.
//   . A DATE ALREADY PAST IS A QUESTION, NOT A FAILURE. Half these POs
//     were placed weeks ago and nobody told this engine. So a stage whose
//     latest start has gone is raised as a QUERY addressed to the person
//     who would know, at medium importance, and the site work is never
//     held up waiting for the answer.
//
// Pure: numbers in, tasks out. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

// ---- the stages, and what share of the lead time each one takes --------
// Shares from the PERT chart's own front end and from how a fit-out
// actually runs: drawing and approval are a third of it, manufacture is
// the long pole, and the truck is the short tail everybody forgets.
const CHAIN = [
  { id: "design",    code: "pkg_design",    name: "Shop drawings",     share: 0.18,
    owner: "design",      ownerName: "Design",
    why: "the package is drawn to what was actually bought, not to the tender sketch" },
  { id: "approval",  code: "pkg_approval",  name: "Client approval",   share: 0.12,
    owner: "client",      ownerName: "Client / PMC",
    why: "the client and the consultant sign the drawing before anybody cuts material" },
  { id: "po",        code: "pkg_po",        name: "Vendor order",      share: 0.10,
    owner: "procurement", ownerName: "Procurement",
    why: "rate comparison, negotiation and the purchase order itself" },
  { id: "submittal", code: "pkg_submittal", name: "Material approval", share: 0.10,
    owner: "client",      ownerName: "Client / PMC",
    why: "sample, shade and make approved against the specification" },
  { id: "mfg",       code: "pkg_mfg",       name: "Manufacturing",     share: 0.38,
    owner: "vendor",      ownerName: "Vendor",
    why: "the factory time the vendor quoted, and the reason the lead time exists at all" },
  { id: "delivery",  code: "pkg_delivery",  name: "Delivery",          share: 0.12,
    owner: "vendor",      ownerName: "Vendor",
    why: "despatch, transit, and getting it up a shared goods lift into a live tower" },
];

const BY_ID = {}; CHAIN.forEach(c => BY_ID[c.id] = c);

// A SIX-DAY WEEK, because that is the week the rest of this engine runs on
// and a factory quoting "nine weeks" is not quoting five-day weeks.
const WD_PER_WEEK = 6;

// ---- one package's lead time, as dated activities ----------------------
// Back-scheduled: delivery finishes the working day before the site task
// starts, and everything else falls out of that. `back` is the caller's
// "n working days before this date" function, so the working calendar,
// the Sundays and the Maharashtra holidays are all the same ones the
// programme already uses.
function chainFor(pkg, opts) {
  const o = opts || {};
  const weeks = Number(pkg.leadWeeks) || 0;
  if (weeks <= 0) return [];
  const back = o.back || ((iso, n) => iso);
  const total = Math.max(CHAIN.length, Math.round(weeks * WD_PER_WEEK));
  const needBy = pkg.needBy;                 // the day the site task starts
  if (!needBy) return [];

  // share out the working days, never fewer than one per stage, and give
  // any rounding remainder to manufacturing where it belongs
  const days = CHAIN.map(c => Math.max(1, Math.round(total * c.share)));
  const drift = total - days.reduce((a, b) => a + b, 0);
  days[CHAIN.findIndex(c => c.id === "mfg")] += drift;

  // walk backwards from the site start — landing on the day the MATERIAL
  // PLAN says the stuff has to be here, not the day before the gang turns
  // up. Those were one day apart for every package on the job, which is a
  // small number and two pages telling a foreman different days.
  const staging = o.stagingDays == null ? 2 : o.stagingDays;
  const out = []; let cursor = back(needBy, staging);
  for (let i = CHAIN.length - 1; i >= 0; i--) {
    const c = CHAIN[i], d = Math.max(1, days[i]);
    const EF = cursor, ES = back(EF, d - 1);
    out.unshift({
      id: "pq_" + pkg.code + ":" + c.id,
      code: c.code, stage: c.id, forCode: pkg.code, forName: pkg.name,
      name: c.name + " — " + pkg.name,
      trade: "procurement", owner: c.owner, ownerName: c.ownerName,
      ES, EF, durWD: d, needBy,
      // NOBODY PHOTOGRAPHS A PURCHASE ORDER. See the law at the top.
      track: false, gate: false, procurement: true,
      why: c.why,
    });
    cursor = back(ES, 1);
  }
  return out;
}

// ---- what is already late, as a question rather than an accusation -----
// Many of these were done weeks ago and never reached this folder. So the
// engine asks rather than tells, names who would know, and keeps the
// importance at medium — the site is what matters for tracking.
function queriesFor(tasks, today) {
  const now = today || null;
  if (!now) return [];
  const byPkg = {};
  (tasks || []).filter(t => t.procurement).forEach(t => {
    if (t.ES > now) return;                       // not due to have started yet
    const g = byPkg[t.forCode] = byPkg[t.forCode] ||
      { forCode: t.forCode, forName: t.forName, needBy: t.needBy, stages: [] };
    g.stages.push({ stage: t.stage, name: BY_ID[t.stage].name,
      owner: t.owner, ownerName: t.ownerName, shouldHaveStarted: t.ES, shouldFinishBy: t.EF,
      overdue: t.EF < now });
  });
  const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  const say = (iso) => { if (!iso) return "?"; const p = String(iso).split("-");
    return p[2] + " " + MON[Number(p[1]) - 1]; };
  return Object.values(byPkg).map(g => {
    const late = g.stages.filter(s => s.overdue);
    const worst = late.length ? late[late.length - 1] : g.stages[g.stages.length - 1];
    return {
      id: "q:" + g.forCode,
      forCode: g.forCode, package: g.forName, needOnSite: g.needBy,
      importance: "medium",
      askOf: worst.ownerName,
      ask: "Has " + worst.name.toLowerCase() + " for " + g.forName.toLowerCase() + " been done? " +
           "The programme needs it by " + say(worst.shouldFinishBy) +
           " for the material to reach site by " + say(g.needBy) + ".",
      why: "the engine has no record of it, which is not the same as it not having happened. " +
           "POs on this job are raised in Vizdom and most never reach this folder",
      stages: g.stages,
      lateStages: late.length,
    };
  }).sort((a, b) => a.needOnSite.localeCompare(b.needOnSite));
}

const PROCURE = { CHAIN, BY_ID, WD_PER_WEEK, chainFor, queriesFor };
root.KB_PROCURE = PROCURE;
if (typeof module !== "undefined" && module.exports) module.exports = PROCURE;

})(typeof globalThis !== "undefined" ? globalThis : this);
