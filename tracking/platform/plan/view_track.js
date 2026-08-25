// ===================================================================
// DnB-OS . platform/plan/view_track.js . PROGRESS, LOOK AHEAD, TRACKERS
// Phase 0b, tranche 6. The three screens that watch a live plan rather
// than author it:
//   . Progress . the S curve against the frozen baseline, the recorded
//     facts the site has fed back, and the velocity table (actual over
//     planned, per task) with supply rows flagged.
//   . Look ahead . the six week Last Planner list, where a task earns
//     its week only when every constraint is cleared.
//   . Trackers . the long lead runway, the critical chain that owns the
//     finish, DRAG (where compression buys days) and the crew sweep.
//
//   install(deps) -> the three views and the crew row wiring
//
// lookaheadView is handed to the plan view, so this module must install
// BEFORE installPlanView . the template's activateProject orders them.
//
// Bodies moved VERBATIM, lifted by script.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, PROJ, CAL, DUR, SEQ, TAKT, MP, MT, KIT, CMP, render, scopedBox,
          revisionPanel } = deps;
  const esc = s => String(s == null ? "" : s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/"/g,"&quot;");
  const { fmt, fmtS, dd, daysBetween, colorFor, scoreCol, tname,
          ringChart, stackBar, leadTimeline, weekStarts, MN } = KIT;
  const { computePlan, computeIntel, longLeads, planTree, planGroups,
          zname, unitOf, tgtName, evData, phaseWindows, catOf } = CMP;

function progressView(){
  // Phase 10 sits at the top of this screen: what the site fed back is the
  // first thing a planner should see here, ahead of the curve drawn from it.
  const REV = (typeof revisionPanel === "function" ? (revisionPanel() || "") : "");
  const E=evData();const plan=E.plan;
  const W=E.weeks.length,PW=560,PH=210,px=k=>40+(PW-60)*(W<=1?0:k/(W-1)),py=v=>12+(PH-40)*(1-v);
  const line=(arr,cls,dash)=>{const pts=arr.map((v,k)=>v==null?null:`${px(k).toFixed(1)},${py(Math.min(1,v)).toFixed(1)}`).filter(Boolean);
    return pts.length>1?`<polyline points="${pts.join(" ")}" fill="none" stroke="${cls}" stroke-width="2" ${dash?`stroke-dasharray="${dash}"`:""}/>`:"";};
  const monthTicks=E.weeks.map((iso,k)=>{const d=CAL._d(iso);return d.getUTCDate()<=7?`<text x="${px(k).toFixed(1)}" y="${PH-8}" font-size="8" fill="#9a9da8" text-anchor="middle">${MN[d.getUTCMonth()]}</text>`:"";}).join("");
  const gridY=[0,.25,.5,.75,1].map(v=>`<line x1="40" y1="${py(v)}" x2="${PW-20}" y2="${py(v)}" stroke="#f0f1f5"/><text x="34" y="${py(v)+3}" font-size="8" fill="#9a9da8" text-anchor="end">${Math.round(v*100)}%</text>`).join("");
  const todayX=px(E.kToday);
  const svg=`<svg viewBox="0 0 ${PW} ${PH}" style="width:100%;max-width:920px">
    ${gridY}
    <line x1="${todayX}" y1="10" x2="${todayX}" y2="${PH-28}" stroke="#d9a23a" stroke-width="1" stroke-dasharray="3,3"/>
    <text x="${todayX}" y="8" font-size="8" fill="#8a6a12" text-anchor="middle">today</text>
    ${E.baseline?line(E.baseline,"#b9bcd6","4,3"):""}
    ${line(E.planned,"var(--accent,#4a48c4)")}
    ${line(E.actual,"#2e9e6b")}
    ${monthTicks}</svg>`;
  const behind=E.vel.filter(v=>v.ratio!=null&&v.ratio<0.95).sort((a,b)=>a.ratio-b.ratio).slice(0,10);
  const ahead=E.vel.filter(v=>v.ratio!=null&&v.ratio>1.05).sort((a,b)=>b.ratio-a.ratio).slice(0,6);
  const planPctToday=Math.round((E.planned[E.kToday]||0)*100);
  const actPctToday=Math.round((E.actual[E.kToday]||0)*100);
  // TCS-style weekly grid at category level
  const cats={};
  plan.tasks.filter(t=>!t.gate).forEach(t=>{const [c]=catOf(t);const e=(t.durWD||1)*((DUR.get(t.code)||{}).crew||1);
    const o=cats[c]=cats[c]||{eff:0,inc:new Array(W).fill(0)};o.eff+=e;
    const a=Math.floor(daysBetween(plan.projectStart,t.ES)/7),b=Math.floor(daysBetween(plan.projectStart,t.EF)/7),n=Math.max(1,b-a+1);
    for(let k=Math.max(0,a);k<=Math.min(W-1,b);k++)o.inc[k]+=e/n;});
  const wkHdr=E.weeks.map((iso,k)=>`<th style="min-width:34px">${k+1}</th>`).join("");
  const catFirst={};plan.tasks.filter(t=>!t.gate).forEach(t=>{const [c]=catOf(t);if(!catFirst[c]||t.ES<catFirst[c])catFirst[c]=t.ES;});
  const gridRows=Object.keys(cats).sort((a2,b2)=>(catFirst[a2]||"9")< (catFirst[b2]||"9")?-1:1).map(c=>{const o=cats[c];let acc=0;
    const cells=o.inc.map(v=>{acc+=v;const p=Math.round(acc/o.eff*100);return `<td class="num" style="font-size:10px;${p>=100?'color:#2e9e6b;font-weight:600':''}">${p>0?p:""}</td>`;}).join("");
    return `<tr><td style="min-width:190px"><b>${c}</b> <small class="faint">${Math.round(o.eff/E.total*100)}% wt</small></td>${cells}</tr>`;}).join("");
  return `
  <div class="head" style="margin-bottom:16px"><h1>Progress &amp; S-curve — earned value from recorded facts</h1>
    <p>Weightage is engine-derived (effort share). The corpus law across 6 Flipspaces plans: projects slip in PROCUREMENT, site trades hold — watch the supply rows.</p></div>
  ${scopedBox("progress")}
  ${REV}
  <div class="glance">
    <div class="g"><div class="gv num">${actPctToday}%</div><div class="gk">earned to date (facts)</div></div>
    <div class="g"><div class="gv num">${planPctToday}%</div><div class="gk">planned to date</div></div>
    <div class="g lead"><div class="gv num" style="color:${actPctToday>=planPctToday?'#2e9e6b':'#c4483a'}">${actPctToday-planPctToday>=0?"+":""}${actPctToday-planPctToday}pp</div><div class="gk">variance — ${actPctToday>=planPctToday?"ahead of":"behind"} plan</div></div>
    <div class="g"><div class="gv num">${E.factCount}</div><div class="gk">tasks with recorded facts</div></div>
  </div>
  <div class="panel"><div class="ph"><div><h3>S-curve</h3><p>${E.baseline?"grey dashed = Original baseline · ":""}blue = current plan · green = actual (from facts). Say "blockwork 60% done" or "waterproofing finished in washrooms" to feed it.</p></div></div>
    <div class="pb">${svg}</div></div>
  ${(state.answers.progress||[]).length?`
  <div class="panel"><div class="ph"><div><h3>Recorded facts — ${(state.answers.progress||[]).length}</h3><p>What the site has told the engine. Say "clear progress" to reset all.</p></div></div>
    <div class="pb" style="padding-top:6px"><table><thead><tr><th>What</th><th>Zone</th><th>Fact</th></tr></thead><tbody>
    ${(state.answers.progress||[]).slice(0,30).map(f=>{const nm=f.id?f.id:(DUR.get(f.code)||{}).name||f.code;
      const what=f.af?("done "+fmtS(f.af)):f.pct!=null?(Math.round(f.pct*100)+"% complete"):("started "+fmtS(f.as));
      return `<tr><td>${nm}</td><td class="muted">${f.zone?zname(f.zone):f.id?"—":"all zones"}</td><td>${what}</td></tr>`;}).join("")}
    </tbody></table></div></div>`:""}
  ${E.factCount?`
  <div class="panel"><div class="ph"><div><h3>Velocity — behind plan</h3><p>actual% ÷ planned% at today, per task with facts. Supply rows flagged — the corpus says that's where projects die.</p></div></div>
    <div class="pb" style="padding-top:6px"><table><thead><tr><th>Task</th><th>Zone</th><th>Planned</th><th>Actual</th><th>Velocity</th></tr></thead><tbody>
    ${behind.map(v=>`<tr><td>${v.supply?'<span class="kind" style="background:#fbeaea;color:#c4483a">supply</span> ':''}${v.t.name}</td><td class="muted">${zname(v.t.zone)}</td><td class="num">${Math.round(v.pp*100)}%</td><td class="num">${Math.round(v.pct*100)}%</td><td class="num" style="color:#c4483a;font-weight:600">${v.ratio}</td></tr>`).join("")||'<tr><td colspan="5" class="muted">nothing behind plan</td></tr>'}
    </tbody></table>
    ${ahead.length?`<p style="margin:10px 0 4px"><b>Ahead:</b> ${ahead.map(v=>v.t.name+" ("+v.ratio+"×)").join(" · ")}</p>`:""}</div></div>`:`
  <div class="panel"><div class="pb"><p class="muted">No facts recorded yet. Tell the engine what happened — "demolition done in boardroom", "blockwork 60%", "rcp approved" — and the green curve starts.</p></div></div>`}
  <div class="panel"><div class="ph"><div><h3>Weekly grid — cumulative planned % by category</h3><p>The shape your site teams already track (TCS format). Green = complete.</p></div></div>
    <div class="pb" style="padding-top:6px;overflow-x:auto"><table><thead><tr><th>Category · weight</th>${wkHdr}</tr></thead><tbody>${gridRows}</tbody></table></div></div>`;
}

// ---- 6-week look-ahead (Last Planner: make-ready before commitment) --
function lookaheadView(plan){
  const today=new Date().toISOString().slice(0,10);
  const w0=today>plan.projectStart?today:plan.projectStart;
  const real=plan.tasks.filter(t=>!t.gate);
  const gates=plan.tasks.filter(t=>t.gate);
  const leads=longLeads(plan);
  const wkOf=iso=>Math.floor(daysBetween(w0,iso)/7);
  let weeks=[];
  for(let i=0;i<6;i++){
    const ws=CAL._iso(CAL._add(CAL._d(w0),i*7)), we=CAL._iso(CAL._add(CAL._d(w0),i*7+6));
    const starting={};
    real.filter(t=>t.ES>=ws&&t.ES<=we).forEach(t=>{const k=t.name;(starting[k]=starting[k]||{n:0,zones:{}}).n++;if(t.zone)starting[k].zones[t.zone]=1;});
    const arr=leads.filter(l=>l.ES>=ws&&l.ES<=we);
    const signoffs=gates.filter(g=>g.ES>=ws&&g.ES<=we);
    const gfcOpen=real.some(t=>t.code==="gfc_pack"&&t.EF>=ws);
    weeks.push({ws,we,starting,arr,signoffs,gfcOpen});
  }
  return `<div class="panel">
    <div class="ph"><div><h3>6-week look-ahead — make the work ready</h3><p>Last Planner discipline: a task earns its week only when every constraint is cleared — drawings, materials, sign-offs, space. Clear them zone one first; later zones inherit.</p></div></div>
    <div class="pb" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;padding-top:14px">
      ${weeks.map((w,i)=>`<div style="border:1px solid var(--line2);border-radius:12px;padding:12px 14px">
        <div style="font-weight:600;font-size:12.5px;margin-bottom:6px">Week ${i+1} <span class="faint">· ${fmtS(w.ws)} – ${fmtS(w.we)}</span></div>
        ${w.gfcOpen?`<div style="font-size:11.5px;color:var(--shut-ink);margin-bottom:6px">⚠ GFC still open — everything below is provisional</div>`:""}
        ${Object.keys(w.starting).length?`<div style="font-size:11.5px;font-weight:600;margin-bottom:2px">Starting</div>${Object.entries(w.starting).slice(0,6).map(([k,v])=>`<div style="font-size:11.5px;color:var(--muted)">· ${k} <span class="faint">(${Object.keys(v.zones).length||v.n} zone${(Object.keys(v.zones).length||v.n)>1?"s":""})</span></div>`).join("")}${Object.keys(w.starting).length>6?`<div class="faint" style="font-size:11px">+${Object.keys(w.starting).length-6} more</div>`:""}`:`<div class="faint" style="font-size:11.5px">nothing new starts</div>`}
        ${w.arr.length?`<div style="font-size:11.5px;font-weight:600;margin:6px 0 2px">Deliveries needed on site</div>${w.arr.slice(0,4).map(l=>`<div style="font-size:11.5px;color:var(--muted)">◦ ${l.name} <span class="faint">by ${fmtS(l.ES)}</span></div>`).join("")}`:""}
        ${w.signoffs.length?`<div style="font-size:11.5px;font-weight:600;margin:6px 0 2px">Sign-offs due</div>${w.signoffs.slice(0,4).map(g=>`<div style="font-size:11.5px;color:#8a6a12">◆ ${g.name}</div>`).join("")}`:""}
      </div>`).join("")}
    </div>
  </div>`;
}

// ===================== TRACKERS (long-lead · critical · crew) =========
function trackersView(){
  // the manpower curve for this plan, and the week the user is looking at.
  // Defaults to the week the plan starts, so the panel is never empty on
  // first open the way a "this week" default would be on a future project.
  const _mpPlan = state._plan || computePlan();
  const MPC = MP ? MP.curve(_mpPlan) : { days: [], byDay: {}, byDayTrade: {} };
  const MPK = MP ? MP.peaks(MPC) : { site: 0, siteDay: null, byTrade: [] };
  const MPWEEK = (state.track && state.track.mpWeek) || (function(){
    const d0 = MPC.days[0] || _mpPlan.projectStart;
    const d = new Date(d0 + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));   // back to Monday
    return d.toISOString().slice(0, 10);
  })();
  const MPW = MP ? MP.week(MPC, MPWEEK) : { days: [], trades: [], rows: [], totals: [] };
  const plan=state._plan||computePlan(); state._plan=plan;
  const leads=longLeads(plan);
  // SUPPLY WATCH — the corpus law (6 plans): slips live in procurement.
  const todayI=new Date().toISOString().slice(0,10);
  const P=state.answers.progress||[];
  const supply=plan.tasks.filter(t=>!t.gate&&(String(t.id).startsWith("pkg:")||String(t.id).startsWith("dwg:")))
    .map(t=>{const f=P.find(p=>p.id===t.id);
      const st=f&&f.af?"done":f&&(f.as||f.pct!=null)?"running":t.ES<todayI?"OVERDUE":t.ES<=CAL._iso(CAL._add(CAL._d(todayI),14))?"due soon":"later";
      return {t,st};})
    .filter(x=>x.st==="OVERDUE"||x.st==="due soon")
    .sort((a,b)=>a.t.ES<b.t.ES?-1:1);
  const chain=plan.tasks.filter(t=>t.critical&&!t.gate);
  return `
  <div class="head"><h1>Long-lead &amp; critical — what can move the date</h1>
    <p>Planning outputs: the deliveries that set the finish, the chain of tasks that owns it, and the crew maths behind the engine's choice.</p></div>
  ${supply.length?`
  <div class="panel" style="border-left:3px solid #c4483a"><div class="ph"><div><h3>Supply watch — the corpus law</h3>
    <p>Across all 6 absorbed Flipspaces plans, slips came from PROCUREMENT lines while site trades held. These enabling-chain tasks are overdue or due within 14 days — chase them or record their facts ("joinery po done").</p></div></div>
    <div class="pb" style="padding-top:6px"><table><thead><tr><th>Enabling task</th><th>Planned start</th><th>Status</th></tr></thead><tbody>
    ${supply.slice(0,14).map(x=>`<tr><td>${x.t.name}</td><td class="num">${fmtS(x.t.ES)}</td><td>${x.st==="OVERDUE"?'<b style="color:#c4483a">OVERDUE — no fact recorded</b>':'due soon'}</td></tr>`).join("")}
    </tbody></table></div></div>`:""}

  <div class="glance">
    <div class="g lead"><div class="gv num">${leads.length}</div><div class="gk">long-lead items · order on time or the date moves</div></div>
    <div class="g"><div class="gv num">${chain.length}</div><div class="gk">tasks on the critical chain</div></div>
    <div class="g"><div class="gv num">${plan.fronts}</div><div class="gk">working fronts · engine-set</div></div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Long-lead runway</h3><p>Order-by date → needed on site, for each long-lead item. Accent bars sit on the critical chain.</p></div></div>
    <div class="pb">${leadTimeline(leads)}</div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Long-lead items — order by these dates or the date moves</h3><p>Needed-on-site from the plan; order-by walks the lead time back.</p></div></div>
    <div class="pb"><table class="leadtbl"><thead><tr><th>Item</th><th style="width:90px">Lead</th><th style="width:120px">Order by</th><th style="width:130px">Needed on site</th><th>Zones</th><th style="width:110px"></th></tr></thead>
    <tbody>${leads.map(l=>`<tr><td><b>${l.name}</b></td><td class="num">${l.weeks} wks</td><td class="num"><b>${fmtS(l.orderBy)}</b></td><td class="num">${fmtS(l.ES)}</td><td class="faint">${l.zones.length>3?`<span title="${l.zones.map(zname).join(", ")}">${l.zones.length} zones</span>`:l.zones.map(zname).join(", ")}</td><td>${l.crit?'<span class="critmark">◆ sets the date</span>':''}</td></tr>`).join("")}</tbody></table></div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Critical chain — the tasks that own the finish</h3><p>Touch any of these and ${fmtS(plan.projectEnd)} moves. In order.</p></div><div class="right"><b>${chain.length}</b> items</div></div>
    <div class="pb" style="padding-top:6px"><table><thead><tr><th style="width:36px"></th><th>Task</th><th style="width:150px">Zone</th><th style="width:95px">Start</th><th style="width:95px">Finish</th><th style="width:150px">Waits on</th></tr></thead>
    <tbody>${chain.map((t,i)=>`<tr><td class="num faint">${i+1}</td><td><span class="critmark">⚡</span> ${tname(t)}</td><td class="faint">${zname(t.zone)}</td><td class="num">${fmtS(t.ES)}</td><td class="num">${fmtS(t.EF)}</td><td class="faint">${t.boundBy==="gang"?"a free gang":t.boundBy==="zone"?"zone space":t.boundBy==="lead"?"delivery":t.boundBy==="pred"?"the task before":"start"}</td></tr>`).join("")}</tbody></table></div>
  </div>

  ${(()=>{const plan=state._plan||computePlan();const real=plan.tasks.filter(t=>!t.gate);
    const crit=real.filter(t=>t.critical);
    const rows=crit.map(t=>{
      const par=real.filter(o=>!o.critical&&o.ES<t.EF&&o.EF>t.ES);
      const pf=par.length?Math.min(...par.map(o=>o.floatWD||0)):t.durWD;
      return {t,drag:Math.max(0,Math.min(t.durWD,pf))};
    }).filter(r=>r.drag>0).sort((a,b)=>b.drag-a.drag).slice(0,5);
    return rows.length?`
  <div class="panel">
    <div class="ph"><div><h3>Where compression buys days — DRAG</h3><p>Devaux's metric, approximated: how many days the finish moves if this critical task alone is shortened. Attack these before adding crews anywhere else.</p></div></div>
    <div class="pb" style="padding-top:6px"><table><thead><tr><th>Critical task</th><th style="width:120px">Zone</th><th style="width:110px">Duration</th><th style="width:170px">Compressing buys up to</th></tr></thead>
      <tbody>${rows.map(r=>`<tr><td>${tname(r.t)}</td><td>${zname(r.t.zone)}</td><td class="num">${r.t.durWD}d</td><td class="num"><b>${r.drag}d</b></td></tr>`).join("")}</tbody></table></div>
  </div>`:"";})()}

  ${PROJ.kt?`
  <div class="panel">
    <div class="ph"><div><h3>Contract order anchors — from the KT handover</h3><p>${PROJ.kt.ld
      ? `Procurement deadlines the contract clock implies. LD ${PROJ.kt.ld}.`
      : `The signed agreement has not been read into the engine for this project yet, so no contract clock, no LD terms and no RA gates are carried. What is below is only what the handover note does say.`}</p></div></div>
    <div class="pb" style="padding-top:6px">${(PROJ.kt.raOrders&&PROJ.kt.raOrders.length)?`<table>
      <thead><tr><th>Order</th><th style="width:280px">Anchor</th></tr></thead>
      <tbody>${PROJ.kt.raOrders.map(r=>`<tr><td>${r[0]}</td><td>${r[1]}</td></tr>`).join("")}</tbody></table>`:""}
      ${(PROJ.kt.raGates&&PROJ.kt.raGates.length)?`<div style="margin-top:14px;font-weight:600;font-size:12.5px">Contract RA gates (signed contract, Schedule-3) — day counted from ${fmtS(state.win.extStart)}</div>
      <table style="margin-top:6px"><thead><tr><th style="width:60px">Gate</th><th style="width:90px">Day · pay</th><th>What the contract expects done</th><th style="width:90px">Date</th></tr></thead>
      <tbody>${PROJ.kt.raGates.map(g=>`<tr><td><b>${g.ra}</b></td><td class="num">d${g.day} · ${g.pay}</td><td style="font-size:12px">${g.gate}</td><td class="num">${fmtS(CAL._iso(CAL._add(CAL._d(state.win.extStart),g.day)))}</td></tr>`).join("")}</tbody></table>`:""}
      ${(PROJ.kt.contacts&&PROJ.kt.contacts.length)?`<div style="margin-top:12px;font-size:12px;color:var(--muted)"><b>Client side:</b> ${PROJ.kt.contacts.map(c=>`${c[0]} — ${c[1]}`).join(" · ")}</div>`:""}
      ${PROJ.kt.siteNotes?`<div style="margin-top:6px;font-size:12px;color:var(--muted)"><b>Site:</b> ${PROJ.kt.siteNotes}</div>`:""}
      ${PROJ.kt.docName&&!PROJ.kt.ld?`<div style="margin-top:10px;font-size:12px;color:var(--muted)">The document is on record — <b>${PROJ.kt.docName}</b> — it simply has not been transcribed into terms the engine can compute from.</div>`:""}
    </div>
  </div>`:""}

  ${PROJ.teamSchedule?`
  <div class="panel">
    <div class="ph"><div><h3>Team schedule V2 — the human plan, for reference</h3><p>From Drive (25 Jun). Day numbers from their day 1 = ${fmtS(state.win.extStart)}. The pilot scorecard: engine vs this vs what actually happens.</p></div>
      <div class="right">engine finishes <b>${fmtS(plan.projectEnd)}</b> · their day 120 = ${fmtS(CAL._iso(CAL._add(CAL._d(state.win.extStart),119)))}</div></div>
    <div class="pb" style="padding-top:6px"><table><thead><tr><th>Phase (theirs)</th><th style="width:110px">Their days</th><th style="width:220px">Their dates</th></tr></thead>
    <tbody>${PROJ.teamSchedule.map(p=>`<tr><td>${p[0]}</td><td class="num">d${p[1]}–d${p[2]}</td><td class="num">${fmtS(CAL._iso(CAL._add(CAL._d(state.win.extStart),p[1]-1)))} → ${fmtS(CAL._iso(CAL._add(CAL._d(state.win.extStart),p[2]-1)))}</td></tr>`).join("")}</tbody></table></div>
  </div>`:""}

  ${(function(){
    if(!MT) return "";
    const rows = MT.schedule(_mpPlan, {
      leadWeeks: SEQ.LONGLEAD || {},
      unitOf: c => { const n = DUR.get(c); return n ? n.unit : ""; },
      nameOf: c => { const n = DUR.get(c); return n ? n.name : c; },
    });
    const grns = state.answers.grns || [];
    const withGrn = MT.confirm(rows, grns);
    const short = MT.shortfalls(withGrn), q = MT.queries(withGrn), jobs = MT.tasksFor(withGrn);
    // Ordered lines first, then the ones with no declared lead time. They
    // were being FILTERED OUT, which hid 52 materials behind a table that
    // looked complete . the exact silent drop this codebase refuses.
    const dated = withGrn.filter(r => r.orderBy);
    const undated = withGrn.filter(r => !r.orderBy);
    const soon = dated.slice(0, 12).concat(undated.slice(0, 4));
    const chip = r => r.state === "short" ? '<span class="kind" style="color:var(--bad)">short ' + r.short + '</span>'
      : r.state === "over" ? '<span class="kind">over ' + r.over + '</span>'
      : r.state === "complete" ? '<span class="badge appr"><span class="d"></span>landed</span>'
      : r.state === "arrived_uncounted" ? '<span class="badge draft"><span class="d"></span>uncounted</span>'
      : '<span class="kind">awaited</span>';
    return `
  <div class="panel">
    <div class="ph"><div><h3>Material — what has to be here, and by when</h3>
      <p>Needed on site is ${MT.STAGING_DAYS} days before the work starts. Order by walks the lead time back from there. A code with no declared lead time carries no order-by rather than an invented one.</p></div>
      <div class="right">${short.length ? '<b style="color:var(--bad)">' + short.length + '</b> short · ' : ''}${withGrn.length} lines${undated.length ? ' · <b>' + undated.length + '</b> with no lead time' : ''}</div></div>
    <div class="pb">
      ${q.length ? `<div class="verdict warn" style="margin-bottom:12px"><b>${q.length} shortfall${q.length>1?"s":""} with no balance date.</b>
        The engine will not move a single date on a number nobody gave. ${q.map(x=>esc(x.about)).join(", ")} — ask when the rest lands.</div>` : ""}
      <table><thead><tr><th style="width:26%">Material</th><th class="num">Quantity</th><th class="num">Order by</th><th class="num">Needed on site</th><th>Zones</th><th>Status</th></tr></thead>
        <tbody>${soon.map(r => `<tr>
          <td>${esc(r.name)}</td>
          <td class="num">${r.qty} ${esc(r.unit || "")}</td>
          <td class="num">${r.orderBy ? fmtS(r.orderBy) : '<span class="faint">lead unknown</span>'}</td>
          <td class="num">${r.neededOn ? fmtS(r.neededOn) : "—"}</td>
          <td class="faint">${r.zones.slice(0,3).map(z=>esc(zname(z))).join(", ")}${r.zones.length>3?" +"+(r.zones.length-3):""}</td>
          <td>${chip(r)}</td></tr>`).join("")}</tbody></table>
      ${undated.length ? `<p class="faint" style="font-size:12.5px;margin:10px 0 0">
        ${undated.length} material${undated.length>1?"s carry":" carries"} no declared lead time, so ${undated.length>1?"they have":"it has"} a needed-on-site date but no order-by.
        The engine will not invent one. Add the lead time to the library and the order-by appears.</p>` : ""}
      ${jobs.length ? `<div style="margin-top:14px;border-top:1px solid var(--line2);padding-top:12px">
        <div style="font-size:11px;font-weight:600;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">
          ${jobs.length} confirmation${jobs.length>1?"s":""} somebody owes — a delivery nobody confirms is a wish, not a plan</div>
        ${jobs.slice(0,6).map(j=>`<div class="qline"><span class="qo">${esc(j.what)}</span><span class="qd num">${j.due?fmtS(j.due):"—"}</span></div>`).join("")}
      </div>` : ""}
    </div>
  </div>`;})()}

  <div class="panel">
    <div class="ph"><div><h3>Manpower — the headcount this plan needs</h3>
      <p>Per trade, per day, from the dated plan. Desk and vendor work is excluded: it is nobody's boots on the floor.</p></div>
      <div class="right"><b>${MPK.site}</b> peak on site${MPK.siteDay?` · ${fmtS(MPK.siteDay)}`:""}</div></div>
    <div class="pb">
      <div class="glance">${MPK.byTrade.slice(0,6).map(t=>`
        <div class="g"><div class="gv num">${t.peak}</div><div class="gk">${t.trade} · peak ${fmtS(t.day)}</div></div>`).join("")}</div>
      ${MPW.rows.length?`
      <table style="margin-top:14px"><thead><tr><th style="width:22%">Trade</th>
        ${MPW.days.map(d=>`<th class="num">${fmtS(d)}</th>`).join("")}<th class="num">Week</th></tr></thead>
        <tbody>${MPW.rows.map(r=>`<tr><td>${r.trade}</td>
          ${r.byDay.map(n=>`<td class="num${n?"":" faint"}">${n||"·"}</td>`).join("")}
          <td class="num"><b>${r.total}</b></td></tr>`).join("")}
        <tr><td><b>On site</b></td>${MPW.totals.map(n=>`<td class="num"><b>${n||"·"}</b></td>`).join("")}
          <td class="num"><b>${MPW.totals.reduce((a,b)=>a+b,0)}</b></td></tr></tbody></table>
      <div class="flex" style="gap:10px;align-items:center;margin-top:12px">
        <span class="faint" style="font-size:12.5px">week beginning</span>
        <input type="date" id="mpWeek" value="${MPWEEK}">
        <span class="faint" style="font-size:12.5px">· actual headcount comes from the DPR, in Track mode</span>
      </div>`:`<p class="faint" style="font-size:12.5px;margin-top:12px">No planned labour in this week. Pick another.</p>
      <div class="flex" style="gap:10px;align-items:center;margin-top:12px">
        <span class="faint" style="font-size:12.5px">week beginning</span><input type="date" id="mpWeek" value="${MPWEEK}"></div>`}
    </div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Crew &amp; speed — the engine's working</h3><p>The engine runs ${plan.fronts} fronts: the smallest crew that hits the ${tgtName()} date. Click a row to preview another crew size on the plan.</p></div></div>
    <div class="pb"><table><thead><tr><th style="width:110px">Fronts</th><th style="width:130px">Finish</th><th style="width:210px">Against the ${tgtName()} date</th><th style="width:150px">Peak workers</th><th></th></tr></thead>
    <tbody>${plan.rows.map(r=>{
      const d=daysBetween(state.win.intEnd||state.win.extEnd,r.projectEnd);
      const sel=r.fronts===plan.fronts;
      return `<tr class="frow" data-f="${r.fronts}" style="cursor:pointer${sel?';background:var(--accent-soft)':''}">
        <td><b>${r.fronts}</b>${r.fronts===plan.rec.fronts?' <span class="critmark" style="color:var(--accent-ink)">★ engine pick</span>':''}</td>
        <td class="num"><b>${fmtS(r.projectEnd)}</b></td>
        <td>${d>0?`<span class="critmark">${dd(d)} late</span>`:`<span style="color:var(--ok-ink);font-weight:600">${dd(d)} early</span>`}</td>
        <td class="num">${r.peakWorkers}</td>
        <td class="faint">${sel?"in use":""}</td></tr>`;}).join("")}</tbody></table></div>
  </div>`;
}
function wireTrackers(){
  const mw = document.getElementById("mpWeek");
  if (mw) mw.onchange = e => {
    state.track = Object.assign({}, state.track, { mpWeek: e.target.value }); render();
  };
  document.querySelectorAll(".frow").forEach(r=>r.onclick=()=>{state.plan.fronts=+r.dataset.f;render();});
}

  return { progressView, lookaheadView, trackersView, wireTrackers };
}

root.PLAN_VIEW_TRACK = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_VIEW_TRACK;

})(typeof window !== "undefined" ? window : globalThis);
