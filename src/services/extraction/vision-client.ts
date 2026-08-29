// Thin wrapper around the Gemini API (generateContent) for both vision and text extraction.
// One provider, one model, for the pilot — kept isolated from extraction-service.ts so swapping
// provider/model later touches one file, not the extraction logic.
//
// This replaces the earlier Groq/Qwen implementation (kept as an inert reference file,
// vision-client.groq-reference.ts.txt, alongside this one — not imported anywhere). The move
// was purely about rate limits: Groq's free/on-demand tier for the vision model this pilot used
// capped out on tokens-per-day well before a real folder scan finished. Gemini's flash-tier
// limits are the more workable fit for reading a batch of site photos and PDFs.
//
// Note: this uses a SEPARATE Gemini API key/model from the one used elsewhere in the app for
// the AI planning assistant (GEMINI_API_KEY / GEMINI_REPLAN_MODEL). Keeping them distinct means
// this pilot's read volume never eats into the assistant's quota, and vice versa. See
// GEMINI_EXTRACTION_API_KEY / GEMINI_EXTRACTION_MODEL below.
import { EXTRACTION_JSON_SCHEMA, type ExtractionResult, type ExtractedSiteCondition } from './types';
import { EXTRACTION_SYSTEM_PROMPT, userPromptFor } from './prompts';

export interface VisionInput {
  fileName: string;
  filePath: string;
  /** base64-encoded page/photo image, no data: prefix */
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

export interface VisionClientConfig {
  apiKey: string;
  model?: string; // defaults to gemini-3.5-flash-lite
  baseUrl?: string; // defaults to Gemini's generateContent endpoint root
}

const DEFAULT_MODEL = 'gemini-3.5-flash-lite';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

// Gemini's free/pay-as-you-go tiers still enforce requests-per-minute and tokens-per-minute
// ceilings — reading several site photos back-to-back during a folder scan can burst past that
// within a single minute even though each individual request is well-formed. Gemini's 429 body
// names a RetryInfo.retryDelay ("20s"), so retrying on that schedule turns a real but transient
// rate limit into an automatic short pause instead of a failure the person has to manually retry.
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_WAIT_MS = 5000;
/**
 * The longest wait this client sits through before handing the refusal back.
 *
 * It was 20s. Gemini routinely names 25-60s once a minute-window is genuinely spent, so the
 * client gave up on precisely the waits it should have honoured and the file came back as a hard
 * failure. Outlasting a long pause is not this client's job in any case — the caller's rate gate
 * holds the whole run behind one shared timer and puts the file back on the queue. This ceiling
 * only decides how long to hold a socket open rather than hand the refusal up.
 */
const MAX_RETRY_WAIT_MS = 45000;

/**
 * Which limit was hit. Gemini's per-day quota (free tier) does not clear by waiting; a
 * per-minute one does. Sleeping and retrying against a daily cap just burns attempts and time
 * across a large folder, and every one of them still fails — so this distinction still matters
 * exactly as it did with Groq.
 */
export type RateLimitScope = 'minute' | 'day' | null;

export function rateLimitScopeOf(body: string): RateLimitScope {
  if (/per\s*day|daily|\bRPD\b/i.test(body)) return 'day';
  if (/per\s*minute|\bRPM\b|\bTPM\b|rate.?limit|RESOURCE_EXHAUSTED/i.test(body)) return 'minute';
  return null;
}

/**
 * The wait Gemini's own 429 body names, in milliseconds. Gemini reports this as a structured
 * `RetryInfo.retryDelay` field (e.g. "20s", "1.5s") inside error.details, not as free text like
 * Groq's — this reads that field first and falls back to scanning the message text for a
 * "retry in Ns" style phrase in case the shape varies.
 */
export function parseRetryWaitMs(errorText: string): number | null {
  // Structured form: "retryDelay":"20s" or "retryDelay":"1.500s"
  const structured = errorText.match(/"retryDelay"\s*:\s*"([\d.]+)s"/i);
  if (structured) return Math.ceil(parseFloat(structured[1]) * 1000) + 500;

  // Free-text fallback, same units-aware parsing as before.
  const m = errorText.match(/(?:try again in|retry in) ((?:[\d.]+\s*[hms])+)/i);
  if (!m) return null;
  let ms = 0;
  for (const [, value, unit] of m[1].matchAll(/([\d.]+)\s*([hms])/g)) {
    const n = parseFloat(value);
    ms += unit === 'h' ? n * 3600_000 : unit === 'm' ? n * 60_000 : n * 1000;
  }
  return Math.ceil(ms) + 500; // safety margin — the figure named is the earliest possible moment
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VisionExtractionError extends Error {
  constructor(
    message: string,
    public readonly fileName: string,
    public readonly cause?: unknown,
    /** set when the provider refused on a rate limit, so a batch can stop instead of retrying
     * the same wall 129 more times */
    public readonly rateLimit: RateLimitScope = null,
  ) {
    super(message);
    this.name = 'VisionExtractionError';
  }
}

/**
 * Coerces the raw model JSON into ExtractionResult shape.
 *
 * Gemini is asked for `responseMimeType: 'application/json'` with the required shape spelled
 * out in the system prompt (see extractWithVision below — Gemini's OpenAPI-subset
 * responseSchema doesn't support the `type: [x, 'null']` unions this schema uses, so this pilot
 * relies on prompt-enforced JSON rather than a strict schema, same fallback posture the old
 * Groq client had for its json_object mode). This function is kept from that client for the
 * same reason: even prompt-enforced JSON can drift in shape between calls, so this hunts through
 * known wrapper keys and field-name aliases to produce a clean ExtractionResult regardless.
 *
 *   v1 — { fileType, filePath, extractionDate, confidenceScore, lowConfidenceNotes: string,
 *           extractedData: { siteConditions, trades, dates, quantities, issues } }
 *
 *   v2 — { extractionResult: { fileMetadata: { fileName, filePath, fileType },
 *           siteObservations: [{ description, trade, locator }] } }
 *
 * Every branch is defensive: if the field already has the right shape it is kept as-is.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeModelResponse(raw: any, fileName: string): ExtractionResult {
  const wasNonStandard = !raw.kind || raw.fileType || raw.extractedData || raw.extractionResult;

  // ── 1. Unwrap outer containers ────────────────────────────────────────────
  // v2 wraps everything in raw.extractionResult
  if (raw.extractionResult && typeof raw.extractionResult === 'object') {
    raw = raw.extractionResult;
  }
  // v1 wraps data arrays in raw.extractedData
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const src: any = (raw.extractedData && typeof raw.extractedData === 'object') ? raw.extractedData : raw;

  // ── 2. kind ───────────────────────────────────────────────────────────────
  const KIND_MAP: Record<string, ExtractionResult['kind']> = {
    site_photo: 'site_image', site_image: 'site_image', image: 'site_image',
    contract: 'contract',
    make_list: 'make_list', make_list_photo: 'make_list',
    sales_kt: 'sales_kt',
    drawing_or_3d: 'drawing_or_3d', drawing: 'drawing_or_3d', '3d': 'drawing_or_3d',
    unknown: 'unknown',
  };
  // fileMetadata.fileType (v2) || raw.fileType (v1) || raw.kind (correct)
  const rawKind: string =
    raw.kind ??
    (raw.fileMetadata && typeof raw.fileMetadata === 'object' ? raw.fileMetadata.fileType : undefined) ??
    raw.fileType ??
    'unknown';
  const kind: ExtractionResult['kind'] = KIND_MAP[String(rawKind).toLowerCase()] ?? 'unknown';

  // ── 3. siteConditions ─────────────────────────────────────────────────────
  // Absorb from all observed field names:
  //   siteConditions[]   → correct shape, note may be called description
  //   siteObservations[] → v2 name, description instead of note
  //   trades[]           → v1 extra field, only trade+status+locator
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const toSiteCondition = (item: any): ExtractedSiteCondition | null => {
    if (!item || typeof item !== 'object') return null;
    const note: string = item.note ?? item.description ?? item.observation ?? '';
    if (!note) return null;
    return {
      trade: item.trade ?? 'general',
      status: item.status ?? 'in_progress',
      note,
      locator: item.locator ?? undefined,
    };
  };

  const siteConditions: ExtractionResult['siteConditions'] = [];
  for (const item of [...(src.siteConditions ?? []), ...(src.siteObservations ?? []), ...(src.trades ?? [])]) {
    const mapped = toSiteCondition(item);
    if (mapped) siteConditions.push(mapped);
  }

  // ── 4. materialItems ──────────────────────────────────────────────────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const materialItems: ExtractionResult['materialItems'] = (src.materialItems ?? src.materials ?? []).filter((m: any) =>
    m && typeof m === 'object' && (m.item || m.name),
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ).map((m: any) => ({ ...m, item: m.item ?? m.name }));

  // ── 5. scopeNotes & designRefs ────────────────────────────────────────────
  const scopeNotes: ExtractionResult['scopeNotes'] = Array.isArray(src.scopeNotes) ? src.scopeNotes : [];
  const designRefs: ExtractionResult['designRefs'] = Array.isArray(src.designRefs) ? src.designRefs : [];

  // ── 6. lowConfidenceNotes — always string[] ───────────────────────────────
  const rawNotes = raw.lowConfidenceNotes ?? src.lowConfidenceNotes ?? raw.confidenceNotes;
  let lowConfidenceNotes: string[] = [];
  if (Array.isArray(rawNotes)) {
    lowConfidenceNotes = rawNotes.map(String);
  } else if (rawNotes != null) {
    lowConfidenceNotes = [String(rawNotes)];
  }

  if (wasNonStandard) {
    console.warn(
      `[vision-client] normalizeModelResponse: "${fileName}" returned non-standard shape — remapped automatically.`,
      { topLevelKeys: Object.keys(raw) },
    );
    lowConfidenceNotes.push(
      `[auto-normalised] model returned a non-standard JSON shape for ${fileName}; data was remapped automatically.`,
    );
  }

  return { kind, contract: raw.contract ?? null, siteConditions, materialItems, scopeNotes, designRefs, lowConfidenceNotes };
}

/** Strips the schema down to a plain description of the required shape for the system prompt.
 * Gemini's responseSchema field only supports a restricted OpenAPI subset (no `type: [x,'null']`
 * unions, which EXTRACTION_JSON_SCHEMA uses throughout for optional fields), so rather than
 * fight that mismatch this pilot leans on `responseMimeType: 'application/json'` plus the
 * existing prompt — which already spells out the required shape — same fallback posture the old
 * Groq client used for its own json_object mode. EXTRACTION_JSON_SCHEMA stays imported so this
 * file still fails to compile if that schema's shape changes without this comment being revisited.
 */
void EXTRACTION_JSON_SCHEMA;

/**
 * Runs one file's page-image(s) through Gemini's vision model and returns a validated
 * ExtractionResult. Callers pass one image per call — extraction-service.ts handles fan-out
 * across a multi-page PDF and merging the per-page results.
 */
export async function extractWithVision(input: VisionInput, cfg: VisionClientConfig): Promise<ExtractionResult> {
  const model = cfg.model ?? DEFAULT_MODEL;
  const baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/${model}:generateContent`;

  const body = {
    system_instruction: { parts: [{ text: EXTRACTION_SYSTEM_PROMPT }] },
    contents: [
      {
        role: 'user',
        parts: [
          { text: userPromptFor(input.fileName, input.filePath) },
          { inline_data: { mime_type: input.mimeType, data: input.imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens: 3072,
      // Flash/Flash-Lite models spend a chunk of latency on an internal "thinking" pass by
      // default, even for a plain extraction task with no multi-step reasoning. This is a
      // straight vision-to-JSON read, so there's nothing to think through — budget 0 skips
      // straight to writing the answer.
    },
  };

  const rawCall = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.apiKey },
      body: JSON.stringify(body),
    });

  // Retries on both 429 (rate limit, with Gemini's own suggested wait) and 5xx (transient
  // server-side hiccups) — a couple of extra attempts costs little against how disruptive a
  // dropped image is to a folder scan.
  let res: Response;
  try {
    res = await rawCall();
    for (let attempt = 0; res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
      const text = await res.clone().text().catch(() => '');
      // A daily cap does not clear by waiting, and neither does a wait longer than this client
      // will sit through — give the batch back its error immediately in both cases.
      if (rateLimitScopeOf(text) === 'day') break;
      const wait = parseRetryWaitMs(text) ?? DEFAULT_RETRY_WAIT_MS;
      if (wait > MAX_RETRY_WAIT_MS) break; // longer than this client will sit through
      await sleep(wait);
      res = await rawCall();
    }
    for (let attempt = 0; res.status >= 500 && attempt < 2; attempt++) {
      res = await rawCall();
    }
  } catch (err) {
    throw new VisionExtractionError(`Network error calling Gemini for ${input.fileName}`, input.fileName, err);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const scope = res.status === 429 ? rateLimitScopeOf(text) ?? 'minute' : null;
    const hint =
      scope === 'day'
        ? " (the account's daily quota is spent — nothing more can be read until it resets; the plan can still be built from what was read)"
        : scope === 'minute'
          ? ' (rate limit persisted after retrying — try again shortly, or read fewer images at once)'
          : '';
    throw new VisionExtractionError(`Gemini returned ${res.status} for ${input.fileName}: ${text.slice(0, 300)}${hint}`, input.fileName, undefined, scope);
  }

  const json = await res.json();
  // Gemini can also refuse via a finishReason (SAFETY, RECITATION, etc.) with no text at all —
  // that shows up as an empty candidates[]/parts[] rather than an HTTP error.
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    const finishReason = json?.candidates?.[0]?.finishReason;
    const why = finishReason ? ` (finishReason: ${finishReason})` : '';
    throw new VisionExtractionError(`Gemini returned no content for ${input.fileName}${why}`, input.fileName);
  }

  let parsed: ExtractionResult;
  try {
    parsed = normalizeModelResponse(JSON.parse(raw), input.fileName);
  } catch (err) {
    throw new VisionExtractionError(`Gemini returned invalid JSON for ${input.fileName}`, input.fileName, err);
  }
  // extraction-service.ts's mergeOne() never has to null-check every field.
  parsed.lowConfidenceNotes ??= [];

  // Diagnostic: when the model claims it found nothing at all (every array empty, no
  // contract, no notes), print the raw response so this can actually be inspected instead of
  // guessed at. Cheap to leave in — only fires on the "nothing extracted" path.
  const foundNothing =
    !parsed.contract && !parsed.siteConditions?.length && !parsed.materialItems?.length &&
    !parsed.scopeNotes?.length && !parsed.designRefs?.length && !parsed.lowConfidenceNotes.length;
  if (foundNothing) {
    console.log(`[vision-client] "${input.fileName}" — model returned nothing usable. Raw response:\n${raw.slice(0, 2000)}`);
    // A defensive backstop, not a substitute for the prompt instruction — if the model ignores
    // rule 5 and returns a genuinely empty result with no explanation, inject one here rather
    // than let the UI show a silent "nothing usable was found" with zero diagnostic value.
    parsed.lowConfidenceNotes.push(
      `${input.fileName}: model returned an empty result with no explanation — the image may be unreadable, blank, or too low-quality to interpret.`,
    );
  }

  return parsed;
}