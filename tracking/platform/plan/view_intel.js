// ===================================================================
// DnB-OS . platform/plan/view_intel.js . INPUTS, QUERIES, INTELLIGENCE
// Phase 0b, tranche 5. The three screens that decide whether a plan can
// be trusted before it is published:
//   . Inputs, the readiness board . what the engine has read, what it is
//     still missing, and what each missing thing would sharpen.
//   . Queries, the one inbox . every open question with an owner, a due
//     date and an escalation path. Answering one re-plans immediately.
//   . Intelligence, the testing layers and the cross check . every plan
//     runs all of them, fails block, warnings need an acknowledgement
//     that goes on record.
//
//   install(deps) -> the three views and their wiring
//
// The wiring moves WITH these views. It writes to state.answers, which
// is exactly what the plan is computed from, so a dead handler here
// would look like a plan that quietly ignores its answers. The wiring
// guard in tests/plan_render_baseline.js is what stops that.
//
// Bodies moved VERBATIM, lifted by script.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, PROJ, BOQ, CAL, DUR, SEQ, INTEL, VERIFY, KIT, CMP,
          render, saveState, scopedBox } = deps;
  const { fmt, fmtS, dd, daysBetween, colorFor, scoreCol,
          ringChart, stackBar, leadTimeline, tname } = KIT;
  const { computeIntel, computeChecks, computePlan, longLeads,
          zname, unitOf, tgtName, planTree, planGroups } = CMP;

function inputsView(){
  const I=computeIntel();
  const A=state.answers;
  const chip=s=>s==="read"?'<span class="badge appr"><span class="d"></span>Read</span>':s==="partial"?'<span class="badge draft"><span class="d"></span>Confirm</span>':'<span class="kind">Pending</span>';
  const must=[I.inputs[0],I.inputs[1],I.inputs[2]];
  const good=I.inputs.slice(3);
  const gains=["zone-true quantities replace deck factors — most queries close","demolition scope becomes measured, not assumed","adds the tasks manuals demand (permits, vendor rules, hour bans)","decisions land in the plan the day they are made (with your OK)"];
  return `
  <div class="head"><h1>Inputs — the engine asks, never assumes</h1>
    <p>Three must-haves publish a plan. Everything else sharpens it. Anything that disagrees is raised here and waits for your answer — the plan re-computes the moment you give it.</p></div>

  <div class="glance">
    <div class="g lead"><div class="gv num">${must.filter(i=>i.status==="read").length}<small> of 3</small></div><div class="gk">must-haves in — BOQ, layout, dates</div></div>
    <div class="g"><div class="gv num">${((A.areaBasis||!PROJ.areas.boq)?0:1)+(A.datesConfirmed?0:1)}</div><div class="gk">confirmations waiting for you, below</div></div>
    <div class="g"><div class="gv num">${I.ready.score}<small> /100</small></div><div class="gk">readiness — ${I.ready.band}. Your answers move it</div></div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Readiness to publish</h3><p>How ready the inputs are for a plan you can trust — your answers move the dial.</p></div></div>
    <div class="pb"><div class="herochart">
      ${ringChart(I.ready.score,I.ready.score,"/ 100")}
      <div class="hcside">
        <div class="covgrid">${I.inputs.map(i=>`<div class="covcell ${i.status}">${i.name}</div>`).join("")}</div>
        <div class="stacklegend" style="margin-top:14px"><span class="li"><i style="background:var(--ok)"></i>Read</span><span class="li"><i style="background:#e0a021"></i>Confirm</span><span class="li"><i style="background:#c4c8d4"></i>Pending</span></div>
      </div>
    </div></div>
  </div>

  ${PROJ.kt&&PROJ.kt.sweep?`
  <div class="panel">
    <div class="ph"><div><h3>Drive sweep — what the engine has read</h3><p>Full sweep on <b>${PROJ.kt.sweep.date}</b>. New or changed docs? <span class="linkx" id="btnRefresh">Refresh</span> — or just say "refresh" in the chat.</p></div></div>
    <div class="pb" style="padding-top:4px;font-size:12.5px;color:var(--muted)">
      <div style="margin-bottom:6px"><b style="color:var(--ink)">Read & wired in:</b> ${PROJ.kt.sweep.took}</div>
      <div><b style="color:var(--ink)">Still outside the reader:</b> ${PROJ.kt.sweep.blocked}</div>
    </div>
  </div>`:""}

  ${A.areaBasis==="boq"&&PROJ.kt?`
  <div class="panel" style="border-color:#e8c9a8">
    <div class="pb" style="padding:14px 20px">
      <div style="font-weight:600;margin-bottom:4px">⚠ Your standing answer conflicts with the KT note</div>
      <div style="font-size:12.5px;color:var(--muted)">Area basis is settled as <b>the BOQ (${(PROJ.areas.boq||0).toLocaleString("en-IN")} sqft)</b> — but the KT handover says: ${PROJ.kt.areaEvidence}. Every quantity and duration is currently scaled up ~${PROJ.areas.boq&&PROJ.areas.deck?Math.round((PROJ.areas.boq/PROJ.areas.deck-1)*100):"?"}%. If the layout figure is the execution truth, say <b>"layout is right"</b> <span class="linkx chatfocus">in the chat below ↓</span> and the plan recomputes.</div>
    </div>
  </div>`:""}

  ${((!A.areaBasis&&PROJ.areas.boq)||!A.datesConfirmed)?`
  <div class="panel" style="border-color:#e8c9a8">
    <div class="ph"><div><h3>Raised by the engine — confirm before publish</h3><p>Conflicts and unconfirmed facts. One click each; the whole plan recomputes.</p></div></div>
    <div class="pb">
      ${!A.areaBasis&&PROJ.areas.boq?`
      <div style="padding:14px 16px;background:#fdf9f3;border:1px solid #f0e2cc;border-radius:12px;margin-bottom:12px">
        <div style="font-weight:600;margin-bottom:4px">⚠ The two sources disagree on the area itself</div>
        <div class="muted" style="font-size:12.5px;margin-bottom:12px">The priced BOQ works on <b>${PROJ.areas.boq.toLocaleString("en-IN")} sqft</b>; the design layout adds up to <b>${PROJ.areas.deck.toLocaleString("en-IN")} sqft</b> carpet. Every quantity leans on this. Which is the truth?</div>
        <button class="btn pri mini" id="ansBoq">BOQ is right — ${PROJ.areas.boq.toLocaleString("en-IN")}</button>
        <button class="btn ghost mini" id="ansDeck">Layout is right — ${PROJ.areas.deck.toLocaleString("en-IN")}</button>
        <span class="faint" style="font-size:11.5px;margin-left:8px">or tell me the real figure <span class="linkx chatfocus">in the chat below ↓</span> — engine takes your word as final</span>
      </div>`:!PROJ.areas.boq?"":`
      <div style="padding:12px 16px;background:var(--ok-soft);border-radius:12px;margin-bottom:12px;font-size:12.5px">
        ✓ Area basis confirmed: <b>${A.areaBasis==="boq"?"BOQ · "+PROJ.areas.boq.toLocaleString("en-IN")+" sqft":"Layout · "+PROJ.areas.deck.toLocaleString("en-IN")+" sqft"}</b> — quantities recomputed
        <span class="linkx" id="ansUndo" style="margin-left:10px">change</span>
      </div>`}
      ${!A.datesConfirmed?`
      <div style="padding:14px 16px;background:#fdf9f3;border:1px solid #f0e2cc;border-radius:12px">
        <div style="font-weight:600;margin-bottom:4px">⚠ The four dates — internal and external, start and end</div>
        <div class="muted" style="font-size:12.5px;margin-bottom:12px">The external pair is the client promise. The internal pair is what the team actually chases — the gaps become your buffer. Typed in, not read from the contract yet.</div>
        <div class="flex wrap" style="gap:10px">
          <div class="fld"><label>Internal start</label><input type="date" id="dIntS" value="${state.win.intStart}"></div>
          <div class="fld"><label>Internal deadline</label><input type="date" id="dIntE" value="${state.win.intEnd||CAL._iso(CAL._add(CAL._d(state.win.extEnd),-7))}"></div>
          <div class="fld"><label>External start (client)</label><input type="date" id="dExtS" value="${state.win.extStart}"></div>
          <div class="fld"><label>External end (client)</label><input type="date" id="dExtE" value="${state.win.extEnd}"></div>
          <button class="btn pri mini" id="ansDates" style="align-self:flex-end">Confirm all four</button>
        </div>
      </div>`:`
      <div style="padding:12px 16px;background:var(--ok-soft);border-radius:12px;font-size:12.5px">✓ Dates confirmed — internal ${fmtS(state.win.intStart)} → <b>${fmtS(state.win.intEnd)}</b> · external ${fmtS(state.win.extStart)} → ${fmtS(state.win.extEnd)} · end buffer ${Math.round((CAL._d(state.win.extEnd)-CAL._d(state.win.intEnd))/86400000)} days</div>`}
    </div>
  </div>`:`
  <div class="planctl"><span class="okchip verdict">✓ Nothing waiting on you — ${PROJ.areas.boq?`area: <b style="margin:0 4px">${A.areaBasis==="boq"?"BOQ "+PROJ.areas.boq.toLocaleString("en-IN"):"layout "+PROJ.areas.deck.toLocaleString("en-IN")}</b> · `:""} · internal ${fmtS(state.win.intStart)}→${fmtS(state.win.intEnd)} · external ${fmtS(state.win.extStart)}→${fmtS(state.win.extEnd)} · buffer ${Math.round((CAL._d(state.win.extEnd)-CAL._d(state.win.intEnd))/86400000)} days <span class="linkx" id="ansUndo" style="margin-left:8px">change</span></span></div>`}

  <div class="panel">
    <div class="ph"><div><h3>Must have — without these there is no trustworthy plan</h3><p>BOQ + layout + dates. The engine publishes with these three and flags everything unsure.</p></div></div>
    <div class="pb"><table><thead><tr><th style="width:200px">Input</th><th style="width:105px">Status</th><th>What the engine took from it</th><th style="width:70px">Sure?</th></tr></thead>
    <tbody>${must.map(i=>`<tr><td><b>${i.name}</b></td><td>${chip(i.status)}</td><td class="muted">${i.took}</td><td>${i.conf?`<span class="confp ${i.conf}">${i.conf.toUpperCase()}</span>`:""}</td></tr>`).join("")}</tbody></table></div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Good to have — each one sharpens the plan</h3><p>The engine asks for these; it works without them but says so honestly.</p></div></div>
    <div class="pb"><table><thead><tr><th style="width:200px">Input</th><th style="width:105px">Status</th><th>What it adds when you drop it in</th></tr></thead>
    <tbody>${good.map((i,ix)=>`<tr><td><b>${i.name}</b></td><td>${chip(i.status)}</td><td class="muted">${ix<gains.length&&i.status==="pending"&&!(PROJ.extraInputs||[]).includes(i)?gains[ix]:i.took}</td></tr>`).join("")}</tbody></table>
    <p class="faint" style="font-size:12px;margin:14px 0 0">Live drop-and-read arrives with the launcher; today the engine re-reads at build time when a file changes.</p></div>
  </div>`;
}
function wireInputs(){
  const gi=id=>document.getElementById(id);
  const re=()=>{state._intel=null;state._memo={};state._checks=null;saveState();render();};
  if(gi("ansBoq"))gi("ansBoq").onclick=()=>{state.answers.areaBasis="boq";re();};
  if(gi("ansDeck"))gi("ansDeck").onclick=()=>{state.answers.areaBasis="deck";re();};
  if(gi("ansUndo"))gi("ansUndo").onclick=()=>{state.answers.areaBasis=null;re();};
  if(gi("ansDates"))gi("ansDates").onclick=()=>{
    const is=gi("dIntS").value,ie=gi("dIntE").value,es=gi("dExtS").value,ee=gi("dExtE").value;
    if(!is||!ie||!es||!ee)return alert("Set all four dates");
    if(ie>ee)return alert("Internal deadline cannot sit after the external end");
    state.win.intStart=is;state.win.intEnd=ie;state.win.extStart=es;state.win.extEnd=ee;
    state.answers.datesConfirmed=true;re();};
}
function queriesView(){
  const I=computeIntel();
  const V=state.intel;
  const owners=["Design","Execution","MEP","Purchase","Commercial"];
  const sev=s=>`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;background:${s==="high"?"var(--shut-ink)":s==="med"?"#e0a021":"#c4c8d4"}"></span>`;
  const qtitle=q=>{
    if(q.id==="Q-AREA")return "Area basis";
    if(q.id==="Q-PAST")return "Plan starts in the past";
    if(q.id.startsWith("Q-ADD-"))return "Add task?";
    const i=q.text.indexOf(":");return i>0&&i<42?q.text.slice(0,i):"Confirm";
  };
  const qdetail=q=>{const t=qtitle(q);return q.text.startsWith(t+":")?q.text.slice(t.length+1).trim():q.text;};
  let qs=I.queries.filter(q=>V.owner==="All"||q.owner===V.owner);
  const highs=qs.filter(q=>q.sev==="high");
  const shown=V.showAllQ?qs:highs;
  const hidden=qs.length-shown.length;
  return `
  <div class="head"><h1>Queries — the engine asks, your team answers</h1>
    <p>One ranked list per owner, RFI-style: severity, due date, then escalation. Every answer feeds back and the plan recomputes. The engine adds or changes nothing on its own.</p></div>
  ${scopedBox("queries")}

  <div class="glance">
    <div class="g lead"><div class="gv num" ${I.queries.filter(x=>x.sev==="high").length?'style="color:#c4483a"':''}>${I.queries.filter(x=>x.sev==="high").length}</div><div class="gk">high — answer these first</div></div>
    <div class="g"><div class="gv num">${I.queries.length}</div><div class="gk">open in total</div></div>
    <div class="g"><div class="gv num">${I.doneQ.length}</div><div class="gk">settled · ${I.doneQ.filter(q=>q.status==="accepted").length} became tasks</div></div>
    <div class="g"><div class="gv num">${owners.filter(o=>I.queries.some(q=>q.owner===o)).length}</div><div class="gk">departments holding answers</div></div>
  </div>

  ${I.recon.basisRatio!==1?`
  <div class="herocard">
    <div class="hc-main"><h3>Do this first — one answer settles ${I.recon.explained} gaps</h3>
    <p>BOQ quantities run ~${Math.round((I.recon.basisRatio-1)*100)}% above the layout take-off across the board. It is one question: which floor area is the truth?</p></div>
    <button class="btn pri" id="goInputs">Answer it →</button>
  </div>`:""}

  <div class="panel">
    <div class="ph"><div><h3>Questions for your team</h3><p>BOQ figures are read line by line; the take-off is estimated from layout areas × standard factors — the GFC drawings are not read yet. Due in 7 days, then it escalates${PROJ.escalation?": "+PROJ.escalation.map(e=>e.split(" (")[0]).join(" → "):""}.</p></div>
      <div class="right"><b>${highs.length}</b> high · ${qs.length} total</div></div>
    <div class="pb" style="padding-top:14px">
      <div class="chiprow">
        <span class="fchip ${V.owner==="All"?"on":""}" data-o="All">All ${I.queries.length}</span>
        ${owners.map(o=>{const n=I.queries.filter(q=>q.owner===o).length;return n?`<span class="fchip ${V.owner===o?"on":""}" data-o="${o}">${o} ${n}</span>`:"";}).join("")}
      </div>
      ${shown.map(q=>{
        const acts = q.id.startsWith("Q-ADD-")
          ? `<button class="btn pri mini qact" data-q="${q.id}" data-a="accepted">Add it</button><button class="btn ghost mini qact" data-q="${q.id}" data-a="dismissed">Not needed</button>`
          : q.id.startsWith("Q-") && state._intel.recon.find(r=>"Q-"+r.code===q.id && r.boq!=null && r.own)
          ? `<button class="btn pri mini ract" data-c="${q.id.slice(2)}" data-p="boq">BOQ ✓</button><button class="btn ghost mini ract" data-c="${q.id.slice(2)}" data-p="own">Take-off ✓</button>`
          : `<button class="btn ghost mini qact" data-q="${q.id}" data-a="answered">Answered ✓</button>`;
        return `<div class="qline" title="${q.text.replace(/"/g,'&quot;')}">${sev(q.sev)}<span class="qt">${qtitle(q)}</span><span class="qd">${qdetail(q)}</span><span class="qacts">${acts}</span><span class="qo" title="${(PROJ.team&&PROJ.team[q.owner])||""}">${q.owner}${PROJ.team&&PROJ.team[q.owner]?` · ${PROJ.team[q.owner].split(" ")[0]}`:""}</span><span class="qdue">due ${fmtS(q.due)}</span></div>`;
      }).join("")||'<p class="faint" style="font-size:12.5px">Nothing open for this filter — all resolved.</p>'}
      ${hidden>0?`<span class="morelink" id="moreQ">Show ${hidden} more (medium priority) ›</span>`:V.showAllQ&&qs.length>highs.length?`<span class="morelink" id="lessQ">Show high only ‹</span>`:""}
      ${I.doneQ.length?`<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line2)" class="agreewrap"><b>${I.doneQ.length} settled</b> <span class="faint">— ${I.doneQ.filter(q=>q.status==="accepted").length} tasks added to the plan, rest answered/dismissed</span> <span class="linkx" id="resetQ" style="margin-left:8px">reopen all</span></div>`:""}
    </div>
  </div>

`;
}

function intelView(){
  const I=computeIntel();
  const V=state.intel;
  const owners=["Design","Execution","MEP","Purchase","Commercial"];
  const sev=s=>`<span style="display:inline-block;width:8px;height:8px;border-radius:50%;flex:none;background:${s==="high"?"var(--shut-ink)":s==="med"?"#e0a021":"#c4c8d4"}"></span>`;
  const qtitle=q=>{
    if(q.id==="Q-AREA")return "Area basis";
    if(q.id==="Q-PAST")return "Plan starts in the past";
    if(q.id.startsWith("Q-ADD-"))return "Add task?";
    const i=q.text.indexOf(":");return i>0&&i<42?q.text.slice(0,i):"Confirm";
  };
  const qdetail=q=>{const t=qtitle(q);return q.text.startsWith(t+":")?q.text.slice(t.length+1).trim():q.text;};
  // filters
  let qs=I.queries.filter(q=>V.owner==="All"||q.owner===V.owner);
  const highs=qs.filter(q=>q.sev==="high");
  const shown=V.showAllQ?qs:highs;
  const hidden=qs.length-shown.length;
  // cross-check split
  const fights=I.recon.filter(r=>r.verdict==="conflict"||r.verdict==="check");
  const resolvedRows=I.recon.filter(r=>r.verdict==="resolved");
  const agrees=I.recon.filter(r=>r.verdict==="ok");
  const noboq=I.recon.filter(r=>r.verdict==="no-boq");
  const boqonly=I.recon.filter(r=>r.verdict==="boq-only");
  const vchip=v=>v==="conflict"?'<span class="confp low">CONFLICT</span>':'<span class="confp med">CHECK</span>';
  return `
  <div class="head"><h1>Intelligence &amp; testing</h1>
    <p>Every number checked against a second source. Agreements build trust; disagreements become questions to a named owner. The plan publishes when this page is calm.</p></div>

  <div class="glance">
    <div class="g lead"><div class="gv num">${I.ready.score}<small> /100</small></div><div class="gk">readiness — ${I.ready.band}</div></div>
    <div class="g"><div class="gv num">${I.ready.okQty}<small> of ${I.ready.total}</small></div><div class="gk">quantities agree</div></div>
    <div class="g"><div class="gv num">${I.queries.filter(x=>x.sev==="high").length}</div><div class="gk">high questions open</div></div>
    <div class="g"><div class="gv num">${I.ready.inputsIn}<small> of ${I.inputs.length}</small></div><div class="gk">inputs read</div></div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>How healthy the data is</h3><p>Readiness, and every quantity checked against a second source.</p></div></div>
    <div class="pb"><div class="herochart">
      ${ringChart(I.ready.score,I.ready.score,I.ready.band)}
      <div class="hcside">
        ${stackBar([
          {label:"Agree",val:agrees.length,color:"var(--ok)"},
          {label:"Check",val:I.recon.filter(r=>r.verdict==="check").length,color:"#e0a021"},
          {label:"Conflict",val:I.recon.filter(r=>r.verdict==="conflict").length,color:"var(--shut-ink)"},
          {label:"Resolved",val:resolvedRows.length,color:"var(--accent)"},
          {label:"No BOQ line",val:noboq.length,color:"#c4c8d4"}
        ])}
        <p class="faint" style="font-size:12px;margin:14px 0 0">Green agreements build trust · amber and red become the questions below.</p>
      </div>
    </div></div>
  </div>


  <div class="panel">
    <div class="ph"><div><h3>Testing layers — the plan must pass before it carries a signature</h3><p>Every publish runs all ${computeChecks().summary.total} checks. Fails block. Warnings need your acknowledgment, on record.</p></div>
      <div class="right">${(()=>{const R=computeChecks();return `<b>${R.summary.pass}</b> pass${R.summary.warn?` · <b style="color:#8a6a12">${R.summary.warn}</b> warn`:""}${R.summary.fail?` · <b style="color:var(--shut-ink)">${R.summary.fail}</b> FAIL`:""}`})()}</div></div>
    <div class="pb" style="padding-top:8px">
      ${(()=>{const R=computeChecks();return R.layers.map(l=>{
        const st=l.fail?"fail":l.warn?"warn":"pass";
        const open=state.intel.openLayer===l.name;
        const items=R.checks.filter(c=>c.layer===l.name);
        return `<div class="qline tlayer" data-l="${l.name.replace(/"/g,'')}" style="cursor:pointer">
          <span style="display:inline-block;width:9px;height:9px;border-radius:50%;flex:none;background:${st==="pass"?"var(--ok)":st==="warn"?"#e0a021":"var(--shut-ink)"}"></span>
          <span class="qt" style="width:230px">${l.name}</span>
          <span class="qd">${l.pass} of ${l.pass+l.warn+l.fail} checks pass${l.warn?` · ${l.warn} warning${l.warn>1?"s":""}`:""}${l.fail?` · ${l.fail} FAIL`:""}</span>
          <span class="qdue">${open?"hide ‹":"open ›"}</span></div>
        ${open?items.map(c=>`<div class="qline" style="padding-left:34px;background:#fbfbfd">
          <span style="flex:none;font-size:11px;width:14px">${c.status==="pass"?"✓":c.status==="warn"?"⚠":"✕"}</span>
          <span class="qt" style="width:216px;font-weight:500">${c.name}</span>
          <span class="qd" title="${c.detail.replace(/"/g,'&quot;')}">${c.detail}</span>
          <span class="qdue faint">${c.id}</span></div>`).join(""):""}`;
      }).join("")})()}
    </div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>The sequence rulebook — what follows what, what runs together</h3><p>The authored source of truth the engine plans from — and the testing layers verify on every plan: ${Object.keys(SEQ.RULEBOOK.AFTER).length} activities · ${SEQ.ORDER_RULES.length} precedence relations · ${SEQ.RULEBOOK.GATE_RULES.length} inspection gates · ${SEQ.RULEBOOK.CONCURRENCY.parallel_ok.length} overlap permissions · ${SEQ.RULEBOOK.CONCURRENCY.never_together.length} exclusions.</p></div>
      <button class="btn ghost mini" id="ruleToggle">${state.intel.showRules?"Hide":"Open the rulebook"}</button></div>
    ${state.intel.showRules?`<div class="pb" style="padding-top:6px">
      <div style="font-weight:600;font-size:12.5px;margin-bottom:6px">Runs simultaneously — by permission, not accident</div>
      ${SEQ.RULEBOOK.CONCURRENCY.parallel_ok.map(c=>`<div style="font-size:12px;color:var(--muted);padding:2px 0">∥ ${c.rule} <span class="faint">— ${c.why}</span></div>`).join("")}
      <div style="font-weight:600;font-size:12.5px;margin:12px 0 6px">Never together in one zone</div>
      ${SEQ.RULEBOOK.CONCURRENCY.never_together.map(c=>`<div style="font-size:12px;color:var(--shut-ink);padding:2px 0">✕ ${(Array.isArray(c.a)?c.a.join(", "):c.a)} × ${(Array.isArray(c.b)?c.b.join(", "):c.b)} <span class="faint">— ${c.why}</span></div>`).join("")}
      <div style="font-weight:600;font-size:12.5px;margin:12px 0 6px">Inspection gates</div>
      ${SEQ.RULEBOOK.GATE_RULES.map(g=>`<div style="font-size:12px;color:#8a6a12;padding:2px 0">◆ ${g.name} <span class="faint">— after ${g.from.join(", ")} · releases ${g.to.join(", ")}</span></div>`).join("")}
      <div style="font-weight:600;font-size:12.5px;margin:12px 0 6px">What follows what (within each zone)</div>
      <table><thead><tr><th style="width:230px">Activity</th><th>Waits for</th></tr></thead><tbody>
      ${Object.keys(SEQ.RULEBOOK.AFTER).map(c=>{const nm=DUR.get(c);return `<tr><td>${nm?nm.name:c}</td><td style="font-size:11.5px" class="muted">${SEQ.RULEBOOK.AFTER[c].map(r=>`${r.type==="SS"?"∥ overlaps ":"← "}${(DUR.get(r.of)||{name:r.of}).name}${r.lag?` +${r.lag}d`:""}`).join(" · ")||"—"}</td></tr>`;}).join("")}
      </tbody></table></div>`:""}
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Cross-check — the audit picture</h3><p>Priced BOQ (read line by line) vs the layout take-off (zone areas × standard factors). The GFC drawings are NOT read yet — no figure here is measured from drawings. Open disagreements are worked on the Queries tab — one home, no repetition.</p></div>
      <div class="right">${fights.length?`<span class="linkx" id="goQueries" style="font-weight:600">${fights.length} to settle → Queries</span>`:`<b style="color:var(--ok-ink)">nothing open</b>`}${resolvedRows.length?` · <span style="color:var(--ok-ink)">${resolvedRows.length} resolved</span>`:""}</div></div>
    <div class="pb" style="padding-top:6px">
      ${resolvedRows.length?`<table><thead><tr><th>Resolved by you</th><th style="width:120px">Take-off said</th><th style="width:120px">BOQ said</th><th style="width:220px">Standing answer</th></tr></thead>
      <tbody>${resolvedRows.map(r=>`<tr style="background:var(--ok-soft)"><td>${r.name}</td>
        <td class="num">${r.own?r.own.toLocaleString("en-IN")+" "+r.unit:"—"}</td>
        <td class="num">${r.boq!=null?r.boq.toLocaleString("en-IN")+" "+r.unit:"—"}</td>
        <td style="font-size:12px" class="muted">using ${r.pick==="boq"?"the BOQ figure":r.pick==="you"?"your instruction":"the take-off figure"} <span class="linkx runres" data-c="${r.code}" style="margin-left:6px">change</span></td></tr>`).join("")}</tbody></table>`:`<p class="faint" style="font-size:12.5px;margin:0 0 6px">No resolutions yet — settle the open ones on the Queries tab and the log builds here.</p>`}
      <div style="margin-top:18px;padding-top:14px;border-top:1px solid var(--line2)" class="agreewrap">
        ${noboq.length?`<div><b>${noboq.length} in the plan with no BOQ line</b> <span class="faint">(priced nowhere — queries raised):</span> ${noboq.map(r=>r.name).join(" · ")}</div>`:""}
        ${boqonly.length?`<div><b>${boqonly.length} in the BOQ the take-off missed:</b> ${boqonly.map(r=>r.name).join(" · ")}</div>`:""}
        <div><b>${agrees.length} agree</b> <span class="faint">— within ±20%:</span> ${V.showAgree?agrees.map(r=>r.name).join(" · ")+' <span class="morelink" id="hideAgree">hide ‹</span>':`<span class="morelink" id="showAgree">show ›</span>`}</div>
      </div>
    </div>
  </div>`;
}
function wireQueryList(){
  const gi=id=>document.getElementById(id);
  const re=()=>{state._intel=null;state._memo={};state._checks=null;saveState();render();};
  document.querySelectorAll(".ract").forEach(b=>b.onclick=e=>{e.stopPropagation();state.answers.resolved[b.dataset.c]=b.dataset.p;re();});
  document.querySelectorAll(".runres").forEach(b=>b.onclick=e=>{e.stopPropagation();delete state.answers.resolved[b.dataset.c];re();});
  document.querySelectorAll(".qact").forEach(b=>b.onclick=e=>{e.stopPropagation();state.answers.qdone[b.dataset.q]=b.dataset.a;re();});
  if(gi("ruleToggle"))gi("ruleToggle").onclick=()=>{state.intel.showRules=!state.intel.showRules;render();};
  if(gi("resetQ"))gi("resetQ").onclick=()=>{state.answers.qdone={};re();};
  document.querySelectorAll(".fchip").forEach(c=>c.onclick=()=>{state.intel.owner=c.dataset.o;render();});
  if(gi("moreQ"))gi("moreQ").onclick=()=>{state.intel.showAllQ=true;render();};
  if(gi("lessQ"))gi("lessQ").onclick=()=>{state.intel.showAllQ=false;render();};
  if(gi("goInputs"))gi("goInputs").onclick=()=>{state.view="inputs";render();};
}
function wireIntel(){
  const gi=id=>document.getElementById(id);
  wireQueryList();
  if(gi("goQueries"))gi("goQueries").onclick=()=>{state.view="queries";render();};
  document.querySelectorAll(".tlayer").forEach(r=>r.onclick=()=>{state.intel.openLayer=state.intel.openLayer===r.dataset.l?null:r.dataset.l;render();});
  document.querySelectorAll(".fchip").forEach(c=>c.onclick=()=>{state.intel.owner=c.dataset.o;render();});
  if(gi("moreQ"))gi("moreQ").onclick=()=>{state.intel.showAllQ=true;render();};
  if(gi("lessQ"))gi("lessQ").onclick=()=>{state.intel.showAllQ=false;render();};
  if(gi("showAgree"))gi("showAgree").onclick=()=>{state.intel.showAgree=true;render();};
  if(gi("hideAgree"))gi("hideAgree").onclick=()=>{state.intel.showAgree=false;render();};
  if(gi("goInputs"))gi("goInputs").onclick=()=>{state.view="inputs";render();};
}

  return { inputsView, wireInputs, queriesView, intelView, wireQueryList, wireIntel };
}

root.PLAN_VIEW_INTEL = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_VIEW_INTEL;

})(typeof window !== "undefined" ? window : globalThis);
