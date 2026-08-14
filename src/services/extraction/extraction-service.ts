// Orchestrator: file bytes -> page images -> vision-client -> merged, Traced ProjectInputs patch.
// This is the second writer into ProjectInputs alongside ingestion.ts (Excel). It never touches
// boqPackages or scheduleActivities — those stay the Excel parser's job — and it never produces
// a date or duration directly; contract dates/milestones pass through as `provenance: 'input'`,
// same rule ingestion.ts already follows for spreadsheet cells.
import type { ContractMilestone, DesignReference, MaterialListItem, ScopeNote, SiteConditionNote, Traced } from '../../domain/types';
import { extractWithVision, VisionExtractionError, type RateLimitScope, type VisionClientConfig, type VisionInput } from './vision-client';
import { mapPool } from './pool';
import type { ExtractionResult } from './types';

/** How many vision calls this service keeps in flight. Four is empirically under Groq's
 * per-minute ceiling for this model while being roughly four times faster than one at a time;
 * the caller can override it per request. */
export const DEFAULT_CONCURRENCY = 4;

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

/** One page that could not be read, and why. Kept structured rather than folded into
 * `assumptions` so the caller can tell a rate limit (retry later, nothing is wrong with the
 * document) apart from an unreadable file, and stop a 130-file batch on the former. */
export interface ExtractionFailure {
  fileName: string;
  pageLabel: string;
  message: string;
  rateLimit: RateLimitScope;
  /** true when the page was never attempted, because the batch stopped early */
  skipped?: boolean;
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
  /** pages the model never returned anything for, with the reason attached */
  failures: ExtractionFailure[];
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
 *
 * Pages run through a bounded pool rather than one at a time: a page is an independent network
 * round trip, and reading a folder of site photos serially is what made the intake step take
 * minutes. Error attribution survives the change because results come back index-aligned and
 * are merged in the original order, so a patch is still a deterministic function of its input.
 *
 * A daily rate limit stops the batch. Every remaining page would fail identically, and failing
 * them fast — with the reason recorded against each one — is what lets the caller say "the
 * allowance is spent, here is what was read" instead of grinding through 100 more refusals.
 */
export async function extractProjectDocuments(
  files: SourceFile[],
  cfg: VisionClientConfig,
  opts: { concurrency?: number } = {},
): Promise<ExtractionPatch> {
  const patch: ExtractionPatch = {
    milestones: [], siteConditions: [], materialItems: [], scopeNotes: [], designRefs: [],
    assumptions: [], emptyFiles: [], failures: [],
  };

  const tasks = files.flatMap((file) => file.pages.map((page) => ({ file, page })));
  let halted: RateLimitScope = null;

  const results = await mapPool(
    tasks,
    async ({ file, page }) => {
      const input: VisionInput = {
        fileName: file.fileName, filePath: file.filePath,
        imageBase64: page.imageBase64, mimeType: page.mimeType,
      };
      try {
        return await extractWithVision(input, cfg);
      } catch (err) {
        // Raised here rather than after the pool drains, so shouldStop can actually see it:
        // pages still queued behind a spent daily allowance are abandoned, not attempted.
        if (err instanceof VisionExtractionError && err.rateLimit === 'day') halted = 'day';
        throw err;
      }
    },
    {
      concurrency: opts.concurrency ?? DEFAULT_CONCURRENCY,
      shouldStop: () => halted !== null,
    },
  );

  const wroteByFile = new Map<string, boolean>();
  const failedByFile = new Map<string, boolean>();
  for (const [i, r] of results.entries()) {
    const { file, page } = tasks[i];
    wroteByFile.set(file.fileName, wroteByFile.get(file.fileName) ?? false);
    if (r.status === 'done') {
      const wrote = mergeOne(`${file.fileName} (${page.pageLabel})`, r.value, patch);
      if (wrote) wroteByFile.set(file.fileName, true);
      continue;
    }
    failedByFile.set(file.fileName, true);
    if (r.status === 'skipped') {
      patch.failures.push({
        fileName: file.fileName, pageLabel: page.pageLabel, rateLimit: halted, skipped: true,
        message: halted === 'day'
          ? 'Not attempted — the daily token allowance was already spent by an earlier page in this batch.'
          : 'Not attempted — the batch was stopped before this page was reached.',
      });
      continue;
    }
    // A single bad page must not abort the whole batch — record it and move on, same
    // T1-DEGRADE spirit as planner.ts's missing-input handling.
    const msg = r.error instanceof Error ? r.error.message : String(r.error);
    patch.failures.push({
      fileName: file.fileName,
      pageLabel: page.pageLabel,
      message: msg,
      rateLimit: r.error instanceof VisionExtractionError ? r.error.rateLimit : null,
    });
    patch.assumptions.push(`${file.fileName} (${page.pageLabel}): extraction failed — ${msg}`);
  }

  // "Empty" means the model looked and found nothing. A file whose pages all failed was never
  // read at all, and calling that empty would be the same false assurance coverage.ts exists
  // to prevent.
  for (const [fileName, wrote] of wroteByFile) if (!wrote && !failedByFile.get(fileName)) patch.emptyFiles.push(fileName);

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