#!/usr/bin/env node
// ===================================================================
// DnB-OS . tools/reports.js . THE THINGS PEOPLE ACTUALLY SEND
//   node tools/reports.js
//
// Every screen in this engine answers a question. Nobody forwards a screen.
// What leaves this project is a daily report, a Monday client pack, a one
// pager for a director, a procurement list for a buyer — and until now
// every one of those was assembled by hand from the same numbers the engine
// already holds, which is how a deck dated 28 July ends up warning about a
// 21 July crane slot.
//
// This builds them from the live files. Every figure on every report is the
// same figure the screen shows, because it is read from the same file.
//
// THE LAWS
//   . A REPORT IS A VIEW, NEVER A STORE. Nothing is computed here that a
//     module does not already publish. If a report and a screen disagree,
//     one of them is reading the wrong file, and that is a bug, not a
//     rounding difference.
//   . A REPORT SAYS WHAT IT COULD NOT SAY. Where an input has not landed,
//     the section names the missing input on the report itself, rather than
//     quietly leaving a heading empty or writing "to be updated".
//   . A REPORT THAT CANNOT BE BUILT IS LOCKED, and says which input would
//     unlock it. It is never shipped half full.
//   . CLIENT SAFE IS A PROPERTY OF THE REPORT, not of the reader. A report
//     marked client safe carries no internal cost, no vendor margin and no
//     unconfirmed accusation.
// ===================================================================
const fs = require("fs"), path = require("path");

const ENGINE = path.join(__dirname, "../engines/skf");
const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(ENGINE, f), "utf8")); }
                      catch (e) { return null; } };
const S = read("schedule.json"), T = read("target.json"), M = read("manpower.json");
const R = read("resources.json"), P = read("po.json"), D = read("design.json");
const B = read("procurement.json"), TD = read("todo.json"), CF = read("cashflow.json");
const H = read("hse.json"), L = read("layout.json"), A = read("assess.json"), CH = read("change.json");
const G = read("registers.json"), SG = read("snags.json"), BL = read("billing.json");
const DS = read("dossier.json"), PA = read("pairs.json"), MN = read("minutes.json");
const LA = read("lookahead.json"), DL = read("delays.json"), DG = read("digest.json");

const asOf = new Date().toISOString().slice(0, 10);
const walkDay = S && S.days ? S.days[S.days.length - 1] : null;
const pr = walkDay ? S.progress[walkDay] : null;

const cr = (x) => { const n = Math.abs(x || 0), s = (x || 0) < 0 ? "-Rs " : "Rs ";
  return n >= 1e7 ? s + (n / 1e7).toFixed(2) + " Cr"
       : n >= 1e5 ? s + (n / 1e5).toFixed(1) + " L" : s + Math.round(n).toLocaleString("en-IN"); };
const pc = (n) => n == null ? "—" : n + "%";
// ISO dates are right in a table and wrong in a 31px figure — "2026-08-22" is
// ten characters of which four never change on this project.
const MON = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const day = (d) => { if (!d) return null; const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d));
  return m ? Number(m[3]) + " " + MON[Number(m[2]) - 1] + " " + m[1].slice(2) : String(d); };

// ---- what a section can be ----------------------------------------------
// A section used to be a heading and some key/value rows, and every report
// therefore looked like the same list twice. These are the shapes the design
// module can draw. The data stays data — no markup is written here, because a
// report is a view and the view owns the look.
const sec = (title, rows, note) => ({ kind: "rows", title,
  rows: (rows || []).filter(Boolean), note: note || null });
// A FIGURE CAN NAME ITS SOURCE. `from` prints under the number, so anybody
// reading the page can ask where it came from without asking a person.
const kv = (k, v, tone, from) => ({ k, v, tone: tone || null, from: from || null });
const kvn = (k, v, note, tone, from) => ({ k, v, note: note || null,
  tone: tone || null, from: from || null });
// the big pastel figures across the top of a page
const stats = (cards, note) => ({ kind: "stats", title: null, note: note || null,
  cards: (cards || []).filter(Boolean) });
// `big` is what the card PRINTS. Where that is a humanised date — "22 Aug 26"
// reads better at 31px than 2026-08-22 — `raw` carries what it MEANS, so a law
// can check the report agrees with the module without matching a display string.
const statc = (big, cap, from, tone, unit, raw) => ({ big, cap, from: from || null,
  tone: tone || null, unit: unit || null, raw: raw == null ? null : String(raw) });
// plan against what the camera actually saw
const duals = (title, list, note) => ({ kind: "duals", title, note: note || null,
  rows: (list || []).filter(Boolean) });
// a real table, for registers that have columns
const tbl = (title, headers, list, note) => ({ kind: "table", title, note: note || null,
  headers, rows: (list || []).filter(Boolean) });
// nothing is published that nobody photographed
const shots = (title, list, note) => ({ kind: "shots", title, note: note || null,
  rows: (list || []).filter(Boolean) });
const cards = (title, list, note, cols) => ({ kind: "cards", title, note: note || null,
  cols: cols || 2, rows: (list || []).filter(Boolean) });
// THE READING BEHIND A SECTION. A figure off a half walked round is a
// different figure, so the section says which walk it came off.
const readOff = (s, day, from) => { if (!s) return s;
  const p = day && S && S.progress ? S.progress[day] : null;
  s.reading = { day: day || null, walked: p ? p.pinsWalked : null,
    total: p ? p.pinsTotal : null, confidence: p ? p.confidence : null,
    from: from || null };
  return s; };
// THE FLOOR, AS THE SURVEY PLACED IT. Not a floor plan — there is no wall
// data on this project — but the most a reader can be told: where each camera
// stands, how much floor it answers for, and what it saw.
const planSec = (title, note) => { if (!L || !L.pins) return null;
  return { kind: "plan", title, note: note || null,
    aspect: (L.extent && L.extent.aspect) || 4.6,
    rows: L.pins.map(p => ({ no: p.no, x: p.x, y: p.y, pct: p.pct,
      sqft: p.areaSqft, space: p.space || p.area, aim: p.aim })),
    spaces: (L.spaces || []).filter(x => !/^unnamed/i.test(x.name))
      .map(x => ({ name: x.name, sqft: x.sqft, pct: x.pct, pins: (x.pins || []).length })) }; };

// ---- the cash curve -------------------------------------------------
// Planned against earned, month by month, with the RA stages marked on the
// same axis. Three of them fell due and were never raised, and that is the
// thing the chart exists to show.
const MONN = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const curveSec = (title, note) => {
  if (!CF || !(CF.months || []).length) return null;
  const label = (m) => MONN[Number(String(m).slice(5, 7)) - 1] + " " + String(m).slice(2, 4);
  const past = CF.months.filter(m => m.past);
  if (!past.length) return null;
  const last = past[past.length - 1];

  // ---- TWO FORECASTS, NOT ONE -----------------------------------------
  // A single line claims a precision nobody has. The LOW is the rate this
  // project has actually earned at, carried forward unchanged. The HIGH is
  // the programme's own remaining monthly shape, applied from where we are —
  // i.e. what happens if the plan is met from today with no catch-up at all.
  // The answer is somewhere between them, and both are drawn dashed so
  // neither can be mistaken for something that was read off the floor.
  const perMonth = past.length > 1
    ? (last.cumEarned - past[0].cumEarned) / (past.length - 1) : last.cumEarned;
  const contract = CF.totals.contract;
  // the programme's remaining monthly increments, from its own curve
  const planShape = [];
  for (let i = 1; i < CF.months.length; i++)
    planShape.push(Math.max(0, CF.months[i].cumPlanned - CF.months[i - 1].cumPlanned));
  const planAvg = planShape.length
    ? planShape.reduce((t, x) => t + x, 0) / planShape.length : perMonth;

  // six months forward and no further. At the observed rate this contract
  // does not reach its value until well into 2027, and stretching the axis
  // that far squeezes every real reading into nothing — so the horizon is
  // short and the far date is stated in words underneath.
  const HORIZON = 6;
  const rows = [];
  CF.months.forEach(m => rows.push({ x: label(m.month), a: m.cumPlanned,
    b: m.past ? m.cumEarned : null }));
  // the forecasts start at the last actual so the lines join rather than float
  const startIdx = CF.months.findIndex(m => m.month === last.month);
  if (startIdx >= 0) { rows[startIdx].lo = last.cumEarned; rows[startIdx].hi = last.cumEarned; }
  let lo = last.cumEarned, hi2 = last.cumEarned;
  let d = new Date(Date.parse(last.month + "-01T00:00:00Z"));
  for (let i = 1; i <= HORIZON; i++) {
    d.setUTCMonth(d.getUTCMonth() + 1);
    const key = d.toISOString().slice(0, 7);
    lo = Math.min(contract, lo + perMonth);
    hi2 = Math.min(contract, hi2 + planAvg);
    const at = rows.find(r => r.x === label(key));
    if (at) { at.lo = lo; at.hi = hi2; }
    else rows.push({ x: label(key), a: null, b: null, lo, hi: hi2 });
  }
  // when each reaches the contract value, said in words rather than drawn
  const reach = (rate) => { if (rate <= 0) return null;
    const n = Math.ceil((contract - last.cumEarned) / rate);
    const dd = new Date(Date.parse(last.month + "-01T00:00:00Z"));
    dd.setUTCMonth(dd.getUTCMonth() + n);
    return { n, when: label(dd.toISOString().slice(0, 7)) }; };
  const rLo = reach(perMonth), rHi = reach(planAvg);

  const marks = (BL ? BL.stages : []).filter(x => x.value > 0 && x.dueOn)
    .map(x => ({ x: label(String(x.dueOn).slice(0, 7)), label: x.key,
      tone: x.state === "due, not raised" ? "bad" : null }));

  return { kind: "curve", title, note: note || null,
    aLabel: "what the contract said would be earned by now",
    bLabel: "what the walk says has been earned",
    rangeLabel: "where it goes from here — a range, not a prediction",
    markLabel: "an RA stage falls due",
    rows, marks,
    chartNote:
      "The dashed band is not a reading. Its lower edge carries forward the rate this project " +
      "has actually earned at — " + cr(perMonth) + " a month across " + (past.length - 1) +
      " months — which reaches the contract value around " + (rLo ? rLo.when : "—") + ". Its " +
      "upper edge applies the programme's own remaining monthly shape from where we are now, " +
      "with no catch-up, reaching it around " + (rHi ? rHi.when : "—") + ". A fit-out does not " +
      "earn in a straight line: the finishes carry far more value per week than the first fix, " +
      "so the lower edge is a floor rather than an expectation." };
};

// ---- the programme as a timeline ------------------------------------
// The packages that carry the most value, as windows with what is built in
// them, against today and the two dates that matter.
const timelineSec = (title, n, note) => {
  if (!S || !pr) return null;
  const rows = [];
  S.wbs.forEach(c => c.packages.forEach(k => {
    if (k.track === false || !k.ES || !k.EF) return;
    const r = pr.byPkg[k.id]; if (!r || r.actual == null) return;
    rows.push({ name: k.name, from: k.ES, to: k.EF, pct: r.actual, w: r.weight || 0,
      tone: r.planned != null && r.planned - r.actual >= 40 ? "bad"
          : r.planned != null && r.planned - r.actual >= 20 ? "warn"
          : r.planned != null && r.actual >= r.planned ? "ok" : null });
  }));
  if (!rows.length) return null;
  const marks = [{ on: asOf, label: "today" }];
  if (T && T.target) marks.push({ on: T.target, label: "contract", tone: "gold" });
  if (T && T.built && T.built.conditionsBy)
    marks.push({ on: T.built.conditionsBy, label: "lands", tone: "bad" });
  return { kind: "timeline", title, note: note || null, marks,
    rows: rows.sort((a, b) => b.w - a.w).slice(0, n || 12) };
};

// A SPEC LIST — label left, value right, hairlines between. The reference
// deck's right hand column, and the right shape for a block of facts that
// are not a table and are not a chart.
const specSec = (title, list, note) => ({ kind: "specs", title, note: note || null,
  rows: (list || []).filter(Boolean) });
// the same, laid beside a short standfirst
const twoColSec = (title, list, note) => ({ kind: "specs", title, note: note || null,
  rows: (list || []).filter(Boolean) });

// A REPORT SAYS WHAT IT COULD NOT SAY.
const missing = (what, who) => ({ k: what, v: "not on the engine", tone: "warn",
  note: who ? "would come from " + who : null });

// A SECTION IS NOT ALWAYS A LIST OF ROWS any more, so nothing may assume it
// carries `rows`. This is the one place that answers how much a section holds.
const itemsIn = (x) => ((x && (x.rows || x.cards)) || []).length;


// ==== THE DPR, THE ONE DAILY REPORT ======================================
// There were two daily reports: a digest of what the walk showed and a formal
// record of who turned up. Nobody wants two. This is one report in two
// versions, and the versions are not the same report with numbers removed —
// they answer different questions for different rooms.
//
// THE DAY IS THE LATEST DAY MANPOWER EXISTS FOR, not the latest walk. A daily
// progress report with no attendance on it is not a DPR, so the attendance
// decides the date. On this project that is 1 Aug while the newest walk is
// 10 Aug, and the report says so rather than quietly mixing the two.
// A DAY IS ONLY A DPR DAY IF IT HAS BOTH. Attendance with no walk has no
// evidence on it; a walk with no attendance is not a daily progress report.
// Six days on this project carry both, and they are the only ones offered.
const dprDays = (() => {
  if (!M || !M.actual || !M.actual.any || !S) return [];
  const walked = new Set(S.days);
  const shot = new Set();
  ((PA && PA.pins) || []).forEach(p => Object.keys(p.shots || {}).forEach(d => shot.add(d)));
  return M.actual.days.filter(d => walked.has(d) && shot.has(d));
})();
const dprDay = dprDays.length ? dprDays[dprDays.length - 1] : null;

// WHY THIS REPORT IS DATED WHAT IT IS DATED. A daily report opened ten days
// after the day it covers has to say so on its own face — a reader who has to
// work that out from the date in the corner has already been misled. It is the
// muster that binds: the walks kept going, so the days exist and the headcount
// does not. Null when the report is current, which is the only time it should
// be silent about it.
const dprStale = (d) => {
  if (!d || !PA || !(PA.walkDays || []).length) return null;
  const lastWalk = PA.walkDays[PA.walkDays.length - 1];
  if (lastWalk <= d) return null;
  const behind = Math.round((Date.parse(lastWalk + "T00:00:00Z")
    - Date.parse(d + "T00:00:00Z")) / 86400000);
  const since = (PA.walkDays || []).filter(w => w > d).length;
  return "this is the most recent day a headcount exists for. The floor has been walked " +
    since + " time" + (since === 1 ? "" : "s") + " since, the last on " + day(lastWalk) +
    ", so the site is " + behind + " days ahead of what this report can describe";
};

// the walk to read that day against: the one ON the day if there was one,
// otherwise the last walk before it. Never a later one — a DPR cannot report
// evidence from after the day it covers.
const dprWalkFor = (d) => { if (!d || !S) return null;
  const before = S.days.filter(x => x <= d);
  return before.length ? before[before.length - 1] : null; };

// the photographs from that walk, by the path the walk actually recorded
const dprShotAt = (walk, n) => { const pp = PA && PA.pins.find(x => x.pin === n);
  return (pp && pp.shots && pp.shots[walk]) || null; };
const dprFramesOn = (walk, limit) => { const dg = DG && DG.digests.find(x => x.day === walk);
  const cap = limit || 4, out = [], seen = new Set();
  if (dg) dg.frames.forEach(f => { if (out.length >= cap) return;
    const src = dprShotAt(walk, f.pin) || f.photo;
    if (src) { seen.add(f.pin);
      out.push({ src, head: "Pin " + f.pin + (f.area ? " · " + f.area : ""), note: f.why }); } });
  // THE DIGEST CHOOSES FRAMES BY WHAT MOVED, and on a round where one
  // photograph was taken it can choose none at all — which left a day that
  // plainly has a picture with no picture on its report. Anything the walk
  // shot that day is better than nothing, and it says which it is.
  if (out.length < cap && PA) {
    PA.pins.forEach(p => { if (out.length >= cap || seen.has(p.pin)) return;
      const src = (p.shots || {})[walk]; if (!src) return;
      seen.add(p.pin);
      out.push({ src, head: "Pin " + p.pin + (p.area ? " · " + p.area : ""),
        note: "photographed on this walk" }); });
  }
  return out; };
// the one frame that leads the cover — the first thing anybody sees
const dprHeroOn = (walk) => { const f = dprFramesOn(walk, 1)[0]; return f ? f.src : null; };

// required against achieved, trade by trade. THE TOTAL IS THE LEAST
// INTERESTING NUMBER ON THIS PAGE: 88 people turned up against 59 asked for,
// and the job still lost a day, because the 26 joiners the plan wanted were
// 16 and nobody at all stood on flooring or plumbing.
const dprTradesOn = (d) => {
  if (!d || !M) return [];
  const a = M.actual.byDay[d] || { byTrade: {} };
  const p = (M.daily || []).find(x => x.day === d) || { byTrade: {} };
  const names = [...new Set([...Object.keys(p.byTrade || {}), ...Object.keys(a.byTrade || {})])];
  return names.map(t => ({ trade: t.replace(/_/g, " "),
    want: (p.byTrade || {})[t] || 0, got: (a.byTrade || {})[t] || 0 }))
    .map(x => Object.assign(x, { gap: x.got - x.want }))
    .sort((x, y) => (x.gap - y.gap) || (y.want - x.want));
};

// how the last few reported days moved, so "picking up speed" is a measured
// claim and not a feeling
const dprRecentTo = (upto, n) => { if (!M || !M.actual.any) return [];
  const upTo = M.actual.days.filter(x => x <= upto);
  return upTo.slice(-(n || 6)).map(d => {
    const a = M.actual.byDay[d], pl = (M.daily || []).find(x => x.day === d);
    const w = S && S.days.indexOf(d) >= 0 ? S.progress[d] : null;
    const dg = DG && DG.digests.find(x => x.day === d);
    return { day: d, got: a.labour, want: pl ? pl.total : null,
      built: w ? w.overall.actual : null, moved: dg ? dg.moveOverall : null }; });
};

// ==== the reports ========================================================
const BUILD = {

dprClient: (D0) => {
  const dprDay = D0 || dprDays[dprDays.length - 1];
  if (!dprDay || !M) return null;
  const dprWalk = dprWalkFor(dprDay);
  const A = M.actual.byDay[dprDay];
  const pr = dprWalk && S ? S.progress[dprWalk] : null;
  const dg = DG && DG.digests.find(x => x.day === dprWalk);
  const hd = H && H.days.find(x => x.day === dprWalk);
  const recent = dprRecentTo(dprDay, 6);
  const before = recent.slice(0, -1).filter(x => x.got != null);
  const avg = before.length
    ? Math.round(before.reduce((t, x) => t + x.got, 0) / before.length) : null;
  const up = avg != null ? A.labour - avg : null;
  const trades = Object.entries(A.byTrade).sort((x, y) => y[1] - x[1]);
  const newTrades = (() => { const prev = before
      .flatMap(x => Object.keys((M.actual.byDay[x.day] || {}).byTrade || {}));
    return Object.keys(A.byTrade).filter(t => prev.indexOf(t) < 0); })();
  return { title: "Daily Progress Report", for: dprDay, clientSafe: true,
    kick: "Daily progress report",
    sub: "SKF India · Pune 7F  ·  " + day(dprDay),
    // A HEADLINE WITH ONE GOLD PHRASE, the way the reference deck leads a
    // page: a sentence that says what the day was, not a label.
    headline: A.labour + " on the floor, *" + trades.length + " trades* working",
    tag: "Client issue",
    hero: dprHeroOn(dprWalk),
    figures: [
      { big: A.labour, cap: "ON THE TOOLS" },
      { big: trades.length, cap: "TRADES WORKING" },
      pr ? { big: pr.overall.actual, unit: "%", cap: "OF THE FLOOR BUILT" } : null,
      hd && hd.items.ppe.rate != null
        ? { big: hd.items.ppe.rate, unit: "%", cap: "PPE IN USE" } : null,
    ].filter(Boolean),
    intro: "Who was on the floor, what moved, and what the camera saw. Every figure is read " +
      "from the same files the site team's own screens read.",
    couldNotSay: [
      dprWalk && dprWalk !== dprDay
        ? "no camera walk was made on " + dprDay + " itself, so the progress and photographs " +
          "here are from the walk of " + dprWalk : null,
      pr && pr.coverage < 90
        ? "that walk reached " + pr.pinsWalked + " of " + pr.pinsTotal + " camera positions, so " +
          "anything that does not appear to have moved may simply not have been looked at" : null,
      "weather, permits and stoppages are written as prose in the daily report and are not read " +
        "by this engine, so no hindrance log appears here",
      dprStale(dprDay),
    ].filter(Boolean),
    sections: [
    stats([
      // A FIGURE IS SET IN INK UNLESS IT IS FLAGGING SOMETHING. Only PPE can
      // be good or bad here; the rest are facts about the day.
      statc(A.labour, "on the tools", "the site's daily report"),
      statc(A.staff || 0, "supervision and staff", "the site's daily report"),
      statc(trades.length, "trades on the floor", "the site's daily report"),
      statc((A.shifts || []).join(" + ") || "day", "shifts run", "the site's daily report"),
      hd && hd.items.ppe.rate != null
        ? statc(hd.items.ppe.rate, "PPE in use, of the " + hd.framesWithPeople +
          " frames showing people", "the walk photographs",
          hd.items.ppe.rate < 60 ? "rose" : "sage", "%") : null,
    ]),
    tbl("Who was on the floor", ["Trade", { t: "People", n: true }, { t: "Share of the floor", n: true }],
      trades.map(([t, n]) => [{ t: t.replace(/_/g, " "), b: true }, { t: n, n: true },
        { t: Math.round(n / Math.max(1, A.labour) * 100) + "%", n: true,
          bar: Math.round(n / Math.max(1, A.labour) * 100) }]),
      "Share is of the " + A.labour + " on the tools · " + (A.staff || 0) + " staff counted separately"),
    duals("Where the floor is picking up speed",
      recent.map(x => ({ name: day(x.day) + (x.day === dprDay ? "  ·  this day" : ""),
        note: x.got + " on the tools" + (x.built != null ? " · floor at " + x.built + "%" : ""),
        plan: 0, site: Math.min(100, Math.round(x.got / Math.max(1, M.catchUp ? M.catchUp.ceiling : 200) * 100)),
        right: String(x.got), tone: x.day === dprDay ? "sage" : "sky" })),
      up != null
        ? (up > 0 ? "Attendance on " + dprDay + " is " + up + " above the average of the "
            + before.length + " reported days before it (" + avg + " a day)."
          : up === 0 ? "Attendance is level with the average of the days before it."
          : "Attendance is " + Math.abs(up) + " below the average of the days before it.")
        : "The reported days on record, in order."),
    dg && dg.trades.length ? sec("What is progressing", dg.trades.map(t =>
      kvn(t.trade, t.line, t.pins.length ? "seen at pins " + t.pins.slice(0, 8).join(", ") : null,
        "ok", "read off the walk")),
      "Each line names the pins that carry it.") : null,
    newTrades.length ? cards("New on the floor this day",
      newTrades.map(t => ({ head: t.replace(/_/g, " "),
        body: A.byTrade[t] + " on site — this trade does not appear on the reported days before " +
          "this one, so this is its first shift on the record",
        tone: "sage" })), null, 2) : null,
    (H && (H.good || []).length) ? cards("Good practice on site",
      (H.good || []).slice(0, 4).map(g => ({ head: g.text,
        body: g.pins.length ? "seen at pins " + g.pins.join(", ") : "across the floor",
        tone: "sage" })),
      null, 2) : null,
    shots("The floor on " + (dprWalk || dprDay), dprFramesOn(dprWalk, 4),
      "Chosen by the reading: what moved, then what is furthest from the render."),
  ]};
},

dprInternal: (D0) => {
  const dprDay = D0 || dprDays[dprDays.length - 1];
  if (!dprDay || !M) return null;
  const dprWalk = dprWalkFor(dprDay);
  const A = M.actual.byDay[dprDay];
  const P = (M.daily || []).find(x => x.day === dprDay);
  const pr = dprWalk && S ? S.progress[dprWalk] : null;
  const dg = DG && DG.digests.find(x => x.day === dprWalk);
  const cu = M.catchUp;
  const rows = dprTradesOn(dprDay);
  const short = rows.filter(x => x.gap < 0);
  const none = rows.filter(x => x.want > 0 && x.got === 0);
  const unplanned = rows.filter(x => x.want === 0 && x.got > 0);
  const next = (M.daily || []).find(x => x.day > dprDay);
  const blocked = LA ? LA.rows.filter(r => r.verdict === "cannot start").slice(0, 8) : [];
  const behind = DL ? DL.rows.slice(0, 8) : [];
  const recent = dprRecentTo(dprDay, 8);
  return { title: "Daily Progress Report — internal", for: dprDay, clientSafe: false,
    kick: "Internal · not for issue",
    sub: "SKF India · Pune 7F  ·  " + day(dprDay),
    headline: short.length
      ? A.labour + " turned up against " + (P ? P.total : "—") + " asked for, and *" +
        short.length + " trades came up short*"
      : A.labour + " on the tools against " + (P ? P.total : "—") + " asked for",
    tag: "Internal",
    hero: dprHeroOn(dprWalk),
    figures: [
      { big: A.labour, cap: "ON THE TOOLS" },
      P ? { big: P.total, cap: "THE PROGRAMME ASKED FOR" } : null,
      { big: short.length, cap: "TRADES SHORT OF THE ASK" },
      { big: none.length, cap: "ASKED FOR, NOBODY ON THEM" },
    ].filter(Boolean),
    intro: "The total is the least interesting number here. " + A.labour + " were on the tools " +
      "against " + (P ? P.total : "—") + " asked for" +
      (short.length ? ", and the job still lost ground, because " + short.length +
        " of the trades the plan named came up short" : "") + ".",
    trend: recent.map(x => x.got),
    couldNotSay: [
      A.disagrees ? "the daily report's own stated total is " + A.stated + " while its rows add " +
        "to " + A.total + " — both are shown and neither is corrected here" : null,
      A.unplaced ? A.unplaced + " people were reported under a label this engine could not place " +
        "against a trade — they are in the total and in no trade line" : null,
      "the daily report counts people present, not hours worked, so a half day and a full day " +
        "are the same row",
      dprWalk && dprWalk !== dprDay
        ? "no walk was made on " + dprDay + ", so the progress here is from " + dprWalk : null,
      dprStale(dprDay),
    ].filter(Boolean),
    sections: [
    stats([
      statc(A.labour, "on the tools", "the daily report"),
      P ? statc(P.total, "the programme asked for", "the levelled programme") : null,
      P ? statc((A.labour - P.total > 0 ? "+" : "") + (A.labour - P.total), "against the ask",
        null, A.labour >= P.total ? "sage" : "rose") : null,
      statc(short.length, "trades short of the ask", null, short.length ? "rose" : "sage"),
      statc(none.length, "trades asked for with nobody on them", null,
        none.length ? "rose" : "sage"),
    ]),
    duals("Required against achieved, trade by trade",
      rows.map(x => ({ name: x.trade,
        note: x.want ? x.got + " of " + x.want + " asked for" : x.got + " on site, none asked for",
        plan: Math.min(100, x.want * 3), site: Math.min(100, x.got * 3),
        right: (x.gap > 0 ? "+" : "") + x.gap,
        tone: x.want && x.got === 0 ? "rose" : x.gap < 0 ? "sand" : "sage" })),
      "Pale lane: asked for. Deep lane: turned up."),
    (none.length || short.length) ? sec("Where we are lagging",
      none.map(x => kvn(x.trade, "nobody on site", "the programme asked for " + x.want, "bad",
        "manpower.json")).concat(
      short.filter(x => x.got > 0).map(x => kvn(x.trade, x.got + " of " + x.want,
        Math.abs(x.gap) + " short", "warn", "manpower.json"))),
      unplanned.length ? "Meanwhile " + unplanned.map(x => x.trade + " " + x.got).join(", ") +
        " were on site and in nobody's plan for the day." : null) : null,
    blocked.length ? tbl("Critical to pick up — cannot start until this is cleared",
      ["Package", "What it is waiting on"],
      blocked.map(r => [{ t: r.name, b: true },
        r.needs.filter(n => !n.ok).map(n => n.kind + ": " + n.what).join("; ")]),
      "Not late yet — they cannot begin at all.") : null,
    behind.length ? tbl("Furthest behind their own window",
      ["Package", { t: "Built", n: true }, { t: "Window gone", n: true }, "Side"],
      behind.map(r => [{ t: r.name, b: true }, { t: r.built, n: true, unit: "%" },
        { t: r.elapsed, n: true, unit: "%", tone: r.gap >= 60 ? "bad" : null },
        { t: r.side, chip: true,
          tone: r.side === "us" ? "rose" : r.side === "client" ? "sand" : "neutral" }]),
      "From the delay register.") : null,
    cu ? sec("Recovery — what it would take from here", [
      kv("Work left", cu.workLeft.toLocaleString("en-IN") + " man-days", null, "manpower.json"),
      kv("To hold " + day(cu.toHandover.date), cu.toHandover.perDay + " people a day",
        cu.toHandover.possible ? "ok" : "bad", "manpower.json"),
      kv("To hold " + day(cu.toLanding.date), cu.toLanding.perDay + " people a day",
        cu.toLanding.possible ? "ok" : "bad", "manpower.json"),
      kv("The most this floor can physically hold", String(cu.ceiling), null, "225 sqft a worker"),
      kv("On this day we had", A.labour + " on the tools",
        cu && A.labour < cu.toLanding.perDay ? "bad" : "ok", "the daily report"),
    ], "The ceiling is a physical limit — above it cannot be staffed, only worked longer.") : null,
    next ? tbl("The plan for the next working day · " + next.day,
      ["Trade", { t: "Asked for", n: true }, { t: "On site today", n: true }, { t: "Move", n: true }],
      Object.entries(next.byTrade || {}).sort((x, y) => y[1] - x[1]).map(([t, n]) => {
        const today = (A.byTrade || {})[t] || 0;
        return [{ t: t.replace(/_/g, " "), b: true }, { t: n, n: true },
          { t: today, n: true }, { t: (n - today > 0 ? "+" : "") + (n - today), n: true,
            tone: n > today ? "warn" : null }]; }),
      "Total asked for on " + next.day + ": " + next.total + " against " + A.labour +
      " on the tools today. Anything with a plus needs people found or moved.") : null,
    sec("Shifts and the night", [
      kv("Shifts reported on this day", (A.shifts || []).join(" + ") || "not stated", null,
        "the daily report"),
      kv("A night shift ran", (A.shifts || []).indexOf("night") >= 0 ? "yes" : "no",
        (A.shifts || []).indexOf("night") >= 0 ? "ok" : null, "the daily report"),
      missing("Hours worked per shift", "the daily report, which counts people and not hours"),
      missing("Night shift trade split", "the daily report, which does not separate the two shifts"),
    ], "Nothing on this project records how long a shift ran."),
    shots("The floor on " + (dprWalk || dprDay), dprFramesOn(dprWalk, 4),
      dg && dg.watch.length ? "Watch list: " + dg.watch.map(w => w.what).join(" · ") : null),
  ]};
},

weeklyClient: () => {
  if (!pr || !T) return null;
  const lands = (T.built && T.built.conditionsBy) || null;
  const client = read("client.json");
  const dr = G && G.drawings;
  const landed = R ? R.rows.filter(x => x.state === "landed" || x.state === "delivered") : [];
  const onOrder = R ? R.rows.filter(x => x.bought && x.bought.pos && x.bought.pos.length) : [];
  const movers = S.wbs.flatMap(c => c.packages.filter(k => k.track !== false))
    .map(k => ({ k, r: pr.byPkg[k.id] })).filter(x => x.r && x.r.actual != null);
  const moving = movers.filter(x => x.r.actual > 0).sort((a, b) => b.r.actual - a.r.actual);
  const mp = M && M.actual.any ? M.actual.byDay[M.actual.days[M.actual.days.length - 1]] : null;
  const hero = dprHeroOn(walkDay);
  return { title: "Weekly Progress Report", for: walkDay, clientSafe: true,
    kick: "Weekly · client", sub: "SKF India · Pune 7F  ·  " + day(walkDay),
    headline: pr.overall.actual + "% built, *" + moving.length + " packages* under way",
    tag: "Client issue", hero,
    figures: [
      { big: pr.overall.actual, unit: "%", cap: "OF THE FLOOR BUILT" },
      { big: moving.length, cap: "PACKAGES UNDER WAY" },
      { big: pr.pinsWalked + "/" + pr.pinsTotal, cap: "POSITIONS READ" },
      mp ? { big: mp.labour, cap: "ON THE TOOLS" } : null,
    ].filter(Boolean),
    intro: "Where the floor stands this week, read from " + pr.pinsWalked +
      " fixed camera positions on " + day(walkDay) + ". Every figure comes from the same " +
      "files the site team's own screens read.",
    couldNotSay: [
      pr.coverage < 90 ? "this round reached " + pr.pinsWalked + " of " + pr.pinsTotal +
        " positions, so anything that has not moved may simply not have been looked at" : null,
      "the percentage is site work only — procurement is scheduled and owned but never scored",
    ].filter(Boolean),
    sections: [
    stats([
      statc(pr.overall.actual, "of the floor built, by bill value", "the walk", null, "%"),
      statc(day(T.target), "contract completion", "the agreement", null, null, T.target),
      statc(day(lands), "the programme lands today", "the levelled programme", null, null, lands),
      statc(pr.confidence, "confidence in this reading", "coverage of the walk",
        pr.coverage >= 90 ? "ok" : "warn"),
      statc(pr.pinsWalked + "/" + pr.pinsTotal, "camera positions read", "the walk"),
    ]),
    planSec("The floor, position by position",
      "Every camera position on the floor, coloured by how much of what the design render " +
      "asks for is actually there."),
    timelineSec("The programme", 10,
      "The packages carrying the most value, against their own windows."),
    readOff(duals("Execution — where each trade stands",
      movers.sort((a, b) => (b.r.weight || 0) - (a.r.weight || 0)).slice(0, 9)
        .map(x => ({ name: x.k.name,
          note: x.r.weight ? Math.round(x.r.weight * 1000) / 10 + "% of the job by value" : "",
          plan: x.r.planned == null ? 0 : x.r.planned, site: x.r.actual,
          right: x.r.actual + "%",
          tone: x.r.planned != null && x.r.actual >= x.r.planned ? "sage" : "sky" })),
      "Pale lane: the programme. Deep lane: what the camera saw."), walkDay, "the walk"),
    dr ? twoColSec("Design and drawings",
      [{ k: "Drawings issued", v: dr.counts.total },
       { k: "Complete on our side", v: dr.counts.throughInternally, tone: "ok" },
       { k: "With the client for approval", v: dr.counts.total - dr.counts.approvedByClient,
         tone: "warn" },
       { k: "Approved and usable to buy against", v: dr.counts.usable,
         tone: dr.counts.usable ? "ok" : "warn" }],
      "Approvals are the gate every downstream order waits on — the drawings are through " +
      "our side and sit with you.") : null,
    // WHAT WE HAVE COMMITTED IS OURS, NOT THEIRS. A client report says what
    // has been ordered and what has landed; the money we spent doing it is
    // internal, and a law caught it sitting on a client-safe page.
    P ? twoColSec("Procurement",
      [{ k: "Orders placed", v: P.totals.pos },
       { k: "Packages with material on site", v: landed.length, tone: "ok" },
       { k: "Packages on order", v: onOrder.length },
       { k: "Long-lead items tracked", v: R ? R.rows.length : null }],
      "What has been bought and what has landed on the floor.") : null,
    mp ? twoColSec("Manpower on site",
      [{ k: "On the tools", v: mp.labour },
       { k: "Supervision and staff", v: mp.staff || 0 },
       { k: "Trades working", v: Object.keys(mp.byTrade).length },
       { k: "Shifts run", v: (mp.shifts || []).join(" + ") || "day" }],
      "Read from the site's own daily report for " + day(M.actual.days[M.actual.days.length - 1]) +
      ".") : null,
    (H && (H.good || []).length) ? cards("Good practice on site",
      (H.good || []).slice(0, 4).map(g => ({ head: g.text,
        body: g.pins.length ? "seen at " + g.pins.length + " positions" : "across the floor" })),
      null, 2) : null,
    PA && PA.worst.length ? shots("3D against the floor",
      PA.worst.slice(0, 2).map(w => { const pp = PA.pins.find(x => x.pin === w.pin) || {};
        return { src: (pp.shots || {})[walkDay] || (pp.photo && pp.photo.rel),
          head: "Pin " + w.pin + " · " + (w.area || ""),
          note: "read against the approved render" }; }).filter(x => x.src),
      "Each position is scored against the design render for the same view.") : null,
    client ? tbl("What we need from you", ["What", { t: "By when", n: true }],
      client.rows.slice(0, 8).map(r => [{ t: r.what, b: true },
        { t: r.due || "no date", n: true }]),
      client.rows.length + " open on the dependency register.") : null,
  ]};
},

weeklyManagement: () => {
  if (!T || !TD || !DL) return null;
  const lands = (T.built && T.built.conditionsBy) || null;
  const PJ = DL.project, C = DL.counts;
  const dr = G && G.drawings;
  const hero = dprHeroOn(walkDay);
  const blocking = TD.rows.filter(r => r.blocking);
  const byOwner = {}; blocking.forEach(r => byOwner[r.owner] = (byOwner[r.owner] || 0) + 1);
  return { title: "Weekly Report — management", for: asOf, clientSafe: false,
    kick: "Internal · management", sub: "SKF India · Pune 7F  ·  " + day(asOf),
    headline: "Lands " + day(lands) + ", *" + PJ.overDays + " days past* the contract date",
    tag: "Internal", hero,
    figures: [
      { big: pr ? pr.overall.actual : null, unit: "%", cap: "BUILT" },
      { big: PJ.overDays, cap: "DAYS PAST CONTRACT" },
      { big: cr(PJ.ldExposure), cap: "DAMAGES EXPOSURE" },
      { big: blocking.length, cap: "BLOCKING A DATE" },
    ],
    intro: "The position as the engine reads it, without rounding off the parts that are " +
      "uncomfortable. Everything here is on a register somebody can open.",
    couldNotSay: [
      C.unattributed + " of the " + C.behind + " packages behind carry no cause specific to " +
        "them, and are called unattributed rather than ours",
      "pointing at a contract ground is not claiming an extension of time",
    ],
    sections: [
    stats([
      statc(day(T.target), "contract completion", "the agreement", null, null, T.target),
      statc(day(lands), "the programme lands", "the levelled programme", "bad", null, lands),
      statc(PJ.overDays + " days", "over", null, "bad"),
      statc(cr(PJ.ldExposure), "damages at " + PJ.overWeeks + " weeks", "the contract", "bad"),
      pr ? statc(pr.overall.actual, "built, by value", "the walk", null, "%") : null,
    ]),
    planSec("The floor at a glance",
      "Where the work is, and where it is not. Sized by the floor each camera answers for."),
    timelineSec("The programme against the floor", 11,
      "The twelve packages carrying the most value. The pale bar is the window the programme " +
      "gives each one; the solid part is what the walk can see built in it."),
    curveSec("Cash — planned against earned",
      "Cumulative. The gap between the two lines is work done and not yet turned into money."),
    specSec("Where the date stands",
      [{ k: "Contract completion", v: day(T.target) },
       { k: "The programme lands", v: day(lands), tone: "bad" },
       { k: "Days over", v: PJ.overDays, tone: "bad" },
       { k: "Damages, at " + PJ.overWeeks + " weeks", v: cr(PJ.ldPerWeek) + " a week",
         tone: "bad" },
       { k: "Exposure to date", v: cr(PJ.ldExposure), tone: "bad" },
       M && M.catchUp ? { k: "To hold the contract date",
         v: M.catchUp.toHandover.perDay + " a day against a floor that holds " + M.catchUp.ceiling,
         tone: M.catchUp.toHandover.possible ? null : "bad" } : null],
      PJ.ldWhy),
    tbl("The blockers", ["What", "Owner", { t: "Due", n: true }],
      blocking.slice(0, 8).map(r => [{ t: r.what, b: true }, r.owner,
        { t: r.due || "no date", n: true, tone: r.due && r.due < asOf ? "bad" : null }]),
      blocking.length + " blocking a date — " + Object.entries(byOwner)
        .sort((a, b) => b[1] - a[1]).map(([o, n]) => n + " " + o).join(", ") + "."),
    cards("Escalations", [
      dr && dr.counts.approvedByClient === 0 ? { head: "No drawing carries a client approval",
        body: "Not one of the " + dr.counts.total + " drawings on the register is approved, so " +
          "nothing is formally usable to buy against.", tone: "dark" } : null,
      BL && BL.totals.unbilledDue > 0 ? { head: cr(BL.totals.unbilledDue) + " past its RA date, unraised",
        body: "Stages whose date has passed and against which nothing has been raised." } : null,
      P && P.totals.promisePassed ? { head: P.totals.promisePassed + " promised dates already gone",
        body: "Orders placed whose promised delivery has passed with nothing seen on site." } : null,
      LA && LA.counts.blocked ? { head: LA.counts.blocked + " packages cannot start",
        body: "Opening in the next fortnight and blocked on material, drawing or predecessor." } : null,
      // THE ENGINE'S OWN BLIND SPOT, escalated rather than left on a register.
      // It ranks out of the blockers table on due date — the material rows are
      // older — and it is not the same class of problem as a late door. This
      // one says the instrument has stopped reading, on the one dial the
      // recovery is steered by.
      dprStale(dprDay) ? { head: "No headcount since " + day(dprDay),
        body: "The floor has been walked since, so the site did not go quiet, the counting did. " +
          "Recovery here is bought with labour, and the engine cannot see whether it is being " +
          "bought.", tone: "dark" } : null,
    ].filter(Boolean), null, 2),
    specSec("Dependencies on the client",
      (read("client.json") ? read("client.json").rows.slice(0, 6) : [])
        .map(r => ({ k: r.what, v: r.due || "no date",
          tone: r.due && r.due < asOf ? "bad" : null })),
      "The full register carries " +
      (read("client.json") ? read("client.json").rows.length : 0) + " items."),
    specSec("The money", [
      CF ? { k: "Contract value", v: cr(CF.totals.contract) } : null,
      CF ? { k: "Earned, by the walk", v: cr(CF.totals.earned) } : null,
      BL ? { k: "Raised", v: cr(BL.totals.raised), tone: BL.totals.raised ? null : "bad" } : null,
      BL ? { k: "Collected", v: cr(BL.totals.collected),
        tone: BL.totals.collected ? null : "bad" } : null,
      P ? { k: "Committed on orders", v: cr(P.totals.committed),
        tone: P.totals.committed > P.totals.bcs ? "bad" : null } : null,
      P ? { k: "Heads over budget", v: P.totals.headsOver + " of " + P.heads.length,
        tone: P.totals.headsOver ? "bad" : "ok" } : null,
    ].filter(Boolean), "Raised, certified and collected are three different facts."),
  ]};
},

weeklyOperations: () => {
  if (!pr || !S) return null;
  const lands = (T && T.built && T.built.conditionsBy) || null;
  const dr = G && G.drawings;
  const behind = DL ? DL.rows : [];
  const blocked = LA ? LA.rows.filter(r => r.verdict === "cannot start") : [];
  const pending = R ? R.rows.filter(r => r.state === "pending") : [];
  const overdue = R ? R.rows.filter(r => r.state === "overdue") : [];
  const mp = M && M.actual.any ? M.actual.byDay[M.actual.days[M.actual.days.length - 1]] : null;
  const mpDay = M && M.actual.any ? M.actual.days[M.actual.days.length - 1] : null;
  const plan = mpDay ? (M.daily || []).find(x => x.day === mpDay) : null;
  const tradeGap = mpDay ? dprTradesOn(mpDay) : [];
  const hero = dprHeroOn(walkDay);
  const good = [
    pr.coverage >= 90 ? "the walk reached " + pr.pinsWalked + " of " + pr.pinsTotal +
      " positions — a full round, high confidence" : null,
    H && H.ppe.latest >= 60 ? "PPE at " + H.ppe.latest + "% of the frames showing people" : null,
    (H && (H.good || []).length) ? (H.good || []).length + " good practices recorded on the walk" : null,
    mp && plan && mp.labour >= plan.total ? mp.labour + " on the tools against " + plan.total +
      " asked for" : null,
  ].filter(Boolean);
  const bad = [
    dr && dr.counts.approvedByClient === 0
      ? "not one of " + dr.counts.total + " drawings carries a client approval" : null,
    behind.length ? behind.length + " packages are 25 or more points behind their own window" : null,
    blocked.length ? blocked.length + " packages opening this fortnight cannot start at all" : null,
    pending.length ? pending.length + " packages have nothing on order" : null,
    P && P.totals.promisePassed ? P.totals.promisePassed + " promised delivery dates have passed" : null,
    BL && BL.totals.unbilledDue ? cr(BL.totals.unbilledDue) + " is past its RA date and unraised" : null,
    tradeGap.filter(x => x.want > 0 && x.got === 0).length
      ? tradeGap.filter(x => x.want > 0 && x.got === 0).length +
        " trades were asked for with nobody on them" : null,
    H && (H.flags || []).length ? (H.flags || []).length + " safety flags are open with no dated closure" : null,
    SG && SG.empty ? "not one defect has been raised — an empty register, not a clean floor" : null,
  ].filter(Boolean);
  return { title: "Weekly Report — operations", for: asOf, clientSafe: false,
    kick: "Internal · operations", sub: "SKF India · Pune 7F  ·  " + day(asOf),
    headline: bad.length + " things wrong, *" + good.length + " right*",
    tag: "Internal", hero,
    figures: [
      { big: pr.overall.actual, unit: "%", cap: "BUILT" },
      { big: behind.length, cap: "PACKAGES BEHIND" },
      { big: blocked.length, cap: "CANNOT START" },
      { big: pending.length, cap: "NOTHING ON ORDER" },
    ],
    intro: "Everything the engine holds this week, in detail. The bad list is longer than the " +
      "good list because it is.",
    couldNotSay: [
      "no dated closure exists on this project, so no safety flag can be shown as closed",
      "goods received notes carry no counted quantity, so no delivery can be reconciled",
    ],
    sections: [
    stats([
      statc(pr.overall.actual, "built, by value", "the walk", null, "%"),
      statc(behind.length, "packages behind", "the delay register", "bad"),
      statc(blocked.length, "cannot start", "the look ahead", blocked.length ? "bad" : "ok"),
      statc(pending.length, "nothing on order", "the material register", pending.length ? "bad" : "ok"),
      H ? statc(H.ppe.latest, "PPE in use", "the walk photographs",
        H.ppe.latest < 60 ? "bad" : "ok", "%") : null,
    ]),
    planSec("The floor, position by position", null),
    timelineSec("The programme against the floor", 12, null),
    curveSec("Cash — planned against earned", null),
    cards("What is going wrong", bad.slice(0, 6).map(t => ({ head: t, tone: "dark" })),
      bad.length + " in all.", 2),
    good.length ? cards("What is going right", good.map(t => ({ head: t })), null, 2) : null,
    dr ? specSec("Design and drawings",
      [{ k: "Drawings on the register", v: dr.counts.total },
       { k: "Complete on our side", v: dr.counts.throughInternally },
       { k: "Approved by the client", v: dr.counts.approvedByClient,
         tone: dr.counts.approvedByClient ? "ok" : "bad" },
       { k: "Usable to buy against", v: dr.counts.usable, tone: dr.counts.usable ? "ok" : "bad" },
       { k: "Past their date", v: dr.counts.overdue, tone: dr.counts.overdue ? "bad" : "ok" },
       D ? { k: "Design rows still open", v: D.counts.register - D.counts.settled } : null],
      dr.why) : null,
    P ? specSec("Procurement",
      [{ k: "Orders placed", v: P.totals.pos },
       { k: "Committed", v: cr(P.totals.committed) },
       { k: "Internal cost of the same scope", v: cr(P.totals.bcs) },
       { k: "Heads over budget", v: P.totals.headsOver + " of " + P.heads.length,
         tone: P.totals.headsOver ? "bad" : "ok" },
       { k: "Promised dates gone", v: P.totals.promisePassed, tone: "bad" },
       { k: "Packages with nothing on order", v: pending.length, tone: "bad" }],
      "A lead time that is not declared is unknown, not short.") : null,
    behind.length ? tbl("Execution — furthest behind",
      ["Package", { t: "Built", n: true }, { t: "Window gone", n: true }, "Side"],
      behind.slice(0, 8).map(r => [{ t: r.name, b: true }, { t: r.built, n: true, unit: "%" },
        { t: r.elapsed, n: true, unit: "%", tone: r.gap >= 60 ? "bad" : null },
        { t: r.side, chip: true, tone: r.side === "us" ? "bad" : r.side === "client" ? "warn" : null }]),
      DL.counts.behind + " behind — " + DL.counts.ours + " ours, " + DL.counts.client +
      " client, " + DL.counts.unattributed + " unattributed.") : null,
    tradeGap.length ? duals("Manpower — required against achieved",
      tradeGap.slice(0, 8).map(x => ({ name: x.trade,
        note: x.want ? x.got + " of " + x.want + " asked for" : x.got + " on site, none asked for",
        plan: Math.min(100, x.want * 3), site: Math.min(100, x.got * 3),
        right: (x.gap > 0 ? "+" : "") + x.gap,
        tone: x.want && x.got === 0 ? "rose" : x.gap < 0 ? "sand" : "sage" })),
      "On " + day(mpDay) + ", the latest day attendance exists for.") : null,
    H ? specSec("HSE",
      [{ k: "PPE in use", v: H.ppe.latest, unit: "%", tone: H.ppe.latest < 60 ? "bad" : "ok" },
       { k: "On the first walk", v: H.ppe.first, unit: "%" },
       { k: "Flags open", v: (H.flags || []).length, tone: (H.flags || []).length ? "bad" : "ok" },
       { k: "High severity", v: (H.flags || []).filter(f => f.sev === "high").length, tone: "bad" },
       { k: "Walk days on record", v: H.walkDays }],
      "No dated closure exists, so no flag can be shown as closed.") : null,
    (CF || BL) ? specSec("Cash and billing",
      [CF ? { k: "Contract value", v: cr(CF.totals.contract) } : null,
       CF ? { k: "Earned by the walk", v: cr(CF.totals.earned) } : null,
       BL ? { k: "Raised", v: cr(BL.totals.raised), tone: BL.totals.raised ? null : "bad" } : null,
       BL ? { k: "Certified", v: cr(BL.totals.certified) } : null,
       BL ? { k: "Collected", v: cr(BL.totals.collected) } : null,
       BL ? { k: "Past its RA date, unraised", v: cr(BL.totals.unbilledDue), tone: "bad" } : null],
      "Raised, certified and collected are never added together.") : null,
    blocked.length ? tbl("Cannot start until this is cleared",
      ["Package", "Waiting on"],
      blocked.slice(0, 7).map(r => [{ t: r.name, b: true },
        r.needs.filter(n => !n.ok).map(n => n.kind + ": " + n.what).join("; ")]), null) : null,
    shots("The floor", dprFramesOn(walkDay, 2), null),
  ]};
},

};

// ---- the registry -------------------------------------------------------
// FIVE REPORTS, NOT NINETEEN. A catalogue nobody reads is a catalogue; these
// are the ones that actually leave the project. One daily in two versions,
// one weekly in three: what the client is shown, what management must know,
// and what operations has to work from.
const REPORTS = [
  // ---- daily ----------------------------------------------------------
  { id: "dpr-client", name: "DPR · client", group: "Daily",
    tells: "The day on site: who was on the floor, what moved, what is speeding up",
    who: "SKF", when: "Daily", build: "dprClient", clientSafe: true },
  { id: "dpr-internal", name: "DPR · internal", group: "Daily",
    tells: "Required against achieved by trade, where we are lagging, and the recovery",
    who: "Project team", when: "Daily", build: "dprInternal", clientSafe: false },

  // ---- weekly ---------------------------------------------------------
  { id: "weekly-client", name: "Weekly · external", group: "Weekly",
    tells: "Design, procurement, manpower, execution, good practice and 3D against site",
    who: "SKF", when: "Weekly", build: "weeklyClient", clientSafe: true },
  { id: "weekly-management", name: "Weekly · management", group: "Weekly",
    tells: "The date, the blockers, the escalations and the dependencies, at a high level",
    who: "Leadership", when: "Weekly", build: "weeklyManagement", clientSafe: false },
  { id: "weekly-operations", name: "Weekly · operations", group: "Weekly",
    tells: "Everything the engine holds — design, procurement, execution, HSE, manpower, cash",
    who: "Project team", when: "Weekly", build: "weeklyOperations", clientSafe: false },

];

// WHICH REPORTS CAN BE ASKED FOR ANOTHER DAY. Only the DPR, and only for the
// days that carry both attendance and photographs — a picker that offers a day
// with nothing behind it is a picker that hands somebody an empty report.
const DATED = { dprClient: dprDays, dprInternal: dprDays };

// A SECTION THAT DID NOT APPLY IS NOT A SECTION. The builders return null for
// a block with nothing behind it — a day with no new trade on the floor, a
// project with no contradictions — and the view filters those out. Leaving
// them in the file means every reader has to filter too, and the first one
// that forgets crashes on a null.
const tidy = (c) => { if (!c) return c;
  c.sections = (c.sections || []).filter(Boolean); return c; };

const built = REPORTS.map(r => {
  if (!r.build) return Object.assign({}, r, { status: "locked", content: null });
  let content = null, err = null;
  try { content = tidy(BUILD[r.build]()); } catch (e) { err = String(e.message).slice(0, 160); }
  const days = DATED[r.build] || null;
  // Every offered day is built now rather than on demand, because the app has
  // no way to run a builder — and a day that cannot be built is not offered.
  let byDay = null;
  if (days && days.length) { byDay = {};
    days.forEach(d => { try { const c = tidy(BUILD[r.build](d)); if (c) byDay[d] = c; }
                        catch (e) {} }); }
  return Object.assign({}, r, {
    status: err ? "error" : content ? "live" : "locked",
    error: err,
    unlock: r.unlock || (content ? null : "the inputs this report reads have not been built yet"),
    content,
    days: byDay ? Object.keys(byDay).sort() : null,
    byDay,
  });
});

const out = {
  builtAt: new Date().toISOString(), asOf, walkDay,
  counts: { total: built.length, live: built.filter(r => r.status === "live").length,
    locked: built.filter(r => r.status === "locked").length,
    errored: built.filter(r => r.status === "error").length,
    clientSafe: built.filter(r => r.clientSafe && r.status === "live").length },
  reports: built,
  why: "every figure on every report is read from the file the matching screen reads. A report " +
       "is a view and never a store, so a report and a screen cannot disagree without one of " +
       "them reading the wrong file. Where an input has not landed the report names it instead " +
       "of leaving a heading empty",
};
fs.writeFileSync(path.join(ENGINE, "reports.json"), JSON.stringify(out));

console.log("\n  REPORTS  ·  " + out.counts.live + " live, " + out.counts.locked +
  " locked, " + out.counts.errored + " errored");
built.forEach(r => console.log("    " + (r.status === "live" ? "  " : r.status === "error" ? "!!" : "--") +
  "  " + r.name.padEnd(30) + r.group.padEnd(9) +
  (r.status === "live" ? r.content.sections.length + " sections, " +
     r.content.sections.reduce((t, s) => t + itemsIn(s), 0) + " rows"
   : r.status === "error" ? r.error : (r.unlock || "").slice(0, 60))));
console.log("\n→ engines/skf/reports.json\n");
