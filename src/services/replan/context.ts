// Builds the project-status context handed to the replan agent for general questions.
//
// Full-fidelity by design — every row of every tracker goes in, not a count or a top-10 sample.
// BUT encoded as compact tables (column names declared once, each row a plain array in that
// column order) rather than an array of objects repeating every field name on every row. That
// distinction is the entire point of this file: the same 216-activity/79-material/111-todo
// Emirates project that came to ~55K tokens as array-of-objects comes to ~16K tokens as
// array-of-arrays — because Groq enforces a tokens-per-minute RATE LIMIT per model/tier that is
// separate from (and, on this account, far tighter than) the model's context window. A live
// call against openai/gpt-oss-20b on this account errored with "Limit 8000, Requested 65915" —
// that 8000 is the account's per-minute allowance for that model, not the model's real capacity
// (128K). Whichever model ends up calling this (see groq-agent.ts), keeping the payload lean
// matters far more than the model's advertised context window suggests it should.
//
// Still reuses buildCockpit() for the health/RAG/KPI framing (so "what's the status" headline
// never drifts from what the Cockpit tab shows), then lays the compact tables on top of that for
// everything more specific than the headline. See prompts.ts for how the column/row shape is
// explained to the model.
import type { Plan } from '../../engine/planner';
import { buildCockpit } from '../../engine/cockpit';

const SAFETY_CAP = 500; // rows per table; none of SKF/Emirates/Kohler come close to this

interface Table { columns: string[]; rows: unknown[][]; truncatedBy?: number }

function table(columns: string[], rows: unknown[][]): Table {
  if (rows.length <= SAFETY_CAP) return { columns, rows };
  return { columns, rows: rows.slice(0, SAFETY_CAP), truncatedBy: rows.length - SAFETY_CAP };
}

export function buildProjectSummary(plan: Plan, today: string): Record<string, unknown> {
  const cockpit = buildCockpit(plan, today);
  const m = plan.modules;
  const nameById = new Map(m.timeline.activities.map((a) => [a.id, `${a.name} [${a.trade}]`]));

  return {
    project: {
      name: plan.project.name,
      client: plan.project.client,
      location: plan.project.location,
      status: plan.project.status,
      areaSft: plan.project.areaSft?.value ?? null,
      contractValue: plan.project.contractValue?.value ?? null,
      missingInputs: plan.missingInputs,
      assumptions: plan.assumptions.map((a) => a.text),
    },
    // headline framing — same RAG/KPI logic the Cockpit tab renders, so "what's the status"
    // never disagrees with what the person sees on that tab
    health: { rag: cockpit.rag, score: cockpit.health, headline: cockpit.headline },
    kpis: cockpit.kpis.map((k) => `${k.label}: ${k.value} (${k.sub})`),
    exceptions: cockpit.exceptions.map((e) => `[${e.severity}/${e.area}] ${e.title} — ${e.detail}`),

    schedule: {
      internalStart: plan.internal?.start ?? null,
      internalEnd: plan.internal?.end ?? null,
      internalTargetFinish: plan.internal?.target ?? null,
      varianceDaysVsTarget: plan.internal?.varianceDays ?? null,
      clientCommitmentEnd: plan.ieInvariant.externalEnd,
      clientCommitmentHolds: plan.ieInvariant.holds,
    },
    phases: m.timeline.phases,
    criticalPathActivities: m.timeline.criticalPath.map((id) => nameById.get(id) ?? id),

    // schedule / Gantt / PERT — one row per activity, what a Gantt bar shows
    activities: table(
      ['name', 'trade', 'start', 'end', 'critical', 'floatWorkingDays'],
      m.timeline.activities.map((a) => [a.name, a.trade, a.startDate, a.endDate, a.critical, a.totalFloat]),
    ),

    materialsSummary: m.materials.summary,
    materials: table(
      ['item', 'category', 'status', 'supply', 'orderBy', 'requiredOnSite', 'expectedDelivery', 'vendor', 'issues'],
      m.materials.rows.map((r) => [r.item, r.category, r.status, r.supply, r.orderBy, r.requiredOnSite, r.expectedDelivery, r.vendor || null, r.issues]),
    ),

    designSummary: m.design.summary,
    design: table(
      ['drawingName', 'category', 'criticality', 'readyBy', 'statusInternal', 'approvalBy', 'statusClient', 'issues'],
      m.design.rows.map((r) => [r.drawingName, r.category, r.criticality, r.readyBy, r.statusInt, r.approvalBy, r.statusClient, r.issues]),
    ),

    procurement: table(
      ['category', 'subCategory', 'criticality', 'longLead', 'orderBy', 'deliveryRequired', 'vendor', 'orderStatus', 'deliveryStatus'],
      m.procurement.map((r) => [r.category, r.subCategory, r.criticality, r.longLead, r.orderBy, r.deliveryRequired, r.vendor || null, r.orderStatus, r.deliveryStatus]),
    ),

    todos: table(
      ['description', 'category', 'priority', 'status', 'startDate', 'endDate', 'revisedDate', 'responsibility'],
      m.todos.map((t) => [t.description, t.category, t.priority, t.status, t.startDate, t.endDate, t.revisedDate, t.responsibility]),
    ),

    dependencies: table(
      ['area', 'description', 'responsibility', 'planDate', 'actualDate', 'status', 'blocks'],
      m.dependencies.map((d) => [d.area, d.description, d.responsibility, d.planDate, d.actualDate, d.status, d.blocks]),
    ),

    raMilestones: m.raMilestones.map((r) => ({
      code: r.code, percent: r.percent, dueDate: r.dueDate, revisedDate: r.revisedDate,
      status: r.status, readiness: r.readiness,
      checkpoints: table(
        ['description', 'group', 'plannedDate', 'status'],
        r.checkpoints.map((c) => [c.description, c.group, c.plannedDate, c.status]),
      ),
    })),

    manpower: {
      peak: m.manpower.peak, peakDate: m.manpower.peakDate, averageDaily: m.manpower.averageDaily,
      warnings: m.manpower.warnings, trades: m.manpower.trades,
    },
    resources: m.resources.map((r) => `${r.role}: ${r.count.value}`),
  };
}