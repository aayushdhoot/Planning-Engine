// ===================================================================
// DnB-OS . platform/plan/view_team.js . TEAM AND ALLOCATION
// Phase 2. The screen that puts a name against every line of the plan.
//   . the roster . who is on this project, which side of the house they
//     are on, and who they report to
//   . the allocation . every task with an owner, read live from
//     platform/core/allocation.js, never stored, so it cannot drift from
//     the plan it is meant to describe
//   . your day . what one person actually does on one date, which is the
//     thing Site mode will send to a phone in Phase 6
//
//   install(deps) -> { teamView, wireTeam, assigned }
//
// This view DECIDES NOTHING. Who owns what is the allocation law's call
// and it is recomputed on every paint. A screen that cached an
// assignment would keep showing a person's name after a re-plan handed
// their zone to somebody else.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, PROJ, ALLOC, KIT, CMP, render, saveState, actor } = deps;
  const { fmtS } = KIT;
  const { computePlan, zname } = CMP;

  const roster = () => (state.answers.people || []);

  // the assignment, computed fresh every time it is asked for
  function assigned() {
    const plan = state._plan || computePlan();
    return ALLOC.assign(plan.tasks.filter(t => !t.gate || true), roster());
  }

  const esc = s => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");

function teamView(){
  const R = roster();
  const A = assigned();
  const gate = ALLOC.publishCheck(A);
  const H = ALLOC.heads(R);

  const deptOpts = (sel) => ALLOC.DEPTS.map(d =>
    `<option value="${d}"${d === sel ? " selected" : ""}>${ALLOC.DEPT_LABEL[d]}</option>`).join("");
  const reportOpts = (p) => `<option value="">— nobody, this is the head —</option>` +
    R.filter(x => x.id !== p.id && x.dept === p.dept)
     .map(x => `<option value="${x.id}"${x.reportsTo === x.id ? "" : (p.reportsTo === x.id ? " selected" : "")}>${esc(x.name)}</option>`).join("");

  const rows = R.map(p => `<tr data-p="${p.id}">
    <td><input type="text" data-f="name" value="${esc(p.name)}" style="width:100%"></td>
    <td><select data-f="dept">${deptOpts(p.dept)}</select></td>
    <td><input type="text" data-f="role" value="${esc(p.role || "")}" placeholder="e.g. Site engineer" style="width:100%"></td>
    <td><select data-f="reportsTo">${reportOpts(p)}</select></td>
    <td class="num">${(A.byPerson[p.id] || { tasks: [] }).tasks.length}</td>
    <td style="text-align:center"><input type="checkbox" data-f="active" ${p.active === false ? "" : "checked"}></td>
    <td><span class="linkx" data-rm="${p.id}">remove</span></td></tr>`).join("");

  const deptCards = A.byDept.sort((a, b) => b.n - a.n).map(d => `
    <div class="g">
      <div class="gv num">${d.n}</div>
      <div class="gk">${d.label} · ${d.head ? esc(d.head) : '<b style="color:var(--bad)">no head</b>'}</div>
    </div>`).join("");

  const problems = gate.problems.map(p => `
    <div class="qline"><span class="qo"><b>${esc(p.what)}</b> — ${esc(p.detail)}</span>
    <span class="qd faint">${esc(p.fix)}</span></div>`).join("");

  // one person's day, so the roster is not an abstraction
  const who = state.team && state.team.who ? state.team.who : (R.length ? R[0].id : null);
  const day = (state.team && state.team.day) || (state._plan || computePlan()).projectStart;
  const D = who ? ALLOC.dayList(A, who, day) : { person: null, tasks: [] };
  const dayRows = D.tasks.length
    ? D.tasks.map(t => `<tr><td>${esc(t.name)}</td><td class="faint">${esc(zname(t.zone))}</td>
        <td><span class="kind">${esc(t.deptLabel)}</span></td>
        <td class="num">${fmtS(t.ES)}</td><td class="num">${fmtS(t.EF)}</td></tr>`).join("")
    : `<tr><td colspan="5" class="faint">Nothing live for this person on this day.</td></tr>`;

  return `
  <div class="head"><h1>Team &amp; allocation</h1>
    <p>Who is on this project, and which line of the plan each of them owns. The head of a department
      owns its work; where a head has a team, the team owns the lines and the work splits by zone, so
      one person walks one area rather than chasing scattered rows.</p></div>

  ${gate.ok ? "" : `<div class="panel" style="border-left:3px solid var(--bad)">
    <div class="ph"><div><h3>The plan cannot publish yet</h3>
      <p>Unowned work is not a warning. A programme issued with nobody against a task is exactly what this check exists to stop.</p></div></div>
    <div class="pb">${problems}</div></div>`}

  <div class="panel">
    <div class="ph"><div><h3>Where the work sits</h3><p>Every task in the published plan, by the side of the house that owns it.</p></div>
      <div class="right"><b>${A.allocated}</b> of ${A.total} allocated</div></div>
    <div class="pb"><div class="glance">${deptCards}</div></div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>The roster</h3><p>Leave "reports to" empty for the head of a department. Anyone reporting to a head becomes a co-owner and takes a share of the zones.</p></div>
      <div class="right"><button class="btn ghost mini" id="tmAdd">+ Add person</button></div></div>
    <div class="pb"><table><thead><tr>
      <th style="width:22%">Name</th><th style="width:16%">Department</th><th style="width:20%">Role</th>
      <th style="width:20%">Reports to</th><th class="num">Tasks</th><th style="text-align:center">Active</th><th></th>
    </tr></thead><tbody id="tmBody">${rows || `<tr><td colspan="7" class="faint">Nobody yet. Add the first person, or press Suggest below.</td></tr>`}</tbody></table>
      <div style="margin-top:12px"><span class="linkx" id="tmSuggest">Suggest a starting roster from this project</span>
        <span class="faint" style="margin-left:10px;font-size:12.5px">every suggestion is marked, and you confirm it by editing the name</span></div>
    </div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Your day</h3><p>What one person actually does on one date. This is the list Site mode will send to a phone.</p></div>
      <div class="right flex" style="gap:8px">
        <select id="tmWho">${R.map(p => `<option value="${p.id}"${p.id === who ? " selected" : ""}>${esc(p.name)}</option>`).join("")}</select>
        <input type="date" id="tmDay" value="${day}">
      </div></div>
    <div class="pb"><table><thead><tr><th>Task</th><th>Zone</th><th>Department</th><th class="num">Starts</th><th class="num">Ends</th></tr></thead>
      <tbody>${dayRows}</tbody></table></div>
  </div>`;
}

function wireTeam(){
  const gi = id => document.getElementById(id);
  const save = () => { state._checks = null; saveState(); render(); };
  const setPeople = list => { state.answers.people = list; save(); };

  if (gi("tmAdd")) gi("tmAdd").onclick = () => {
    const R = roster().slice();
    R.push({ id: "u" + (Date.now().toString(36).slice(-5)) + R.length, name: "New person",
      dept: "operations", role: "", reportsTo: "", active: true });
    setPeople(R);
  };

  // A starting roster from what the project already knows. Every row is
  // marked as a suggestion in its role, because a name the engine guessed
  // is not a name anybody agreed to . the same discipline the intake uses.
  if (gi("tmSuggest")) gi("tmSuggest").onclick = () => {
    const seen = {}; roster().forEach(p => seen[String(p.name).toLowerCase()] = 1);
    const cand = [];
    (PROJ.actors || []).forEach(n => cand.push({ name: n, dept: "operations" }));
    if (PROJ.kt && PROJ.kt.team) Object.keys(PROJ.kt.team).forEach(k => {
      const v = PROJ.kt.team[k];
      if (typeof v === "string") cand.push({ name: v, dept: "operations" });
    });
    const R = roster().slice();
    cand.forEach((c, i) => {
      if (!c.name || seen[String(c.name).toLowerCase()]) return;
      seen[String(c.name).toLowerCase()] = 1;
      R.push({ id: "s" + i + Date.now().toString(36).slice(-4), name: c.name, dept: c.dept,
        role: "suggested from the project record, confirm", reportsTo: "", active: true });
    });
    setPeople(R);
  };

  document.querySelectorAll("#tmBody [data-f]").forEach(el => {
    el.onchange = () => {
      const id = el.closest("tr").dataset.p, f = el.dataset.f;
      const R = roster().map(p => {
        if (p.id !== id) return p;
        const v = el.type === "checkbox" ? el.checked : el.value;
        return Object.assign({}, p, f === "active" ? { active: v } : { [f]: v });
      });
      setPeople(R);
    };
  });
  document.querySelectorAll("#tmBody [data-rm]").forEach(el => {
    el.onclick = () => setPeople(roster().filter(p => p.id !== el.dataset.rm));
  });

  if (gi("tmWho")) gi("tmWho").onchange = e => {
    state.team = Object.assign({}, state.team, { who: e.target.value }); render();
  };
  if (gi("tmDay")) gi("tmDay").onchange = e => {
    state.team = Object.assign({}, state.team, { day: e.target.value }); render();
  };
}

  return { teamView, wireTeam, assigned };
}

root.PLAN_VIEW_TEAM = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_VIEW_TEAM;

})(typeof window !== "undefined" ? window : globalThis);
