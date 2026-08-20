// Branded PowerPoint decks. The client deck and the internal deck are different
// documents — different slides, different depth, different numbers (SPEC §5).
import PptxGenJS from 'pptxgenjs';
import type { Plan } from '../engine/planner';

const BRAND = { client: '0F6FFF', internal: 'C1121F' };
const INK = '14181F';
const MUTED = '5A6472';
const LINE = 'E2E7EE';

const inr = (n: number) => 'INR ' + n.toLocaleString('en-IN', { maximumFractionDigits: 0 });

type Pptx = InstanceType<typeof PptxGenJS>;
type Slide = ReturnType<Pptx['addSlide']>;

function newDeck(): Pptx {
  const p = new PptxGenJS();
  p.layout = 'LAYOUT_16x9';
  return p;
}

function titleBar(slide: Slide, text: string, brand: string) {
  slide.addShape('rect', { x: 0, y: 0, w: 13.33, h: 0.06, fill: { color: brand } });
  slide.addText(text, { x: 0.5, y: 0.3, w: 12.3, h: 0.5, fontSize: 22, bold: true, color: INK });
}

function kpis(slide: Slide, items: [string, string, string?][], brand: string, y = 1.05) {
  const w = 12.3 / items.length;
  items.forEach(([k, v, s], i) => {
    const x = 0.5 + i * w;
    slide.addShape('rect', { x, y, w: w - 0.15, h: 1.1, fill: { color: 'FFFFFF' }, line: { color: LINE, width: 1 } });
    slide.addShape('rect', { x, y, w: 0.05, h: 1.1, fill: { color: brand } });
    slide.addText(k.toUpperCase(), { x: x + 0.15, y: y + 0.08, w: w - 0.35, h: 0.25, fontSize: 8, color: MUTED, charSpacing: 1 });
    slide.addText(v, { x: x + 0.15, y: y + 0.32, w: w - 0.35, h: 0.4, fontSize: 17, bold: true, color: INK });
    if (s) slide.addText(s, { x: x + 0.15, y: y + 0.72, w: w - 0.35, h: 0.3, fontSize: 8, color: MUTED });
  });
}

/** Render one page of a table on the given slide. Pagination is handled explicitly
 *  (pptxgenjs autoPage misbehaves with styled header cells), so nothing is silently dropped. */
function tableOn(slide: Slide, head: string[], rows: string[][], y: number, colW?: number[]) {
  const body = [
    head.map((h) => ({ text: h, options: { bold: true, color: MUTED, fontSize: 9, fill: { color: 'F2F4F7' } } })),
    ...rows.map((r) => r.map((c) => ({ text: c ?? '', options: { fontSize: 9, color: INK } }))),
  ];
  slide.addTable(body, { x: 0.5, y, w: 12.3, colW, border: { type: 'solid', color: LINE, pt: 0.5 }, margin: 4 });
}

/** Chunk a long table across as many slides as it needs. */
function tableSlides(pptx: Pptx, title: string, head: string[], rows: string[][], brand: string, colW?: number[], perSlide = 15) {
  if (!rows.length) {
    const s = pptx.addSlide();
    titleBar(s, title, brand);
    s.addText('Nothing to report.', { x: 0.5, y: 1.1, w: 12.3, h: 0.4, fontSize: 12, color: MUTED });
    return;
  }
  const pages = Math.ceil(rows.length / perSlide);
  for (let i = 0; i < pages; i++) {
    const s = pptx.addSlide();
    titleBar(s, pages > 1 ? `${title} (${i + 1}/${pages})` : title, brand);
    tableOn(s, head, rows.slice(i * perSlide, (i + 1) * perSlide), 1.05, colW);
  }
}

function cover(pptx: Pptx, plan: Plan, audience: 'client' | 'internal') {
  const brand = BRAND[audience];
  const s = pptx.addSlide();
  s.addShape('rect', { x: 0, y: 0, w: 13.33, h: 1.4, fill: { color: brand } });
  s.addText(audience === 'client' ? 'CLIENT ISSUE · CONTRACT BASELINE' : 'INTERNAL — NOT FOR CLIENT ISSUE', {
    x: 0.6, y: 0.42, w: 12, h: 0.4, fontSize: 11, bold: true, color: 'FFFFFF', charSpacing: 2,
  });
  s.addText(plan.project.name, { x: 0.6, y: 1.9, w: 12, h: 0.9, fontSize: 40, bold: true, color: INK });
  s.addText(`${plan.project.client}  ·  ${plan.project.location}`, { x: 0.6, y: 2.8, w: 12, h: 0.4, fontSize: 14, color: MUTED });
  s.addText(
    audience === 'client'
      ? 'Project Programme'
      : `Execution Plan  ·  confidence ${Math.round(plan.confidence.score * 100)}%  ·  norms ${plan.engine.normsVersion}`,
    { x: 0.6, y: 3.3, w: 12, h: 0.4, fontSize: 14, color: brand, bold: true },
  );
  s.addText(`${plan.engine.name} v${plan.engine.version}`, { x: 0.6, y: 6.8, w: 12, h: 0.3, fontSize: 9, color: MUTED });
}

function pendingDeck(plan: Plan, audience: 'client' | 'internal'): Pptx {
  const pptx = newDeck();
  cover(pptx, plan, audience);
  const s = pptx.addSlide();
  titleBar(s, 'Pending inputs', BRAND[audience]);
  s.addText(
    audience === 'client'
      ? 'The programme has not yet been issued. The following inputs are required before a baseline can be published:'
      : 'No plan generated. The engine does not fabricate a baseline. Mandatory inputs missing:',
    { x: 0.5, y: 1.1, w: 12.3, h: 0.6, fontSize: 13, color: INK },
  );
  s.addText(plan.missingInputs.map((t) => ({ text: t, options: { bullet: true, fontSize: 12, color: INK } })), { x: 0.8, y: 1.8, w: 11.8, h: 4 });
  return pptx;
}

/** Client deck: committed dates, money in, what we need from them. No float, no cost, no buffer. */
export function clientDeck(plan: Plan): Pptx {
  if (plan.project.status === 'pending_inputs') return pendingDeck(plan, 'client');
  const brand = BRAND.client;
  const pptx = newDeck();
  cover(pptx, plan, 'client');
  const value = plan.project.contractValue?.value ?? 0;

  const s = pptx.addSlide();
  titleBar(s, 'Programme at a glance', brand);
  kpis(s, [
    ['Commencement', plan.external!.start],
    ['Contract completion', plan.external!.end, 'per agreement'],
    ['Area', plan.project.areaSft ? plan.project.areaSft.value.toLocaleString('en-IN') + ' sft' : '—'],
    ['Contract value', value ? inr(value) : '—', 'excl. taxes'],
  ], brand);
  tableOn(s, ['Phase', 'Start', 'Completion'], plan.modules.timeline.phases.map((p) => [p.name, p.start, p.end]), 2.4, [6.3, 3, 3]);

  tableSlides(pptx, 'Payment milestones', ['Stage', 'Target date', '%', 'Value', 'Scope covered'],
    plan.external!.milestones.map((m) => [m.code, m.date, `${m.percent}%`, inr(Math.round((m.percent / 100) * value)), m.description]),
    brand, [1, 1.5, 0.8, 1.8, 7.2], 8);

  tableSlides(pptx, 'What we need from you — client & builder inputs', ['Sr', 'Area', 'Description', 'Responsibility', 'Required by'],
    plan.modules.dependencies.map((d) => [String(d.sr), d.area, d.description, d.responsibility, d.planDate ?? '—']), brand, [0.7, 1.8, 5.6, 2.2, 2.0], 12);

  tableSlides(pptx, 'Design deliverables — approval dates', ['Category', 'Deliverable', 'Criticality', 'Approval by'],
    plan.modules.design.rows.map((d) => [d.category, d.drawingName, d.criticality, d.approvalBy ?? '—']), brand, [1.5, 6.4, 2.2, 2.2], 14);

  tableSlides(pptx, 'Procurement — delivery dates required on site', ['Package', 'Criticality', 'Delivery required'],
    plan.modules.procurement.map((i) => [i.category, i.criticality, i.deliveryRequired ?? '—']), brand, [7, 2.6, 2.7], 14);

  if (plan.modules.materials.rows.length)
    tableSlides(pptx, 'Material you supply to us — free issue', ['Material', 'Unit', 'Required on site', 'Status'],
      plan.modules.materials.rows.map((m) => [m.item, m.unit, m.requiredOnSite ?? '—', m.status]), brand, [6.2, 1.4, 2.4, 2.3], 12);

  tableSlides(pptx, 'Billing milestones', ['RA', 'Due', '%', 'Status'],
    plan.modules.raMilestones.map((m) => [m.code, m.dueDate, `${m.percent}%`, m.status]), brand, [2, 3.4, 2.4, 4.5], 14);

  return pptx;
}

/** Internal deck: CPM, float, buffer, cost, margin, cash position, actions. */
export function internalDeck(plan: Plan): Pptx {
  if (plan.project.status === 'pending_inputs') return pendingDeck(plan, 'internal');
  const brand = BRAND.internal;
  const pptx = newDeck();
  cover(pptx, plan, 'internal');
  const acts = plan.modules.timeline.activities;
  const cp = acts.filter((a) => a.critical);

  const s = pptx.addSlide();
  titleBar(s, 'Position', brand);
  kpis(s, [
    ['Internal target', plan.internal!.end, `${plan.internal!.durationWorkingDays} wd (CPM)`],
    ['Contract finish', plan.external!.end],
    ['Buffer', `${plan.ieInvariant.bufferCalendarDays}d`, plan.ieInvariant.holds ? 'invariant holds' : 'BREACH'],
    ['Critical', `${cp.length} / ${acts.length}`, 'zero float'],
    ['Peak manpower', String(plan.modules.manpower.peak), plan.modules.manpower.peakDate ?? ''],
    ['Margin', plan.margin ? `${plan.margin.value}%` : '—', `${plan.modules.raMilestones.length} RA milestones`],
  ], brand);
  s.addText(`Confidence basis: ${plan.confidence.basis}`, { x: 0.5, y: 2.3, w: 12.3, h: 0.3, fontSize: 10, color: MUTED });
  tableOn(s, ['Phase', 'Start', 'End', 'On critical path'],
    plan.modules.timeline.phases.map((p) => [p.name, p.start, p.end, p.critical ? 'YES' : '—']), 2.7, [5.3, 2.4, 2.4, 2.2]);

  tableSlides(pptx, `Critical path — ${cp.length} activities, zero float`, ['#', 'Activity', 'Trade', 'Dur', 'Start', 'Finish'],
    cp.map((a) => [a.id, a.name, a.trade, `${a.duration.value}d`, a.startDate, a.endDate]), brand, [0.8, 5.5, 1.6, 0.9, 1.75, 1.75], 14);

  tableSlides(pptx, 'Full activity schedule with float', ['#', 'Activity', 'Phase', 'Dur', 'Start', 'Finish', 'Float'],
    acts.map((a) => [a.id, a.name, a.phase, `${a.duration.value}d`, a.startDate, a.endDate, `${a.totalFloat}d`]),
    brand, [0.7, 4.4, 2.4, 0.8, 1.5, 1.5, 1.0], 16);

  tableSlides(pptx, 'Design tracker — GFC / MEP / Sampling',
    ['Category', 'Sub', 'Drawing', 'Crit', 'Ready by', 'Status (INT)', 'Approval by', 'Status (client)'],
    plan.modules.design.rows.map((d) => [d.category, d.subCategory, d.drawingName, d.criticality, d.readyBy ?? '—', d.statusInt, d.approvalBy ?? '—', d.statusClient]),
    brand, [1.1, 1.5, 3.9, 1.3, 1.2, 1.2, 1.1, 1.0], 15);

  tableSlides(pptx, 'Procurement — order-by and delivery required',
    ['Category', 'Sub', 'Criticality', 'Order by', 'Delivery required', 'Order status', 'Gated by'],
    plan.modules.procurement.map((i) => [i.category, i.subCategory, i.criticality, i.orderBy ?? '—', i.deliveryRequired ?? '—', i.orderStatus, i.gatedBy ?? '—']),
    brand, [2.2, 2.0, 1.4, 1.3, 1.6, 1.3, 2.5], 14);

  const mat = plan.modules.materials;
  const matSlide = pptx.addSlide();
  titleBar(matSlide, 'Material Registry — delivery register', brand);
  kpis(matSlide, [
    ['Materials tracked', String(mat.summary.items)],
    ['Short on site', String(mat.summary.shortOnSite), 'required date passed'],
    ['Past order-by', String(mat.summary.orderOverdue), 'lead time no longer fits'],
    ['Client free issue', String(mat.summary.clientSupplied), 'not on our PO'],
  ], brand);
  matSlide.addText(
    'One level below the procurement packages: each material is dated against the activity that consumes it, and carries the vendor or PO that brings it.',
    { x: 0.5, y: 2.3, w: 12.3, h: 0.3, fontSize: 10, color: MUTED },
  );
  tableSlides(pptx, 'Material register — order-by, delivery and supply route',
    ['Cost head', 'Material', 'Make', 'Supply', 'Order by', 'Required on site', 'Status'],
    mat.rows.map((m) => [m.category, m.item, m.make || '—', m.supply === 'procured' ? 'Procured' : m.supply === 'vendor' ? 'Vendor' : 'Client', m.orderBy ?? '—', m.requiredOnSite ?? '—', m.status]),
    brand, [2.0, 3.9, 1.6, 1.2, 1.2, 1.5, 0.9], 15);

  tableSlides(pptx, 'Manpower — levelled contractor gangs',
    ['Trade', 'From', 'To', 'Days', 'Man-days', 'Core gang', 'Peak'],
    plan.modules.manpower.trades.map((t) => [t.trade, t.start, t.end, String(t.activeDays), String(t.manDays), String(t.coreCrew.value), String(t.peakCrew)]),
    brand, [2.6, 1.9, 1.9, 1.3, 1.6, 1.6, 1.4], 16);

  const ra = pptx.addSlide();
  titleBar(ra, 'RA billing milestones — readiness against site progress', brand);
  kpis(ra, [
    ['Milestones', String(plan.modules.raMilestones.length)],
    ['Clauses tracked', String(plan.modules.raMilestones.reduce((a, m) => a + m.checkpoints.length, 0))],
    ['Contract value', plan.project.contractValue ? inr(plan.project.contractValue.value) : '—'],
  ], brand);
  tableOn(ra, ['RA', 'Due', '%', 'Amount', 'Clauses', 'Status'],
    plan.modules.raMilestones.map((m) => [m.code, m.dueDate, `${m.percent}%`, m.amount == null ? '—' : inr(m.amount), String(m.checkpoints.length), m.status]), 2.4);

  tableSlides(pptx, 'RA milestone clauses — what must be true before billing',
    ['RA', 'Kind', 'Clause', 'Planned', 'Status'],
    plan.modules.raMilestones.flatMap((m) => m.checkpoints.map((c) => [m.code, c.kind, c.description, c.plannedDate ?? '—', c.status])),
    brand, [1.0, 1.4, 6.2, 1.9, 1.8], 16);

  tableSlides(pptx, 'Resource plan', ['Role', 'Count', 'Basis'],
    plan.modules.resources.map((r) => [r.role, String(r.count.value), r.count.source]), brand, [3.4, 1.0, 7.9], 12);

  tableSlides(pptx, 'To-do list — next 21 days', ['End date', 'Responsibility', 'Description', 'Priority', 'Status'],
    plan.modules.todos.map((t) => [t.endDate ?? '—', t.responsibility, t.description, t.priority, t.status]), brand, [1.5, 2.3, 5.5, 1.4, 1.6], 15);

  tableSlides(pptx, 'Client / builder open points', ['Sr', 'Area', 'Description', 'Responsibility', 'Plan date', 'Status'],
    plan.modules.dependencies.map((d) => [String(d.sr), d.area, d.description, d.responsibility, d.planDate ?? '—', d.status]),
    brand, [0.7, 1.7, 5.0, 2.0, 1.5, 1.4], 15);

  tableSlides(pptx, 'Assumptions, gaps and risks', ['Area', 'Note', 'Visibility'],
    plan.assumptions.map((a) => [a.area, a.text, a.internalOnly ? 'internal only' : 'shared']), brand, [1.6, 8.7, 2.0], 8);

  return pptx;
}

export function buildDeck(plan: Plan, audience: 'client' | 'internal'): Pptx {
  return audience === 'client' ? clientDeck(plan) : internalDeck(plan);
}
