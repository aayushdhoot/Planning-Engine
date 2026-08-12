// Browser-side extraction client. This calls YOUR OWN /api/extraction/extract route (a Vercel
// function, served locally via `vercel dev`) — it never calls Groq directly from the browser,
// so GROQ_API_KEY stays server-side. If /api/extraction/extract isn't reachable (i.e. you're
// running plain `npm run dev` instead of `vercel dev`), this throws a clear, actionable error
// rather than a cryptic fetch failure.
import type { ExtractionPatch, SourceFile } from './extraction-service';

const EXT_MIME: Record<string, 'image/png' | 'image/jpeg'> = {
  png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
};

function extOf(name: string): string {
  return name.split('.').pop()?.toLowerCase() ?? '';
}

/** ArrayBuffer -> base64 via Blob/FileReader, which avoids the call-stack overflow that
 * `btoa(String.fromCharCode(...bytes))` hits on larger images. Blob is given the real MIME
 * type (rather than left untyped) purely for correctness — readAsDataURL doesn't need it to
 * produce the right bytes, since only the text after the comma is used, but an untyped Blob
 * is one fewer thing to rule out when something upstream looks wrong. */
function arrayBufferToBase64(buf: ArrayBuffer, mimeType: string): Promise<string> {
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

export class ExtractionClientError extends Error {}

/**
 * Extracts one image file (already read as bytes by the Drive service) via the server-side
 * vision route. filePath is used purely for provenance text in the resulting ExtractionPatch.
 */
export async function extractImageViaApi(fileName: string, filePath: string, bytes: ArrayBuffer): Promise<ExtractionPatch> {
  const ext = extOf(fileName);
  const mimeType = EXT_MIME[ext];
  if (!mimeType) throw new ExtractionClientError(`Unsupported image extension ".${ext}" for ${fileName}`);

  const imageBase64 = await arrayBufferToBase64(bytes, mimeType);
  console.log(`[extraction/browser-client] ${fileName}: ${bytes.byteLength} raw bytes -> ${imageBase64.length} base64 chars, mimeType=${mimeType}`);
  const files: SourceFile[] = [{ fileName, filePath, pages: [{ imageBase64, mimeType, pageLabel: 'image' }] }];

  let res: Response;
  try {
    res = await fetch('/api/extraction/extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files }),
    });
  } catch (err) {
    throw new ExtractionClientError(
      `Could not reach /api/extraction/extract — are you running "vercel dev" instead of "npm run dev"? (${err instanceof Error ? err.message : err})`,
    );
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ExtractionClientError(`Extraction failed for ${fileName}: ${body.error ?? res.statusText}`);
  }

  return (await res.json()) as ExtractionPatch;
}