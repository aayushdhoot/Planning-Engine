// Scope -> WBS derivation. Used when a project has a priced BOQ but no supplied schedule.
// The AI-mapped part is the *structure* (which trades exist, in what sequence);
// every duration is computed from norms x quantity — never guessed.
import type { Activity, BoqPackage, Dependency,DesignReference,SiteConditionNote, Traced } from '../domain/types';
import norms from '../norms/norms-v1.json';

interface TradeStep {
  trade: string;
  phase: string;
  /** activity template name */
  name: string;
  /**
   * Predecessor trades (by trade key); resolved to the last activity of that trade.
   *
   * A trade may name ITSELF, which is how the tasks inside one trade chain: `lastOfTrade` is
   * written after each step is pushed, so "after: ['hvac']" on the fourth HVAC task resolves to
   * the third. The first task of a trade naming itself simply finds nothing and is skipped,
   * which is why the template can list it uniformly.
   */
  after: string[];
  /**
   * Relative size of this task within its trade — not a fraction.
   *
   * Weights rather than shares because shares have to sum to one and nobody can hand-author
   * sixty-nine fractions that do. The share is computed at run time as weight ÷ the trade's
   * total weight, so a task can be added or removed from the template without re-balancing
   * every one of its neighbours.
   *
   * Three classes, and they are judgements about site work rather than measurements: 3 for the
   * main install that carries the trade, 2 for substantial secondary work, 1 for testing,
   * commissioning, labelling and small items. A BOQ carrying real line-item quantities overrides
   * all of it — see the physical-quantity branch in deriveWbs.
   */
  weight: number;
  /** start once the predecessor is this fraction complete (0 = FS, 0.4 = SS at 40%) */
  overlap: number;
}

/** Standard interior fit-out sequence. Structure only — no dates, no durations. */
/**
 * The standard interior fit-out programme, task by task.
 *
 * It was sixteen rows — one per trade, "Ducting, piping, units & commissioning" standing for the
 * whole of HVAC. A project created through intake therefore got a sixteen-bar Gantt while the
 * seeded projects showed sixty-nine, because those carry a real issued programme in their data
 * and this was only ever a skeleton. Snitch (Bengaluru) is what that looks like on screen: eight
 * visible bars, each seventy days long, for a ninety-day fit-out.
 *
 * These tasks are taken from SKF Pune's issued programme — a real Flipspaces fit-out already in
 * this repository — rather than invented, so the shape is one a site manager recognises: HVAC
 * ducting before duct light testing before insulation, sprinkler piping before the alarm valve
 * before commissioning, putty and paint before carpet.
 *
 * Structure only. No dates and no durations live here: durations come from BOQ value or physical
 * quantity against the norms, and the overall length comes from the contract via the fit pass in
 * planner.ts. What this table decides is what the bars ARE and what has to precede what.
 */
const SEQUENCE: TradeStep[] = [
  // ---- Site Prep ----
  { trade: 'general', phase: 'Site Prep', name: 'Site Marking & Dilapidation Report', after: [], weight: 2, overlap: 0 },
  { trade: 'electrical', phase: 'Site Prep', name: 'Temporary Power', after: ['general'], weight: 1, overlap: 0.5 },
  { trade: 'general', phase: 'Site Prep', name: 'Furniture Marking', after: ['general'], weight: 1, overlap: 0.5 },

  // ---- Civil ----
  { trade: 'civil', phase: 'Civil Work', name: 'Blockwork, AAC Blocks & Plastering', after: ['general'], weight: 3, overlap: 0.6 },
  { trade: 'plumbing', phase: 'Civil Work', name: 'Plumbing Internal Piping', after: ['civil'], weight: 3, overlap: 0.4 },
  { trade: 'civil', phase: 'Civil Work', name: 'Waterproofing (Floor + Walls 600mm)', after: ['civil'], weight: 2, overlap: 0.5 },
  { trade: 'civil', phase: 'Civil Work', name: 'Anti-termite & Pest Control', after: ['civil'], weight: 1, overlap: 0.7 },
  { trade: 'civil', phase: 'Civil Work', name: 'Self Levelling & Associated Works', after: ['civil'], weight: 2, overlap: 0.5 },
  { trade: 'flooring', phase: 'Civil Work', name: 'Vitrified Tile Works', after: ['civil'], weight: 2, overlap: 0.4 },
  { trade: 'civil', phase: 'Civil Work', name: 'POP on Flooring (Protection)', after: ['civil', 'flooring'], weight: 1, overlap: 0.6 },

  // ---- Partitions ----
  { trade: 'partition', phase: 'Partition & Paneling', name: '100mm Partition Framing', after: ['civil'], weight: 3, overlap: 0.15 },
  { trade: 'partition', phase: 'Partition & Paneling', name: 'Gypsum Panelling', after: ['partition'], weight: 3, overlap: 0.4 },
  { trade: 'partition', phase: 'Partition & Paneling', name: 'Gypsum Wall Punning', after: ['partition'], weight: 2, overlap: 0.5 },
  { trade: 'carpentry', phase: 'Partition & Paneling', name: 'Column Cladding (Ply/Gypsum)', after: ['partition'], weight: 2, overlap: 0.5 },
  { trade: 'glass', phase: 'Partition & Paneling', name: 'Glass Partition', after: ['partition'], weight: 3, overlap: 0.7 },

  // ---- Electrical ----
  { trade: 'electrical', phase: 'Electrical & Networking', name: 'GI Cable Trays, Trunking & MS Supports', after: ['electrical', 'civil'], weight: 3, overlap: 0.2 },
  { trade: 'electrical', phase: 'Electrical & Networking', name: 'Raceway Trunking & Installation', after: ['electrical'], weight: 2, overlap: 0.5 },
  { trade: 'electrical', phase: 'Electrical & Networking', name: 'GI Conduiting & Switch/Point Back-boxes', after: ['electrical'], weight: 3, overlap: 0.4 },
  { trade: 'electrical', phase: 'Electrical & Networking', name: "Point Wiring, Circuits, Mains & DB's", after: ['electrical'], weight: 3, overlap: 0.4 },
  { trade: 'electrical', phase: 'Electrical & Networking', name: 'LT Panel Labeling', after: ['electrical'], weight: 1, overlap: 0.7 },
  { trade: 'electrical', phase: 'Electrical & Networking', name: 'Panel Installation — Testing & Commissioning', after: ['electrical'], weight: 1, overlap: 0.6 },

  // ---- HVAC ----
  { trade: 'hvac', phase: 'HVAC', name: 'GI Sheet Ducting Fabrication & Installation', after: ['partition'], weight: 3, overlap: 0.35 },
  { trade: 'hvac', phase: 'HVAC', name: 'Duct Light Testing (Pre-insulation)', after: ['hvac'], weight: 1, overlap: 0.6 },
  { trade: 'hvac', phase: 'HVAC', name: 'Thermal & Acoustic Insulation', after: ['hvac'], weight: 2, overlap: 0.5 },
  { trade: 'hvac', phase: 'HVAC', name: 'Grilles, Diffusers, Fire Dampers & Actuators', after: ['hvac'], weight: 2, overlap: 0.5 },
  { trade: 'hvac', phase: 'HVAC', name: 'Battery Room Ventilation', after: ['hvac'], weight: 1, overlap: 0.7 },
  { trade: 'hvac', phase: 'HVAC', name: 'Refrigerant Piping & Cable Trays', after: ['hvac'], weight: 2, overlap: 0.5 },
  { trade: 'hvac', phase: 'HVAC', name: 'Indoor Units Installation', after: ['hvac'], weight: 2, overlap: 0.5 },
  { trade: 'hvac', phase: 'HVAC', name: 'VRV Requirements and ODUs', after: ['hvac'], weight: 2, overlap: 0.5 },
  { trade: 'hvac', phase: 'HVAC', name: 'HVAC Testing & Commissioning', after: ['hvac'], weight: 1, overlap: 0.4 },

  // ---- Sprinkler ----
  { trade: 'sprinkler', phase: 'Fire & Security', name: 'C-Class Sprinkler Piping (Grooved)', after: ['electrical'], weight: 3, overlap: 0.1 },
  { trade: 'sprinkler', phase: 'Fire & Security', name: 'Alarm Valve Assembly & Flow Switch', after: ['sprinkler'], weight: 2, overlap: 0.5 },
  { trade: 'sprinkler', phase: 'Fire & Security', name: 'Pendent/Upright Sprinklers & Flexible Drops', after: ['sprinkler'], weight: 2, overlap: 0.5 },
  { trade: 'sprinkler', phase: 'Fire & Security', name: 'Sprinkler Testing & Commissioning', after: ['sprinkler'], weight: 1, overlap: 0.4 },

  // ---- LV ----
  { trade: 'lv', phase: 'LV Systems', name: 'Red/Black Armored Cabling (FAS/PA/CCTV)', after: ['electrical'], weight: 3, overlap: 0.5 },
  { trade: 'lv', phase: 'LV Systems', name: 'Detectors, Hooters & PAVA Rack Commissioning', after: ['lv'], weight: 2, overlap: 0.5 },
  { trade: 'lv', phase: 'LV Systems', name: 'EM Locks, Biometric Readers & CCTV', after: ['lv'], weight: 2, overlap: 0.5 },
  { trade: 'lv', phase: 'LV Systems', name: 'Emergency Exit Signage', after: ['lv'], weight: 1, overlap: 0.7 },
  { trade: 'lv', phase: 'LV Systems', name: 'Rodent Repellent System', after: ['lv'], weight: 1, overlap: 0.7 },
  { trade: 'lv', phase: 'LV Systems', name: 'Water Leak Detection System', after: ['lv'], weight: 1, overlap: 0.7 },

  // ---- Ceiling ----
  { trade: 'ceiling', phase: 'False Ceiling', name: 'Gypsum False Ceiling', after: ['hvac', 'electrical'], weight: 3, overlap: 0.5 },
  { trade: 'ceiling', phase: 'False Ceiling', name: 'Metal / Fire-rated Ceiling', after: ['ceiling'], weight: 2, overlap: 0.5 },
  { trade: 'ceiling', phase: 'False Ceiling', name: 'Designer Ceiling — Laminate Finish', after: ['ceiling'], weight: 2, overlap: 0.5 },
  { trade: 'ceiling', phase: 'False Ceiling', name: 'Acoustic Baffle Ceiling', after: ['ceiling'], weight: 1, overlap: 0.6 },

  // ---- Doors & carpentry ----
  { trade: 'carpentry', phase: 'Doors & Carpentry', name: 'Reception Table', after: ['carpentry'], weight: 2, overlap: 0.5 },
  { trade: 'carpentry', phase: 'Doors & Carpentry', name: 'Flush Doors', after: ['carpentry'], weight: 2, overlap: 0.5 },
  { trade: 'glass', phase: 'Doors & Carpentry', name: 'Glass Doors', after: ['glass'], weight: 2, overlap: 0.6 },
  { trade: 'glass', phase: 'Doors & Carpentry', name: 'Back Painted Glass', after: ['glass'], weight: 1, overlap: 0.7 },
  { trade: 'carpentry', phase: 'Doors & Carpentry', name: 'Acoustical Panels', after: ['carpentry'], weight: 2, overlap: 0.5 },

  // ---- Finishing ----
  { trade: 'painting', phase: 'Finishing', name: 'Internal Walls (Putty + Paint)', after: ['ceiling', 'carpentry'], weight: 3, overlap: 0.6 },
  { trade: 'painting', phase: 'Finishing', name: 'Ceiling Painting', after: ['painting'], weight: 2, overlap: 0.6 },
  { trade: 'flooring', phase: 'Finishing', name: 'Carpet Installation', after: ['painting'], weight: 3, overlap: 0.7 },
  { trade: 'finishing', phase: 'Finishing', name: 'Aluminium Skirting', after: ['flooring'], weight: 1, overlap: 0.6 },
  { trade: 'finishing', phase: 'Finishing', name: 'Frosting', after: ['finishing'], weight: 1, overlap: 0.8 },
  { trade: 'finishing', phase: 'Finishing', name: 'Vinyl Pasting', after: ['finishing'], weight: 1, overlap: 0.8 },
  { trade: 'finishing', phase: 'Finishing', name: 'Wallpaper Pasting', after: ['finishing'], weight: 1, overlap: 0.8 },
  { trade: 'finishing', phase: 'Finishing', name: 'Logo Installation', after: ['finishing'], weight: 1, overlap: 0.8 },
  { trade: 'finishing', phase: 'Finishing', name: 'Rolling Blinds', after: ['finishing'], weight: 1, overlap: 0.8 },
  { trade: 'finishing', phase: 'Finishing', name: 'Planters & Frames', after: ['finishing'], weight: 1, overlap: 0.8 },
  { trade: 'finishing', phase: 'Finishing', name: 'Sun Control Film', after: ['finishing'], weight: 1, overlap: 0.8 },
  { trade: 'finishing', phase: 'Finishing', name: 'Signage Installation', after: ['finishing'], weight: 1, overlap: 0.8 },

  // ---- Modular ----
  { trade: 'flooring', phase: 'Modular Placement', name: 'Raised Flooring', after: ['flooring'], weight: 2, overlap: 0.6 },
  { trade: 'modular', phase: 'Modular Placement', name: 'Modular Workstations', after: ['flooring'], weight: 3, overlap: 0.5 },
  { trade: 'modular', phase: 'Modular Placement', name: 'Manager/Meeting Room Tables', after: ['modular'], weight: 2, overlap: 0.5 },
  { trade: 'carpentry', phase: 'Modular Placement', name: 'Planter Box / OHU / File Storage', after: ['carpentry'], weight: 2, overlap: 0.6 },
  { trade: 'modular', phase: 'Modular Placement', name: 'WS / Meeting Room Chair Placement', after: ['modular'], weight: 1, overlap: 0.7 },
  { trade: 'modular', phase: 'Modular Placement', name: 'Loose Furniture', after: ['modular'], weight: 2, overlap: 0.6 },

  // ---- Handover ----
  { trade: 'cleaning', phase: 'Handover', name: 'Deep Cleaning', after: ['modular', 'finishing'], weight: 2, overlap: 0.6 },
  { trade: 'general', phase: 'Handover', name: 'Snag List & Handover', after: ['cleaning'], weight: 1, overlap: 0.3 },
];

export interface WbsResult {
  activities: Activity[];
  notes: string[];
  /**
   * Did the BOQ actually distribute value across the trades, or did every trade fall back to the
   * floor?
   *
   * The distinction is the difference between a measured programme and a shaped guess, and it
   * used to be invisible. A new project whose BOQ came through nearly empty — ₹4.5 lakh spread
   * over a job worth ₹8.75 crore — floored EVERY trade at 2% of that total, which is ₹8,915, and
   * ₹8,915 divided by a gang of four at ₹12,000 a man-day rounds up to one day. Sixteen trades,
   * one day each, a six-day programme against a ninety-day contract, and the screen reported
   * eighty-five days of buffer with the invariant holding.
   *
   * Nothing in that chain was a bug on its own. The floor is right, the productivity norm is
   * right, the CPM is right. What was missing was anyone asking whether the inputs had said
   * enough to be worth computing from.
   */
  valueDriven: boolean;
  /** trades that fell back to the floor because the BOQ gave them nothing of their own */
  flooredTrades: string[];
  /** total value the BOQ carried, as the durations saw it */
  totalValue: number;
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
 * Sharpens BOQ package -> trade classification using drawing/3D references, for packages
 * ingestion.ts's tradeFor() keyword match couldn't place (falls back to 'general'). Deliberately
 * conservative: only overrides when the drawing explicitly names the package code — a fuzzy
 * text match against a drawing description is exactly the kind of guess this engine avoids
 * elsewhere, so an unmatched 'general' package stays 'general' rather than being reassigned on
 * a hunch. This never touches value, quantity, or duration — trade is structure, not a number.
 */
export function applyDesignTradeHints(packages: BoqPackage[], designRefs: DesignReference[]): { packages: BoqPackage[]; notes: string[] } {
  const notes: string[] = [];
  const hintByCode = new Map<string, DesignReference>();
  for (const ref of designRefs) {
    if (!ref.packageCodeHint) continue;
    if (!hintByCode.has(ref.packageCodeHint)) hintByCode.set(ref.packageCodeHint, ref);
  }
  const adjusted = packages.map((pkg) => {
    if (pkg.trade !== 'general') return pkg; // don't override a classification ingestion.ts was confident about
    const hint = hintByCode.get(pkg.code);
    if (!hint || hint.trade === 'general') return pkg;
    notes.push(`Package ${pkg.code} ("${pkg.name}") reclassified from "general" to "${hint.trade}" per drawing reference: ${hint.description} (${hint.source}).`);
    return { ...pkg, trade: hint.trade };
  });
  return { packages: adjusted, notes };
}
/**
 * Derive a WBS from BOQ packages.
 * duration = ceil(packageValue / (crewSize x productivityPerManDay)), floored at 1 day.
 * Productivity is a versioned norm expressed as INR of work executed per man-day.
 */
export function deriveWbs(packages: BoqPackage[], targetDurationDays: number | null, siteConditions: SiteConditionNote[] = []): WbsResult {
  const notes: string[] = [];
  const valueByTrade = new Map<string, number>();
  for (const p of packages) valueByTrade.set(p.trade, (valueByTrade.get(p.trade) ?? 0) + p.clientAmount.value);

  // Site images can show a trade already done or partway done ahead of the WBS ever being
  // planned. 'complete' skips the SEQUENCE step outright — with the same effect as it never
  // having been chained in, since lastOfTrade is simply never set for it and every downstream
  // `after: [thisTrade]` already tolerates a missing predecessor id. 'in_progress' keeps the
  // step but shrinks its computed duration by the observed fraction — the remaining work is
  // still norm-driven, never guessed from the photo itself. Duplicate readings for one trade
  // (e.g. two site photos) prefer 'complete' over 'in_progress' over 'not_started'.
  const statusRank: Record<SiteConditionNote['status'], number> = { complete: 2, in_progress: 1, not_started: 0 };
  const conditionByTrade = new Map<string, SiteConditionNote>();
  for (const c of siteConditions) {
    const existing = conditionByTrade.get(c.trade);
    if (!existing || statusRank[c.status] > statusRank[existing.status]) conditionByTrade.set(c.trade, c);
  }

  // Total template weight per trade, so each task can take its share of that trade's value.
  const weightByTrade = new Map<string, number>();
  for (const st of SEQUENCE) weightByTrade.set(st.trade, (weightByTrade.get(st.trade) ?? 0) + st.weight);

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
    const cond = conditionByTrade.get(s.trade);
    if (cond?.status === 'complete') {
      notes.push(`${s.trade}: site images show this already complete — "${cond.note}" (${cond.source}). Skipped from the derived WBS; nothing downstream waits on it.`);
      return;
    }

    const id = `w${i + 1}`;
    // A trade's value is divided across ITS tasks by weight. Without this every one of HVAC's
    // nine tasks would be priced at the whole of HVAC, and a trade's duration would multiply by
    // the number of rows the template happens to give it — a more detailed programme would come
    // out longer purely for being more detailed.
    const share = s.weight / (weightByTrade.get(s.trade) || s.weight);
    const mapped = (valueByTrade.get(s.trade) ?? 0) * share;
    const value = Math.max(mapped, floorValue * share, 1);
    if (value > mapped) floored.push(s.trade);
    const crew = crewTable[s.trade] ?? crewTable.general;
    const physical = qtyByTrade.get(s.trade);
    const physNorm = (norms.physicalProductivity as unknown as Record<string, { unit: string; perManDay: number }>)[s.trade];

    let duration: number;
    let durSource: string;
    if (physical && physNorm) {
      const qty = physical.qty * share;
      duration = Math.max(1, Math.ceil(qty / (crew * physNorm.perManDay)));
      durSource = `ceil(${Math.round(qty).toLocaleString('en-IN')} of ${Math.round(physical.qty).toLocaleString('en-IN')} ${physNorm.unit} [BOQ ${physical.from.join(', ')}] / (crew ${crew} × ${physNorm.perManDay} ${physNorm.unit}/man-day)) per ${norms.version}:physicalProductivity.${s.trade}`;
    } else {
      const prod = prodTable[s.trade] ?? prodTable.general;
      duration = Math.max(1, Math.ceil(value / (crew * prod)));
      durSource = `ceil(${Math.round(value).toLocaleString('en-IN')} INR / (crew ${crew} × ${prod} INR per man-day)) per ${norms.version}:productivityInrPerManDay.${s.trade} — no BOQ quantity available`;
    }
    if (cond?.status === 'in_progress' && typeof cond.percentComplete === 'number') {
      const remainingFraction = Math.max(0, Math.min(1, 1 - cond.percentComplete));
      const shrunk = Math.max(1, Math.ceil(duration * remainingFraction));
      durSource = `${durSource}, then reduced to ${Math.round(remainingFraction * 100)}% remaining per site image — "${cond.note}" (${cond.source})`;
      duration = shrunk;
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
      valueShare: share,
    });
    lastOfTrade.set(s.trade, id);
  });

  // Every emitted step floored means the BOQ distributed nothing: the durations below are the
  // floor repeated, not a reading of this project.
  const flooredTrades = [...new Set(floored)];
  const valueDriven = totalValue > 0 && floored.length < acts.length;

  notes.push(
    valueDriven
      // "Durations are computed, not assumed" was the whole note, and it is true of any number
      // divided by a norm. It reassured about the arithmetic while saying nothing about the
      // figure that went into it — so the figure goes in the sentence.
      ? `WBS derived from ${packages.length} BOQ package(s) into ${acts.length} activities using ${norms.version} productivity norms. Durations are computed from ₹${Math.round(totalValue).toLocaleString('en-IN')} of package value — every date below moves with that total, so check it is the whole job.`
      : `WBS shaped from the ${norms.version} sequence into ${acts.length} activities, but NOT driven by the BOQ: ${
          totalValue > 0
            ? `every trade fell back to the ${Math.round(norms.wbsMinTradeValueShare * 100)}% floor of a total of only ₹${Math.round(totalValue).toLocaleString('en-IN')}`
            : 'the BOQ carried no value at all'
        }. Each duration below is the floor, not a measurement of this project. Read the priced BOQ before treating any date here as a commitment.`,
  );
  if (floored.length && valueDriven)
    notes.push(`These trades carry little or no value of their own in a summary-level BOQ and were floored at ${Math.round(norms.wbsMinTradeValueShare * 100)}% of project value: ${flooredTrades.join(', ')}. Supply a line-item BOQ for a sharper split.`);
  if (targetDurationDays) notes.push(`Contract allows ${targetDurationDays} calendar days; compare against the derived CPM finish before committing.`);
  const inProgressCount = [...conditionByTrade.values()].filter((c) => c.status === 'in_progress').length;
  const completeCount = [...conditionByTrade.values()].filter((c) => c.status === 'complete').length;
  if (completeCount || inProgressCount)
    notes.push(`Site images informed ${completeCount} completed trade(s) skipped and ${inProgressCount} in-progress trade(s) shrunk — see the per-trade notes above for the evidence behind each.`);
  // A brand-new project has no site history, so a photograph read as "complete" on one is far
  // more likely to be a misread than a finished trade. Half the sequence disappearing is worth
  // saying out loud next to the programme it shortened.
  // Counted in TRADES, not template rows. The template has sixty-nine tasks across sixteen
  // trades, so comparing a count of completed trades against the row count would need
  // thirty-five of them before it ever fired.
  const tradeCount = new Set(steps.map((x) => x.trade)).size;
  if (completeCount >= tradeCount / 2)
    notes.push(`${completeCount} of ${tradeCount} trades were skipped as already complete on the strength of site images alone. On a project that has not started, check those readings before trusting this programme — each skipped trade is work the plan no longer contains.`);
  return { activities: acts, notes, valueDriven, flooredTrades, totalValue };
}
