// Thin wrapper around the Groq API (OpenAI-compatible /chat/completions) for both vision and
// text extraction. One provider, one model, for the pilot — kept isolated from
// extraction-service.ts so swapping provider/model later touches one file, not the extraction
// logic. qwen/qwen3.6-27b is Groq's current multimodal model; Groq flags it as a preview model,
// so this file degrades to plain JSON mode if strict json_schema mode isn't accepted, rather
// than hard-failing the whole pilot on a provider-side capability gap.
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
  model?: string; // defaults to qwen/qwen3.6-27b
  baseUrl?: string; // defaults to Groq's OpenAI-compatible endpoint
}

const DEFAULT_MODEL = 'qwen/qwen3.6-27b';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

// Groq's free/on-demand tier caps tokens-per-minute — reading several site photos back-to-back
// during a folder scan can burst past that limit within a single minute even though each
// individual request is well-formed. Groq's own 429 body names exactly how long to wait
// ("Please try again in 9.15s"), so retrying on that schedule turns a real but transient rate
// limit into an automatic short pause instead of a failure the person has to manually retry.
const MAX_RATE_LIMIT_RETRIES = 3;
const DEFAULT_RETRY_WAIT_MS = 5000;
const MAX_RETRY_WAIT_MS = 20000;

/**
 * Which limit was hit. The two are nothing alike and must not be handled alike: a per-minute
 * limit clears while you wait, a per-day one does not. Sleeping and retrying against a daily
 * cap ("try again in 22m23.52s") just burns three more attempts and 60 seconds per image
 * across a 130-image folder, and every one of them still fails.
 */
export type RateLimitScope = 'minute' | 'day' | null;

export function rateLimitScopeOf(body: string): RateLimitScope {
  if (/per\s*day|\bTPD\b|\bRPD\b/i.test(body)) return 'day';
  if (/per\s*minute|\bTPM\b|\bRPM\b|rate.?limit/i.test(body)) return 'minute';
  return null;
}

/**
 * The wait Groq's own 429 body names ("Please try again in 9.15s", or "in 22m23.52s" when the
 * daily cap is what you hit), in milliseconds. Null when the body names no figure. The minutes
 * and hours forms matter: the previous seconds-only pattern silently missed "22m23.52s" and
 * retried against a 22-minute wall three times, five seconds apart.
 */
export function parseRetryWaitMs(errorText: string): number | null {
  const m = errorText.match(/try again in ((?:[\d.]+\s*[hms])+)/i);
  if (!m) return null;
  let ms = 0;
  for (const [, value, unit] of m[1].matchAll(/([\d.]+)\s*([hms])/g)) {
    const n = parseFloat(value);
    ms += unit === 'h' ? n * 3600_000 : unit === 'm' ? n * 60_000 : n * 1000;
  }
  return Math.ceil(ms) + 500; // safety margin — Groq's figure is the earliest possible moment
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
 * qwen/qwen3.6-27b on Groq falls back to json_object mode (no strict schema enforcement).
 * In that mode the model invents a different outer wrapper structure on almost every call.
 * Observed variants so far:
 *
 *   v1 — { fileType, filePath, extractionDate, confidenceScore, lowConfidenceNotes: string,
 *           extractedData: { siteConditions, trades, dates, quantities, issues } }
 *
 *   v2 — { extractionResult: { fileMetadata: { fileName, filePath, fileType },
 *           siteObservations: [{ description, trade, locator }] } }
 *
 * This function hunts through all known wrapper keys and known field-name aliases to produce
 * a clean ExtractionResult regardless of which variant fired. Every branch is defensive:
 * if the field already has the right shape it is kept as-is.
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

/**
 * Runs one file's page-image(s) through Groq's vision model and returns a validated ExtractionResult.
 * Callers pass one image per call — extraction-service.ts handles fan-out across a
 * multi-page PDF and merging the per-page results.
 */
export async function extractWithVision(input: VisionInput, cfg: VisionClientConfig): Promise<ExtractionResult> {
  const model = cfg.model ?? DEFAULT_MODEL;
  const baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL;

  const messages = [
    { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
    {
      role: 'user',
      content: [
        { type: 'text', text: userPromptFor(input.fileName, input.filePath) },
        { type: 'image_url', image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` } },
      ],
    },
  ];

  const rawCall = (responseFormat: Record<string, unknown>) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model, messages, response_format: responseFormat, temperature: 0,
        // Groq's vision docs use max_completion_tokens (not max_tokens) for this model, and
        // reasoning_effort: 'none' turns off Qwen 3.6's default "thinking" mode — without it,
        // the model spends its token budget on internal reasoning before ever writing the
        // actual JSON, which is exactly what produced Groq's "failed_generation: ''" error in
        // practice on a plain extraction task that needs no multi-step reasoning at all.
        max_completion_tokens: 2048, reasoning_effort: 'none',
      }),
    });

  // Retries on both 429 (rate limit, with Groq's own suggested wait) and 400 (a reasoning model
  // can still fail structured output on a given image somewhat probabilistically even with
  // reasoning off) — a couple of extra attempts costs little against how disruptive a dropped
  // image is to a folder scan.
  const call = async (responseFormat: Record<string, unknown>, retriesOn400 = 1): Promise<Response> => {
    let res = await rawCall(responseFormat);
    for (let attempt = 0; res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
      const text = await res.clone().text().catch(() => '');
      // A daily cap does not clear by waiting, and neither does a wait longer than this client
      // will sit through — give the batch back its error immediately in both cases.
      if (rateLimitScopeOf(text) === 'day') break;
      const wait = parseRetryWaitMs(text) ?? DEFAULT_RETRY_WAIT_MS;
      if (wait > MAX_RETRY_WAIT_MS) break; // longer than this client will sit through
      await sleep(wait);
      res = await rawCall(responseFormat);
    }
    for (let attempt = 0; res.status === 400 && attempt < retriesOn400; attempt++) {
      res = await rawCall(responseFormat);
    }
    return res;
  };

  let res: Response;
  try {
    res = await call({ type: 'json_schema', json_schema: EXTRACTION_JSON_SCHEMA });
    // qwen3.6-27b is a Groq preview model — if strict schema mode isn't accepted for it yet,
    // fall back to plain JSON mode. The system prompt already spells out the required shape,
    // so json_object mode still gets us usable (if unvalidated) JSON.
    if (res.status === 400) {
      res = await call({ type: 'json_object' }, 2);
    }
  } catch (err) {
    throw new VisionExtractionError(`Network error calling Groq for ${input.fileName}`, input.fileName, err);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const scope = res.status === 429 ? rateLimitScopeOf(text) ?? 'minute' : null;
    const hint =
      scope === 'day'
        ? " (the account's daily token allowance is spent — nothing more can be read until it resets; the plan can still be built from what was read)"
        : scope === 'minute'
          ? ' (rate limit persisted after retrying — try again shortly, or read fewer images at once)'
          : '';
    throw new VisionExtractionError(`Groq returned ${res.status} for ${input.fileName}: ${text.slice(0, 300)}${hint}`, input.fileName, undefined, scope);
  }

  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) throw new VisionExtractionError(`Groq returned no content for ${input.fileName}`, input.fileName);

  let parsed: ExtractionResult;
  try {
    parsed = normalizeModelResponse(JSON.parse(raw), input.fileName);
  } catch (err) {
    throw new VisionExtractionError(`Groq returned invalid JSON for ${input.fileName}`, input.fileName, err);
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