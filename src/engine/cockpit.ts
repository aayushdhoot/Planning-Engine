// Executive cockpit: one screen that answers "is this project alright, and if not, what do I
// do about it this week?"
//
// Two deliberate departures from the rest of the app:
//
//  1. It reports VARIANCE, not absolutes. "245 working days" tells an executive nothing;
//     "13 days past the client date" tells them everything.
//  2. It surfaces EXCEPTIONS, not inventories. The trackers already list everything. This
//     ranks the handful of things that need a decision and stays silent about the rest.
import type { Plan } from './planner';
import { buildSCurve, type SCurve } from './scurve';

export type Rag = 'green' | 'amber' | 'red';

export interface Kpi {
  key: string;
  label: string;
  /** the headline figure, already formatted */
  value: string;
  /** what it is measured against */
  sub: string;
  rag: Rag;
}

export interface Exception {
  id: string;
  severity: Rag;
  /** the module a click should take you to */
  area: 'schedule' | 'design' | 'procurement' | 'materials' | 'billing' | 'manpower';
  title: string;
  detail: string;
  /** activities/trades this exception concerns, for brushing */
  trades: string[];
}

export interface TradeRollup {
  trade: string;
  activities: number;
  start: string | null;
  end: string | null;
  /** 0..100 recorded progress, weighted by work content */
  percentComplete: number;
  /** activities past their planned finish with nothing recorded */
  behind: number;
  critical: number;
  manDays: number;
}

export interface Cockpit {
  rag: Rag;
  /** 0..100 — a blunt single number, and the reasons are always shown beside it */
  health: number;
  headline: string;
  kpis: Kpi[];
  exceptions: Exception[];
  trades: TradeRollup[];
  curve: SCurve;
}

const DAY = 86400000;
const days = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY);
const worst = (a: Rag, b: Rag): Rag => (a === 'red' || b === 'red' ? 'red' : a === 'amber' || b === 'amber' ? 'amber' : 'green');

export function buildCockpit(plan: Plan, today: string): Cockpit {
  const acts = plan.modules.timeline.activities;
  const curve = buildSCurve(acts, today);
  const kpis: Kpi[] = [];
  const exceptions: Exception[] = [];
  let n = 0;
  const flag = (e: Omit<Exception, 'id'>) => exceptions.push({ ...e, id: `x${++n}` });

  // ---------------------------------------------------------------- schedule
  const clientEnd = plan.ieInvariant.externalEnd;
  const internalEnd = plan.internal?.end ?? null;
  const buffer = plan.ieInvariant.bufferCalendarDays;
  const scheduleRag: Rag = buffer === null ? 'amber' : buffer < 0 ? 'red' : buffer < 7 ? 'amber' : 'green';
  kpis.push({
    key: 'schedule',
    label: 'Schedule',
    value: buffer === null ? '—' : `${buffer > 0 ? '+' : ''}${buffer} d`,
    sub: buffer === null ? 'no baseline' : buffer < 0 ? `past the client date of ${clientEnd}` : `buffer to ${clientEnd}`,
    rag: scheduleRag,
  });
  if (buffer !== null && buffer < 0)
    flag({
      severity: 'red',
      area: 'schedule',
      title: `Internal finish is ${Math.abs(buffer)} days past the client date`,
      detail: `CPM finishes ${internalEnd}; the client is held to ${clientEnd}. Recover it on the critical path or renegotiate the date.`,
      trades: [...new Set(acts.filter((a) => a.critical).map((a) => a.trade))],
    });

  // ---------------------------------------------------------------- progress
  const progressRag: Rag = curve.varianceToday <= -15 ? 'red' : curve.varianceToday < -5 ? 'amber' : 'green';
  kpis.push({
    key: 'progress',
    label: 'Progress',
    value: `${curve.varianceToday > 0 ? '+' : ''}${curve.varianceToday}%`,
    sub: `${curve.actualToday}% done vs ${curve.plannedToday}% planned`,
    rag: progressRag,
  });
  if (curve.actualToday === 0 && curve.plannedToday > 0)
    flag({
      severity: 'red',
      area: 'schedule',
      title: 'No progress has been recorded against any activity',
      detail: `The plan says ${curve.plannedToday}% should be complete. Until site records actuals, every progress figure here is unverified.`,
      trades: [],
    });

  // ---------------------------------------------------------------- design
  const design = plan.modules.design;
  const unworkable = design.rows.filter((d) => d.issues.length);
  const designRag: Rag = unworkable.length > 10 ? 'red' : unworkable.length ? 'amber' : 'green';
  kpis.push({
    key: 'design',
    label: 'Design approvals',
    value: `${design.summary.percentComplete}%`,
    sub: `${design.summary.approved} of ${design.summary.drawings} drawings approved`,
    rag: design.summary.percentComplete < 25 ? 'red' : design.summary.percentComplete < 60 ? 'amber' : 'green',
  });
  if (unworkable.length)
    flag({
      severity: designRag,
      area: 'design',
      title: `${unworkable.length} drawing deadlines cannot be met as scheduled`,
      detail: unworkable.slice(0, 3).map((d) => `${d.drawingName}: ${d.issues[0]}`).join(' '),
      trades: [],
    });

  // ---------------------------------------------------------------- procurement
  const proc = plan.modules.procurement;
  const longLead = proc.filter((p) => p.longLead);
  const lateLongLead = longLead.filter((p) => p.orderBy && p.orderBy < today);
  const procRag: Rag = lateLongLead.length ? 'red' : longLead.some((p) => p.orderBy && days(today, p.orderBy) <= 7) ? 'amber' : 'green';
  kpis.push({
    key: 'procurement',
    label: 'Long-lead orders',
    value: `${lateLongLead.length}`,
    sub: `past order-by, of ${longLead.length} long-lead packages`,
    rag: procRag,
  });
  for (const p of lateLongLead.slice(0, 3))
    flag({
      severity: 'red',
      area: 'procurement',
      title: `${p.category} is past its order-by date`,
      detail: `Order-by was ${p.orderBy} (${p.leadDays}d lead). It is needed on site by ${p.deliveryRequired}. Every day of delay now moves ${p.feeds ?? 'the dependent activity'}.`,
      trades: [],
    });

  // ---------------------------------------------------------------- materials
  // One level below procurement: a package can read "Partially Delivered" while the one board
  // the site is actually waiting on is the thing holding the floor up.
  const mat = plan.modules.materials;
  if (mat.rows.length) {
    const short = mat.rows.filter((m) => m.status !== 'Delivered' && m.requiredOnSite && m.requiredOnSite < today);
    const materialRag: Rag = short.length > 3 ? 'red' : short.length ? 'amber' : mat.summary.orderOverdue ? 'amber' : 'green';
    kpis.push({
      key: 'materials',
      label: 'Material Registry',
      value: `${short.length}`,
      sub: `short on site, of ${mat.summary.items} tracked materials`,
      rag: materialRag,
    });
    if (short.length)
      flag({
        severity: materialRag,
        area: 'materials',
        title: `${short.length} material${short.length === 1 ? '' : 's'} should already be on site`,
        detail: short
          .slice(0, 3)
          .map((m) => `${m.item} — needed ${m.requiredOnSite} for ${m.consumedBy ?? 'site'}`)
          .join('; ') + '.',
        trades: [],
      });
    const freeIssue = mat.rows.filter((m) => m.supply === 'client' && m.status !== 'Delivered' && m.orderBy && m.orderBy < today);
    if (freeIssue.length)
      flag({
        severity: 'amber',
        area: 'materials',
        title: `${freeIssue.length} client free-issue item${freeIssue.length === 1 ? '' : 's'} past the date they had to be ordered`,
        detail: `${freeIssue.slice(0, 3).map((m) => m.item).join(', ')}. These are not on our PO — raise them with the client, they land on the same site dates as everything else.`,
        trades: [],
      });
  }

  // ---------------------------------------------------------------- billing
  const ra = plan.modules.raMilestones;
  const overdueRa = ra.filter((m) => m.status !== 'Completed' && (m.revisedDate ?? m.dueDate) < today);
  const billed = ra.filter((m) => m.status === 'Completed').reduce((s, m) => s + m.percent, 0);
  const billingRag: Rag = overdueRa.length > 1 ? 'red' : overdueRa.length ? 'amber' : 'green';
  kpis.push({
    key: 'billing',
    label: 'Billed',
    value: `${Math.round(billed * 10) / 10}%`,
    sub: overdueRa.length ? `${overdueRa.length} milestone(s) overdue` : `${ra.length} RA milestones`,
    rag: billingRag,
  });
  for (const m of overdueRa.slice(0, 2))
    flag({
      severity: 'amber',
      area: 'billing',
      title: `${m.code} is past its due date and not billed`,
      detail: `Due ${m.dueDate} for ${m.percent}% of contract value. ${m.checkpoints.filter((c) => c.status === 'Completed').length} of ${m.checkpoints.length} sub-milestones are signed off.`,
      trades: [],
    });

  // ---------------------------------------------------------------- manpower
  const mp = plan.modules.manpower;
  if (mp.peak) {
    kpis.push({
      key: 'manpower',
      label: 'Peak manpower',
      value: String(mp.peak),
      sub: `avg ${mp.averageDaily} · smoothness ${mp.smoothness}`,
      rag: mp.smoothness < 0.4 ? 'amber' : 'green',
    });
    for (const w of mp.warnings.slice(0, 2))
      flag({ severity: 'amber', area: 'manpower', title: 'Trade cannot be levelled inside its gang cap', detail: w, trades: [] });
  }

  // ---------------------------------------------------------------- trades
  const behindOf = (trade: string) => acts.filter((a) => a.trade === trade && a.endDate < today && (a.percentComplete?.value ?? 0) < 100).length;
  const trades: TradeRollup[] = [...new Set(acts.map((a) => a.trade))]
    .map((trade) => {
      const own = acts.filter((a) => a.trade === trade);
      const manDays = own.reduce((s, a) => s + Math.max(1, a.duration.value) * Math.max(1, a.crew.value), 0);
      const done = own.reduce((s, a) => s + Math.max(1, a.duration.value) * Math.max(1, a.crew.value) * ((a.percentComplete?.value ?? 0) / 100), 0);
      return {
        trade,
        activities: own.length,
        start: own.reduce<string | null>((m, a) => (m === null || a.startDate < m ? a.startDate : m), null),
        end: own.reduce<string | null>((m, a) => (m === null || a.endDate > m ? a.endDate : m), null),
        percentComplete: manDays ? Math.round((done / manDays) * 100) : 0,
        behind: behindOf(trade),
        critical: own.filter((a) => a.critical).length,
        manDays,
      };
    })
    .sort((a, b) => b.manDays - a.manDays);

  // ---------------------------------------------------------------- headline
  const rag = kpis.reduce<Rag>((acc, k) => worst(acc, k.rag), 'green');
  const reds = exceptions.filter((e) => e.severity === 'red').length;
  const health = Math.max(0, Math.round(100 - reds * 18 - exceptions.filter((e) => e.severity === 'amber').length * 6));
  const headline =
    rag === 'green'
      ? 'On track against the client baseline.'
      : reds
        ? `${reds} issue${reds === 1 ? '' : 's'} need a decision now.`
        : 'Holding, with items to watch.';

  return {
    rag,
    health,
    headline,
    kpis,
    exceptions: exceptions.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'red' ? -1 : 1)),
    trades,
    curve,
  };
}
