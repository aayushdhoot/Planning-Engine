// ===================================================================
// DnB-OS . platform/plan/view_plan.js . THE PLAN VIEW
// Phase 0b, tranche 3. The published plan: the header and its levers,
// the client transform, and the two ways the programme is drawn . a
// grouped collapsible table and a gantt. This is the largest single
// view surface in the engine and the one with the most sub modes, so
// the baseline drives ten of them (table and gantt x category, sub,
// activity, item x category, zone and phase grouping x internal and
// client x critical only).
//
//   install(deps) -> { planView, clientPlan, clientView, planTable, planGantt }
//
// Re-installed on every project switch for the same reason the compute
// layer is: activateProject reassigns PROJ, and a closure that captured
// it once would draw the previous project's programme without ever
// looking broken.
//
// Bodies are moved VERBATIM . the block was lifted out of the template
// by script rather than retyped, so there is no transcription risk and
// the diff carries no behaviour change to review.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, PROJ, CAL, DUR, SEQ, TAKT, KIT, CMP,
          vLabel, vLabelLong, lookaheadView, scopedBox } = deps;
  const { fmt, fmtS, colorFor, dd, daysBetween, tname, weekStarts, MN, DIM,
          ringChart, stackBar, leadTimeline } = KIT;
  const { planTree, planGroups, computePlan, computeIntel, computeChecks,
          longLeads, zname, unitOf, tgtName, phaseWindows, planFor, catOf } = CMP;

function planView(){
  const vs=state.pub.versions;
  const viewing=state.pub.viewing?vs.find(v=>v.v===state.pub.viewing):null;
  const plan=viewing&&viewing.snap?planFor(viewing):computePlan();
  if(!viewing)state._plan=plan;
  if(state.pub.mode==="client")return clientView(plan,viewing);
  const p=state.plan, target=state.win.intEnd||state.win.extEnd,
        over=daysBetween(target,plan.projectEnd), overClient=daysBetween(state.win.extEnd,plan.projectEnd);
  const base=vs[0];
  const baseDelta=base?daysBetween(base.projectEnd,plan.projectEnd):null;
  const verSel=`<span class="seg" id="verSel"><button class="acc ${!viewing?'on':''}" data-v="0">Current</button>${vs.slice().reverse().map(v=>`<button class="acc ${viewing&&viewing.v===v.v?'on':''}" data-v="${v.v}">${vLabel(v)}</button>`).join("")}</span>`;
  const intLbl=state.win.intEnd?"internal":"external";
  const fitChip = over>0
    ? `<span class="warnchip verdict">▲ Finishes <b>${fmtS(plan.projectEnd)}</b> — <b>${dd(over)} past</b> ${intLbl} ${fmtS(target)}${state.win.intEnd?` · external ${fmtS(state.win.extEnd)} ${overClient>0?dd(overClient)+" late":dd(overClient)+" clear"}`:""}</span>`
    : `<span class="okchip verdict">✓ Finishes <b>${fmtS(plan.projectEnd)}</b> — <b>${-over===0?"on":dd(over)+" before"}</b> ${intLbl} ${fmtS(target)}${state.win.intEnd?` · external buffer ${dd(overClient)}`:""}</span>`;
  return `
  <div class="head" style="margin-bottom:16px"><h1>${viewing?`Plan — ${vLabelLong(viewing)}`:"The plan — every task, dated"}</h1>
    <p>${viewing?`Published ${fmtS(viewing.ts.slice(0,10))} by ${viewing.who} · read-only. ${viewing.v===1?"The Original plan — contract dates, frozen for claims and EOT.":"A revision against the Original."}`:"Quantities × published rates × sequence × your working calendar. "+plan.fronts+" working fronts, engine-set — the smallest crew that hits the "+tgtName()+" date."+((state.answers.shellHold!=null?state.answers.shellHold:PROJ.shellHold)?" Site rule: nothing starts until the shell is cleared — say \"trades can follow demolition\" to overlap.":"")}</p></div>

${scopedBox("plan")}
    <div class="planctl" style="margin-bottom:14px">
    <span class="seg"><button class="acc on">Internal</button><button class="acc" id="toClient">Client</button></span>
    ${verSel}
    ${viewing?`<button class="btn ghost mini" id="backCur">Back to current</button>`:`<button class="btn ghost mini" id="btnRevise">${state.pub.revising?"Cancel revision":"Revise dates"}</button>`}
    <button class="btn ghost mini" id="expXls">Export Excel ↓</button>
    <button class="btn ghost mini" id="expPdf">Export PDF ↓</button>
    ${vs.length&&!viewing?`<span class="hint">Original plan · ${fmtS(base.projectEnd)} · contract ${fmtS(base.snap&&base.snap.win?base.snap.win.extStart:state.win.extStart)} → ${fmtS(base.snap&&base.snap.win?base.snap.win.extEnd:state.win.extEnd)}${baseDelta?` · current <b class="${baseDelta>0?'critmark':''}">${baseDelta>0?"+":""}${baseDelta} days</b> vs original`:" · on the original"}</span>`:!vs.length?`<span class="hint">not yet published — the first publish freezes the ORIGINAL plan with the contract dates; everything after is a revision</span>`:""}
  </div>

  ${state.pub.revising&&!viewing?`
  <div class="panel" style="border-color:#e8c9a8">
    <div class="ph"><div><h3>Revise the plan — pin new dates, the engine re-solves</h3><p>The Original stays frozen for claims; the revision runs the job. All versions stay available above.</p></div></div>
    <div class="pb"><div class="flex wrap" style="gap:12px">
      <div class="fld"><label>Internal start</label><input type="date" id="revIS" value="${state.win.intStart}"></div>
      <div class="fld"><label>Internal deadline</label><input type="date" id="revIE" value="${state.win.intEnd||state.win.extEnd}"></div>
      <div class="fld"><label>External start</label><input type="date" id="revES" value="${state.win.extStart}"></div>
      <div class="fld"><label>External end</label><input type="date" id="revEE" value="${state.win.extEnd}"></div>
      <div class="fld" style="flex:1;min-width:200px"><label>Why · required</label><input type="text" id="revWhy" placeholder="e.g. site handover slipped 8 days" required></div>
      <button class="btn pri mini" id="revGo" style="align-self:flex-end">Re-plan</button>
    </div></div>
  </div>`:""}

  ${state.pub.gate?`
  <div class="panel" style="border-color:${state.pub.gate.blocked?"var(--shut-ink)":"#e8c9a8"}">
    <div class="ph"><div><h3>${state.pub.gate.blocked?"Publish blocked — the plan failed hard checks":"Before you publish — "+state.pub.gate.result.summary.warn+" warnings on record"}</h3>
      <p>${state.pub.gate.result.summary.pass} of ${state.pub.gate.result.summary.total} checks pass. ${state.pub.gate.blocked?"Fix the failures below; the engine will not publish physics violations.":"Acknowledging means these ship with your name on them."}</p></div></div>
    <div class="pb">
      ${state.pub.gate.result.checks.filter(c=>c.status!=="pass").map(c=>`<div class="qline">
        <span style="flex:none;width:14px;font-size:12px">${c.status==="warn"?"⚠":"✕"}</span>
        <span class="qt" style="width:250px">${c.name}</span><span class="qd">${c.detail}</span><span class="qdue faint">${c.id}</span></div>`).join("")}
      <div style="margin-top:14px">
        ${state.pub.gate.blocked?"":`<button class="btn pri mini" id="pubAck">Acknowledge & publish</button>`}
        <button class="btn ghost mini" id="pubCancel">Cancel</button>
        <span class="faint" style="font-size:11.5px;margin-left:8px">full layer board on Intelligence & testing</span>
      </div>
    </div>
  </div>`:""}

  <div class="glance">
    ${(()=>{const wE=plan.tasks.filter(t=>!t.gate&&t.code!=="fire_noc").map(t=>t.EF).sort().pop()||plan.projectEnd;
      return wE!==plan.projectEnd
        ?`<div class="g lead"><div class="gv num dt">${fmtS(wE)}</div><div class="gk">works complete · statutory window to ${fmtS(plan.projectEnd)} · ${plan.fronts} fronts</div></div>`
        :`<div class="g lead"><div class="gv num dt">${fmtS(plan.projectEnd)}</div><div class="gk">finish · from ${fmtS(plan.projectStart)} · ${plan.fronts} fronts (engine-set)</div></div>`;})()}
    <div class="g"><div class="gv num">${plan.workingDays}</div><div class="gk">working days · ${plan.calendarDays} on paper</div></div>
    <div class="g"><div class="gv num">${plan.peakWorkers}</div><div class="gk">workers on the busiest day</div></div>
    <div class="g"><div class="gv num">${plan.tasks.length-plan.gates.length}<small> +${plan.gates.length} holds</small></div><div class="gk">tasks · ${PROJ.zones.length} zones</div></div>
  </div>

  ${(()=>{
    if(!state.answers.deadlineLock)return"";
    const STAT=["fire_noc"];
    const worksEnd=plan.tasks.filter(t=>!t.gate&&!STAT.includes(t.code)).map(t=>t.EF).sort().pop()||plan.projectEnd;
    const gap=daysBetween(state.win.extEnd,worksEnd);
    if(gap<=0)return`<div class="planctl"><span class="okchip verdict">🔒 DEADLINE LOCKED — holding. Works end <b>${fmtS(worksEnd)}</b>, <b>${-gap} days inside</b> the committed ${fmtS(state.win.extEnd)}.</span></div>`;
    // levers, measured by real engine runs (memoized alongside the plan)
    const M=state._memo;
    const bestRow=(M.rows||[]).slice().sort((a2,b2)=>a2.projectEnd<b2.projectEnd?-1:1)[0];
    if(!M.preRows){const keep=SEQ.OPTS.preOrder;SEQ.OPTS.preOrder={all:true};
      const I2=computeIntel();M.preRows=TAKT.sweep(I2.tasksQ,state.cal,{start:state.win.intStart,zoneCaps,max:12,pins:state.answers.progress||[]});
      SEQ.OPTS.preOrder=keep;state._intel=null;}
    const bestPre=(M.preRows||[]).slice().sort((a2,b2)=>a2.projectEnd<b2.projectEnd?-1:1)[0];
    const today=new Date().toISOString().slice(0,10);
    const staleEnab=plan.tasks.filter(t=>!t.gate&&(String(t.id).startsWith("pkg:")||String(t.id).startsWith("dwg:"))&&!t.done&&!t.started&&t.ES<today).length;
    const preOn=!!(state.answers.preOrder&&(state.answers.preOrder.all));
    return`<div class="panel" style="border-left:3px solid #c4483a"><div class="ph"><div><h3 style="font-size:17.5px">🔒 DEADLINE LOCKED — path to ${fmtS(state.win.extEnd)} <span style="color:#c4483a">(currently +${gap} days over)</span></h3>
      <p>The committed date is immovable. These levers are measured by real engine runs, in order of power:</p></div></div>
      <div class="pb" style="padding-top:6px"><table><thead><tr><th style="width:46%">Lever</th><th>Gets works to</th><th>How</th></tr></thead><tbody>
      <tr><td><b>1 · Record reality</b> — ${staleEnab} design/procurement tasks are past their planned start with NO fact recorded. The engine is re-planning work that has already happened.</td><td class="num">largest single recovery</td><td>"electrical drawings approved" · "joinery po done" · "demolition done"</td></tr>
      ${!preOn&&bestPre?`<tr><td><b>2 · Pre-order on approved typicals</b> — POs award off design; client approval gates delivery only.</td><td class="num"><b>${fmtS(bestPre.projectEnd)}</b> @ ${bestPre.fronts}F</td><td>say "pre-order everything"</td></tr>`:""}
      ${bestRow?`<tr><td><b>${preOn?2:3} · Crew to the deadline</b> — engine sweep under current settings.</td><td class="num">${fmtS(bestRow.projectEnd)} @ ${bestRow.fronts}F</td><td>say "use ${bestRow.fronts} fronts"</td></tr>`:""}
      <tr><td><b>${preOn?3:4} · Contract levers</b> — Kohler Cl.10 permits night work; approval SLA unconfirmed; FS V5 BOQ unread.</td><td class="num">manual</td><td>"approvals take N days" · drop BOQ + "refresh" · night-shift decision with Ops</td></tr>
      </tbody></table>
      <p class="muted" style="margin-top:8px">The publish gate stays shut while works end past ${fmtS(state.win.extEnd)} — a locked deadline cannot be published as breached.</p></div></div>`;
  })()}
  <div class="planctl">${fitChip}${!viewing&&plan.rec&&!plan.rec.hits?`<span class="warnchip">▲ no crew size hits the internal deadline — accept the slip or change dates/scope</span>`:""}${(state.answers.zonesOff||[]).length?`<span class="kind" title="removed by your instruction">scope excludes: ${state.answers.zonesOff.map(zname).join(", ")} <span class="linkx" id="zRestore">restore</span></span>`:""}</div>

  <div class="planctl">
    <div class="fld"><label>Group by</label><span class="seg" id="pGrp">
      <button class="acc ${p.groupBy==='cat'?'on':''}" data-g="cat">Category</button>
      <button class="acc ${p.groupBy==='zone'?'on':''}" data-g="zone">Zone</button>
      <button class="acc ${p.groupBy==='dept'?'on':''}" data-g="dept">Department</button>
      <button class="acc ${p.groupBy==='person'?'on':''}" data-g="person">Person</button>${PROJ.kt&&PROJ.kt.raGates?`
      <button class="acc ${p.groupBy==='phase'?'on':''}" data-g="phase">Phase</button>`:""}</span></div>
    <div class="fld"><label>Detail</label><span class="seg" id="pLvl">
      <button class="acc ${p.level==='cat'?'on':''}" data-l="cat">${p.groupBy==='zone'?'Zone':p.groupBy==='phase'?'Phase':'Category'}</button>
      <button class="acc ${p.level==='sub'?'on':''}" data-l="sub">Sub-category</button>
      <button class="acc ${p.level==='act'?'on':''}" data-l="act">Activity</button>
      <button class="acc ${p.level==='item'?'on':''}" data-l="item">Every item</button></span></div>
    <div class="fld"><label>View</label><span class="seg" id="pMode">
      <button class="acc ${p.mode==='table'?'on':''}" data-m="table">Table</button>
      <button class="acc ${p.mode==='gantt'?'on':''}" data-m="gantt">Gantt</button>
      <button class="acc ${p.mode==='look'?'on':''}" data-m="look">Look-ahead</button></span></div>
    <div class="fld"><label>Show</label><span class="seg" id="pCrit">
      <button class="acc ${!p.critOnly?'on':''}" data-c="0">Everything</button>
      <button class="acc ${p.critOnly?'on':''}" data-c="1">Critical chain</button></span></div>
  </div>

  ${p.mode==="table"?planTable(plan,false):p.mode==="look"?lookaheadView(plan):planGantt(plan,false)}

  ${vs.length&&!viewing?`
  <div class="panel">
    <div class="ph"><div><h3>Original plan &amp; revisions</h3><p>The Original carries the contract dates and never changes. Every later publish is a revision measured against it.</p></div></div>
    <div class="pb" style="padding-top:6px"><table><thead><tr><th style="width:90px">Plan</th><th style="width:110px">Published</th><th style="width:90px">By</th><th style="width:110px">Finish</th><th style="width:130px">Tests</th><th>Why</th></tr></thead>
    <tbody>${vs.slice().reverse().map(v=>`<tr><td><b>${vLabelLong(v)}</b>${v.v===1?' <span class="kind">contract dates</span>':''}</td><td class="num">${fmtS(v.ts.slice(0,10))}</td><td>${v.who}</td><td class="num"><b>${fmtS(v.projectEnd)}</b></td><td class="num">${v.tests?`${v.tests.pass}✓${v.tests.warn?` ${v.tests.warn}⚠${v.tests.ack?" ack":""}`:""}`:'<span class="faint">pre-harness</span>'}</td><td class="muted">${v.reason||"—"}</td></tr>`).join("")}</tbody></table></div>
  </div>`:""}`;
}

// Client programme = the internal plan stretched onto the committed window.
// Anchored at the real start (they watch the site daily); buffer accumulates
// linearly toward the committed completion — under-commit, over-deliver.
// If the internal plan already breaches the commitment, NO stretch (never
// show the client better than the truth; the gate blocks that publish anyway).
function clientPlan(plan){
  // THE CLIENT TRANSFORM — commitments, never forecasts. Three laws:
  // 1. ORIGIN: span and window measure from the SAME anchor S (later of
  //    contractual commencement and real start). The old span measured
  //    from projectStart — an early internal start faked a breach, hit
  //    the passthrough, and shipped raw internal dates to the client.
  // 2. STATUTORY codes translate, never scale — an authority's 30-day
  //    window must not become 40 because we stretched the programme.
  // 3. NOTHING internal survives: durWD recomputed from mapped dates
  //    (no buffer derivable), float/confidence/crew/drivers stripped.
  const STAT=["fire_noc"];
  // CLIENT CONTENT LAW (his call, 13 Jul): internal shows EVERYTHING;
  // the client sees commitments — site work, GFC issues, THEIR approvals,
  // and KEY procurement milestones only. Vendor mechanics (submittals,
  // manufacture, minor awards) are ours to manage, not theirs to watch.
  // KEY package = long-lead (>=5wk) OR its chain touches the critical path.
  const keyPkg={};
  (SEQ.PACKAGES||[]).forEach(pk=>{
    const crit=plan.tasks.some(t=>!t.gate&&t.critical&&(pk.codes.includes(t.code)||t.id==="pkg:"+pk.id+":delivery"));
    if((pk.lead||0)>=5||crit)keyPkg[pk.id]=pk;
  });
  const pkgOf=id=>{const m=String(id).match(/^pkg:([^:]+):(\w+)$/);return m?{pid:m[1],stage:m[2]}:null;};
  const clientKeeps=t=>{
    const pm=pkgOf(t.id);
    if(!pm)return true;                       // site work + drawings + gates stay
    if(pm.stage==="approval")return true;      // always their court
    if(!keyPkg[pm.pid])return false;           // minor package: whole chain hidden
    return pm.stage==="po"||pm.stage==="delivery"; // key package: two milestones
  };
  const clientName=t=>{
    const pm=pkgOf(t.id);if(!pm||!keyPkg[pm.pid])return t.name;
    const nm=keyPkg[pm.pid].name;
    return pm.stage==="po"?"Order placed — "+nm:pm.stage==="delivery"?"Material at site — "+nm:t.name;
  };
  const S=plan.projectStart>state.win.extStart?plan.projectStart:state.win.extStart, E=state.win.extEnd;
  const real=plan.tasks.filter(t=>!t.gate&&!STAT.includes(t.code));
  const wEnd=real.map(t=>t.EF).sort().pop()||plan.projectEnd;
  const span=daysBetween(S,wEnd);
  const window=daysBetween(S,E);
  // breach (or nothing to stretch): translate only, k=1 — the clamp still
  // applies and the overrun stays visible; the publish gate blocks it
  const k=(span<=0||window<=span)?1:window/span;
  const map=iso=>{const off=Math.max(0,daysBetween(S,iso));return CAL._iso(CAL._add(CAL._d(S),Math.round(off*k)));};
  const wdOf=(es,ef)=>CAL.workingDaysBetween(es,CAL._iso(CAL._add(CAL._d(ef),1)),state.cal);
  const tasks=plan.tasks.filter(clientKeeps).map(t=>{
    const ES=map(t.ES);
    const EF=STAT.includes(t.code)?CAL._iso(CAL._add(CAL._d(ES),daysBetween(t.ES,t.EF))):map(t.EF);
    const c=Object.assign({},t,{ES,EF,name:clientName(t),durWD:t.gate?0:wdOf(ES,EF)});
    delete c.floatWD;delete c.conf;delete c.drivers;delete c.critical;
    delete c.gangNo;delete c.leadWeeks;delete c.boundBy;
    return c;
  });
  const pEnd=tasks.map(t=>t.EF).sort().pop()||map(plan.projectEnd);
  return Object.assign({},plan,{tasks,projectStart:S,projectEnd:pEnd,
    workingDays:wdOf(S,pEnd),calendarDays:daysBetween(S,pEnd)+1,clientStretch:k});
}
function clientView(plan,viewing){
  plan=clientPlan(plan);
  const contingency=Math.max(0,daysBetween(plan.projectEnd,state.win.extEnd));
  const p=state.plan;
  return `
  <div class="head" style="margin-bottom:16px"><h1>Project programme — ${PROJ.name.replace(/·/g,"—")}</h1>
    <p>The committed programme${viewing?` · version ${viewing.v}`:""}. Milestone dates and the working schedule, on the agreed site calendar.</p></div>
  <div class="planctl" style="margin-bottom:14px">
    <span class="seg"><button class="acc" id="toInternal">Internal</button><button class="acc on">Client</button></span>
    <button class="btn ghost mini" id="expXls">Export Excel ↓</button>
    <button class="btn ghost mini" id="expPdf">Export PDF ↓</button>
    <span class="hint">clean committed view — no internals, confidence or crew detail</span>
  </div>
  <div class="glance">
    <div class="g lead"><div class="gv num dt">${fmtS(state.win.extEnd)}</div><div class="gk">committed completion</div></div>
    <div class="g"><div class="gv num" style="font-size:24px;letter-spacing:-.5px">${fmtS(state.win.extStart)}</div><div class="gk">commencement (contract)</div></div>
    <div class="g"><div class="gv num">${plan.tasks.length-plan.gates.length}</div><div class="gk">planned activities · ${PROJ.zones.length} zones</div></div>
    <div class="g">${(()=>{const W=typeof phaseWindows==="function"?phaseWindows():null;const today=new Date().toISOString().slice(0,10);const nx=W&&W.find(x=>x.pay&&x.date>=today);return nx?`<div class="gv num" style="font-size:24px;letter-spacing:-.5px">${fmtS(nx.date)}</div><div class="gk">next contract gate · ${nx.ra}</div>`:`<div class="gv num">✓</div><div class="gk">programme reserve held</div>`;})()}</div>
  </div>
  <div class="planctl">
    <div class="fld"><label>Group by</label><span class="seg" id="pGrp">
      <button class="acc ${p.groupBy==='cat'?'on':''}" data-g="cat">Category</button>
      <button class="acc ${p.groupBy==='zone'?'on':''}" data-g="zone">Zone</button>${PROJ.kt&&PROJ.kt.raGates?`
      <button class="acc ${p.groupBy==='phase'?'on':''}" data-g="phase">Phase</button>`:""}</span></div>
    <div class="fld"><label>Detail</label><span class="seg" id="pLvl">
      <button class="acc ${p.level==='cat'?'on':''}" data-l="cat">${p.groupBy==='zone'?'Zone':p.groupBy==='phase'?'Phase':'Category'}</button>
      <button class="acc ${p.level==='sub'?'on':''}" data-l="sub">Sub-category</button>
      <button class="acc ${p.level==='act'?'on':''}" data-l="act">Activity</button>
      <button class="acc ${p.level==='item'?'on':''}" data-l="item">Every item</button></span></div>
    <div class="fld"><label>View</label><span class="seg" id="pMode">
      <button class="acc ${p.mode==='table'?'on':''}" data-m="table">Table</button>
      <button class="acc ${p.mode==='gantt'?'on':''}" data-m="gantt">Gantt</button></span></div>
  </div>
  ${PROJ.kt&&PROJ.kt.clientDeps?`
  <div class="panel">
    <div class="ph"><div><h3>Inputs we are counting on from your side</h3><p>The programme above assumes these land on time — each one protects a set of dates.</p></div></div>
    <div class="pb" style="padding-top:6px"><table><thead><tr><th>What we need</th><th style="width:340px">By when</th></tr></thead>
      <tbody>${PROJ.kt.clientDeps.map(d=>`<tr><td>${d[0]}</td><td class="muted">${d[1]}</td></tr>`).join("")}</tbody></table></div>
  </div>`:""}

  ${p.mode==="table"?planTable(plan,true):planGantt(plan,true)}
  <div class="panel"><div class="pb" style="display:flex;align-items:center;gap:14px">
    <span class="kind" style="background:var(--accent-soft);color:var(--accent-ink)">Commitment</span>
    <span class="muted" style="font-size:12.5px">Committed completion ${fmtS(state.win.extEnd)} · programme runs on the agreed site calendar · internal forecasts stay internal</span>
  </div></div>`;
}

function planTable(plan,client){
  const tree=planTree(plan), lvl=state.plan.level;
  const cols=client?4:7;
  const aggRow=(n,depth)=>{
    const pad=depth?`style="padding-left:${14+depth*22}px"`:"";
    const closed=state.plan.closed[n.key];
    const canOpen=lvl!=="cat"||false;
    const chip=!client&&n.gatechip?`<span style="font-size:10px;font-weight:600;padding:2px 8px;border-radius:9px;margin-left:8px;background:${n.gatechip.late?"#fdeceb":"var(--ok-soft)"};color:${n.gatechip.late?"var(--shut-ink)":"#1d7a4f"}">${n.gatechip.txt}</span>`:"";
    return `<tr class="grph ${closed?'closed':''}" data-g="${n.key}"><td colspan="${client?1:3}" ${pad}>${lvl!=="cat"&&depth===0||lvl==="item"&&depth<2?'<span class="chev2">▾</span>':""}<span class="gdot" style="background:${colorFor(n.label)}"></span><b>${n.label}</b>${chip}
      <span class="cnt"> · ${n.n?`${n.n} tasks`:`${n.holds||0} holds`}${!client&&n.crit?` · <span class="critmark">${n.crit} critical</span>`:""}</span></td>
      <td class="num">${fmtS(n.es)}</td><td class="num">${fmtS(n.ef)}</td><td class="num">${daysBetween(n.es,n.ef)+1}d</td>${client?"":"<td></td>"}</tr>`;
  };
  const taskRow=t=>{
    if(t.gate)return client
      ?`<tr class="gaterow"><td><span class="gd"></span>${t.name}</td><td class="num">${fmtS(t.ES)}</td><td></td><td></td></tr>`
      :`<tr class="gaterow"><td colspan="4" style="padding-left:58px"><span class="gd"></span>${t.name} <span class="faint">· hold</span></td><td class="num">${fmtS(t.ES)}</td><td colspan="2"></td></tr>`;
    if(client)return `<tr><td style="padding-left:58px">${tname(t)} <small class="faint">· ${zname(t.zone)}</small></td>
      <td class="num">${fmtS(t.ES)}</td><td class="num">${fmtS(t.EF)}</td><td class="num">${t.durWD}d</td></tr>`;
    const qv=(plan.qty[t.id]&&plan.qty[t.id].qty)||t.qty;
    return `<tr><td style="padding-left:58px">${t.critical?'<span class="critmark">⚡ </span>':''}${tname(t)} <small class="faint">· ${zname(t.zone)}</small>${t.leadWeeks?` <small class="faint">· ${t.leadWeeks}wk lead</small>`:""}</td>
      <td class="num">${qv?(+qv).toLocaleString("en-IN")+" "+unitOf(t.code):""}</td>
      <td><span class="confp ${t.conf||'med'}">${(t.conf||"med").toUpperCase()}</span></td>
      <td class="num">${fmtS(t.ES)}</td><td class="num">${fmtS(t.EF)}</td>
      <td class="num">${t.durWD}d</td>
      <td class="num">${t.critical?'<b class="critmark">0 ◆</b>':t.floatWD+"d"}</td></tr>`;
  };
  const actRow=a=>{
    const zn=Object.keys(a.zones).length, win=daysBetween(a.es,a.ef)+1;
    const dtxt=a.wd&&a.wd<win?`<b>${a.wd}d</b> <small class="faint">work · ${win}d window</small>`:`${win}d`;
    return client
      ?`<tr><td style="padding-left:58px">${a.label} <small class="faint">· ${zn} zone${zn>1?"s":""}, zone by zone</small></td><td class="num">${fmtS(a.es)}</td><td class="num">${fmtS(a.ef)}</td><td class="num">${dtxt}</td></tr>`
      :`<tr><td colspan="1" style="padding-left:58px">${a.crit?"⚡ ":""}${a.label} <small class="faint">· ${zn} zone${zn>1?"s":""}</small></td><td class="num">${a.qty?Math.round(a.qty).toLocaleString("en-IN")+" "+a.unit:""}</td><td></td><td class="num">${fmtS(a.es)}</td><td class="num">${fmtS(a.ef)}</td><td class="num">${dtxt}</td><td></td></tr>`;
  };
  let rows="";
  tree.forEach(n1=>{
    rows+=aggRow(n1,0);
    if(lvl==="cat"||state.plan.closed[n1.key])return;
    n1.subs.forEach(n2=>{
      if(lvl==="sub"){rows+=aggRow(n2,1);return;}
      rows+=aggRow(n2,1);
      if(state.plan.closed[n2.key])return;
      if(lvl==="act"){n2.acts.forEach(a=>rows+=actRow(a));return;}
      n2.tasks.forEach(t=>rows+=taskRow(t));
    });
  });
  const headCols=client
    ?`<th>Activity</th><th style="width:100px">Start</th><th style="width:100px">Finish</th><th style="width:64px">Days</th>`
    :`<th>Task</th><th style="width:105px">Quantity</th><th style="width:60px">Sure?</th><th style="width:92px">Start</th><th style="width:92px">Finish</th><th style="width:56px">Days</th><th style="width:66px">Can slip</th>`;
  return `<div class="panel"><div class="ph"><div><h3>${client?"Working schedule":"The dated plan"}</h3><p>${lvl==="cat"?"Rolled up — one line per group.":lvl==="sub"?"Sub-category level — click a group to fold.":lvl==="act"?"Activity level — each line is one work type across its zones.":"Every item — click any level to fold."}</p></div></div>
  <div class="pb" style="padding-top:6px"><table><thead><tr>${headCols}</tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function planGantt(plan,client){
  const tree=planTree(plan), lvl=state.plan.level;
  const S=plan.projectStart,total=client?Math.max(daysBetween(S,state.win.extEnd)+1,plan.calendarDays):plan.calendarDays;
  const f=iso=>daysBetween(S,iso)/total;
  const months=[];{
    let d=CAL._d(S);const E=CAL._d(client&&state.win.extEnd>plan.projectEnd?state.win.extEnd:plan.projectEnd);
    while(d<=E){const mEnd=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));
      const to=mEnd<E?mEnd:E;
      months.push({lab:MN[d.getUTCMonth()],days:Math.round((to-d)/86400000)+1,startF:f(CAL._iso(d))});
      d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));}}
  const today=new Date().toISOString().slice(0,10);
  const todayLine=(today>=S&&today<=plan.projectEnd)?`<div class="gtoday" style="left:calc(300px + (100% - 300px)*${f(today).toFixed(4)})"></div>`:"";
  const monLines=months.slice(1).map(m=>`<div class="gmonline" style="left:calc(300px + (100% - 300px)*${m.startF.toFixed(4)})"></div>`).join("");
  // weeks — every Monday inside the window; label thins out on long programmes
  const weeks=weekStarts(S,client&&state.win.extEnd>plan.projectEnd?state.win.extEnd:plan.projectEnd)
    .map(iso=>{const d=CAL._d(iso);return {iso,fr:f(iso),lab:d.getUTCDate()+" "+MN[d.getUTCMonth()].slice(0,3)};});
  const wkEvery=total>240?2:1;
  const wkHead=`<div class="gweeks">${weeks.map((w,i)=>i%wkEvery?"":`<span style="left:${(w.fr*100).toFixed(2)}%">${w.lab}</span>`).join("")}</div>`;
  const wkLines=weeks.map(w=>`<div class="gwkline" style="left:calc(300px + (100% - 300px)*${w.fr.toFixed(4)})"></div>`).join("");
  const bar=(es,ef,cls,tip)=>`<div class="gbar ${cls}" style="left:${(f(es)*100).toFixed(2)}%;width:${Math.max(((daysBetween(es,ef)+1)/total*100),0.45).toFixed(2)}%" title="${tip}"></div>`;
  const gchip=n=>!client&&n.gatechip?`<span title="${n.gatechip.txt}" style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:9px;margin-left:7px;background:${n.gatechip.late?"#fdeceb":"var(--ok-soft)"};color:${n.gatechip.late?"var(--shut-ink)":"#1d7a4f"}">${n.gatechip.txt.replace("gate clear · ","+").replace("basket late ","late ").replace("breaches the contract window","breach")}</span>`:"";
  const aggRow=(n,depth)=>`<div class="grow ggrph grph ${state.plan.closed[n.key]?'closed':''}" data-g="${n.key}"><div class="glabel" style="padding-left:${depth*18}px">${lvl!=="cat"?'<span class="chev2">▾</span>':""}<span class="gdot" style="background:${colorFor(n.label)}"></span><b>${n.label}</b>${gchip(n)} <small>· ${n.n||((n.holds||0)+" holds")}</small></div>
    <div class="gtrack"><div class="gspan" style="left:${(f(n.es)*100).toFixed(2)}%;width:${((daysBetween(n.es,n.ef)+1)/total*100).toFixed(2)}%;background:${colorFor(n.label)}"></div></div></div>`;
  const taskRow=t=>{
    const tip=`${tname(t)} · ${fmtS(t.ES)} → ${fmtS(t.EF)}${t.gate?" · hold":client?"":` · can slip ${t.floatWD}d`}`;
    if(t.gate)return `<div class="grow"><div class="glabel" style="color:#8a6a12;padding-left:36px">◆ ${t.name}</div><div class="gtrack">${bar(t.ES,t.EF,"gateb",tip)}</div></div>`;
    return `<div class="grow"><div class="glabel" style="padding-left:36px">${!client&&t.critical?"⚡ ":""}${tname(t)} <small>· ${zname(t.zone)}</small></div>
      <div class="gtrack">${bar(t.ES,t.EF,!client&&t.critical?"crit":"",tip)}</div></div>`;
  };
  let rows="";
  const actRow=a=>{const win=daysBetween(a.es,a.ef)+1;const wtxt=a.wd&&a.wd<win?` · ${a.wd}d work in a ${win}d window`:"";
    return `<div class="grow"><div class="glabel" style="padding-left:36px" title="${a.label} — ${a.wd}d of work following zone readiness, ${fmtS(a.es)} → ${fmtS(a.ef)}">${!client&&a.crit?"⚡ ":""}${a.label} <small>· ${Object.keys(a.zones).length} zone${Object.keys(a.zones).length>1?"s":""}${wtxt}${client?"":a.qty?` · ${Math.round(a.qty).toLocaleString("en-IN")} ${a.unit}`:""}</small></div>
    <div class="gtrack"><div class="gspan" style="left:${(f(a.es)*100).toFixed(2)}%;width:${(win/total*100).toFixed(2)}%;background:#b9bcd6"></div></div></div>`;};
  tree.forEach(n1=>{
    rows+=aggRow(n1,0);
    if(lvl==="cat"||state.plan.closed[n1.key])return;
    n1.subs.forEach(n2=>{
      rows+=aggRow(n2,1);
      if(state.plan.closed[n2.key])return;
      if(lvl==="act")n2.acts.forEach(a=>rows+=actRow(a));
      if(lvl==="item")n2.tasks.forEach(t=>rows+=taskRow(t));
    });
  });
  const contBar=client&&daysBetween(plan.projectEnd,state.win.extEnd)>0?`<div class="grow"><div class="glabel" style="color:var(--accent-ink);font-weight:600">Programme contingency</div><div class="gtrack"><div class="gbar" style="left:${(f(plan.projectEnd)*100).toFixed(2)}%;width:${((daysBetween(plan.projectEnd,state.win.extEnd)+1)/total*100).toFixed(2)}%;background:var(--accent-soft);border:1px dashed var(--accent)"></div></div></div>`:"";
  return `<div class="panel"><div class="ph"><div><h3>${client?"Programme — gantt":"The dated plan — gantt"}</h3><p>${client?"Committed completion "+fmtS(state.win.extEnd)+" · contingency hatched.":"Bars coloured by group · ⚡ rows sit on the chain that sets the finish · diamonds = holds · red line = today."}</p></div><div class="right glegend"><span class="li"><i style="background:var(--accent)"></i>Critical</span><span class="li"><i style="background:var(--work)"></i>Task</span><span class="li"><i style="width:11px;height:11px;background:#e0a021;transform:rotate(45deg);border-radius:2px"></i>Hold</span></div></div>
  <div class="pb gwrap"><div style="min-width:900px">
    <div class="ghead"><div class="gmonths">${months.map(m=>`<span style="width:${(m.days/total*100).toFixed(2)}%">${m.lab}</span>`).join("")}</div>
    ${wkHead}</div>
    <div style="position:relative">${wkLines}${monLines}${todayLine}${rows}${contBar}</div>
  </div></div></div>`;
}

  return { planView, clientPlan, clientView, planTable, planGantt };
}

root.PLAN_VIEW_PLAN = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_VIEW_PLAN;

})(typeof window !== "undefined" ? window : globalThis);
