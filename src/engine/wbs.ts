// Scope -> WBS derivation. Used when a project has a priced BOQ but no supplied schedule.
// The AI-mapped part is the *structure* (which trades exist, in what sequence);
// every duration is computed from norms x quantity — never guessed.
import type { Activity, BoqPackage, Dependency, Traced } from '../domain/types';
import norms from '../norms/norms-v1.json';

interface TradeStep {
  trade: string;
  phase: string;
  /** activity template name */
  name: string;
  /** predecessor trades (by trade key); resolved to the last activity of that trade */
  after: string[];
  /** fraction of the trade's package value consumed by this step */
  share: number;
  /** start once the predecessor is this fraction complete (0 = FS, 0.4 = SS at 40%) */
  overlap: number;
}

/** Standard interior fit-out sequence. Structure only — no dates, no durations. */
const SEQUENCE: TradeStep[] = [
  { trade: 'general', phase: 'Site Prep', name: 'Site mobilisation, marking & dilapidation', after: [], share: 1, overlap: 0 },
  { trade: 'civil', phase: 'Civil Work', name: 'Blockwork, plastering & waterproofing', after: ['general'], share: 1, overlap: 0.6 },
  { trade: 'plumbing', phase: 'Civil Work', name: 'Internal plumbing rough-in', after: ['civil'], share: 1, overlap: 0.4 },
  { trade: 'partition', phase: 'Partition & Paneling', name: 'Partition framing, boarding & panelling', after: ['civil'], share: 1, overlap: 0.15 },
  { trade: 'electrical', phase: 'Electrical & Networking', name: 'Raceways, conduiting, wiring & panels', after: ['civil'], share: 1, overlap: 0.2 },
  { trade: 'hvac', phase: 'HVAC', name: 'Ducting, piping, units & commissioning', after: ['partition'], share: 1, overlap: 0.35 },
  { trade: 'sprinkler', phase: 'Fire & Security', name: 'Sprinkler piping, devices & commissioning', after: ['electrical'], share: 1, overlap: 0.1 },
  { trade: 'lv', phase: 'LV Systems', name: 'LV cabling, devices & racks', after: ['electrical'], share: 1, overlap: 0.5 },
  { trade: 'ceiling', phase: 'False Ceiling', name: 'False ceiling framing & closing', after: ['hvac', 'electrical'], share: 1, overlap: 0.5 },
  { trade: 'carpentry', phase: 'Doors & Carpentry', name: 'Carpentry, doors & loose fabrication', after: ['partition'], share: 1, overlap: 0.5 },
  { trade: 'glass', phase: 'Doors & Carpentry', name: 'Glass partitions & doors', after: ['partition'], share: 1, overlap: 0.7 },
  { trade: 'painting', phase: 'Finishing', name: 'Putty, primer & paint', after: ['ceiling', 'carpentry'], share: 1, overlap: 0.6 },
  { trade: 'flooring', phase: 'Finishing', name: 'Flooring & carpet installation', after: ['painting'], share: 1, overlap: 0.7 },
  { trade: 'modular', phase: 'Modular Placement', name: 'Modular & loose furniture placement', after: ['flooring'], share: 1, overlap: 0.5 },
  { trade: 'finishing', phase: 'Finishing', name: 'Signage, blinds, films & planters', after: ['painting'], share: 1, overlap: 0.8 },
  { trade: 'cleaning', phase: 'Handover', name: 'Deep cleaning, snagging & handover', after: ['modular', 'finishing'], share: 1, overlap: 0.6 },
];

export interface WbsResult {
  activities: Activity[];
  notes: string[];
}

/** Resolve a raw BOQ unit string to a canonical unit key, or null if unrecognised. */
export function canonicalUnit(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\./g, '.');
  for (const [key, aliases] of Object.entries(norms.unitAliases as Record<string, string[]>))
    if (aliases.includes(s)) return key;
  return null;
}

/** Convert between canonical units where a conversion is defined; null when incompatible. */
export function convertUnit(qty: number, from: string, to: string): number | null {
  if (from === to) return qty;
  if (from === 'sft' && to === 'sqm') return qty / norms.sftPerSqm;
  if (from === 'sqm' && to === 'sft') return qty * norms.sftPerSqm;
  return null;
}

/**
 * Derive a WBS from BOQ packages.
 * duration = ceil(packageValue / (crewSize x productivityPerManDay)), floored at 1 day.
 * Productivity is a versioned norm expressed as INR of work executed per man-day.
 */
export function deriveWbs(packages: BoqPackage[], targetDurationDays: number | null): WbsResult {
  const notes: string[] = [];
  const valueByTrade = new Map<string, number>();
  for (const p of packages) valueByTrade.set(p.trade, (valueByTrade.get(p.trade) ?? 0) + p.clientAmount.value);

  const prodTable = norms.productivityInrPerManDay as unknown as Record<string, number>;
  const crewTable = norms.crewByTrade as Record<string, number>;
  const steps = SEQUENCE;
  const unmapped = [...valueByTrade.keys()].filter((t) => !SEQUENCE.some((s) => s.trade === t));
  if (unmapped.length) notes.push(`Trades with BOQ value but no sequence template: ${unmapped.join(', ')} — excluded from the derived WBS.`);

  // Physical quantities, where the BOQ carries them, are the better duration driver.
  const qtyByTrade = new Map<string, { qty: number; unit: string; from: string[] }>();
  for (const p of packages) {
    if (!p.quantity || !p.unit) continue;
    const canonical = canonicalUnit(p.unit);
    if (!canonical) continue;
    const target = (norms.physicalProductivity as unknown as Record<string, { unit: string; perManDay: number }>)[p.trade];
    if (!target) continue;
    const converted = convertUnit(p.quantity.value, canonical, target.unit);
    if (converted == null) continue;
    const cur = qtyByTrade.get(p.trade) ?? { qty: 0, unit: target.unit, from: [] };
    cur.qty += converted;
    cur.from.push(p.code);
    qtyByTrade.set(p.trade, cur);
  }
  if (qtyByTrade.size)
    notes.push(`Physical quantities available for ${qtyByTrade.size} trade(s) — durations for those are driven per-unit rather than by value.`);

  const totalValue = packages.reduce((s, p) => s + p.clientAmount.value, 0);
  // Summary-level BOQs lump several trades into one line (e.g. ceiling and carpentry inside
  // "Interior Works"), so a trade can show near-zero value. Floor it and say so.
  const floorValue = totalValue * norms.wbsMinTradeValueShare;
  const floored: string[] = [];
  const lastOfTrade = new Map<string, string>();
  const acts: Activity[] = [];
  const durById = new Map<string, number>();

  steps.forEach((s, i) => {
    const id = `w${i + 1}`;
    const mapped = valueByTrade.get(s.trade) ?? 0;
    const value = Math.max(mapped, floorValue, 1);
    if (value > mapped) floored.push(s.trade);
    const crew = crewTable[s.trade] ?? crewTable.general;
    const physical = qtyByTrade.get(s.trade);
    const physNorm = (norms.physicalProductivity as unknown as Record<string, { unit: string; perManDay: number }>)[s.trade];

    let duration: number;
    let durSource: string;
    if (physical && physNorm) {
      duration = Math.max(1, Math.ceil(physical.qty / (crew * physNorm.perManDay)));
      durSource = `ceil(${Math.round(physical.qty).toLocaleString('en-IN')} ${physNorm.unit} [BOQ ${physical.from.join(', ')}] / (crew ${crew} × ${physNorm.perManDay} ${physNorm.unit}/man-day)) per ${norms.version}:physicalProductivity.${s.trade}`;
    } else {
      const prod = prodTable[s.trade] ?? prodTable.general;
      duration = Math.max(1, Math.ceil(value / (crew * prod)));
      durSource = `ceil(${Math.round(value).toLocaleString('en-IN')} INR / (crew ${crew} × ${prod} INR per man-day)) per ${norms.version}:productivityInrPerManDay.${s.trade} — no BOQ quantity available`;
    }
    durById.set(id, duration);

    const deps: Dependency[] = [];
    for (const predTrade of s.after) {
      const predId = lastOfTrade.get(predTrade);
      if (!predId) continue;
      const predDur = durById.get(predId)!;
      deps.push(
        s.overlap === 0
          ? { pred: predId, type: 'FS', lag: 0 }
          : { pred: predId, type: 'SS', lag: Math.max(0, Math.round(predDur * s.overlap)) },
      );
    }
    if (!deps.length && acts.length) deps.push({ pred: acts[acts.length - 1].id, type: 'SS', lag: 1 });

    const durTraced: Traced<number> = { value: duration, provenance: 'computed', source: durSource };

    acts.push({
      id,
      name: s.name,
      phase: s.phase,
      trade: s.trade,
      duration: durTraced,
      deps,
      crew: { value: crew, provenance: 'norm', source: `${norms.version}:crewByTrade.${s.trade}` },
      isMilestone: false,
      packageCode: packages.find((p) => p.trade === s.trade)?.code,
      valueShare: s.share,
    });
    lastOfTrade.set(s.trade, id);
  });

  notes.push(`WBS derived from ${packages.length} BOQ packages into ${acts.length} activities using ${norms.version} productivity norms. Durations are computed, not assumed.`);
  if (floored.length)
    notes.push(`These trades carry little or no value of their own in a summary-level BOQ and were floored at ${Math.round(norms.wbsMinTradeValueShare * 100)}% of project value: ${[...new Set(floored)].join(', ')}. Supply a line-item BOQ for a sharper split.`);
  if (targetDurationDays) notes.push(`Contract allows ${targetDurationDays} calendar days; compare against the derived CPM finish before committing.`);
  return { activities: acts, notes };
}
