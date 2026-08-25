// ===================================================================
// DnB-OS . platform/plan/kit.js . THE PLANNING PRESENTATION KIT
// Phase 0b, tranche 1. The planning engine kept all 2,280 lines of its
// view code inside one IIFE in the template, so none of it could be
// tested, reused or moved. The tracking engine had already pushed its
// laws out to platform/track/*; this is the same move for planning,
// done a tranche at a time with tests/plan_render_baseline.js proving
// each tranche paints byte identical HTML.
//
// This module is the bottom of the stack: the pure presentational
// helpers. Every function here is a function of its arguments and the
// calendar, and of nothing else . no state, no project, no DOM. That is
// what makes it the safe first tranche.
//
//   install(CAL) -> the kit, bound to a calendar module
//
// The install shape exists because the template is one IIFE: a module
// inlined before it cannot close over anything inside it, so the app
// hands its dependencies in rather than the module reaching out for
// them. Bodies are moved VERBATIM from the template so the diff carries
// no behaviour change to review.
// ===================================================================

;(function (root) {

function install(CAL) {

  const nextDay = iso => CAL._iso(CAL._add(CAL._d(iso), 1));
  const fmt  = iso => CAL._d(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const fmtS = iso => CAL._d(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  const daysBetween = (a, b) => Math.round((CAL._d(b) - CAL._d(a)) / 86400000);
  const dd = n => { n = Math.abs(n); return n + (n === 1 ? " day" : " days"); };

  const PALETTE = ["#5b5bd6", "#2e9e6b", "#e0a021", "#d9685b", "#5b9bd9", "#9d7ad9", "#5bb0a0", "#c98a5b"];
  const MN = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

  function colorFor(s) { let h = 0; s = String(s || ""); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return PALETTE[h % PALETTE.length]; }
  function scoreCol(s) { return s >= 75 ? "var(--ok)" : s >= 50 ? "#e0a021" : "var(--shut-ink)"; }

  function ringChart(pct, big, sub) {
    const c = scoreCol(pct), r = 52, C = 2 * Math.PI * r, off = (C * (1 - Math.max(0, Math.min(100, pct)) / 100)).toFixed(1);
    return `<svg viewBox="0 0 130 130" width="128" height="128" style="flex:none">
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="var(--line2)" stroke-width="12"/>
    <circle cx="65" cy="65" r="${r}" fill="none" stroke="${c}" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${off}" transform="rotate(-90 65 65)"/>
    <text x="65" y="61" text-anchor="middle" font-family="'Space Grotesk',sans-serif" font-size="32" font-weight="600" fill="var(--ink)">${big}</text>
    <text x="65" y="83" text-anchor="middle" font-family="'Inter',sans-serif" font-size="11" font-weight="500" fill="var(--muted)">${sub || ""}</text>
  </svg>`;
  }

  function stackBar(segs) {
    const tot = segs.reduce((s, x) => s + x.val, 0) || 1;
    const bar = segs.filter(s => s.val > 0).map(s => `<div style="width:${(s.val / tot * 100).toFixed(1)}%;background:${s.color}" title="${s.label}: ${s.val}"></div>`).join("");
    const leg = segs.filter(s => s.val > 0).map(s => `<span class="li"><i style="background:${s.color}"></i>${s.label} <b>${s.val}</b></span>`).join("");
    return `<div class="stackbar">${bar || '<div style="width:100%;background:var(--line2)"></div>'}</div><div class="stacklegend">${leg}</div>`;
  }

  function leadTimeline(leads) {
    if (!leads || !leads.length) return '<p class="faint" style="font-size:12.5px;margin:0">No long-lead items in this plan.</p>';
    const start = leads.reduce((m, l) => l.orderBy < m ? l.orderBy : m, leads[0].orderBy);
    const end = leads.reduce((m, l) => l.ES > m ? l.ES : m, leads[0].ES);
    const S = CAL._d(start), tot = Math.max(1, (CAL._d(end) - S) / 86400000 + 1), f = iso => (CAL._d(iso) - S) / 86400000 / tot;
    return `<div class="lead-tl">${leads.map(l => {
      const x = (f(l.orderBy) * 100).toFixed(1), w = Math.max(((CAL._d(l.ES) - CAL._d(l.orderBy)) / 86400000 + 1) / tot * 100, 1.5).toFixed(1);
      return `<div class="grow"><div class="glabel">${l.crit ? '<span class="critmark">◆ </span>' : ''}${l.name} <small>· ${l.weeks}wk</small></div><div class="gtrack"><div class="gbar" style="left:${x}%;width:${w}%;background:${l.crit ? 'var(--accent)' : colorFor(l.name)}" title="order by ${fmtS(l.orderBy)} → on site ${fmtS(l.ES)}"></div></div></div>`;
    }).join("")}</div>`;
  }

  function weekStarts(SISO, EISO) {
    const out = []; let d = CAL._d(SISO); const E = CAL._d(EISO);
    const dow = (d.getUTCDay() + 6) % 7; if (dow) d = CAL._add(d, 7 - dow);
    while (d <= E) { out.push(CAL._iso(d)); d = CAL._add(d, 7); }
    return out;
  }

  const tname = t => t.name + (t.parts ? ` · part ${t.part} of ${t.parts}` : "");

  return { nextDay, fmt, fmtS, daysBetween, dd, PALETTE, MN, DIM,
    colorFor, scoreCol, ringChart, stackBar, leadTimeline, weekStarts, tname };
}

root.PLAN_KIT = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_KIT;

})(typeof window !== "undefined" ? window : globalThis);
