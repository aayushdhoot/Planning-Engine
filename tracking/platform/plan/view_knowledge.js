// ===================================================================
// DnB-OS . platform/plan/view_knowledge.js . SCOPED BOX, KNOWLEDGE, CORPUS
// Phase 0b, tranche 7. What the engine KNOWS, and the box that lets a
// human argue with it:
//   . the scoped instruction box, the one place a user writes a plain
//     sentence at the engine ("use 6 fronts", "site shut 21 to 25 aug")
//     and it becomes a change with a label and an undo.
//   . Engine knowledge . the sequence library, what runs in parallel,
//     the inspection gates, throughput, procurement leads and the site
//     wide rules. The authored source of truth the verifier checks.
//   . Training corpus . the plans absorbed, the cross plan verdicts, the
//     calibrations they caused and the vocabulary learned.
//
//   install(deps) -> the views, the scoped box and their wiring
//
// scopedBox is handed to FOUR other view modules, so this installs
// FIRST of all the view modules. The template's activateProject orders
// them and reversing it is a real breakage, not a style point.
//
// Bodies moved VERBATIM, lifted by script.
// ===================================================================

;(function (root) {

function install(deps) {
  // NOTE: no corpus dep. knowledgeView and corpusView each read
  // window.KB_CORPUS into their own local C, exactly as they did in the
  // template. Adding a C dep here invented one that never existed.
  const { state, PROJ, CAL, DUR, SEQ, INSTRUCT, KIT, CMP,
          render, saveState, actor, instrApplyChanges } = deps;
  const { fmt, fmtS, dd, colorFor, scoreCol, stackBar } = KIT;
  const { computeIntel, computePlan, zname, unitOf, CATMAP } = CMP;

const SCOPES={
  progress:{kinds:["progress","progressclear"],ph:"site facts — \"ceiling till 10 nov\" · \"blockwork 60%\" · \"demolition done in boardroom\" · \"joinery po done\""},
  plan:{kinds:["fronts","preorder","deadlinelock","date","buffer","slip","shellHold","aprsla","ductmethod"],ph:"plan levers — \"use 6 fronts\" · \"pre-order everything\" · \"deadline is locked\" · \"external end 5 nov\""},
  calendar:{kinds:["shut","date"],ph:"calendar — \"site shut 21 aug to 25 aug\" · \"internal start 15 jul\""},
  queries:{kinds:["area","qty","aprsla","ductmethod","zoneOff","zoneOn"],ph:"answers — \"BOQ is right\" · \"approvals take 7 days\" · \"ducts are pre-insulated\" · \"lights are 500 nos\""},
};
function scopedBox(scope){
  const sc=SCOPES[scope];if(!sc)return"";
  return `<div class="panel" style="margin-bottom:14px"><div class="pb" style="display:flex;gap:10px;align-items:center;padding:10px 14px">
    <span style="font-size:15px">✦</span>
    <input id="scopedIn" data-scope="${scope}" placeholder='${sc.ph}' style="flex:1;border:none;outline:none;font-size:13px;background:transparent">
    <button class="btn pri mini" id="scopedGo">Do it</button></div>
    <div id="scopedMsg" style="display:none;padding:0 14px 10px;font-size:12.5px"></div></div>`;
}
function wireScoped(){
  const inp=document.getElementById("scopedIn");if(!inp)return;
  const scope=inp.dataset.scope,sc=SCOPES[scope];
  const go=()=>{
    const txt=inp.value.trim();if(!txt)return;
    const I=computeIntel();
    const ctx={norms:DUR.NORMS,zones:PROJ.zones,year:state.cal.year,areas:PROJ.areas,hasIntEnd:!!state.win.intEnd,packages:SEQ.PACKAGES,drawings:SEQ.DRAWINGS,
      suggestions:[],conflicts:I.recon.filter(r=>r.verdict==="conflict"||r.verdict==="check").map(r=>({code:r.code,name:r.name}))};
    const r=INSTRUCT.parseCommand(txt,ctx);
    const allowed=(r.changes||[]).filter(c=>sc.kinds.includes(c.kind));
    const rejected=(r.changes||[]).length-allowed.length;
    const msg=document.getElementById("scopedMsg");
    if(!allowed.length){
      msg.style.display="block";
      msg.innerHTML=(r.changes||[]).length
        ?`<span class="warnchip">▲ that belongs elsewhere — this box only takes ${scope} inputs; use the main box below</span>`
        :`<span class="warnchip">✕ could not read "${txt}" — try: ${sc.ph}</span>`;
      return;
    }
    allowed.forEach(c=>c.label=c.label);
    instrApplyChanges(allowed);
    saveState();state._plan=null;state._memo={};state._intel=null;
    inp.value="";
    msg.style.display="block";
    msg.innerHTML=`<span class="kind" style="background:#e7f6ee;color:#1e7a4d">✓ ${allowed.map(c=>c.label).join(" · ")}${rejected?" · ("+rejected+" non-"+scope+" item(s) ignored — use the main box)":""}</span>`;
    setTimeout(()=>render(),50);
  };
  document.getElementById("scopedGo").onclick=go;
  inp.onkeydown=e=>{if(e.key==="Enter")go();};
}
function knowledgeView(){
  const C=window.KB_CORPUS||{EVIDENCE:{},PLANS:[]};
  if(!state.knowledge)state.knowledge={tab:"seq"};
  const TAB=state.knowledge.tab;
  const wit=code=>(C.EVIDENCE[code]||[]).length;
  const witChip=code=>{const w=wit(code);return w?`<span class="kind" title="${w} plan witness${w>1?"es":""}" style="${w>=3?"background:#e7f6ee;color:#1e7a4d;font-weight:600":""}">${w}w</span>`:"";};
  const phase=c=>SEQ.phaseOf(c);
  const catColor=code=>{const n=DUR.get(code);const [cat]=n?(CATMAP[n.trade]||["Other"]):["Other"];return colorFor(cat);};
  const nameOf=c=>(DUR.get(c)||{name:c}).name;
  const relChip=(t,l)=>`<span class="kind" style="${t==="SS"?"background:#ececfb;color:#4a48c4":"background:#f0f6ff;color:#2b5f9e"};font-weight:600;min-width:34px;text-align:center">${t}${l?"+"+l+"d":""}</span>`;
  const qNorms=DUR.NORMS.filter(n=>n.trade!=="enabling");
  const nAfter=Object.values(SEQ.AFTER).reduce((s2,v)=>s2+v.length,0);
  const ssCount=Object.values(SEQ.AFTER).reduce((s2,v)=>s2+v.filter(r=>r.type==="SS").length,0);
  const TABS=[["seq","1 · Sequence"],["par","2 · Parallel"],["gates","3 · Gates"],["th","4 · Throughput"],["leads","5 · Leads & packages"],["site","6 · Site rules"]];
  const tabBar=`<div class="planctl" style="margin-bottom:14px"><span class="seg" id="knowTabs">${TABS.map(([id,l])=>`<button class="acc ${TAB===id?"on":""}" data-t="${id}">${l}</button>`).join("")}</span></div>`;
  let body="";
  if(TAB==="seq"){
    const seqRows=Object.keys(SEQ.AFTER).sort((a2,b2)=>phase(a2)-phase(b2)).map(code=>{
      const n=DUR.get(code);
      const preds=SEQ.AFTER[code].map(r=>`<div style="display:flex;gap:8px;align-items:baseline;margin:3px 0">${relChip(r.type,r.lag)}<span><b style="font-weight:600">${nameOf(r.of)}</b> <small class="faint">— ${r.why}</small></span></div>`).join("");
      return `<tr data-k="${code} ${(n?n.name:"").toLowerCase()} ${(n?n.trade:"")}">
        <td style="width:27%"><div style="display:flex;gap:8px;align-items:baseline"><span class="gdot" style="background:${catColor(code)};flex:none;margin-top:2px"></span>
          <div><b>${n?n.name:code}</b> ${witChip(code)}<br><small class="faint">${code} · phase ${phase(code)}</small></div></div></td>
        <td>${preds}</td></tr>`;}).join("");
    body=`<div class="panel"><div class="ph"><div><h3>Work sequence library — what follows what</h3><p>Every activity declares its physical predecessors, with the why. LG-7 verifies ~1,200 instances on every plan.</p></div>
      <input id="seqFilter" placeholder="filter… ceiling, paint, duct" style="border:1px solid #e3e5ec;border-radius:8px;padding:7px 12px;font-size:12.5px;width:220px"></div>
      <div class="pb" style="padding-top:6px"><table id="seqTable"><thead><tr><th>Activity</th><th>Comes after</th></tr></thead><tbody>${seqRows}</tbody></table></div></div>`;
  }
  if(TAB==="par"){
    const par=(SEQ.CONCURRENCY.parallel_ok||[]).map(r=>`<div style="display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px solid #f4f5f7"><span style="color:#1e7a4d;font-weight:700">∥</span><span><b>${r.rule}</b><br><small class="faint">${r.why}</small></span></div>`).join("");
    const ssRows=[];Object.keys(SEQ.AFTER).forEach(code=>SEQ.AFTER[code].forEach(r=>{if(r.type==="SS")ssRows.push(`<div style="display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px solid #f4f5f7">${relChip("SS",r.lag)}<span><b>${nameOf(code)}</b> runs beside <b>${nameOf(r.of)}</b><br><small class="faint">${r.why}</small></span></div>`);}));
    const nev=(SEQ.CONCURRENCY.never_together||[]).map(r=>`<div style="display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px solid #f9eceb"><span style="color:#c4483a;font-weight:700">✕</span><span><b>${r.a.map(nameOf).join(" / ")}</b> <span class="faint">never share a zone-day with</span> <b>${r.b==="*"?"any other trade":r.b.map(nameOf).join(", ")}</b><br><small class="faint">${r.why}</small></span></div>`).join("");
    body=`<div class="panel"><div class="ph"><div><h3>Parallel work — what runs together, what never does</h3><p>Overlaps are declared, never accidental. LG-11 enforces the exclusions on final dates.</p></div></div>
      <div class="pb" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
        <div><p style="margin:0 0 4px"><b style="color:#1e7a4d">∥ Allowed in parallel</b></p>${par}</div>
        <div><p style="margin:0 0 4px"><b style="color:#4a48c4">⇉ Declared overlaps</b></p>${ssRows.join("")}</div>
        <div><p style="margin:0 0 4px"><b style="color:#c4483a">✕ Never together</b></p>${nev}</div></div></div>`;
  }
  if(TAB==="gates"){
    const gateRows=(SEQ.GATE_RULES||[]).map(g=>`<tr style="background:#fbfaf7">
      <td style="width:24%"><span style="color:#b8860b">◆</span> <b>${g.name}</b><br><small class="faint">${g.id}${g.lag?" · hold "+g.lag+"d":""}</small></td>
      <td>${g.from.map(c=>`<span class="kind">${nameOf(c)}</span>`).join(" ")}</td>
      <td style="width:24%">${g.to.map(c=>`<span class="kind" style="background:#ececfb;color:#4a48c4">${nameOf(c)}</span>`).join(" ")}</td>
      <td class="muted" style="font-size:11.5px;width:26%">${g.why}</td></tr>`).join("");
    body=`<div class="panel"><div class="ph"><div><h3>Inspection gates — nothing closes on unsigned work</h3><p>Zero-duration holds. Skipping these is the 280–350% rework trap.</p></div></div>
      <div class="pb" style="padding-top:6px"><table><thead><tr><th>Gate</th><th>Proves</th><th>Releases</th><th>Why</th></tr></thead><tbody>${gateRows}</tbody></table></div></div>`;
  }
  if(TAB==="th"){
    const maxOut={};qNorms.forEach(n=>{if(n.unit!=="day"){const o=n.crew*8/n.mhPerUnit;maxOut[n.unit]=Math.max(maxOut[n.unit]||0,o);}});
    const trades=[...new Set(qNorms.map(n=>n.trade))];
    const thRows=qNorms.map(n=>{
      const isDay=n.unit==="day";
      const out=isDay?null:n.crew*8/n.mhPerUnit;
      const pct=isDay?0:Math.max(4,Math.round(out/maxOut[n.unit]*100));
      const bar=isDay?`<span class="kind" style="background:#fbf6ea;color:#8a6a12">duration-driven</span>`
        :`<div style="display:flex;align-items:center;gap:8px"><div class="gtrack" style="width:120px;flex:none"><div class="gbar" style="width:${pct}%;background:${catColor(n.code)}"></div></div><b class="num">${out.toFixed(1)}</b> <small class="faint">${n.unit}/day · crew ${n.crew}</small></div>`;
      const band=isDay?"":`<small class="faint num">${(n.crew*8/n.mhHigh).toFixed(1)}–${(n.crew*8/n.mhLow).toFixed(1)}</small>`;
      return `<tr data-k="${n.code} ${n.name.toLowerCase()} ${n.trade}" data-tr="${n.trade}">
        <td style="width:30%"><div style="display:flex;gap:8px;align-items:baseline"><span class="gdot" style="background:${catColor(n.code)};flex:none"></span>
          <div><b>${n.name}</b> ${witChip(n.code)}<br><small class="faint">${n.trade}</small></div></div></td>
        <td>${bar}</td><td class="num">${band}</td>
        <td><span class="kind" style="${n.conf==="high"?"background:#e7f6ee;color:#1e7a4d":n.conf==="low"?"background:#fbeaea;color:#c4483a":""}">${n.conf}</span></td>
        <td class="muted" style="font-size:10.5px;width:26%">${n.src}</td></tr>`;}).join("");
    body=`<div class="panel"><div class="ph" style="align-items:flex-start"><div style="flex:1;min-width:280px"><h3>Throughput — how fast work actually goes</h3><p>Output per day at standard crew, bar-scaled within each unit. Day-unit tasks are duration-driven: more men never shorten a cure or an approval.</p></div>
      <div style="flex:none;margin-top:2px;display:flex;gap:10px;align-items:center;flex-wrap:wrap"><span class="seg" id="thTrades" style="flex-wrap:wrap;max-width:520px"><button class="acc on" data-tr="">All</button>${trades.map(t=>`<button class="acc" data-tr="${t}">${t}</button>`).join("")}</span>
      <input id="thFilter" placeholder="filter…" style="border:1px solid #e3e5ec;border-radius:8px;padding:7px 12px;font-size:12.5px;width:130px"></div></div>
      <div class="pb" style="padding-top:6px"><table id="thTable"><thead><tr><th>Activity</th><th>Output / day</th><th>Band</th><th>Conf</th><th>Source</th></tr></thead><tbody>${thRows}</tbody></table></div></div>`;
  }
  if(TAB==="leads"){
    const maxLead=Math.max(...Object.values(SEQ.LONGLEAD));
    const leadRows=Object.keys(SEQ.LONGLEAD).sort((a2,b2)=>SEQ.LONGLEAD[b2]-SEQ.LONGLEAD[a2]).map(c=>{
      const w=SEQ.LONGLEAD[c];return `<div class="grow"><div class="glabel" style="width:240px">${nameOf(c)} ${witChip(c)}</div>
      <div class="gtrack"><div class="gbar" style="width:${Math.round(w/maxLead*100)}%;background:${catColor(c)}"></div></div>
      <b class="num" style="margin-left:10px;flex:none">${w} wk</b></div>`;}).join("");
    const pkgRows=(SEQ.PACKAGES||[]).map(p2=>`<tr><td style="width:24%"><b>${p2.name}</b></td><td class="num" style="width:8%"><b>${p2.lead} wk</b></td>
      <td style="width:22%"><span class="kind" style="${p2.design?"background:#ececfb;color:#4a48c4":""}">${p2.design?"design-gated":"sample-approved"}</span></td>
      <td><small class="faint">${p2.codes.map(nameOf).join(" · ")}</small></td></tr>`).join("");
    body=`<div class="panel"><div class="ph"><div><h3>Procurement leads &amp; packages</h3><p>Order-to-site weeks, corpus-calibrated — and the enabling-chain packages built on them: design → approval → samples → PO → manufacture → delivery.</p></div></div>
      <div class="pb" style="padding-top:8px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:26px"><div>${leadRows}</div>
        <table><thead><tr><th>Package</th><th>Lead</th><th>Gating</th><th>Covers</th></tr></thead><tbody>${pkgRows}</tbody></table></div></div></div>`;
  }
  if(TAB==="site"){
    const chainRows=(SEQ.SITE_RULES.chain||[]).map(c2=>`<div style="display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px solid #f4f5f7"><span style="color:var(--accent,#4a48c4);font-weight:700">→</span><span><b>${nameOf(c2.code)}</b> <span class="faint">waits for</span> ${c2.afterCodes?c2.afterCodes.map(x=>`<span class="kind">${nameOf(x)}</span>`).join(" "):`<span class="kind">everything below phase ${c2.afterMaxPhase}</span>`}<br><small class="faint">${c2.why}</small></span></div>`).join("");
    const tcRows=Object.keys(SEQ.SITE_RULES.tc||{}).map(k=>`<div style="padding:7px 0;border-bottom:1px solid #f4f5f7"><b>${nameOf(k)}</b><br><div style="margin-top:4px">${SEQ.SITE_RULES.tc[k].map(x=>`<span class="kind" style="margin:1px 2px 1px 0;display:inline-block">${nameOf(x)}</span>`).join("")}</div></div>`).join("");
    const run=(SEQ.SITE_RULES.runway||[]).map(r=>`<div style="display:flex;gap:10px;align-items:baseline;padding:7px 0;border-bottom:1px solid #f4f5f7"><span style="color:#8a6a12;font-weight:700">⟶</span><span><b>${nameOf(r.from)}</b> <span class="faint">releases phases ${r.toPhaseMin}–${r.toPhaseMax}</span><br><small class="faint">${r.why}</small></span></div>`).join("");
    body=`<div class="panel"><div class="ph"><div><h3>Site-wide rules — runway, closeout &amp; commissioning</h3><p>The site-level choreography that zone logic can't see.</p></div></div>
      <div class="pb" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px">
        <div><p style="margin:0 0 4px"><b>Runway — what releases the site</b></p>${run}</div>
        <div><p style="margin:0 0 4px"><b>Closeout chain</b></p>${chainRows}</div>
        <div><p style="margin:0 0 4px"><b>T&amp;C ownership</b></p>${tcRows}</div></div></div>`;
  }
  return `
  <div class="head" style="margin-bottom:16px"><h1>Engine knowledge — the library it plans from</h1>
    <p>Authored once, hardened by ${(C.PLANS||[]).length} Flipspaces plans. Green witness chips (3w+) = settled law. The Training corpus shows HOW each entry earned its place; this page shows WHAT the engine knows.</p></div>
  <div class="glance">
    <div class="g lead"><div class="gv num">${Object.keys(SEQ.AFTER).length}</div><div class="gk">activities with sequence law · ${nAfter} relations</div></div>
    <div class="g"><div class="gv num">${(SEQ.GATE_RULES||[]).length}</div><div class="gk">inspection gates</div></div>
    <div class="g"><div class="gv num">${(SEQ.CONCURRENCY.parallel_ok||[]).length+ssCount} / ${(SEQ.CONCURRENCY.never_together||[]).length}</div><div class="gk">parallel permissions / exclusions</div></div>
    <div class="g"><div class="gv num">${qNorms.length}</div><div class="gk">throughput rates · ${Object.keys(SEQ.LONGLEAD).length} leads</div></div>
  </div>
  ${tabBar}
  ${body}`;
}
function wireKnowledge(){
  const seg0=document.getElementById("knowTabs");
  if(seg0)seg0.querySelectorAll("button").forEach(b=>b.onclick=()=>{state.knowledge={tab:b.dataset.t};render();});
  const wire=(inpId,tblId)=>{const i=document.getElementById(inpId);if(!i)return;
    i.oninput=()=>{const q=i.value.toLowerCase();document.querySelectorAll("#"+tblId+" tbody tr").forEach(tr=>{tr.style.display=!q||(tr.dataset.k||"").includes(q)?"":"none";});};};
  wire("seqFilter","seqTable");wire("thFilter","thTable");
  const seg=document.getElementById("thTrades");
  if(seg)seg.querySelectorAll("button").forEach(b=>b.onclick=()=>{
    seg.querySelectorAll("button").forEach(x=>x.classList.remove("on"));b.classList.add("on");
    const tr=b.dataset.tr;document.querySelectorAll("#thTable tbody tr").forEach(row=>{row.style.display=!tr||row.dataset.tr===tr?"":"none";});});
}
function corpusView(){
  const C=window.KB_CORPUS||{PLANS:[],EVIDENCE:{},VOCABULARY:{},VERDICTS:{},CALIBRATIONS:[],CONFIRMATIONS:[]};
  const V=C.VERDICTS||{};
  const evRows=Object.keys(C.EVIDENCE).sort().map(code=>{
    const n=DUR.get(code);const rows=C.EVIDENCE[code];
    const chips=rows.map(r=>`<span class="kind" title="${(r.note||r.actual||"").replace(/"/g,"&quot;")}">${r.plan} · ${r.dur}d${r.actual?" ✓":""}</span>`).join(" ");
    return `<tr><td><b>${n?n.name:code}</b><br><small class="faint">${code} · ${n?n.trade:"?"} · conf ${n?n.conf:"?"}${rows.length>1?' · <b>'+rows.length+' witnesses</b>':''}</small></td><td>${chips}</td></tr>`;
  }).join("");
  const vocab=Object.keys(C.VOCABULARY).sort().map(k=>`<tr><td class="muted">${k}</td><td>${String(C.VOCABULARY[k]).slice(0,90)}</td></tr>`).join("");
  return `
  <div class="head" style="margin-bottom:16px"><h1>Training corpus — what the engine has learned</h1>
    <p>Every Flipspaces plan absorbed leaves evidence here. Agreements harden confidence; conflicts become queries; new work becomes codes. Nothing is absorbed blindly.</p></div>
  <div class="glance">
    <div class="g lead"><div class="gv num">${(C.PLANS||[]).length}</div><div class="gk">plans absorbed</div></div>
    <div class="g"><div class="gv num">${Object.keys(C.EVIDENCE).length}</div><div class="gk">codes with evidence</div></div>
    <div class="g"><div class="gv num">${Object.keys(C.VOCABULARY).length}</div><div class="gk">vocabulary mappings</div></div>
    <div class="g"><div class="gv num">${(V.second_witness_confirmed||[]).length}</div><div class="gk">second-witness confirmations</div></div>
  </div>
  <div class="panel"><div class="ph"><div><h3>Plans absorbed</h3><p>The witnesses. Each future plan appends — never overwrites.</p></div></div>
    <div class="pb" style="padding-top:6px"><table style="table-layout:fixed"><thead><tr><th style="width:16%">Plan</th><th style="width:22%">City · type</th><th style="width:10%">Span</th><th style="width:52%">What it taught</th></tr></thead><tbody style="vertical-align:top">
      ${(C.PLANS||[]).map(pl=>`<tr><td><b>${pl.id}</b><br><small class="faint">${pl.file} · snapshot ${pl.snapshot}</small></td><td>${pl.city}<br><small class="faint">${pl.type}</small></td><td>${pl.spanDays}d · ${pl.tasks} tasks</td><td class="muted" style="font-size:12px">${pl.note}</td></tr>`).join("")}
    </tbody></table></div></div>
  <div class="panel"><div class="ph"><div><h3>Cross-plan verdicts</h3><p>Two agreeing witnesses upgrade confidence. Contradictions never silently change a rule.</p></div></div>
    <div class="pb">
      <p style="margin:4px 0 6px"><b>Confirmed by a second witness</b></p>
      <ul style="margin:0 0 12px;padding-left:18px">${(V.second_witness_confirmed||[]).map(x=>`<li style="margin:2px 0;font-size:12.5px">${x}</li>`).join("")}</ul>
      ${(V.third_witness&&V.third_witness.length)?`<p style="margin:4px 0 6px"><b>Third-witness confirmations (settled law)</b></p>
      <ul style="margin:0 0 12px;padding-left:18px">${V.third_witness.map(x=>`<li style="margin:2px 0;font-size:12.5px">${x}</li>`).join("")}</ul>`:""}
      <p style="margin:4px 0 6px"><b style="color:var(--warn-ink,#8a6a12)">Contradictions & resolutions</b></p>
      <ul style="margin:0 0 12px;padding-left:18px">${(V.contradictions||[]).map(x=>`<li style="margin:2px 0;font-size:12.5px">${x}</li>`).join("")}</ul>
      <p style="margin:4px 0 6px"><b>Concept candidates (parked until a second witness)</b></p>
      <ul style="margin:0;padding-left:18px">${(V.concept_candidates||[]).map(x=>`<li style="margin:2px 0;font-size:12.5px">${x}</li>`).join("")}</ul>
    </div></div>
  <div class="panel"><div class="ph"><div><h3>Calibrations applied</h3><p>Library changes this corpus caused — each traceable to its plan.</p></div></div>
    <div class="pb"><ul style="margin:0;padding-left:18px">${(C.CALIBRATIONS||[]).map(x=>`<li style="margin:2px 0;font-size:12.5px">${x}</li>`).join("")}</ul></div></div>
  <div class="panel"><div class="ph"><div><h3>Evidence ledger — ${Object.keys(C.EVIDENCE).length} codes</h3><p>Elapsed-day observations per plan; ✓ marks actual-backed rows. Rates refine when a plan arrives with quantities.</p></div></div>
    <div class="pb" style="padding-top:6px"><table><thead><tr><th style="width:34%">Code</th><th>Witness evidence</th></tr></thead><tbody>${evRows}</tbody></table></div></div>
  <div class="panel"><div class="ph"><div><h3>Vocabulary — their words → engine codes</h3><p>${Object.keys(C.VOCABULARY).length} site/PM terms the parser and future BOQ reads resolve automatically.</p></div>
    <button class="btn ghost mini" id="vocToggle">show</button></div>
    <div class="pb" id="vocBody" style="display:none;padding-top:6px"><table><tbody>${vocab}</tbody></table></div></div>`;
}
function wireCorpus(){const $=id=>document.getElementById(id);const b=$("vocToggle");if(b)b.onclick=()=>{const v=$("vocBody");const on=v.style.display==="none";v.style.display=on?"block":"none";b.textContent=on?"hide":"show";};}

  return { SCOPES, scopedBox, wireScoped, knowledgeView, wireKnowledge, corpusView, wireCorpus };
}

root.PLAN_VIEW_KNOWLEDGE = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_VIEW_KNOWLEDGE;

})(typeof window !== "undefined" ? window : globalThis);
