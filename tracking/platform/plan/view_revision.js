// ===================================================================
// DnB-OS . platform/plan/view_revision.js . WHAT THE SITE DID TO THE PLAN
// Phase 10, the surface. The re-plan law (platform/core/replan.js) turns
// the facts the site filed in Track into actuals, re-solves against them
// and measures the movement off the FROZEN published baseline. This draws
// that: the honest slipped date and the recovery options side by side,
// each with what it buys and what it costs.
//
//   install(deps) -> { revisionPanel, wireRevision }
//
// Mounted at the top of the Progress screen, because that is where a
// planner already goes to see what the site has fed back.
//
// Nothing here decides anything. The engine proposes a revision; a human
// accepts it, and accepting is what writes to the spine.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, PROJ, CAL, TAKT, KIT, CMP, SPINE, RP, render, zoneCaps } = deps;
  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
  const { fmtS } = KIT;
  const { computePlan, computeIntel } = CMP;

  // ---- the spine, read-only here --------------------------------------
  let _client = null;
  function client() {
    if (_client) return _client;
    if (!SPINE) return null;
    try {
      _client = SPINE.createClient({ project: PROJ.id, actor: (state.actor || "planner"),
        store: (function(){ try { return localStorage; } catch(e) { return null; } })(), io: {} });
    } catch (e) { _client = null; }
    return _client;
  }
  // THE SNAPSHOT IS RE-READ EVERY TIME, never cached. The spine client
  // reads the store once when it is created, so a memoised one would show
  // Plan mode the world as it stood when the tab opened . and the facts
  // this whole panel exists for are written by Track, in another frame,
  // minutes later. A cached snapshot here means the loop silently does not
  // close, and nothing on screen says so.
  function snap() {
    let stored = null;
    try { stored = JSON.parse(localStorage.getItem("dnbos-spine:snap:" + PROJ.id) || "null"); }
    catch (e) { stored = null; }
    const c = client();
    if (!c) return stored;
    // anything this tab has queued but not yet flushed still folds on top
    try {
      const q = c.pending();
      return (q && q.length && SPINE) ? SPINE.fold(q, stored || SPINE.emptySnapshot(PROJ.id)) : stored;
    } catch (e) { return stored; }
  }

  // the baseline a revision is measured against is the PUBLISHED plan, not
  // whatever the planner happens to be editing on screen
  // spine LISTS ("plan", "revisions") fold into a plain appended ARRAY.
  // Reading them as {versions:[...]} silently found nothing, and the panel
  // said "nothing published" on a project that had published four times.
  const listOf = (s, k) => { const v = s && s[k]; return Array.isArray(v) ? v : ((v && v.versions) || []); };
  function published() {
    const vs = listOf(snap(), "plan");
    return vs.length ? vs[vs.length - 1] : null;
  }

  // ---- the proposal ----------------------------------------------------
  // Recomputed on render, never stored: a stale revision is worse than none.
  function proposal() {
    if (!RP) return { err: "the re-plan law is not loaded" };
    const base = published();
    if (!base || !base.tasks || !base.tasks.length)
      return { err: "no plan has been published for this project yet, so there is no baseline to measure the site against" };
    const s = snap();
    const status = (s && s.taskStatus) || {};
    if (!Object.keys(status).length)
      return { err: "nobody has filed a task update yet, so the site has not moved the plan" };

    // the SAME inputs the plan itself is solved from, so a revision and the
    // plan can never quietly disagree about what the project is
    const cur = computePlan();
    const tasks = (computeIntel() || {}).tasksQ || null;
    const cal = state.cal;
    const today = (state.today || new Date().toISOString().slice(0, 10));
    const caps = (typeof zoneCaps === "function" ? zoneCaps() : zoneCaps) || {};
    const bopts = { start: state.win && state.win.intStart, zoneCaps: caps,
      fronts: (cur && cur.fronts) || 4,
      conditions: (state.answers && state.answers.conditions) || null, today };
    const solve = tasks ? (o => TAKT.level(tasks, cal, Object.assign({}, bopts, o))) : null;

    const act = RP.actuals(status, { plan: base });
    // THE SITE'S FACTS COME FIRST. takt takes the first pin that matches, and
    // the planner's own recorded progress is older and second-hand next to a
    // report filed by the person holding the tool.
    const pins = act.pins.concat((state.answers && state.answers.progress) || []);
    const current = solve ? solve({ pins, holds: act.holds }) : null;
    if (!current) return { err: "the plan could not be re-solved against the site facts" };

    return RP.propose({ original: base, current, status, cal,
      base: Object.assign({}, bopts, { pins: (state.answers && state.answers.progress) || [] }),
      solve, tasks,
      committedEnd: state.win && state.win.extEnd,
      kt: PROJ.kt, heads: heads(), today });
  }

  // What a payment gate is WORTH comes from this project's own priced BOQ,
  // by package. The tracking engine's PO register is a different book (what
  // has been committed to vendors, not what was sold), and mixing the two
  // would price a client payment off our own purchase orders.
  function heads() {
    const B = deps.BOQ || root.PROJECT_BOQ || null;
    if (!B) return null;
    if (B.packages) return Object.keys(B.packages).map(k => ({ head: k, bcs: B.packages[k] }));
    const by = {};
    for (const l of (B.lines || [])) by[l.pkg] = (by[l.pkg] || 0) + (typeof l.amount === "number" ? l.amount : 0);
    return Object.keys(by).map(k => ({ head: k, bcs: by[k] }));
  }

  const CAUSE_CHIP = { client: "client", free_issue: "free-issue",
    statutory: "statutory", ours: "ours" };
  const money = v => v == null ? "—" : "₹" + (v / 100000).toFixed(1) + "L";

  // ---- the panel --------------------------------------------------------
  function revisionPanel() {
    const p = proposal();
    if (p.err) return `<div class="panel"><div class="ph"><div><h3>What the site did to the plan</h3>
      <p>Site facts, re-solved against the published baseline.</p></div></div>
      <div class="pb"><div class="empt">${esc(p.err)}.</div></div></div>`;

    const accepted = acceptedRevision(p);
    const dirCls = p.slip > 0 ? "late" : p.slip < 0 ? "early" : "flat";

    // the two dates, side by side with the committed one
    const dates = `<div class="revdates">
      <div><span class="rl">Plan on record</span><b>${esc(fmtS(p.from))}</b></div>
      <div class="arrow">→</div>
      <div><span class="rl">With the site facts</span><b class="${dirCls}">${esc(fmtS(p.to))}</b>
        ${p.slip ? `<span class="rd ${dirCls}">${p.slip > 0 ? "+" : ""}${p.slip} working days</span>` : ""}</div>
      ${state.win && state.win.extEnd ? `<div class="cm"><span class="rl">Committed</span><b>${esc(fmtS(state.win.extEnd))}</b></div>` : ""}
    </div>`;

    // direct slips carry a cause; knock-ons explicitly do not
    const lateRows = p.late.slice(0, 8).map(m => `<tr>
      <td>${esc(m.name)}<div class="faint" style="font-size:11px">${esc(m.zone)}</div></td>
      <td class="num">+${m.days}</td>
      <td>${m.cause ? `<span class="chip ${esc(m.cause)}">${esc(CAUSE_CHIP[m.cause])}</span>`
        : `<span class="chip none">no claim</span>`}
        <div class="faint" style="font-size:11px;margin-top:2px">${esc(m.causeWhy)}</div></td></tr>`).join("");

    const causeTally = Object.keys(p.causes).sort().map(k =>
      `<span class="chip ${esc(k === "unestablished" ? "none" : k)}">${esc(k === "unestablished" ? "no claim" : CAUSE_CHIP[k])} ${p.causes[k]}</span>`).join(" ");

    // the payment gates . the number the business actually feels
    const raRows = (p.ra.rows || []).map(r => `<tr>
      <td><b>${esc(r.ra)}</b> <span class="faint">${esc(r.pay)}</span></td>
      <td class="faint">${esc(r.gate || "")}</td>
      <td>${r.was ? esc(fmtS(r.was)) : "—"}</td>
      <td>${r.now ? esc(fmtS(r.now)) : "—"}</td>
      <td class="num ${r.days > 0 ? "late" : ""}">${r.days == null ? "—" : (r.days > 0 ? "+" + r.days : r.days === 0 ? "on time" : r.days)}</td>
      <td class="num">${money(r.value)}</td></tr>`).join("");

    // the options, side by side. THE HONESTY LAW lives in the verdict line.
    const optCards = (p.options.rows || []).map(o => `<div class="optc ${o.recovers ? "ok" : ""}">
      <div class="on">${esc(o.name)}</div>
      <div class="oe">${o.end ? esc(fmtS(o.end)) : "—"}</div>
      <div class="ob">${o.buys == null ? "—" : (o.buys > 0 ? "buys back " + o.buys + " working day" + (o.buys === 1 ? "" : "s") : "buys back nothing")}</div>
      <div class="oc">${esc(o.cost && o.cost.say || "")}</div>
      ${o.recovers ? `<div class="ok2">gets back inside the committed date</div>` : ""}
    </div>`).join("");

    // everything the engine REFUSED to turn into a date
    const asks = (p.actuals.refused || []).slice(0, 6).map(r => `<div class="askrow">
      <div><b>${esc(r.name || r.id)}</b>${r.zone ? ` <span class="faint">${esc(r.zone)}</span>` : ""}
        <div class="faint" style="font-size:11.5px">${esc(r.why)}</div></div>
      ${r.ask ? `<div class="askq">${esc(r.ask)}</div>` : ""}</div>`).join("");

    const contest = (p.contested || []).slice(0, 4).map(c =>
      `<div class="askrow"><div class="faint" style="font-size:11.5px">${esc(c.question)}</div></div>`).join("");

    return `<div class="panel"><div class="ph"><div><h3>What the site did to the plan</h3>
      <p>${esc(p.line)}</p></div>
      <div class="right">${accepted ? `<span class="badge appr"><span class="d"></span>revision ${esc(String(accepted.v))} accepted</span>`
        : `<button class="btn" id="btnAcceptRev">Accept this revision</button>`}</div></div>
      <div class="pb">
        ${dates}

        <div class="rsec">Payment gates${p.ra.floor ? ` <span class="faint">· ${esc(p.ra.note)}</span>` : ""}</div>
        <table><thead><tr><th>Stage</th><th>Gate</th><th>Was</th><th>Now</th><th class="num">Move</th><th class="num">Worth</th></tr></thead>
          <tbody>${raRows || `<tr><td colspan="6" class="faint">No payment gates are declared for this project.</td></tr>`}</tbody></table>

        <div class="rsec">Recovery — measured by re-solving, not estimated</div>
        <div class="optrow">${optCards}</div>
        <p class="verdict ${p.options.recovers ? "ok" : "bad"}">${esc(p.options.verdict)}</p>

        <div class="rsec">What slipped, and whose it is
          ${causeTally ? `<span style="float:right;font-weight:400">${causeTally}</span>` : ""}</div>
        <table><thead><tr><th style="width:40%">Task</th><th class="num">Days</th><th>Cause</th></tr></thead>
          <tbody>${lateRows || `<tr><td colspan="3" class="faint">No reported task moved later.</td></tr>`}</tbody></table>
        ${p.knockOn.length ? `<p class="faint" style="font-size:12px;margin:8px 0 0">
          ${p.knockOn.length} further task${p.knockOn.length === 1 ? "" : "s"} moved as the gangs re-packed around those facts.
          ${p.knockOn.filter(k => k.hadRefusedReport).length
            ? p.knockOn.filter(k => k.hadRefusedReport).length + " of them had a report the engine could not use, so none of their days carry a cause."
            : "They carry no cause of their own — a knock-on day is claimed through the fact that caused it, never a second time."}</p>` : ""}

        ${asks ? `<div class="rsec">The engine will not guess these</div>${asks}` : ""}
        ${contest ? `<div class="rsec">A read disagrees with a person</div>${contest}` : ""}
      </div></div>`;
  }

  // has this exact proposal already been accepted?
  function acceptedRevision(p) {
    const list = listOf(snap(), "revisions");
    for (let i = list.length - 1; i >= 0; i--) {
      const r = list[i];
      if (r && r.to === p.to && r.from === p.from) return r;
    }
    return null;
  }

  function wireRevision() {
    const b = document.getElementById("btnAcceptRev");
    if (!b) return;
    b.onclick = () => {
      const p = proposal();
      if (p.err) return;
      const why = prompt("Why are the dates moving? This goes on the version record and is what an EOT or a claim is argued from later.");
      const w = String(why || "").trim();
      // same test the publish gate uses: a record that says "dates revised"
      // says nothing, and it is the record somebody argues a claim from.
      if (w.length < 12 || /^(the\s+)?(dates?\s*)?(are\s+)?(revised|revision|updated|changed|moved|slipped|re-?plan(ned)?)\.?$/i.test(w))
        return alert("Say why the dates are moving, in a sentence.");
      if (!SPINE) return alert("The spine is not reachable, so this revision cannot be recorded.");
      // Folded straight into the snapshot, the same way Track records an
      // answered action. A second write path through the client queue would
      // mint a second event id for the same decision, and the two would both
      // survive dedupe . one revision recorded twice.
      const key = "dnbos-spine:snap:" + PROJ.id;
      const base = snap() || SPINE.emptySnapshot(PROJ.id);
      const ev = SPINE.makeEvent("revision.record", null, {
        v: listOf(snap(), "revisions").length + 1,
        from: p.from, to: p.to, slip: p.slip, why: w,
        causes: p.causes, day: p.day,
        ra: (p.ra.rows || []).map(r => ({ ra: r.ra, was: r.was, now: r.now, days: r.days, value: r.value })),
        options: (p.options.rows || []).map(o => ({ id: o.id, end: o.end, buys: o.buys, recovers: o.recovers })),
        recovers: p.options.recovers,
        late: p.late.map(m => ({ id: m.id, name: m.name, zone: m.zone, days: m.days, cause: m.cause })),
        knockOn: p.knockOn.length,
      }, { actor: (state.actor || "planner"), project: PROJ.id, source: "replan.accept" });
      try { localStorage.setItem(key, JSON.stringify(SPINE.fold([ev], base))); }
      catch (e) { return alert("The revision could not be written to the spine."); }
      render();
    };
  }

  return { revisionPanel, wireRevision, _proposal: proposal };
}

root.PLAN_VIEW_REVISION = { install };
if (typeof module !== "undefined" && module.exports) module.exports = { install };

})(typeof window !== "undefined" ? window : globalThis);
