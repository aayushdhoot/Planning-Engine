// ===================================================================
// DnB-OS . platform/plan/view_home.js . PORTFOLIO, NEW PROJECT, COMING
// Phase 0b, tranche 8. The doors in and out of a project:
//   . Portfolio home . every project the engine holds, with its finish
//     date and readiness, plus the card that starts a new one.
//   . New project . name, dates and the zone list off the layout. The
//     engine plans immediately on standard factors, every quantity
//     flagged as an assumption, and hardens when the priced BOQ is read.
//   . Coming . the honest placeholder for a screen not built yet. It
//     says what it will do rather than pretending to be empty.
//
//   install(deps) -> the three views and their wiring
//
// This module reaches back into the app shell more than any other: it
// creates and switches PROJECTS, so it is handed activateProject,
// readBlob, hydrateCustom and saveCustomProject rather than owning any
// of them. Project lifecycle stays in the shell where it belongs.
//
// Bodies moved VERBATIM, lifted by script.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, PROJ, REG, CAL, KIT, CMP,
          render, activateProject, readBlob, hydrateCustom, saveCustomProject } = deps;
  const { fmt, fmtS, dd, daysBetween, colorFor, scoreCol, ringChart } = KIT;
  const { computePlan, computeIntel } = CMP;

function homeView(){
  const cards=REG.map(p=>{
    const active=p.id===PROJ.id;
    const blob=p.id===PROJ.id
      ? {summary:{finish:(state._plan||{}).projectEnd||null,v:state.pub.versions.length,ready:(state._intel&&state._intel.ready&&state._intel.ready.score)||null}}
      : (readBlob(p.id)||{});
    const sm=blob.summary||{};
    return `<div class="panel projcard" data-p="${p.id}" style="cursor:pointer;flex:1;min-width:300px;max-width:420px;${active?"outline:2px solid var(--accent);outline-offset:-1px;":""}">
      <div class="pb">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
          <div class="logo" style="width:36px;height:36px;font-size:11px">${p.name.split(" ")[0].slice(0,3).toUpperCase()}</div>
          <div><b style="font-family:var(--disp);font-size:16px">${p.name}</b><div class="faint" style="font-size:11.5px">${p.sub}</div></div>
        </div>
        <div style="display:flex;gap:20px;margin-top:14px">
          <div><div class="gv num" style="font-size:19px">${p.carpetSqft.toLocaleString("en-IN")}</div><div class="gk">sq ft carpet</div></div>
          <div><div class="gv num" style="font-size:19px">${sm.v?(sm.v===1?"Orig":"R"+(sm.v-1)):"—"}</div><div class="gk">${sm.v?(sm.v===1?"Original published":"revision published"):"not published"}</div></div>
          <div><div class="gv num" style="font-size:19px">${sm.finish?fmtS(sm.finish):"—"}</div><div class="gk">planned finish</div></div>
          <div><div class="gv num" style="font-size:19px">${sm.ready!=null?sm.ready:"—"}</div><div class="gk">readiness</div></div>
        </div>
        <div style="margin-top:14px">
          ${p.hasBoq?'<span class="confp high">BOQ READ</span>':'<span class="confp low">NO BOQ — factor plan</span>'}
          ${active?'<span class="kind" style="margin-left:6px;background:var(--accent-soft);color:var(--accent-ink)">open now</span>':""}
        </div>
      </div></div>`;
  }).join("");
  return `
  <div class="head"><h1>All projects</h1>
    <p>Every project runs the same engine: its own calendar, inputs, queries, Original plan and revisions. Click one to open it, or create a new one from its layout — the engine plans immediately on standard factors and hardens when the BOQ lands.</p></div>
  <div style="display:flex;gap:16px;flex-wrap:wrap">${cards}
    <div class="panel projnew" id="newProj" style="cursor:pointer;flex:1;min-width:300px;max-width:420px;border-style:dashed;display:flex;align-items:center;justify-content:center;min-height:180px">
      <div style="text-align:center;color:var(--accent-ink)"><div style="font-size:28px;font-weight:600;font-family:var(--disp)">+</div><b>New project</b><div class="faint" style="font-size:11.5px;margin-top:4px">name · dates · zones — plan in minutes</div></div>
    </div>
  </div>`;
}
function wireHome(){
  document.querySelectorAll(".projcard").forEach(c=>c.onclick=()=>{
    if(c.dataset.p!==PROJ.id)activateProject(c.dataset.p);
    state.view="calendar";render();
  });
  const np=document.getElementById("newProj");
  if(np)np.onclick=()=>{state.newProj={zones:[blankZone(),blankZone()]};state.view="newproj";render();};
}
function blankZone(){return {name:"",area:"",floor:"carpet",ceiling:"grid",wet:false,ac:true,demo:true,doors:0,ws:0};}

function newProjView(){
  const N=state.newProj;
  const zoneRow=(z,i)=>`<tr>
    <td><input type="text" data-i="${i}" data-f="name" value="${z.name}" placeholder="e.g. Reception" style="width:100%"></td>
    <td><input type="number" data-i="${i}" data-f="area" value="${z.area}" placeholder="sqft" style="width:90px"></td>
    <td><select data-i="${i}" data-f="floor"><option ${z.floor==="carpet"?"selected":""}>carpet</option><option ${z.floor==="vitrified"?"selected":""}>vitrified</option><option ${z.floor==="stone"?"selected":""}>stone</option><option ${z.floor==="vinyl"?"selected":""}>vinyl</option><option ${z.floor==="raised"?"selected":""}>raised</option></select></td>
    <td><select data-i="${i}" data-f="ceiling"><option ${z.ceiling==="grid"?"selected":""}>grid</option><option ${z.ceiling==="gypsum"?"selected":""}>gypsum</option><option ${z.ceiling==="none"?"selected":""}>none</option></select></td>
    <td style="text-align:center"><input type="checkbox" data-i="${i}" data-f="wet" ${z.wet?"checked":""}></td>
    <td style="text-align:center"><input type="checkbox" data-i="${i}" data-f="ac" ${z.ac?"checked":""}></td>
    <td style="text-align:center"><input type="checkbox" data-i="${i}" data-f="demo" ${z.demo?"checked":""}></td>
    <td><input type="number" data-i="${i}" data-f="doors" value="${z.doors}" style="width:56px"></td>
    <td><input type="number" data-i="${i}" data-f="ws" value="${z.ws}" style="width:56px"></td>
    <td><span class="linkx" data-rm="${i}">remove</span></td></tr>`;
  const total=N.zones.reduce((s,z)=>s+(+z.area||0),0);
  return `
  <div class="head"><h1>New project</h1>
    <p>Name, dates, and the zone list from the layout. The engine plans immediately on standard factors — every quantity flagged as an assumption — and hardens the day its priced BOQ is read.</p></div>

  <div class="panel">
    <div class="ph"><div><h3>Project</h3></div></div>
    <div class="pb"><div class="flex wrap" style="gap:12px">
      <div class="fld"><label>Project name</label><input type="text" id="npName" placeholder="e.g. Acme · BKC 4F" style="width:240px" value="${N.name||""}"></div>
      <div class="fld"><label>Descriptor</label><input type="text" id="npSub" placeholder="Design & build fit-out" style="width:220px" value="${N.sub||""}"></div>
      <div class="fld"><label>Internal start</label><input type="date" id="npIS" value="${N.intStart||""}"></div>
      <div class="fld"><label>External start (contract)</label><input type="date" id="npES" value="${N.extStart||""}"></div>
      <div class="fld"><label>External end (contract)</label><input type="date" id="npEE" value="${N.extEnd||""}"></div>
    </div></div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Zones — from the layout</h3><p>Name, area and traits per zone. Wet = washroom/pantry chain. The recipe fills in the rest.</p></div>
      <div class="right"><b>${total.toLocaleString("en-IN")}</b> sq ft total</div></div>
    <div class="pb">
      <table><thead><tr><th>Zone</th><th style="width:100px">Area sqft</th><th style="width:110px">Floor</th><th style="width:100px">Ceiling</th><th style="width:46px">Wet</th><th style="width:46px">AC</th><th style="width:52px">Demo</th><th style="width:66px">Doors</th><th style="width:66px">WS</th><th style="width:70px"></th></tr></thead>
      <tbody id="npZones">${N.zones.map(zoneRow).join("")}</tbody></table>
      <div style="margin-top:12px"><button class="btn ghost mini" id="npAddZone">+ Add zone</button></div>
    </div>
  </div>

  <div class="planctl">
    <button class="btn pri" id="npCreate">Create project &amp; plan it</button>
    <button class="btn ghost" id="npCancel">Cancel</button>
    <span class="hint">no BOQ yet is fine — the plan publishes with honest warnings until it lands</span>
  </div>`;
}
function wireNewProj(){
  const gi=id=>document.getElementById(id);
  const N=state.newProj;
  const keep=()=>{ N.name=gi("npName").value; N.sub=gi("npSub").value;
    N.intStart=gi("npIS").value; N.extStart=gi("npES").value; N.extEnd=gi("npEE").value; };
  document.querySelectorAll("#npZones input,#npZones select").forEach(el=>{
    el.onchange=()=>{ keep();
      const z=N.zones[+el.dataset.i], f=el.dataset.f;
      z[f]=el.type==="checkbox"?el.checked:el.type==="number"?+el.value:el.value;
    };
  });
  document.querySelectorAll("#npZones [data-rm]").forEach(el=>el.onclick=()=>{keep();N.zones.splice(+el.dataset.rm,1);render();});
  gi("npAddZone").onclick=()=>{keep();N.zones.push(blankZone());render();};
  gi("npCancel").onclick=()=>{state.view="home";render();};
  gi("npCreate").onclick=()=>{
    keep();
    const zones=N.zones.filter(z=>z.name.trim()&&+z.area>0);
    if(!N.name||!N.name.trim())return alert("Give the project a name");
    if(!N.intStart||!N.extStart||!N.extEnd)return alert("Set all three dates — internal start, external start and end");
    if(N.extEnd<=N.extStart)return alert("External end must sit after the external start");
    if(!zones.length)return alert("Add at least one zone with a name and an area");
    const id="p-"+N.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+"-"+Date.now().toString(36).slice(-4);
    const carpet=zones.reduce((s,z)=>s+(+z.area),0);
    const zonesData=zones.map((z,i)=>({ id:(z.name.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"")||("zone_"+i)), name:z.name.trim(),
      area:+z.area, conf:"med", demo:z.demo?1:0, wet:z.wet?1:0, ac:z.ac?1:0,
      floor:z.floor, ceiling:z.ceiling==="none"?null:z.ceiling,
      part:z.wet?0:(z.doors>0?1.3:0.15), glaze:z.doors>0?0.4:0.05,
      doors:+z.doors||0, ws:+z.ws||0, data:(+z.ws||0)*2, sanitary:z.wet?Math.max(2,Math.round(z.area/60)):0 }));
    // unique zone ids
    const seen={}; zonesData.forEach(z=>{ while(seen[z.id])z.id=z.id+"_x"; seen[z.id]=1; });
    const meta={ id, name:N.name.trim(), sub:(N.sub&&N.sub.trim())||("Design & build fit-out · "+carpet.toLocaleString("en-IN")+" sq ft · BOQ pending"),
      carpetSqft:carpet, areas:{deck:carpet,boq:null}, hasBoq:false,
      defaults:{intStart:N.intStart,extStart:N.extStart,extEnd:N.extEnd},
      zonesData, version:"created in-app — layout factors; BOQ pending" };
    saveCustomProject(meta);
    REG.push(hydrateCustom(meta));
    state.newProj=null;
    activateProject(id);
    state.view="inputs";render();
  };
}

// =====================================================================
const COMING={
  inputs:{tag:"Next up",title:"Inputs",blurb:"Drop everything the plan needs. The engine reads it — you don't fill forms.",list:["BOQ in any format, plus our own template","The contract: end date, penalty, phasing, payment stages, free-issue items","Layout, design, drawings and site photos or video","Fit-out and brand manuals, and meeting notes","Your internal and client start / end dates"]},
  intel:{tag:"The brain",title:"Intelligence & testing",blurb:"The engine reads it all, shows its working, and only publishes once it is sure.",list:["Marks how sure it is on every task, date and input","Asks the right owner when something is missing, with a due date","Cross-checks every plan line against the BOQ — nothing missed, nothing extra","Runs its own checks before it will publish","One overall readiness score you can trust"]},
  plan:{tag:"The output",title:"Published plan",blurb:"One simple plan out of all that complexity. Approve it, and it is the baseline.",list:["By trade, by zone, by person","Table or gantt, your choice","Internal view and client view (client = internal + buffer, internal-only work hidden)","Versions with a frozen baseline for any claim","The chain of tasks that sets the end date, marked"]},
  today:{tag:"On site",title:"Today / this week",blurb:"The short list. What each person does now, and what is coming this week.",list:["Each person's few tasks for today","This week's look-ahead","What is blocked and who can clear it"]},
};
function comingView(id){const v=COMING[id];return `<div class="soonwrap">
  <div class="soon-tag">◷ ${v.tag} · coming</div>
  <div class="head"><h1>${v.title}</h1><p>${v.blurb}</p></div>
  <div class="panel"><div class="pb">
    <div style="font-size:11px;font-weight:600;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:2px">What it will do</div>
    <ul class="checklist">${v.list.map(x=>`<li><span class="tick"></span><span>${x}</span></li>`).join("")}</ul>
  </div></div>
  <p class="faint" style="font-size:12.5px">Built in order — this screen lights up when we reach its step. The working calendar it all runs on is already live, on the left.</p>
</div>`;}

  return { homeView, wireHome, blankZone, newProjView, wireNewProj, COMING, comingView };
}

root.PLAN_VIEW_HOME = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_VIEW_HOME;

})(typeof window !== "undefined" ? window : globalThis);
