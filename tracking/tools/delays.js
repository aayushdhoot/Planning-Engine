#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/delays.js . WHAT SLIPPED, WHY, AND WHOSE IT IS
//   node tools/delays.js [--as 2026-08-10]
//
// Builds delays.json.
//
// Two clauses make this register worth keeping, and both are on the engine:
//
//   LIQUIDATED DAMAGES   1% of the contract price per week or part thereof,
//                        capped at 5%. On Rs 8.21 Cr that is Rs 8.21 L a
//                        week and Rs 41.05 L in total.
//   EXTENSION OF TIME    available for company-directed variations, delayed
//                        access, "delay in Company-provided approvals or
//                        decisions beyond agreed timelines", force majeure
//                        and statutory restriction.
//
// So every slip on this floor is worth eight lakh a week to somebody, and
// which somebody depends on what caused it. Nothing else on this engine
// asks that question.
//
// THE LINE BETWEEN WHAT THIS DOES AND WHAT IT MUST NOT
//   It maps a cause to a ground the contract lists. That is arithmetic
//   against a clause and it is useful.
//   IT DOES NOT SAY ANYBODY IS ENTITLED TO ANYTHING. A claim turns on
//   notice, on causation, on concurrency and on what was actually agreed
//   in meetings this engine has never seen. Every row says which ground it
//   points at and says plainly that pointing is not claiming.
//
// THE LAWS
//   . PLAN PER CENT IS ARITHMETIC. The share of a package's own window
//     that has elapsed, clamped nought to a hundred. Never a feeling and
//     never somebody's assessment.
//   . A SLIP WITHOUT A CAUSE IS NOT A ROW. Every one names the register
//     that explains it, or says the cause is not on the engine.
//   . RISK IS WHAT HAS NOT SLIPPED YET. Anything already behind is a
//     delay; keeping the two apart is the whole point of the register.
//   . POINTING AT A GROUND IS NOT CLAIMING ONE.
// ===================================================================
const fs = require("fs"), path = require("path");

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const facts = (read("facts.json") || {}).facts || [];
const S = read("schedule.json"), T = read("target.json"), R = read("resources.json");
const G = read("registers.json"), LA = read("lookahead.json"), BL = read("billing.json");
const M = read("manpower.json");

const argAs = (() => { const i = process.argv.indexOf("--as");
  return i > 0 ? process.argv[i + 1] : null; })();
const today = argAs || new Date().toISOString().slice(0, 10);
const between = (a, b) => a && b
  ? Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000) : null;
const factOf = (rx, role) => { const f = facts.find(x => rx.test(String(x.subject)) &&
  (!role || x.role === role)); return f ? String(f.value) : null; };

// ---- what a week of delay costs -----------------------------------------
const ldText = factOf(/Liquidated damages/, "payment");
const eotText = factOf(/Extension of Time/);
const price = BL ? BL.contract.exTax : null;
const pct = ldText ? Number((ldText.match(/(\d+(?:\.\d+)?)\s*%/) || [])[1]) : null;
const capPct = ldText ? Number((ldText.match(/cap of\s*(\d+(?:\.\d+)?)\s*%/i) || [])[1]) : null;
const overDays = (T && T.built && T.built.conditionsBy && T.target)
  ? Math.max(0, between(T.target, T.built.conditionsBy)) : 0;
// "PER WEEK OR PART THEREOF" — a part week is a whole week's damages.
const overWeeks = Math.ceil(overDays / 7);
const perWeek = price && pct ? Math.round(price * pct / 100) : null;
const cap = price && capPct ? Math.round(price * capPct / 100) : null;
const exposure = perWeek ? Math.min(perWeek * overWeeks, cap || Infinity) : null;

// ---- the compare law: plan per cent is arithmetic -----------------------
const walkDay = S && S.days ? S.days[S.days.length - 1] : null;
const pr = walkDay ? S.progress[walkDay] : null;
const resOf = {}; ((R && R.rows) || []).forEach(r => resOf[r.code] = r);

// ---- what caused it, traced to a register -------------------------------
// A SLIP WITHOUT A CAUSE IS NOT A ROW.
const GROUNDS = {
  approvals: { ground: "delay in Company-provided approvals or decisions beyond agreed timelines",
    side: "client" },
  access: { ground: "delayed access to Site", side: "client" },
  variation: { ground: "Company-directed variations", side: "client" },
  statutory: { ground: "statutory or regulatory restriction not attributable to the Contractor",
    side: "neither" },
};

function causes(k) {
  const out = [];
  const r = resOf[k.code];
  if (r && r.state === "pending") out.push({ what: "nothing on the PO register buys this",
    from: "resources.json", go: "tasks", side: "us", ground: null });
  if (r && r.state === "overdue") out.push({
    what: (r.bought.pos[0].vendor || "the vendor") + " promised " + r.bought.pos[0].promisedOn +
      " and nothing has been seen since",
    from: "resources.json", go: "tasks", side: "us", ground: null });
  // WHAT IS TRUE OF EVERY PACKAGE IS NOT ATTRIBUTION. Nought of 58 drawings
  // carry a client approval, so writing that against all 52 valued packages
  // made the register say the client caused everything and drowned out the
  // cause that is actually specific to each row. A floor-wide condition is
  // stated once, at the top, under project causes.
  if (G) { const dep = G.deps.rows.filter(d => d.open && d.overdue &&
      d.ask.toLowerCase().split(/\W+/).some(w => w.length > 4 && k.name.toLowerCase().indexOf(w) >= 0));
    dep.forEach(d => out.push({ what: d.ask + " — " + d.age + " days past the date agreed",
      from: "registers.json", go: "dep", side: "client", ground: "approvals" })); }
  return out;
}

// ---- what is true of the whole floor ------------------------------------
// Stated once. These sit behind every row and belong to none of them.
const projectCauses = [];
if (G && G.drawings.counts.approvedByClient === 0) projectCauses.push({
  what: "not one of the " + G.drawings.counts.total + " drawings carries a client approval",
  detail: G.drawings.counts.throughInternally + " are complete on our side and " +
    G.drawings.counts.critical + " are marked critical, so nothing could be built to a " +
    "released design and no shop drawing could start",
  from: "registers.json", go: "design", side: "client", ground: "approvals" });
if (G) { const dep = G.deps.rows.filter(d => d.open && d.overdue);
  if (dep.length) projectCauses.push({
    what: dep.length + " client dependencies are past the date agreed",
    detail: dep.slice(0, 4).map(d => d.ask + " (" + d.age + "d)").join("; "),
    from: "registers.json", go: "dep", side: "client", ground: "approvals" }); }
if (M && M.actual && M.actual.any) {
  const rep = M.actual.days.filter(d => M.daily.some(x => x.day === d));
  const plan = rep.reduce((t, d) => t + M.daily.find(x => x.day === d).total, 0);
  const act = rep.reduce((t, d) => t + M.actual.byDay[d].labour, 0);
  if (plan > 0 && act < plan * 0.8) projectCauses.push({
    what: "the floor ran at " + Math.round(act / plan * 100) + "% of the labour the programme asked for",
    detail: "across the " + rep.length + " days a daily report exists for: " + plan +
      " man-days asked, " + act + " turned up",
    from: "manpower.json", go: "crew", side: "us", ground: null });
}

// ---- what has slipped ----------------------------------------------------
const rows = [];
if (pr) S.wbs.forEach(c => c.packages.forEach(k => {
  if (k.track === false || !k.ES || !k.EF) return;
  const row = pr.byPkg[k.id]; if (!row) return;
  // PLAN PER CENT IS ARITHMETIC: the share of its own window that is gone.
  const a = Date.parse(k.ES), b = Date.parse(k.EF), now = Date.parse(today);
  const elapsed = b > a ? Math.max(0, Math.min(100, Math.round((now - a) / (b - a) * 100)))
                        : (now >= b ? 100 : 0);
  const built = row.actual || 0;
  const gap = elapsed - built;
  if (gap < 25 || elapsed === 0) return;
  const cz = causes(k);
  const client = cz.filter(x => x.side === "client");
  rows.push({
    code: k.code, name: k.name, trade: k.trade,
    ES: k.ES, EF: k.EF, elapsed, built, gap,
    weight: row.weight || 0,
    value: resOf[k.code] ? resOf[k.code].value : null,
    causes: cz,
    // POINTING AT A GROUND IS NOT CLAIMING ONE.
    pointsAt: client.length ? [...new Set(client.map(x => x.ground))].filter(Boolean) : [],
    side: cz.length === 0 ? "unattributed" : client.length && client.length === cz.length ? "client"
        : client.length ? "shared" : "us",
    owner: k.owner || (client.length ? "client" : "site"),
    overdue: k.EF < today, lateBy: k.EF < today ? between(k.EF, today) : 0,
  });
}));
rows.sort((a, b) => b.gap - a.gap);

// ---- and what has not slipped yet ---------------------------------------
// RISK IS WHAT HAS NOT SLIPPED YET.
const risks = [];
((LA && LA.rows) || []).filter(r => r.opens && r.verdict === "cannot start")
  .forEach(r => { if (rows.some(x => x.code === r.code)) return;
    risks.push({ code: r.code, name: r.name, opensOn: r.ES,
      what: r.needs.filter(n => !n.ok && n.severity === "hard")
        .map(n => n.kind + ": " + n.what),
      from: "lookahead.json", go: "look",
      inDays: between(today, r.ES) }); });
if (R) R.rows.filter(x => x.state === "pending" && x.leadKnown && !rows.some(y => y.code === x.code))
  .forEach(x => risks.push({ code: x.code, name: x.name, opensOn: x.neededOn,
    what: ["nothing ordered, and it is " + x.leadWeeks + " weeks from an order to site"],
    from: "resources.json", go: "tasks", inDays: between(today, x.neededOn) }));
risks.sort((a, b) => (a.inDays || 0) - (b.inDays || 0));

const byGround = {};
rows.forEach(r => r.pointsAt.forEach(g => (byGround[g] = byGround[g] || []).push(r.name)));

const counts = {
  behind: rows.length,
  client: rows.filter(r => r.side === "client").length,
  shared: rows.filter(r => r.side === "shared").length,
  ours: rows.filter(r => r.side === "us").length,
  unattributed: rows.filter(r => r.side === "unattributed").length,
  risks: risks.length,
  valueBehind: Math.round(rows.reduce((t, r) => t + (r.value || 0), 0)),
  weightBehind: Math.round(rows.reduce((t, r) => t + (r.weight || 0)) * 10) / 10,
};

const out = {
  builtAt: new Date().toISOString(), today, walkDay,
  project: {
    target: T ? T.target : null,
    lands: T && T.built ? T.built.conditionsBy : null,
    overDays, overWeeks,
    ldText, ldPerWeek: perWeek, ldCap: cap, ldExposure: exposure,
    atTheCap: !!(exposure && cap && exposure >= cap),
    ldWhy: perWeek ? "the contract puts liquidated damages at " + pct + "% of the price a week " +
      "or part thereof, capped at " + capPct + "%. " + overDays + " days over is " + overWeeks +
      " week" + (overWeeks === 1 ? "" : "s") + " of damages" : null,
  },
  projectCauses,
  eot: { text: eotText, grounds: GROUNDS, byGround,
    caveat: "these map a cause to a ground the contract lists. That is not a claim. A claim turns " +
      "on notice, on causation, on concurrency and on what was agreed in meetings this engine has " +
      "never seen — the engine points, a person claims" },
  counts, rows, risks,
  why: "plan per cent is the share of a package's own window that has elapsed, clamped nought to a " +
       "hundred — arithmetic, never an assessment. A package is behind when what is built trails " +
       "that by 25 points or more. Every row names the register that explains it, or says the " +
       "cause is not on the engine",
};
fs.writeFileSync(path.join(ENGINE, "delays.json"), JSON.stringify(out));

const cr = (n) => n == null ? "—" : n >= 1e7 ? "Rs " + (n / 1e7).toFixed(2) + " Cr"
                : n >= 1e5 ? "Rs " + (n / 1e5).toFixed(1) + " L" : "Rs " + Math.round(n);
console.log("\n  THE DELAY AND RISK REGISTER  (as on " + today + ")");
console.log("    " + out.project.target + " contracted · lands " + out.project.lands + " · " +
  overDays + " days over");
if (perWeek) console.log("    liquidated damages " + cr(perWeek) + " a week, capped at " + cr(cap) +
  " — " + overWeeks + " weeks is " + cr(exposure) + (out.project.atTheCap ? "  AT THE CAP" : ""));
console.log("\n  BEHIND: " + counts.behind + " packages, " + cr(counts.valueBehind) +
  " · client " + counts.client + " · shared " + counts.shared + " · ours " + counts.ours +
  " · unattributed " + counts.unattributed);
rows.slice(0, 12).forEach(r => console.log("    " + String(r.gap).padStart(3) + "pts  " +
  r.name.slice(0, 26).padEnd(28) + String(r.built + "% of " + r.elapsed + "%").padEnd(14) +
  r.side.padEnd(13) + (r.causes[0] ? r.causes[0].what.slice(0, 46) : "no cause on the engine")));
if (Object.keys(byGround).length) {
  console.log("\n  POINTS AT A GROUND THE CONTRACT LISTS  (pointing is not claiming)");
  Object.keys(byGround).forEach(g => console.log("    " + GROUNDS[g].ground +
    "\n      " + byGround[g].length + " packages: " + byGround[g].slice(0, 5).join(", "))); }
console.log("\n  TRUE OF THE WHOLE FLOOR, and belonging to no single package");
projectCauses.forEach(c => console.log("    [" + c.side + "] " + c.what + "\n        " + c.detail));
console.log("\n  RISK — not behind yet: " + counts.risks);
risks.slice(0, 8).forEach(r => console.log("    " + String(r.inDays).padStart(3) + "d  " +
  r.name.slice(0, 26).padEnd(28) + r.what[0].slice(0, 58)));
console.log("\n→ engines/skf/delays.json\n");
