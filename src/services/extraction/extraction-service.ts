// Orchestrator: file bytes -> page images -> vision-client -> merged, Traced ProjectInputs patch.
// This is the second writer into ProjectInputs alongside ingestion.ts (Excel). It never touches
// boqPackages or scheduleActivities — those stay the Excel parser's job — and it never produces
// a date or duration directly; contract dates/milestones pass through as `provenance: 'input'`,
// same rule ingestion.ts already follows for spreadsheet cells.
import type { ContractMilestone, DesignReference, MaterialListItem, ScopeNote, SiteConditionNote, Traced } from '../../domain/types';
import { extractBatchWithVision, VisionExtractionError, type BatchItem, type RateLimitScope, type VisionClientConfig } from './vision-client';
import { mapPool } from './pool';
import type { ExtractionResult, PlanningQueryKey } from './types';

/** One proposed intake answer, with the document and clause it was read from attached. */
export interface PlanningAnswerFound {
  key: PlanningQueryKey;
  value: string;
  source: string;
}

/**
 * How many vision calls this service keeps in flight, across the PAGES of one document.
 *
 * It was four, and it multiplied. The browser reads four files at once, and each of those became
 * its own server call fanning out to four more — sixteen concurrent requests against an
 * allowance of roughly fifteen a MINUTE. The scan tripped the limit within seconds; every
 * in-flight call then retried on its own schedule, tripped it again, and after three rounds each
 * gave up and marked its file unread. That is why a folder scan finished with most of it
 * "readable but never read", and why running it again collected a few more each time.
 *
 * The browser now holds one shared pace for the whole run (services/extraction/rate-gate.ts).
 * This stays low so that a single long PDF cannot burst past that pace on its own.
 */
export const DEFAULT_CONCURRENCY = 2;

/**
 * How many page images travel in one model call.
 *
 * Six, measured rather than guessed. On six real 1024px site photographs one call returned in
 * 3.8s against 5.0s for a single image — 0.6s an image instead of 5.0s, because nearly all of
 * the per-image cost was the round trip. At roughly 7k tokens for six it also sits well inside
 * the per-minute token ceiling at the pace the browser's rate gate allows.
 *
 * Not larger: every image in a group shares one fate. A group that trips a limit or comes back
 * malformed costs six documents, not one, and a longer output is likelier to be truncated
 * mid-array — which loses the images at the END of the batch, silently, unless every entry is
 * checked back against its label. Six is where the round-trip saving has already been banked
 * and the blast radius is still small.
 */
export const DEFAULT_BATCH = 6;

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
  /** proposed answers to the intake questions, each attributed to the document it came from.
   * Never applied on their own — engine/intake.ts holds them as prefill until a person confirms. */
  planningAnswers: PlanningAnswerFound[];
  /** pages the model never returned anything for, with the reason attached */
  failures: ExtractionFailure[];
  /**
   * The same findings split back out by file name, present only on the merged patch a call
   * returns. Several documents travel in one request now, and a coverage row has to say what
   * THIS document yielded — which a merged patch cannot answer.
   */
  byFile?: Record<string, ExtractionPatch>;
}

/** A patch with every list present and empty — the shape both the merged and the per-file
 * patches start from, so no caller ever has to null-check an array. */
export function emptyPatch(): ExtractionPatch {
  return {
    milestones: [], siteConditions: [], materialItems: [], scopeNotes: [], designRefs: [], planningAnswers: [],
    assumptions: [], emptyFiles: [], failures: [],
  };
}

/** Fold one patch into another, in place. */
export function mergePatch(into: ExtractionPatch, from: ExtractionPatch): void {
  into.contractStart ??= from.contractStart;
  into.contractDurationCalDays ??= from.contractDurationCalDays;
  into.contractValue ??= from.contractValue;
  into.bcsValue ??= from.bcsValue;
  into.milestones.push(...from.milestones);
  into.siteConditions.push(...from.siteConditions);
  into.materialItems.push(...from.materialItems);
  into.scopeNotes.push(...from.scopeNotes);
  into.designRefs.push(...from.designRefs);
  into.planningAnswers.push(...from.planningAnswers);
  into.assumptions.push(...from.assumptions);
  into.emptyFiles.push(...from.emptyFiles);
  into.failures.push(...from.failures);
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

  for (const a of r.planningAnswers ?? []) {
    patch.planningAnswers.push({ key: a.key, value: a.value, source: sourceOf(fileName, a.locator) });
    // Deliberately NOT counted as `wroteSomething`. A document whose only yield was a proposed
    // answer has not had anything extracted from it — it has offered something for a person to
    // confirm, and calling that an extraction is the overstatement coverage.ts exists to stop.
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
  opts: { concurrency?: number; batchSize?: number } = {},
): Promise<ExtractionPatch> {
  const patch: ExtractionPatch = emptyPatch();

  /**
   * The same findings, kept per file as well as merged.
   *
   * Several documents now travel in one request, so the caller needs to know which of them each
   * finding came from — a row on the coverage screen says what THIS document yielded, and a
   * merged patch cannot answer that. The merged patch is built from these at the end, so the two
   * cannot disagree.
   */
  const byFile = new Map<string, ExtractionPatch>();
  const patchFor = (name: string): ExtractionPatch => {
    const found = byFile.get(name);
    if (found) return found;
    const made = emptyPatch();
    byFile.set(name, made);
    return made;
  };

  const tasks = files.flatMap((file) => file.pages.map((page) => ({ file, page })));
  let halted: RateLimitScope = null;

  /**
   * Pages are read several to a request.
   *
   * One request per image was the whole cost of a folder scan. The browser paces the run at
   * twelve requests a minute (services/extraction/rate-gate.ts, sized to the provider's own
   * per-minute ceiling), so 170 images was fourteen minutes of queueing before a single model
   * call was counted — which is what the screen reading "0 / 170 read" actually was. Batching
   * does not make the model faster; it makes the queue shorter, and the queue was the problem.
   *
   * Measured on six real site photographs at 1024px: 5.0s for one image against 3.8s for all
   * six in one call. Almost all of the per-image cost was the round trip.
   */
  const groups: { file: SourceFile; page: SourceFile['pages'][number] }[][] = [];
  for (let i = 0; i < tasks.length; i += opts.batchSize ?? DEFAULT_BATCH) groups.push(tasks.slice(i, i + (opts.batchSize ?? DEFAULT_BATCH)));

  const results = await mapPool(
    groups,
    async (group) => {
      const items: BatchItem[] = group.map(({ file, page }, i) => ({
        label: `img-${i + 1}`,
        fileName: file.fileName, filePath: file.filePath,
        imageBase64: page.imageBase64, mimeType: page.mimeType,
      }));
      try {
        const byLabel = await extractBatchWithVision(items, cfg);
        // Index-aligned back onto the group, so a missing label is one unread page rather than
        // a silent shift of every later result onto the wrong document.
        return items.map((it) => byLabel.get(it.label) ?? null);
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
  // One pool result now covers a whole group, so it is unpacked back onto the pages that went
  // into it. A group's failure is every page in that group's failure, reported per page — the
  // row still says what happened to THAT document, which is the only level the reader can act at.
  for (const [gi, r] of results.entries()) {
    for (const [pi, { file, page }] of groups[gi].entries()) {
      wroteByFile.set(file.fileName, wroteByFile.get(file.fileName) ?? false);
      const fp = patchFor(file.fileName);
      const one = r.status === 'done' ? r.value[pi] : null;
      if (one) {
        const wrote = mergeOne(`${file.fileName} (${page.pageLabel})`, one, fp);
        if (wrote) wroteByFile.set(file.fileName, true);
        continue;
      }
      failedByFile.set(file.fileName, true);
      if (r.status === 'done') {
        // The call succeeded but this image came back without an entry. Never treated as an
        // empty read: the model was shown it and said nothing about it, which is not the same
        // as looking and finding nothing, and the difference is the point of this whole module.
        fp.failures.push({
          fileName: file.fileName, pageLabel: page.pageLabel, rateLimit: null,
          message: `Read as part of a batch of ${groups[gi].length}, but the model returned no result for this image. Re-read it on its own.`,
        });
        continue;
      }
      if (r.status === 'skipped') {
        fp.failures.push({
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
      fp.failures.push({
        fileName: file.fileName,
        pageLabel: page.pageLabel,
        message: msg,
        rateLimit: r.error instanceof VisionExtractionError ? r.error.rateLimit : null,
      });
      fp.assumptions.push(`${file.fileName} (${page.pageLabel}): extraction failed — ${msg}`);
    }
  }

  // "Empty" means the model looked and found nothing. A file whose pages all failed was never
  // read at all, and calling that empty would be the same false assurance coverage.ts exists
  // to prevent.
  for (const [fileName, wrote] of wroteByFile) if (!wrote && !failedByFile.get(fileName)) patchFor(fileName).emptyFiles.push(fileName);

  // The merged patch is assembled from the per-file ones, in input order, so the two can never
  // disagree about what a given document yielded.
  for (const file of files) {
    const fp = byFile.get(file.fileName);
    if (fp) mergePatch(patch, fp);
  }
  patch.byFile = Object.fromEntries(byFile);
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