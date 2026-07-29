// Branded, printable reports. The client and internal documents are deliberately
// different documents — different sections, different depth, different numbers (SPEC §5).
import type { Plan } from '../engine/planner';

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
const esc = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!));

const CSS = `
  @page { size: A4 landscape; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 11px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif; color: #14181f; margin: 0; padding: 24px; background: #fff; }
  .cover { border-top: 6px solid var(--brand); padding-top: 18px; margin-bottom: 26px; }
  .cover h1 { font-size: 26px; margin: 0 0 4px; letter-spacing: -.3px; }
  .cover .sub { color: #5a6472; font-size: 13px; }
  .badge { display: inline-block; background: var(--brand); color: #fff; padding: 3px 10px; border-radius: 20px; font-size: 10px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; }
  h2 { font-size: 14px; margin: 26px 0 8px; padding-bottom: 5px; border-bottom: 2px solid var(--brand); color: #14181f; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; }
  th { background: #f2f4f7; text-align: left; padding: 6px 8px; border-bottom: 1px solid #d8dee6; font-size: 9.5px; text-transform: uppercase; letter-spacing: .4px; color: #5a6472; }
  td { padding: 5px 8px; border-bottom: 1px solid #edf0f4; vertical-align: top; }
  .kpis { display: flex; gap: 12px; flex-wrap: wrap; margin: 14px 0 4px; }
  .kpi { border: 1px solid #e2e7ee; border-left: 3px solid var(--brand); border-radius: 6px; padding: 9px 13px; min-width: 150px; }
  .kpi .k { color: #5a6472; font-size: 9px; text-transform: uppercase; letter-spacing: .5px; }
  .kpi .v { font-size: 17px; font-weight: 700; margin-top: 2px; }
  .kpi .s { color: #7d8797; font-size: 9px; margin-top: 2px; }
  .crit { color: #c1121f; font-weight: 600; }
  .muted { color: #7d8797; }
  .note { background: #f7f9fc; border-left: 3px solid var(--brand); padding: 9px 13px; margin: 12px 0; font-size: 10.5px; }
  footer { margin-top: 30px; padding-top: 10px; border-top: 1px solid #e2e7ee; color: #7d8797; font-size: 9px; }
  .src { color: #99a3b1; font-size: 8.5px; }
`;

function shell(title: string, brand: string, body: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>:root{--brand:${brand}}${CSS}</style></head><body>${body}</body></html>`;
}

export function renderReport(plan: Plan, audience: 'client' | 'internal'): string {
  return audience === 'client' ? clientReport(plan) : internalReport(plan);
}

// ---------------------------------------------------------------- CLIENT
function clientReport(plan: Plan): string {
  const p = plan.project;
  if (p.status === 'pending_inputs')
    return shell(`${p.name} — Project Programme`, '#0f6fff', `
      <div class="cover"><span class="badge">Client issue</span>
        <h1>${esc(p.name)}</h1><div class="sub">Programme pending input handover</div></div>
      <div class="note">The programme has not yet been issued. The following inputs are required before a baseline can be published: ${esc(plan.missingInputs.join(', '))}.</div>
      <footer>Flipspaces · ${plan.engine.name} v${plan.engine.version}</footer>`);

  const ms = plan.external!.milestones;
  const totalValue = p.contractValue?.value ?? 0;
  return shell(`${p.name} — Project Programme`, '#0f6fff', `
  <div class="cover">
    <span class="badge">Client issue · Contract baseline</span>
    <h1>${esc(p.name)}</h1>
    <div class="sub">${esc(p.client)} · ${esc(p.location)}</div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="k">Commencement</div><div class="v">${plan.external!.start}</div></div>
    <div class="kpi"><div class="k">Contract completion</div><div class="v">${plan.external!.end}</div><div class="s">per agreement</div></div>
    <div class="kpi"><div class="k">Area</div><div class="v">${p.areaSft ? p.areaSft.value.toLocaleString('en-IN') + ' sft' : '—'}</div></div>
    <div class="kpi"><div class="k">Contract value</div><div class="v">${totalValue ? inr(totalValue) : '—'}</div><div class="s">excl. taxes</div></div>
  </div>

  <h2>Programme by phase</h2>
  <table><thead><tr><th>Phase</th><th>Start</th><th>Completion</th></tr></thead><tbody>
  ${plan.modules.timeline.phases.map((x) => `<tr><td>${esc(x.name)}</td><td>${x.start}</td><td>${x.end}</td></tr>`).join('')}
  </tbody></table>

  <h2>Payment milestones</h2>
  <table><thead><tr><th>Stage</th><th>Target date</th><th>%</th><th>Value</th><th>Scope covered</th></tr></thead><tbody>
  ${ms.map((m) => `<tr><td><strong>${m.code}</strong></td><td>${m.date}</td><td>${m.percent}%</td><td>${inr(Math.round((m.percent / 100) * totalValue))}</td><td class="muted">${esc(m.description)}</td></tr>`).join('')}
  </tbody></table>

  <h2>Design deliverables — approval dates</h2>
  <table><thead><tr><th>Category</th><th>Deliverable</th><th>Criticality</th><th>Approval required by</th></tr></thead><tbody>
  ${plan.modules.design.rows.map((d) => `<tr><td>${d.category}</td><td>${esc(d.drawingName)}</td><td>${d.criticality}</td><td>${d.endDateClient ?? '—'}</td></tr>`).join('')}
  </tbody></table>

  <h2>Procurement — delivery dates required on site</h2>
  <table><thead><tr><th>Package</th><th>Criticality</th><th>Delivery required</th></tr></thead><tbody>
  ${plan.modules.procurement.map((i) => `<tr><td>${esc(i.category)}</td><td>${i.criticality}</td><td>${i.deliveryRequired ?? '—'}</td></tr>`).join('')}
  </tbody></table>

  <h2>Inputs required from client / builder</h2>
  <div class="note">The dates below are the latest at which each item can be received without impacting the contract completion date.</div>
  <table><thead><tr><th>Sr</th><th>Area</th><th>Description</th><th>Responsibility</th><th>Plan date</th><th>Status</th></tr></thead><tbody>
  ${plan.modules.dependencies.map((d) => `<tr><td>${d.sr}</td><td>${esc(d.area)}</td><td>${esc(d.description)}</td><td>${esc(d.responsibility)}</td><td>${d.planDate ?? '—'}</td><td>${d.status}</td></tr>`).join('')}
  </tbody></table>

  <h2>Billing schedule</h2>
  <table><thead><tr><th>Period</th><th>Billing</th><th>Cumulative</th></tr></thead><tbody>
  ${plan.modules.raMilestones.map((r) => `<tr><td>${r.code}</td><td>${r.dueDate}</td><td>${r.percent}%</td></tr>`).join('')}
  </tbody></table>

  ${plan.assumptions.length ? `<h2>Notes</h2><ul>${plan.assumptions.map((a) => `<li>${esc(a.text)}</li>`).join('')}</ul>` : ''}

  <footer>Flipspaces · ${plan.engine.name} v${plan.engine.version} · norms ${plan.engine.normsVersion}. Programme anchored to the contract baseline.</footer>`);
}

// -------------------------------------------------------------- INTERNAL
function internalReport(plan: Plan): string {
  const p = plan.project;
  if (p.status === 'pending_inputs')
    return shell(`${p.name} — Internal Plan`, '#c1121f', `
      <div class="cover"><span class="badge">Internal — not for client issue</span>
        <h1>${esc(p.name)}</h1><div class="sub">Pending inputs</div></div>
      <div class="note"><strong>No plan generated.</strong> Mandatory inputs missing: ${esc(plan.missingInputs.join(', '))}.
      The engine deliberately does not fabricate a baseline. Obtain the priced BOQ and contract to proceed.</div>
      <footer>Flipspaces · ${plan.engine.name} v${plan.engine.version}</footer>`);

  const acts = plan.modules.timeline.activities;
  const cp = acts.filter((a) => a.critical);
  const clauses = plan.modules.raMilestones.reduce((s, m) => s + m.checkpoints.length, 0);

  return shell(`${p.name} — Internal Execution Plan`, '#c1121f', `
  <div class="cover">
    <span class="badge">Internal — not for client issue</span>
    <h1>${esc(p.name)}</h1>
    <div class="sub">${esc(p.client)} · ${esc(p.location)} · confidence ${Math.round(plan.confidence.score * 100)}%</div>
  </div>

  <div class="kpis">
    <div class="kpi"><div class="k">Internal target finish</div><div class="v">${plan.internal!.end}</div><div class="s">${plan.internal!.durationWorkingDays} working days (CPM)</div></div>
    <div class="kpi"><div class="k">Contract finish</div><div class="v">${plan.external!.end}</div></div>
    <div class="kpi"><div class="k">Buffer</div><div class="v">${plan.ieInvariant.bufferCalendarDays}d</div><div class="s">${plan.ieInvariant.holds ? 'invariant holds' : 'BREACH'}</div></div>
    <div class="kpi"><div class="k">Critical activities</div><div class="v">${cp.length} / ${acts.length}</div></div>
    <div class="kpi"><div class="k">Peak manpower</div><div class="v">${plan.modules.manpower.peak}</div><div class="s">${plan.modules.manpower.peakDate}</div></div>
    <div class="kpi"><div class="k">Margin</div><div class="v">${plan.margin ? plan.margin.value + '%' : '—'}</div><div class="s">${clauses} RA clauses tracked</div></div>
    <div class="kpi"><div class="k">Contract value</div><div class="v">${plan.project.contractValue ? inr(plan.project.contractValue.value) : '—'}</div></div>
  </div>

  <h2>Critical path (${cp.length} activities — zero float)</h2>
  <table><thead><tr><th>#</th><th>Activity</th><th>Trade</th><th>Dur</th><th>Start</th><th>Finish</th><th>Duration source</th></tr></thead><tbody>
  ${cp.map((a) => `<tr><td class="muted">${a.id}</td><td class="crit">${esc(a.name)}</td><td class="muted">${esc(a.trade)}</td><td>${a.duration.value}d</td><td>${a.startDate}</td><td>${a.endDate}</td><td class="src">${esc(a.duration.source)}</td></tr>`).join('')}
  </tbody></table>

  <h2>Full activity schedule</h2>
  <table><thead><tr><th>#</th><th>Activity</th><th>Phase</th><th>Dur</th><th>ES</th><th>EF</th><th>LS</th><th>LF</th><th>Float</th></tr></thead><tbody>
  ${acts.map((a) => `<tr><td class="muted">${a.id}</td><td>${esc(a.name)}</td><td class="muted">${esc(a.phase)}</td><td>${a.duration.value}</td><td>${a.startDate}</td><td>${a.endDate}</td><td>${a.ls}</td><td>${a.lf}</td><td class="${a.critical ? 'crit' : ''}">${a.totalFloat}d</td></tr>`).join('')}
  </tbody></table>

  <h2>Design tracker — GFC / MEP / Sampling</h2>
  <table><thead><tr><th>Category</th><th>Sub</th><th>Drawing</th><th>Criticality</th><th>Issue (INT)</th><th>Status (INT)</th><th>Approval (client)</th><th>Status (client)</th></tr></thead><tbody>
  ${plan.modules.design.rows.map((d) => `<tr><td>${d.category}</td><td class="muted">${esc(d.subCategory)}</td><td>${esc(d.drawingName)}</td><td>${d.criticality}</td><td>${d.endDateInt ?? '—'}</td><td>${d.statusInt}</td><td>${d.endDateClient ?? '—'}</td><td>${d.statusClient}</td></tr>`).join('')}
  </tbody></table>

  <h2>Procurement — order-by and delivery required</h2>
  <table><thead><tr><th>Category</th><th>Sub</th><th>Criticality</th><th>Order by</th><th>Delivery required</th><th>Vendor</th><th>Order status</th><th>Gated by</th></tr></thead><tbody>
  ${plan.modules.procurement.map((i) => `<tr><td>${esc(i.category)}</td><td class="muted">${esc(i.subCategory)}</td><td>${i.criticality}</td><td>${i.orderBy ?? '—'}</td><td>${i.deliveryRequired ?? '—'}</td><td>${esc(i.vendor) || '—'}</td><td>${i.orderStatus}</td><td class="src">${esc(i.gatedBy ?? '—')}</td></tr>`).join('')}
  </tbody></table>

  <h2>Manpower — levelled contractor gangs</h2>
  <table><thead><tr><th>Trade</th><th>From</th><th>To</th><th>Days</th><th>Man-days</th><th>Core gang</th><th>Peak</th></tr></thead><tbody>
  ${plan.modules.manpower.trades.map((t) => `<tr><td>${esc(t.trade)}</td><td>${t.start}</td><td>${t.end}</td><td>${t.activeDays}</td><td>${t.manDays}</td><td><strong>${t.coreCrew.value}</strong></td><td>${t.peakCrew}</td></tr>`).join('')}
  </tbody></table>

  <h2>Resource plan</h2>
  <table><thead><tr><th>Role</th><th>Count</th><th>Basis</th></tr></thead><tbody>
  ${plan.modules.resources.map((r) => `<tr><td>${esc(r.role)}</td><td>${r.count.value}</td><td class="src">${esc(r.count.source)}</td></tr>`).join('')}
  </tbody></table>

  <h2>RA billing milestones</h2>
  <table><thead><tr><th>RA</th><th>Due</th><th>%</th><th>Amount</th><th>Clauses</th><th>Status</th></tr></thead><tbody>
  ${plan.modules.raMilestones.map((m) => `<tr><td>${m.code}</td><td>${m.dueDate}</td><td>${m.percent}%</td><td>${m.amount == null ? '—' : inr(m.amount)}</td><td>${m.checkpoints.length}</td><td>${m.status}</td></tr>`).join('')}
  </tbody></table>

  <h2>To-do list — next 21 days</h2>
  <table><thead><tr><th>End date</th><th>Responsibility</th><th>Description</th><th>Priority</th><th>Status</th><th>Notes</th></tr></thead><tbody>
  ${plan.modules.todos.map((t) => `<tr><td>${t.endDate ?? '—'}</td><td>${esc(t.responsibility)}</td><td>${esc(t.description)}</td><td>${t.priority}</td><td>${t.status}</td><td class="muted">${esc(t.notes)}</td></tr>`).join('')}
  </tbody></table>

  <h2>Client / builder open points</h2>
  <table><thead><tr><th>Sr</th><th>Area</th><th>Description</th><th>Responsibility</th><th>Plan date</th><th>Status</th><th>Remarks</th></tr></thead><tbody>
  ${plan.modules.dependencies.map((d) => `<tr><td>${d.sr}</td><td>${esc(d.area)}</td><td>${esc(d.description)}</td><td>${esc(d.responsibility)}</td><td>${d.planDate ?? '—'}</td><td>${d.status}</td><td class="muted">${esc(d.remarks)}</td></tr>`).join('')}
  </tbody></table>

  <h2>Assumptions, gaps and risks</h2>
  <table><thead><tr><th>Area</th><th>Note</th><th>Visibility</th></tr></thead><tbody>
  ${plan.assumptions.map((a) => `<tr><td>${esc(a.area)}</td><td>${esc(a.text)}</td><td class="${a.internalOnly ? 'crit' : 'muted'}">${a.internalOnly ? 'internal only' : 'shared with client'}</td></tr>`).join('')}
  </tbody></table>

  <footer>Flipspaces · ${plan.engine.name} v${plan.engine.version} · norms ${plan.engine.normsVersion} · confidence basis: ${esc(plan.confidence.basis)}<br>
  Contains internal cost (BCS), margin and buffer data. Not for external circulation.</footer>`);
}
