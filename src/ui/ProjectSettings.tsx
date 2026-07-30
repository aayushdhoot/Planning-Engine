// Project settings — everything that describes THIS project rather than the plan computed from
// it: where the documents live, where the site is, and who is on it.
//
// This replaces the old "New project" tab. Creating a project was only ever the first use of
// the same screen; a project's Drive folder needs re-scanning and re-reading long after it was
// created, and there was nowhere to do that.
import { useState } from 'react';
import type { ProjectInputs } from '../domain/types';
import {
  departmentLabel,
  employeeByCode,
  groupedTeam,
  isAssignable,
  levelFor,
  siteFor,
  teamFor,
  type OrgState,
  type ProjectSite,
} from '../domain/org';
import { Intake } from './Intake';
import { approverFor, type ScheduleDatesLike } from '../domain/org';

type Pane = 'drive' | 'site' | 'dates' | 'team';
const PANES: { key: Pane; label: string }[] = [
  { key: 'drive', label: 'Drive & inputs' },
  { key: 'site', label: 'Site details' },
  { key: 'dates', label: 'Schedule dates' },
  { key: 'team', label: 'Project team' },
];

export function ProjectSettings({
  project,
  org,
  setOrg,
  clientId,
  existingIds,
  onCreate,
}: {
  project: ProjectInputs;
  org: OrgState;
  setOrg: (o: OrgState) => void;
  clientId: string;
  existingIds: string[];
  onCreate: (p: ProjectInputs) => void;
}) {
  const [pane, setPane] = useState<Pane>('drive');
  const site = siteFor(org, project.id);
  const setSite = (patch: Partial<ProjectSite>) =>
    setOrg({ ...org, sites: { ...(org.sites ?? {}), [project.id]: { ...site, ...patch } } });

  return (
    <>
      {/* project header bar, mirroring the operations tool */}
      <div
        className="card"
        style={{ marginBottom: 14, display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap', background: 'var(--panel2)' }}
      >
        <div>
          <strong style={{ fontSize: 14 }}>{project.name}</strong>
          <div className="faint" style={{ fontSize: 11 }}>{site.projectCode || project.id}</div>
        </div>
        <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 18 }}>
          <div className="k">Carpet area</div>
          <div style={{ fontWeight: 600 }}>
            {(site.carpetAreaSft ?? project.areaSft?.value)?.toLocaleString('en-IN') ?? '—'} sft
          </div>
        </div>
        <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 18 }}>
          <div className="k">City</div>
          <div style={{ fontWeight: 600 }}>{site.city || '—'}</div>
        </div>
        <div style={{ borderLeft: '1px solid var(--line)', paddingLeft: 18 }}>
          <div className="k">Team assigned</div>
          <div style={{ fontWeight: 600 }}>{teamFor(org, project.id).filter((m) => m.employeeCode).length} people</div>
        </div>
      </div>

      <div className="row" style={{ marginBottom: 16 }}>
        <div className="seg">
          {PANES.map((p) => (
            <button key={p.key} className={pane === p.key ? 'on' : ''} onClick={() => setPane(p.key)}>{p.label}</button>
          ))}
        </div>
      </div>

      {pane === 'drive' && (
        <Intake clientId={clientId} existingIds={existingIds} onCreate={onCreate} initialUrl={site.driveUrl} onUrlChange={(driveUrl) => setSite({ driveUrl })} />
      )}
      {pane === 'site' && <SiteDetails site={site} setSite={setSite} project={project} />}
      {pane === 'dates' && <ScheduleDates org={org} setOrg={setOrg} projectId={project.id} />}
      {pane === 'team' && <ProjectTeam org={org} setOrg={setOrg} projectId={project.id} />}
    </>
  );
}

// ------------------------------------------------------------------ site

function SiteDetails({ site, setSite, project }: { site: ProjectSite; setSite: (p: Partial<ProjectSite>) => void; project: ProjectInputs }) {
  const field = (label: string, key: keyof ProjectSite, placeholder = '', width = 240) => (
    <div className="field" style={{ minWidth: width }}>
      <label>{label}</label>
      <input value={String(site[key] ?? '')} placeholder={placeholder} onChange={(e) => setSite({ [key]: e.target.value } as Partial<ProjectSite>)} />
    </div>
  );

  const boqArea = project.areaSft?.value ?? null;
  const differs = site.carpetAreaSft !== null && boqArea !== null && site.carpetAreaSft !== boqArea;

  return (
    <>
      <h2>Site details</h2>
      <p className="muted" style={{ marginTop: -6, maxWidth: 860 }}>
        Where the project physically is. Carpet area set here overrides the figure read from the BOQ — the two are not
        always the same number, and the resource plan is scaled from it.
      </p>

      <div className="row">
        {field('Project code', 'projectCode', 'FSINDB25260076')}
        <div className="field">
          <label>Login date</label>
          <input type="date" value={site.loginDate ?? ''} onChange={(e) => setSite({ loginDate: e.target.value || null })} />
        </div>
        {field('Total floors', 'floors', '1 Floor', 160)}
        <div className="field">
          <label>Total carpet area (sft)</label>
          <input
            type="number"
            value={site.carpetAreaSft ?? ''}
            placeholder={boqArea ? String(boqArea) : '32000'}
            onChange={(e) => setSite({ carpetAreaSft: e.target.value ? Number(e.target.value) : null })}
          />
        </div>
      </div>

      {differs && (
        <div className="banner" style={{ marginTop: 12, maxWidth: 900 }}>
          Carpet area here ({site.carpetAreaSft!.toLocaleString('en-IN')} sft) differs from the BOQ
          ({boqArea!.toLocaleString('en-IN')} sft). The plan uses this one and records it as an input from project
          settings, so the difference stays traceable rather than silently overwriting the document.
        </div>
      )}

      <h3 style={{ marginTop: 22 }}>Site address</h3>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="field" style={{ minWidth: 460 }}>
          <label>Address</label>
          <textarea
            rows={3}
            style={{ width: '100%' }}
            value={site.address}
            placeholder="32nd Floor, Commerz III, Oberoi Garden City, International Business Park…"
            onChange={(e) => setSite({ address: e.target.value })}
          />
        </div>
        <div>
          <div className="row">
            {field('Pin code', 'pinCode', '400063', 140)}
            {field('City', 'city', 'Mumbai', 180)}
          </div>
          <div className="row">
            {field('State', 'state', 'Maharashtra', 180)}
            {field('Country', 'country', 'IN', 120)}
          </div>
        </div>
      </div>
    </>
  );
}

// ------------------------------------------------------------------ team

function ProjectTeam({ org, setOrg, projectId }: { org: OrgState; setOrg: (o: OrgState) => void; projectId: string }) {
  const groups = groupedTeam(org, projectId);
  const assignable = org.employees.filter(isAssignable);

  const update = (role: string, index: number, code: string | null) => {
    const team = [...teamFor(org, projectId)];
    const positions = team.map((m, i) => (m.role === role ? i : -1)).filter((i) => i >= 0);
    const at = positions[index];
    if (at === undefined) team.push({ role, employeeCode: code });
    else if (code === null && positions.length > 1) team.splice(at, 1);
    else team[at] = { role, employeeCode: code };
    setOrg({ ...org, teams: { ...org.teams, [projectId]: team } });
  };

  const addSlot = (role: string) => {
    const team = [...teamFor(org, projectId), { role, employeeCode: null }];
    setOrg({ ...org, teams: { ...org.teams, [projectId]: team } });
  };

  if (!org.employees.length)
    return (
      <div className="banner info">
        No employee directory imported yet. Go to <strong>Admin</strong> and import the employee master
        (.xlsx, .xls or .csv), then staff the project here.
      </div>
    );

  return (
    <>
      <h2>Project team</h2>
      <p className="muted" style={{ marginTop: -6, maxWidth: 860 }}>
        Grouped the way the business is organised. Roles marked with <strong>+ add</strong> take several people — five
        procurement executives on one project is normal. Names come from the Admin directory; only current employees
        are assignable, and the badge is derived from designation.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 14 }}>
        {groups.map((g) => (
          <div key={g.group} className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--line)', background: 'var(--panel2)' }}>
              <strong style={{ fontSize: 12.5, letterSpacing: '.4px', textTransform: 'uppercase' }}>{g.group}</strong>
            </div>
            <div style={{ padding: '8px 14px 12px' }}>
              {g.rows.map((r) => (
                <div key={r.role} style={{ marginBottom: 10 }}>
                  <div className="k" style={{ marginBottom: 3 }}>{r.role}</div>
                  {(r.members.length ? r.members : [{ role: r.role, employeeCode: null }]).map((m, i) => {
                    const emp = employeeByCode(org, m.employeeCode);
                    return (
                      <div key={`${r.role}-${i}`} className="row" style={{ gap: 6, marginBottom: 4, flexWrap: 'nowrap' }}>
                        <select
                          value={m.employeeCode ?? ''}
                          onChange={(e) => update(r.role, i, e.target.value || null)}
                          style={{ flex: 1, minWidth: 0 }}
                        >
                          <option value="">N/A</option>
                          {assignable.map((e) => (
                            <option key={e.code} value={e.code}>{e.name} · {e.designation}</option>
                          ))}
                        </select>
                        {emp && (
                          <span className="tag" style={{ whiteSpace: 'nowrap' }}>
                            {departmentLabel(emp.department)} · {levelFor(emp.designation)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  {r.multi && (
                    <button style={{ padding: '2px 8px', fontSize: 11, boxShadow: 'none' }} onClick={() => addSlot(r.role)}>+ add</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ------------------------------------------------------------------ dates

const FIELDS: { key: keyof ScheduleDatesLike; label: string }[] = [
  { key: 'internalStart', label: 'Internal start (actual)' },
  { key: 'internalEnd', label: 'Internal target finish' },
  { key: 'clientStart', label: 'Client start' },
  { key: 'clientEnd', label: 'Client committed finish' },
];

/**
 * Revising a baseline is not a settings tweak — it moves every computed date, every order-by
 * and every billing milestone. So a change is PROPOSED here and the plan keeps running on the
 * approved dates until the BU Head signs it off.
 */
function ScheduleDates({ org, setOrg, projectId }: { org: OrgState; setOrg: (o: OrgState) => void; projectId: string }) {
  const approved: ScheduleDatesLike = org.dates?.[projectId] ?? {};
  const pending = org.pendingDates?.[projectId];
  const approver = approverFor(org, projectId);
  const [draft, setDraft] = useState<ScheduleDatesLike>(pending?.proposed ?? approved);
  const [reason, setReason] = useState(pending?.reason ?? '');

  const changed = FIELDS.some((f) => (draft[f.key] ?? '') !== (approved[f.key] ?? ''));

  const propose = () =>
    setOrg({
      ...org,
      pendingDates: { ...(org.pendingDates ?? {}), [projectId]: { proposed: draft, requestedAt: new Date().toISOString(), reason } },
    });

  const decide = (decision: 'approved' | 'rejected') => {
    const next = { ...(org.pendingDates ?? {}) };
    delete next[projectId];
    setOrg({
      ...org,
      dates: decision === 'approved' ? { ...(org.dates ?? {}), [projectId]: pending!.proposed } : org.dates,
      pendingDates: next,
    });
    if (decision === 'rejected') setDraft(approved);
  };

  return (
    <>
      <h2>Schedule dates</h2>
      <p className="muted" style={{ marginTop: -6, maxWidth: 880 }}>
        The contract states a commencement date and a duration; site reality often differs. Changing a date here
        recomputes the whole plan — every activity, order-by date and billing milestone moves with it — so a change is
        proposed and applied only once the <strong>BU Head</strong> has approved it. Leave a field blank to use the
        contract.
      </p>

      <div className="row">
        {FIELDS.map((f) => (
          <div className="field" key={f.key}>
            <label>{f.label}</label>
            <input
              type="date"
              value={draft[f.key] ?? ''}
              onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value || null })}
              disabled={!!pending}
            />
          </div>
        ))}
      </div>

      {pending ? (
        <div className="banner" style={{ marginTop: 14, maxWidth: 940 }}>
          <strong>Awaiting approval from the BU Head.</strong>{' '}
          {approver ? `${approver.name} (${approver.designation}) must sign this off.` : 'No BU Head is assigned to this project — assign one on the Project team pane, or the change cannot be approved.'}
          <ul style={{ margin: '8px 0 8px 18px', padding: 0 }}>
            {FIELDS.filter((f) => (pending.proposed[f.key] ?? '') !== (approved[f.key] ?? '')).map((f) => (
              <li key={f.key}>
                {f.label}: <s>{approved[f.key] || 'contract'}</s> → <strong>{pending.proposed[f.key] || 'contract'}</strong>
              </li>
            ))}
          </ul>
          {pending.reason && <div className="muted" style={{ fontSize: 12 }}>Reason: {pending.reason}</div>}
          <div className="row" style={{ marginTop: 10 }}>
            <button className="primary" disabled={!approver} onClick={() => decide('approved')}>
              Approve as {approver ? approver.name : 'BU Head'}
            </button>
            <button onClick={() => decide('rejected')}>Reject</button>
          </div>
        </div>
      ) : (
        <>
          <div className="row" style={{ marginTop: 10 }}>
            <div className="field" style={{ minWidth: 420 }}>
              <label>Reason for the revision</label>
              <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. site handover delayed by the builder" />
            </div>
            <button className="primary" disabled={!changed} onClick={propose}>Propose change</button>
            {changed && <button onClick={() => setDraft(approved)}>Discard</button>}
          </div>
          <div className="muted" style={{ fontSize: 12, marginTop: 6 }}>
            {changed
              ? 'The plan is still running on the approved dates. It will move when the BU Head approves.'
              : 'The plan is running on these dates.'}
          </div>
        </>
      )}
    </>
  );
}
