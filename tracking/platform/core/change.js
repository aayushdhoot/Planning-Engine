// ===================================================================
// DnB-OS . platform/core/change.js . WHAT CHANGED, AND WHAT IT COST
// Output 8. A fit-out does not lose money on the work it priced. It
// loses money on the work it did without pricing, because somebody said
// "just do it" in a site meeting and nobody wrote it down.
//
//   record(c)                   a change, or a refusal with the reason
//   resolve(change)             raised | priced | approved | rejected | absorbed
//   effect(changes)             the running total on cost, time and scope
//   unpriced(changes)           work under way that nobody has priced
//   causeTag(change)            who it belongs to, for the re-plan
//   line(changes)               one sentence
//
// THE LAWS
//   . A CHANGE NEEDS A REQUESTER AND A DATE. "The client asked for it"
//     with no name and no day is not a record anybody can argue from six
//     months later, which is exactly when it gets argued.
//   . A CHANGE WITH NO PRICE IS NOT APPROVED, IT IS EXPOSURE. It stays in
//     the register as unpriced work and is reported as money at risk. The
//     engine will not let it quietly become part of the baseline.
//   . ONLY AN APPROVED CHANGE MOVES THE BASELINE. Raised, priced and
//     rejected changes never touch a date or a budget. This is the same
//     door rule the whole engine runs on: propose, then a human decides.
//   . TIME AND MONEY ARE SEPARATE ANSWERS. A change can cost nothing and
//     still eat two weeks, and a change can cost a lot and cost no time
//     at all. Recording one number for both is how EOT claims die.
//   . WORK STARTED BEFORE APPROVAL IS THE THING WORTH SHOUTING ABOUT.
//     That is the money already spent that nobody has agreed to pay for.
//
// Pure: changes in, position out. No clock, no storage.
// ===================================================================

;(function (root) {

const STATES = ["raised", "priced", "approved", "rejected", "absorbed"];

// who a change belongs to . the same four the re-plan law uses, so a
// change and a delay can be argued from the same vocabulary
const ORIGINS = ["client", "design", "site", "statutory"];

function record(c) {
  const u = c || {};
  if (!u.id)        return { ok: false, why: "A change needs an id, or it cannot be tracked across revisions." };
  if (!u.what || String(u.what).trim().length < 8)
    return { ok: false, why: "Say what actually changed, in a sentence. “revised” is not a record." };
  if (!u.raisedBy)  return { ok: false, why: "A change needs the person who raised it. An unattributed change cannot be argued from." };
  if (!u.raisedOn)  return { ok: false, why: "A change needs the day it was raised. That date is what an EOT window is counted from." };
  if (ORIGINS.indexOf(u.origin) === -1)
    return { ok: false, why: "Say whose change it is: " + ORIGINS.join(", ") + ". Guessing is how a claim gets withdrawn." };

  const num = (v) => (v == null || v === "") ? null : (isFinite(Number(v)) ? Number(v) : NaN);
  const cost = num(u.cost), days = num(u.days);
  if (Number.isNaN(cost)) return { ok: false, why: "The cost has to be a number, or left blank to mean not yet priced." };
  if (Number.isNaN(days)) return { ok: false, why: "The time effect has to be a number of working days, or left blank." };

  const state = String(u.state || "raised");
  if (STATES.indexOf(state) === -1) return { ok: false, why: "Unknown state: " + state };
  // THE PRICE LAW. Approval is agreement to pay a number; there has to be
  // a number. Both are required, because a change can cost days and no
  // money, or money and no days, and "0" said out loud is a decision.
  if (state === "approved" && (cost == null || days == null))
    return { ok: false, why: "A change cannot be approved before it is priced in both money and working days. Put 0 if it truly costs nothing — but say so." };

  return { ok: true, change: {
    id: String(u.id), what: String(u.what).trim(), origin: u.origin,
    raisedBy: String(u.raisedBy), raisedOn: String(u.raisedOn),
    cost: cost, days: days, state,
    scope: u.scope ? String(u.scope) : null,        // the code or zone it touches
    startedOn: u.startedOn || null,                  // work begun on site
    decidedBy: u.decidedBy || null, decidedOn: u.decidedOn || null,
    reason: u.reason ? String(u.reason).trim() : null,
    ref: u.ref || null,                              // the MOM, mail or minute it came from
  } };
}

function resolve(c) {
  if (!c) return null;
  if (c.state === "approved" || c.state === "rejected" || c.state === "absorbed") return c.state;
  return (c.cost == null || c.days == null) ? "raised" : "priced";
}

// ---- the position ------------------------------------------------------
// Approved only. Nothing else has moved anything.
function effect(changes) {
  const list = (changes || []);
  const app = list.filter(c => c.state === "approved");
  const cost = app.reduce((s, c) => s + (c.cost || 0), 0);
  const days = app.reduce((s, c) => s + (c.days || 0), 0);
  const byOrigin = {};
  for (const c of app) {
    const o = byOrigin[c.origin] = byOrigin[c.origin] || { origin: c.origin, cost: 0, days: 0, n: 0 };
    o.cost += (c.cost || 0); o.days += (c.days || 0); o.n++;
  }
  return { cost, days, count: app.length,
    byOrigin: Object.keys(byOrigin).sort().map(k => byOrigin[k]),
    // what is NOT in those totals, and why
    pending: list.filter(c => resolve(c) === "priced").length,
    unpricedCount: list.filter(c => resolve(c) === "raised").length,
    rejected: list.filter(c => c.state === "rejected").length };
}

// ---- the exposure ------------------------------------------------------
// Unpriced work, and worse, unpriced work that has already started.
function unpriced(changes) {
  const out = [];
  for (const c of (changes || [])) {
    const st = resolve(c);
    if (st === "approved" || st === "rejected" || st === "absorbed") continue;
    const started = !!c.startedOn;
    out.push({ id: c.id, what: c.what, origin: c.origin, raisedOn: c.raisedOn,
      state: st, started, startedOn: c.startedOn || null,
      // an unpriced change that is BEING BUILT is money already spent that
      // nobody has agreed to pay. It sorts to the top and it says so.
      severity: started ? (st === "raised" ? "building it unpriced" : "building it unapproved")
                        : (st === "raised" ? "not priced" : "priced, not approved"),
      why: started
        ? "work started on " + c.startedOn + " and this is not approved — that is money spent against nothing"
        : "raised on " + c.raisedOn + " and still not " + (st === "raised" ? "priced" : "approved") });
  }
  const rank = { "building it unpriced": 0, "building it unapproved": 1, "not priced": 2, "priced, not approved": 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity] || (a.id < b.id ? -1 : 1));
}

// a change is a legitimate cause for a slip . map it to the re-plan's words
const ORIGIN_CAUSE = { client: "client", design: "ours", site: "ours", statutory: "statutory" };
function causeTag(c) { return c ? (ORIGIN_CAUSE[c.origin] || null) : null; }

function line(changes) {
  const e = effect(changes), u = unpriced(changes);
  if (!(changes || []).length) return "No changes have been recorded on this project.";
  const money = e.cost ? "₹" + (e.cost / 100000).toFixed(1) + "L" : "nothing";
  const time = e.days ? e.days + " working day" + (e.days === 1 ? "" : "s") : "no time";
  const building = u.filter(x => x.started).length;
  return e.count + " approved change" + (e.count === 1 ? "" : "s") + " — " + money + " and " + time + "."
    + (u.length ? " " + u.length + " still open" + (building ? ", " + building + " of them already being built" : "") + "." : "");
}

const CHANGE = { STATES, ORIGINS, ORIGIN_CAUSE, record, resolve, effect, unpriced, causeTag, line };
root.CORE_CHANGE = CHANGE;
if (typeof module !== "undefined" && module.exports) module.exports = CHANGE;

})(typeof window !== "undefined" ? window : globalThis);
