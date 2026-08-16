// POST /api/extraction/extract
// Body: { files: SourceFile[] }  — page images already rendered upstream (intake step).
// Returns: ExtractionPatch, for the caller to merge into the project's stored ProjectInputs
// via applyExtractionPatch() and then persist + trigger a recompute.
//
// This route does not write to Supabase itself — kept a pure function of its input, same
// reasoning as clientView() staying a pure transform in planner.ts. The caller decides what to
// do with the patch (this keeps a manual "review before apply" step possible later, and matches
// the approve-before-save pattern already agreed for the replanning agent).
import { extractProjectDocuments, type SourceFile } from '../../src/services/extraction/extraction-service';

export const config = { runtime: 'edge' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405 });
  }

  // Deliberately a separate key/model from GEMINI_API_KEY (used by the AI planning assistant
  // elsewhere in the app) — keeping extraction's read volume on its own key means a heavy
  // folder scan never eats into the assistant's quota, and vice versa.
  const apiKey = process.env.GEMINI_EXTRACTION_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'GEMINI_EXTRACTION_API_KEY is not configured on the server' }), { status: 500 });
  }

  let body: { files?: SourceFile[] };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 });
  }

  const files = body.files ?? [];
  if (!files.length) {
    return new Response(JSON.stringify({ error: 'files[] is required — at least one file with rendered page images' }), { status: 400 });
  }
  // Cap payload size defensively — the free/developer Groq tier has real rate limits (requests
  // and tokens per minute, and a whole-day token allowance). Pages inside one call run through
  // a small pool and a spent daily allowance stops the batch (see extraction-service.ts), so a
  // rate limit now comes back as per-page `failures` rather than a wall of retries; this cap is
  // about payload size. Adjust once real project volumes and the tier are known.
  const totalPages = files.reduce((n, f) => n + f.pages.length, 0);
  if (totalPages > 60) {
    return new Response(JSON.stringify({ error: `${totalPages} pages requested; 60 per call is the current cap. Split the request.` }), { status: 400 });
  }

  try {
    const patch = await extractProjectDocuments(files, { apiKey, model: process.env.GEMINI_EXTRACTION_MODEL ?? 'gemini-3.5-flash-lite' });
    return new Response(JSON.stringify(patch), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), { status: 502 });
  }
}