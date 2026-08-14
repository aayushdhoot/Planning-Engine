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
import { imageMimeFor, prepareImagePage, renderPdfPages, PdfRenderError, type PageImage } from './rasterize';

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
