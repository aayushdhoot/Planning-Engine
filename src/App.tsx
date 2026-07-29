import { Fragment, useMemo, useState } from 'react';
import type { CalendarConfig, EngineConfig, ProjectInputs, ScheduleDates, Traced } from './domain/types';
import type { DesignRow, TodoRow, TrackStatus } from './domain/trackers';
import { TRACK_STATUSES, delayDays } from './domain/trackers';
import { buildPlan, clientView, type Plan } from './engine/planner';
import { auditTrace, canonicalJson, validatePlan } from './engine/schema';
import { buildPertFromPlan } from './engine/pert-build';
import { skf } from './data/skf';
import { emirates } from './data/emirates';
import { pendingKohler } from './data/others';
import { kohler } from './data/kohler';
import { buildEmiratesPert } from './data/emirates-pert';
import normsData from './norms/norms-v1.json';
import { Gantt } from './ui/Gantt';
import { Pert } from './ui/Pert';
import type { PertTree } from './domain/pert';
import { Intake } from './ui/Intake';
import { BoqIngestionService, type IngestedBoq } from './services/ingestion';
import { FilePersistence } from './services/persistence';
import { readDriveClientId, writeDriveClientId } from './services/settings-store';
import { renderReport } from './reports/render';
import { buildDeck } from './reports/deck';

const BASE_PROJECTS: ProjectInputs[] = [skf, emirates, kohler, pendingKohler];
const ingestion = new BoqIngestionService();
const persistence = new FilePersistence();
const TABS = ['Overview', 'PERT', 'Manpower', 'Design', 'Procurement', 'To-do', 'Dependencies', 'RA Milestones', 'New project', 'Settings'] as const;
type Tab = (typeof TABS)[number];

const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });
const P = ({ t }: { t: Traced<number> | null }) =>
  t ? <span className="prov" title={t.source}>{t.provenance} · {t.source.slice(0, 44)}{t.source.length > 44 ? '…' : ''}</span> : null;

const statusClass = (s: TrackStatus): string =>
  s === 'Completed' ? 'ok' : s === 'Delayed' ? 'crit' : s === 'WIP' ? 'info' : s === 'Hold' ? 'warn' : '';

export default function App() {
  const [extraProjects, setExtraProjects] = useState<ProjectInputs[]>([]);
  const [overrides, setOverrides] = useState<Record<string, ProjectInputs>>({});
  const [ingestResult, setIngestResult] = useState<{ boq: IngestedBoq; file: string } | null>(null);
  const [projectId, setProjectId] = useState(BASE_PROJECTS[0].id);
  const [view, setView] = useState<'internal' | 'external'>('internal');
  const [tab, setTab] = useState<Tab>('Overview');
  const [sundaysOff, setSundaysOff] = useState(false);
  const [holidays, setHolidays] = useState('');
  const [workMode, setWorkMode] = useState(1);
  const [buffer, setBuffer] = useState(normsData.bufferPolicy.defaultInternalBufferDays);
  const [leadOverrides, setLeadOverrides] = useState<Record<string, number>>({});
  // actual dates, when they differ from the contract's
  const [dates, setDates] = useState<ScheduleDates>({});
  // Persisted, or it would be lost on every reload — see services/settings-store.ts.
  const [clientId, setClientIdState] = useState(readDriveClientId);
  const setClientId = (v: string) => {
    setClientIdState(v);
    writeDriveClientId(v);
  };
  // live tracker edits, keyed by project then row id
  const [edits, setEdits] = useState<Record<string, Record<string, Record<string, string>>>>({});

  const today = new Date().toISOString().slice(0, 10);
  const PROJECTS = [...BASE_PROJECTS.map((p) => overrides[p.id] ?? p), ...extraProjects];
  const project = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0];

  const cfg: EngineConfig = useMemo(() => {
    const calendar: CalendarConfig = {
      weeklyOffDays: sundaysOff ? [0] : [],
      holidays: holidays.split(',').map((s) => s.trim()).filter(Boolean),
      workModeFactor: workMode,
    };
    return {
      calendar,
      buffer: { internalBufferDays: buffer, min: normsData.bufferPolicy.min, max: normsData.bufferPolicy.max },
      normsVersion: normsData.version,
      normsOverrides: { packageLeadTimeDays: leadOverrides },
      dates,
    };
  }, [sundaysOff, holidays, workMode, buffer, leadOverrides, dates]);

  const full = useMemo(() => buildPlan(project, cfg, today), [project, cfg, today]);
  const plan: Plan = view === 'external' ? clientView(full) : full;
  const validation = validatePlan(plan);
  const trace = auditTrace(plan);
  const pending = plan.project.status === 'pending_inputs';

  // Emirates ships with an issued MS-Project programme; everything else derives one.
  const pert = useMemo(
    () => (project.id === 'emirates' ? buildEmiratesPert(today) : buildPertFromPlan(plan, today)),
    [project.id, plan, today],
  );

  const edit = (rowId: string, field: string, value: string) =>
    setEdits((prev) => ({
      ...prev,
      [project.id]: { ...(prev[project.id] ?? {}), [rowId]: { ...(prev[project.id]?.[rowId] ?? {}), [field]: value } },
    }));
  const val = <T,>(rowId: string, field: string, fallback: T): T | string =>
    edits[project.id]?.[rowId]?.[field] ?? fallback;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">DnB Planning Engine<small>v{plan.engine.version} · {plan.engine.normsVersion}</small></div>
        <select value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          {PROJECTS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="seg">
          <button className={view === 'internal' ? 'on' : ''} onClick={() => setView('internal')}>Internal</button>
          <button className={view === 'external' ? 'on' : ''} onClick={() => setView('external')}>Client</button>
        </div>
        <div className="spacer" />
        <span className={'tag ' + (validation.ok ? 'ok' : 'crit')}>{validation.ok ? 'schema valid' : `${validation.errors.length} schema errors`}</span>
        <span className={'tag ' + (trace.ok ? 'ok' : 'crit')}>{trace.tracedCount} traced</span>
        <button onClick={() => download(`${plan.project.id}-${view}.json`, canonicalJson(plan))}>JSON</button>
        <button onClick={() => openReport(renderReport(plan, view === 'external' ? 'client' : 'internal'))}>PDF report</button>
        <button className="primary" onClick={() => void buildDeck(plan, view === 'external' ? 'client' : 'internal').writeFile({ fileName: `${plan.project.id}-${view}-deck.pptx` })}>Deck</button>
      </header>

      <nav className="tabs">
        {TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </nav>

      <main>
        {pending && tab !== 'New project' && (
          <div className="banner">
            <strong>{plan.project.name} — pending inputs.</strong> No plan generated; the engine does not fabricate numbers.
            Missing: {plan.missingInputs.join(', ')}. Use the <strong>New project</strong> tab to link a Drive folder and answer the intake questions.
          </div>
        )}
        {view === 'external' && !pending && (
          <div className="banner info">Client view — anchored to contract dates. Buffer, cost, margin, float and manpower are withheld.</div>
        )}

        {tab === 'Overview' && <Overview plan={plan} view={view} />}
        {tab === 'PERT' && <PertSection tree={pert} today={today} plan={plan} view={view} />}
        {tab === 'Manpower' && <Manpower plan={plan} />}
        {tab === 'Design' && <Design plan={plan} edit={edit} val={val} />}
        {tab === 'Procurement' && <Procurement plan={plan} view={view} edit={edit} val={val} />}
        {tab === 'To-do' && <Todos plan={plan} edit={edit} val={val} />}
        {tab === 'Dependencies' && <Dependencies plan={plan} today={today} edit={edit} val={val} />}
        {tab === 'RA Milestones' && <RaMilestones plan={plan} view={view} today={today} edit={edit} val={val} />}
        {tab === 'New project' && (
          <Intake
            clientId={clientId}
            existingIds={PROJECTS.map((p) => p.id)}
            onCreate={(p) => {
              setExtraProjects((prev) => [...prev, p]);
              setProjectId(p.id);
              setTab('Overview');
            }}
          />
        )}
        {tab === 'Settings' && (
          <Settings
            sundaysOff={sundaysOff} setSundaysOff={setSundaysOff}
            holidays={holidays} setHolidays={setHolidays}
            workMode={workMode} setWorkMode={setWorkMode}
            buffer={buffer} setBuffer={setBuffer}
            leadOverrides={leadOverrides} setLeadOverrides={setLeadOverrides}
            clientId={clientId} setClientId={setClientId}
            dates={dates} setDates={setDates}
            project={project}
            ingestResult={ingestResult}
            onParsed={(boq, file) => {
              setIngestResult({ boq, file });
              setOverrides({ ...overrides, [project.id]: ingestion.applyToProject(project, boq, file) });
            }}
            onSaveWorkspace={() => persistence.save({ savedAt: new Date().toISOString(), normsVersion: normsData.version, projects: PROJECTS, config: cfg })}
            plan={plan}
          />
        )}
      </main>
    </div>
  );
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function openReport(html: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}

type EditFn = (rowId: string, field: string, value: string) => void;
type ValFn = <T>(rowId: string, field: string, fallback: T) => T | string;

function StatusCell({ id, field, current, edit, val }: { id: string; field: string; current: TrackStatus; edit: EditFn; val: ValFn }) {
  const v = val(id, field, current) as TrackStatus;
  return (
    <td className="edit">
      <select value={v} onChange={(e) => edit(id, field, e.target.value)} className={`tag ${statusClass(v)}`}>
        {TRACK_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
    </td>
  );
}

function TextCell({ id, field, current, edit, val, placeholder }: { id: string; field: string; current: string; edit: EditFn; val: ValFn; placeholder?: string }) {
  return (
    <td className="edit">
      <input value={val(id, field, current) as string} placeholder={placeholder ?? '—'} onChange={(e) => edit(id, field, e.target.value)} />
    </td>
  );
}

function DateCell({ id, field, current, edit, val }: { id: string; field: string; current: string | null; edit: EditFn; val: ValFn }) {
  return (
    <td className="edit">
      <input type="date" value={(val(id, field, current ?? '') as string) || ''} onChange={(e) => edit(id, field, e.target.value)} />
    </td>
  );
}

function Overview({ plan, view }: { plan: Plan; view: string }) {
  const m = plan.modules;
  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Client</div><div className="v" style={{ fontSize: 15 }}>{plan.project.client}</div><div className="s">{plan.project.location}</div></div>
        <div className="card"><div className="k">Area</div><div className="v">{plan.project.areaSft ? plan.project.areaSft.value.toLocaleString('en-IN') + ' sft' : '—'}</div><P t={plan.project.areaSft} /></div>
        <div className="card"><div className="k">Contract value</div><div className="v">{plan.project.contractValue ? inr(plan.project.contractValue.value) : '—'}</div><P t={plan.project.contractValue} /></div>
        <div className="card"><div className="k">{view === 'external' ? 'Contract finish' : 'Internal finish'}</div><div className="v">{view === 'external' ? plan.external?.end ?? '—' : plan.internal?.end ?? '—'}</div><div className="s">{view === 'external' ? 'contract baseline' : `${plan.internal?.durationWorkingDays ?? 0} working days (CPM)`}</div></div>
        {view === 'internal' && <div className="card"><div className="k">Buffer</div><div className="v">{plan.ieInvariant.bufferCalendarDays ?? '—'} d</div><div className="s">{plan.ieInvariant.holds ? 'invariant holds' : 'BREACH'}</div></div>}
        <div className="card"><div className="k">Critical activities</div><div className="v">{m.timeline.criticalPath.length} / {m.timeline.activities.length}</div><div className="s">zero total float</div></div>
        {view === 'internal' && <div className="card"><div className="k">Peak manpower</div><div className="v">{m.manpower.peak}</div><div className="s">avg {m.manpower.averageDaily} · smoothness {m.manpower.smoothness}</div></div>}
        <div className="card"><div className="k">Design approved</div><div className="v">{m.design.summary.percentComplete}%</div><div className="s">{m.design.summary.approved} of {m.design.summary.drawings} drawings</div></div>
        <div className="card"><div className="k">Confidence</div><div className="v">{Math.round(plan.confidence.score * 100)}%</div><div className="s">{plan.confidence.basis}</div></div>
      </div>

      {plan.external && (
        <>
          <h2>Contract milestones</h2>
          <div className="tblwrap">
            <table>
              <thead><tr><th>Code</th><th>Date</th><th>%</th><th>Scope</th></tr></thead>
              <tbody>{plan.external.milestones.map((x) => (
                <tr key={x.code}><td><span className="tag ext">{x.code}</span></td><td className="mono">{x.date}</td><td className="mono">{x.percent}%</td><td className="muted">{x.description}</td></tr>
              ))}</tbody>
            </table>
          </div>
        </>
      )}

      <h2>Phases</h2>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Phase</th><th>Start</th><th>End</th><th>Critical path</th></tr></thead>
          <tbody>{plan.modules.timeline.phases.map((p) => (
            <tr key={p.name}><td>{p.name}</td><td className="mono">{p.start}</td><td className="mono">{p.end}</td><td>{p.critical ? <span className="tag crit">yes</span> : <span className="faint">no</span>}</td></tr>
          ))}</tbody>
        </table>
      </div>

      <h2>Assumptions & gaps</h2>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Area</th><th>Assumption</th><th>Visibility</th></tr></thead>
          <tbody>
            {plan.assumptions.length === 0 && <tr><td colSpan={3} className="faint">None recorded.</td></tr>}
            {plan.assumptions.map((a, i) => (
              <tr key={i}><td><span className="tag">{a.area}</span></td><td>{a.text}</td><td>{a.internalOnly ? <span className="tag warn">internal only</span> : <span className="tag">shared</span>}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/**
 * PERT is the schedule section; the Gantt is a way of looking at the same programme rather than
 * a separate module, so it lives here behind a toggle instead of on its own tab.
 */
function PertSection({ tree, today, plan, view }: { tree: PertTree; today: string; plan: Plan; view: string }) {
  const [showGantt, setShowGantt] = useState(false);
  const acts = plan.modules.timeline.activities;
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={!showGantt ? 'on' : ''} onClick={() => setShowGantt(false)}>PERT network</button>
          <button className={showGantt ? 'on' : ''} onClick={() => setShowGantt(true)} disabled={!acts.length}>Gantt chart</button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          {showGantt ? 'Same programme, drawn against the calendar.' : 'MS-Project columns, collapsible by section.'}
        </span>
      </div>
      <ScheduleSummary plan={plan} view={view} today={today} />
      {!showGantt ? <Pert tree={tree} today={today} /> : <GanttView plan={plan} view={view} today={today} />}
    </>
  );
}

/**
 * Management-level read of the schedule, above the detail. The client view is a real document
 * here rather than a stripped internal one: it is anchored to the committed client dates, and
 * says what is due next and what is outstanding, without float, buffer or critical path.
 */
function ScheduleSummary({ plan, view, today }: { plan: Plan; view: string; today: string }) {
  const acts = plan.modules.timeline.activities;
  if (!acts.length) return null;
  const client = view === 'external';
  const baseStart = client ? plan.external?.start : plan.internal?.start;
  const baseEnd = client ? plan.external?.end : plan.internal?.end;
  const done = acts.filter((a) => (a.percentComplete?.value ?? 0) >= 100).length;
  const behind = acts.filter((a) => a.endDate < today && (a.percentComplete?.value ?? 0) < 100).length;
  const nextMilestone = plan.external?.milestones.find((m) => m.date >= today) ?? null;
  const daysLeft = baseEnd ? Math.round((Date.parse(baseEnd + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) : null;

  return (
    <div className="cards" style={{ marginBottom: 16 }}>
      <div className="card">
        <div className="k">{client ? 'Committed baseline' : 'Internal baseline'}</div>
        <div className="v" style={{ fontSize: 15 }}>{baseStart ?? '—'} → {baseEnd ?? '—'}</div>
        <div className="s">{client ? 'dates the client is held to' : `${plan.internal?.durationWorkingDays ?? 0} working days (CPM)`}</div>
      </div>
      <div className="card">
        <div className="k">Time remaining</div>
        <div className="v" style={{ color: daysLeft !== null && daysLeft < 0 ? 'var(--crit)' : undefined }}>
          {daysLeft === null ? '—' : `${daysLeft} d`}
        </div>
        <div className="s">{daysLeft !== null && daysLeft < 0 ? 'past the baseline finish' : `to ${baseEnd}`}</div>
      </div>
      <div className="card">
        <div className="k">Activities complete</div>
        <div className="v">{done} / {acts.length}</div>
        <div className="s">as recorded by the team</div>
      </div>
      <div className="card" style={behind ? { borderColor: 'var(--crit)', background: 'var(--crit-soft)' } : undefined}>
        <div className="k">Behind plan</div>
        <div className="v" style={{ color: behind ? 'var(--crit)' : undefined }}>{behind}</div>
        <div className="s">past planned finish, not signed off</div>
      </div>
      {nextMilestone && (
        <div className="card">
          <div className="k">Next milestone</div>
          <div className="v" style={{ fontSize: 15 }}>{nextMilestone.code} · {nextMilestone.date}</div>
          <div className="s">{nextMilestone.percent}% of contract value</div>
        </div>
      )}
      {!client && (
        <div className="card">
          <div className="k">Buffer to client date</div>
          <div className="v">{plan.ieInvariant.bufferCalendarDays ?? '—'} d</div>
          <div className="s">{plan.ieInvariant.holds ? 'invariant holds' : 'BREACH — internal finish is past the client date'}</div>
        </div>
      )}
      {!client && plan.internal?.target && (
        <div className="card" style={(plan.internal.varianceDays ?? 0) > 0 ? { borderColor: 'var(--warn)', background: 'var(--warn-soft)' } : undefined}>
          <div className="k">Vs internal target</div>
          <div className="v" style={{ color: (plan.internal.varianceDays ?? 0) > 0 ? 'var(--warn)' : 'var(--ok)' }}>
            {(plan.internal.varianceDays ?? 0) > 0 ? `+${plan.internal.varianceDays}` : plan.internal.varianceDays} d
          </div>
          <div className="s">target {plan.internal.target}</div>
        </div>
      )}
    </div>
  );
}

function GanttView({ plan, view, today }: { plan: Plan; view: string; today: string }) {
  const acts = plan.modules.timeline.activities;
  if (!acts.length) return <p className="muted">No schedule — inputs pending.</p>;
  // progress is whatever has actually been recorded against an activity, never inferred
  const progress = Object.fromEntries(
    acts.filter((a) => a.percentComplete).map((a) => [a.id, { percent: a.percentComplete!.value }]),
  );
  const behind = acts.filter((a) => a.endDate < today && (a.percentComplete?.value ?? 0) < 100).length;
  return (
    <>
      {behind > 0 && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <strong>{behind} activit{behind === 1 ? 'y is' : 'ies are'} past their planned finish</strong> without being recorded complete.
          Red bars and labels mark them; the engine will not treat a passed date as work done.
        </div>
      )}
      <Gantt plan={plan} today={today} progress={progress} />
      <h2>Activities {view === 'external' ? '(client view — float withheld)' : '(internal — full CPM)'}</h2>
      <div className="tblwrap">
        <table>
          <thead><tr><th>#</th><th>Activity</th><th>Phase</th><th>Trade</th><th>Dur</th><th>Start</th><th>Finish</th>{view === 'internal' && <><th>Float</th><th>Crit</th></>}<th>Duration source</th></tr></thead>
          <tbody>{acts.map((a) => (
            <tr key={a.id}>
              <td className="faint mono">{a.id}</td>
              <td>{a.name}</td>
              <td className="muted">{a.phase}</td>
              <td className="muted">{a.trade}</td>
              <td className="mono">{a.duration.value}d</td>
              <td className="mono">{a.startDate}</td>
              <td className="mono">{a.endDate}</td>
              {view === 'internal' && <><td className="mono">{a.totalFloat}d</td><td>{a.critical ? <span className="tag crit">CP</span> : ''}</td></>}
              <td><P t={a.duration} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function Manpower({ plan }: { plan: Plan }) {
  const mp = plan.modules.manpower;
  if (!mp.days.length) return <p className="muted">Manpower loading is internal — switch to the Internal view, or inputs are pending.</p>;
  const trades = mp.trades.map((t) => t.trade);
  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Peak headcount</div><div className="v">{mp.peak}</div><div className="s">{mp.peakDate}</div></div>
        <div className="card"><div className="k">Average daily</div><div className="v">{mp.averageDaily}</div><div className="s">over {mp.days.length} working days</div></div>
        <div className="card"><div className="k">Total man-days</div><div className="v">{mp.totalManDays.toLocaleString('en-IN')}</div></div>
        <div className="card"><div className="k">Smoothness</div><div className="v">{mp.smoothness}</div><div className="s">1.0 = perfectly level</div></div>
      </div>

      {mp.warnings.length > 0 && (
        <div className="banner">
          <strong>Levelling warnings</strong>
          <ul>{mp.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
        </div>
      )}

      <h2>Contractor gangs — core team held across the engagement</h2>
      <p className="muted" style={{ marginTop: -4, fontSize: 12.5 }}>
        Work content is levelled across each trade&apos;s window against a realistic gang cap, rather than
        summing nominal crews per active activity. That is what produced implausible spikes before.
      </p>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Trade</th><th>On site from</th><th>To</th><th>Days</th><th>Man-days</th><th>Core gang</th><th>Peak</th><th>Basis</th></tr></thead>
          <tbody>{mp.trades.map((t) => (
            <tr key={t.trade}>
              <td>{t.trade}</td>
              <td className="mono">{t.start}</td>
              <td className="mono">{t.end}</td>
              <td className="mono">{t.activeDays}</td>
              <td className="mono">{t.manDays}</td>
              <td className="mono"><strong>{t.coreCrew.value}</strong></td>
              <td className="mono">{t.peakCrew}{t.overloaded && <span className="tag crit" style={{ marginLeft: 6 }}>over cap</span>}</td>
              <td><P t={t.coreCrew} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <h2>Daily histogram</h2>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Date</th>{trades.map((t) => <th key={t}>{t}</th>)}<th>Total</th><th>Load</th></tr></thead>
          <tbody>{mp.days.map((d) => (
            <tr key={d.date}>
              <td className="mono">{d.date}</td>
              {trades.map((t) => <td key={t} className={d.byTrade[t] ? 'mono' : 'faint'}>{d.byTrade[t] ?? '·'}</td>)}
              <td className="mono"><strong>{d.total}</strong></td>
              <td style={{ width: 130 }}><div className="bar"><div style={{ width: `${(d.total / mp.peak) * 100}%` }} /></div></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function Resources({ plan }: { plan: Plan }) {
  if (!plan.modules.resources.length) return <p className="muted">Resource plan is internal, or inputs are pending.</p>;
  return (
    <>
      <h2>Project resource plan (role slots)</h2>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Role</th><th>Count</th><th>Basis</th></tr></thead>
          <tbody>{plan.modules.resources.map((r) => (
            <tr key={r.role}><td>{r.role}</td><td className="mono"><strong>{r.count.value}</strong></td><td><P t={r.count} /></td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function Design({ plan, edit, val }: { plan: Plan; edit: EditFn; val: ValFn }) {
  const { rows, summary } = plan.modules.design;
  const [cat, setCat] = useState<'all' | DesignRow['category']>('all');
  if (!rows.length) return <p className="muted">No design tracker — inputs pending.</p>;
  const shown = cat === 'all' ? rows : rows.filter((r) => r.category === cat);
  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Drawings</div><div className="v">{summary.drawings}</div></div>
        <div className="card"><div className="k">Approved</div><div className="v" style={{ color: 'var(--ok)' }}>{summary.approved}</div></div>
        <div className="card"><div className="k">Pending</div><div className="v" style={{ color: 'var(--warn)' }}>{summary.pending}</div></div>
        <div className="card"><div className="k">% completion</div><div className="v">{summary.percentComplete}%</div><div className="bar" style={{ marginTop: 6 }}><div style={{ width: `${summary.percentComplete}%`, background: 'var(--ok)' }} /></div></div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          {(['all', 'GFC', 'MEP', 'SAMPLING'] as const).map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c === 'all' ? 'All' : c}</button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>
          Two targets only: when the drawing is ready to issue, and when the client must have approved it. Both are
          back-scheduled from the site activity the drawing releases.
        </span>
      </div>

      {(() => {
        const flagged = shown.filter((r) => r.issues.length);
        return flagged.length ? (
          <div className="banner" style={{ marginBottom: 12 }}>
            <strong>{flagged.length} drawing deadline{flagged.length === 1 ? '' : 's'} will not work as scheduled.</strong>
            <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
              {flagged.slice(0, 5).map((r) => <li key={r.id}><strong>{r.drawingName}</strong> — {r.issues[0]}</li>)}
            </ul>
            {flagged.length > 5 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>+{flagged.length - 5} more, marked in the table.</div>}
          </div>
        ) : null;
      })()}

      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th>Category</th><th>Sub Category</th><th>Zone</th><th>Drawing name</th><th>Criticality</th><th>Rev</th>
              <th>Ready by</th><th>Status (INT)</th>
              <th>Client approval by</th><th>Status (Client)</th><th>Releases</th>
            </tr>
          </thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id}>
              <td><span className={`tag ${r.category === 'MEP' ? 'ext' : r.category === 'SAMPLING' ? 'warn' : 'info'}`}>{r.category}</span></td>
              <td className="muted">{r.subCategory}</td>
              <td className="muted">{r.zone ?? '—'}</td>
              <td>
                {r.drawingName}
                {r.issues.length > 0 && (
                  <div className="tag crit" style={{ marginTop: 3, whiteSpace: 'normal', display: 'inline-block' }} title={r.issues.join(' ')}>
                    {r.issues[0]}
                  </div>
                )}
              </td>
              <td><span className={`tag ${r.criticality === 'Very Critical' ? 'crit' : r.criticality === 'High' ? 'warn' : ''}`}>{r.criticality}</span></td>
              <TextCell id={r.id} field="revision" current={r.revision} edit={edit} val={val} />
              <td className="mono" title={r.basis}>{r.readyBy ?? '—'}</td>
              <StatusCell id={r.id} field="statusInt" current={r.statusInt} edit={edit} val={val} />
              <td className="mono" title={r.basis}>{r.approvalBy ?? '—'}</td>
              <StatusCell id={r.id} field="statusClient" current={r.statusClient} edit={edit} val={val} />
              <td className="faint" style={{ maxWidth: 220 }}>{r.releases.slice(0, 2).join(', ') || '—'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function Procurement({ plan, view, edit, val }: { plan: Plan; view: string; edit: EditFn; val: ValFn }) {
  const items = plan.modules.procurement;
  if (!items.length) return <p className="muted">No procurement tracker — inputs pending.</p>;
  const overdue = items.filter((i) => i.orderBy && i.orderBy < new Date().toISOString().slice(0, 10)).length;
  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Packages</div><div className="v">{items.length}</div></div>
        <div className="card"><div className="k">Very critical</div><div className="v" style={{ color: 'var(--crit)' }}>{items.filter((i) => i.criticality === 'Very Critical').length}</div></div>
        <div className="card"><div className="k">Order-by passed</div><div className="v" style={{ color: 'var(--warn)' }}>{overdue}</div></div>
      </div>

      <h2>Package plan — order and delivery dates</h2>
      <p className="muted" style={{ marginTop: -4, fontSize: 12.5 }}>
        Commercial values are deliberately not shown here. Order-by is derived from the delivery date the
        programme needs, less the lead time; each package also shows the design approval that gates it.
      </p>
      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th>Category</th><th>Sub Category</th><th>Criticality</th><th>Order by</th><th>Delivery required</th>
              <th>Revised date</th>{view === 'internal' && <th>Vendor</th>}<th>Order status</th><th>Delivery status</th>
              <th>Responsibility</th><th>Gated by (design)</th><th>Feeds (site)</th>{view === 'internal' && <th>Remarks</th>}
            </tr>
          </thead>
          <tbody>{items.map((i) => (
            <tr key={i.id}>
              <td>{i.category}</td>
              <td className="muted">{i.subCategory}</td>
              <td><span className={`tag ${i.criticality === 'Very Critical' ? 'crit' : i.criticality === 'High' ? 'warn' : ''}`}>{i.criticality}</span></td>
              <td className="mono">{i.orderBy ?? '—'}</td>
              <td className="mono">{i.deliveryRequired ?? '—'}</td>
              <DateCell id={i.id} field="revised" current={i.revisedDate} edit={edit} val={val} />
              {view === 'internal' && <TextCell id={i.id} field="vendor" current={i.vendor} edit={edit} val={val} placeholder="vendor" />}
              <td className="edit">
                <select value={val(i.id, 'orderStatus', i.orderStatus) as string} onChange={(e) => edit(i.id, 'orderStatus', e.target.value)}>
                  {['Open', 'Closed', 'Hold', 'Partially Ordered'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td className="edit">
                <select value={val(i.id, 'deliveryStatus', i.deliveryStatus) as string} onChange={(e) => edit(i.id, 'deliveryStatus', e.target.value)}>
                  {['Not Started', 'In Transit', 'Partially Delivered', 'Delivered'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
              <TextCell id={i.id} field="responsibility" current={i.responsibility} edit={edit} val={val} />
              <td className="faint" style={{ maxWidth: 200 }}>{i.gatedBy ?? '—'}</td>
              <td className="faint" style={{ maxWidth: 200 }}>{i.feeds ?? '—'}</td>
              {view === 'internal' && <TextCell id={i.id} field="remarks" current={i.remarks} edit={edit} val={val} />}
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function Todos({ plan, edit, val }: { plan: Plan; edit: EditFn; val: ValFn }) {
  const rows = plan.modules.todos;
  const [cat, setCat] = useState<'all' | TodoRow['category']>('all');
  if (!rows.length) return <p className="muted">Nothing due in the next 21 days.</p>;
  const shown = cat === 'all' ? rows : rows.filter((r) => r.category === cat);
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          {(['all', 'site', 'procurement', 'design', 'commercial'] as const).map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)}>{c === 'all' ? 'All' : c}</button>
          ))}
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{shown.length} open items · next 21 days</span>
      </div>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Description</th><th>Responsibility</th><th>Priority</th><th>Status</th><th>Start date</th><th>End date</th><th>Revised date</th><th>Notes</th></tr></thead>
          <tbody>{shown.map((r) => (
            <tr key={r.id}>
              <td>{r.description}</td>
              <TextCell id={r.id} field="responsibility" current={r.responsibility} edit={edit} val={val} />
              <td className="edit">
                <select value={val(r.id, 'priority', r.priority) as string} onChange={(e) => edit(r.id, 'priority', e.target.value)}
                  className={`tag ${r.priority === 'HIGH' ? 'crit' : ''}`}>
                  {['HIGH', 'MEDIUM', 'LOW'].map((s) => <option key={s}>{s}</option>)}
                </select>
              </td>
              <StatusCell id={r.id} field="status" current={r.status} edit={edit} val={val} />
              <td className="mono">{r.startDate ?? '—'}</td>
              <td className="mono">{r.endDate ?? '—'}</td>
              <DateCell id={r.id} field="revised" current={r.revisedDate} edit={edit} val={val} />
              <TextCell id={r.id} field="notes" current={r.notes} edit={edit} val={val} />
            </tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}

function Dependencies({ plan, today, edit, val }: { plan: Plan; today: string; edit: EditFn; val: ValFn }) {
  const rows = plan.modules.dependencies;
  if (!rows.length) return <p className="muted">No dependency tracker — inputs pending.</p>;
  const open = rows.filter((r) => r.status !== 'Completed').length;
  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Open points</div><div className="v">{open}</div><div className="s">of {rows.length}</div></div>
        <div className="card"><div className="k">Overdue</div><div className="v" style={{ color: 'var(--crit)' }}>{rows.filter((r) => r.planDate && r.planDate < today && r.status !== 'Completed').length}</div></div>
      </div>
      <h2>Client / builder open points tracker</h2>
      <div className="tblwrap">
        <table>
          <thead><tr><th>Sr</th><th>Area</th><th>Description</th><th>Responsibility</th><th>Plan date</th><th>Actual date</th><th>Delay</th><th>Status</th><th>Remarks</th></tr></thead>
          <tbody>{rows.map((r) => {
            const actual = (val(r.id, 'actual', r.actualDate ?? '') as string) || null;
            const status = val(r.id, 'status', r.status) as TrackStatus;
            const d = status === 'Completed' ? delayDays(r.planDate, actual, today) : delayDays(r.planDate, null, today);
            return (
              <tr key={r.id}>
                <td className="faint mono">{r.sr}</td>
                <td><span className="tag">{r.area}</span></td>
                <td>{r.description}</td>
                <TextCell id={r.id} field="responsibility" current={r.responsibility} edit={edit} val={val} />
                <td className="mono">{r.planDate ?? '—'}</td>
                <DateCell id={r.id} field="actual" current={r.actualDate} edit={edit} val={val} />
                <td className="mono">{d === null ? '—' : d > 0 ? <span className="tag crit">{d}d</span> : <span className="tag ok">on time</span>}</td>
                <StatusCell id={r.id} field="status" current={r.status} edit={edit} val={val} />
                <TextCell id={r.id} field="remarks" current={r.remarks} edit={edit} val={val} />
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </>
  );
}

/**
 * RA billing milestones — replaces the cashflow curve.
 *
 * The point is that a milestone is only billable when the physical work named in the contract
 * clause is actually done, so each clause is a row the project team ticks off. Readiness is
 * computed from those ticks, never from the date having arrived.
 */
function RaMilestones({
  plan, view, today, edit, val,
}: {
  plan: Plan; view: string; today: string;
  edit: (id: string, f: string, v: string) => void;
  val: <T,>(id: string, f: string, fallback: T) => T | string;
}) {
  const rows = plan.modules.raMilestones;
  const [open, setOpen] = useState<Set<string>>(new Set());
  if (!rows.length) return <p className="muted">No billing milestones — the contract payment terms have not been read yet.</p>;

  const statusOf = (r: (typeof rows)[number]) => String(val(r.id, 'status', r.status)) as TrackStatus;
  const cpStatusOf = (c: { id: string; status: TrackStatus }) => String(val(c.id, 'status', c.status)) as TrackStatus;
  const readinessOf = (r: (typeof rows)[number]) =>
    r.checkpoints.length
      ? Math.round((r.checkpoints.filter((c) => cpStatusOf(c) === 'Completed').length / r.checkpoints.length) * 100)
      : 0;

  const billed = rows.filter((r) => statusOf(r) === 'Completed');
  const billedPct = Math.round(billed.reduce((s, r) => s + r.percent, 0) * 10) / 10;
  const overdue = rows.filter((r) => statusOf(r) !== 'Completed' && String(val(r.id, 'revisedDate', r.revisedDate ?? r.dueDate)) < today);
  const next = rows.filter((r) => statusOf(r) !== 'Completed')[0];

  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Milestones</div><div className="v">{rows.length}</div><div className="s">from the contract payment terms</div></div>
        <div className="card"><div className="k">Billed</div><div className="v" style={{ color: 'var(--ok)' }}>{billedPct}%</div><div className="s">{billed.length} of {rows.length} raised</div></div>
        <div className="card" style={overdue.length ? { borderColor: 'var(--crit)', background: 'var(--crit-soft)' } : undefined}>
          <div className="k">Overdue</div>
          <div className="v" style={{ color: overdue.length ? 'var(--crit)' : undefined }}>{overdue.length}</div>
          <div className="s">past due and not billed</div>
        </div>
        <div className="card">
          <div className="k">Next due</div>
          <div className="v" style={{ fontSize: 16 }}>{next ? next.code : '—'}</div>
          <div className="s">{next ? `${next.dueDate} · ${readinessOf(next)}% ready` : 'all billed'}</div>
        </div>
      </div>

      <h2>RA milestone tracker</h2>
      <p className="muted" style={{ marginTop: -6, maxWidth: 820 }}>
        Each milestone expands into the clauses the contract requires before it can be billed. Tick a clause when
        site confirms it; readiness is the share of clauses complete, so a milestone never reads as ready just
        because its date arrived.
      </p>
      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }} /><th>RA</th><th>Due</th><th>Revised</th><th>%</th>
              {view === 'internal' && <th>Amount</th>}
              <th>Readiness</th><th>Status</th><th>Invoice no.</th><th>Invoice date</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open.has(r.id);
              const ready = readinessOf(r);
              return (
                <Fragment key={r.id}>
                  <tr>
                    <td>
                      <button
                        style={{ padding: '0 6px', boxShadow: 'none' }}
                        onClick={() => setOpen((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })}
                      >
                        {isOpen ? '▾' : '▸'}
                      </button>
                    </td>
                    <td><strong>{r.code}</strong><div className="faint" style={{ fontSize: 11 }}>day {r.dayOffset}</div></td>
                    <td className="mono">{r.dueDate}</td>
                    <td><input type="date" value={String(val(r.id, 'revisedDate', r.revisedDate ?? ''))} onChange={(e) => edit(r.id, 'revisedDate', e.target.value)} /></td>
                    <td className="mono">{r.percent}%</td>
                    {view === 'internal' && <td className="mono">{r.amount == null ? '—' : inr(r.amount)}</td>}
                    <td style={{ minWidth: 110 }}>
                      <div className="bar"><div style={{ width: `${ready}%`, background: ready === 100 ? 'var(--ok)' : 'var(--accent)' }} /></div>
                      <span className="faint" style={{ fontSize: 11 }}>{ready}% · {r.checkpoints.length} clauses</span>
                    </td>
                    <td>
                      <select value={statusOf(r)} onChange={(e) => edit(r.id, 'status', e.target.value)}>
                        {TRACK_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                    <td><input value={String(val(r.id, 'invoiceNo', r.invoiceNo))} onChange={(e) => edit(r.id, 'invoiceNo', e.target.value)} style={{ width: 110 }} /></td>
                    <td><input type="date" value={String(val(r.id, 'invoiceDate', r.invoiceDate ?? ''))} onChange={(e) => edit(r.id, 'invoiceDate', e.target.value)} /></td>
                  </tr>
                  {isOpen && r.checkpoints.map((c) => (
                    <tr key={c.id} style={{ background: 'var(--panel2)' }}>
                      <td />
                      <td colSpan={2} style={{ paddingLeft: 18 }}>
                        <span className={`tag ${c.kind === 'execution' ? 'info' : c.kind === 'material' ? 'warn' : 'ext'}`}>{c.kind}</span>{' '}
                        {c.description}
                        {c.activityName && <div className="faint" style={{ fontSize: 11 }}>evidenced by: {c.activityName}</div>}
                      </td>
                      <td className="mono">{c.plannedDate ?? '—'}</td>
                      <td colSpan={view === 'internal' ? 2 : 1} />
                      <td>
                        <input type="date" value={String(val(c.id, 'actualDate', c.actualDate ?? ''))} onChange={(e) => edit(c.id, 'actualDate', e.target.value)} />
                      </td>
                      <td>
                        <select value={cpStatusOf(c)} onChange={(e) => edit(c.id, 'status', e.target.value)}>
                          {TRACK_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
                        </select>
                      </td>
                      <td colSpan={2} className="muted" style={{ fontSize: 11.5 }}>
                        {view === 'internal' ? c.responsibility : ''}
                      </td>
                    </tr>
                  ))}
                  {isOpen && !r.checkpoints.length && (
                    <tr style={{ background: 'var(--panel2)' }}>
                      <td /><td colSpan={9} className="muted" style={{ fontSize: 12 }}>{r.remarks}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function Settings(p: {
  sundaysOff: boolean; setSundaysOff: (v: boolean) => void;
  holidays: string; setHolidays: (v: string) => void;
  workMode: number; setWorkMode: (v: number) => void;
  buffer: number; setBuffer: (v: number) => void;
  leadOverrides: Record<string, number>; setLeadOverrides: (v: Record<string, number>) => void;
  clientId: string; setClientId: (v: string) => void;
  dates: ScheduleDates; setDates: (v: ScheduleDates) => void;
  plan: Plan;
  project: ProjectInputs;
  ingestResult: { boq: IngestedBoq; file: string } | null;
  onParsed: (boq: IngestedBoq, file: string) => void;
  onSaveWorkspace: () => void;
}) {
  const leads = normsData.packageLeadTimes as Record<string, { days: number; longLead: boolean; label: string }>;
  const [error, setError] = useState<string | null>(null);

  const handle = async (f: File) => {
    setError(null);
    try {
      const isText = /\.(csv|tsv|txt)$/i.test(f.name);
      const data = isText ? await f.text() : await f.arrayBuffer();
      p.onParsed(ingestion.parseBoq({ name: f.name, data }), f.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <h2>Working calendar</h2>
      <div className="row">
        <div className="field">
          <label>Sundays</label>
          <select value={p.sundaysOff ? 'off' : 'on'} onChange={(e) => p.setSundaysOff(e.target.value === 'off')}>
            <option value="on">Working (Flipspaces default)</option>
            <option value="off">Non-working</option>
          </select>
        </div>
        <div className="field" style={{ minWidth: 300 }}>
          <label>Holidays (comma-separated ISO dates)</label>
          <input value={p.holidays} onChange={(e) => p.setHolidays(e.target.value)} placeholder="2026-08-15, 2026-10-02" />
        </div>
        <div className="field">
          <label>Site work mode</label>
          <select value={p.workMode} onChange={(e) => p.setWorkMode(Number(e.target.value))}>
            <option value={0.85}>Day &amp; night (faster)</option>
            <option value={1}>Day only (normal)</option>
            <option value={1.25}>No noisy work in the day (slower)</option>
          </select>
        </div>
        <div className="field">
          <label>Internal buffer (working days) {normsData.bufferPolicy.min}–{normsData.bufferPolicy.max}</label>
          <input type="number" min={normsData.bufferPolicy.min} max={normsData.bufferPolicy.max} value={p.buffer} onChange={(e) => p.setBuffer(Number(e.target.value))} />
        </div>
      </div>

      <h2>Actual project dates</h2>
      <p className="muted" style={{ marginTop: -6, maxWidth: 860 }}>
        The contract states a commencement date and a duration. Site reality often differs — set the actual dates
        here and the whole plan is recomputed from them. Leave a field blank to use the contract.
        The internal pair is the baseline the team works to; the client pair is what the client is shown. The gap
        between them is the buffer.
      </p>
      <div className="row">
        <div className="field">
          <label>Internal start (actual)</label>
          <input type="date" value={p.dates.internalStart ?? ''} onChange={(e) => p.setDates({ ...p.dates, internalStart: e.target.value || null })} />
        </div>
        <div className="field">
          <label>Internal target finish</label>
          <input type="date" value={p.dates.internalEnd ?? ''} onChange={(e) => p.setDates({ ...p.dates, internalEnd: e.target.value || null })} />
        </div>
        <div className="field">
          <label>Client start</label>
          <input type="date" value={p.dates.clientStart ?? ''} onChange={(e) => p.setDates({ ...p.dates, clientStart: e.target.value || null })} />
        </div>
        <div className="field">
          <label>Client committed finish</label>
          <input type="date" value={p.dates.clientEnd ?? ''} onChange={(e) => p.setDates({ ...p.dates, clientEnd: e.target.value || null })} />
        </div>
        <button onClick={() => p.setDates({})} disabled={!Object.values(p.dates).some(Boolean)}>Reset to contract</button>
      </div>
      {p.plan.internal && (
        <div className={`banner ${p.plan.internal.varianceDays !== null && p.plan.internal.varianceDays > 0 ? '' : 'ok'}`} style={{ marginTop: 12, maxWidth: 900 }}>
          Internal baseline <strong>{p.plan.internal.start} → {p.plan.internal.end}</strong> ({p.plan.internal.durationWorkingDays} working days).
          {' '}Client baseline <strong>{p.plan.external?.start} → {p.plan.external?.end}</strong>.
          {p.plan.internal.target && (
            p.plan.internal.varianceDays !== null && p.plan.internal.varianceDays > 0
              ? ` The CPM finish is ${p.plan.internal.varianceDays}d past your internal target of ${p.plan.internal.target} — the engine reports the gap rather than compressing durations to hide it.`
              : ` Inside the internal target of ${p.plan.internal.target} by ${Math.abs(p.plan.internal.varianceDays ?? 0)}d.`
          )}
        </div>
      )}

      <h2 style={{ marginTop: 26 }}>Google Drive access</h2>
      <div className="row">
        <div className="field" style={{ minWidth: 420 }}>
          <label>OAuth client ID (for live Drive scanning)</label>
          <input value={p.clientId} onChange={(e) => p.setClientId(e.target.value)} placeholder="xxxxxxxx.apps.googleusercontent.com" />
        </div>
      </div>
      <div className={`banner ${p.clientId ? 'ok' : 'info'}`} style={{ marginTop: 12, maxWidth: 900 }}>
        {p.clientId ? (
          <>Configured. The <strong>New project</strong> tab can now scan a Drive folder live.</>
        ) : (
          <>
            <strong>One-time Google setup, about ten minutes, free.</strong>
            <ol style={{ margin: '8px 0 6px 18px', padding: 0, lineHeight: 1.7 }}>
              <li>Create/pick a project at <a href="https://console.cloud.google.com/projectcreate" target="_blank" rel="noreferrer">console.cloud.google.com</a>.</li>
              <li><a href="https://console.cloud.google.com/apis/library/drive.googleapis.com" target="_blank" rel="noreferrer">Enable the Google Drive API</a>.</li>
              <li><strong>Google Auth Platform → Branding</strong> → name the app, give a support email.</li>
              <li><strong>Audience</strong> → <em>Internal</em> for a Workspace account, else <em>External</em> and add your own Google address under <strong>Test users</strong>.</li>
              <li><strong>Clients → Create client → Web application</strong>.</li>
              <li><strong>Authorised JavaScript origins</strong> → add exactly <code>{typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173'}</code></li>
              <li>Paste the client ID above.</li>
            </ol>
            Scope is <code>drive.readonly</code>, which Google treats as restricted — fine while the app stays in
            <em> Testing</em>, but an External app will show an “unverified app” screen (Advanced → Go to…).
            Until then, the New project tab reads a folder straight off this computer — no setup, same steps.
          </>
        )}
      </div>

      <h2>Project resource plan</h2>
      <p className="muted" style={{ marginTop: -6, maxWidth: 780 }}>
        Role slots scaled from project area by the norms. This drives who is staffed on the project, so it is a
        setting rather than a daily tracker.
      </p>
      <Resources plan={p.plan} />

      <h2 style={{ marginTop: 26 }}>Canonical JSON</h2>
      <details>
        <summary className="muted" style={{ cursor: 'pointer', fontSize: 13 }}>
          Show the key-sorted plan document ({canonicalJson(p.plan).length.toLocaleString()} bytes)
        </summary>
        <pre className="json" style={{ marginTop: 10, maxHeight: '50vh', overflow: 'auto' }}>{canonicalJson(p.plan)}</pre>
      </details>

      <h2 style={{ marginTop: 26 }}>Upload a priced BOQ into “{p.project.name}”</h2>
      <div className="row">
        <input type="file" accept=".xlsx,.xls,.csv,.tsv,.txt" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handle(f); }} />
        <button onClick={p.onSaveWorkspace}>Save workspace (JSON)</button>
      </div>
      {error && <div className="banner" style={{ marginTop: 12 }}>Could not read that file: {error}</div>}
      {p.ingestResult && (
        <>
          <div className="cards" style={{ marginTop: 14 }}>
            <div className="card"><div className="k">File</div><div className="v" style={{ fontSize: 13 }}>{p.ingestResult.file}</div><div className="s">{p.ingestResult.boq.rowsScanned} rows · {p.ingestResult.boq.rowsSkipped} skipped</div></div>
            <div className="card"><div className="k">Packages</div><div className="v">{p.ingestResult.boq.packages.length}</div></div>
            <div className="card"><div className="k">Area</div><div className="v">{p.ingestResult.boq.areaSft ? p.ingestResult.boq.areaSft.value.toLocaleString('en-IN') + ' sft' : '—'}</div></div>
            <div className="card"><div className="k">Grand total</div><div className="v">{p.ingestResult.boq.contractValue ? inr(p.ingestResult.boq.contractValue.value) : '—'}</div></div>
          </div>
          {p.ingestResult.boq.warnings.length > 0 && (
            <div className="banner"><strong>Parser notes</strong><ul>{p.ingestResult.boq.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
          )}
        </>
      )}

      <h2>Norms — package lead times ({normsData.version})</h2>
      <p className="muted" style={{ marginTop: -4, fontSize: 12.5 }}>Norms are versioned data, not code. Editing here re-drives every order-by date.</p>
      <div className="tblwrap" style={{ maxHeight: 340 }}>
        <table>
          <thead><tr><th>Code</th><th>Package</th><th>Long lead</th><th>Lead time (days)</th></tr></thead>
          <tbody>{Object.entries(leads).map(([code, v]) => (
            <tr key={code}>
              <td className="mono">{code}</td><td className="muted">{v.label}</td><td>{v.longLead ? <span className="tag warn">yes</span> : <span className="faint">no</span>}</td>
              <td className="edit"><input type="number" style={{ width: 90 }} value={p.leadOverrides[code] ?? v.days}
                onChange={(e) => p.setLeadOverrides({ ...p.leadOverrides, [code]: Number(e.target.value) })} /></td>
            </tr>
          ))}</tbody>
        </table>
      </div>

      <h2>Crew caps ({normsData.version})</h2>
      <div className="tblwrap" style={{ maxHeight: 300 }}>
        <table>
          <thead><tr><th>Trade</th><th>Min gang</th><th>Max gang</th></tr></thead>
          <tbody>{Object.entries(normsData.crewCaps as unknown as Record<string, { min: number; max: number }>)
            .filter(([k]) => !k.startsWith('_'))
            .map(([trade, c]) => (
              <tr key={trade}><td>{trade}</td><td className="mono">{c.min}</td><td className="mono">{c.max}</td></tr>
            ))}</tbody>
        </table>
      </div>

      <h2>Material lead-time reference</h2>
      <div className="tblwrap" style={{ maxHeight: 300 }}>
        <table>
          <thead><tr><th>Material</th><th>Make</th><th>Days</th><th>Source</th></tr></thead>
          <tbody>{normsData.materialLeadTimesDays.map((m) => (
            <tr key={m.item}><td>{m.item}</td><td className="muted">{m.make || '—'}</td><td className="mono">{m.days}</td><td className="prov">{m.source}</td></tr>
          ))}</tbody>
        </table>
      </div>
    </>
  );
}
