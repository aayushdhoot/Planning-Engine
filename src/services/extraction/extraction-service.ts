// Orchestrator: file bytes -> page images -> vision-client -> merged, Traced ProjectInputs patch.
// This is the second writer into ProjectInputs alongside ingestion.ts (Excel). It never touches
// boqPackages or scheduleActivities — those stay the Excel parser's job — and it never produces
// a date or duration directly; contract dates/milestones pass through as `provenance: 'input'`,
// same rule ingestion.ts already follows for spreadsheet cells.
import type { ContractMilestone, DesignReference, MaterialListItem, ScopeNote, SiteConditionNote, Traced } from '../../domain/types';
import { extractWithVision, type VisionClientConfig, type VisionInput } from './vision-client';
import type { ExtractionResult } from './types';

const VALID_TRADES = new Set([
  'general', 'civil', 'plumbing', 'partition', 'electrical', 'hvac',
  'sprinkler', 'lv', 'ceiling', 'carpentry', 'glass', 'painting',
  'flooring', 'modular', 'finishing', 'cleaning',
]);

export interface SourceFile {
  fileName: string;
  filePath: string;
  /** one entry per page/photo already rendered to an image (PDF->PNG conversion happens
   * upstream, in the intake step — this service only calls the vision model) */
  pages: { imageBase64: string; mimeType: 'image/png' | 'image/jpeg'; pageLabel: string }[];
}

/** What this service produces: a patch to merge into an existing ProjectInputs, plus assumptions
 * text for anything the model flagged as low-confidence or off-vocabulary. */
export interface ExtractionPatch {
  contractStart?: string;
  contractDurationCalDays?: Traced<number>;
  contractValue?: Traced<number>;
  bcsValue?: Traced<number>;
  milestones: ContractMilestone[];
  siteConditions: SiteConditionNote[];
  materialItems: MaterialListItem[];
  scopeNotes: ScopeNote[];
  designRefs: DesignReference[];
  assumptions: string[];
  /** files that were sent to the model but yielded nothing at all — logged, not extracted,
   * same distinction coverage.ts already draws for the Excel path */
  emptyFiles: string[];
}

function sourceOf(fileName: string, locator: string | undefined | null): string {
  return locator ? `${fileName} — ${locator}, vision extraction` : `${fileName}, vision extraction`;
}

function normalizeTrade(raw: string, fileName: string, notes: string[]): string {
  const t = raw.trim().toLowerCase();
  if (VALID_TRADES.has(t)) return t;
  notes.push(`${fileName}: trade "${raw}" is not a recognised trade key — filed under "general". Check this row.`);
  return 'general';
}

function mergeOne(fileName: string, r: ExtractionResult, patch: ExtractionPatch): boolean {
  let wroteSomething = false;

  if (r.contract) {
    const c = r.contract;
    if (c.contractStart) { patch.contractStart = c.contractStart; wroteSomething = true; }
    if (typeof c.contractDurationCalDays === 'number') {
      patch.contractDurationCalDays = { value: c.contractDurationCalDays, provenance: 'input', source: sourceOf(fileName, c.locator) };
      wroteSomething = true;
    }
    if (typeof c.contractValue === 'number') {
      patch.contractValue = { value: c.contractValue, provenance: 'input', source: sourceOf(fileName, c.locator) };
      wroteSomething = true;
    }
    if (typeof c.bcsValue === 'number') {
      patch.bcsValue = { value: c.bcsValue, provenance: 'input', source: sourceOf(fileName, c.locator) };
      wroteSomething = true;
    }
    if (c.milestones?.length) {
      patch.milestones.push(...c.milestones);
      wroteSomething = true;
    }
  }

  for (const sc of r.siteConditions ?? []) {
    patch.siteConditions.push({
      trade: normalizeTrade(sc.trade, fileName, patch.assumptions),
      status: sc.status,
      percentComplete: sc.percentComplete,
      note: sc.note,
      source: sourceOf(fileName, sc.locator),
    });
    wroteSomething = true;
  }

  for (const m of r.materialItems ?? []) {
    patch.materialItems.push({
      item: m.item,
      trade: normalizeTrade(m.trade, fileName, patch.assumptions),
      spec: m.spec,
      quantity: typeof m.quantity === 'number' ? { value: m.quantity, provenance: 'input', source: sourceOf(fileName, m.locator) } : undefined,
      unit: m.unit,
      source: sourceOf(fileName, m.locator),
    });
    wroteSomething = true;
  }

  for (const s of r.scopeNotes ?? []) {
    patch.scopeNotes.push({ area: s.area, note: s.note, source: sourceOf(fileName, s.locator) });
    wroteSomething = true;
  }

  for (const d of r.designRefs ?? []) {
    patch.designRefs.push({
      packageCodeHint: d.packageCodeHint,
      trade: normalizeTrade(d.trade, fileName, patch.assumptions),
      description: d.description,
      source: sourceOf(fileName, d.locator),
    });
    wroteSomething = true;
  }

  for (const note of r.lowConfidenceNotes ?? []) patch.assumptions.push(`${fileName}: ${note}`);
  return wroteSomething;
}

/**
 * Runs every page of every file through the vision model and merges into one patch.
 * Files run sequentially per-page to keep error attribution clean (which file/page failed);
 * parallelize later if extraction latency becomes a problem — correctness first.
 */
export async function extractProjectDocuments(files: SourceFile[], cfg: VisionClientConfig): Promise<ExtractionPatch> {
  const patch: ExtractionPatch = {
    milestones: [], siteConditions: [], materialItems: [], scopeNotes: [], designRefs: [],
    assumptions: [], emptyFiles: [],
  };

  for (const file of files) {
    let fileWroteSomething = false;
    for (const page of file.pages) {
      const input: VisionInput = {
        fileName: file.fileName, filePath: file.filePath,
        imageBase64: page.imageBase64, mimeType: page.mimeType,
      };
      try {
        const result = await extractWithVision(input, cfg);
        const wrote = mergeOne(`${file.fileName} (${page.pageLabel})`, result, patch);
        fileWroteSomething = fileWroteSomething || wrote;
      } catch (err) {
        // A single bad page must not abort the whole batch — record it as an assumption and
        // move on, same T1-DEGRADE spirit as planner.ts's missing-input handling.
        const msg = err instanceof Error ? err.message : String(err);
        patch.assumptions.push(`${file.fileName} (${page.pageLabel}): extraction failed — ${msg}`);
      }
    }
    if (!fileWroteSomething) patch.emptyFiles.push(file.fileName);
  }

  return patch;
}

/** Merges an ExtractionPatch into an existing ProjectInputs-shaped object. Never overwrites a
 * field that already carries a human-entered or Excel-sourced value — extraction fills gaps,
 * it doesn't override the higher-trust source, mirroring how internalStart overrides contractStart
 * only when explicitly set in planner.ts. */
export function applyExtractionPatch<T extends {
  contractStart: string | null;
  contractDurationCalDays: Traced<number> | null;
  contractValue: Traced<number> | null;
  bcsValue: Traced<number> | null;
  milestones: ContractMilestone[];
  siteConditions: SiteConditionNote[];
  materialItems: MaterialListItem[];
  scopeNotes: ScopeNote[];
  designRefs: DesignReference[];
}>(base: T, patch: ExtractionPatch): T {
  return {
    ...base,
    contractStart: base.contractStart ?? patch.contractStart ?? null,
    contractDurationCalDays: base.contractDurationCalDays ?? patch.contractDurationCalDays ?? null,
    contractValue: base.contractValue ?? patch.contractValue ?? null,
    bcsValue: base.bcsValue ?? patch.bcsValue ?? null,
    milestones: base.milestones.length ? base.milestones : patch.milestones,
    siteConditions: [...base.siteConditions, ...patch.siteConditions],
    materialItems: [...base.materialItems, ...patch.materialItems],
    scopeNotes: [...base.scopeNotes, ...patch.scopeNotes],
    designRefs: [...base.designRefs, ...patch.designRefs],
  };
}