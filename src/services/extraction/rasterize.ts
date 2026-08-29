// Browser-side rasterisation — the step that turns file bytes into the page images the vision
// model actually accepts. Two jobs, one shared reason: token cost.
//
// 1. Site photos are down-scaled before upload. Groq bills a vision request by image
//    resolution, and a folder of 130 full-size WhatsApp photos is exactly what exhausted a
//    whole day's allowance in a single scan ("Rate limit reached … tokens per day (TPD):
//    Limit 200000, Used 199695"). A 1024px-edge photo still shows whether the ceiling grid is
//    up, at roughly a quarter of the tokens and a fraction of the upload time.
//
// 2. PDFs are rendered to page images. There is no structural PDF parser in this engine and
//    writing one is a different project; a brand guideline or a drawing sheet is read by the
//    same vision path that already reads site photos, which is the path that demonstrably
//    works today.
//
// Everything here is browser-only (canvas, createImageBitmap). The pure geometry/paging
// decisions are exported separately so they can be tested without a DOM.

/** Longest edge, in pixels, a site photo is scaled down to before upload. */
export const SITE_IMAGE_MAX_EDGE = 1024;
/** PDF pages carry text, so they are rendered larger than photographs. */
export const PDF_PAGE_MAX_EDGE = 1600;
/** Pages read from one PDF. A 60-sheet drawing set would cost more tokens than the rest of the
 * folder put together, so the tail is reported rather than silently read or silently dropped. */
export const PDF_MAX_PAGES = 12;

/**
 * A priced BOQ is the exception to both figures above.
 *
 * The 12-page cap is right for a drawing set, where page 13 is one more sheet of the same kind
 * and the first twelve already say what the document is. It is wrong for a BOQ, where page 13
 * is HVAC and dropping it does not make the plan slightly less detailed — it makes the plan
 * cost wrong. There is exactly one such document per project, so it is read whole.
 *
 * The larger edge is for the same reason: a BOQ's figures are small print in a dense table, and
 * a 1600px render of an A4 sheet is where a 4 and a 1 start to look alike.
 */
export const BOQ_PDF_MAX_PAGES = 40;
export const BOQ_PAGE_MAX_EDGE = 2000;

const JPEG_QUALITY = 0.72;

export interface PageImage {
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg';
  pageLabel: string;
}

const EXT_MIME: Record<string, 'image/png' | 'image/jpeg'> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};

export function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

export function imageMimeFor(fileName: string): 'image/png' | 'image/jpeg' | null {
  return EXT_MIME[extOf(fileName)] ?? null;
}

/**
 * Scale factor that fits an image inside `maxEdge`. Never upscales: a small photo is already
 * cheap, and enlarging it would cost tokens without adding detail.
 */
export function scaleFor(width: number, height: number, maxEdge: number): number {
  const longest = Math.max(width, height);
  if (!Number.isFinite(longest) || longest <= 0) return 1;
  return Math.min(1, maxEdge / longest);
}

/**
 * Which pages of a PDF are read, and what to tell the user about the ones that are not.
 * Split out from the rendering so the cap is testable without a PDF or a DOM.
 */
export function pagePlan(totalPages: number, maxPages = PDF_MAX_PAGES): { pages: number[]; note: string | null } {
  const take = Math.min(totalPages, maxPages);
  const pages = Array.from({ length: take }, (_, i) => i + 1);
  const note =
    totalPages > take
      ? `Only the first ${take} of ${totalPages} pages were read (page cap). Read the rest with "Prepare by hand", or split the file.`
      : null;
  return { pages, note };
}

/** ArrayBuffer -> base64 via Blob/FileReader, which avoids the call-stack overflow that
 * `btoa(String.fromCharCode(...bytes))` hits on larger images. */
export function bytesToBase64(buf: ArrayBuffer, mimeType: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(new Blob([buf], { type: mimeType }));
  });
}

function dataUrlPayload(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

function canvasOf(width: number, height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // PDF pages render transparent where the sheet is blank; without a white ground they encode
  // to a black JPEG and the model sees nothing at all.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  return { canvas, ctx };
}

/**
 * One photo -> one page image, down-scaled. Falls back to the untouched bytes if the browser
 * cannot decode it (an unusual JPEG variant, say): sending the original is slower and dearer,
 * but it is still a read, and failing the file outright would be worse.
 */
export async function prepareImagePage(bytes: ArrayBuffer, fileName: string, maxEdge = SITE_IMAGE_MAX_EDGE): Promise<PageImage> {
  const sourceMime = imageMimeFor(fileName);
  if (!sourceMime) throw new Error(`Unsupported image extension ".${extOf(fileName)}" for ${fileName}`);

  try {
    const bitmap = await createImageBitmap(new Blob([bytes], { type: sourceMime }));
    const scale = scaleFor(bitmap.width, bitmap.height, maxEdge);
    if (scale >= 1) {
      bitmap.close();
      return { imageBase64: await bytesToBase64(bytes, sourceMime), mimeType: sourceMime, pageLabel: 'image' };
    }
    const { canvas, ctx } = canvasOf(bitmap.width * scale, bitmap.height * scale);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return { imageBase64: dataUrlPayload(canvas.toDataURL('image/jpeg', JPEG_QUALITY)), mimeType: 'image/jpeg', pageLabel: 'image' };
  } catch {
    return { imageBase64: await bytesToBase64(bytes, sourceMime), mimeType: sourceMime, pageLabel: 'image' };
  }
}

// ------------------------------------------------------------------------ PDF

type PdfModule = typeof import('pdfjs-dist');
let pdfjsPromise: Promise<PdfModule> | null = null;

/**
 * pdf.js is ~1 MB and only a minority of folders hold a PDF, so it is imported on first use
 * rather than shipped in the initial bundle. The worker is inlined (`?worker&inline`) so the
 * single-file build stays a single file — there is no server to serve a separate worker asset
 * from when the app is opened as a standalone HTML file.
 */
async function loadPdfjs(): Promise<PdfModule> {
  pdfjsPromise ??= (async () => {
    const pdfjs = await import('pdfjs-dist');
    if (!pdfjs.GlobalWorkerOptions.workerPort && !pdfjs.GlobalWorkerOptions.workerSrc) {
      const { default: PdfWorker } = await import('pdfjs-dist/build/pdf.worker.min.mjs?worker&inline');
      pdfjs.GlobalWorkerOptions.workerPort = new PdfWorker();
    }
    return pdfjs;
  })();
  return pdfjsPromise;
}

export class PdfRenderError extends Error {}

/**
 * Render a PDF's pages to JPEG page images for the vision model.
 *
 * A password-protected or corrupt PDF throws PdfRenderError with pdf.js's own reason attached,
 * which is the difference between "the engine cannot read PDFs" and "this PDF is locked" — the
 * screen exists to tell those two apart.
 */
export async function renderPdfPages(
  bytes: ArrayBuffer,
  opts: { maxPages?: number; maxEdge?: number } = {},
): Promise<{ pages: PageImage[]; note: string | null }> {
  const maxEdge = opts.maxEdge ?? PDF_PAGE_MAX_EDGE;
  const pdfjs = await loadPdfjs();

  let doc: Awaited<ReturnType<PdfModule['getDocument']>['promise']>;
  try {
    // pdf.js transfers (and neutralises) the buffer it is handed, so it gets its own copy —
    // the caller's ArrayBuffer is still needed for the "Prepare by hand" fallback path.
    doc = await pdfjs.getDocument({ data: new Uint8Array(bytes.slice(0)), isEvalSupported: false }).promise;
  } catch (err) {
    throw new PdfRenderError(err instanceof Error ? err.message : String(err));
  }

  const { pages: wanted, note } = pagePlan(doc.numPages, opts.maxPages ?? PDF_MAX_PAGES);
  const pages: PageImage[] = [];
  try {
    for (const n of wanted) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: scaleFor(base.width, base.height, maxEdge) });
      const { canvas, ctx } = canvasOf(viewport.width, viewport.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      pages.push({
        imageBase64: dataUrlPayload(canvas.toDataURL('image/jpeg', JPEG_QUALITY)),
        mimeType: 'image/jpeg',
        pageLabel: `page ${n} of ${doc.numPages}`,
      });
      page.cleanup();
    }
  } finally {
    await doc.destroy();
  }

  if (!pages.length) throw new PdfRenderError('The PDF has no renderable pages.');
  return { pages, note };
}
