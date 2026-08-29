// ===================================================================
// DnB-OS . platform/plan/publish.js . THE PUBLISH GATE AND PLAN WIRING
// Phase 0b, the last piece. It was held back on purpose while the rest
// moved: it reaches the exporters and the chat box, and moving it before
// those were modules would have meant threading half migrated globals
// through it, which is how a refactor stops being provable.
//
//   install(deps) -> { publishFlow, doPublishGate, wirePlan, setPublish }
//
// The gate is the point of the module. A plan with a hard FAIL cannot be
// published at all; a plan with warnings can, but only against an
// acknowledgement that goes on the record with the version. Nothing here
// decides anything about the plan itself . it asks computeChecks and
// obeys the answer.
//
// Bodies moved VERBATIM, lifted by script.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, PROJ, CAL, KIT, CMP, SPINE, MP,
          actor, render, saveState, planSig, vLabel, vLabelLong, planIsCurrent,
          exportXlsx, exportPdf } = deps;
  const { fmt, fmtS, dd, daysBetween } = KIT;
  const { computeChecks, computePlan, computeIntel } = CMP;

let _doPublishRef=null;
function publishFlow(){
  const R=computeChecks();
  const toTop=()=>{try{window.scrollTo({top:0,left:0,behavior:"smooth"});}catch(e){}};
  if(R.summary.fail>0){state.pub.gate={result:R,blocked:true};render();toTop();return;}
  if(R.summary.warn>0){state.pub.gate={result:R,blocked:false};render();toTop();return;}
  if(_doPublishRef)_doPublishRef(R);
}
function doPublishGate(){ if(state.pub.gate&&_doPublishRef)_doPublishRef(state.pub.gate.result); }

function wirePlan(){
  const gi=id=>document.getElementById(id);
  if(gi("pGrp"))gi("pGrp").querySelectorAll("button").forEach(b=>b.onclick=()=>{state.plan.groupBy=b.dataset.g;state.plan.closed={};render();});
  if(gi("pLvl"))gi("pLvl").querySelectorAll("button").forEach(b=>b.onclick=()=>{state.plan.level=b.dataset.l;state.plan.closed={};render();});
  if(gi("pMode"))gi("pMode").querySelectorAll("button").forEach(b=>b.onclick=()=>{state.plan.mode=b.dataset.m;render();});
  if(gi("pCrit"))gi("pCrit").querySelectorAll("button").forEach(b=>b.onclick=()=>{state.plan.critOnly=b.dataset.c==="1";render();});
  document.querySelectorAll(".grph").forEach(h=>h.onclick=()=>{const k=h.dataset.g;state.plan.closed[k]=!state.plan.closed[k];render();});
  if(gi("verSel"))gi("verSel").querySelectorAll("button").forEach(b=>b.onclick=()=>{state.pub.viewing=+b.dataset.v||null;render();});
  if(gi("backCur"))gi("backCur").onclick=()=>{state.pub.viewing=null;render();};
  if(gi("toClient"))gi("toClient").onclick=()=>{state.pub.mode="client";if(state.plan.level==="item"||state.plan.level==="sub")state.plan.level="act";state.plan.closed={};render();};
  if(gi("toInternal"))gi("toInternal").onclick=()=>{state.pub.mode="internal";state.plan.closed={};render();};
  if(gi("btnRevise"))gi("btnRevise").onclick=()=>{state.pub.revising=!state.pub.revising;render();};
  if(gi("expXls"))gi("expXls").onclick=()=>{const f=exportXlsx();state.instr.result={summary:`Excel exported — <b>${f}</b> is in your browser's Downloads folder`};render();};
  if(gi("expPdf"))gi("expPdf").onclick=()=>{const okp=exportPdf();state.instr.result={summary:okp?"Print view opened in a new tab — choose <b>Save as PDF</b> there":"Pop-up blocked by the browser — allow pop-ups for this site, then hit Export PDF again"};render();};
  if(gi("zRestore"))gi("zRestore").onclick=()=>{state.answers.zonesOff=[];state._intel=null;state._memo={};saveState();render();};
  if(gi("revGo"))gi("revGo").onclick=()=>{
    const is=gi("revIS").value,ie=gi("revIE").value,es=gi("revES").value,ee=gi("revEE").value,w=gi("revWhy").value.trim();
    if(!is||!ie||!es||!ee)return alert("Set all four dates");
    if(ie>ee)return alert("Internal deadline cannot sit after the external end");
    // THE REASON IS MANDATORY. It used to fall back to the words "dates
    // revised", which is a record that looks like one and says nothing. A
    // baseline exists to be argued with later . in a claim, in an EOT, in a
    // review . and a version whose reason is a placeholder cannot be.
    // Length alone is not the test: "revised" is seven characters and says
    // nothing. So a reason must be long enough to be a sentence AND must not
    // be one of the filler phrases that read like a record without being one.
    const FILLER=/^(the\s+)?(dates?\s*)?(are\s+)?(revised|revision|updated|update|changed|change|moved|slipped|new\s+dates?|re-?plan(ned)?)\.?$/i;
    if(w.length<10||FILLER.test(w)){
      gi("revWhy").focus();
      return alert("Say why the dates are moving, in a sentence. It goes on the version record and is what an EOT or a claim is argued from later, so \"dates revised\" is not enough.");
    }
    state.win.intStart=is;state.win.intEnd=ie;state.win.extStart=es;state.win.extEnd=ee;
    state.pub.revising=false;state.pub.pendingReason=w;
    state.plan.fronts=null;state._intel=null;saveState();render();
  };
  // ---- the manpower curve goes to the spine on publish ---------------
  // Track mode cannot compute a plan, and Plan mode cannot see a DPR. The
  // published headcount is what the site should be staffed to, so it is
  // written once, at the moment it becomes official, and Track reads it
  // from there. Fire and forget: a publish must never fail because the
  // network is down, and the spine client queues an unsent write anyway.
  function pushManpower(plan, version){
    try{
      if(!SPINE || !MP || !plan || !plan.manpower) return;
      const exec = (typeof TRACK_WALK !== "undefined" && TRACK_WALK.EXEC) || null;
      if(!exec || !PROJ || !PROJ.id) return;
      const io = SPINE.createCaptureIO(exec, PROJ.id);
      const c  = SPINE.createClient({ project: PROJ.id, actor: actor() || "planner",
        store: (function(){try{return localStorage;}catch(e){return null;}})(), io });
      c.append("manpower.set", "v" + version, {
        version: version,
        publishedOn: new Date().toISOString().slice(0,10),
        projectStart: plan.projectStart, projectEnd: plan.projectEnd,
        fronts: plan.fronts, peak: plan.peakWorkers,
        byDayTrade: plan.manpower.byDayTrade,
      }, { source: "plan.publish" });
      c.sync({ cache: true }).catch(function(){});
    }catch(e){ /* never let a publish die on the way to the store */ }
  }

  const doPublish=(R)=>{
    const plan=state._plan||computePlan();
    const vs=state.pub.versions;
    vs.push({v:vs.length+1,ts:new Date().toISOString(),who:actor(),sig:planSig(),
      fronts:plan.fronts,projectStart:plan.projectStart,projectEnd:plan.projectEnd,
      workingDays:plan.workingDays,peakWorkers:plan.peakWorkers,
      reason:state.pub.pendingReason||(vs.length?"(no reason given)":"Original plan — contract dates frozen"),
      tests:{pass:R.summary.pass,warn:R.summary.warn,fail:R.summary.fail,ack:R.summary.warn>0,
        flags:R.checks.filter(c=>c.status!=="pass").map(c=>c.id+" "+c.name)},
      snap:JSON.parse(JSON.stringify({win:state.win,answers:state.answers,fronts:plan.fronts}))});
    pushManpower(plan, vs.length);
    state.pub.pendingReason=null;state.pub.gate=null;state._vplans={};
    const nv=vs[vs.length-1];
    state.instr.result={summary:(nv.v===1?"Original plan":"Revision "+(nv.v-1))+" published — finish "+fmtS(plan.projectEnd)+" · "+nv.tests.pass+" checks passed"+(nv.tests.warn?", "+nv.tests.warn+" warnings signed":"")+" · every version stays openable"};
    saveState();render();
    try{window.scrollTo({top:0,left:0,behavior:"smooth"});}catch(e){}
  };
  _doPublishRef=doPublish;
  const pb=gi("btnPublish");
  if(pb)pb.onclick=publishFlow;
  if(gi("pubAck"))gi("pubAck").onclick=()=>doPublishGate();
  if(gi("pubCancel"))gi("pubCancel").onclick=()=>{state.pub.gate=null;render();};
}

  // doPublish is defined inside wirePlan and assigns itself to
  // _doPublishRef, so the gate and the publish stay one self contained
  // pair. Nothing outside needs to reach in.
  return { publishFlow, doPublishGate, wirePlan };
}

root.PLAN_PUBLISH = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_PUBLISH;

})(typeof window !== "undefined" ? window : globalThis);
