/**
 * Generates src/data/kohler.ts from the KOHLER OS Drive documents.
 *
 *   npx vite-node scripts/generate-kohler.ts [sourceDir]
 *
 * Re-run it whenever the BOQ or the programme is reissued. Nothing here is transcribed by
 * hand: the activity network comes from ScheduleIngestionService, the packages and payment
 * milestones from the BOQ workbook, and every emitted number carries the sheet it came from.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { ScheduleIngestionService } from '../src/services/schedule-ingestion';
import { tradeFor } from '../src/services/ingestion';
import type { Activity, BoqPackage, ContractMilestone } from '../src/domain/types';

const SRC = process.argv[2] ?? 'source-documents/kohler';
const BOQ_FILE = 'KOHLER_PUNE_FS_26TH JUNE_V5.xlsx';
const SCHED_FILE = 'Kohler_Pune_Project_Schedule_V2.xlsx';
const BOQ = `${BOQ_FILE} · FINAL SUMMARY`;
const SCHED = `${SCHED_FILE} · Project Schedule`;

const buf = (f: string): ArrayBuffer => {
  const b = readFileSync(join(SRC, f));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

// ---------------------------------------------------------------- schedule
const parsed = new ScheduleIngestionService().parse({ name: SCHED_FILE, data: buf(SCHED_FILE) }, 'Project Schedule');
if (!parsed.activities.length) throw new Error('No activities parsed from the programme.');
for (const w of parsed.warnings) console.warn('  schedule:', w);

const totalDeps = parsed.activities.reduce((n, a) => n + a.deps.length, 0);
const worstConflicts = [...parsed.logicConflicts].sort((a, b) => a.impliedLag - b.impliedLag).slice(0, 8);

// ---------------------------------------------------------------- BOQ
const wb = XLSX.read(new Uint8Array(buf(BOQ_FILE)), { type: 'array' });
const summary = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['FINAL SUMMARY'], { header: 1, blankrows: false, raw: true });

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const txt = (v: unknown): string => String(v ?? '').trim();

let areaSft: number | null = null;
let contractValue: number | null = null;
const priced: { code: string; name: string; amount: number; row: number }[] = [];

for (const [i, r] of summary.entries()) {
  const joined = r.map(txt).join(' ');
  if (!areaSft && /project area/i.test(joined)) areaSft = r.map(num).find((x): x is number => x != null && x > 100) ?? null;
  if (/grand total/i.test(joined) && !/with taxes/i.test(joined) && !contractValue)
    contractValue = r.map(num).find((x): x is number => x != null && x > 1000) ?? null;
  const code = txt(r[0]);
  const name = txt(r[1]);
  const amount = num(r[2]);
  if (/^[A-Z]\d?$/.test(code) && name && amount != null && amount > 0) priced.push({ code, name, amount, row: i + 1 });
}

// A group heading (A) is dropped when its children (A1, A2 …) are themselves priced; FLSS
// carries its value on the parent G because G1–G4 are unpriced, so G survives.
const packages: BoqPackage[] = priced
  .filter((p) => !priced.some((q) => q.code !== p.code && q.code.startsWith(p.code)))
  .map((p) => ({
    code: p.code,
    name: titleCase(p.name),
    clientAmount: { value: round2(p.amount), provenance: 'input' as const, source: `${BOQ} · row ${p.row} (${p.code})` },
    // This BOQ ships no BCS column — the engine must not invent one. The planner records an
    // explicit assumption when it falls back to the margin norm for cashflow.
    bcsAmount: null,
    trade: tradeFor(p.name),
  }));

// ---------------------------------------------------------------- payment terms
const pay = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets['Payment Terms'], { header: 1, blankrows: false, raw: true });
const milestones: ContractMilestone[] = [];
for (const r of pay) {
  const code = txt(r[0]);
  const day = num(r[1]);
  const pct = num(r[2]);
  if (!code || day == null || pct == null || !/^(RA\d+|Advance)/i.test(code)) continue;
  milestones.push({
    code: /advance/i.test(code) ? 'ADV' : code,
    dayOffset: day,
    percent: round2(pct * 100),
    description: txt(r[3]).replace(/\s*\n\s*/g, ' ').trim() || `${code} billing milestone`,
  });
}
const pctTotal = milestones.reduce((s, m) => s + m.percent, 0);
if (Math.abs(pctTotal - 100) > 0.01) console.warn(`  payment terms: milestones sum to ${pctTotal}%, not 100%.`);

// ------------------------------------------- map activities onto BOQ packages
// Structure mapping only (which site work draws down which cost head). Matching on trade
// alone is too coarse — carpentry covers planters, modular furniture and loose furniture,
// so nine of nineteen packages would end up with no site activity and therefore no order-by
// date. Names are matched first on their distinctive words, with trade as the fallback.
const STOP = new Set(['works', 'work', 'and', 'the', 'of', 'other', 'items', 'a', '&']);
/** crude singularisation so "partitions" in a cost head matches "partition" on site */
const stem = (w: string) => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w);
const words = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);

/**
 * The generic cost heads name a budget, not a task: nothing on site is called "Interior
 * Works". Without these, A2 (₹2.08 Cr, 36% of the contract) draws down against no activity
 * and its cost lands in the wrong months.
 */
const SYNONYMS: Record<string, string[]> = {
  interior: ['partition', 'gypsum', 'joinery', 'ceiling', 'plaster', 'pop', 'punning', 'framing', 'boarding', 'reception', 'display'],
  plumbing: ['phe', 'drainage', 'sanitaryware', 'sanitary'],
  dishwash: ['pantry', 'cafeteria'],
  kitchen: ['pantry', 'cafeteria'],
  signage: ['wayfinding'],
  graphic: ['film'],
  passive: ['network', 'cabling'],
  networking: ['network', 'rack', 'termination'],
  flss: ['sprinkler', 'detector', 'fire'],
  carpet: ['flooring'],
  light: ['fixture'],
  toilet: ['cubicle', 'cladding'],
};

const pkgWords = new Map(
  packages.map((p) => {
    const base = words(p.name);
    const expanded = new Set(base);
    for (const w of base) for (const extra of SYNONYMS[w] ?? []) expanded.add(stem(extra));
    return [p.code, [...expanded]];
  }),
);
// 'general' is what package classification returns when it recognises nothing, so a package
// sitting in it is an unclassified cost head, not a preliminaries budget. Falling back to it
// would book site mobilisation, snagging and handover against whichever head happened to land
// there. This BOQ has no preliminaries line, so those activities stay unmapped — which is the
// honest answer, not a defect.
const byTrade = new Map<string, string>();
for (const p of packages) if (p.trade !== 'general' && !byTrade.has(p.trade)) byTrade.set(p.trade, p.code);

/**
 * Strip-out draws on the demolition budget, not on the package being torn out: "Removal of
 * existing flooring" is civil work, not a drawdown against Carpet Flooring. Name matching is
 * skipped for these so they fall through to their trade's package.
 */
const DEMOLITION_PHASE = /demolition|dismantl|debris|make-safe/i;

function packageFor(a: Activity): string | undefined {
  if (a.isMilestone) return undefined;
  if (a.trade === 'general') return undefined; // preliminaries: no cost head to draw on
  if (DEMOLITION_PHASE.test(a.phase)) return byTrade.get(a.trade);
  const aw = new Set(words(a.name));
  let best: { code: string; score: number } | null = null;
  for (const p of packages) {
    const score = pkgWords.get(p.code)!.filter((w) => aw.has(w)).length;
    // a trade agreement breaks ties between packages that share a keyword
    const adjusted = score > 0 && p.trade === a.trade ? score + 0.5 : score;
    if (adjusted > 0 && (!best || adjusted > best.score)) best = { code: p.code, score: adjusted };
  }
  return best ? best.code : byTrade.get(a.trade);
}

// The programme carries no per-activity value, so each activity takes an equal share of its
// package — recorded here rather than hidden, because cashflow outflow timing depends on it.
const assigned = new Map<string, string>();
for (const a of parsed.activities) {
  const code = packageFor(a);
  if (code) assigned.set(a.id, code);
}
const counts = new Map<string, number>();
for (const code of assigned.values()) counts.set(code, (counts.get(code) ?? 0) + 1);

const activities: Activity[] = parsed.activities.map((a) => {
  const code = assigned.get(a.id);
  return code ? { ...a, packageCode: code, valueShare: round4(1 / counts.get(code)!) } : a;
});
const unmapped = packages.filter((p) => !counts.has(p.code));

// ---------------------------------------------------------------- emit
const j = (v: unknown) => JSON.stringify(v);
const durationDays = parsed.durationDays ?? Math.max(...milestones.map((m) => m.dayOffset));

const out = `// KOHLER OS, Pune — GENERATED by scripts/generate-kohler.ts. Do not edit by hand.
// Sources (source-documents/kohler/):
//   ${BOQ_FILE} — FINAL SUMMARY (area, cost heads, grand total) and Payment Terms (RA schedule)
//   ${SCHED_FILE} — Project Schedule (${parsed.activities.length} activities, issued programme)
//
// Durations come from the programme's Dur (Days) column. Dependency LOGIC is the sheet's own
// Pred. column; dependency LAGS are derived from its planned Start dates, so CPM reproduces
// the issued programme exactly (tests/kohler.test.ts asserts this activity by activity).
// The BOQ carries no BCS column, so bcsValue and every bcsAmount are null: the engine records
// an explicit margin assumption rather than inventing an internal cost.
//
// FINDING — ${parsed.logicConflicts.length} of ${totalDeps} dependencies in the issued programme have planned dates that
// contradict the logic the sheet itself states: the successor starts before its predecessor
// releases it. The dates are reproduced exactly as issued, so these surface as negative lags.
// Each is either a real overlap that should have been written SS+lag, or a date that will
// slip on site. The worst are:
${worstConflicts.map((c) => `//   ${c.activity} ${c.activityName} — ${c.type} ${c.pred}, implied lag ${c.impliedLag}d`).join('\n')}
import type { Activity, ProjectInputs, Traced } from '../domain/types';

const inp = (v: number, src: string): Traced<number> => ({ value: v, provenance: 'input', source: src });

const SCHED = ${j(SCHED)};
const BOQ = ${j(BOQ)};

export const kohlerProjectStart = ${j(parsed.projectStart)};

const activities: Activity[] = ${emitActivities(activities)};

export const kohler: ProjectInputs = {
  id: 'kohler',
  name: 'KOHLER OS, Pune',
  client: 'Kohler India Corporation Pvt. Ltd.',
  location: '7th Floor (7A), ITC, Pune',
  areaSft: inp(${areaSft}, \`\${BOQ} · PROJECT AREA (SFT)\`),
  contractStart: ${j(parsed.projectStart)}, // ${SCHED} · earliest planned start
  contractDurationCalDays: inp(${durationDays}, \`\${SCHED} · total programme duration (Day 1–${durationDays})\`),
  contractValue: inp(${round2(contractValue!)}, \`\${BOQ} · GRAND TOTAL (EXCLUSIVE OF TAXES)\`),
  bcsValue: null, // no BCS column in this BOQ
  milestones: [
${milestones.map((m) => `    { code: ${j(m.code)}, dayOffset: ${m.dayOffset}, percent: ${m.percent}, description: ${j(m.description)} },`).join('\n')}
  ], // source: ${BOQ_FILE} · Payment Terms
  boqPackages: [
${packages
  .map(
    (p) =>
      `    { code: ${j(p.code)}, name: ${j(p.name)}, clientAmount: inp(${p.clientAmount.value}, \`\${BOQ} · ${p.code}\`), bcsAmount: null, trade: ${j(p.trade)} },`,
  )
  .join('\n')}
  ],
  scheduleActivities: activities,
  provided: { boq: true, contract: true, layout: true, drawings: true, day0Images: true, design3d: true, salesKt: true, makeList: true, paymentTerms: true },
  ldPercentPerWeek: null, // not extracted — the signed contract PDF is not parsed structurally
  ldCapPercent: null,
  dlpMonths: 6, // ${BOQ_FILE} · Payment Terms · RA5 ("6 months Defects Liability Period")
};
`;

writeFileSync('src/data/kohler.ts', out);

console.log(`KOHLER generated:
  activities        ${activities.length} (${parsed.sections.length} sections, start ${parsed.projectStart}, ${durationDays} days)
  BOQ packages      ${packages.length}
  area              ${areaSft} sft
  contract value    INR ${contractValue!.toLocaleString('en-IN')}
  milestones        ${milestones.length} (${pctTotal}%)
  logic conflicts   ${parsed.logicConflicts.length} of ${totalDeps} dependencies contradict the sheet's own stated logic
  unmapped packages ${unmapped.length}${unmapped.length ? ` (${unmapped.map((p) => p.code).join(', ')}) — no site activity, so no order-by date` : ''}
  -> src/data/kohler.ts`);

// ---------------------------------------------------------------- helpers
function emitActivities(acts: Activity[]): string {
  const lines = acts.map((a) => {
    const extra = [
      a.packageCode ? `packageCode: ${j(a.packageCode)}` : '',
      a.valueShare != null ? `valueShare: ${a.valueShare}` : '',
    ]
      .filter(Boolean)
      .join(', ');
    return `  { id: ${j(a.id)}, name: ${j(a.name)}, phase: ${j(a.phase)}, trade: ${j(a.trade)},
    duration: ${j(a.duration)},
    deps: ${j(a.deps)},
    crew: ${j(a.crew)},
    isMilestone: ${a.isMilestone}, plannedStartFromInput: ${j(a.plannedStartFromInput)}${extra ? `, ${extra}` : ''} },`;
  });
  return `[\n${lines.join('\n')}\n]`;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
}
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\bAnd\b/g, '&')
    .replace(/\bHvac\b/i, 'HVAC')
    .replace(/\bPhe\b/i, 'PHE')
    .replace(/\bFlss\b/i, 'FLSS');
}
