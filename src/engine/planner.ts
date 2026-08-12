// Orchestrator: inputs + norms -> canonical plan (8 modules), I/E views.
// All dates come from the CPM engine / contract arithmetic — never guessed.
import type { CpmResult, EngineConfig, ProjectInputs, ScheduledActivity, Traced } from '../domain/types';
import { computeCpm } from './cpm';
import { addCalendarDays, parseIso } from './calendar';
import { deriveWbs, applyDesignTradeHints } from './wbs';
import { levelManpower, type ManpowerPlan } from './manpower';
import { buildDependencyTracker, buildDesignTracker, buildProcurementTracker, buildRaTracker, buildTodoTracker } from './trackers';
import { buildMaterialTracker } from './materials';
import { summariseDesign, summariseMaterials, type DependencyRow, type DesignRow, type DesignSummary, type MaterialRow, type MaterialSummary, type ProcurementRow, type RaMilestoneRow, type TodoRow } from '../domain/trackers';
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
  internal: {
    start: string;
    end: string;
    durationWorkingDays: number;
    /** internal target finish, when one has been set in settings */
    target: string | null;
    /** CPM finish minus target, in calendar days. Positive = late against the target. */
    varianceDays: number | null;
  } | null;
  external: { start: string; end: string; milestones: { code: string; date: string; percent: number; description: string }[] } | null;
  ieInvariant: { externalEnd: string | null; internalEnd: string | null; bufferCalendarDays: number | null; holds: boolean };
  modules: {
    timeline: { activities: ScheduledActivity[]; criticalPath: string[]; phases: { name: string; start: string; end: string; critical: boolean }[] };
    manpower: ManpowerPlan;
    resources: { role: string; count: Traced<number> }[];
    procurement: ProcurementRow[];
    /** what has to physically land at site, one level below the procurement packages */
    materials: { rows: MaterialRow[]; summary: MaterialSummary };
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

export interface ExternalDelay {
  /** exact activity id — resolved by the caller (see services/replan/apply.ts), which has the
   * baseline schedule needed to turn a relative "delayed by N days" into this absolute floor */
  activityId: string;
  /** working days from project start; the activity may not start earlier than this */
  minStartWorkingDay: number;
  reason: string;
}

export function buildPlan(p: ProjectInputs, cfg: EngineConfig, today: string, externalDelays: ExternalDelay[] = []): Plan {
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
  // Item 3: sharpen 'general'-fallback trade classification using drawing/3D references, before
  // anything downstream (WBS, procurement, materials) groups by trade. Reassigning p here means
  // every later p.boqPackages read in this function sees the corrected trade — deliberately a
  // single correction point rather than patching each consumer separately.
  const { packages: correctedBoq, notes: designHintNotes } = applyDesignTradeHints(p.boqPackages, p.designRefs);
  p = { ...p, boqPackages: correctedBoq };
  for (const n of designHintNotes) assumptions.push({ area: 'design-refs', text: n, internalOnly: false });

  // Item 5: sales KT / email thread context is qualitative only — it never drives a date or
  // quantity, by design (a client preference is not a quantity). Surfaced purely as read context
  // for whoever reviews the plan, same as any other internal-only note.
  for (const s of p.scopeNotes) assumptions.push({ area: 'scope', text: `${s.area}: ${s.note} (${s.source})`, internalOnly: true });

  // A BOQ without a supplied schedule is still plannable: derive the WBS from scope.
  let sourceActivities = p.scheduleActivities;
  if (!sourceActivities.length && prov.boq && p.boqPackages.length && p.contractStart) {
    const wbs = deriveWbs(p.boqPackages, p.contractDurationCalDays?.value ?? null, p.siteConditions);
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
      materials: {
        rows: [],
        summary: { items: 0, delivered: 0, inTransit: 0, awaiting: 0, shortOnSite: 0, orderOverdue: 0, clientSupplied: 0, nextRequired: null },
      },
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

  // Actual dates beat contract dates. A contract says "start 8-Jun for 75 days"; site may have
  // started a week late, and every downstream date has to move with it rather than the plan
  // quietly describing a project that is not happening.
  const d = cfg.dates ?? {};
  const contractStart = p.contractStart!;
  const start = d.internalStart || contractStart;
  // Anchored to the CONTRACT, not to the internal start. If site began two weeks late that is
  // an internal fact; the date the client is held to does not move unless it is renegotiated —
  // and the resulting squeeze is exactly what the buffer and the I/E invariant should show.
  const clientStart = d.clientStart || contractStart;
  if (d.internalStart && d.internalStart !== contractStart)
    assumptions.push({
      area: 'schedule',
      text: `Internal baseline re-anchored to the actual start ${d.internalStart} (contract says ${contractStart}); every internal date is computed from it.`,
      internalOnly: false,
    });
  // ----- Module 1: timeline (internal = CPM) -----
  // Site work-mode changes productivity, so both activity durations AND the overlap
  // lags between them stretch — otherwise the network shape would freeze and a slower
  // work mode would understate the finish date.
  const f = cfg.calendar.workModeFactor;
  let scaled = sourceActivities.map((a) => ({
    ...a,
    duration: f === 1 ? a.duration : comp(Math.ceil(a.duration.value * f), `${a.duration.source} × workModeFactor ${f}`),
    deps: f === 1 ? a.deps : a.deps.map((d) => ({ ...d, lag: Math.round(d.lag * f) })),
  }));
  if (f !== 1)
    assumptions.push({ area: 'schedule', text: `Site work mode factor ${f} applied to every activity duration and dependency lag (${f < 1 ? 'day & night working' : 'restricted daytime working'}).`, internalOnly: false });

  // Replanning constraint: an absolute "may not start before working day N" floor, resolved by
  // the caller from a relative delay against the baseline schedule (see replan/apply.ts) — this
  // function only applies the floor, it never interprets "delayed by N days" itself, so there's
  // no ambiguity about what N days is relative to. Implemented as an FS dependency on a
  // zero-duration anchor, same mechanism every other dependency in this engine already uses.
  // CPM's forward pass just takes the max across all of an activity's deps, so this only pushes
  // a start out when the floor is actually binding; it never shortens anything.
  if (externalDelays.length) {
    const ANCHOR_ID = '__replan_anchor__';
    let anchorNeeded = false;
    scaled = scaled.map((a) => {
      const hit = externalDelays.find((d) => d.activityId === a.id);
      if (!hit) return a;
      anchorNeeded = true;
      assumptions.push({
        area: 'replan',
        text: `"${a.name}" (${a.trade}) held to start no earlier than working day ${hit.minStartWorkingDay} from project start — ${hit.reason}`,
        internalOnly: false,
      });
      return { ...a, deps: [...a.deps, { pred: ANCHOR_ID, type: 'FS' as const, lag: hit.minStartWorkingDay }] };
    });
    if (anchorNeeded) {
      scaled = [
        {
          id: ANCHOR_ID, name: 'Replan constraint anchor', phase: 'Replan', trade: 'general',
          duration: { value: 0, provenance: 'computed', source: 'replan anchor, zero duration' },
          deps: [], crew: { value: 0, provenance: 'computed', source: 'replan anchor' }, isMilestone: true,
        },
        ...scaled,
      ];
    }
  }

  const cpm: CpmResult = computeCpm(scaled, start, cfg.calendar);
  const internalEnd = cpm.activities.reduce((m, a) => (a.endDate > m ? a.endDate : m), start);

  const contractEnd = p.contractDurationCalDays ? addCalendarDays(clientStart, p.contractDurationCalDays.value) : internalEnd;
  const externalEnd = d.clientEnd || contractEnd;
  if (d.clientEnd && d.clientEnd !== contractEnd)
    assumptions.push({
      area: 'schedule',
      text: `Client baseline finish set to ${d.clientEnd} rather than the contract's ${contractEnd}.`,
      internalOnly: false,
    });
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

  // An internal target is reported as a variance, never used to compress durations: shortening
  // work to hit a date would be inventing a pace nothing supports.
  const target = d.internalEnd || null;
  const varianceDays = target ? Math.round((parseIso(internalEnd).getTime() - parseIso(target).getTime()) / 86400000) : null;
  if (target && varianceDays !== null && varianceDays > 0)
    assumptions.push({
      area: 'schedule',
      text: `CPM finish ${internalEnd} is ${varianceDays}d past the internal target ${target}. The engine does not compress durations to meet a date — recover it by crashing critical-path trades or re-sequencing.`,
      internalOnly: true,
    });
  base.internal = { start, end: internalEnd, durationWorkingDays: cpm.projectDurationDays, target, varianceDays };
  base.external = {
    start: clientStart,
    end: externalEnd,
    milestones: p.milestones.map((m) => ({ code: m.code, date: addCalendarDays(clientStart, m.dayOffset), percent: m.percent, description: m.description })),
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
  const designRows = buildDesignTracker(cpm.activities, today, p.boqPackages);
  base.modules.design = { rows: designRows, summary: summariseDesign(designRows) };

  base.modules.procurement = buildProcurementTracker(p, cpm.activities, designRows, today, overrides);
  for (const pr of base.modules.procurement)
    if (!pr.feeds)
      assumptions.push({ area: 'procurement', text: `Package "${pr.category}" has no mapped site activity; order-by date not computed.`, internalOnly: true });

  // Materials sit one level below procurement: the package says when to order, this says which
  // physical items that package puts on site, on what date, and who is bringing them.
  const materialRows = buildMaterialTracker(p, cpm.activities, base.modules.procurement, designRows, today, start);
  base.modules.materials = { rows: materialRows, summary: summariseMaterials(materialRows, today) };
  // Reported as one finding, not one per row: on a compressed fit-out a whole band of long-lead
  // items is unorderable inside the programme, and thirty near-identical notes bury everything
  // else. The rows themselves carry the detail.
  const unworkable = materialRows.filter((m) => m.issues.length);
  if (unworkable.length)
    assumptions.push({
      area: 'materials',
      text: `${unworkable.length} of ${materialRows.length} site materials cannot be ordered inside the programme as scheduled — their lead times run behind the site start, so they had to be released at award. Longest exposure: ${unworkable
        .slice()
        .sort((a, b) => b.leadDays - a.leadDays)
        .slice(0, 3)
        .map((m) => `${m.item} (${m.leadDays}d lead, order-by ${m.orderBy})`)
        .join('; ')}.`,
      internalOnly: true,
    });

  base.modules.todos = buildTodoTracker(cpm.activities, base.modules.procurement, designRows, today, start);
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
export function clientView(plan: Plan, today: string = new Date().toISOString().slice(0, 10)): Plan {
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
  // The site material register is an internal working document — vendors, POs, storage bays and
  // GRN notes. The client's stake in it is the material THEY owe us, so the client view keeps
  // the free-issue rows and nothing else, redacted the same way procurement is.
  const freeIssue = clone.modules.materials.rows
    .filter((m) => m.supply === 'client')
    .map((m) => ({ ...m, vendor: '', poNumber: '', remarks: '', basis: '', storage: '', issues: [] }));
  clone.modules.materials = { rows: freeIssue, summary: summariseMaterials(freeIssue, today) };
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
