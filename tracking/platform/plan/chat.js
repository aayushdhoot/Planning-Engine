// ===================================================================
// DnB-OS . platform/plan/chat.js . THE GLOBAL INSTRUCTION BOX
// Phase 0b, tranche 10, the last of the view modules. The box that sits
// under every screen: a plain sentence goes in ("use 6 fronts", "site
// shut 21 to 25 aug", "blockwork 60% done"), the parser turns it into a
// list of labelled changes, the user sees exactly what will change
// before it is applied, and every applied change can be undone.
//
//   install(deps) -> { chatView, runChatInstant, undoLast, wireChat }
//
// This installs LAST. It reaches the export buttons, the publish flow
// and the new project draft, so everything it touches has to exist
// first. It does NOT own instrApplyChanges: that sits in compute.js,
// below every view, because the scoped box in view_knowledge applies
// changes too and putting it in either one would make the install order
// circular.
//
// Bodies moved VERBATIM, lifted by script.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, PROJ, BOQ, CAL, CALP, DUR, SEQ, INSTRUCT, KIT, CMP,
          actor, render, saveState, blankZone,
          exportXlsx, exportPdf, publishFlow, doPublishGate } = deps;
  const { fmt, fmtS, dd, daysBetween } = KIT;
  const { computeIntel, computePlan, computeChecks, zname,
          instrSnapshot, instrApplyChanges } = CMP;

function chatView(){
  const P=state.instr.proposal, R=state.instr.result;
  let card="";
  if(P)card=`<div class="chatcard">
    <div style="font-weight:600;margin-bottom:8px">The engine read it as:</div>
    ${P.changes.map(c=>`<div style="font-size:12.5px;padding:3px 0">✓ ${c.label}</div>`).join("")||'<div class="faint" style="font-size:12.5px">Nothing it could act on.</div>'}
    ${P.unknown.map(u=>`<div style="font-size:12.5px;padding:3px 0;color:var(--shut-ink)">✕ ${u.startsWith("To confirm")?u:`Could not read: "${u}" — it understands site facts ("ceiling till 10 nov" · "blockwork 60%" · "joinery po done"), dates, crews, quantities, zones, shut-days, approvals, pre-order, deadline lock, publish, views, exports`}</div>`).join("")}
    <div style="margin-top:10px">
      ${P.changes.length?`<button class="btn pri mini" id="chatApply">Apply</button>`:""}
      <button class="btn ghost mini" id="chatCancel">Cancel</button>
    </div></div>`;
  else if(R)card=`<div class="chatcard ok" style="font-size:12.5px">
    ✓ Done — ${R.summary}${R.before?` · finish <b>${fmtS(R.before.end)} → ${fmtS(R.after.end)}</b> · now a draft`:""}
    ${R.snapshot?`<span class="linkx" id="chatUndo" style="margin-left:10px">undo</span>`:""}
    <span class="linkx" id="chatDismiss" style="margin-left:10px">dismiss</span></div>`;
  const hist=state.instr.log.length?`<span class="faint" style="font-size:11px;white-space:nowrap;align-self:center" title="${state.instr.log.slice(-6).map(e=>(e.out?"["+e.out+"] ":"")+e.text).join(" · ").replace(/"/g,'&quot;')}">history · ${state.instr.log.length}</span>`:"";
  return `${card}<div class="chatbar" id="chatbarBox">
    <span class="cbdot">✦</span><input type="text" id="chatText" placeholder='Tell the engine — "we lost 3 days" · "lights: BOQ is right" · "add all suggested tasks" · "approve the calendar" · "publish" · "export excel" · "client view"' value="${state._chatDraft?state._chatDraft.replace(/"/g,'&quot;'):""}">
    <button class="btn pri mini" id="chatGo">Do it</button>${hist}
  </div>`;
}

function runChatInstant(a){
  if(a.kind==="nav"){
    if(a.view==="knowledge"){const l=(a.label||"").toLowerCase();
      state.knowledge={tab:/throughput/.test(l)?"th":/sequence/.test(l)?"seq":/rulebook|library/.test(l)?"seq":(state.knowledge||{tab:"seq"}).tab};} if(a.view==="newproj")state.newProj={zones:[blankZone(),blankZone()]}; state.view=a.view; return a.label; }
  if(a.kind==="mode"){ state.pub.mode=a.v; if(a.v==="client"&&(state.plan.level==="item"||state.plan.level==="sub"))state.plan.level="act"; state.view="plan"; return a.label; }
  if(a.kind==="planview"){ state.plan.mode=a.v; state.view="plan"; return a.label; }
  if(a.kind==="groupby"){ state.plan.groupBy=a.v; state.plan.closed={}; state.view="plan"; return a.label; }
  if(a.kind==="level"){ state.plan.level=a.v; state.view="plan"; return a.label; }
  if(a.kind==="export"){ if(a.what==="xlsx"){const f=exportXlsx();return `Excel exported — <b>${f}</b> is in your browser's Downloads folder`;} const okp=exportPdf(); return okp?"Print view opened in a new tab — choose <b>Save as PDF</b> there":"Pop-up blocked — allow pop-ups for this site, then say export pdf again"; }
  if(a.kind==="undo"){ return undoLast()?"Undid the last applied instruction":"Nothing to undo"; }
  if(a.kind==="refresh"){ state.view="inputs";
    return PROJ.kt&&PROJ.kt.sweep
      ? "Inputs register is current to the "+PROJ.kt.sweep.date+" Drive sweep. New docs land through your engine session today — say \"refresh Kohler from Drive\" there and everything new is read and wired in; when the launcher connects, this command will do it in-place."
      : "This project has no Drive link yet — drop files in the project folder and tell the engine."; }
  if(a.kind==="publish"){ state.view="plan"; publishFlow(); return "Testing layers run — see the plan screen"; }
  if(a.kind==="pubAck"){ if(state.pub.gate&&!state.pub.gate.blocked){doPublishGate();return "Acknowledged and published";} return "No warnings waiting for acknowledgment"; }
  return a.label;
}

function undoLast(){
  if(!state.instr.result||!state.instr.result.snapshot)return false;
  const snap=state.instr.result.snapshot;
  state.win=snap.win;state.answers=snap.answers;state.plan.fronts=snap.fronts;state.cal=snap.cal;
  state.instr.result=null;state.instr.log.pop();
  state._intel=null;state._memo={};state._checks=null;state._vplans={};
  return true;
}

function wireChat(){
  const gi=id=>document.getElementById(id);
  const input=gi("chatText");
  if(!input)return;
  input.oninput=()=>{state._chatDraft=input.value;};
  const go=()=>{
    const txt=input.value.trim(); if(!txt)return;
    const I=computeIntel();
    const ctx={norms:DUR.NORMS,zones:PROJ.zones,year:state.cal.year,areas:PROJ.areas,
      hasIntEnd:!!state.win.intEnd,packages:SEQ.PACKAGES,drawings:SEQ.DRAWINGS,
      suggestions:(I.read.suggestions||[]).filter(sg=>!state.answers.qdone["Q-ADD-"+sg.line]).map(sg=>({line:sg.line,name:sg.name})),
      conflicts:I.recon.filter(r=>r.verdict==="conflict"||r.verdict==="check").map(r=>({code:r.code,name:r.name}))};
    const r=INSTRUCT.parseCommand(txt,ctx);
    state._chatDraft="";
    if(r.actions.length){ state.instr.proposal=null; state.instr.result=null;
      const msg=r.actions.map(runChatInstant).join(" · ");
      state.instr.log.push({ts:new Date().toISOString(),who:actor(),text:txt,out:"done",labels:r.actions.map(a=>a.label||a.kind)});
      if(!r.actions.some(a=>a.kind==="publish"||a.kind==="pubAck"))state.instr.result={summary:msg};
      render(); return; }
    state.instr.result=null;
    if(!r.changes.length)state.instr.log.push({ts:new Date().toISOString(),who:actor(),text:txt,out:"unread",labels:[]});
    r.changes=r.changes.filter((c,i,arr)=>arr.findIndex(x=>x.label===c.label)===i);
      state.instr.proposal={text:txt,changes:r.changes,unknown:r.unknown};
    render();
  };
  gi("chatGo").onclick=go;
  input.onkeydown=e=>{if(e.key==="Enter")go();};
  const bR=document.getElementById("btnRefresh");
  if(bR)bR.onclick=()=>{ state.instr.result={summary:runChatInstant({kind:"refresh"})}; render(); };
  document.querySelectorAll(".chatfocus").forEach(el=>el.onclick=()=>{
    const bar=gi("chatbarBox"); if(bar){bar.classList.remove("pulse");void bar.offsetWidth;bar.classList.add("pulse");}
    input.focus();
  });
  if(gi("chatApply"))gi("chatApply").onclick=()=>{
    const p=state.instr.proposal;
    const beforePlan=state._plan||computePlan();
    const snap=instrSnapshot();
    instrApplyChanges(p.changes);
    state._intel=null;state._memo={};state._checks=null;state._vplans={};
    const after=computePlan(); state._plan=after;
    state.instr.proposal=null;
    const planMoved=after.projectEnd!==beforePlan.projectEnd||after.tasks.length!==beforePlan.tasks.length;
    state.instr.result={ snapshot:snap, summary:p.changes.map(c=>c.label).join(" · "),
      before:planMoved?{end:beforePlan.projectEnd}:null,
      after:planMoved?{end:after.projectEnd}:null };
    state.instr.log.push({ts:new Date().toISOString(),who:actor(),text:p.text,out:"applied",labels:p.changes.map(c=>c.label)});
    render();
  };
  if(gi("chatCancel"))gi("chatCancel").onclick=()=>{
    const p=state.instr.proposal;
    if(p)state.instr.log.push({ts:new Date().toISOString(),who:actor(),text:p.text,out:"cancelled",labels:[]});
    state.instr.proposal=null;render();};
  if(gi("chatUndo"))gi("chatUndo").onclick=()=>{undoLast();render();};
  if(gi("chatDismiss"))gi("chatDismiss").onclick=()=>{state.instr.result=null;render();};
}

  return { chatView, runChatInstant, undoLast, wireChat };
}

root.PLAN_CHAT = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_CHAT;

})(typeof window !== "undefined" ? window : globalThis);
