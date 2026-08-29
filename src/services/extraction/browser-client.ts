// Browser-side extraction client. This calls YOUR OWN /api/extraction/extract route (a Vercel
// function, served locally via `vercel dev` or by the dev-server middleware in vite.config.ts)
// — it never calls Groq directly from the browser, so GROQ_API_KEY stays server-side. If the
// route isn't reachable, this throws a clear, actionable error rather than a cryptic fetch
// failure.
//
// Rasterisation happens here, before the upload: photos are down-scaled and PDFs are rendered
// to page images (see rasterize.ts). The route itself only ever sees page images, which is what
// keeps the server side a pure function of its input.
import type { ExtractionPatch, SourceFile } from './extraction-service';
import {
  imageMimeFor, prepareImagePage, renderPdfPages, PdfRenderError,
  BOQ_PDF_MAX_PAGES, BOQ_PAGE_MAX_EDGE, type PageImage,
} from './rasterize';
import { stitchPages, type BoqPageRows } from './boq-vision';

export class ExtractionClientError extends Error {}

/** What one document's read produced: the patch, plus anything the user should be told about
 * how it was read (pages capped, say) that is not itself extracted data. */
export interface ReadOutcome {
  patch: ExtractionPatch;
  notes: string[];
  /** how many page images were sent — a PDF is more than one */
  pagesRead: number;
}

/** True when the provider refused because the account's daily allowance is spent. Nothing
 * further will succeed today, so a batch reading this should stop rather than keep going. */
export function dailyLimitHit(patch: ExtractionPatch): boolean {
  return (patch.failures ?? []).some((f) => f.rateLimit === 'day');
}

/** The first real failure reason for a document, for showing on its row. */
export function firstFailure(patch: ExtractionPatch): string | null {
  const f = (patch.failures ?? []).find((x) => !x.skipped) ?? (patch.failures ?? [])[0];
  return f ? f.message : null;
}

async function pagesFor(fileName: string, bytes: ArrayBuffer, kind: 'image' | 'pdf'): Promise<{ pages: PageImage[]; notes: string[] }> {
  if (kind === 'pdf') {
    try {
      const { pages, note } = await renderPdfPages(bytes);
      return { pages, notes: note ? [note] : [] };
    } catch (err) {
      const why = err instanceof PdfRenderError ? err.message : err instanceof Error ? err.message : String(err);
      throw new ExtractionClientError(`Could not render "${fileName}" — ${why}`);
    }
  }
  if (!imageMimeFor(fileName)) throw new ExtractionClientError(`Unsupported image extension for ${fileName}`);
  return { pages: [await prepareImagePage(bytes, fileName)], notes: [] };
}

/**
 * Reads one document (a photo, or a PDF) via the server-side vision route. filePath is used
 * purely for provenance text in the resulting ExtractionPatch.
 */
export async function extractFileViaApi(
  fileName: string,
  filePath: string,
  bytes: ArrayBuffer,
  kind: 'image' | 'pdf',
): Promise<ReadOutcome> {
  const { pages, notes } = await pagesFor(fileName, bytes, kind);
  const files: SourceFile[] = [{ fileName, filePath, pages }];

  let res: Response;
  try {
    res = await fetch('/api/extraction/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
  } catch (err) {
    throw new ExtractionClientError(
      `Could not reach /api/extraction/extract — is the dev server running? (${err instanceof Error ? err.message : err})`,
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ExtractionClientError(`Extraction failed for ${fileName}: ${body.error ?? res.statusText}`);
  }

  const patch = (await res.json()) as ExtractionPatch;
  return { patch, notes, pagesRead: pages.length };
}

// ------------------------------------------------------------- priced BOQ (PDF)

/** What a PDF BOQ read produced: the table, where each page starts in it, and what to say. */
export interface BoqRowsOutcome {
  rows: string[][];
  pageStarts: { pageLabel: string; row: number }[];
  notes: string[];
  pagesRead: number;
  pagesTotal: number;
}

/**
 * Reads a priced BOQ that only exists as a PDF, into the rows services/ingestion.ts' parseBoq
 * already knows how to read.
 *
 * Deliberately NOT the same call as extractFileViaApi. That route returns an ExtractionPatch —
 * site conditions, material items, scope notes — and by design never writes boqPackages, so a
 * BOQ sent through it comes back as evidence rather than as the priced input the whole plan is
 * computed from. This one transcribes the table and hands it to the spreadsheet parser, so a
 * PDF BOQ and an Excel BOQ produce the same packages, with the same warnings.
 */
export async function extractBoqRowsViaApi(fileName: string, filePath: string, bytes: ArrayBuffer): Promise<BoqRowsOutcome> {
  let rendered: { pages: PageImage[]; note: string | null };
  try {
    rendered = await renderPdfPages(bytes, { maxPages: BOQ_PDF_MAX_PAGES, maxEdge: BOQ_PAGE_MAX_EDGE });
  } catch (err) {
    const why = err instanceof PdfRenderError ? err.message : err instanceof Error ? err.message : String(err);
    throw new ExtractionClientError(`Could not render "${fileName}" — ${why}`);
  }

  let res: Response;
  try {
    res = await fetch('/api/extraction/boq-rows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fileName, filePath, pages: rendered.pages }),
    });
  } catch (err) {
    throw new ExtractionClientError(
      `Could not reach /api/extraction/boq-rows — is the dev server running? (${err instanceof Error ? err.message : err})`,
    );
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ExtractionClientError(`BOQ transcription failed for ${fileName}: ${body.error ?? res.statusText}`);
  }

  const { pages, failures } = (await res.json()) as {
    pages: BoqPageRows[];
    failures: { pageLabel: string; message: string }[];
  };

  const { rows, pageStarts } = stitchPages(pages);

  // A page that failed is not a page that was empty. Saying "12 packages" about a BOQ whose
  // HVAC page was refused on a rate limit is the false assurance this whole screen exists to
  // prevent, so every unread page is named.
  const notes: string[] = [];
  if (rendered.note) notes.push(rendered.note);
  for (const p of pages) notes.push(...p.notes.map((n) => `${p.pageLabel}: ${n}`));
  if (failures.length)
    notes.push(
      `${failures.length} page(s) of this BOQ were NOT read (${failures.map((f) => f.pageLabel).join(', ')}) — ${failures[0].message} Any packages on them are missing from the figures below.`,
    );

  if (!rows.length)
    throw new ExtractionClientError(
      failures.length
        ? `No pages of "${fileName}" could be read — ${failures[0].message}`
        : `"${fileName}" was read, but no table rows were found on any page. If the priced table is an image scan rather than a rendered table, use "Prepare by hand" to upload the workbook.`,
    );

  return { rows, pageStarts, notes, pagesRead: pages.length, pagesTotal: rendered.pages.length };
}

// ------------------------------------------------------- several images, one request

/** One document going into a batched read. */
export interface BatchFile {
  fileName: string;
  filePath: string;
  bytes: ArrayBuffer;
  kind: 'image' | 'pdf';
}

/** What came back for one document in the batch. */
export interface BatchFileOutcome {
  patch: ExtractionPatch;
  notes: string[];
  pagesRead: number;
}

/**
 * Read SEVERAL documents in one call to the extraction route.
 *
 * The reason is queueing, not model speed. The browser paces a folder scan at twelve requests a
 * minute (see rate-gate.ts, sized to the provider's own per-minute ceiling), so 170 photographs
 * read one request each is fourteen minutes of waiting before a single model call is counted —
 * which is what a screen sitting at "0 / 170 read" actually was. One request carrying six images
 * is one gate slot instead of six.
 *
 * Rasterisation still happens per document here, so an unrenderable file fails alone rather than
 * taking its five neighbours with it: it comes back with its own note and the rest are still sent.
 */
export async function extractFilesViaApi(files: BatchFile[]): Promise<Map<string, BatchFileOutcome>> {
  const out = new Map<string, BatchFileOutcome>();
  const sources: SourceFile[] = [];
  const notesFor = new Map<string, string[]>();

  for (const f of files) {
    try {
      const { pages, notes } = await pagesFor(f.fileName, f.bytes, f.kind);
      sources.push({ fileName: f.fileName, filePath: f.filePath, pages });
      notesFor.set(f.fileName, notes);
    } catch (err) {
      out.set(f.fileName, {
        patch: { ...emptyPatchShape(), failures: [{ fileName: f.fileName, pageLabel: '—', rateLimit: null, message: err instanceof Error ? err.message : String(err) }] },
        notes: [], pagesRead: 0,
      });
    }
  }
  if (!sources.length) return out;

  let res: Response;
  try {
    res = await fetch('/api/extraction/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files: sources }),
    });
  } catch (err) {
    throw new ExtractionClientError(
      `Could not reach /api/extraction/extract — is the dev server running? (${err instanceof Error ? err.message : err})`,
    );
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ExtractionClientError(`Extraction failed for ${sources.length} document(s): ${body.error ?? res.statusText}`);
  }

  const merged = (await res.json()) as ExtractionPatch;
  for (const s of sources) {
    // A document the response says nothing about is reported as unread, never as empty — the
    // distinction the whole coverage screen exists to keep.
    const patch = merged.byFile?.[s.fileName] ?? {
      ...emptyPatchShape(),
      failures: [{ fileName: s.fileName, pageLabel: '—', rateLimit: null, message: 'The read returned no result for this document. Re-read it on its own.' }],
    };
    out.set(s.fileName, { patch, notes: notesFor.get(s.fileName) ?? [], pagesRead: s.pages.length });
  }
  return out;
}

/** The empty shape, duplicated here rather than imported so this browser module does not pull in
 * the server orchestrator just for a constructor. */
function emptyPatchShape(): ExtractionPatch {
  return {
    milestones: [], siteConditions: [], materialItems: [], scopeNotes: [], designRefs: [],
    planningAnswers: [], assumptions: [], emptyFiles: [], failures: [],
  };
}
