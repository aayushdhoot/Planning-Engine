#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/lookahead.js . THE NEXT FORTNIGHT, AND WHAT IT NEEDS
//   node tools/lookahead.js [--as 2026-08-10]
//
// Builds lookahead.json.
//
// A look-ahead that lists what opens and what closes is a calendar. Anybody
// can read a calendar. The question a look-ahead exists to answer is the
// next one: WHAT DOES EACH OF THESE NEED TO HOLD ITS DATE — and on this
// engine that is answerable, because five registers already know.
//
//   MATERIAL      is it on site, on order, promised and not seen, or has
//                 nobody bought it at all
//   THE WORK BEFORE IT   what the sequence says must finish first, and
//                 what the walk says about each of those
//   PEOPLE        which trade, how many the norm asks for
//   DRAWINGS      whether anything is approved to build against
//   THE FRONT END the six procurement stages, where they got to
//
// A task with none of those settled is not a task that starts on Monday,
// whatever the bar chart says.
//
// THE LAWS
//   . A DATE IS NOT A PLAN. Every row says what would have to be true for
//     it to start, and whether it is.
//   . READY IS EARNED, NOT ASSUMED. Nothing is called ready because its
//     date arrived; it is ready when what it needs is there.
//   . A BLOCKER NAMES ITS REGISTER. Anything this page says is wrong is
//     traceable to the file that says so, so nobody argues with the page.
//   . WHAT ALREADY RAN LATE IS NOT REPEATED HERE. Work whose window closed
//     before today belongs to the delay register, not the look-ahead.
// ===================================================================
const fs = require("fs"), path = require("path");
const SEQ = require(path.join(__dirname, "../platform/kb/sequence.js"));
const DUR = require(path.join(__dirname, "../platform/kb/durations.js"));

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const S = read("schedule.json"), R = read("resources.json"), G = read("registers.json");
const B = read("procurement.json"), M = read("manpower.json"), T = read("target.json");

const argAs = (() => { const i = process.argv.indexOf("--as");
  return i > 0 ? process.argv[i + 1] : null; })();
const today = argAs || new Date().toISOString().slice(0, 10);
const addDays = (iso, n) => new Date(Date.parse(iso + "T00:00:00Z") + n * 86400000)
  .toISOString().slice(0, 10);
const end = addDays(today, 14);

const NORM = {}; (Array.isArray(DUR.NORMS) ? DUR.NORMS
  : Object.keys(DUR.NORMS).map(k => Object.assign({ code: k }, DUR.NORMS[k])))
  .forEach(n => NORM[n.code] = n);

// what the walk last said about each package
const walkDay = S && S.days ? S.days[S.days.length - 1] : null;
const pr = walkDay ? S.progress[walkDay] : null;
const seenOf = {}, nameOf = {};
if (pr) S.wbs.forEach(c => c.packages.forEach(k => {
  if (k.track === false) return;
  seenOf[k.code] = Math.max(seenOf[k.code] || 0, pr.byPkg[k.id] ? (pr.byPkg[k.id].actual || 0) : 0);
  nameOf[k.code] = k.name; }));

const resOf = {}; ((R && R.rows) || []).forEach(r => resOf[r.code] = r);

// ---- how far along a whole trade is ------------------------------------
// A COMMISSIONING TASK TESTS SOMETHING. "Plumbing testing" has no declared
// predecessor in the sequence table, so it passed every check and read
// READY while the sanitary fittings it tests sat at 7 per cent. What a
// task is about is checkable even where the sequence is silent.
const tradeBuilt = (() => {
  const acc = {};
  if (pr) S.wbs.forEach(c => c.packages.forEach(k => {
    if (k.track === false || !k.trade) return;
    const row = pr.byPkg[k.id]; if (!row) return;
    const w = row.weight || 0; if (!w) return;
    const a = acc[k.trade] = acc[k.trade] || { w: 0, wp: 0 };
    a.w += w; a.wp += w * (row.actual || 0);
  }));
  const out = {};
  Object.keys(acc).forEach(t => out[t] = acc[t].w ? Math.round(acc[t].wp / acc[t].w) : null);
  return out;
})();
const IS_TEST = /testing|commission|training|snag|clean|handover/i;
const chainOf = {}; ((B && B.chains) || []).forEach(c => chainOf[c.name] = c);

// ---- what has to be true before a task can start ------------------------
function needs(k) {
  const out = [];

  // 1. MATERIAL
  const r = resOf[k.code];
  if (r) {
    const st = r.state;
    out.push({ kind: "material", ok: st === "here",
      what: st === "here" ? "material is on site"
        : st === "ordered" ? "material on order, due " + (r.bought.pos[0].promisedOn || "?")
        : st === "overdue" ? "material promised " + (r.bought.pos[0].promisedOn || "?") +
            " by " + (r.bought.pos[0].vendor || "the vendor") + " and not seen"
        : st === "pending" ? "no purchase order exists for this at all"
        : "no lead time and nothing seen",
      from: "resources.json", go: "tasks",
      severity: st === "pending" ? "hard" : st === "overdue" ? "hard" : "soft" });
  }

  // 2. THE WORK BEFORE IT. What the sequence says must finish first.
  const before = (SEQ.AFTER && SEQ.AFTER[k.code] || []).map(x => x.of)
    .filter(c => seenOf[c] != null);
  const short = before.filter(c => (seenOf[c] || 0) < 80);
  if (before.length) out.push({ kind: "sequence", ok: short.length === 0,
    what: short.length
      ? short.map(c => (nameOf[c] || c) + " at " + (seenOf[c] || 0) + "%").join(", ") +
        " — this cannot start over unfinished work"
      : "everything it waits on is substantially done",
    from: "schedule.json", go: "sched",
    severity: short.some(c => (seenOf[c] || 0) < 30) ? "hard" : "soft" });

  // 3. PEOPLE
  const n = NORM[k.code];
  if (n) out.push({ kind: "people", ok: true,
    what: (n.crew || 1) + " " + n.trade + (n.crew === 1 ? "" : "s") + " a day, by the norm",
    from: "durations.js", go: "crew", severity: "info" });

  // 4. DRAWINGS
  if (G && G.drawings.counts.approvedByClient === 0 && r && r.value > 0)
    out.push({ kind: "drawings", ok: false,
      what: "no drawing on the register has a client approval",
      from: "registers.json", go: "design", severity: "soft" });

  // 4b. WHAT A COMMISSIONING TASK IS ABOUT
  if (IS_TEST.test(k.name) && k.trade && tradeBuilt[k.trade] != null) {
    const built = tradeBuilt[k.trade];
    out.push({ kind: "the work it tests", ok: built >= 80,
      what: k.trade + " work across the floor is at " + built + "%" +
        (built >= 80 ? "" : " — there is not enough of it built to test"),
      from: "schedule.json", go: "sched",
      severity: built < 40 ? "hard" : built < 80 ? "soft" : "info" });
  }

  // 5. THE FRONT END
  const ch = chainOf[k.name];
  if (ch && !ch.onSite) { const passed = ch.stages.filter(s => s.passed).length;
    out.push({ kind: "front end", ok: passed === ch.stages.length,
      what: passed + " of " + ch.stages.length + " procurement stages are behind their date",
      from: "procurement.json", go: "buy", severity: "soft" }); }

  return out;
}

// ---- the fortnight -------------------------------------------------------
const rows = [];
if (S) S.wbs.forEach(c => c.packages.forEach(k => {
  if (k.track === false || !k.ES || !k.EF) return;
  const opens = k.ES >= today && k.ES <= end;
  const closes = k.EF >= today && k.EF <= end;
  const running = k.ES < today && k.EF > end;
  // WHAT ALREADY RAN LATE IS NOT REPEATED HERE.
  if (!opens && !closes && !running) return;
  const n = needs(k);
  const hard = n.filter(x => !x.ok && x.severity === "hard");
  const soft = n.filter(x => !x.ok && x.severity === "soft");
  // AN ABSENCE OF CHECKS IS NOT A PASS. Every testing package on this floor
  // read READY on the strength of one crew-size line that can never fail.
  const substantive = n.filter(x => x.severity !== "info").length;
  rows.push({
    code: k.code, name: k.name, trade: k.trade,
    ES: k.ES, EF: k.EF, rooms: (k.rooms || []).length,
    opens, closes, running,
    seen: seenOf[k.code] == null ? null : seenOf[k.code],
    needs: n, hard: hard.length, soft: soft.length,
    // READY IS EARNED, NOT ASSUMED.
    ready: hard.length === 0 && substantive > 0,
    checks: substantive,
    verdict: hard.length ? "cannot start"
      : soft.length ? "starts under a risk"
      : substantive ? "ready" : "nothing to check it against",
  });
}));
rows.sort((a, b) => (a.ES < b.ES ? -1 : a.ES > b.ES ? 1 : 0));

// ---- two weeks, so the site and the client see the same horizon ---------
const wk1 = addDays(today, 7);
const weeks = [
  { week: 1, from: today, to: addDays(wk1, -1),
    opens: rows.filter(r => r.opens && r.ES < wk1),
    closes: rows.filter(r => r.closes && r.EF < wk1) },
  { week: 2, from: wk1, to: end,
    opens: rows.filter(r => r.opens && r.ES >= wk1),
    closes: rows.filter(r => r.closes && r.EF >= wk1) },
];

const opening = rows.filter(r => r.opens);
const counts = {
  opens: opening.length,
  closes: rows.filter(r => r.closes).length,
  running: rows.filter(r => r.running).length,
  ready: opening.filter(r => r.verdict === "ready").length,
  atRisk: opening.filter(r => r.verdict === "starts under a risk").length,
  blocked: opening.filter(r => r.verdict === "cannot start").length,
  unchecked: opening.filter(r => r.verdict === "nothing to check it against").length,
};

const out = {
  builtAt: new Date().toISOString(), today, end, walkDay,
  counts, weeks, rows,
  handover: T ? T.target : null, lands: T && T.built ? T.built.conditionsBy : null,
  why: "a look-ahead that lists what opens and closes is a calendar. This says what each one " +
       "needs to hold its date, from the registers that already know — material, the work before " +
       "it, the crew, the drawings and the front end. Nothing is called ready because its date " +
       "arrived; it is ready when what it needs is there",
};
fs.writeFileSync(path.join(ENGINE, "lookahead.json"), JSON.stringify(out));

console.log("\n  THE NEXT FORTNIGHT  " + today + " to " + end);
console.log("    " + counts.opens + " open · " + counts.closes + " close · " +
  counts.running + " run through");
console.log("    of what opens: " + counts.ready + " ready · " + counts.atRisk +
  " start under a risk · " + counts.blocked + " cannot start" +
  (counts.unchecked ? " · " + counts.unchecked + " the engine has nothing to check" : ""));
weeks.forEach(w => {
  console.log("\n  WEEK " + w.week + "  " + w.from + " to " + w.to);
  if (!w.opens.length) console.log("    nothing opens");
  w.opens.forEach(r => {
    console.log("    " + (r.verdict === "ready" ? "  " : r.verdict === "cannot start" ? "!!" : " ~") +
      " " + r.ES + "  " + r.name.slice(0, 30).padEnd(32) + r.verdict);
    r.needs.filter(x => !x.ok).forEach(x =>
      console.log("           " + x.kind + ": " + x.what.slice(0, 84)));
  });
  if (w.closes.length) console.log("    closing: " +
    w.closes.map(r => r.name).slice(0, 6).join(", "));
});
console.log("\n→ engines/skf/lookahead.json\n");
