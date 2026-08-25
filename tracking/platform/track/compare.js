// ===================================================================
// DnB-OS . platform/track/compare.js . THE COMPARE LAW
// Puts the plan and the site on the same pair of bars, the way the
// 18 Jul director deck does it. One law, applied everywhere:
//   . plan % is arithmetic only: the share of the planned window
//     elapsed today, clamped 0 to 100. Never a feeling.
//   . site % is a reading. It arrives from a walk pack, dated and
//     sourced. This law never invents it.
//   . the chip follows one rule. An override to "risk" must carry a
//     reason, or the row is refused.
//   . a row without planned dates is refused, not scored.
// Chips, and what they mean:
//   done     the site shows 95 or more
//   not_due  window not open, nothing seen, nothing expected
//   ahead    site ahead of the plan line
//   on       site within 10 points of the plan line
//   behind   site more than 10 points under the plan line
//   risk     the window is due but a gate outside labour blocks it,
//            named in the reason (order not placed, vendor not
//            appointed, selection pending)
// ===================================================================

;(function (root) {

const DAY = 86400000;

// share of the planned window elapsed by `today`, clamped 0..100
function planPct(start, finish, today) {
  const s = new Date(start), f = new Date(finish), t = new Date(today);
  const span = Math.round((f - s) / DAY);
  if (span <= 0) return t >= f ? 100 : 0;
  const gone = Math.round((t - s) / DAY);
  return Math.max(0, Math.min(100, Math.round(100 * gone / span)));
}

// the chip rule. plan and site are 0..100. site may be null (no reading).
function chipFor(plan, site) {
  if (site == null) return plan <= 0 ? "not_due" : "no_reading";
  if (site >= 95) return "done";
  if (plan <= 0 && site <= 0) return "not_due";
  if (plan <= 0 && site > 0) return "ahead";
  if (site >= plan + 10) return "ahead";
  if (site >= plan - 10) return "on";
  return "behind";
}

// score one row: { name, ps, pf, site, note?, chip? ("risk"), reason? }
function assessRow(r, today) {
  if (!r || !r.ps || !r.pf) {
    return { refused: true, query: { about: (r && r.name) || "unnamed row",
      question: "Compare row arrived without planned start and finish. The law refuses to draw a bar with no plan. Supply the dates.", blocking: false } };
  }
  const plan = planPct(r.ps, r.pf, today);
  let chip = chipFor(plan, r.site == null ? null : r.site);
  if (r.chip === "risk") {
    if (!r.reason) {
      return { refused: true, query: { about: r.name,
        question: "A risk chip arrived without a reason. Name the gate (order, vendor, selection) or the chip stays with the rule.", blocking: false } };
    }
    // risk never hides good news: a row already done or ahead keeps its chip
    if (chip !== "done" && chip !== "ahead") chip = "risk";
  }
  return { refused: false, plan, site: r.site == null ? null : r.site, chip };
}

// build every group in a pack: rows scored, refusals collected,
// group rollup = plain mean of its scored rows
function buildGroups(pack, today) {
  const t = today || pack.asOf;
  const groups = [], refusals = [];
  for (const g of (pack.groups || [])) {
    const rows = [];
    for (const r of (g.rows || [])) {
      const a = assessRow(r, t);
      if (a.refused) { refusals.push(a.query); continue; }
      rows.push({ row: r, a });
    }
    const scored = rows.filter(x => x.a.site != null);
    const mean = k => scored.length ? Math.round(scored.reduce((n, x) => n + x.a[k], 0) / scored.length) : null;
    groups.push({ label: g.label, rows, planMean: mean("plan"), siteMean: mean("site") });
  }
  return { groups, refusals };
}

// headline over the live rows (everything except not_due):
// counts per chip and the two means the deck quotes
function summary(pack, today) {
  const b = buildGroups(pack, today);
  const by = {}; let live = 0, planSum = 0, siteSum = 0;
  for (const g of b.groups) for (const x of g.rows) {
    by[x.a.chip] = (by[x.a.chip] || 0) + 1;
    if (x.a.chip !== "not_due" && x.a.site != null) {
      live++; planSum += x.a.plan; siteSum += x.a.site;
    }
  }
  return { by, live,
    planMean: live ? Math.round(planSum / live) : 0,
    siteMean: live ? Math.round(siteSum / live) : 0,
    refused: b.refusals.length };
}

// site % for a named list of rows, plain mean. Used by the Site tab
// to give one trade one pair of bars from its mapped compare rows.
function mappedPair(pack, names, today) {
  const t = today || pack.asOf;
  const found = [];
  for (const g of (pack.groups || [])) for (const r of (g.rows || [])) {
    if (names.indexOf(r.name) !== -1) {
      const a = assessRow(r, t);
      if (!a.refused) found.push(a);
    }
  }
  if (!found.length) return null;
  const mean = k => Math.round(found.reduce((n, x) => n + (x[k] || 0), 0) / found.length);
  // the pair's chip: worst wins. behind > risk > on > ahead > done > not_due
  const RANK = { behind: 6, risk: 5, no_reading: 4, on: 3, ahead: 2, done: 1, not_due: 0 };
  let chip = "not_due";
  for (const x of found) if (RANK[x.chip] > RANK[chip]) chip = x.chip;
  return { plan: mean("plan"), site: mean("site"), chip, rows: found.length };
}

root.TRACK_COMPARE = { planPct, chipFor, assessRow, buildGroups, summary, mappedPair };
if (typeof module !== "undefined") module.exports = root.TRACK_COMPARE;

})(typeof window !== "undefined" ? window : globalThis);
