// ===================================================================
// DnB-OS . platform/core/weight.js . WHAT EACH PACKAGE IS WORTH
//
// "The job is 17% complete" is a weighted average, and for a long time the
// weight was the LENGTH OF THE BAR ON THE CHART. Waterproofing carried 6.3%
// of the whole programme — more than every cable, data drop and distribution
// board put together — because its bar is drawn thirty-four days long to
// hold a ponding test and a curing lag. Two days of actual work, six per
// cent of the answer.
//
// Three things were wrong with that:
//   . A SPAN IS NOT A QUANTITY OF WORK. One man for forty days outweighed
//     twenty men for ten, which is four times less work.
//   . A SPAN IS NOT ADDITIVE. A category's span is its calendar envelope,
//     not the sum of its packages, so the levels did not agree with each
//     other and nothing added up to anything.
//   . A SPAN MOVES WHEN THE SCHEDULE MOVES. Compressing the programme to
//     round-the-clock working shortened every bar and silently re-weighted
//     the progress figure. The number changed because of a decision about
//     shifts, not because of anything that happened on site. That is the
//     worst of the three, because it is invisible.
//
// So the weight comes from the SCOPE, which does not move when the plan
// does. Two bases, both real, and the page says which one it is showing:
//
//   VALUE   each package's share of the priced bill. This is what a client's
//           QS means by "per cent complete", it is what an RA bill is
//           certified against, and it is the default.
//   EFFORT  each package's share of the man-days. This is what the site
//           feels: where the people are and how long it is taking them.
//
// They disagree, and the disagreement is worth reading. Value ahead of
// effort means the expensive work has landed and the labour-heavy work is
// still to come. Effort ahead of value means the opposite.
//
// THE LAWS
//   . THE PARTS ADD TO THE WHOLE. A category weighs exactly what its
//     packages weigh, summed. The overall figure is the sum of every
//     package's weight times its per cent, and nothing else.
//   . THE WEIGHT DOES NOT MOVE WHEN THE SCHEDULE DOES. It is a property of
//     the scope. Re-planning may change every date on the page and must not
//     change what a package is worth.
//   . UNPRICED WORK IS STILL WORK. Snagging, the testing, the line marking
//     and the handover file are not lines in this bill and are on the
//     critical path of the last fortnight. They are valued at their labour,
//     at a rate DERIVED FROM THIS BILL rather than invented.
//   . EVERY WEIGHT IS VISIBLE. If a package moves the number by four per
//     cent, the page can say so and a person can disagree with it.
//
// Pure: scope in, weights out. No clock, no I/O, no model.
// ===================================================================

;(function (root) {

// ---- the rate a man-day of installation is worth -----------------------
// NOT A CONSTANT SOMEBODY LIKED THE LOOK OF. This bill prices supply and
// installation in separate columns for all 532 of its services lines, so it
// states its own labour content: Rs 0.58 Cr of installation against Rs 3.44
// Cr of supply, 14.4% of the two. Divided by the man-days the same scope
// generates, that is what an hour of this job is worth to the people paying
// for it, and it is the only defensible way to price work the bill forgot.
function labourRate(installTotal, manDays) {
  const i = Number(installTotal) || 0, m = Number(manDays) || 0;
  if (!i || !m) return null;
  return i / m;
}

// ---- the weights -------------------------------------------------------
// packages: [{ code, name, catId, value, manDays, track }]
// opts: { installTotal, basis: "value" | "effort" }
function build(packages, opts) {
  const o = opts || {};
  const rows = (packages || []).filter(p => p.track !== false);
  const manDays = rows.reduce((t, p) => t + (Number(p.manDays) || 0), 0);
  const rate = labourRate(o.installTotal, manDays);

  // value, with the labour imputation where the bill has nothing to say
  const imputed = [];
  const out = rows.map(p => {
    let value = Number(p.value) || 0, from = "the bill";
    if (value <= 0 && rate && p.manDays > 0) {
      value = p.manDays * rate; from = "its labour";
      imputed.push({ code: p.code, name: p.name, manDays: p.manDays, value: Math.round(value) });
    }
    return { code: p.code, name: p.name, catId: p.catId,
             value: Math.round(value), manDays: Math.round(p.manDays || 0), valueFrom: from };
  });

  const totalValue = out.reduce((t, p) => t + p.value, 0);
  const totalEffort = out.reduce((t, p) => t + p.manDays, 0);
  out.forEach(p => {
    p.wValue  = totalValue  ? p.value   / totalValue  : 0;
    p.wEffort = totalEffort ? p.manDays / totalEffort : 0;
  });

  // A CATEGORY WEIGHS WHAT ITS PACKAGES WEIGH. Summed, never measured
  // separately, so the two levels can never disagree.
  const byCategory = {};
  out.forEach(p => {
    const c = byCategory[p.catId] = byCategory[p.catId] ||
      { catId: p.catId, value: 0, manDays: 0, wValue: 0, wEffort: 0, packages: 0 };
    c.value += p.value; c.manDays += p.manDays;
    c.wValue += p.wValue; c.wEffort += p.wEffort; c.packages++;
  });

  const byPackage = {}; out.forEach(p => byPackage[p.code] = p);

  return {
    basis: o.basis === "effort" ? "effort" : "value",
    labourRate: rate ? Math.round(rate) : null,
    installTotal: Math.round(Number(o.installTotal) || 0),
    totalValue, totalEffort,
    byPackage, byCategory,
    imputed: imputed.sort((a, b) => b.value - a.value),
    why: "each package's share of the priced bill, with work the bill never priced " +
         "valued at its labour" + (rate ? " — Rs " + Math.round(rate).toLocaleString("en-IN") +
         " a man-day, which is this bill's own installation total divided by the man-days " +
         "the same scope generates" : ""),
  };
}

// the weight to use for one package under the chosen basis
function of(weights, code) {
  const p = weights && weights.byPackage && weights.byPackage[code];
  if (!p) return 0;
  return weights.basis === "effort" ? p.wEffort : p.wValue;
}

const WEIGHT = { build, of, labourRate };
root.CORE_WEIGHT = WEIGHT;
if (typeof module !== "undefined" && module.exports) module.exports = WEIGHT;

})(typeof globalThis !== "undefined" ? globalThis : this);
