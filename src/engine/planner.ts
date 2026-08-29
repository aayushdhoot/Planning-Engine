// Orchestrator: inputs + norms -> canonical plan (8 modules), I/E views.
// All dates come from the CPM engine / contract arithmetic — never guessed.
import type { CpmResult, EngineConfig, ProjectInputs, ScheduledActivity, Traced } from '../domain/types';
import { computeCpm } from './cpm';
import { addCalendarDays, parseIso } from './calendar';
import { deriveWbs, applyDesignTradeHints } from './wbs';
import { applyEditsToActivities, type ScheduleEdits } from './schedule-edits';
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
  /**
   * Is the internal finish inside the client date, and is the gap a sane size?
   *
   * `holds` answers only the first, and answering only the first is how a six-day programme
   * against a ninety-day contract reported "invariant holds": it does hold, and it means
   * nothing. `state` carries the reading a person needs — a buffer can be wrong at both ends.
   */
  ieInvariant: {
    externalEnd: string | null;
    internalEnd: string | null;
    bufferCalendarDays: number | null;
    holds: boolean;
    /** breach: past the client date · tight: under the policy minimum · ok: inside policy ·
     *  implausible: further inside the contract than the policy maximum, which on a derived
     *  programme almost always means the BOQ did not drive the durations */
    state: 'breach' | 'tight' | 'ok' | 'implausible';
  };
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

export function buildPlan(
  p: ProjectInputs,
  cfg: EngineConfig,
  today: string,
  externalDelays: ExternalDelay[] = [],
  /**
   * Hand edits to the programme. Optional, and empty for every caller that has
   * none, so this stays the same function the tests and the report scripts call.
   */
  edits: ScheduleEdits = {},
): Plan {
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
  // null when the schedule came in ready-made: an ingested programme carries its own durations,
  // and this question is only ever about the ones the engine derived from a BOQ.
  let wbsValueDriven: boolean | null = null;
  if (!sourceActivities.length && prov.boq && p.boqPackages.length && p.contractStart) {
    /**
     * A TRADE CANNOT BE COMPLETE BEFORE THE JOB HAS STARTED.
     *
     * Site-condition readings delete work from the programme: a trade read as
     * complete is skipped outright, and one read as part-done is shrunk. That is
     * right on a live site and nonsense on one that has not opened, and the
     * difference was not being checked.
     *
     * Two new projects showed what that costs. Both started on the day they were
     * planned, so nothing on either site could have been built yet — and both had
     * hundreds of "already complete" readings taken by the vision reader from
     * photographs in their Drive folders. A model cannot tell a 3D render, a
     * reference interior or a photograph of somebody else's finished office from
     * a photograph of this job finished; nor should it have to. Eight of sixteen
     * trades were struck off each programme. A 56,000 sft fit-out came out with 31
     * activities and a peak of 41 workers where a comparable 26,000 sft job with
     * its trades intact needs 124, and the schedule was quietly costed and
     * resourced for half a job.
     *
     * The readings are still kept and still shown — they are what the folder
     * contains, and on a running project they are exactly what should shape the
     * plan. They simply cannot subtract work from a programme that has not begun.
     */
    // STRICTLY before: on the first day of a job, no day of work has been done
    // yet. Both projects that exposed this start on the very day they were being
    // planned, so `<=` would have called them under way and changed nothing.
    const started = p.contractStart < today;
    const shaping = started ? p.siteConditions : [];
    const dropped = p.siteConditions.filter((s) => s.status === 'complete' || s.status === 'in_progress').length;
    if (!started && dropped) {
      const trades = [...new Set(p.siteConditions.filter((s) => s.status !== 'not_started').map((s) => s.trade))];
      assumptions.push({
        area: 'wbs',
        internalOnly: false,
        text: `${dropped} site reading(s) across ${trades.length} trade(s) (${trades.join(', ')}) report work already done, but the project does not start until ${p.contractStart} and today is ${today}. They have NOT been allowed to remove work from the programme — nothing can be built before the job opens. If these photographs are of this site and the work is genuinely done, move the contract start back and re-plan.`,
      });
    }
    const wbs = deriveWbs(p.boqPackages, p.contractDurationCalDays?.value ?? null, shaping);
    sourceActivities = wbs.activities;
    wbsValueDriven = wbs.valueDriven;
    for (const n of wbs.notes) assumptions.push({ area: 'wbs', text: n, internalOnly: false });
  }

  /**
   * Hand edits go on here — AFTER the derivation above and BEFORE the fit below.
   *
   * After, because until the WBS has run there may be no activities to edit, and
   * an overlay applied to an empty list is where every edit to a derived
   * programme used to disappear. It also matters that an activity ADDED by hand
   * cannot be what makes `sourceActivities` non-empty: that would read as "this
   * project came with a schedule" and skip the derivation of the other sixty-odd
   * rows entirely.
   *
   * Before, because a hand-set duration has to be visible to the fit — which
   * leaves it alone, and has to reach the contract date using the rest.
   */
  if (Object.keys(edits).length) sourceActivities = applyEditsToActivities(sourceActivities, edits);
  /**
   * Does the BOQ describe the contract it is filed against?
   *
   * The check that would have caught Keppel (Pune) at the door. Its BOQ came through as
   * ₹4.46 lakh of packages against a contract worth ₹8.75 crore — half a percent of the job —
   * because the priced BOQ never actually read and what survived was a handful of stray rows.
   * Everything downstream then behaved correctly on those numbers and produced a six-day
   * programme for a ninety-day contract.
   *
   * Two figures the engine already had, never compared. A BOQ is the priced description of the
   * contract; when the two totals are an order of magnitude apart, one of them is wrong, and it
   * is not a question the schedule can answer for itself further down.
   */
  const boqTotal = p.boqPackages.reduce((s, x) => s + x.clientAmount.value, 0);
  const contractVal = p.contractValue?.value ?? null;
  const boqCoverage = contractVal && contractVal > 0 && boqTotal > 0 ? boqTotal / contractVal : null;
  const boqUnderstatesContract = boqCoverage != null && boqCoverage < 0.5;
  if (boqCoverage != null && (boqCoverage < 0.5 || boqCoverage > 2)) {
    // Below par reads best as a percentage ("only 0.5% of the job"); above par as a multiple
    // ("2.3× the job"). The same number either way, said the way a person would say it.
    const size = boqCoverage < 1
      ? `only ${Math.round(boqCoverage * 1000) / 10}% of the job`
      : `${Math.round(boqCoverage * 10) / 10}× the job`;
    assumptions.push({
      area: 'inputs',
      text:
        `The BOQ totals ₹${Math.round(boqTotal).toLocaleString('en-IN')} against a contract value of ₹${Math.round(contractVal!).toLocaleString('en-IN')} — ${size}. ` +
        (boqCoverage < 0.5
          ? 'Durations, manpower and procurement are all computed from package value, so a BOQ this far short of the contract produces a programme far shorter than the work. Read the priced BOQ properly before using this plan.'
          : 'A BOQ larger than the contract usually means totals or roll-up rows were counted twice. Check the package list before using this plan.'),
      internalOnly: false,
    });
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
    ieInvariant: { externalEnd: null, internalEnd: null, bufferCalendarDays: null, holds: true, state: 'ok' },
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
  /**
   * ---- FIT THE PROGRAMME TO THE CONTRACT ----
   *
   * The contract duration used to do exactly one thing: set the client's end date. It never
   * touched the programme. So a project head who typed 60 days got a 131-day CPM and a
   * 71-day breach, and one who typed 90 got a 5-day CPM and 85 days of buffer — in both cases
   * the engine had been told the answer and computed straight past it.
   *
   * The work-content CPM is the honest answer to "how long is this job", and it is not thrown
   * away here. What happens is what a planner does with it: the network keeps its shape, its
   * logic and its relative trade weights, and every duration is scaled by one factor until the
   * finish lands on the contract. That is the arithmetic of putting proportionally more people
   * on each trade, and it is bounded — `norms.scheduleFit.maxCompression` is where "add
   * manpower" stops being a plan and starts being a wish. When the bound binds, the residual
   * gap is reported rather than absorbed: the date moves, or the scope does.
   *
   * THIS RUNS BEFORE THE WORK-MODE FACTOR, and that ordering is the whole of its honesty.
   * Fitting afterwards would let compression quietly cancel a site constraint the user had just
   * declared: restricted daytime working would stretch the programme and the fit would pull it
   * straight back, so the setting looked inert and a real risk vanished. Fit answers "how do we
   * staff this to hit the contract"; the work mode is then applied to that answer, and if it
   * pushes the finish past the client date, that breach is exactly what should be shown.
   *
   * The two directions are not symmetric, deliberately:
   *   - Compressing an over-run is always attempted. That is real planning.
   *   - STRETCHING an under-run happens only when the durations are already known to be
   *     meaningless — a BOQ that never read, every trade sitting on the floor. Padding a sound
   *     programme to fill its contract would be inventing work, and a job that genuinely
   *     finishes early is allowed to finish early.
   */
  const fitPolicy = norms.scheduleFit as { maxCompression: number; maxExpansion: number; maxIterations: number };
  const calDays = (from: string, to: string) => Math.round((parseIso(to).getTime() - parseIso(from).getTime()) / 86400000);
  const contractEndFromDuration = p.contractDurationCalDays ? addCalendarDays(clientStart, p.contractDurationCalDays.value) : null;
  const externalTarget = d.clientEnd || contractEndFromDuration;
  // The internal programme aims to land the buffer short of the client date, not on it.
  const internalTargetEnd = externalTarget ? addCalendarDays(externalTarget, -Math.max(0, cfg.buffer.internalBufferDays)) : null;
  const durationsAreMeaningless = wbsValueDriven === false || boqUnderstatesContract;
  // Set by the fit below: the factor it settled on, and whether its bound stopped it short of
  // the target. A large buffer that the fit could not close is a different thing from one a
  // declared work-mode change deliberately bought.
  let fitApplied: number | null = null;
  let fitBounded = false;

  if (internalTargetEnd && sourceActivities.length && !mandatoryMissing) {
    const bare = computeCpm(sourceActivities, start, { ...cfg.calendar, workModeFactor: 1 });
    const bareEnd = bare.activities.reduce((m, a) => (a.endDate > m ? a.endDate : m), start);
    const targetSpan = Math.max(1, calDays(start, internalTargetEnd));
    const achievedSpan = Math.max(1, calDays(start, bareEnd));
    const wanted = targetSpan / achievedSpan;
    /**
     * Both directions, unconditionally.
     *
     * Stretching used to require the durations to be known-meaningless, on the reasoning that
     * padding a sound programme would be inventing work. That reasoning was wrong, and Snitch
     * (Bengaluru) is why: a perfectly good BOQ produced 22 working days against a 90-day
     * contract, and the engine left it there with 69 days of buffer and "invariant holds" — a
     * plan that finishes in a quarter of its window and then stands idle for the rest.
     *
     * Stretching invents nothing, because the crew below moves inversely to the duration: the
     * same man-days, spread over more days, with smaller gangs. That is not padding, it is
     * levelling into the window the contract actually gives — and it is the cheaper, more
     * staffable plan. The work-content CPM at norm crew sizes says how fast the job COULD be
     * done with as many people as the norms assume; it was never a reason to promise that date.
     */
    if (Math.abs(wanted - 1) > 0.05) {
      // Iterated rather than solved: overlap lags and the working calendar both make the finish
      // a non-linear function of the durations, so one multiply lands near the target and a few
      // cheap re-runs land on it. Never below one day — an activity that exists takes a day.
      const clamp = (x: number) => Math.min(fitPolicy.maxExpansion, Math.max(fitPolicy.maxCompression, x));
      let factor = clamp(wanted);
      let fitted = sourceActivities;
      let fittedEnd = bareEnd;
      /**
       * The closest attempt seen, not the last one tried.
       *
       * The loop used to keep whatever the final iteration produced, which is only the best
       * answer if the search happens to converge monotonically — and it does not. Every duration
       * has a one-working-day floor, so a programme of many short tasks barely moves for a while
       * and then jumps, and dividing by the error overshoots straight past the target. A 90-day
       * contract came back at 96 working days that way, reported as a breach, when an earlier
       * iteration had already landed within a day of it.
       */
      let best: { factor: number; fitted: typeof sourceActivities; end: string; err: number } | null = null;
      for (let i = 0; i < fitPolicy.maxIterations; i++) {
        const f2 = factor;
        /**
         * Rounding is spread across the tasks, not applied to each one on its own.
         *
         * Durations are whole days, so rounding each task independently makes the whole
         * programme a step function: with a template of one- and two-day tasks, ×1.5 and ×2.0
         * round identically and the finish jumps 31 → 63 → 95 calendar days with nothing in
         * between. A 90-day contract then has no factor that fits it, and the closest attempt
         * lands twelve days out and reports a breach.
         *
         * Carrying the remainder forward is the same largest-remainder idea an apportionment
         * uses: at ×1.5 half the one-day tasks become two days and half stay at one, so the
         * TOTAL scales smoothly even though every individual duration is still a whole number.
         */
        let durCarry = 0;
        let lagCarry = 0;
        const scaleDays = (d: number): number => {
          const exact = d * f2 + durCarry;
          const whole = Math.max(1, Math.round(exact));
          durCarry = exact - whole;
          return whole;
        };
        /**
         * The lags get the same treatment, and they are what actually mattered.
         *
         * Carrying only the durations was not enough: the finish still moved in plateaus of
         * 31 → 63 → 95 calendar days, because the critical path runs through the start-to-start
         * lags between trades and those were still being rounded one at a time. Carrying them
         * too turns the same search into 31 → 37 → 46 → 58 → 63 → 74 → 83, which is a curve a
         * contract date can actually be met on.
         */
        const scaleLag = (l: number): number => {
          const exact = l * f2 + lagCarry;
          const whole = Math.max(0, Math.round(exact));
          lagCarry = exact - whole;
          return whole;
        };
        fitted = sourceActivities.map((a) =>
          // A hand-set duration is exempt for the same reason a milestone is: there
          // is nothing here to estimate. The fit tunes durations it derived itself,
          // because against a norm the contract is the better evidence — but a
          // number somebody typed is not a norm, and scaling it back is how a
          // duration edited in the PERT editor used to revert on the next
          // recompute, silently, with the editor reporting the edit as accepted.
          a.isMilestone || a.duration.value === 0 || a.durationLocked
            ? a
            : {
                ...a,
                // Still 'computed' — it is, from the contract duration — because Provenance has
                // no weaker word and inventing one would ripple through the schema and the audit
                // trace. The source carries the distinction instead, and says which of the two
                // things each duration was computed FROM, which is the part a reader needs.
                duration: comp(
                  scaleDays(a.duration.value),
                  durationsAreMeaningless
                    ? `shaped to the ${p.contractDurationCalDays?.value ?? '—'}-day contract (×${f2.toFixed(3)}), NOT measured from the BOQ — ${a.duration.source}`
                    : `${a.duration.source} × schedule fit ${f2.toFixed(3)} to hit the contract finish`,
                ),
                /**
                 * The crew moves inversely, and this is not a detail.
                 *
                 * Scaling duration alone would have quietly deleted work: manpower and the
                 * S-curve both weight an activity by duration × crew, so halving a programme
                 * without touching its gangs halves the man-days the job is supposed to contain.
                 * The plan would then claim a shorter schedule AND less labour — free time, which
                 * is not a thing. Holding duration × crew constant is what makes the compression
                 * mean what its own note says it means: the same work, more people, less time.
                 *
                 * The invariant is per ACTIVITY, and only to the nearest whole worker — a gang
                 * cannot be 3.4 people and never drops below one. Site man-days, which is a
                 * different number, are levelled separately and do move: manpower.ts holds a
                 * minimum viable gang across each trade window, so a stretched programme really
                 * does cost more labour. That is true of real sites too, and is said out loud in
                 * the assumption rather than papered over here.
                 *
                 * Whether those people can actually be found is a separate question, and the
                 * manpower module answers it — its gang caps turn an over-aggressive fit into
                 * levelling warnings rather than into a silently impossible plan.
                 */
                crew: comp(
                  Math.max(1, Math.round(a.crew.value / f2)),
                  `${a.crew.source} ÷ schedule fit ${f2.toFixed(3)} — duration x crew held constant to the nearest whole worker while the programme was ${f2 < 1 ? 'compressed' : 'stretched'}`,
                ),
                deps: a.deps.map((dep) => ({ ...dep, lag: scaleLag(dep.lag) })),
              },
        );
        const trial = computeCpm(fitted, start, { ...cfg.calendar, workModeFactor: 1 });
        fittedEnd = trial.activities.reduce((m, a) => (a.endDate > m ? a.endDate : m), start);
        const err = calDays(start, fittedEnd) / targetSpan;
        if (!best || Math.abs(err - 1) < Math.abs(best.err - 1)) best = { factor: f2, fitted, end: fittedEnd, err };
        if (Math.abs(err - 1) <= 0.02) break;
        // Damped, not a straight division. The finish is a step function of the factor once
        // durations hit their one-day floor, so correcting by the full error oscillates around
        // the target instead of settling on it.
        const next = clamp(factor * Math.pow(1 / err, 0.6));
        if (Math.abs(next - factor) < 1e-9) break; // the bound is binding; stop pretending
        factor = next;
      }
      if (best) { factor = best.factor; fitted = best.fitted; fittedEnd = best.end; }
      sourceActivities = fitted;
      fitApplied = factor;

      const contractDays = p.contractDurationCalDays?.value ?? calDays(start, externalTarget!);
      const gap = calDays(start, fittedEnd) - targetSpan;
      // The gap is only "bounded out" if the bound is the reason for it — a couple of days of
      // rounding against the working calendar is the iteration converging, not a failure.
      fitBounded = Math.abs(gap) > 2;

      assumptions.push({
        area: 'schedule',
        text:
          wanted < 1
            ? `The work content gives ${achievedSpan} calendar days; the contract allows ${contractDays}. Every duration and lag was compressed by ×${factor.toFixed(2)}, with crews raised in proportion — the arithmetic of putting proportionally more people on each trade, so the work content per activity is unchanged. Check the manpower module before committing: this plan is only real if those crews can be staffed.`
            : durationsAreMeaningless
              ? `The BOQ did not give durations worth scheduling, so the programme was shaped to the ${contractDays}-day contract instead (×${factor.toFixed(2)}). Every duration below is that shape, not a measurement of this job — read the priced BOQ and re-plan to replace them.`
              : `At norm crew sizes the work content would finish in ${achievedSpan} calendar days, but the contract allows ${contractDays}. Rather than promise a date deep inside its own window and then stand idle, every duration and lag was stretched by ×${factor.toFixed(2)} with crews reduced in proportion, so the same work is spread across the period the contract actually gives at smaller and more staffable gangs. Note this is not free: manpower holds a minimum viable gang per trade across its window, so a longer programme carries more man-days on site for the same work content. If the shorter programme is genuinely wanted, shorten the contract duration — do not read this one as the cheaper plan.`,
        internalOnly: false,
      });

      if (fitBounded)
        assumptions.push({
          area: 'schedule',
          text:
            gap > 0
              ? `Compression stopped at the ×${fitPolicy.maxCompression} floor and the programme still finishes ${gap} calendar days past the internal target (${internalTargetEnd}). Past that point more manpower stops shortening the job. The date moves or the scope does — that decision is not the engine's to make.`
              : `Stretching stopped at the ×${fitPolicy.maxExpansion} ceiling and the programme still finishes ${-gap} calendar days short of the internal target (${internalTargetEnd}). A gap that large after the fit means the work content is a tiny fraction of the contract period — check the BOQ covers the whole scope.`,
          internalOnly: false,
        });
    }
  }

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
  const workingSpanCal = Math.max(1, Math.round((parseIso(internalEnd).getTime() - parseIso(start).getTime()) / 86400000));
  const bufferCal = Math.round((parseIso(externalEnd).getTime() - parseIso(internalEnd).getTime()) / 86400000);
  if (bufferCal < cfg.buffer.min)
    assumptions.push({ area: 'schedule', text: `Internal CPM finish (${internalEnd}) leaves only ${bufferCal}d buffer vs contract end (${externalEnd}) — below configured minimum ${cfg.buffer.min}d. Crash critical-path trades or renegotiate.`, internalOnly: true });

  /**
   * A buffer can be wrong at BOTH ends, and only one end was ever checked.
   *
   * Too little buffer is a squeeze and was reported. Too much is not good news — it is the
   * shape a programme takes when the inputs did not drive it. A ninety-day contract came back
   * with a six-day internal baseline and eighty-five days of buffer, and the screen said the
   * invariant held, because it does hold: the internal end really is before the external one.
   * What it does not mean is that the programme is credible.
   *
   * So the size is checked against the policy's own maximum, and the diagnosis leads with the
   * likeliest cause rather than the symptom — a plan whose durations all came off the floor is
   * a plan whose BOQ never arrived.
   */
  if (bufferCal > cfg.buffer.max) {
    const share = Math.round((bufferCal / Math.max(1, bufferCal + workingSpanCal)) * 100);
    assumptions.push({
      area: 'schedule',
      text:
        `Internal CPM finish (${internalEnd}) is ${bufferCal}d before the contract end (${externalEnd}) — ${share}% of the whole contract period sitting as buffer, against a configured maximum of ${cfg.buffer.max}d. ` +
        (boqUnderstatesContract || wbsValueDriven === false
          ? 'The BOQ did not drive these durations: every trade fell back to the minimum-share floor, so each activity is one day because there was no value to compute from, not because the work takes one day. Read the priced BOQ and re-plan before using any date here.'
          : 'A programme this far inside its contract period usually means the BOQ under-states the work rather than that the job is genuinely this short. Check the package values against the scope before committing to it.'),
      internalOnly: false,
    });
  }

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
  const holds = externalEnd >= internalEnd;
  base.ieInvariant = {
    externalEnd, internalEnd, bufferCalendarDays: bufferCal, holds,
    // A large buffer is only NOT CREDIBLE when there is a reason to distrust the durations.
    // Flagging it on size alone cried wolf on the honest case: a faster work mode legitimately
    // bought seventeen days on a project whose BOQ covered 99% of its contract, and the card
    // called that plan not credible. Finishing early is allowed to just be finishing early.
    state: !holds
      ? 'breach'
      : bufferCal < cfg.buffer.min
        ? 'tight'
        : bufferCal > cfg.buffer.max && (fitBounded || fitApplied === null)
          ? 'implausible'
          : 'ok',
  };
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
  // A schedule the BOQ never drove is not a 0.8-confidence plan with a footnote against it. It
  // is the norm sequence with one floored duration repeated through it, and the headline number
  // has to say so rather than average the fault away against nine present inputs.
  const scheduleScore = base.ieInvariant.state === 'ok' ? 1 : base.ieInvariant.state === 'tight' ? 0.5 : 0.3;
  const raw = 0.5 * (providedCount / 9) + 0.3 * (1 - unmapped / Math.max(1, p.boqPackages.length)) + 0.2 * scheduleScore;
  const notDriven = wbsValueDriven === false || boqUnderstatesContract;
  const score = Math.round(100 * (notDriven ? Math.min(raw, 0.35) : raw)) / 100;
  base.confidence = {
    score,
    basis:
      `${providedCount}/9 inputs provided; ${unmapped}/${p.boqPackages.length} packages unmapped; buffer ${bufferCal}d (${base.ieInvariant.state})` +
      (boqUnderstatesContract ? '; BOQ covers only ' + Math.round((boqCoverage ?? 0) * 1000) / 10 + '% of the contract value' : wbsValueDriven === false ? '; durations not driven by the BOQ' : '') + '.',
  };

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
  // The client sees whether the date is met, never how comfortably — "implausible" is a
  // judgement about our own inputs and belongs in the internal view only.
  clone.ieInvariant = {
    externalEnd: clone.ieInvariant.externalEnd, internalEnd: null, bufferCalendarDays: null,
    holds: clone.ieInvariant.holds, state: clone.ieInvariant.holds ? 'ok' : 'breach',
  };
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
