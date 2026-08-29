// Reading a priced BOQ that only exists as a PDF.
//
// Until now a BOQ reached the plan through exactly one door: services/ingestion.ts' parseBoq,
// which reads a workbook or a CSV. A BOQ issued as a PDF fell to the generic PDF path — every
// page rendered and read as though it were a photograph — which produces scope notes and
// material items and, by design, never touches boqPackages. So the folder screen could say a
// priced BOQ was "read" while the required-input checklist still said the engine had no priced
// BOQ, which is the false assurance engine/coverage.ts exists to prevent.
//
// The fix is deliberately not a second BOQ parser. The model's whole job here is to give back
// the table it can see, cell for cell, and the rows then go through the SAME parseBoq that
// reads the spreadsheet — same code detection, same grand-total handling, same BCS heuristic,
// same warnings. A PDF BOQ and an Excel BOQ therefore cannot disagree about what a BOQ means.
import { callGemini, VisionExtractionError, type VisionClientConfig, type VisionInput } from './vision-client';

export const BOQ_TABLE_SYSTEM_PROMPT = `You are a table transcriber for a construction bill-of-quantities. You are shown ONE page of a priced BOQ, make list or cost sheet. Transcribe the table on that page, cell for cell.

Hard rules:
1. Transcribe, never compute. Do not total a column, do not convert a unit, do not fill a blank cell with a value you inferred from another row. A blank cell is transcribed as "".
2. One array per VISUAL row of the table, cells left to right, in the page's own column order. Keep every column, including ones you think are empty or irrelevant.
3. Copy numbers exactly as printed, including separators and currency symbols — "1,23,456.00" stays "1,23,456.00". The downstream parser handles the formatting; a number you have "cleaned up" is a number that can no longer be checked against the page.
4. Keep header rows, section headings and total rows in place, as their own rows. Do not reorder anything.
5. Section/package codes ("A", "A1", "B2", "PHE", "HVAC") belong in their own leading cell, exactly as printed.
6. A merged cell spanning several columns is transcribed once, in its first column, with "" for the rest.
7. If the page carries no table at all — a cover sheet, terms and conditions, a drawing — return an empty rows array and say what the page holds in notes.

Return ONLY JSON of the form {"rows": [["cell", "cell"], ...], "notes": ["..."]}. No prose, no markdown.`;

export function boqTableUserPrompt(fileName: string, pageLabel: string): string {
  return `File: ${fileName}\nPage: ${pageLabel}\n\nTranscribe this page's table into the {"rows": [...], "notes": [...]} shape, following the system rules exactly.`;
}

/** One page's transcription. */
export interface BoqPageRows {
  pageLabel: string;
  rows: string[][];
  notes: string[];
}

/** Coerce whatever the model returned into rows of strings. Same defensive posture as
 * vision-client's normalizeModelResponse: prompt-enforced JSON drifts in shape, and a page
 * dropped over a wrapper key is a package missing from the plan. */
export function normalizeRows(raw: unknown): { rows: string[][]; notes: string[] } {
  const obj = (raw ?? {}) as Record<string, unknown>;
  const candidate =
    (Array.isArray(obj.rows) && obj.rows) ||
    (Array.isArray(obj.table) && obj.table) ||
    (Array.isArray(obj.data) && obj.data) ||
    (Array.isArray(raw) && raw) ||
    [];

  const rows: string[][] = [];
  for (const row of candidate as unknown[]) {
    if (Array.isArray(row)) {
      rows.push(row.map((c) => (c == null ? '' : String(c).trim())));
      continue;
    }
    // Some responses come back as objects keyed by column name. Values in insertion order is
    // the best available reading of the row, and is still verifiable against the page.
    if (row && typeof row === 'object') rows.push(Object.values(row as Record<string, unknown>).map((c) => (c == null ? '' : String(c).trim())));
  }

  const notes = Array.isArray(obj.notes) ? obj.notes.map((n) => String(n)) : [];
  return { rows, notes };
}

/** Transcribe one rendered BOQ page. Throws VisionExtractionError, exactly as the site-photo
 * reader does, so a folder scan's rate gate and retry logic apply unchanged. */
export async function readBoqPage(input: VisionInput, pageLabel: string, cfg: VisionClientConfig): Promise<BoqPageRows> {
  // A dense BOQ page is far more output than a site photo's handful of observations — 3072
  // tokens truncates a 40-line page mid-row, and a truncated row is a package silently priced
  // at whatever survived the cut.
  const raw = await callGemini(input, cfg, BOQ_TABLE_SYSTEM_PROMPT, boqTableUserPrompt(input.fileName, pageLabel), 16384);

  let parsed: { rows: string[][]; notes: string[] };
  try {
    parsed = normalizeRows(JSON.parse(raw));
  } catch (err) {
    throw new VisionExtractionError(`Gemini returned invalid JSON transcribing ${input.fileName} (${pageLabel})`, input.fileName, err);
  }
  return { pageLabel, rows: parsed.rows, notes: parsed.notes };
}

/**
 * Stitch per-page transcriptions into the single table parseBoq expects.
 *
 * Page boundaries are reported rather than erased. parseBoq traces every package back to a row
 * number, and "row 37" of a table assembled from six pages is not something anyone can check
 * against the document — so the row at which each page starts comes back alongside the rows,
 * for the caller to state plainly.
 */
export function stitchPages(pages: BoqPageRows[]): { rows: string[][]; pageStarts: { pageLabel: string; row: number }[] } {
  const rows: string[][] = [];
  const pageStarts: { pageLabel: string; row: number }[] = [];
  for (const p of pages) {
    if (!p.rows.length) continue;
    pageStarts.push({ pageLabel: p.pageLabel, row: rows.length + 1 });
    rows.push(...p.rows);
  }
  return { rows, pageStarts };
}
