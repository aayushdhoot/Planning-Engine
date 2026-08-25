// ===================================================================
// DnB-OS . platform/plan/compute.js . THE PLANNING COMPUTE LAYER
// Phase 0b, tranche 2. Everything the planning engine works OUT, with
// no HTML in it: the dated plan, the intelligence pass, the testing
// pass, the long lead runway, the grouping and tree the views read,
// and the earned value curve.
//
//   install(deps) -> the compute layer, bound to one project
//
// Why install runs again on every project switch: activateProject
// REASSIGNS PROJ, BOQ, ZNAME and zoneCaps. A closure that captured
// them once at boot would keep planning the project the user just
// navigated away from, and every number on screen would be quietly
// wrong rather than visibly broken. The template calls installCompute()
// at the end of activateProject for exactly this reason.
//
// Bodies are moved VERBATIM from the template. The names the views call
// are unchanged, so the diff carries no behaviour change to review, and
// tests/plan_render_baseline.js proves all 20 views paint byte
// identical HTML.
// ===================================================================

;(function (root) {

// taxonomy: trade -> Category / Sub-category (Flipspaces WBS template can replace this later)
const CATMAP={demolition:["Demolition","Strip-out"],civil:["Civil & wet works","Masonry, screed & waterproofing"],
  drywall:["Partitions","Drywall system"],ceiling:["Ceilings","Gypsum & grid"],flooring:["Flooring","Floor finishes"],
  painting:["Painting","Prep & paint"],joinery:["Joinery & fit-out","Joinery, glazing, doors"],
  hvac:["MEP","HVAC"],electrical:["MEP","Electrical"],plumbing:["MEP","Plumbing"],fire:["MEP","Fire"],elv:["MEP","ELV & networking"],
  closeout:["Handover","Clean & handover"],statutory:["Approvals & statutory","Liaison, NOC & municipal"]};
// the enabling chain groups by STAGE, not by one fat sub-category
const ENABLING_SUB={pkg_design:"Design & client approvals",pkg_approval:"Design & client approvals",
  pkg_po:"Vendor award & submittals",pkg_submittal:"Vendor award & submittals",
  pkg_mfg:"Manufacture & deliveries",pkg_delivery:"Manufacture & deliveries"};

const catOf=t=>t.gate?["Coordination holds",t.name]
  :t.trade==="enabling"?["Design & procurement",ENABLING_SUB[t.code]||"Enabling"]
  :(CATMAP[t.trade]||["Other",t.trade||"other"]);

function phaseOf(t,W){ const e=t.EF||t.end; for(const w of W){ if(e<=w.date)return w; } return W[W.length-1]; }

function install(deps) {
  const { state, PROJ, BOQ, ZNAME, zoneCaps,
          CAL, CALP, COND, DUR, SEQ, TAKT, INTEL, BOQMAP, VERIFY, ALLOC, BUF, KIT, planSig, actor } = deps;
  const { fmtS, daysBetween, MN } = KIT;

function dayState(iso){
  const c=state.cal,dow=CAL._d(iso).getUTCDay();
  if(c.weeklyOffs.includes(dow))return{s:"off",label:"Weekly off"};
  const h=c.holidays.find(x=>x.date===iso);
  if(h&&h.siteOff)return{s:"shut",label:"Site shut · "+h.name};
  if(h&&!h.siteOff)return{s:"fewer",label:"Fewer men ("+Math.round((h.workFactor||0.7)*100)+"%) · "+h.name};
  return{s:"work",label:"Working day"};
}
const inMonsoon=iso=>{const m=state.cal.monsoon;return m&&iso>=m.from&&iso<=m.to;};
function breakdown(){const start=state.win.intStart,end=state.win.extEnd;let work=0,off=0,shut=0,cal=0,cur=CAL._d(start),E=CAL._d(end).getTime();
  while(cur.getTime()<=E){const st=dayState(CAL._iso(cur));cal++;if(st.s==="off")off++;else if(st.s==="shut")shut++;else work++;cur=CAL._add(cur,1);}
  return{cal,work,off,shut,start,end};}
function monthRangeLabel(){const S=CAL._d(state.win.intStart),E=CAL._d(state.win.extEnd);
  return MN[S.getUTCMonth()]+(S.getUTCMonth()!==E.getUTCMonth()?"–"+MN[E.getUTCMonth()]:"")+" "+E.getUTCFullYear();}

// ===================================================================
// EARNED VALUE — built from the corpus law (Firstsource weightage +
// TCS weekly S-curve, 2 witnesses). Weightage is ENGINE-DERIVED
// (effort share = durWD x crew), the curve from plan dates, actuals
// from recorded facts. Deterministic: same inputs, same curve.
// ===================================================================
function evData(){
  const plan=state._plan||computePlan(); state._plan=plan;
  const real=plan.tasks.filter(t=>!t.gate);
  const today=new Date().toISOString().slice(0,10);
  const effort=t=>(t.durWD||1)*((DUR.get(t.code)||{}).crew||1);
  const total=real.reduce((s,t)=>s+effort(t),0)||1;
  // weekly buckets from projectStart to the later of plan end / committed end
  const endISO=plan.projectEnd>state.win.extEnd?plan.projectEnd:state.win.extEnd;
  const weeks=[];let d=plan.projectStart;
  while(d<=endISO){weeks.push(d);d=CAL._iso(CAL._add(CAL._d(d),7));}
  const wIdx=iso=>{const off=Math.floor(daysBetween(plan.projectStart,iso)/7);return Math.max(0,Math.min(weeks.length-1,off));};
  // planned cumulative: distribute each task's effort linearly across its span
  const planned=new Array(weeks.length).fill(0);
  real.forEach(t=>{
    const a=wIdx(t.ES),b=wIdx(t.EF),e=effort(t)/total,n=b-a+1;
    for(let k=a;k<=b;k++)planned[k]+=e/n;
  });
  for(let k=1;k<weeks.length;k++)planned[k]+=planned[k-1];
  // baseline = Original publish if present (frozen curve), else current
  let baseline=null;
  const v1=state.pub.versions[0];
  if(v1&&v1.snap){const bp=planFor(v1);const breal=bp.tasks.filter(t=>!t.gate);
    const bt=breal.reduce((s,t)=>s+effort(t),0)||1;
    baseline=new Array(weeks.length).fill(0);
    breal.forEach(t=>{const a=wIdx(t.ES),b=wIdx(t.EF),e=effort(t)/bt,n=b-a+1;
      for(let k=a;k<=b;k++)if(k<baseline.length)baseline[k]+=e/n;});
    for(let k=1;k<weeks.length;k++)baseline[k]+=baseline[k-1];}
  // actual %: from recorded facts (done=1, pct facts, started=elapsed est.)
  const P=state.answers.progress||[];
  const factOf=t=>P.find(p=>(p.id&&p.id===t.id)||(p.code&&p.code===t.code&&(!p.zone||p.zone===t.zone)));
  let doneE=0,factCount=0;const vel=[];
  real.forEach(t=>{
    const f=factOf(t);if(!f)return;factCount++;
    let pct=0;
    if(f.af)pct=1;
    else if(f.pct!=null)pct=f.pct;
    else if(f.as){const spent=Math.max(0,CAL.workingDaysBetween(f.as,today,state.cal));pct=Math.min(0.9,spent/Math.max(1,t.durWD));}
    doneE+=pct*effort(t)/total;
    // planned % of THIS task at today
    let pp;
    if(today<t.ES)pp=0;else if(today>t.EF)pp=1;
    else pp=Math.min(1,Math.max(0,CAL.workingDaysBetween(t.ES,today,state.cal)/Math.max(1,t.durWD)));
    vel.push({t,pct,pp,ratio:pp>0.02?+(pct/pp).toFixed(2):null,supply:t.trade==="enabling"||String(t.id).startsWith("pkg:")||String(t.id).startsWith("dwg:")});
  });
  const kToday=wIdx(today>endISO?endISO:today);
  const actual=new Array(Math.min(kToday+1,weeks.length)).fill(null);
  // build actual curve: facts with af distribute to their af week; pct facts land at today
  const actInc=new Array(weeks.length).fill(0);
  real.forEach(t=>{const f=factOf(t);if(!f)return;
    const e=effort(t)/total;
    if(f.af){actInc[wIdx(f.af)]+=e;}
    else{let pct=f.pct!=null?f.pct:(f.as?Math.min(0.9,Math.max(0,CAL.workingDaysBetween(f.as,today,state.cal))/Math.max(1,t.durWD)):0);actInc[kToday]+=e*pct;}});
  let acc=0;for(let k=0;k<actual.length;k++){acc+=actInc[k];actual[k]=acc;}
  return {plan,weeks,planned,baseline,actual,kToday,doneE,factCount,vel,total,today};
}

function computeIntel(){
  const akey = JSON.stringify(state.answers);
  if (state._intel && state._intel.akey === akey) return state._intel;
  // enabling-chain answers flow into the library BEFORE tasks are built
  SEQ.OPTS.aprWd = state.answers.aprWd || null;
  SEQ.OPTS.preOrder = state.answers.preOrder || {};
  SEQ.OPTS.ductMethod = state.answers.ductMethod || "wrap";
  const read = BOQ ? BOQMAP.apply(BOQ) : {byCode:{},classed:{},unread:[],suggestions:[]};
  const v0 = {}; PROJ.buildTasks().forEach(t=>v0[t.code]=(v0[t.code]||0)+t.qty);
  // your confirmed answers change the maths — no silent assumptions
  const AB = state.answers.areaBasis;
  const AR = PROJ.areas||{};
  if (AB === "boq" && AR.boq)  Object.keys(v0).forEach(c => v0[c] = v0[c] * (AR.boq/AR.deck));
  if (AB === "deck" && AR.boq) Object.keys(read.byCode).forEach(c => read.byCode[c].qty = Math.round(read.byCode[c].qty * (AR.deck/AR.boq)));
  const recon = INTEL.reconcile(v0, read.byCode);
  if (AB || !BOQ) { recon.basisRatio = 1; recon.explained = 0; }
  // your row-by-row resolutions close their conflicts
  const RES = state.answers.resolved || {};
  recon.forEach(r => { if (RES[r.code]) { r.verdict = "resolved"; r.pick = RES[r.code]; } });
  const QO = state.answers.qtyOverride || {};
  recon.forEach(r => { if (QO[r.code] != null) { r.verdict = "resolved"; r.pick = "you"; r.boq = QO[r.code]; } });
  const due = new Date(Date.now()+7*864e5).toISOString().slice(0,10);
  let queries = INTEL.buildQueries(recon, BOQ, read.suggestions,
    AB||!BOQ ? {dueISO:due, hasBoq:!!BOQ, kt:PROJ.kt, answers:state.answers, todayISO:new Date().toISOString().slice(0,10), intStart:state.win.intStart, zonesFull:PROJ.zones.filter(z=>!(state.answers.zonesOff||[]).includes(z.id))}
             : {deckSqft:AR.deck, boqSqft:AR.boq, dueISO:due, hasBoq:true, kt:PROJ.kt, answers:state.answers, todayISO:new Date().toISOString().slice(0,10), intStart:state.win.intStart, zonesFull:PROJ.zones.filter(z=>!(state.answers.zonesOff||[]).includes(z.id))});
  const QD = state.answers.qdone || {};
  queries.forEach(q => { if (QD[q.id]) q.status = QD[q.id]; });
  const doneQ = queries.filter(q => q.status !== "open");
  queries = queries.filter(q => q.status === "open");
  const inputs = [
    BOQ?{name:"Priced BOQ", status:"read", took:BOQ.lines.length+" lines · ₹"+(BOQ.totalAmount/1e7).toFixed(2)+" Cr — quantities now feed the plan", conf:"high"}
       :{name:"Priced BOQ", status:"pending", took:"not read yet — plan rides on layout areas × standard factors, all flagged", conf:""},
    {name:"Design layout / deck", status:"read", took:PROJ.zones.length+" zones with areas and traits", conf:PROJ.hasBoq?"high":"med"},
    {name:"Start & end dates", status:state.answers.datesConfirmed?"read":"partial", took:(state.answers.datesConfirmed?"confirmed: ":"")+"internal "+state.win.intStart.slice(5)+"→"+(state.win.intEnd?state.win.intEnd.slice(5):"not set")+" · external "+state.win.extStart.slice(5)+"→"+state.win.extEnd.slice(5)+(PROJ.kt&&PROJ.kt.ld?" — KT note read: "+PROJ.kt.ld:" — no contract terms have been read into the engine for this project"), conf:state.answers.datesConfirmed?"high":"med"},
    {name:"GFC drawings", status:"pending", took:"47 drawings known from the register · contents unread — zone quantities stay deck-based until read", conf:""},
    {name:"Site photos / videos", status:"pending", took:"existing condition + demolition scope", conf:""},
    {name:"Fit-out & brand manuals", status:"pending", took:"may add tasks: permits, approved vendors, working-hour limits", conf:""},
    {name:"Meeting minutes (MOMs)", status:"pending", took:"decisions that change scope or dates — always confirmed with you first", conf:""},
    ...(PROJ.extraInputs||[]),
  ];
  const ready = INTEL.readiness(recon, queries, inputs);
  let tasksQ = INTEL.applyQuantities(PROJ.buildTasks(), recon, RES);
  // suggestions you accepted become real, dated, LOW-confidence tasks
  read.suggestions.forEach(sg => {
    if (QD["Q-ADD-"+sg.line] === "accepted" && sg.add)
      tasksQ.push({ id:"add:"+sg.line+":"+sg.add.code, code:sg.add.code, zone:sg.add.zone,
        qty:sg.add.qty, conf:"low", src:"accepted from BOQ "+sg.line+" — proxy zone/effort, confirm", qsrc:"accepted" });
  });
  // your written corrections outrank everything
  Object.keys(QO).forEach(code => {
    const total = tasksQ.filter(t=>t.code===code).reduce((s,t)=>s+t.qty,0);
    if (!total) return;
    tasksQ = tasksQ.map(t => t.code!==code ? t :
      Object.assign({}, t, { qty:Math.max(1,Math.round(t.qty*QO[code]/total)), conf:"high", src:"corrected by you in the instruction box", qsrc:"instruction" }));
  });
  // zones you removed from scope
  const ZOFF = state.answers.zonesOff || [];
  if (ZOFF.length) tasksQ = tasksQ.filter(t => !ZOFF.includes(t.zone));
  state._intel = { akey, read, recon, queries, doneQ, inputs, ready, tasksQ };
  return state._intel;
}

function computeChecks(){
  const key=planSig()+"|"+state.cal.audit.length;
  if(state._checks&&state._checks.key===key)return state._checks.result;
  const I=computeIntel();
  const plan=state._plan&&!state.pub.viewing?state._plan:computePlan();
  const plan2=TAKT.level(I.tasksQ,state.cal,{start:state.win.intStart,zoneCaps,fronts:plan.fronts,pins:state.answers.progress||[],conditions:state.answers.conditions});
  const vs=state.pub.versions;
  const R=VERIFY.verify({
    plan, plan2, tasks:I.tasksQ,
    intel:{recon:I.recon,queries:I.queries,inputs:I.inputs,ready:I.ready,read:I.read},
    win:state.win, cal:state.cal, answers:state.answers,
    zones:PROJ.zones, zoneCaps, leads:longLeads(plan), boqLines:BOQ?BOQ.lines.length:0,
    baseline:vs[0]||null, lastVersion:vs[vs.length-1]||null, kt:PROJ.kt||null,
  });
  state._checks={key,result:R};
  return R;
}

function computePlan(){
  SEQ.OPTS.shellHold = state.answers.shellHold!=null ? !!state.answers.shellHold : !!PROJ.shellHold;
  // memo key: anything that changes the physics
  const key = planSig()+"|"+state.cal.audit.length;
  if (state._memo.key !== key) state._memo = { key, plans:{} };
  const M = state._memo;
  const tasksQ = computeIntel().tasksQ;
  if (!M.rows) {
    M.rows = TAKT.sweep(tasksQ, state.cal, { start: state.win.intStart, zoneCaps, max: 12, pins: state.answers.progress||[], conditions: state.answers.conditions }); // his call 11 Jul: deadline holds, manpower is the lever
    M.rec = TAKT.recommend(M.rows, state.win.intEnd || state.win.extEnd);
  }
  const F = state.plan.fronts || M.rec.fronts;
  if (!M.plans[F])
    M.plans[F] = TAKT.level(tasksQ, state.cal, { start: state.win.intStart, zoneCaps, fronts: F, pins: state.answers.progress||[], conditions: state.answers.conditions });
  const plan = M.plans[F];
  plan.qty = PROJ.qtyMap();
  plan.rows = M.rows; plan.rec = M.rec; plan.fronts = F;
  return plan;
}

// ---- the facts the buffer law reads --------------------------------
// Assembled here rather than inside buffer.js, because every one of them
// is something an earlier phase already established. The buffer forms no
// opinion of its own; it prices what the engine already knows.
function bufferFacts(){
  const I = computeIntel();
  const plan = state._plan || computePlan();
  const real = plan.tasks.filter(t=>!t.gate);
  const lowConf = real.filter(t=>String(t.conf||"med").toLowerCase()==="low").length;
  const leads = longLeads(plan).filter(l=>l.crit).length;
  const mons = state.cal && state.cal.monsoon;
  return {
    hasBoq: !!BOQ,
    openQueries: (I.queries||[]).length,
    openConditions: COND ? COND.assumptions(state.answers.conditions).length : 0,
    unallocated: ALLOC ? ALLOC.assign(plan.tasks, state.answers.people||[]).unallocated.length : 0,
    criticalLeads: leads,
    lowConfShare: real.length ? lowConf/real.length : 0,
    monsoonTail: !!(mons && plan.projectEnd >= mons.from && plan.projectEnd <= mons.to),
  };
}
// the two dates, resolved. The override lives on answers so it is inside
// planSig and a change re-plans like any other answer.
function bufferNow(){
  if (!BUF) return null;
  return BUF.resolve(state.win, bufferFacts(), state.answers.bufferDays,
    (iso,n)=>CAL._iso(CAL._add(CAL._d(iso), n)));
}

const zname=id=>ZNAME[id]||id;
const unitOf=code=>{const n=DUR.get?DUR.get(code):null;return n?n.unit:"";};
const tgtName=()=>state.win.intEnd?"internal":"external";

function longLeads(plan){
  // chain-aware: where the enabling chain runs, the ORDER-BY date is the
  // PO task's planned start (a real, chaseable task) and "on site" is the
  // delivery finish. Codes outside any package fall back to the lead-week
  // offset arithmetic.
  const out=[], inPkg={};
  const byId={};plan.tasks.forEach(t=>byId[t.id]=t);
  (SEQ.PACKAGES||[]).forEach(p=>{
    const po=byId["pkg:"+p.id+":po"],dlv=byId["pkg:"+p.id+":delivery"];
    if(!po||!dlv)return;
    p.codes.forEach(c=>inPkg[c]=1);
    const insts=plan.tasks.filter(t=>p.codes.includes(t.code)&&!t.gate);
    if(!insts.length)return;
    const firstES=insts.map(t=>t.ES).sort()[0];
    out.push({code:p.id,name:p.name,weeks:p.lead,ES:dlv.EF,crit:insts.some(t=>t.critical)||dlv.EF>=firstES,
      zones:[...new Set(insts.map(t=>t.zone))],orderBy:po.ES,chain:true});
  });
  const m={};
  plan.tasks.forEach(t=>{
    if(!t.leadWeeks||t.gate||inPkg[t.code])return;
    const e=m[t.code]=m[t.code]||{name:t.name,weeks:t.leadWeeks,ES:t.ES,zones:{},crit:false};
    if(t.ES<e.ES)e.ES=t.ES;
    e.zones[t.zone]=1; e.crit=e.crit||t.critical;
  });
  Object.keys(m).forEach(k=>{const e=m[k];
    out.push({code:k,name:e.name,weeks:e.weeks,ES:e.ES,crit:e.crit,zones:Object.keys(e.zones),
      orderBy:CAL._iso(CAL._add(CAL._d(e.ES),-e.weeks*7))});
  });
  return out.sort((a,b)=>a.orderBy<b.orderBy?-1:1);
}

function planGroups(plan){
  const g=state.plan.groupBy, m={};
  let OWN=null;
  if((g==="dept"||g==="person") && ALLOC){
    const A=ALLOC.assign(plan.tasks, state.answers.people||[]);
    OWN={}; A.rows.forEach(r=>OWN[r.id]=r);
  }
  const keyOf=t=>{
    if(g==="dept")  return OWN&&OWN[t.id]?OWN[t.id].dept:"unallocated";
    if(g==="person")return OWN&&OWN[t.id]&&OWN[t.id].ownerId?OWN[t.id].ownerId:"__none";
    if(t.gate)return g==="zone"?t.zone:"__gates";
    if(g==="zone")return t.zone;
    if(g==="trade")return t.trade||"other";
    return "p"+Math.floor(SEQ.phaseOf(t.code));
  };
  const labOf=k=>{
    if(g==="dept")  return k==="unallocated"?"Nobody yet":(ALLOC?ALLOC.DEPT_LABEL[k]||k:k);
    if(g==="person"){ if(k==="__none")return "Nobody yet";
      const r=OWN?Object.values(OWN).find(x=>x.ownerId===k):null; return r?r.owner:k; }
    if(k==="__gates")return "Coordination holds";
    if(g==="zone")return zname(k);
    if(g==="trade")return k.charAt(0).toUpperCase()+k.slice(1);
    return SEQ.phaseLabel(+k.slice(1));
  };
  plan.tasks.forEach(t=>{
    if(state.plan.critOnly&&!t.critical)return;
    const k=keyOf(t);(m[k]=m[k]||[]).push(t);
  });
  return Object.keys(m).map(k=>{
    const ts=m[k],real=ts.filter(t=>!t.gate);
    const es=ts.reduce((a,t)=>t.ES<a?t.ES:a,ts[0].ES), ef=ts.reduce((a,t)=>t.EF>a?t.EF:a,ts[0].EF);
    return {key:k,label:labOf(k),tasks:ts,es,ef,crit:real.filter(t=>t.critical).length,n:real.length};
  }).sort((a,b)=>a.es<b.es?-1:a.es>b.es?1:0);
}

// hierarchical tree: level1 (category|zone) -> level2 (sub|category) -> tasks
function phaseWindows(){
  // an EMPTY raGates array is truthy, so it passed this guard and then
  // W[W.length-1].day threw on the empty list . a project whose contract has
  // not been transcribed yet has no phases, and must fall back, not crash
  if(!(PROJ.kt&&PROJ.kt.raGates&&PROJ.kt.raGates.length&&state.win.extStart))return null;
  const W=PROJ.kt.raGates.map(g=>({key:g.ra.toLowerCase(),ra:g.ra,day:g.day,pay:g.pay,desc:g.gate,codes:g.codes,
    date:CAL._iso(CAL._add(CAL._d(state.win.extStart),g.day))}));
  W.push({key:"beyond",ra:"Beyond day "+(W[W.length-1].day),day:9999,pay:"",desc:"past the contract handover gate",codes:[],date:"9999-12-31"});
  return W;
}
function planTree(plan){
  let g=state.plan.groupBy;
  const PW=g==="phase"?phaseWindows():null;
  if(g==="phase"&&!PW)g="cat";
  // Department and person come from the allocation law, never from a second
  // opinion here . two places deciding who owns a task is how a plan and a
  // team screen end up disagreeing about the same line.
  let OWN=null;
  if((g==="dept"||g==="person") && ALLOC){
    const A=ALLOC.assign(plan.tasks, state.answers.people||[]);
    OWN={}; A.rows.forEach(r=>OWN[r.id]=r);
    // with nobody on the roster a person view has nothing to say, so it
    // falls back rather than drawing one giant "unallocated" heap
    if(g==="person" && !A.allocated) g="cat";
  }
  const tree={};
  plan.tasks.forEach(t=>{
    if(state.plan.critOnly&&!t.critical&&!t.gate)return;
    const [cat,sub]=catOf(t);
    const ph=PW?phaseOf(t,PW):null;
    const own=OWN?OWN[t.id]:null;
    const k1=g==="phase"?ph.key
      :g==="zone"?(t.zone||"—")
      :g==="dept"?(own?own.dept:"unallocated")
      :g==="person"?(own&&own.ownerId?own.ownerId:"__none")
      :cat;
    const l1=g==="phase"?(ph.pay?`${ph.ra} · to ${fmtS(ph.date)} · ${ph.pay}`:ph.ra)
      :g==="zone"?zname(t.zone)
      :g==="dept"?(own?own.deptLabel:"Nobody yet")
      :g==="person"?(own&&own.owner?own.owner+(own.deptLabel?" · "+own.deptLabel:""):"Nobody yet")
      :cat;
    const k2=(g==="zone"||g==="phase"||g==="dept"||g==="person")?cat:sub;
    const n1=tree[k1]=tree[k1]||{key:k1,label:l1,es:t.ES,ef:t.EF,n:0,crit:0,subs:{}};
    const n2=n1.subs[k2]=n1.subs[k2]||{key:k1+"·"+k2,label:k2,es:t.ES,ef:t.EF,n:0,crit:0,tasks:[],acts:{}};
    [n1,n2].forEach(x=>{if(t.ES<x.es)x.es=t.ES;if(t.EF>x.ef)x.ef=t.EF;if(!t.gate){x.n++;if(t.critical)x.crit++;}else x.holds=(x.holds||0)+1;});
    n2.tasks.push(t);
    if(!t.gate){
      const ak=t.code||t.name;
      const a=n2.acts[ak]=n2.acts[ak]||{key:n2.key+"·"+ak,label:t.name,es:t.ES,ef:t.EF,n:0,crit:0,qty:0,wd:0,unit:unitOf(t.code),zones:{}};
      if(t.ES<a.es)a.es=t.ES;if(t.EF>a.ef)a.ef=t.EF;a.n++;if(t.critical)a.crit++;a.qty+=t.qty||0;a.wd+=t.durWD||0;if(t.zone)a.zones[t.zone]=1;
    }
  });
  const out=Object.values(tree).map(n1=>{n1.subs=Object.values(n1.subs).map(n2=>{n2.acts=Object.values(n2.acts).sort((a,b)=>a.es<b.es?-1:1);return n2;}).sort((a,b)=>a.es<b.es?-1:1);return n1;})
    .sort((a,b)=>a.es<b.es?-1:a.es>b.es?1:0);
  if(PW&&state.plan.groupBy==="phase"){
    const order={};PW.forEach((w,i)=>order[w.key]=i);
    out.sort((a,b)=>order[a.key]-order[b.key]);
    // gate verdict per phase: the contract BASKET (by codes) vs the gate date — same arithmetic as testing layer CM-6..9
    out.forEach(n=>{
      const w=PW.find(x=>x.key===n.key); if(!w||!w.codes.length){n.gatechip=w&&w.key==="beyond"?{late:true,txt:"breaches the contract window"}:null;return;}
      const basket=plan.tasks.filter(t=>!t.gate&&w.codes.includes(t.code));
      const bEnd=basket.length?basket.map(t=>t.EF||t.end).sort().pop():null;
      if(!bEnd){n.gatechip=null;return;}
      const dd=Math.round((CAL._d(w.date)-CAL._d(bEnd))/86400000);
      n.gatechip=dd>=0?{late:false,txt:`gate clear · ${dd}d`}:{late:true,txt:`basket late ${-dd}d`};
    });
  }
  return out;
}

function planFor(v){
  state._vplans=state._vplans||{};
  if(state._vplans[v.v])return state._vplans[v.v];
  const keep={win:state.win,answers:state.answers,fronts:state.plan.fronts,intel:state._intel,memo:state._memo};
  state.win=v.snap.win;state.answers=v.snap.answers;state.plan.fronts=v.snap.fronts;
  state._intel=null;state._memo={};
  const p=computePlan();
  state.win=keep.win;state.answers=keep.answers;state.plan.fronts=keep.fronts;
  state._intel=keep.intel;state._memo=keep.memo;
  state._vplans[v.v]=p;return p;
}

// ---- applying an instruction to the state -------------------------
// These live here, below every view, on purpose. BOTH the scoped
// instruction box (view_knowledge) and the chat box (chat.js) apply
// changes, so if they sat in either one the other would have to depend
// on it and the install order would form a cycle: knowledge needs
// instrApplyChanges, chat needs export, export needs the plan view, the
// plan view needs knowledge. They touch no view and no DOM beyond the
// actor name, so this is where they belong.
function instrSnapshot(){
  return JSON.parse(JSON.stringify({ win:state.win, answers:state.answers, fronts:state.plan.fronts, cal:state.cal }));
}
function instrApplyChanges(changes){
  const who=actor();
  changes.forEach(c=>{
    if(c.kind==="area") state.answers.areaBasis=c.value;
    if(c.kind==="fronts") state.plan.fronts=c.value;
    if(c.kind==="buffer"){ state.win.intEnd=CAL._iso(CAL._add(CAL._d(state.win.extEnd),-c.value)); state.answers.datesConfirmed=true; }
    if(c.kind==="slip") state.win.intStart=CAL._iso(CAL._add(CAL._d(state.win.intStart),c.value));
    if(c.kind==="date"){
      if(c.field==="bothStart"){ state.win.intStart=c.value; state.win.extStart=c.value; }
      else state.win[c.field]=c.value;
      if(state.win.intEnd&&state.win.intEnd>state.win.extEnd) state.win.intEnd=state.win.extEnd;
    }
    if(c.kind==="shut"){
      let d=c.from;
      while(d<=c.to){ try{ CALP.addHoliday(state.cal,{date:d,name:"Site shut — your instruction",kind:"custom",siteOff:true},who); }catch(e){} d=CAL._iso(CAL._add(CAL._d(d),1)); }
    }
    if(c.kind==="shellHold") state.answers.shellHold=c.value;
    if(c.kind==="aprsla"){ state.answers.aprWd=c.value; state.answers.qdone["Q-APR-SLA"]="answered"; }
    if(c.kind==="ductmethod"){ state.answers.ductMethod=c.value; state.answers.qdone["Q-DUCT-METHOD"]="answered"; }
    if(c.kind==="preorder"){ const P=state.answers.preOrder=state.answers.preOrder||{}; if(c.pkg==="all"){Object.keys(P).forEach(k=>delete P[k]); P.all=c.on;} else P[c.pkg]=c.on; }
    if(c.kind==="deadlinelock"){ state.answers.deadlineLock=c.value; }
    if(c.kind==="progressclear"){ state.answers.progress=[]; }
    if(c.kind==="progress"){ const L=state.answers.progress=state.answers.progress||[];
      const same=r=>(c.id&&r.id===c.id)||(!c.id&&!r.id&&r.code===c.code&&(r.zone||null)===(c.zone||null));
      const i=L.findIndex(same); const rec={id:c.id||null,code:c.code||null,zone:c.zone||null,as:c.as||null,af:c.af||null,pct:c.pct!=null?c.pct:null,eta:c.eta||null};
      if(i>=0)L[i]=Object.assign({},L[i],rec);else L.push(rec); }
    if(c.kind==="zoneOff"&&!state.answers.zonesOff.includes(c.zone)) state.answers.zonesOff.push(c.zone);
    if(c.kind==="zoneOn") state.answers.zonesOff=state.answers.zonesOff.filter(z=>z!==c.zone);
    if(c.kind==="qty") state.answers.qtyOverride[c.code]=c.value;
    if(c.kind==="approveCal"){ try{CALP.approve(state.cal,who);}catch(e){} }
    if(c.kind==="datesOk"){ if(state.win.intEnd)state.answers.datesConfirmed=true; }
    if(c.kind==="resolve") state.answers.resolved[c.code]=c.pick;
    if(c.kind==="suggest") state.answers.qdone["Q-ADD-"+c.line]=c.action;
    if(c.kind==="suggestAll") c.lines.forEach(l=>state.answers.qdone["Q-ADD-"+l]=c.action);
  });
  // dates confirm rides along a same-sentence internal-deadline change
  if(changes.some(c=>c.kind==="datesOk")&&state.win.intEnd)state.answers.datesConfirmed=true;
}

  return { dayState, inMonsoon, breakdown, monthRangeLabel, evData,
    computeIntel, computeChecks, computePlan, zname, unitOf, tgtName,
    longLeads, planGroups, catOf, phaseWindows, phaseOf, planTree, planFor,
    instrSnapshot, instrApplyChanges, bufferFacts, bufferNow };
}

root.PLAN_COMPUTE = { install, CATMAP, ENABLING_SUB, catOf, phaseOf };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_COMPUTE;

})(typeof window !== "undefined" ? window : globalThis);
