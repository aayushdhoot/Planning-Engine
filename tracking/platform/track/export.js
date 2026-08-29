// ===================================================================
// DnB-OS . platform/track/export.js . THE EXPORT LAW
// The client deck was 187 hand assembled slides of which about 20
// carried the week. This law prints those 20 from live rows, so nobody
// hand assembles a deck again. Two exports:
//   . the weekly WPR, one action, every section from the same modules
//     the tabs read (compare, snag, program, deps, closeout, walk,
//     render, ledger, shell).
//   . the daily DPR, one page (walk, movement, manpower, open queries,
//     the near slice).
//
// The laws that make it trustworthy:
//   . every section traces to a screen. A number the reader doubts can
//     be opened on the portal at exactly the tab it came from.
//   . a section with no data this week prints one honest line. It never
//     pastes old content to look full. This is the deck's disease and
//     the law kills it.
//   . photo date discipline. A weekly pair shows a photo from inside the
//     report week. If nothing newer exists for a space, the newest older
//     photo may show, marked "last shot on its date", never as if fresh.
//   . one photo per space, so the deck's duplicate slides cannot return.
//   . the only hand typed content allowed is one optional dated PM note.
//
// Pure. No DOM, no fetch, no ledger writes. Every input is passed in, so
// the guards can drive it offline. The template renders the model this
// builds and pulls photo bytes at print time.
// ===================================================================

;(function (root) {

// ---- dates, built from parts so no timezone shifts a day ------------
var DAY = 86400000;
function pad(n) { return String(n).padStart(2, "0"); }
function parse(s) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || "")); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; }
function fmt(d) { return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); }
function addDays(s, n) { var d = parse(s); if (!d) return null; d.setDate(d.getDate() + n); return fmt(d); }
function daysBetween(a, b) { var x = parse(a), y = parse(b); return (x && y) ? Math.round((y - x) / DAY) : null; }
function weekStartMon(s) { var d = parse(s); if (!d) return null; d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return fmt(d); }
var MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function nice(iso) { var d = parse(iso); return d ? d.getDate() + " " + MON[d.getMonth()] + " " + d.getFullYear() : String(iso || ""); }
function niceShort(iso) { var d = parse(iso); return d ? d.getDate() + " " + MON[d.getMonth()] : String(iso || ""); }

// ---- the screen map. Every section names a screen and a deep link. --
// go is the ?go value the portal reads to open that tab. This is the
// only place the traceability targets live, so the labels never drift.
var SRC = {
  compare:     { label: "Compare",  go: "compare" },
  site:        { label: "Site",     go: "site" },
  design:      { label: "Design",   go: "design" },
  procurement: { label: "Procurement", go: "procurement" },
  queries:     { label: "Queries",  go: "queries" },
  today:       { label: "Today",    go: "today" },
  closeout:    { label: "Closeout, behind the gear", go: "admin" }
};
function traceHref(go) { return "?go=" + encodeURIComponent(go); }
function sourceOf(key) { var s = SRC[key] || { label: key, go: "today" }; return { key: key, label: s.label, go: s.go, href: traceHref(s.go) }; }

// ---- the report week ------------------------------------------------
// mode "just_closed" is the standard: issued on a day, it reports the
// Monday to Sunday week that just ended. The others are offered so the
// same law serves a rolling window, the current week, or a picked one.
function reportWeek(mode, runDay, pick) {
  mode = mode || "just_closed";
  var start, end;
  if (mode === "pick" && pick && pick.start && pick.end) { start = pick.start; end = pick.end; }
  else if (mode === "rolling7") { end = runDay; start = addDays(runDay, -6); }
  else if (mode === "current") { start = weekStartMon(runDay); end = addDays(start, 6); }
  else { var thisMon = weekStartMon(runDay); start = addDays(thisMon, -7); end = addDays(thisMon, -1); mode = "just_closed"; }
  return { mode: mode, start: start, end: end, issued: runDay,
    label: niceShort(start) + " to " + nice(end) };
}
function inWeek(day, week) { return !!(day && week && day >= week.start && day <= week.end); }

// project day X of Y at the report date, carried forward from the pack
function dayXofY(pack, runDay) {
  if (!pack) return { day: null, days: null, asOf: null };
  var base = (typeof pack.day === "number") ? pack.day : null;
  var span = (typeof pack.days === "number") ? pack.days : null;
  var day = base;
  if (base != null && pack.asOf) {
    var d = daysBetween(pack.asOf, runDay);
    if (d != null) day = base + d;
  }
  if (day != null && span != null) day = Math.max(0, Math.min(span, day));
  return { day: day, days: span, asOf: pack.asOf || null };
}

// ---- photo date discipline ------------------------------------------
// stale means the photo predates the report week. A stale photo is never
// shown as fresh, it carries the "last shot" mark and this flag.
function photoStale(captureDay, week) { return !!(captureDay && week && captureDay < week.start); }

// ---- moved areas: the render vs actual selector ---------------------
// photoIndex: { pin: { captureDay, file:{ id, name } } } built by the
// template from the walk. touchedSpaces (optional): the spaces the week's
// readings touched, so the section is truly "areas touched this week".
// One photo per space (the newest), in week photos first, capped.
function movedAreas(env) {
  var reg = env.pinsReg || root.TRACK_PINS;
  var week = env.week;
  var cap = env.cap || 10;
  var idx = env.photoIndex || {};
  var RENDER = env.RENDER || root.TRACK_RENDER;
  var touched = env.touchedSpaces ? {} : null;
  if (touched) for (var i = 0; i < env.touchedSpaces.length; i++) touched[env.touchedSpaces[i]] = 1;

  // gather one candidate per pin that has a photo
  var cand = [];
  for (var pinNo in idx) {
    var rec = idx[pinNo];
    if (!rec || !rec.captureDay) continue;                 // no caption without a date, refused
    var no = Number(pinNo);
    var p = reg && reg.pins ? reg.pins.find(function (x) { return x.no === no; }) : null;
    if (!p) continue;                                       // a photo for a pin not in the register is dropped here, the walk law already queried it
    if (touched && !touched[p.space]) continue;            // keep to spaces the week actually touched
    var pair = RENDER && RENDER.pairFor ? RENDER.pairFor(no) : { hasRender: false, checked: false };
    cand.push({ pin: no, space: p.space, captureDay: rec.captureDay,
      stale: photoStale(rec.captureDay, week), fileId: (rec.file && rec.file.id) || null,
      fileName: (rec.file && rec.file.name) || null,
      hasRender: !!pair.hasRender, renderFile: pair.render && pair.render.file ? pair.render.file.name : null,
      renderSrc: pair.render && pair.render.file ? pair.render.file.src : null,
      checked: !!pair.checked, matchDay: pair.match ? pair.match.day : null });
  }

  // one per space: the newest photo wins, in week beats stale
  var bySpace = {};
  for (var c = 0; c < cand.length; c++) {
    var e = cand[c], cur = bySpace[e.space];
    if (!cur) { bySpace[e.space] = e; continue; }
    var better = (e.stale === cur.stale) ? (e.captureDay > cur.captureDay) : (!e.stale && cur.stale);
    if (better) bySpace[e.space] = e;
  }
  var entries = Object.keys(bySpace).map(function (k) { return bySpace[k]; });
  // fresh (in week) first, then named rooms ahead of unnamed passages, then pin order
  var named = function (s) { return s && !/^unnamed|passage/i.test(s) ? 0 : 1; };
  entries.sort(function (a, b) {
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    var na = named(a.space), nb = named(b.space);
    if (na !== nb) return na - nb;
    return a.pin - b.pin;
  });
  var total = entries.length;
  var shown = entries.slice(0, cap);
  var renderCount = RENDER && RENDER.count ? RENDER.count() : 0;
  return { entries: shown, shown: shown.length, total: total, more: Math.max(0, total - shown.length),
    renderCount: renderCount, fresh: shown.filter(function (e) { return !e.stale; }).length };
}

// ---- section emit: the empty section law lives here -----------------
// give it a screen, a title, the data and a builder that says whether the
// data is empty and, if so, the one honest line to print. Nothing else in
// the file decides emptiness, so the law is in one place.
function emit(key, title, screenKey, data, isEmpty, emptyLine) {
  var s = sourceOf(screenKey);
  if (isEmpty) return { key: key, title: title, source: s, empty: true, line: emptyLine, data: null };
  return { key: key, title: title, source: s, empty: false, line: null, data: data };
}

// ledger helpers that tolerate a bare {facts,queries} too
function liveFacts(env) {
  var L = env.ledger; if (!L) return [];
  var f = (L.state ? L.state.facts : L.facts) || [];
  return f.filter(function (x) { return !x.supersededBy; });
}
function allQueries(env) { var L = env.ledger; return (L && (L.state ? L.state.queries : L.queries)) || []; }

// ===================================================================
// THE WEEKLY WPR MODEL
// ===================================================================
function wprModel(env) {
  var runDay = env.runDay;
  var week = env.week || reportWeek(env.weekMode, runDay, env.weekPick);
  var pack = env.comparePack;
  var CMP = env.CMP || root.TRACK_COMPARE;
  var SHELL = env.SHELL || root.TRACK_SHELL;
  var facts = liveFacts(env);
  var queries = allQueries(env);
  var sections = [];

  // 1. time vs work pair (Compare). today = pack.asOf so the numbers
  //    equal the Compare tab exactly, the header carries the report date.
  var tw = null, twEmpty = true;
  if (CMP && SHELL && pack && SHELL.compareCopy) {
    var cc = SHELL.compareCopy(CMP, pack, pack.asOf);
    twEmpty = !(cc && cc.liveRows > 0);
    tw = { timePct: cc.timePct, planMean: cc.planMean, siteMean: cc.siteMean, gap: cc.gap,
      liveRows: cc.liveRows, behind: cc.behind, onOrAhead: cc.onOrAhead, risk: cc.risk, done: cc.done,
      line: cc.timeVsWork, verdict: cc.verdict };
  }
  sections.push(emit("timeWork", "Time against work", "compare", tw, twEmpty,
    "No live packages this week, so there is nothing to compare yet."));

  // 2. package dual bars with chips (Compare)
  var groups = [], gEmpty = true;
  if (CMP && pack && CMP.buildGroups) {
    var bg = CMP.buildGroups(pack, pack.asOf);
    groups = (bg.groups || []).map(function (g) {
      return { label: g.label, planMean: g.planMean, siteMean: g.siteMean,
        rows: g.rows.map(function (x) {
          return { name: x.row.name, plan: x.a.plan, site: x.a.site, chip: x.a.chip, note: x.row.note || null };
        }) };
    }).filter(function (g) { return g.rows.length; });
    gEmpty = !groups.length;
  }
  sections.push(emit("packages", "Every package, plan against site", "compare", { groups: groups }, gEmpty,
    "No package rows carry plan dates yet, so no bars can be drawn."));

  // 3. render vs actual pairs for areas touched this week (Site/walk)
  var ma = movedAreas(env);
  var maEmpty = !(ma.entries && ma.entries.length);
  sections.push(emit("renderActual", "Render against site, areas touched this week", "site",
    { areas: ma.entries, shown: ma.shown, total: ma.total, more: ma.more,
      renderCount: ma.renderCount, fresh: ma.fresh, week: week },
    maEmpty,
    "No site photo lands inside " + week.label + " yet. When the walk shoots this week, the pairs fill here."));

  // 4. snag burn down series (Queries)
  var bd = null, bdEmpty = true;
  if (env.SNAG && env.SNAG.burnDown) {
    var series = env.SNAG.burnDown(queries, runDay);
    bdEmpty = !(series.weeks && series.weeks.length);
    if (!bdEmpty) {
      var last = series.weeks[series.weeks.length - 1];
      bd = { weeks: series.weeks, total: series.total, asOf: series.asOf,
        openNow: last.open, wipNow: last.wip, closedNow: last.closed, pctClosed: last.pctClosed };
    }
  }
  sections.push(emit("burnDown", "Snag burn down", "queries", bd, bdEmpty,
    "No snag raised yet. The burn down starts the day the first defect is logged with a photo."));

  // 5. headcount scoreboard, program against delivered (Site)
  var scb = null, scbEmpty = true;
  if (env.PROG && env.programPack && env.PROG.score) {
    var scored = env.PROG.score(env.programPack, facts);
    scbEmpty = !(scored.rooms && scored.rooms.length);
    if (!scbEmpty) {
      scb = { groups: env.PROG.groups(scored).map(function (g) {
          return { label: g.label, rooms: g.rooms.map(function (r) {
            return { name: r.name, unit: r.unit, required: r.required, achieved: r.achieved,
              deliveredPct: r.deliveredPct, state: r.state }; }) }; }),
        total: scored.total, requiredKnown: scored.requiredKnown, counted: scored.counted, awaiting: scored.awaiting };
    }
  }
  sections.push(emit("headcount", "Room program, required against delivered", "site", scb, scbEmpty,
    "The room program holds no rooms yet."));

  // 6. standing asks with DONE marks (Compare, from the dependency register)
  var asks = null, asksEmpty = true;
  if (env.DEPS && env.depsPack && env.DEPS.register) {
    var reg = env.DEPS.register(env.depsPack, facts, runDay);
    asksEmpty = !(reg.rows && reg.rows.length);
    if (!asksEmpty) {
      asks = { open: reg.open.slice().sort(function (a, b) { return b.aging - a.aging; }).map(function (r) {
          return { ask: r.ask, side: r.side, owner: r.owner, plan: r.plan, aging: r.aging, late: r.late, blocking: r.blocking }; }),
        done: reg.done.map(function (r) { return { ask: r.ask, side: r.side, actual: r.actual }; }),
        openN: reg.openN, doneN: reg.doneN, overdueN: reg.overdueN };
    }
  }
  sections.push(emit("asks", "Standing asks, what others owe the job", "compare", asks, asksEmpty,
    "The standing ask register is empty."));

  // 7. compliance status (Closeout, behind the gear)
  var comp = null, compEmpty = true;
  if (env.CLOSE && env.closeoutPack && env.CLOSE.rollup) {
    var ro = env.CLOSE.rollup(env.closeoutPack, facts);
    var items = (ro.items || []).filter(function (it) { return it.kind === "compliance"; });
    compEmpty = !items.length;
    if (!compEmpty) comp = { items: items.map(function (it) {
      return { text: it.text, done: it.done, doneOn: it.doneOn, note: it.note }; }),
      done: items.filter(function (i) { return i.done; }).length, total: items.length };
  }
  sections.push(emit("compliance", "Statutory and compliance", "closeout", comp, compEmpty,
    "No compliance item is tracked yet."));

  // 8. original against latest layout page, only when the layout changed
  var layouts = (env.layouts || []).filter(function (l) { return inWeek(l.day, week); });
  sections.push(emit("layout", "Layout change this week", "site",
    { revisions: layouts }, !layouts.length,
    "Layout unchanged this week. No new revision registered."));

  // 9. next 7 days (Compare look ahead)
  var look = (pack && pack.week) ? pack.week : [];
  sections.push(emit("next7", "The next 7 days", "compare", { items: look }, !look.length,
    "No look ahead is loaded for the coming week."));

  var dof = dayXofY(pack, runDay);
  var pm = (env.pmNote && String(env.pmNote.text || "").trim())
    ? { text: String(env.pmNote.text).trim(), day: env.pmNote.day || runDay } : null;

  return {
    kind: "WPR",
    meta: { project: (pack && pack.project) || "Project", week: week, issued: runDay,
      day: dof.day, days: dof.days, reading: dof.asOf, pmNote: pm,
      title: ((pack && pack.project) || "Project") + " weekly, " + week.label },
    sections: sections
  };
}

// ===================================================================
// THE DAILY DPR MODEL, one page
// ===================================================================
function manForDay(MAN, pack, day) {
  if (!MAN || !pack || !MAN.series) return null;
  var s = MAN.series(pack).filter(function (r) { return r.shift !== "night" && r.day === day; });
  if (!s.length) return null;
  var r = s[s.length - 1];
  var total = r.reported != null ? r.reported : r.traded;
  var trades = Object.keys(r.trades || {}).length;
  return { day: day, total: total, trades: trades,
    text: total + " on site on " + nice(day) + (trades ? " across " + trades + " trades" : "")
      + (trades ? ", claimed from the DPR" : ", counted on the walk") + ". Safety not logged yet.",
    mismatch: r.mismatch, tag: "claimed" };
}

function dprModel(env) {
  var day = env.dprDay || env.walkDay || env.runDay;
  var pack = env.comparePack;
  var queries = allQueries(env);
  var sections = [];

  // 1. walk summary: shot, blocked, dark
  var ws = env.walkSum || null;
  var wsEmpty = !(ws && typeof ws.total === "number" && ws.total > 0);
  sections.push(emit("walk", "The walk", "today",
    ws ? { shot: ws.shot, blocked: ws.blocked, dark: ws.dark, total: ws.total,
      line: (env.WALK && env.WALK.summaryLine) ? env.WALK.summaryLine(ws) : (ws.shot + " of " + ws.total + " shot") } : null,
    wsEmpty, "No walk logged on " + nice(day) + ". No photos came in."));

  // 2. what moved
  var moved = [], mvEmpty = true, prevDay = null;
  if (env.RDG && env.RDG.movement) {
    var mv = env.RDG.movement(day);
    prevDay = mv.prevDay;
    moved = (mv.moved || []).map(function (m) { return { space: m.space, work: m.work, from: m.from, to: m.to }; });
    mvEmpty = !moved.length;
  }
  sections.push(emit("moved", "What moved", "today", { moved: moved, prevDay: prevDay }, mvEmpty,
    "No tracked movement recorded on " + nice(day) + (prevDay ? " against " + nice(prevDay) : "") + "."));

  // 3. manpower line
  var man = manForDay(env.MAN, env.manpowerPack, day);
  sections.push(emit("manpower", "Manpower", "today", man, !man,
    "No manpower report on " + nice(day) + "."));

  // 4. open queries count
  var openN = 0, overdueN = 0;
  if (env.SHELL && env.SHELL.openQueries) openN = env.SHELL.openQueries(queries).length;
  if (env.SNAG && env.SNAG.summary) { var su = env.SNAG.summary(queries, day); overdueN = su.overduePoints || 0; }
  sections.push(emit("queries", "Open questions", "queries", { open: openN, overdue: overdueN }, false, null));

  // 5. tomorrow's slice: the near look ahead
  var look = (pack && pack.week) ? pack.week.slice(0, 4) : [];
  sections.push(emit("tomorrow", "The slice ahead", "compare", { items: look }, !look.length,
    "No look ahead is loaded."));

  var dof = dayXofY(pack, day);
  var pm = (env.pmNote && String(env.pmNote.text || "").trim())
    ? { text: String(env.pmNote.text).trim(), day: env.pmNote.day || day } : null;

  return {
    kind: "DPR",
    meta: { project: (pack && pack.project) || "Project", day: day, issued: env.runDay || day,
      dayX: dof.day, days: dof.days, pmNote: pm,
      title: ((pack && pack.project) || "Project") + " daily, " + nice(day) },
    sections: sections
  };
}

// the section keys a complete model must carry, so a guard can prove the
// export never silently drops a section the spec asked for.
var WPR_SECTIONS = ["timeWork", "packages", "renderActual", "burnDown", "headcount", "asks", "compliance", "layout", "next7"];
var DPR_SECTIONS = ["walk", "moved", "manpower", "queries", "tomorrow"];

root.TRACK_EXPORT = {
  // date helpers
  parse: parse, fmt: fmt, addDays: addDays, daysBetween: daysBetween, weekStartMon: weekStartMon,
  nice: nice, niceShort: niceShort, MON: MON,
  // laws
  reportWeek: reportWeek, inWeek: inWeek, dayXofY: dayXofY,
  photoStale: photoStale, movedAreas: movedAreas,
  sourceOf: sourceOf, traceHref: traceHref, SRC: SRC,
  // models
  wprModel: wprModel, dprModel: dprModel,
  WPR_SECTIONS: WPR_SECTIONS, DPR_SECTIONS: DPR_SECTIONS
};
if (typeof module !== "undefined") module.exports = root.TRACK_EXPORT;

})(typeof window !== "undefined" ? window : globalThis);
