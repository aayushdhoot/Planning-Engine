// ===================================================================
// DnB-OS . platform/plan/view_calendar.js . THE WORKING CALENDAR VIEW
// Phase 0b, tranche 4. The setup screen the whole plan rides on: the
// month grid with every day coloured, the working week, the holidays
// and shut days in the window, and the weather that stretches durations
// on its own. Its wiring moves WITH it, unlike the plan view's, because
// nothing here reaches into the exporters or the chat box . it only
// edits the calendar and re-renders.
//
//   install(deps) -> { calendarView, windowGrid, wireCalendar }
//
// Every edit path goes through CALP (platform/kb/calendar_project.js),
// which keeps the audit trail. This module holds no calendar law of its
// own and decides nothing . it draws, and it hands edits to CALP.
//
// Bodies moved VERBATIM, lifted by script.
// ===================================================================

;(function (root) {

function install(deps) {
  const { state, CAL, CALP, COND, KIT, CMP, actor, render, saveState, scopedBox } = deps;
  const { fmt, fmtS, MN, DIM } = KIT;
  const { dayState, inMonsoon, breakdown, monthRangeLabel } = CMP;

// the normalised conditions, read through the law rather than raw off
// state, so the screen and the scheduler can never disagree about what
// an unanswered field means
const CD = () => COND.apply(state.answers.conditions);

function calendarView(){
  const c=state.cal,b=breakdown();
  const winHols=c.holidays.filter(h=>h.date>=state.win.intStart&&h.date<=state.win.extEnd);
  const winFests=c.festivals.filter(f=>f.to>=state.win.intStart&&f.from<=state.win.extEnd);
  const shutInWin=winHols.filter(h=>h.siteOff).length;
  const pct=n=>(n/b.cal*100).toFixed(1)+"%";
  return `
  <div class="head"><h1>Working calendar</h1>
    <p>The base every date sits on. A day on the paper calendar is not a working day. Set the week, the shut-days and the weather, sign it off once, and the whole plan reads from it.</p></div>
  ${scopedBox("calendar")}

  <div class="glance">
    <div class="g lead"><div class="gv num">${b.work}</div><div class="gk">working days in the window, of ${b.cal} on paper</div>
      <div class="minibar"><i class="mb-work" style="width:${pct(b.work)}"></i><i class="mb-off" style="width:${pct(b.off)}"></i><i class="mb-shut" style="width:${pct(b.shut)}"></i></div></div>
    <div class="g"><div class="gv num" style="font-size:21px;letter-spacing:-.4px">${fmtS(b.start)} → ${fmtS(b.end)}</div><div class="gk">project window · ${monthRangeLabel()}</div></div>
    <div class="g"><div class="gv num">${b.off+b.shut}</div><div class="gk">days you can't work · ${b.off} Sundays + ${shutInWin} shut-days</div></div>
  </div>

  <div class="runctl">
    <div class="fld"><label>Internal start</label><input type="date" id="winIntS" value="${state.win.intStart}"></div>
    <div class="fld"><label>Internal deadline</label><input type="date" id="winIntE" value="${state.win.intEnd||''}"></div>
    <div class="fld"><label>External start (client)</label><input type="date" id="winExtS" value="${state.win.extStart}"></div>
    <div class="fld"><label>External end (client)</label><input type="date" id="winExtE" value="${state.win.extEnd}"></div>
    <div class="hint">the calendar shows the full envelope — internal start → external end · buffer ${state.win.intEnd?Math.round((CAL._d(state.win.extEnd)-CAL._d(state.win.intEnd))/86400000)+" days":"not set"}</div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>The working window · ${monthRangeLabel()}</h3><p>Every day in the project, coloured. Hover a square to read it.</p></div><div class="right" id="readout">—</div></div>
    <div class="pb">
      <div class="year" id="year">${windowGrid()}</div>
      <div class="legend">
        <div class="li"><span class="sw work"></span>Working day</div>
        <div class="li"><span class="sw off"></span>Weekly off</div>
        <div class="li"><span class="sw shut"></span>Site shut</div>
        <div class="li"><span class="sw fewer"></span>Open, fewer men</div>
        <div class="li"><span class="sw mon"></span>Monsoon</div>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Site conditions</h3><p>What this site is allowed to do. The calendar decides which DAYS are worked; these decide how much of a worked day each task actually gets.</p></div>
      <div class="right"><span class="muted" style="font-size:12.5px">${COND.summarise(CD())}</span></div></div>
    <div class="pb">
      <div class="flex wrap" style="gap:18px;align-items:flex-start">
        <div class="fld"><label>Shift</label>
          <select id="cdShift">
            <option value="day"${CD().shift==="day"?" selected":""}>Day only</option>
            <option value="night"${CD().shift==="night"?" selected":""}>Night only</option>
            <option value="both"${CD().shift==="both"?" selected":""}>Both, round the clock</option>
          </select></div>
        <div class="fld"><label>Productive hours a shift</label>
          <input type="number" id="cdShiftHours" min="1" max="12" step="0.5" value="${CD().shiftHours}" style="width:90px"></div>
        <div class="fld"><label>Premises</label>
          <select id="cdOccupied">
            <option value="empty"${CD().occupied?"":" selected"}>Empty, we have the floor</option>
            <option value="occupied"${CD().occupied?" selected":""}>Occupied while we work</option>
          </select></div>
        <div class="fld"><label>Noisy work, hours a day</label>
          <input type="number" id="cdNoiseHours" min="0.5" max="24" step="0.5" placeholder="no limit" value="${CD().noiseHours==null?"":CD().noiseHours}" style="width:110px"></div>
        <div class="fld"><label>Noise window</label>
          <input type="text" id="cdNoiseWindow" placeholder="e.g. 18:00 to 07:00" value="${(CD().noiseWindow||"").replace(/"/g,"&quot;")}" style="width:160px"></div>
        <div class="fld"><label>Material access, hours a day</label>
          <input type="number" id="cdAccessHours" min="0.5" max="24" step="0.5" placeholder="all day" value="${CD().accessHours==null?"":CD().accessHours}" style="width:120px"></div>
        <div class="fld" style="flex:1;min-width:260px"><label>Access note</label>
          <input type="text" id="cdAccessNote" placeholder="e.g. one shared service lift, bay open 10-1" value="${(CD().accessNote||"").replace(/"/g,"&quot;")}" style="width:100%"></div>
      </div>
      <div class="fld" style="margin-top:12px"><label>Any other limitation</label>
        <input type="text" id="cdLimitations" placeholder="anything a site engineer would write down" value="${(CD().limitations||"").replace(/"/g,"&quot;")}" style="width:100%"></div>
      ${(function(){
        const A = COND.assumptions(state.answers.conditions);
        if (!A.length) return '<p class="faint" style="font-size:12.5px;margin:14px 0 0">Every condition is answered. Nothing here is assumed.</p>';
        return '<div style="margin-top:14px;border-top:1px solid var(--line2);padding-top:12px">'
          + '<div style="font-size:11px;font-weight:600;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">'
          + A.length + ' still assumed &mdash; each one is a query until you answer it</div>'
          + A.map(a=>'<div class="qline"><span class="qo">'+a.question+'</span><span class="qd faint">assumed: '+a.assumed+'</span></div>').join("")
          + '</div>';
      })()}
    </div>
  </div>

  ${(function(){
    const B = CMP.bufferNow && CMP.bufferNow();
    if (!B || !B.extEnd) return "";
    const P = B.proposal;
    const drv = P.drivers.length
      ? P.drivers.map(d=>`<div class="qline"><span class="qo">${d.why}</span><span class="qd num">+${d.days} ${d.days===1?"day":"days"}</span></div>`).join("")
      : `<p class="faint" style="font-size:12.5px;margin:0">Nothing on this project is currently buying more than the base.</p>`;
    return `
  <div class="panel">
    <div class="ph"><div><h3>The two dates</h3><p>The contract end is what was signed. The internal date is walked back from it by the buffer, so the team runs to the tighter one.</p></div>
      <div class="right"><span class="badge ${B.source==="override"?"draft":"appr"}"><span class="d"></span>${B.days} days · ${B.source==="override"?"your call":P.band}</span></div></div>
    <div class="pb">
      <div class="glance">
        <div class="g"><div class="gv num dt">${fmtS(B.extEnd)}</div><div class="gk">contract end · what the client is given</div></div>
        <div class="g"><div class="gv num dt">${B.intEnd?fmtS(B.intEnd):"—"}</div><div class="gk">internal deadline · what the team runs to</div></div>
        <div class="g"><div class="gv num">${B.days}</div><div class="gk">buffer, in calendar days</div></div>
      </div>
      <div style="margin-top:16px;display:flex;gap:18px;align-items:flex-start;flex-wrap:wrap">
        <div class="fld"><label>Buffer the engine proposes</label>
          <div style="font-size:13px;padding:6px 0"><b>${P.days} days</b> <span class="faint">· ${P.why}</span>${P.clamped?` <span class="kind">held at the ${P.days===P.cap?"cap":"floor"}</span>`:""}</div></div>
        <div class="fld"><label>Override</label>
          <input type="number" id="bufDays" min="0" max="120" placeholder="${P.days}" value="${state.answers.bufferDays==null?"":state.answers.bufferDays}" style="width:100px"></div>
        ${state.answers.bufferDays!=null?`<div class="fld"><label>&nbsp;</label><span class="linkx" id="bufClear" style="display:inline-block;padding:7px 0">use the engine's number</span></div>`:""}
      </div>
      ${B.notes.length?`<p class="faint" style="font-size:12.5px;margin:10px 0 0">${B.notes.join(" · ")}</p>`:""}
      <div style="margin-top:14px;border-top:1px solid var(--line2);padding-top:12px">
        <div style="font-size:11px;font-weight:600;color:var(--faint);letter-spacing:.5px;text-transform:uppercase;margin-bottom:6px">What bought the buffer</div>
        ${drv}
      </div>
    </div>
  </div>`;})()}

  <div class="panel">
    <div class="ph"><div><h3>Your work week</h3><p>Tap a day to switch it between a working day and a weekly off.</p></div></div>
    <div class="pb"><div class="wk" id="wk"></div></div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Holidays &amp; shut-days in this window</h3><p>Site fully shut, or open with fewer men. Add your own client or site days.</p></div></div>
    <div class="pb">
      <table><thead><tr><th style="width:118px">Date</th><th>Name</th><th style="width:96px">Type</th><th style="width:230px">Site status</th><th></th></tr></thead><tbody id="holBody"></tbody></table>
      <div class="add-row">
        <div class="fld"><label>Date</label><input type="date" id="nhDate" value="${c.year}-08-21"></div>
        <div class="fld"><label>Name</label><input type="text" id="nhName" placeholder="e.g. Client founders day" style="width:230px"></div>
        <button class="btn pri mini" id="nhAdd">Add day</button>
      </div>
    </div>
  </div>

  <div class="panel">
    <div class="ph"><div><h3>Weather in this window</h3><p>Rain and festivals slow the work. These stretch durations on their own.</p></div></div>
    <div class="pb">
      <div class="row2" style="margin-bottom:18px">
        <div class="fld"><label>Monsoon from</label><input type="date" id="monFrom" value="${c.monsoon.from}"></div>
        <div class="fld"><label>Monsoon to</label><input type="date" id="monTo" value="${c.monsoon.to}"></div>
        <div class="fld"><label>Peak heat from</label><input type="date" id="heatFrom" value="${c.heat.from}"></div>
        <div class="fld"><label>Peak heat to</label><input type="date" id="heatTo" value="${c.heat.to}"></div>
      </div>
      ${winFests.length?`<table><thead><tr><th>Festival</th><th style="width:104px">From</th><th style="width:104px">To</th><th style="width:200px">Manpower at the low point</th></tr></thead>
      <tbody>${winFests.map(f=>`<tr><td><b>${f.name}</b></td><td>${fmtS(f.from)}</td><td>${fmtS(f.to)}</td><td class="num">${Math.round(f.floor*100)}%</td></tr>`).join("")}</tbody></table>`:`<p class="faint" style="font-size:12.5px;margin:0">No festival slowdowns fall inside this window.</p>`}
    </div>
  </div>

  <details class="logwrap">
    <summary>Change log<span class="faint" style="font-weight:500">· ${c.audit.length} changes</span><span class="chev">›</span></summary>
    <div class="pb"><table class="log"><thead><tr><th style="width:130px">When</th><th style="width:88px">Who</th><th style="width:118px">Action</th><th>Detail</th></tr></thead>
    <tbody>${[...c.audit].reverse().map(a=>`<tr><td class="faint num">${new Date(a.ts).toLocaleDateString("en-GB",{day:"2-digit",month:"short"})} ${new Date(a.ts).toLocaleTimeString("en-GB",{hour:"2-digit",minute:"2-digit"})}</td><td class="who">${a.who}</td><td><span class="act ${a.action==='approve'?'approve':a.action==='reopen'?'reopen':''}">${a.action}</span></td><td class="muted">${a.detail}</td></tr>`).join("")}</tbody></table></div>
  </details>`;
}

function windowGrid(){
  const S=CAL._d(state.win.intStart),E=CAL._d(state.win.extEnd),sm=S.getUTCMonth(),em=E.getUTCMonth();
  let axis='<div class="yaxis"><span></span>';
  for(let d=1;d<=31;d++)axis+=`<span>${[1,8,15,22,29].includes(d)?d:""}</span>`;
  axis+="</div>";
  let rows="";
  for(let m=sm;m<=em;m++){let cells="";
    for(let d=1;d<=31;d++){
      if(d>DIM[m]){cells+='<i class="cell empty"></i>';continue;}
      const iso=`2026-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
      if(iso<state.win.intStart||iso>state.win.extEnd){cells+='<i class="cell out"></i>';continue;}
      const st=dayState(iso),mon=inMonsoon(iso)?" mon":"";
      cells+=`<i class="cell ${st.s}${mon}" data-iso="${iso}" data-lab="${st.label}${inMonsoon(iso)?' · monsoon':''}"></i>`;}
    rows+=`<div class="ymonth"><span class="yml">${MN[m]}</span><div class="ydays">${cells}</div></div>`;}
  return axis+rows;
}

function wireCalendar(){
  const c=state.cal,who=()=>actor(),gi=id=>document.getElementById(id);
  gi("winIntS").onchange=e=>{state.win.intStart=e.target.value; if(state.win.extEnd<state.win.intStart)state.win.extEnd=state.win.intStart; saveState(); render();};
  gi("winIntE").onchange=e=>{const v=e.target.value; if(v>state.win.extEnd)return alert("Internal deadline cannot sit after the external end"); state.win.intEnd=v; saveState(); render();};
  gi("winExtS").onchange=e=>{state.win.extStart=e.target.value; saveState(); render();};
  gi("winExtE").onchange=e=>{state.win.extEnd=e.target.value; if(state.win.extEnd<state.win.intStart)state.win.intStart=state.win.extEnd; if(state.win.intEnd&&state.win.intEnd>state.win.extEnd)state.win.intEnd=state.win.extEnd; saveState(); render();};

  const ro=gi("readout"),yr=gi("year");
  yr.addEventListener("mouseover",e=>{const t=e.target.closest(".cell");if(!t||!t.dataset.iso)return;ro.innerHTML=`<b>${fmt(t.dataset.iso)}</b> · ${t.dataset.lab}`;});
  yr.addEventListener("mouseleave",()=>ro.innerHTML="—");

  const wk=gi("wk"),names=["S","M","T","W","T","F","S"];
  wk.innerHTML=names.map((n,i)=>{const off=c.weeklyOffs.includes(i);return `<button class="${off?'off':'work'}" data-d="${i}" title="${off?'Weekly off':'Working day'}">${n}</button>`}).join("");
  wk.querySelectorAll("button").forEach(b=>b.onclick=()=>{const d=+b.dataset.d,set=new Set(c.weeklyOffs);set.has(d)?set.delete(d):set.add(d);try{CALP.setWeeklyOffs(c,[...set],who());render();}catch(err){alert(err.message);}});

  gi("holBody").innerHTML=c.holidays.filter(h=>h.date>=state.win.intStart&&h.date<=state.win.extEnd).map(h=>`<tr>
    <td class="num">${fmtS(h.date)} <span class="faint">'${h.date.slice(2,4)}</span></td>
    <td>${h.name}</td><td><span class="kind">${h.kind}</span></td>
    <td><span class="seg"><button class="shut ${h.siteOff?'on':''}" data-off="1" data-date="${h.date}">Shut</button><button class="open ${!h.siteOff?'on':''}" data-off="0" data-date="${h.date}">Fewer men${!h.siteOff?" · "+Math.round((h.workFactor||0.7)*100)+"%":""}</button></span></td>
    <td style="text-align:right"><span class="linkx" data-rm="${h.date}">Remove</span></td></tr>`).join("")||'<tr><td colspan="5" class="faint" style="text-align:center;padding:16px">No shut-days inside this window yet.</td></tr>';
  gi("holBody").querySelectorAll(".seg button").forEach(b=>b.onclick=()=>{CALP.setSiteOff(c,b.dataset.date,b.dataset.off==="1",who());render();});
  gi("holBody").querySelectorAll("[data-rm]").forEach(x=>x.onclick=()=>{CALP.removeHoliday(c,x.dataset.rm,who());render();});
  gi("nhAdd").onclick=()=>{const d=gi("nhDate").value,n=gi("nhName").value.trim()||"Site holiday";try{CALP.addHoliday(c,{date:d,name:n,kind:"custom",siteOff:true},who());render();}catch(err){alert(err.message);}};

  gi("monFrom").onchange=e=>{CALP.setMonsoon(c,{from:e.target.value,to:c.monsoon.to},who());render();};
  gi("monTo").onchange=e=>{CALP.setMonsoon(c,{from:c.monsoon.from,to:e.target.value},who());render();};
  gi("heatFrom").onchange=e=>{CALP.setHeat(c,{from:e.target.value,to:c.heat.to},who());render();};
  gi("heatTo").onchange=e=>{CALP.setHeat(c,{from:c.heat.from,to:e.target.value},who());render();};

  // ---- site conditions. Every field writes to state.answers.conditions,
  // which is inside planSig, so the plan recomputes and the date moves.
  const setCond = (k, v) => {
    const c = Object.assign({}, state.answers.conditions || {});
    if (v === "" || v == null) delete c[k]; else c[k] = v;
    state.answers.conditions = c;
    state._intel=null; state._memo={}; state._checks=null; state._plan=null;
    saveState(); render();
  };
  const numOrNull = el => { const v = String(el.value).trim(); return v === "" ? null : Number(v); };
  if(gi("cdShift"))       gi("cdShift").onchange       = e => setCond("shift", e.target.value);
  if(gi("cdShiftHours"))  gi("cdShiftHours").onchange  = e => setCond("shiftHours", numOrNull(e.target));
  if(gi("cdOccupied"))    gi("cdOccupied").onchange    = e => setCond("occupied", e.target.value === "occupied");
  if(gi("cdNoiseHours"))  gi("cdNoiseHours").onchange  = e => setCond("noiseHours", numOrNull(e.target));
  if(gi("cdNoiseWindow")) gi("cdNoiseWindow").onchange = e => setCond("noiseWindow", e.target.value.trim());
  if(gi("cdAccessHours")) gi("cdAccessHours").onchange = e => setCond("accessHours", numOrNull(e.target));
  if(gi("cdAccessNote"))  gi("cdAccessNote").onchange  = e => setCond("accessNote", e.target.value.trim());
  if(gi("cdLimitations")) gi("cdLimitations").onchange = e => setCond("limitations", e.target.value.trim());

  // ---- the buffer. It writes to answers, so it is inside planSig and a
  // change re-plans and moves the internal date like any other answer.
  const setBuf = v => {
    const a = Object.assign({}, state.answers);
    if (v == null || v === "") delete a.bufferDays; else a.bufferDays = Number(v);
    state.answers = a;
    const B = CMP.bufferNow && CMP.bufferNow();
    if (B && B.intEnd) state.win = Object.assign({}, state.win, { intEnd: B.intEnd });
    state._intel=null; state._memo={}; state._checks=null; state._plan=null;
    saveState(); render();
  };
  if(gi("bufDays"))  gi("bufDays").onchange = e => setBuf(String(e.target.value).trim());
  if(gi("bufClear")) gi("bufClear").onclick = () => setBuf(null);

  const ab=gi("btnApprove"),rb=gi("btnReopen");
  if(ab)ab.onclick=()=>{try{CALP.approve(c,who());render();}catch(err){alert(err.message);}};
  if(rb)rb.onclick=()=>{CALP.reopen(c,who());render();};
}

  return { calendarView, windowGrid, wireCalendar };
}

root.PLAN_VIEW_CALENDAR = { install };
if (typeof module !== "undefined" && module.exports) module.exports = root.PLAN_VIEW_CALENDAR;

})(typeof window !== "undefined" ? window : globalThis);
