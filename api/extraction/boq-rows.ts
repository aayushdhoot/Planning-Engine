// POST /api/extraction/boq-rows
// Body: { fileName, filePath, pages: [{ imageBase64, mimeType, pageLabel }] }
// Returns: { pages: BoqPageRows[], failures: [{ pageLabel, message, rateLimit }] }
//
// The sibling of extract.ts, for the one document type the generic vision path cannot serve: a
// priced BOQ issued as a PDF. This route only transcribes — it returns the table as rows and
// leaves every judgement about what a BOQ row means to services/ingestion.ts' parseBoq in the
// browser, which is the same parser the Excel path uses. Nothing about "what a package is"
// lives on this side of the wire.
import { readBoqPage, type BoqPageRows } from '../../src/services/extraction/boq-vision';
import { mapPool } from '../../src/services/extraction/pool';
import { lanesFromEnv, VisionExtractionError, type RateLimitScope, type VisionInput } from '../../src/services/extraction/vision-client';

export const config = { runtime: 'edge' };

interface PageIn {
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg';
  pageLabel: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });

  // An ordered chain, not one key: when a model reports its DAILY allowance spent the run
  // moves to the next rather than leaving the rest of the folder unread. See lanesFromEnv.
  const lanes = lanesFromEnv(process.env as Record<string, string | undefined>, 'quality');
  const apiKey = lanes[0]?.apiKey;
  if (!apiKey)
    return new Response(JSON.stringify({ error: 'No extraction model is configured on the server — set GEMINI_EXTRACTION_API_KEY, GROQ_API_KEY, or both.' }), { status: 500 });

  let body: { fileName?: string; filePath?: string; pages?: PageIn[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const fileName = body.fileName ?? 'BOQ';
  const filePath = body.filePath ?? fileName;
  const pages = body.pages ?? [];
  if (!pages.length) return new Response(JSON.stringify({ error: 'pages[] is required' }), { status: 400 });
  if (pages.length > 60)
    return new Response(JSON.stringify({ error: `${pages.length} pages requested; 60 per call is the current cap. Split the request.` }), { status: 400 });

  const cfg = { apiKey, lanes };

  // Same rule as extraction-service.ts: a spent DAILY allowance stops the batch, because no
  // page queued behind it can possibly succeed. A per-minute limit is retried inside the client.
  let halted: RateLimitScope = null;

  const results = await mapPool<PageIn, BoqPageRows>(
    pages,
    async (page) => {
      const input: VisionInput = { fileName, filePath, imageBase64: page.imageBase64, mimeType: page.mimeType };
      try {
        return await readBoqPage(input, page.pageLabel, cfg);
      } catch (err) {
        if (err instanceof VisionExtractionError && err.rateLimit === 'day') halted = 'day';
        throw err;
      }
    },
    // Two at a time, for the same reason DEFAULT_CONCURRENCY is 2 in extraction-service.ts —
    // the browser already holds one shared pace across the whole folder scan, and a long BOQ
    // must not burst past it on its own.
    { concurrency: 2, shouldStop: () => halted !== null },
  );

  const out: BoqPageRows[] = [];
  const failures: { pageLabel: string; message: string; rateLimit: RateLimitScope }[] = [];
  for (const [i, r] of results.entries()) {
    const page = pages[i];
    if (r.status === 'done') {
      out.push(r.value);
      continue;
    }
    if (r.status === 'skipped') {
      failures.push({
        pageLabel: page.pageLabel,
        rateLimit: halted,
        message:
          halted === 'day'
            ? 'Not attempted — the daily token allowance was already spent by an earlier page of this BOQ.'
            : 'Not attempted — the batch was stopped before this page was reached.',
      });
      continue;
    }
    failures.push({
      pageLabel: page.pageLabel,
      message: r.error instanceof Error ? r.error.message : String(r.error),
      rateLimit: r.error instanceof VisionExtractionError ? r.error.rateLimit : null,
    });
  }

  return new Response(JSON.stringify({ pages: out, failures }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}
