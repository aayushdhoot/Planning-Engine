// Orchestrator: inputs + norms -> canonical plan (8 modules), I/E views.
// All dates come from the CPM engine / contract arithmetic — never guessed.
import type { CpmResult, EngineConfig, ProjectInputs, ScheduledActivity, Traced } from '../domain/types';
import { computeCpm } from './cpm';
import { addCalendarDays, parseIso } from './calendar';
import { deriveWbs } from './wbs';
import { levelManpower, type ManpowerPlan } from './manpower';
import { buildDependencyTracker, buildDesignTracker, buildProcurementTracker, buildRaTracker, buildTodoTracker } from './trackers';
import { summariseDesign, type DependencyRow, type DesignRow, type DesignSummary, type ProcurementRow, type RaMilestoneRow, type TodoRow } from '../domain/trackers';
import norms from '../norms/norms-v1.json';

const comp = (v: number, src: string): Traced<number> => ({ value: v, provenance: 'computed', source: src });
const normT = (v: number, src: string): Traced<number> => ({ value: v, provenance: 'norm', source: `${norms.version}:${src}` });

export interface Assumption {
  area: string;
  text: string;
  internalOnly: boolean;
}

export interface CashflowRow {
  period: string; // YYYY-MM
  inflow: number;
  outflow: number | null; // null in client view
  cumulativeInflow: number;
  cumulativeOutflow: number | null;
}

export interface Plan {
  /** which audience this document is rendered for; drives redaction and schema rules */
  audience: 'internal' | 'client';
  engine: { name: string; version: string; normsVersion: string };
  project: {
    id: string; name: string; client: string; location: string;
    areaSft: Traced<number> | null;
    contractValue: Traced<number> | null;
    status: 'planned' | 'pending_inputs';
  };
  calendar: EngineConfig['calendar'];
  buffer: EngineConfig['buffer'];
  internal: { start: string; end: string; durationWorkingDays: number } | null;
  external: { start: string; end: string; milestones: { code: string; date: string; percent: number; description: string }[] } | null;
  ieInvariant: { externalEnd: string | null; internalEnd: string | null; bufferCalendarDays: number | null; holds: boolean };
  modules: {
    timeline: { activities: ScheduledActivity[]; criticalPath: string[]; phases: { name: string; start: string; end: string; critical: boolean }[] };
    manpower: ManpowerPlan;
    resources: { role: string; count: Traced<number> }[];
    procurement: ProcurementRow[];
    design: { rows: DesignRow[]; summary: DesignSummary };
    todos: TodoRow[];
    dependencies: DependencyRow[];
    raMilestones: RaMilestoneRow[];
  };
  /** contract vs BCS, internal only — kept at plan level now that cashflow is gone */
  margin: Traced<number> | null;
  assumptions: Assumption[];
  confidence: { score: number; basis: string };
  missingInputs: string[];
}

export function buildPlan(p: ProjectInputs, cfg: EngineConfig, today: string): Plan {
  const missing: string[] = [];
  const prov = p.provided;
  if (!prov.boq) missing.push('Project BOQ (priced)');
  if (!prov.contract) missing.push('Project Contract / PO');
  if (!prov.layout) missing.push('Project Layout');
  if (!prov.drawings) missing.push('Drawings');
  if (!prov.day0Images) missing.push('Day 0 site images');
  if (!prov.design3d) missing.push('3D design');
  if (!prov.salesKt) missing.push('Sales KT / email thread');
  if (!prov.makeList) missing.push('Make list');
  if (!prov.paymentTerms) missing.push('Payment terms');

  const assumptions: Assumption[] = [];

  // A BOQ without a supplied schedule is still plannable: derive the WBS from scope.
  let sourceActivities = p.scheduleActivities;
  if (!sourceActivities.length && prov.boq && p.boqPackages.length && p.contractStart) {
    const wbs = deriveWbs(p.boqPackages, p.contractDurationCalDays?.value ?? null);
    sourceActivities = wbs.activities;
    for (const n of wbs.notes) assumptions.push({ area: 'wbs', text: n, internalOnly: false });
  }
  const mandatoryMissing = !prov.boq || !prov.contract || sourceActivities.length === 0;

  const base: Plan = {
    audience: 'internal',
    engine: { name: 'DnB Planning Engine', version: '1.0.0', normsVersion: norms.version },
    project: {
      id: p.id, name: p.name, client: p.client, location: p.location,
      areaSft: p.areaSft, contractValue: p.contractValue,
      status: mandatoryMissing ? 'pending_inputs' : 'planned',
    },
    calendar: cfg.calendar,
    buffer: cfg.buffer,
    internal: null,
    external: null,
    ieInvariant: { externalEnd: null, internalEnd: null, bufferCalendarDays: null, holds: true },
    modules: {
      timeline: { activities: [], criticalPath: [], phases: [] },
      manpower: { days: [], peak: 0, peakDate: null, averageDaily: 0, totalManDays: 0, trades: [], smoothness: 1, warnings: [] },
      resources: [],
      procurement: [],
      design: { rows: [], summary: { drawings: 0, approved: 0, pending: 0, percentComplete: 0 } },
      todos: [],
      dependencies: [],
      raMilestones: [],
    },
    margin: null,
    assumptions,
    confidence: { score: 0, basis: '' },
    missingInputs: missing,
  };

  if (mandatoryMissing) {
    assumptions.push({
      area: 'inputs',
      text: `Mandatory inputs missing (${missing.slice(0, 3).join('; ')}${missing.length > 3 ? '…' : ''}). No plan generated — the engine does not fabricate numbers. Provide a priced BOQ and contract to generate the baseline.`,
      internalOnly: false,
    });
    base.confidence = { score: 0.05, basis: 'No mandatory inputs present.' };
    return base;
  }

  const start = p.contractStart!;
  // ----- Module 1: timeline (internal = CPM) -----
  // Site work-mode changes productivity, so both activity durations AND the overlap
  // lags between them stretch — otherwise the network shape would freeze and a slower
  // work mode would understate the finish date.
  const f = cfg.calendar.workModeFactor;
  const scaled = sourceActivities.map((a) => ({
    ...a,
    duration: f === 1 ? a.duration : comp(Math.ceil(a.duration.value * f), `${a.duration.source} × workModeFactor ${f}`),
    deps: f === 1 ? a.deps : a.deps.map((d) => ({ ...d, lag: Math.round(d.lag * f) })),
  }));
  if (f !== 1)
    assumptions.push({ area: 'schedule', text: `Site work mode factor ${f} applied to every activity duration and dependency lag (${f < 1 ? 'day & night working' : 'restricted daytime working'}).`, internalOnly: false });
  const cpm: CpmResult = computeCpm(scaled, start, cfg.calendar);
  const internalEnd = cpm.activities.reduce((m, a) => (a.endDate > m ? a.endDate : m), start);

  const externalEnd = p.contractDurationCalDays ? addCalendarDays(start, p.contractDurationCalDays.value) : internalEnd;
  const bufferCal = Math.round((parseIso(externalEnd).getTime() - parseIso(internalEnd).getTime()) / 86400000);
  if (bufferCal < cfg.buffer.min)
    assumptions.push({ area: 'schedule', text: `Internal CPM finish (${internalEnd}) leaves only ${bufferCal}d buffer vs contract end (${externalEnd}) — below configured minimum ${cfg.buffer.min}d. Crash critical-path trades or renegotiate.`, internalOnly: true });

  const phaseNames = [...new Set(cpm.activities.map((a) => a.phase))];
  const phases = phaseNames.map((ph) => {
    const acts = cpm.activities.filter((a) => a.phase === ph);
    return {
      name: ph,
      start: acts.reduce((m, a) => (a.startDate < m ? a.startDate : m), acts[0].startDate),
      end: acts.reduce((m, a) => (a.endDate > m ? a.endDate : m), acts[0].endDate),
      critical: acts.some((a) => a.critical),
    };
  });

  base.internal = { start, end: internalEnd, durationWorkingDays: cpm.projectDurationDays };
  base.external = {
    start,
    end: externalEnd,
    milestones: p.milestones.map((m) => ({ code: m.code, date: addCalendarDays(start, m.dayOffset), percent: m.percent, description: m.description })),
  };
  base.ieInvariant = { externalEnd, internalEnd, bufferCalendarDays: bufferCal, holds: externalEnd >= internalEnd };
  base.modules.timeline = { activities: cpm.activities, criticalPath: cpm.criticalPath, phases };

  // ----- Module 2: manpower (levelled, not a naive sum of nominal crews) -----
  const workingDays: string[] = [];
  {
    let d = start;
    const last = internalEnd;
    let guard = 0;
    while (d <= last && guard++ < 3000) {
      workingDays.push(d);
      d = nextWorkingDay(d, cfg);
    }
  }
  const manpower = levelManpower(cpm.activities, workingDays);
  base.modules.manpower = manpower;
  for (const w of manpower.warnings) assumptions.push({ area: 'manpower', text: w, internalOnly: true });

  // ----- Module 3: resources -----
  const area = p.areaSft?.value ?? 0;
  base.modules.resources = norms.resourceRoleNorms.roles.map((r) => ({
    role: r.role,
    count: area
      ? comp(Math.max(r.min, Math.ceil(area / r.per_sft)), `ceil(${area} sft / ${r.per_sft}) per ${norms.version}:resourceRoleNorms`)
      : normT(r.min, 'resourceRoleNorms.min'),
  }));

  // ----- Modules 4-7: the four live trackers, in the Flipspaces working formats -----
  // Design gates procurement, procurement gates execution, so these are built in order.
  const overrides = cfg.normsOverrides?.packageLeadTimeDays ?? {};
  const designRows = buildDesignTracker(cpm.activities, today);
  base.modules.design = { rows: designRows, summary: summariseDesign(designRows) };

  base.modules.procurement = buildProcurementTracker(p, cpm.activities, designRows, today, overrides);
  for (const pr of base.modules.procurement)
    if (!pr.feeds)
      assumptions.push({ area: 'procurement', text: `Package "${pr.category}" has no mapped site activity; order-by date not computed.`, internalOnly: true });

  base.modules.todos = buildTodoTracker(cpm.activities, base.modules.procurement, designRows, today);
  base.modules.dependencies = buildDependencyTracker(cpm.activities, today, start);

  // ----- Module 8: RA billing milestones -----
  // Replaces the cashflow curve. A milestone is a list of physical things that must be true on
  // site before the bill can go out, so it is tracked as clauses the project team ticks off,
  // not as a monthly money projection.
  base.modules.raMilestones = buildRaTracker(p, cpm.activities, start, today);
  if (p.contractValue && p.bcsValue)
    base.margin = comp(
      Math.round(((p.contractValue.value - p.bcsValue.value) / p.contractValue.value) * 1000) / 10,
      `(contractValue − bcsValue)/contractValue from ${p.contractValue.source}`,
    );
  for (const pkg of p.boqPackages)
    if (!pkg.bcsAmount)
      assumptions.push({
        area: 'billing',
        text: `Package ${pkg.code}: BCS cost missing; margin for it assumed at the 28% norm from the BOQ_BCS margin column.`,
        internalOnly: true,
      });
  for (const m of base.modules.raMilestones)
    if (!m.checkpoints.length)
      assumptions.push({
        area: 'billing',
        text: `Milestone ${m.code} has no checkable clauses in its contract wording — billing readiness cannot be tracked against site progress for it.`,
        internalOnly: true,
      });

  // ----- confidence -----
  const providedCount = Object.values(prov).filter(Boolean).length;
  const unmapped = base.modules.procurement.filter((x) => !x.feeds).length;
  const score = Math.round(100 * (0.5 * (providedCount / 9) + 0.3 * (1 - unmapped / Math.max(1, p.boqPackages.length)) + 0.2 * (base.ieInvariant.holds && bufferCal >= cfg.buffer.min ? 1 : 0.3))) / 100;
  base.confidence = { score, basis: `${providedCount}/9 inputs provided; ${unmapped}/${p.boqPackages.length} packages unmapped; buffer ${bufferCal}d.` };

  return base;
}

function nextWorkingDay(iso: string, cfg: EngineConfig): string {
  let d = addCalendarDays(iso, 1);
  const cal = cfg.calendar;
  for (let i = 0; i < 14; i++) {
    const dt = parseIso(d);
    const isOff = cal.weeklyOffDays.includes(dt.getUTCDay()) || cal.holidays.includes(d);
    if (!isOff) return d;
    d = addCalendarDays(d, 1);
  }
  return d;
}

// ---------- External (client) view redaction ----------
export function clientView(plan: Plan): Plan {
  const clone: Plan = JSON.parse(JSON.stringify(plan));
  clone.audience = 'client';
  clone.margin = null;
  // never expose internal buffer, BCS, margins, internal-only assumptions, internal CPM end
  clone.assumptions = clone.assumptions.filter((a) => !a.internalOnly);
  // the client sees which milestones are due and when, never the internal readiness working
  clone.modules.raMilestones = clone.modules.raMilestones.map((m) => ({
    ...m,
    checkpoints: m.checkpoints.map((c) => ({ ...c, responsibility: '', remarks: '', activityId: null, activityName: null })),
    remarks: '',
  }));
  // procurement carries no money at all now, but vendor and internal remarks stay internal
  clone.modules.procurement = clone.modules.procurement.map((x) => ({ ...x, vendor: '', remarks: '', basis: '' }));
  clone.buffer = { ...clone.buffer, internalBufferDays: 0 };
  clone.ieInvariant = { externalEnd: clone.ieInvariant.externalEnd, internalEnd: null, bufferCalendarDays: null, holds: clone.ieInvariant.holds };
  clone.internal = null;
  // float, late dates, critical-path flags, crew loading and cost shares are internal planning
  // artefacts — the client baseline shows committed dates only.
  clone.modules.timeline.criticalPath = [];
  clone.modules.timeline.activities = clone.modules.timeline.activities.map((a) => ({
    id: a.id, name: a.name, phase: a.phase, trade: a.trade,
    duration: a.duration, deps: [], crew: { value: 0, provenance: 'computed', source: 'withheld from client view' },
    isMilestone: a.isMilestone, packageCode: a.packageCode,
    es: 0, ef: 0, ls: 0, lf: 0, totalFloat: 0, critical: false,
    startDate: a.startDate, endDate: a.endDate,
  }));
  clone.modules.timeline.phases = clone.modules.timeline.phases.map((p) => ({ ...p, critical: false }));
  // manpower loading is an internal resourcing matter
  clone.modules.manpower = { days: [], peak: 0, peakDate: null, averageDaily: 0, totalManDays: 0, trades: [], smoothness: 1, warnings: [] };
  clone.modules.resources = [];
  clone.modules.todos = clone.modules.todos.filter((t) => t.category === 'design');
  return clone;
}
