import { Fragment, useEffect, useMemo, useState } from 'react';
import type { CalendarConfig, EngineConfig, ProjectInputs, ScheduleDates, Traced } from './domain/types';
import type { DesignRow, MaterialInspection, MaterialRow, MaterialStatus, MaterialSupply, TodoRow, TrackStatus } from './domain/trackers';
import {
  MATERIAL_INSPECTIONS, MATERIAL_STATUSES, MATERIAL_SUPPLIES, SUPPLY_LABEL, TRACK_STATUSES, delayDays, summariseMaterials,
} from './domain/trackers';
import { buildPlan, clientView, type ExternalDelay, type Plan } from './engine/planner';
import { auditTrace, canonicalJson, validatePlan } from './engine/schema';
import { buildPertFromPlan } from './engine/pert-build';
import { skf } from './data/skf';
import { emirates } from './data/emirates';
import { pendingKohler } from './data/others';
import { kohler } from './data/kohler';
import { buildEmiratesPert } from './data/emirates-pert';
import normsData from './norms/norms-v1.json';
import { Gantt } from './ui/Gantt';
import { SCurveChart } from './ui/SCurve';
import { Cockpit } from './ui/Cockpit';
import { buildSCurve } from './engine/scurve';
import { Pert } from './ui/Pert';
import type { PertTree } from './domain/pert';
import { ProjectSettings } from './ui/ProjectSettings';
import { Assistant, EMPTY_CHAT_STATE, type ChatState } from './ui/Assistant';
import { BoqIngestionService, type IngestedBoq } from './services/ingestion';
import { FilePersistence } from './services/persistence';
import { readDriveClientId, writeDriveClientId, readOrg, writeOrg } from './services/settings-store';
import { emptyOrg, type OrgState } from './domain/org';
import { Admin } from './ui/Admin';
import { renderReport } from './reports/render';
import { buildDeck } from './reports/deck';
import { syncPlanToTrackingEngine } from './services/dnbos-sync';

const BASE_PROJECTS: ProjectInputs[] = [skf, emirates, kohler, pendingKohler];
const ingestion = new BoqIngestionService();
const persistence = new FilePersistence();
const TABS = ['Cockpit', 'Overview', 'PERT', 'Manpower', 'Design', 'Procurement', 'Material at site', 'To-do', 'Dependencies', 'RA Milestones', 'AI Assistant', 'Project settings', 'Admin', 'Settings'] as const;
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
  const [tab, setTab] = useState<Tab>('Cockpit');
  const [sundaysOff, setSundaysOff] = useState(false);
  const [holidays, setHolidays] = useState('');
  const [workMode, setWorkMode] = useState(1);
  const [buffer, setBuffer] = useState(normsData.bufferPolicy.defaultInternalBufferDays);
  const [leadOverrides, setLeadOverrides] = useState<Record<string, number>>({});

  // Persisted, or it would be lost on every reload — see services/settings-store.ts.
  const [clientId, setClientIdState] = useState(readDriveClientId);
  const setClientId = (v: string) => {
    setClientIdState(v);
    writeDriveClientId(v);
  };
  // organisation directory, teams and project lifecycle — local to this machine
  const [org, setOrgState] = useState<OrgState>(() => readOrg(emptyOrg()));
  const setOrg = (o: OrgState) => { setOrgState(o); writeOrg(o); };
  // user-added and user-removed to-dos, per project
  const [customTodos, setCustomTodos] = useState<Record<string, TodoRow[]>>({});
  const [deletedTodos, setDeletedTodos] = useState<Record<string, string[]>>({});
  // live tracker edits, keyed by project then row id
  const [edits, setEdits] = useState<Record<string, Record<string, Record<string, string>>>>({});
  // approved AI-replan constraints, keyed by project — session-only for now: the API routes for
  // durable Supabase persistence exist (api/projects/create.ts, api/replan/approve.ts) but
  // aren't wired into this component yet.
  const [appliedDelays, setAppliedDelays] = useState<Record<string, ExternalDelay[]>>({});
  const [lastAppliedSummary, setLastAppliedSummary] = useState<Record<string, string>>({});
  // AI Assistant chat history, keyed by project — same session-only, per-project pattern as
  // appliedDelays above. Lifted up here (rather than living inside Assistant.tsx) so it survives
  // switching tabs away and back, and correctly starts fresh / resumes when the project changes.
  const [chatByProject, setChatByProject] = useState<Record<string, ChatState>>({});
  const today = new Date().toISOString().slice(0, 10);
  const ALL_PROJECTS = [...BASE_PROJECTS.map((p) => overrides[p.id] ?? p), ...extraProjects];
  const PROJECTS = ALL_PROJECTS.filter((p) => !org.archived.includes(p.id));
  const project = PROJECTS.find((p) => p.id === projectId) ?? PROJECTS[0] ?? ALL_PROJECTS[0];

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
      // only APPROVED dates drive the plan; a proposed change sits in org.pendingDates until
      // the BU Head signs it off
      dates: (org.dates?.[projectId] ?? {}) as ScheduleDates,
    };
  }, [sundaysOff, holidays, workMode, buffer, leadOverrides, org.dates, projectId]);

  // Carpet area set in project settings is an input like any other, and overrides the BOQ
  // figure — the two are not always the same number. It carries its own provenance so the
  // difference stays traceable rather than silently replacing the document.
  const sited = useMemo(() => {
    const area = org.sites?.[project.id]?.carpetAreaSft;
    return area
      ? { ...project, areaSft: { value: area, provenance: 'input' as const, source: 'project settings · site details (carpet area)' } }
      : project;
  }, [project, org.sites]);
  const full = useMemo(
    () => buildPlan(sited, cfg, today, appliedDelays[project.id] ?? []),
    [sited, cfg, today, appliedDelays, project.id],
  );
  const plan: Plan = view === 'external' ? clientView(full) : full;
  const validation = validatePlan(plan);
  const trace = auditTrace(plan);
  const pending = plan.project.status === 'pending_inputs';

  useEffect(() => {
    syncPlanToTrackingEngine(project.id, sited, full);
  }, [project.id, sited, full]);

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
        {appliedDelays[project.id]?.length ? (
          <span className="tag info" title={lastAppliedSummary[project.id]}>
            AI replan active: {lastAppliedSummary[project.id]}
          </span>
        ) : null}
        <span className={'tag ' + (validation.ok ? 'ok' : 'crit')}>{validation.ok ? 'schema valid' : `${validation.errors.length} schema errors`}</span>
        <span className={'tag ' + (trace.ok ? 'ok' : 'crit')}>{trace.tracedCount} traced</span>
        <button onClick={() => download(`${plan.project.id}-${view}.json`, canonicalJson(plan))}>JSON</button>
        <button onClick={() => openReport(renderReport(plan, view === 'external' ? 'client' : 'internal'))}>PDF report</button>
        <button className="primary" onClick={() => void buildDeck(plan, view === 'external' ? 'client' : 'internal').writeFile({ fileName: `${plan.project.id}-${view}-deck.pptx` })}>Deck</button>
        {!pending && <button className="track-btn" onClick={() => window.open(`/tracking/index.html?pid=${encodeURIComponent(project.id)}`, '_blank')}>Track</button>}
      </header>

      <nav className="tabs">
        {TABS.map((t) => <button key={t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>{t}</button>)}
      </nav>

      <main>
        {pending && tab !== 'Project settings' && (
          <div className="banner">
            <strong>{plan.project.name} — pending inputs.</strong> No plan generated; the engine does not fabricate numbers.
            Missing: {plan.missingInputs.join(', ')}. Use the <strong>Project settings</strong> tab to link a Drive folder and answer the intake questions.
          </div>
        )}
        {view === 'external' && !pending && (
          <div className="banner info">Client view — anchored to contract dates. Buffer, cost, margin, float and manpower are withheld.</div>
        )}

        {tab === 'Cockpit' && (
          <Cockpit
            plan={plan}
            today={today}
            onOpen={(area) =>
              setTab(
                area === 'design' ? 'Design'
                : area === 'procurement' ? 'Procurement'
                : area === 'materials' ? 'Material at site'
                : area === 'billing' ? 'RA Milestones'
                : area === 'manpower' ? 'Manpower'
                : 'PERT',
              )
            }
          />
        )}
        {tab === 'Overview' && <Overview plan={plan} view={view} />}
        {tab === 'PERT' && <PertSection tree={pert} today={today} plan={plan} view={view} />}
        {tab === 'Manpower' && <Manpower plan={plan} />}
        {tab === 'Design' && <Design plan={plan} edit={edit} val={val} />}
        {tab === 'Procurement' && <Procurement plan={plan} view={view} edit={edit} val={val} />}
        {tab === 'Material at site' && <Materials plan={plan} view={view} today={today} edit={edit} val={val} />}
        {tab === 'To-do' && (
          <Todos
            plan={plan}
            view={view}
            edit={edit}
            val={val}
            custom={customTodos[project.id] ?? []}
            deleted={new Set(deletedTodos[project.id] ?? [])}
            onAdd={(description) =>
              setCustomTodos((prev) => ({
                ...prev,
                [project.id]: [
                  ...(prev[project.id] ?? []),
                  {
                    id: `custom-${project.id}-${Date.now()}`,
                    description,
                    responsibility: '',
                    priority: 'MEDIUM',
                    status: 'Not Started',
                    startDate: null,
                    endDate: null,
                    revisedDate: null,
                    notes: '',
                    category: 'general',
                    source: 'custom',
                  },
                ],
              }))
            }
            onDelete={(id) => setDeletedTodos((prev) => ({ ...prev, [project.id]: [...(prev[project.id] ?? []), id] }))}
            onRestore={() => setDeletedTodos((prev) => ({ ...prev, [project.id]: [] }))}
          />
        )}
        {tab === 'Dependencies' && <Dependencies plan={plan} today={today} edit={edit} val={val} />}
        {tab === 'RA Milestones' && <RaMilestones plan={plan} view={view} today={today} edit={edit} val={val} />}
        {tab === 'AI Assistant' && (
          <Assistant
            p={sited}
            cfg={cfg}
            today={today}
            appliedDelays={appliedDelays[project.id] ?? []}
            chat={chatByProject[project.id] ?? EMPTY_CHAT_STATE}
            onChatChange={(updater) =>
              setChatByProject((prev) => ({ ...prev, [project.id]: updater(prev[project.id] ?? EMPTY_CHAT_STATE) }))
            }
            onApprove={(delays, summary) => {
              setAppliedDelays((prev) => ({ ...prev, [project.id]: [...(prev[project.id] ?? []), ...delays] }));
              setLastAppliedSummary((prev) => ({ ...prev, [project.id]: summary }));
            }}
          />
        )}
        {tab === 'Project settings' && (
          <ProjectSettings
            project={project}
            org={org}
            setOrg={setOrg}
            clientId={clientId}
            existingIds={PROJECTS.map((p) => p.id)}
            onCreate={(p) => {
              setExtraProjects((prev) => [...prev, p]);
              setProjectId(p.id);
              setTab('Cockpit');
            }}
          />
        )}
        {tab === 'Admin' && (
          <Admin
            org={org}
            setOrg={setOrg}
            projects={ALL_PROJECTS.map((p) => ({ id: p.id, name: p.name, client: p.client }))}
            builtInIds={BASE_PROJECTS.map((p) => p.id)}
            onDeleteProject={(id) => {
              setExtraProjects((prev) => prev.filter((p) => p.id !== id));
              if (projectId === id) setProjectId(BASE_PROJECTS[0].id);
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
            org={org} setOrg={setOrg}
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

    </>
  );
}

/**
 * PERT is the schedule section; the Gantt is a way of looking at the same programme rather than
 * a separate module, so it lives here behind a toggle instead of on its own tab.
 */
function PertSection({ tree, today, plan, view }: { tree: PertTree; today: string; plan: Plan; view: string }) {
  const [mode, setMode] = useState<'pert' | 'gantt' | 'scurve'>('pert');
  const acts = plan.modules.timeline.activities;
  const curve = useMemo(() => buildSCurve(acts, today), [acts, today]);
  const blurb =
    mode === 'gantt' ? 'Same programme, drawn against the calendar.'
    : mode === 'scurve' ? 'Cumulative progress weighted by work content, not by activity count.'
    : 'MS-Project columns, collapsible by section.';
  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={mode === 'pert' ? 'on' : ''} onClick={() => setMode('pert')}>PERT network</button>
          <button className={mode === 'gantt' ? 'on' : ''} onClick={() => setMode('gantt')} disabled={!acts.length}>Gantt chart</button>
          <button className={mode === 'scurve' ? 'on' : ''} onClick={() => setMode('scurve')} disabled={!acts.length}>S-curve</button>
        </div>
        <span className="muted" style={{ fontSize: 12 }}>{blurb}</span>
      </div>
      <ScheduleSummary plan={plan} view={view} today={today} />
      {mode === 'pert' && <Pert tree={tree} today={today} />}
      {mode === 'gantt' && <GanttView plan={plan} view={view} today={today} />}
      {mode === 'scurve' && <SCurveView curve={curve} today={today} />}
    </>
  );
}

function SCurveView({ curve, today }: { curve: ReturnType<typeof buildSCurve>; today: string }) {
  if (!curve.points.length) return <p className="muted">No schedule — inputs pending.</p>;
  const behind = curve.varianceToday < 0;
  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Planned to date</div><div className="v">{curve.plannedToday}%</div><div className="s">by work content</div></div>
        <div className="card"><div className="k">Actual to date</div><div className="v" style={{ color: 'var(--ok)' }}>{curve.actualToday}%</div><div className="s">recorded progress only</div></div>
        <div className="card" style={behind ? { borderColor: 'var(--crit)', background: 'var(--crit-soft)' } : undefined}>
          <div className="k">Variance</div>
          <div className="v" style={{ color: behind ? 'var(--crit)' : 'var(--ok)' }}>{curve.varianceToday > 0 ? '+' : ''}{curve.varianceToday}%</div>
          <div className="s">{behind ? 'behind the curve' : 'at or ahead of plan'}</div>
        </div>
        <div className="card"><div className="k">Total work content</div><div className="v">{curve.totalManDays.toLocaleString('en-IN')}</div><div className="s">man-days across the programme</div></div>
      </div>
      {curve.actualToday === 0 && (
        <div className="banner" style={{ marginBottom: 12 }}>
          No progress has been recorded against any activity yet, so the actual curve sits at zero. The engine will not
          infer progress from the calendar — a date passing is not evidence that work happened.
        </div>
      )}
      <SCurveChart curve={curve} today={today} />
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
        <span className="muted" style={{ fontSize: 12, maxWidth: 640 }}>
          Two targets only: when the drawing is ready to issue, and when the client must have approved it. Both are
          back-scheduled from the site activity the drawing releases, then re-timed so no drawing is approved after
          something drawn from it is issued — a partition layout cannot precede the furniture layout it is set out from.
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
              <td title={r.issues.join(' ')}>
                {r.drawingName}
                {r.issues.length > 0 && <span className="tag crit" style={{ marginLeft: 6 }}>!</span>}
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
  const all = plan.modules.procurement;
  const [longLeadOnly, setLongLeadOnly] = useState(false);
  const today = new Date().toISOString().slice(0, 10);
  if (!all.length) return <p className="muted">No procurement tracker — inputs pending.</p>;
  const longLead = all.filter((i) => i.longLead);
  const items = longLeadOnly ? longLead : all;
  const overdue = all.filter((i) => i.orderBy && i.orderBy < today).length;
  const longLeadOverdue = longLead.filter((i) => i.orderBy && i.orderBy < today).length;
  const daysTo = (d: string | null) => (d ? Math.round((Date.parse(d + 'T00:00:00Z') - Date.parse(today + 'T00:00:00Z')) / 86400000) : null);

  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Packages</div><div className="v">{all.length}</div></div>
        <div className="card" style={{ borderColor: 'var(--ext)' }}>
          <div className="k">Long-lead</div>
          <div className="v" style={{ color: 'var(--ext)' }}>{longLead.length}</div>
          <div className="s">these sink the programme if ordered late</div>
        </div>
        <div className="card" style={longLeadOverdue ? { borderColor: 'var(--crit)', background: 'var(--crit-soft)' } : undefined}>
          <div className="k">Long-lead past order-by</div>
          <div className="v" style={{ color: longLeadOverdue ? 'var(--crit)' : undefined }}>{longLeadOverdue}</div>
          <div className="s">order now or re-plan the activity</div>
        </div>
        <div className="card"><div className="k">Order-by passed (all)</div><div className="v" style={{ color: 'var(--warn)' }}>{overdue}</div></div>
      </div>

      {longLeadOverdue > 0 && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <strong>{longLeadOverdue} long-lead package{longLeadOverdue === 1 ? '' : 's'} are already past their order-by date.</strong>{' '}
          {longLead.filter((i) => i.orderBy && i.orderBy < today).map((i) => `${i.category} (${i.leadDays}d lead, order-by ${i.orderBy})`).join(' · ')}
        </div>
      )}

      <h2>Package plan — order and delivery dates</h2>
      <p className="muted" style={{ marginTop: -4, fontSize: 12.5 }}>
        Commercial values are deliberately not shown here. Order-by is derived from the delivery date the
        programme needs, less the lead time; each package also shows the design approval that gates it.
      </p>
      <div className="row" style={{ margin: '10px 0' }}>
        <div className="seg">
          <button className={!longLeadOnly ? 'on' : ''} onClick={() => setLongLeadOnly(false)}>All packages ({all.length})</button>
          <button className={longLeadOnly ? 'on' : ''} onClick={() => setLongLeadOnly(true)}>Long-lead only ({longLead.length})</button>
        </div>
      </div>
      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th>Category</th><th>Sub Category</th><th>Lead</th><th>Criticality</th><th>Order by</th><th>Delivery required</th>
              <th>Revised date</th>{view === 'internal' && <th>Vendor</th>}<th>Order status</th><th>Delivery status</th>
              <th>Responsibility</th><th>Gated by (design)</th><th>Feeds (site)</th>{view === 'internal' && <th>Remarks</th>}
            </tr>
          </thead>
          <tbody>{items.map((i) => (
            <tr key={i.id} style={i.longLead ? { background: 'var(--ext-soft)' } : undefined}>
              <td>
                {i.category}
                {i.longLead && <div><span className="tag ext" style={{ marginTop: 3 }}>LONG-LEAD</span></div>}
              </td>
              <td className="muted">{i.subCategory}</td>
              <td className="mono">{i.leadDays}d</td>
              <td><span className={`tag ${i.criticality === 'Very Critical' ? 'crit' : i.criticality === 'High' ? 'warn' : ''}`}>{i.criticality}</span></td>
              <td className="mono">
                {(() => {
                  const d = daysTo(i.orderBy);
                  const late = d !== null && d < 0;
                  return (
                    <>
                      <strong style={late ? { color: 'var(--crit)' } : i.longLead ? { color: 'var(--ext)' } : undefined}>{i.orderBy ?? '—'}</strong>
                      {d !== null && (
                        <div className="faint" style={{ fontSize: 11, color: late ? 'var(--crit)' : undefined }}>
                          {late ? `${Math.abs(d)}d overdue` : `in ${d}d`}
                        </div>
                      )}
                    </>
                  );
                })()}
              </td>
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

const materialStatusClass = (s: MaterialStatus): string =>
  s === 'Delivered' ? 'ok' : s === 'In Transit' ? 'info' : s === 'Partially Delivered' ? 'warn' : s === 'Returned' ? 'crit' : '';

/**
 * Material tracker at site — one level below the procurement packages.
 *
 * Procurement plans the package: "Electrical, order by 12-Jun, on site by 30-Jun". Site does
 * not receive a package. It receives gypsum boards, ply, wire drums, GI ducting and
 * workstations, each with its own lead time, its own vendor and its own delivery note — and a
 * package reading "Partially Delivered" never says which of those the floor is waiting on.
 *
 * Every row states how the material arrives. Bought on our own PO, and the vendor is then read
 * live off the procurement row that raises it rather than typed twice; supplied by the work
 * contractor against their own PO; or free-issued by the client. Quantities, GRN dates, storage
 * and inspection are entered by site — the engine computes the dates and the links, nothing else.
 */
function Materials({
  plan, view, today, edit, val,
}: {
  plan: Plan; view: string; today: string; edit: EditFn; val: ValFn;
}) {
  const [cat, setCat] = useState<string>('all');
  const [route, setRoute] = useState<'all' | MaterialSupply>('all');
  const [riskOnly, setRiskOnly] = useState(false);
  const rows = plan.modules.materials.rows;
  const procById = useMemo(() => new Map(plan.modules.procurement.map((p) => [p.id, p])), [plan.modules.procurement]);

  // The register is a live document: every count below is computed from what the team has
  // actually recorded, never from the generated defaults.
  const live: MaterialRow[] = rows.map((r) => ({
    ...r,
    supply: val(r.id, 'supply', r.supply) as MaterialSupply,
    status: val(r.id, 'status', r.status) as MaterialStatus,
    inspection: val(r.id, 'inspection', r.inspection) as MaterialInspection,
    actualDelivery: (val(r.id, 'actualDelivery', r.actualDelivery ?? '') as string) || null,
  }));
  const summary = summariseMaterials(live, today);

  if (!rows.length)
    return <p className="muted">No material register — the programme has not been generated yet.</p>;

  if (view === 'external')
    return (
      <>
        <div className="banner info" style={{ marginBottom: 14 }}>
          The site material register — vendors, purchase orders, storage bays and goods-received notes — is an
          internal working document. What is shown here is the material <strong>you supply to us</strong>, with the
          date each has to be on site for the programme to hold.
        </div>
        <h2>Client free-issue material</h2>
        <div className="tblwrap">
          <table>
            <thead><tr><th>Material</th><th>Unit</th><th>Required on site</th><th>Status</th><th>Feeds</th></tr></thead>
            <tbody>{live.map((r) => (
              <tr key={r.id}>
                <td>{r.item}</td>
                <td className="muted">{r.unit}</td>
                <td className="mono">{r.requiredOnSite ?? '—'}</td>
                <td><span className={`tag ${materialStatusClass(r.status)}`}>{r.status}</span></td>
                <td className="faint" style={{ maxWidth: 240 }}>{r.consumedBy ?? '—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </>
    );

  const categories = [...new Set(rows.map((r) => r.category))];
  const atRisk = (r: MaterialRow) =>
    (r.status !== 'Delivered' && r.requiredOnSite !== null && r.requiredOnSite < today) ||
    (r.status === 'Not Ordered' && r.orderBy !== null && r.orderBy < today) ||
    r.issues.length > 0;
  const shown = live.filter(
    (r) => (cat === 'all' || r.category === cat) && (route === 'all' || r.supply === route) && (!riskOnly || atRisk(r)),
  );
  const short = live.filter((r) => r.status !== 'Delivered' && r.requiredOnSite && r.requiredOnSite < today);

  const num = (id: string, field: string, current: number | null): number | null => {
    const raw = val(id, field, current === null ? '' : String(current)) as string;
    const n = Number(raw);
    return raw.trim() === '' || Number.isNaN(n) ? null : n;
  };

  return (
    <>
      <div className="cards">
        <div className="card"><div className="k">Materials tracked</div><div className="v">{summary.items}</div><div className="s">across {categories.length} cost heads</div></div>
        <div className="card"><div className="k">Delivered</div><div className="v" style={{ color: 'var(--ok)' }}>{summary.delivered}</div><div className="s">{summary.inTransit} in transit</div></div>
        <div className="card" style={summary.shortOnSite ? { borderColor: 'var(--crit)', background: 'var(--crit-soft)' } : undefined}>
          <div className="k">Short on site</div>
          <div className="v" style={{ color: summary.shortOnSite ? 'var(--crit)' : undefined }}>{summary.shortOnSite}</div>
          <div className="s">required date passed, not received</div>
        </div>
        <div className="card" style={summary.orderOverdue ? { borderColor: 'var(--warn)', background: 'var(--warn-soft)' } : undefined}>
          <div className="k">Not ordered, past order-by</div>
          <div className="v" style={{ color: summary.orderOverdue ? 'var(--warn)' : undefined }}>{summary.orderOverdue}</div>
          <div className="s">the lead time no longer fits</div>
        </div>
        <div className="card" style={{ borderColor: 'var(--ext)' }}>
          <div className="k">Client free issue</div>
          <div className="v" style={{ color: 'var(--ext)' }}>{summary.clientSupplied}</div>
          <div className="s">not on our PO — chase the client</div>
        </div>
        <div className="card">
          <div className="k">Next required</div>
          <div className="v" style={{ fontSize: 14 }}>{summary.nextRequired ? summary.nextRequired.requiredOnSite : '—'}</div>
          <div className="s">{summary.nextRequired ? summary.nextRequired.item : 'everything received'}</div>
        </div>
      </div>

      {short.length > 0 && (
        <div className="banner" style={{ marginBottom: 12 }}>
          <strong>{short.length} material{short.length === 1 ? '' : 's'} should already be on site.</strong>
          <ul style={{ margin: '6px 0 0 18px', padding: 0 }}>
            {short.slice(0, 5).map((r) => (
              <li key={r.id}>
                <strong>{r.item}</strong> — needed {r.requiredOnSite} for {r.consumedBy ?? 'site'}
                {r.supply === 'client' ? ' · client free issue' : r.supply === 'vendor' ? ' · vendor supplied' : ''}
              </li>
            ))}
          </ul>
          {short.length > 5 && <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>+{short.length - 5} more in the register.</div>}
        </div>
      )}

      <h2>Material delivery register</h2>
      <p className="muted" style={{ marginTop: -4, fontSize: 12.5, maxWidth: 900 }}>
        Each material is dated against the activity that consumes it — on site two days before that activity starts,
        ordered that many days earlier again for its own lead time. Quantities, delivery dates, storage and
        inspection are recorded by site; the engine does not invent what was unloaded.
      </p>
      <div className="row" style={{ margin: '10px 0' }}>
        {/* nineteen cost heads do not fit a segmented control — this is a list, not a toggle */}
        <div className="field" style={{ minWidth: 260 }}>
          <label>Cost head</label>
          <select value={cat} onChange={(e) => setCat(e.target.value)}>
            <option value="all">All cost heads ({rows.length})</option>
            {categories.map((c) => (
              <option key={c} value={c}>{c} ({rows.filter((r) => r.category === c).length})</option>
            ))}
          </select>
        </div>
        <div className="field" style={{ minWidth: 210 }}>
          <label>Supply route</label>
          <select value={route} onChange={(e) => setRoute(e.target.value as 'all' | MaterialSupply)}>
            <option value="all">Every route ({rows.length})</option>
            {MATERIAL_SUPPLIES.map((s) => (
              <option key={s} value={s}>{SUPPLY_LABEL[s]} ({live.filter((r) => r.supply === s).length})</option>
            ))}
          </select>
        </div>
        <button className={riskOnly ? 'primary' : ''} onClick={() => setRiskOnly(!riskOnly)}>
          {riskOnly ? 'Showing at-risk only' : `At risk (${live.filter(atRisk).length})`}
        </button>
      </div>

      {!shown.length ? (
        <p className="muted">Nothing matches that filter.</p>
      ) : (
        <div className="tblwrap">
          <table>
            <thead>
              <tr>
                <th>Cost head</th><th>Material</th><th>Make</th><th>Unit</th><th>Supply</th><th>Vendor / PO</th>
                <th>Ordered</th><th>Received</th><th>Balance</th>
                <th>Order by</th><th>Required on site</th><th>Expected</th><th>Actual (GRN)</th>
                <th>Status</th><th>Inspection</th><th>Storage</th><th>Consumed by</th><th>Remarks</th>
              </tr>
            </thead>
            <tbody>{shown.map((r) => {
              const proc = r.procurementId ? procById.get(r.procurementId) ?? null : null;
              // a material we buy ourselves takes its vendor from the procurement row that raises
              // the PO, so appointing a vendor once there shows up here rather than being retyped
              const procVendor = proc ? (val(proc.id, 'vendor', proc.vendor) as string) : '';
              const ordered = num(r.id, 'orderedQty', r.orderedQty);
              const received = num(r.id, 'deliveredQty', r.deliveredQty);
              const balance = ordered === null || received === null ? null : ordered - received;
              const late = r.status !== 'Delivered' && r.requiredOnSite !== null && r.requiredOnSite < today;
              return (
                <tr key={r.id} style={late ? { background: 'var(--crit-soft)' } : r.supply === 'client' ? { background: 'var(--ext-soft)' } : undefined}>
                  <td className="muted">{r.category}</td>
                  <td title={[r.basis, ...r.issues].join(' · ')}>
                    {r.item}
                    {r.issues.length > 0 && <span className="tag crit" style={{ marginLeft: 6 }}>!</span>}
                    <div className="faint" style={{ fontSize: 11 }}>{r.leadDays}d lead</div>
                  </td>
                  <TextCell id={r.id} field="make" current={r.make} edit={edit} val={val} placeholder="make" />
                  <td className="muted mono">{r.unit}</td>
                  <td className="edit">
                    <select value={r.supply} onChange={(e) => edit(r.id, 'supply', e.target.value)}
                      className={`tag ${r.supply === 'client' ? 'ext' : r.supply === 'vendor' ? 'warn' : 'info'}`}>
                      {MATERIAL_SUPPLIES.map((s) => <option key={s} value={s}>{SUPPLY_LABEL[s]}</option>)}
                    </select>
                  </td>
                  <td className="edit" style={{ minWidth: 190 }}>
                    {r.supply === 'procured' && proc ? (
                      <div className="faint" style={{ fontSize: 11.5 }}>
                        {procVendor || <em>vendor not appointed</em>}
                        <div>via procurement · {proc.category} · {val(proc.id, 'orderStatus', proc.orderStatus) as string}</div>
                      </div>
                    ) : (
                      <input value={val(r.id, 'vendor', r.vendor) as string}
                        placeholder={r.supply === 'client' ? 'client contact' : 'vendor'}
                        onChange={(e) => edit(r.id, 'vendor', e.target.value)} />
                    )}
                    <input value={val(r.id, 'poNumber', r.poNumber) as string} placeholder="PO / WO no."
                      onChange={(e) => edit(r.id, 'poNumber', e.target.value)} />
                  </td>
                  <td className="edit"><input style={{ width: 70 }} placeholder="—" value={val(r.id, 'orderedQty', r.orderedQty === null ? '' : String(r.orderedQty)) as string}
                    onChange={(e) => edit(r.id, 'orderedQty', e.target.value)} /></td>
                  <td className="edit"><input style={{ width: 70 }} placeholder="—" value={val(r.id, 'deliveredQty', r.deliveredQty === null ? '' : String(r.deliveredQty)) as string}
                    onChange={(e) => edit(r.id, 'deliveredQty', e.target.value)} /></td>
                  <td className="mono">
                    {balance === null ? <span className="faint">—</span>
                      : balance > 0 ? <span className="tag warn">{balance} {r.unit}</span>
                      : <span className="tag ok">nil</span>}
                  </td>
                  <td className="mono" title={r.basis}>
                    {r.orderBy ?? '—'}
                    {r.orderBy && r.orderBy < today && r.status === 'Not Ordered' && (
                      <div className="faint" style={{ fontSize: 11, color: 'var(--crit)' }}>passed</div>
                    )}
                  </td>
                  <td className="mono" title={r.basis}>
                    <strong style={late ? { color: 'var(--crit)' } : undefined}>{r.requiredOnSite ?? '—'}</strong>
                  </td>
                  <DateCell id={r.id} field="expectedDelivery" current={r.expectedDelivery} edit={edit} val={val} />
                  <DateCell id={r.id} field="actualDelivery" current={r.actualDelivery} edit={edit} val={val} />
                  <td className="edit">
                    <select value={r.status} onChange={(e) => edit(r.id, 'status', e.target.value)} className={`tag ${materialStatusClass(r.status)}`}>
                      {MATERIAL_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="edit">
                    <select value={r.inspection} onChange={(e) => edit(r.id, 'inspection', e.target.value)}
                      className={`tag ${r.inspection === 'Accepted' ? 'ok' : r.inspection === 'Rejected' ? 'crit' : r.inspection === 'Accepted with deviation' ? 'warn' : ''}`}>
                      {MATERIAL_INSPECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <TextCell id={r.id} field="storage" current={r.storage} edit={edit} val={val} placeholder="area / bay" />
                  <td className="faint" style={{ maxWidth: 200 }}>
                    {r.consumedBy ?? '—'}
                    {r.gatedBy && <div style={{ fontSize: 11 }}>gated by {r.gatedBy}</div>}
                  </td>
                  <TextCell id={r.id} field="remarks" current={r.remarks} edit={edit} val={val} />
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}
    </>
  );
}

/**
 * The general project to-do list.
 *
 * It used to fold in every activity, PO and drawing in the next three weeks — over a hundred
 * rows restating the PERT, Procurement and Design tabs, which made it unreadable. Those rows
 * are still available behind a toggle, but the default is the general list: the standard
 * mobilisation checklist plus whatever the team adds. Rows can be added and removed here.
 */
function Todos({
  plan, view, edit, val, custom, onAdd, onDelete, deleted, onRestore,
}: {
  plan: Plan; view: string; edit: EditFn; val: ValFn;
  custom: TodoRow[];
  onAdd: (description: string) => void;
  onDelete: (id: string) => void;
  deleted: Set<string>;
  onRestore: () => void;
}) {
  const [showDerived, setShowDerived] = useState(false);
  const [cat, setCat] = useState<'all' | TodoRow['category']>('all');
  const [draft, setDraft] = useState('');

  const general = [...plan.modules.todos.filter((r) => r.source === 'standard'), ...custom];
  const derived = plan.modules.todos.filter((r) => r.source === 'derived');
  const pool = (showDerived ? [...general, ...derived] : general).filter((r) => !deleted.has(r.id));
  const rows = cat === 'all' ? pool : pool.filter((r) => r.category === cat);
  const countOf = (c: TodoRow['category']) => pool.filter((r) => r.category === c).length;

  const add = () => {
    const t = draft.trim();
    if (!t) return;
    onAdd(t);
    setDraft('');
  };

  if (view === 'external')
    return (
      <div className="banner info">
        The to-do list is an internal working register — mobilisation tasks, site actions and PO chases — so it is
        withheld from the client view. Switch to <strong>Internal</strong> to see and edit it.
      </div>
    );

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={!showDerived ? 'on' : ''} onClick={() => setShowDerived(false)}>General ({general.length})</button>
          <button className={showDerived ? 'on' : ''} onClick={() => setShowDerived(true)}>Include schedule-derived ({general.length + derived.length})</button>
        </div>
        <span className="muted" style={{ fontSize: 12, maxWidth: 560 }}>
          {showDerived
            ? 'Schedule-derived rows also appear in the PERT, Procurement and Design tabs — shown here only when you ask.'
            : 'The tasks that are not derivable from the schedule. Add your own below.'}
        </span>
        {deleted.size > 0 && <button onClick={onRestore}>Restore {deleted.size} removed</button>}
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="seg">
          <button className={cat === 'all' ? 'on' : ''} onClick={() => setCat('all')}>All ({pool.length})</button>
          {(['general', 'design', 'procurement', 'operations'] as const).map((c) => (
            <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(c)} disabled={!countOf(c)}>
              {c.charAt(0).toUpperCase() + c.slice(1)} ({countOf(c)})
            </button>
          ))}
        </div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <div className="field" style={{ minWidth: 460 }}>
          <label>Add a to-do</label>
          <input
            value={draft}
            placeholder="e.g. Confirm lift booking with building management"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') add(); }}
          />
        </div>
        <button className="primary" onClick={add} disabled={!draft.trim()}>Add</button>
      </div>

      {!rows.length ? (
        <p className="muted">Nothing on the list. Add a to-do above.</p>
      ) : (
        <div className="tblwrap">
          <table>
            <thead><tr><th>Description</th><th>Category</th><th>Responsibility</th><th>Priority</th><th>Status</th><th>Due</th><th>Revised date</th><th>Notes</th><th /></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.id} style={r.source === 'derived' ? { opacity: 0.75 } : undefined}>
                <td>
                  {r.description}
                  {r.source === 'derived' && <div><span className="tag" style={{ marginTop: 3 }}>from schedule</span></div>}
                  {r.source === 'custom' && <div><span className="tag info" style={{ marginTop: 3 }}>added by you</span></div>}
                </td>
                <td><span className={`tag ${r.category === 'design' ? 'ext' : r.category === 'procurement' ? 'warn' : r.category === 'general' ? 'info' : ''}`}>{r.category}</span></td>
                <TextCell id={r.id} field="responsibility" current={r.responsibility} edit={edit} val={val} />
                <td className="edit">
                  <select value={val(r.id, 'priority', r.priority) as string} onChange={(e) => edit(r.id, 'priority', e.target.value)}
                    className={`tag ${r.priority === 'HIGH' ? 'crit' : ''}`}>
                    {['HIGH', 'MEDIUM', 'LOW'].map((x) => <option key={x}>{x}</option>)}
                  </select>
                </td>
                <StatusCell id={r.id} field="status" current={r.status} edit={edit} val={val} />
                <td className="mono">{r.endDate ?? '—'}</td>
                <DateCell id={r.id} field="revised" current={r.revisedDate} edit={edit} val={val} />
                <TextCell id={r.id} field="notes" current={r.notes} edit={edit} val={val} />
                <td><button title="Remove from the list" onClick={() => onDelete(r.id)}>✕</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
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
      <p className="muted" style={{ marginTop: -6, maxWidth: 860 }}>
        The payment schedule in its working format: each RA expands into the milestones the contract requires, and
        each milestone into its sub-milestones. Tick a sub-milestone when site confirms it — readiness is the share
        complete, so an RA never reads as billable just because its date arrived. Invoiced and received figures are
        entered by the team; the engine has no way to know what a client actually paid.
      </p>
      <div className="tblwrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }} /><th>RA</th><th>Day</th><th>%</th>
              {view === 'internal' && <><th>Amount (excl. tax)</th><th>Incl. GST</th><th>Post retention</th></>}
              <th>Due</th><th>Revised</th><th>Readiness</th><th>Status</th>
              {view === 'internal' && <><th>Invoice raised</th><th>Received</th><th>Payment date</th></>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open.has(r.id);
              const ready = readinessOf(r);
              // sub-milestones grouped under their milestone, as the tracking sheet lays them out
              const groups = [...new Map(r.checkpoints.map((c) => [c.group, [] as typeof r.checkpoints])).keys()].map((g) => ({
                group: g,
                items: r.checkpoints.filter((c) => c.group === g),
              }));
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
                    <td><strong>{r.code}</strong></td>
                    <td className="mono">{r.dayOffset}</td>
                    <td className="mono">{r.percent}%</td>
                    {view === 'internal' && <>
                      <td className="mono">{r.amount == null ? '—' : inr(r.amount)}</td>
                      <td className="mono faint">{r.amountIncTax == null ? '—' : inr(r.amountIncTax)}</td>
                      <td className="mono faint">{r.postRetention == null ? '—' : inr(r.postRetention)}</td>
                    </>}
                    <td className="mono">{r.dueDate}</td>
                    <td><input type="date" value={String(val(r.id, 'revisedDate', r.revisedDate ?? ''))} onChange={(e) => edit(r.id, 'revisedDate', e.target.value)} /></td>
                    <td style={{ minWidth: 110 }}>
                      <div className="bar"><div style={{ width: `${ready}%`, background: ready === 100 ? 'var(--ok)' : 'var(--accent)' }} /></div>
                      <span className="faint" style={{ fontSize: 11 }}>{ready}% · {r.checkpoints.length} sub-milestones</span>
                    </td>
                    <td>
                      <select value={statusOf(r)} onChange={(e) => edit(r.id, 'status', e.target.value)}>
                        {TRACK_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
                      </select>
                    </td>
                    {view === 'internal' && <>
                      <td><input style={{ width: 110 }} placeholder="0" value={String(val(r.id, 'invoiceRaised', r.invoiceRaised ?? ''))} onChange={(e) => edit(r.id, 'invoiceRaised', e.target.value)} /></td>
                      <td><input style={{ width: 110 }} placeholder="0" value={String(val(r.id, 'amountReceived', r.amountReceived ?? ''))} onChange={(e) => edit(r.id, 'amountReceived', e.target.value)} /></td>
                      <td><input type="date" value={String(val(r.id, 'paymentDate', r.paymentDate ?? ''))} onChange={(e) => edit(r.id, 'paymentDate', e.target.value)} /></td>
                    </>}
                  </tr>
                  {isOpen && groups.map(({ group, items }) => (
                    <Fragment key={`${r.id}-${group}`}>
                      {items.map((c, idx) => (
                        <tr key={c.id} style={{ background: 'var(--panel2)' }}>
                          <td />
                          {/* the milestone name spans its sub-milestones, as in the sheet */}
                          <td colSpan={2} style={{ paddingLeft: 18, fontWeight: idx === 0 ? 600 : 400 }}>
                            {idx === 0 ? group : ''}
                          </td>
                          <td colSpan={view === 'internal' ? 4 : 1}>{c.description}</td>
                          <td className="mono faint">{c.plannedDate ?? '—'}</td>
                          <td><input type="date" value={String(val(c.id, 'actualDate', c.actualDate ?? ''))} onChange={(e) => edit(c.id, 'actualDate', e.target.value)} /></td>
                          <td className="faint" style={{ fontSize: 11 }}>{c.activityName ?? ''}</td>
                          <td>
                            <select value={cpStatusOf(c)} onChange={(e) => edit(c.id, 'status', e.target.value)}>
                              {TRACK_STATUSES.map((x) => <option key={x} value={x}>{x}</option>)}
                            </select>
                          </td>
                          {view === 'internal' && <td colSpan={3} className="muted" style={{ fontSize: 11.5 }}>{c.responsibility}</td>}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                  {isOpen && !r.checkpoints.length && (
                    <tr style={{ background: 'var(--panel2)' }}><td /><td colSpan={13} className="muted" style={{ fontSize: 12 }}>{r.remarks}</td></tr>
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
  org: OrgState; setOrg: (v: OrgState) => void;
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

      <div className="banner info" style={{ maxWidth: 900, marginBottom: 18 }}>
        Project dates moved to <strong>Project settings → Schedule dates</strong>. They are per project and a change
        now needs BU Head approval before the plan is recomputed, so they no longer belong in global settings.
      </div>

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
