// ===================================================================
// DnB-OS . platform/plan/export.js . THE EXPORTERS
// Phase 0b, tranche 9. Everything that leaves the engine as a file:
//   . the flat row set behind the workbook, internal or client,
//   . the rolled up sheets (programme, gantt grid, long leads, the
//     client committed set),
//   . the XLSX writer,
//   . the print document the PDF is made from, which is a real page
//     with its own cover, footer and page numbering rather than a
//     screenshot of the app.
//
//   install(deps) -> { exportRows, rollupSheets, exportXlsx,
//                      buildPrintHtml, exportPdf }
//
// Note what this module is HANDED rather than owns: clientPlan comes
// from the plan view, because there must be exactly one client
// transform in the engine. An export that re-implemented it would drift
// from the screen, and the client would receive a document that
// disagrees with the plan it was published from.
//
// Bodies moved VERBATIM, lifted by script.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, PROJ, BOQ, CAL, DUR, SEQ, EXP, KIT, CMP,
          actor, clientPlan, vLabelLong, planIsCurrent } = deps;
  const { fmt, fmtS, dd, daysBetween, colorFor, tname, weekStarts, MN } = KIT;
  const { computePlan, computeIntel, planFor, planTree, longLeads,
          catOf, zname, unitOf, tgtName, evData } = CMP;

function exportRows(plan,client){
  const rows=[client
    ?["Category","Sub-category","Activity","Zone","Start","Finish","Working days"]
    :["Category","Sub-category","Task","Zone","Quantity","Unit","Sure","Start","Finish","Working days","Can slip (days)","Critical","Waits on"]];
  const sorted=plan.tasks.slice().sort((a,b)=>a.ES<b.ES?-1:a.ES>b.ES?1:0);
  sorted.forEach(t=>{
    const [cat,sub]=catOf(t);
    if(t.gate){ rows.push(client?[cat,sub,"Joint sign-off — "+t.name,zname(t.zone),fmtS(t.ES),fmtS(t.ES),0]
      :[cat,sub,"HOLD — "+t.name,zname(t.zone),"","","",fmtS(t.ES),fmtS(t.ES),0,"","",""]); return; }
    const qv=(plan.qty[t.id]&&plan.qty[t.id].qty)||t.qty||"";
    rows.push(client
      ?[cat,sub,tname(t),zname(t.zone),fmtS(t.ES),fmtS(t.EF),t.durWD]
      :[cat,sub,tname(t),zname(t.zone),qv===""?"":+qv,unitOf(t.code),(t.conf||"med").toUpperCase(),fmtS(t.ES),fmtS(t.EF),t.durWD,t.floatWD,t.critical?"YES":"",
        t.boundBy==="gang"?"a free gang":t.boundBy==="zone"?"zone space":t.boundBy==="lead"?"delivery":t.boundBy==="pred"?"previous task":"start"]);
  });
  return rows;
}
function rollupSheets(plan,client){
  const tree=planTree(plan);
  const isPh=state.plan.groupBy==="phase"&&PROJ.kt&&PROJ.kt.raGates;
  const g1=state.plan.groupBy==="zone"?"Zone":isPh?"Phase":"Category";
  const lvl1=[["Level","Tasks","Holds"+(client?"":" · critical"),"Start","Finish","Span (days)"].concat(isPh&&!client?["Contract gate"]:[])];
  const sub2=state.plan.groupBy==="cat"?"Sub-category":"Category";
  const lvl2=[[g1,sub2,"Tasks","Holds"+(client?"":" · critical"),"Start","Finish","Span (days)"]];
  tree.forEach(n1=>{
    lvl1.push([n1.label,n1.n||0,(n1.holds||0)+(client?"":" · "+(n1.crit||0)),fmtS(n1.es),fmtS(n1.ef),daysBetween(n1.es,n1.ef)+1].concat(isPh&&!client?[n1.gatechip?n1.gatechip.txt:""]:[]));
    n1.subs.forEach(n2=>lvl2.push([n1.label,n2.label,n2.n||0,(n2.holds||0)+(client?"":" · "+(n2.crit||0)),fmtS(n2.es),fmtS(n2.ef),daysBetween(n2.es,n2.ef)+1]));
  });
  // gantt as a week grid — rows at the CURRENT detail level (his dial drives the file)
  const wks=weekStarts(plan.projectStart,client&&state.win.extEnd>plan.projectEnd?state.win.extEnd:plan.projectEnd);
  const wkEnd=iso=>CAL._iso(CAL._add(CAL._d(iso),6));
  const lvl=state.plan.level;
  const wkHdr=wks.map(wISO=>{const d=CAL._d(wISO);return "wk "+d.getUTCDate()+" "+MN[d.getUTCMonth()].slice(0,3);});
  const cells=(es,ef,holds)=>wks.map(wISO=>{const we=wkEnd(wISO);
    const hold=(holds||[]).some(t=>t.ES<=we&&t.ES>=wISO);
    return hold?"◆":(es<=we&&ef>=wISO)?"▓▓▓":"";});
  let gantt;
  if(lvl==="cat"){
    gantt=[[g1,...wkHdr]];
    tree.forEach(n1=>gantt.push([n1.label,...cells(n1.es,n1.ef,[])]));
  }else if(lvl==="sub"){
    gantt=[[g1,sub2,...wkHdr]];
    tree.forEach(n1=>n1.subs.forEach(n2=>gantt.push([n1.label,n2.label,...cells(n2.es,n2.ef,n2.tasks.filter(t=>t.gate))])));
  }else if(lvl==="act"){
    gantt=[[g1,sub2,"Activity",...wkHdr]];
    tree.forEach(n1=>n1.subs.forEach(n2=>n2.acts.forEach(a=>gantt.push([n1.label,n2.label,a.label,...cells(a.es,a.ef,[])]))));
  }else{
    gantt=[[g1,sub2,client?"Activity":"Task","Zone",...wkHdr]];
    tree.forEach(n1=>n1.subs.forEach(n2=>n2.tasks.forEach(t=>{
      if(t.gate)return;
      gantt.push([n1.label,n2.label,tname(t),zname(t.zone),...cells(t.ES,t.EF,[])]);
    })));
  }
  const lvlA=[[g1,sub2,"Activity","Zones"].concat(client?[]:["Quantity"]).concat(["Start","Finish","Work (days)","Window (days)"])];
  tree.forEach(n1=>n1.subs.forEach(n2=>n2.acts.forEach(a=>{
    lvlA.push([n1.label,n2.label,a.label,Object.keys(a.zones).length].concat(client?[]:[a.qty?Math.round(a.qty)+" "+a.unit:""]).concat([fmtS(a.es),fmtS(a.ef),a.wd||"",daysBetween(a.es,a.ef)+1]));
  })));
  return {lvl1,lvl2,lvlA,gantt,g1,lvl};
}
function exportXlsx(){
  // exports ship WHAT IS ON SCREEN: viewing a published version exports
  // that version's frozen plan, never the current working state
  const viewing=state.pub.viewing?state.pub.versions.find(v=>v.v===state.pub.viewing):null;
  let plan=viewing&&viewing.snap?planFor(viewing):(state._plan||computePlan());
  const client=state.pub.mode==="client";
  if(client)plan=clientPlan(plan);
  const vs=state.pub.versions,last=vs[vs.length-1];
  const vtag=viewing?(viewing.v===1?"Original":"R"+(viewing.v-1)):planIsCurrent(last)?(last.v===1?"Original":"R"+(last.v-1)):"draft";
  const stamp=new Date().toISOString().slice(0,10);
  const R=rollupSheets(plan,client);
  let sheets;
  if(client){
    sheets=[
      {name:"Programme",rows:[
        ["Project programme — "+PROJ.name],[],
        ["Commencement",fmtS(state.win.extStart)],
        (state.win.extEnd&&plan.projectEnd>state.win.extEnd
          ? ["Forecast completion",fmtS(plan.projectEnd)+" (committed "+fmtS(state.win.extEnd)+")"]
          : ["Committed completion",fmtS(state.win.extEnd)])].concat(
        PROJ.kt&&PROJ.kt.raGates?PROJ.kt.raGates.map(g=>["Contract gate "+g.ra,fmtS(CAL._iso(CAL._add(CAL._d(state.win.extStart),g.day)))]):[])},
      {name:"By "+R.g1.toLowerCase(),rows:R.lvl1,freeze:{y:1}},
      {name:"By stage",rows:R.lvl2,freeze:{y:1}},
      {name:"By activity",rows:R.lvlA,freeze:{y:1}},
      {name:"Gantt weeks · "+(R.lvl==="cat"?"top":R.lvl==="sub"?"sub-category":R.lvl==="act"?"activity":"every item"),rows:R.gantt,freeze:{x:R.lvl==="cat"?1:R.lvl==="sub"?2:R.lvl==="act"?3:4,y:1}},
      {name:"Every task detail",rows:exportRows(plan,true),freeze:{y:1}},
    ];
    if(PROJ.kt&&PROJ.kt.clientDeps)sheets.push({name:"From your side",rows:[["What we need","By when"],...PROJ.kt.clientDeps.map(d=>[d[0],d[1]])]});
  }else{
    const I=computeIntel();
    sheets=[
      {name:"Summary",rows:[
        ["Plan — "+PROJ.name+" · "+vtag],[],
        ["Grouping on screen",R.g1+" · "+(state.plan.level==="cat"?"category level":state.plan.level==="sub"?"sub-category level":"every item")],
        ["Start (internal)",fmtS(plan.projectStart)],["Finish",fmtS(plan.projectEnd)],
        ["Internal deadline",state.win.intEnd?fmtS(state.win.intEnd):"not set"],["External commitment",state.win.extEnd?fmtS(state.win.extEnd):"not set"],
        ["Working days",plan.workingDays],["Fronts",plan.fronts+" (engine-set)"],["Peak workers",plan.peakWorkers],
        ["Tasks",plan.tasks.filter(t=>!t.gate).length],["Coordination holds",plan.tasks.filter(t=>t.gate).length]]},
      {name:"By "+R.g1.toLowerCase(),rows:R.lvl1,freeze:{y:1}},
      {name:R.g1==="Category"?"By sub-category":"By "+R.g1.toLowerCase()+" · category",rows:R.lvl2,freeze:{y:1}},
      {name:"By activity",rows:R.lvlA,freeze:{y:1}},
      {name:"Gantt weeks · "+(R.lvl==="cat"?"top":R.lvl==="sub"?"sub-category":R.lvl==="act"?"activity":"every item"),rows:R.gantt,freeze:{x:R.lvl==="cat"?1:R.lvl==="sub"?2:R.lvl==="act"?3:4,y:1}},
      {name:"Every task",rows:exportRows(plan,false),freeze:{y:1}},
      {name:"Weekly EV",rows:(()=>{const E=evData();const hdr=["Category · weight"].concat(E.weeks.map((w,k)=>"W"+(k+1)+" ("+fmtS(w)+")"));
        const out=[hdr,["OVERALL — planned cum %"].concat(E.planned.map(v=>Math.round(v*100)+"%")),
                       ["OVERALL — actual cum % (facts)"].concat(E.weeks.map((w,k)=>k<E.actual.length&&E.actual[k]!=null?Math.round(E.actual[k]*100)+"%":""))];
        const cats={};plan.tasks.filter(t=>!t.gate).forEach(t=>{const [c]=catOf(t);const e=(t.durWD||1)*((DUR.get(t.code)||{}).crew||1);
          const o=cats[c]=cats[c]||{eff:0,inc:new Array(E.weeks.length).fill(0)};o.eff+=e;
          const a2=Math.floor(daysBetween(plan.projectStart,t.ES)/7),b2=Math.floor(daysBetween(plan.projectStart,t.EF)/7),n=Math.max(1,b2-a2+1);
          for(let k=Math.max(0,a2);k<=Math.min(E.weeks.length-1,b2);k++)o.inc[k]+=e/n;});
        Object.keys(cats).forEach(c=>{const o=cats[c];let acc=0;
          out.push([c+" · "+Math.round(o.eff/E.total*100)+"%"].concat(o.inc.map(v=>{acc+=v;return Math.round(acc/o.eff*100)+"%";})));});
        return out;})(),freeze:{x:1,y:1}},
      {name:"Long leads",rows:[["Item","Lead (weeks)","Order by","Needed on site","Zones","Sets the date"],
        ...longLeads(plan).map(l=>[l.name,l.weeks,fmtS(l.orderBy),fmtS(l.ES),l.zones.map(zname).join(", "),l.crit?"YES":""])]},
      {name:"Open queries",rows:[["Severity","Owner","Question","Due"],
        ...I.queries.map(q=>[q.sev.toUpperCase(),q.owner,q.text,fmtS(q.due)])]},
      {name:"Versions",rows:[["Version","Published","By","Fronts","Finish","Why"],
        ...vs.map(v=>[v.v===1?"Original":"R"+(v.v-1),fmtS(v.ts.slice(0,10)),v.who,v.fronts,fmtS(v.projectEnd),v.reason||""])]},
    ];
  }
  const fname=`${PROJ.name.replace(/[^A-Za-z0-9]+/g,"_")}_${client?"programme":"plan"}_${vtag}_${stamp}.xlsx`;
  EXP.download(fname, EXP.xlsx(sheets),"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  return fname;
}

function buildPrintHtml(plan,client,viewing){
  const vs=state.pub.versions,last=vs[vs.length-1];
  // client docs never carry the publisher's name — that is internal provenance
  const vtag=viewing?vLabelLong(viewing)+" · published "+fmtS(viewing.ts.slice(0,10))+(client?"":" by "+viewing.who)
    :planIsCurrent(last)?vLabelLong(last)+" · published "+fmtS(last.ts.slice(0,10))+(client?"":" by "+last.who):"Working draft";
  const tree=planTree(plan);
  const S=plan.projectStart,total=client?Math.max(daysBetween(S,state.win.extEnd)+1,plan.calendarDays):plan.calendarDays;
  const f=iso=>daysBetween(S,iso)/total;
  const months=[];{let d=CAL._d(S);const E=CAL._d(client&&state.win.extEnd>plan.projectEnd?state.win.extEnd:plan.projectEnd);
    while(d<=E){const mEnd=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0));const to=mEnd<E?mEnd:E;
      months.push({lab:MN[d.getUTCMonth()],days:Math.round((to-d)/86400000)+1});d=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,1));}}
  const wkTicks=weekStarts(S,client&&state.win.extEnd>plan.projectEnd?state.win.extEnd:plan.projectEnd)
    .map(iso=>{const d=CAL._d(iso);return `<span style="position:absolute;left:${(f(iso)*100).toFixed(2)}%;border-left:1px solid #ebedf1;padding-left:2px">${d.getUTCDate()}</span>`;}).join("");
  const pweeks=`<div style="position:relative;height:10px;margin-left:190px;font-size:7px;color:#9a9da8">${wkTicks}</div>`;
  const lvl=state.plan.level;
  const gbar=(n,pad,strong)=>`<tr class="pgtr"><td class="pgl" style="padding-left:${pad}px;${strong?"":"font-weight:400;color:#4a4c56"}">${n.label} <span class="pgn">· ${n.n||((n.holds||0)+" holds")}</span></td>
    <td class="pgc"><div class="pgtrack"><div class="pgbar" style="left:${(f(n.es)*100).toFixed(2)}%;width:${Math.max(((daysBetween(n.es,n.ef)+1)/total*100),1).toFixed(2)}%;background:${colorFor(n.label)};${strong?"":"opacity:.55"}"></div></div></td></tr>`;
  const sbar=(label,sub,es,ef)=>`<tr class="pgtr"><td class="pgl" style="padding-left:26px;font-weight:400;color:#4a4c56;font-size:8.5px">${label} <span class="pgn">${sub||""}</span></td>
    <td class="pgc"><div class="pgtrack"><div class="pgbar" style="left:${(f(es)*100).toFixed(2)}%;width:${Math.max(((daysBetween(es,ef)+1)/total*100),0.6).toFixed(2)}%;background:#b9bcd6"></div></div></td></tr>`;
  const gantt=tree.map(n1=>{
    let h=gbar(n1,0,true);
    if(lvl==="cat")return h;
    n1.subs.forEach(n2=>{
      h+=gbar(n2,14,false);
      if(lvl==="act")n2.acts.forEach(a=>h+=sbar(a.label,`· ${Object.keys(a.zones).length}z`,a.es,a.ef));
      if(lvl==="item")n2.tasks.forEach(t=>{if(!t.gate)h+=sbar(tname(t),`· ${zname(t.zone)}`,t.ES,t.EF);});
    });
    return h;
  }).join("");
  const tableRows=tree.map(n1=>{
    let h=`<tr class="pcat"><td colspan="${client?3:5}">${n1.label} · ${n1.n||((n1.holds||0)+" holds")}${!client&&n1.crit?" · "+n1.crit+" critical":""}</td><td>${fmtS(n1.es)}</td><td>${fmtS(n1.ef)}</td><td>${daysBetween(n1.es,n1.ef)+1}d</td></tr>`;
    if(lvl==="cat")return h;
    n1.subs.forEach(n2=>{
      h+=`<tr class="psub"><td colspan="${client?3:5}" style="padding-left:18px">${n2.label} · ${n2.n||((n2.holds||0)+" holds")}</td><td>${fmtS(n2.es)}</td><td>${fmtS(n2.ef)}</td><td>${daysBetween(n2.es,n2.ef)+1}d</td></tr>`;
      if(lvl==="act"){n2.acts.forEach(a=>{const zn=Object.keys(a.zones).length,win=daysBetween(a.es,a.ef)+1;
        const dt=a.wd&&a.wd<win?`${a.wd}d <span class="pgn">/ ${win}d win</span>`:win+"d";
        h+=client
          ?`<tr><td colspan="3" style="padding-left:34px">${a.label} <span class="pgn">· ${zn} zone${zn>1?"s":""}, zone by zone</span></td><td>${fmtS(a.es)}</td><td>${fmtS(a.ef)}</td><td>${dt}</td></tr>`
          :`<tr><td colspan="3" style="padding-left:34px">${a.crit?"⚡ ":""}${a.label} <span class="pgn">· ${zn} zone${zn>1?"s":""}</span></td><td>${a.qty?Math.round(a.qty).toLocaleString("en-IN")+" "+a.unit:""}</td><td></td><td>${fmtS(a.es)}</td><td>${fmtS(a.ef)}</td><td>${dt}</td></tr>`;});
        return;}
      if(lvl!=="item")return;
      n2.tasks.forEach(t=>{
        if(t.gate){h+=`<tr class="phold"><td colspan="${client?5:7}" style="padding-left:34px">◆ HOLD — ${t.name} · ${zname(t.zone)}</td><td>${fmtS(t.ES)}</td></tr>`;return;}
        const qv=(plan.qty[t.id]&&plan.qty[t.id].qty)||t.qty||"";
        h+=client
          ?`<tr><td colspan="3" style="padding-left:34px">${tname(t)} <span class="pgn">· ${zname(t.zone)}</span></td><td>${fmtS(t.ES)}</td><td>${fmtS(t.EF)}</td><td>${t.durWD}d</td></tr>`
          :`<tr><td colspan="3" style="padding-left:34px">${t.critical?"⚡ ":""}${tname(t)} <span class="pgn">· ${zname(t.zone)}</span></td><td>${qv?qv+" "+unitOf(t.code):""}</td><td>${(t.conf||"med").toUpperCase()}</td><td>${fmtS(t.ES)}</td><td>${fmtS(t.EF)}</td><td>${t.durWD}d</td></tr>`;
      });
    });
    return h;
  }).join("");
  const leads=client?"":`<h2>Long-lead items</h2><table><thead><tr><th>Item</th><th>Lead</th><th>Order by</th><th>Needed on site</th><th></th></tr></thead><tbody>
    ${longLeads(plan).map(l=>`<tr><td>${l.name}</td><td>${l.weeks} wks</td><td><b>${fmtS(l.orderBy)}</b></td><td>${fmtS(l.ES)}</td><td>${l.crit?"◆ sets the date":""}</td></tr>`).join("")}</tbody></table>`;
  const breach=client&&state.win.extEnd&&plan.projectEnd>state.win.extEnd;
  const conting=client
    ?(breach
      ? `<div class="pchip" style="border-color:#d9a08f;background:#fdf6f4">Forecast completion ${fmtS(plan.projectEnd)} · this programme runs past the committed ${fmtS(state.win.extEnd)} by ${daysBetween(state.win.extEnd,plan.projectEnd)} days · commencement ${fmtS(state.win.extStart)}</div>`
      : `<div class="pchip">Committed completion ${fmtS(state.win.extEnd)} · commencement ${fmtS(state.win.extStart)} · programme on the agreed site calendar</div>`)
    :"";
  const cdeps=client&&PROJ.kt&&PROJ.kt.clientDeps?`<h2>Inputs we are counting on from your side</h2><table><thead><tr><th>What we need</th><th style="width:280px">By when</th></tr></thead><tbody>
    ${PROJ.kt.clientDeps.map(d=>`<tr><td>${d[0]}</td><td>${d[1]}</td></tr>`).join("")}</tbody></table>`:"";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${client?"Project programme":"Project plan"} — ${PROJ.name}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Space+Grotesk:wght@500;600&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  body{font-family:Inter,-apple-system,sans-serif;color:#17181f;font-size:11px;margin:34px 38px;line-height:1.45}
  h1{font-family:'Space Grotesk',Inter,sans-serif;font-size:21px;margin:0 0 2px;letter-spacing:-.5px}
  h2{font-family:'Space Grotesk',Inter,sans-serif;font-size:13px;margin:22px 0 8px;letter-spacing:-.2px}
  .psubtl{color:#6a6d79;margin:0 0 14px}
  .pmeta{display:flex;gap:26px;border:1px solid #ebedf1;border-radius:10px;padding:12px 16px;margin-bottom:16px}
  .pmeta div b{display:block;font-family:'Space Grotesk';font-size:15px}
  .pmeta div span{color:#6a6d79;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px}
  .pchip{background:#ececfb;color:#4a48c4;border-radius:8px;padding:8px 12px;font-weight:600;font-size:10.5px;margin-bottom:14px}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}
  th{text-align:left;font-size:8.5px;letter-spacing:.5px;text-transform:uppercase;color:#9a9da8;padding:5px 6px;border-bottom:1px solid #ebedf1}
  td{padding:4.5px 6px;border-bottom:1px solid #f4f5f7;vertical-align:top}
  tr.pcat td{background:#f4f5f7;font-weight:600;font-size:10.5px}
  tr.psub td{font-weight:600;color:#3a3c46}
  tr.phold td{color:#8a6a12;background:#fbfaf7}
  .pgn{color:#9a9da8;font-weight:400}
  .pgrow{display:flex;align-items:center;min-height:15px;margin:2px 0}
  .pglabel{width:190px;flex:none;font-size:9.5px;font-weight:600}
  .pgtrack{position:relative;flex:1;height:9px;background:#f4f5f7;border-radius:5px}
  .pgbar{position:absolute;top:1.5px;height:6px;border-radius:3px}
  .pgt{width:100%;border-collapse:collapse}
  .pgt thead{display:table-header-group}
  .pgt .pgl{width:190px;padding:1px 6px 1px 0;border:none;font-size:9.5px;font-weight:600;text-align:left;vertical-align:middle}
  .pgt .pgc{border:none;padding:1px 0;vertical-align:middle}
  .pgt thead th{border-bottom:1px solid #ebedf1;padding-bottom:2px}
  .pgtr{page-break-inside:avoid}
  .pmonths{display:flex;margin-left:190px;margin-bottom:2px}
  .pmonths span{font-size:8px;color:#9a9da8;letter-spacing:.4px;text-transform:uppercase}
  .pfoot{margin-top:18px;color:#9a9da8;font-size:9px;border-top:1px solid #ebedf1;padding-top:8px}
  @page{margin:12mm}
  h2,tr.pcat{page-break-after:avoid}
</style></head><body>
<h1>${client?"Project programme":"Project plan"} — ${PROJ.name}</h1>
<p class="psubtl">Flipspaces · ${PROJ.sub} · ${vtag} · ${client?"client programme":"internal plan"} · ${state.plan.mode==="gantt"?"gantt":"table"} · grouped by ${state.plan.groupBy==="zone"?"zone":state.plan.groupBy==="phase"?"contract phase":"category"} · ${state.plan.level==="cat"?"category level":state.plan.level==="sub"?"sub-category level":state.plan.level==="act"?"activity level":"every item"} · generated ${fmtS(new Date().toISOString().slice(0,10))}</p>
<div class="pmeta">
  <div><b>${fmtS(client?state.win.extStart:plan.projectStart)}</b><span>${client?"commencement":"start"}</span></div>
  <div><b>${fmtS(client&&!(state.win.extEnd&&plan.projectEnd>state.win.extEnd)?state.win.extEnd:plan.projectEnd)}</b><span>${client?(state.win.extEnd&&plan.projectEnd>state.win.extEnd?"forecast completion":"committed completion"):"planned finish"}</span></div>
  ${client?"":`<div><b>${plan.workingDays}</b><span>working days</span></div>`}
  <div><b>${plan.tasks.length-plan.gates.length}</b><span>activities · ${PROJ.zones.length} zones</span></div>
  ${client?"":`<div><b>${plan.peakWorkers}</b><span>peak workers</span></div><div><b>${plan.fronts}</b><span>fronts (engine-set)</span></div>`}
</div>
${conting}
${state.plan.mode==="gantt"?"":cdeps}
<h2>${state.plan.mode==="gantt"?"Programme — gantt":"Programme overview"}</h2>
<table class="pgt"><thead><tr><th class="pgl"></th><th class="pgc"><div class="pmonths" style="margin-left:0">${months.map(m=>`<span style="width:${(m.days/total*100).toFixed(2)}%">${m.lab}</span>`).join("")}</div>
<div style="position:relative;height:10px;font-size:7px;color:#9a9da8">${wkTicks}</div></th></tr></thead>
<tbody>${gantt}</tbody></table>
${state.plan.mode==="gantt"?"":leads}
${state.plan.mode==="gantt"?"":`<h2>${client?"Working schedule":"The dated plan"}</h2>
<table><thead><tr>${client?"<th colspan='3'>Activity</th><th>Start</th><th>Finish</th><th>Days</th>":"<th colspan='3'>Task</th><th>Quantity</th><th>Sure</th><th>Start</th><th>Finish</th><th>Days</th>"}</tr></thead>
<tbody>${tableRows}</tbody></table>`}
<div class="pfoot">${client?"Programme on the agreed site working calendar — Sundays, festivals and seasonal conditions accounted for.":"Generated by the DnB-OS planning engine · quantities from the priced BOQ where it speaks, deck factors flagged where it is silent · schedule on the approved Pune working calendar (Sundays, festivals, monsoon inside)"}</div>
</body></html>`;
}
function exportPdf(){
  const viewing=state.pub.viewing?state.pub.versions.find(v=>v.v===state.pub.viewing):null;
  let plan=viewing&&viewing.snap?planFor(viewing):(state._plan||computePlan());
  if(state.pub.mode==="client")plan=clientPlan(plan);
  return !!EXP.printDoc(buildPrintHtml(plan,state.pub.mode==="client",viewing));
}

  return { exportRows, rollupSheets, exportXlsx, buildPrintHtml, exportPdf };
}

root.PLAN_EXPORT = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_EXPORT;

})(typeof window !== "undefined" ? window : globalThis);
