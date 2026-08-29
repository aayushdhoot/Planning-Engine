// The vision/text extraction client, behind an ordered chain of models.
//
// It was one provider and one model. A folder scan of 178 documents then spent the day's token
// allowance partway through and stopped, leaving 141 files marked "the daily allowance is spent"
// with nothing to do but come back tomorrow. Daily caps are metered per model and per provider,
// so the chain (see VisionLane below) walks to the next allowance instead of abandoning the run.
//
// Provider-specific request shapes live at the bottom, one function each; everything above them
// — the retry schedule, the rate-limit reading, the JSON normalising — is shared, so the two
// cannot drift apart on the behaviour that actually matters during a scan.
//
// Note: the extraction key/model are SEPARATE from the ones the AI planning assistant uses
// (GEMINI_API_KEY / GEMINI_REPLAN_MODEL). Keeping them distinct means a heavy folder scan never
// eats into the assistant's quota, and vice versa. See lanesFromEnv below.
import { EXTRACTION_JSON_SCHEMA, PLANNING_QUERY_KEYS, type ExtractedPlanningAnswer, type ExtractionResult, type ExtractedSiteCondition, type PlanningQueryKey } from './types';
import { BATCH_EXTRACTION_SYSTEM_PROMPT, batchUserPromptFor, EXTRACTION_SYSTEM_PROMPT, userPromptFor } from './prompts';

export interface VisionInput {
  fileName: string;
  filePath: string;
  /** base64-encoded page/photo image, no data: prefix */
  imageBase64: string;
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif';
}

/**
 * One model this client may read with. A run walks these in order.
 *
 * The chain exists because of the failure it replaces, not because more providers are better.
 * A folder scan of 178 documents spent the day's token allowance partway through and stopped:
 * 141 files sat unread with "the daily allowance is spent" against every one of them, and there
 * was nothing to do but come back tomorrow. A daily cap is per model and per provider, so the
 * work that a spent lane cannot do is work the next lane can — the batch moves across instead
 * of stopping.
 *
 * Order is quality first, headroom second. A per-MINUTE limit never advances a lane: that one
 * clears by waiting, and the caller's rate gate already holds the whole run behind one timer.
 */
export interface VisionLane {
  provider: 'gemini' | 'groq';
  model: string;
  apiKey: string;
  baseUrl?: string;
  /** shown on the row and in provenance, so it is always visible WHICH model read a document */
  label?: string;
}

export interface VisionClientConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  /** ordered fallback lanes. When absent, the single apiKey/model above is the only lane. */
  lanes?: VisionLane[];
}

/**
 * Default model.
 *
 * Was `gemini-3.5-flash-lite`, which now answers 429 "you exceeded your current quota" on this
 * account's key — the wall the whole chain below exists to get past.
 *
 * Chosen by probing THIS key with the real extraction prompt against a contract page, not from
 * a published ranking. Every model the rankings point at — `gemini-3-flash`, Llama 4 Scout —
 * 404s on these keys, so a ranking alone would have shipped a default that cannot be called.
 * Of what is actually reachable, three read the page equally well (10 of 12 planning answers,
 * the two it left out genuinely absent from the page) and differed only in speed and
 * availability: 3.5-flash 37.2s, 3.6-flash 14.9s, 3-flash-preview 9.2s, 3.7-flash a 503.
 * 3.6-flash is the pick — full marks, two and a half times faster than 3.5, and not a preview.
 *
 * Claude Sonnet 4.6 was the other candidate and is deliberately not here. It scores higher on
 * complex layouts overall, but the PDF table-extraction study finds it strongly bimodal on
 * tables: near-perfect, or the table omitted entirely. For a priced BOQ a silently missing
 * table is far worse than one read imperfectly — one is a wrong plan, the other is a warning
 * on a row.
 */
const DEFAULT_MODEL = 'gemini-3.6-flash';
/**
 * The lead model for photographs.
 *
 * A different model from the exhausted gemini-3.5-flash-lite, and the fastest thing this key can
 * reach: six real site photos in one call returned in 3.5s against 12.3s on 3.6-flash and 13.7s
 * on 3-flash-preview, for output of the same shape and depth. On a folder that is mostly
 * photographs that is the difference the person watching the screen actually feels.
 */
const FAST_MODEL = 'gemini-3.1-flash-lite';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';

/**
 * Lanes whose DAILY allowance is known to be spent, for the life of this process.
 *
 * Without this the first file after the cap pays the full retry schedule to discover it, then
 * so does the second, and so does the hundred and forty-first. Deliberately not persisted: a
 * daily quota resets on the provider's clock, and a stale "spent" flag would refuse a lane that
 * is working again.
 */
const spent = new Map<string, number>();
const laneKey = (l: VisionLane) => `${l.provider}:${l.model}`;

/**
 * How long a lane stays marked spent.
 *
 * It is not "until midnight Pacific", even though that is when the quotas actually reset,
 * because this process has no way to know how close to that line it is and a wrong guess in one
 * direction refuses a lane that is working again. Half an hour is long enough to save the rest
 * of a folder scan from rediscovering the wall on every file, and short enough that the memory
 * cannot outlive the reset by much.
 */
const SPENT_TTL_MS = 30 * 60 * 1000;

const isSpent = (l: VisionLane): boolean => {
  const at = spent.get(laneKey(l));
  if (at == null) return false;
  if (Date.now() - at < SPENT_TTL_MS) return true;
  spent.delete(laneKey(l));
  return false;
};

/** Forget which lanes were spent. Called between runs, and by tests. */
export function resetSpentLanes(): void {
  spent.clear();
}

/** The lanes a run will actually try, in order, given what is configured. */
export function lanesFor(cfg: VisionClientConfig): VisionLane[] {
  if (cfg.lanes?.length) return cfg.lanes;
  return [{ provider: 'gemini', model: cfg.model ?? DEFAULT_MODEL, apiKey: cfg.apiKey, baseUrl: cfg.baseUrl }];
}

/**
 * Build the chain from server environment.
 *
 * Two Gemini lanes before the third provider: Gemini meters each MODEL separately, so two Flash
 * models are two real allowances rather than two names for one — 3.5-flash-lite was refusing on
 * quota at the same moment 3.6-flash and 3.5-flash both answered.
 *
 * Groq is last on evidence rather than on principle: probed live, both vision models this key
 * can reach answered "currently over capacity" after thirty seconds, while three Gemini models
 * read the same page. It earns its place anyway — when Gemini's day is genuinely spent, a
 * congested lane that sometimes works beats a folder that stops at 37 of 178.
 */
export function lanesFromEnv(
  env: Record<string, string | undefined>,
  /**
   * Which model leads.
   *
   * 'speed' for photographs, which is nearly the whole folder — 144 of 178 in Keppel (Pune) —
   * and where a batch of six on flash-lite returned in 3.5s against 12.3s on 3.6-flash for the
   * same six. 'quality' for a priced BOQ, where a misread figure is a wrong plan and the extra
   * eight seconds is spent once on the one document the whole cost is computed from.
   *
   * The two orders share the same models, so whichever leads, the other is still behind it.
   */
  profile: 'speed' | 'quality' = 'quality',
): VisionLane[] {
  const lanes: VisionLane[] = [];
  const gemini = env.GEMINI_EXTRACTION_API_KEY;
  if (gemini) {
    const quality = env.GEMINI_EXTRACTION_MODEL ?? DEFAULT_MODEL;
    const fast = env.GEMINI_EXTRACTION_MODEL_FAST ?? FAST_MODEL;
    const backup = env.GEMINI_EXTRACTION_MODEL_2 ?? 'gemini-3.5-flash';
    const order = profile === 'speed' ? [fast, quality, backup] : [quality, fast, backup];
    for (const model of order) {
      if (lanes.some((l) => l.model === model)) continue;
      lanes.push({ provider: 'gemini', model, apiKey: gemini, label: model });
    }
  }
  const groq = env.GROQ_API_KEY;
  if (groq) {
    const model = env.GROQ_VISION_MODEL ?? 'qwen/qwen3.8-27b';
    lanes.push({ provider: 'groq', model, apiKey: groq, label: `groq/${model.split('/').pop()}` });
  }
  return lanes;
}

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

/**
 * Does this refusal mean "this request carried too much", rather than "this content is bad"?
 *
 * Providers say it in at least three ways and under two status codes. Groq answers 413 for a
 * payload that is too many bytes and 400 "Too many images provided. This model supports up to
 * 3 images" for a batch that is too long — the same problem, and both have the same answer: send
 * fewer. Matching on the words rather than the status is what makes the next providers limit,
 * whatever it turns out to be, something the batch survives.
 */
export function isTooLarge(status: number, body: string): boolean {
  if (status === 413) return true;
  return status === 400 && /too many images|request too large|payload too large|too many parts|exceeds the maximum/i.test(body);
}
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
    /** the key was rejected, not the request. Worth moving to the next lane and worth saying
     * out loud — a mistyped key otherwise reads to the user as "this document is unreadable". */
    public readonly authFailed = false,
    /** the provider answered 5xx after its retries — congested or down, which is a fact about
     * that model and not about this document. Another lane can very likely read it right now:
     * gemini-3.7-flash answered "currently experiencing high demand" on a plain probe while
     * two other models read the same page in under fifteen seconds. */
    public readonly serverBusy = false,
    /** the request itself was too big for this provider. A batch can answer that by being a
     * smaller batch; a single image cannot, and says so. */
    public readonly tooLarge = false,
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
  // ── 5b. planningAnswers ───────────────────────────────────────────────────
  // Filtered against the known key set rather than trusted: an answer filed under a key the
  // intake screen does not ask about would be silently dropped later anyway, and one filed
  // under an INVENTED key would prefill nothing while looking like it had. Both are better
  // reported here, where the file name is still in hand.
  const planningAnswers: ExtractedPlanningAnswer[] = (Array.isArray(src.planningAnswers) ? src.planningAnswers : [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((a: any) => a && typeof a === 'object' && PLANNING_QUERY_KEYS.includes(a.key) && String(a.value ?? '').trim())
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => ({ key: a.key as PlanningQueryKey, value: String(a.value).trim(), locator: a.locator ?? undefined }));
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

  return { kind, contract: raw.contract ?? null, siteConditions, materialItems, scopeNotes, designRefs, planningAnswers, lowConfidenceNotes };
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
  const raw = await callGemini(input, cfg, EXTRACTION_SYSTEM_PROMPT, userPromptFor(input.fileName, input.filePath), 3072);

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

/**
 * One page image -> the model's raw JSON text, with the retry, rate-limit and refusal handling
 * every caller needs and none of the schema-specific parsing.
 *
 * Split out of extractWithVision when the priced-BOQ reader arrived: a BOQ page is read with a
 * different prompt into a different shape, but it hits the identical 429s during a folder scan,
 * and duplicating this loop is how the two would quietly drift apart.
 */
export async function callVision(
  input: VisionInput,
  cfg: VisionClientConfig,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  /** when set, THESE labelled images are sent instead of the single one on `input` */
  batch?: BatchItem[],
): Promise<string> {
  const lanes = lanesFor(cfg);
  const usable = lanes.filter((l) => !isSpent(l));
  // Every lane is already spent for today. Report the daily scope so the batch stops rather
  // than walking the same wall a hundred and forty more times.
  if (!usable.length)
    throw new VisionExtractionError(
      `Every configured model's daily allowance is spent (${lanes.map((l) => l.label ?? l.model).join(', ')}), so ${input.fileName} was not read.`,
      input.fileName, undefined, 'day',
    );

  let last: unknown = null;
  for (const [i, lane] of usable.entries()) {
    try {
      return await callLane(lane, input, systemPrompt, userPrompt, maxOutputTokens, batch);
    } catch (err) {
      last = err;
      const daily = err instanceof VisionExtractionError && err.rateLimit === 'day';
      const authFailed = err instanceof VisionExtractionError && err.authFailed;
      const busy = err instanceof VisionExtractionError && err.serverBusy;
      // Only a spent day or a refused key moves to the next lane. A per-minute limit clears by
      // waiting and is the caller's rate gate to hold; burning the fallback on it would spend
      // the backup allowance on a wall that was about to come down anyway.
      if (!daily && !authFailed && !busy) throw err;
      if (daily) spent.set(laneKey(lane), Date.now());
      if (i === usable.length - 1) throw err;
    }
  }
  throw last instanceof Error ? last : new VisionExtractionError(`No model could read ${input.fileName}`, input.fileName);
}

/** Kept under its old name for callers that still speak of one provider. */
export const callGemini = callVision;

/** One attempt against one lane. */
function callLane(
  lane: VisionLane,
  input: VisionInput,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  batch?: BatchItem[],
): Promise<string> {
  return lane.provider === 'groq'
    ? callGroqLane(lane, input, systemPrompt, userPrompt, maxOutputTokens, batch)
    : callGeminiLane(lane, input, systemPrompt, userPrompt, maxOutputTokens, batch);
}

async function callGeminiLane(
  lane: VisionLane,
  input: VisionInput,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  batch?: BatchItem[],
): Promise<string> {
  const cfg = { apiKey: lane.apiKey };
  const model = lane.model;
  const baseUrl = lane.baseUrl ?? DEFAULT_BASE_URL;
  const url = `${baseUrl}/${model}:generateContent`;

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [
      {
        role: 'user',
        // Each image is preceded by its own "=== label ===" line. Without the marker the model
        // has a list of labels in the prompt and an unlabelled run of images after it, and any
        // slip in counting files a room's findings against a different photograph.
        parts: batch?.length
          ? [
              { text: userPrompt },
              ...batch.flatMap((it) => [
                { text: `=== ${it.label} ===` },
                { inline_data: { mime_type: it.mimeType, data: it.imageBase64 } },
              ]),
            ]
          : [
              { text: userPrompt },
              { inline_data: { mime_type: input.mimeType, data: input.imageBase64 } },
            ],
      },
    ],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      maxOutputTokens,
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
    throw new VisionExtractionError(`Network error calling ${lane.label??lane.model} for ${input.fileName}`, input.fileName, err);
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
    throw new VisionExtractionError(`${lane.label??lane.model} returned ${res.status} for ${input.fileName}: ${text.slice(0, 300)}${hint}`, input.fileName, undefined, scope, res.status===401||res.status===403, res.status>=500, isTooLarge(res.status, text));
  }

  const json = await res.json();
  // Gemini can also refuse via a finishReason (SAFETY, RECITATION, etc.) with no text at all —
  // that shows up as an empty candidates[]/parts[] rather than an HTTP error.
  const raw = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!raw) {
    const finishReason = json?.candidates?.[0]?.finishReason;
    const why = finishReason ? ` (finishReason: ${finishReason})` : '';
    throw new VisionExtractionError(`${lane.label??lane.model} returned no content for ${input.fileName}${why}`, input.fileName);
  }

  return raw as string;
}
/**
 * Groq's OpenAI-compatible chat endpoint, with the image as a data URL.
 *
 * The lane of last resort, and honest about being one: Llama 4 Scout reads a site photograph
 * perfectly well and a dense priced table less well than the Gemini lanes ahead of it. It is
 * here because a folder that stops at 37 of 178 documents is worth less than a folder read to
 * the end by a mix of models, each named on the row it read.
 */
async function callGroqLane(
  lane: VisionLane,
  input: VisionInput,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
  batch?: BatchItem[],
): Promise<string> {
  const url = `${lane.baseUrl ?? GROQ_BASE_URL}/chat/completions`;
  const body = {
    model: lane.model,
    temperature: 0,
    max_tokens: maxOutputTokens,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: batch?.length
          ? [
              { type: 'text', text: userPrompt },
              ...batch.flatMap((it) => [
                { type: 'text', text: `=== ${it.label} ===` },
                { type: 'image_url', image_url: { url: `data:${it.mimeType};base64,${it.imageBase64}` } },
              ]),
            ]
          : [
              { type: 'text', text: userPrompt },
              { type: 'image_url', image_url: { url: `data:${input.mimeType};base64,${input.imageBase64}` } },
            ],
      },
    ],
  };

  const rawCall = () =>
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${lane.apiKey}` },
      body: JSON.stringify(body),
    });

  let res: Response;
  try {
    res = await rawCall();
    for (let attempt = 0; res.status === 429 && attempt < MAX_RATE_LIMIT_RETRIES; attempt++) {
      const text = await res.clone().text().catch(() => '');
      if (rateLimitScopeOf(text) === 'day') break;
      // Groq names its wait in the message text ("try again in 8.5s") and in a retry-after
      // header; parseRetryWaitMs already reads the first, and the header is the fallback.
      const header = Number(res.headers.get('retry-after'));
      const wait = parseRetryWaitMs(text) ?? (Number.isFinite(header) && header > 0 ? header * 1000 + 500 : DEFAULT_RETRY_WAIT_MS);
      if (wait > MAX_RETRY_WAIT_MS) break;
      await sleep(wait);
      res = await rawCall();
    }
    for (let attempt = 0; res.status >= 500 && attempt < 2; attempt++) res = await rawCall();
  } catch (err) {
    throw new VisionExtractionError(`Network error calling ${lane.label ?? lane.model} for ${input.fileName}`, input.fileName, err);
  }

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    // Groq says "tokens per day (TPD)" / "requests per day (RPD)" in the body, which
    // rateLimitScopeOf already reads — the same distinction, worded the same way.
    const scope = res.status === 429 ? rateLimitScopeOf(text) ?? 'minute' : null;
    throw new VisionExtractionError(
      `${lane.label ?? lane.model} returned ${res.status} for ${input.fileName}: ${text.slice(0, 300)}`,
      input.fileName, undefined, scope, res.status === 401 || res.status === 403, res.status >= 500, isTooLarge(res.status, text),
    );
  }

  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) {
    const why = json?.choices?.[0]?.finish_reason ? ` (finish_reason: ${json.choices[0].finish_reason})` : '';
    throw new VisionExtractionError(`${lane.label ?? lane.model} returned no content for ${input.fileName}${why}`, input.fileName);
  }
  return String(raw);
}

// ------------------------------------------------------------------ batching

/** One image inside a batch, with the label its result must come back under. */
export interface BatchItem extends VisionInput {
  label: string;
}

/**
 * Read several images in ONE model call.
 *
 * The reason is round trips, not tokens. Reading a 178-document folder one request per image ran
 * against a twelve-a-minute rate gate: fourteen minutes of waiting before the model's own
 * latency counted at all, which is what "0 / 170 read" on a stalled-looking screen actually was.
 * Measured on six real site photographs: 5.0s for one image, 3.8s for all six in one call —
 * 0.6s an image instead of 5.0s, because almost all of it was ever the round trip.
 *
 * Results come back keyed by label rather than by position. The model is asked for one entry per
 * image in order, and mostly obliges, but a batch that silently returns five entries for six
 * images would shift every result onto the wrong photograph — a partition observed in one room
 * filed against another. Keying by label makes that failure a missing entry, which the caller
 * reports as an unread image, instead of a wrong one it cannot detect.
 */
export async function extractBatchWithVision(
  items: BatchItem[],
  cfg: VisionClientConfig,
): Promise<Map<string, ExtractionResult>> {
  if (!items.length) return new Map();
  if (items.length === 1) {
    const one = await extractWithVision(items[0], cfg);
    return new Map([[items[0].label, one]]);
  }

  // Output scales with the batch: one image's worth of findings was 3072, and a batch that runs
  // out of tokens mid-array loses its last images entirely rather than degrading.
  const budget = Math.min(32768, 1536 * items.length + 1024);
  let raw: string;
  try {
    raw = await callVision(
      { ...items[0], fileName: `${items.length} images` },
      cfg,
      BATCH_EXTRACTION_SYSTEM_PROMPT,
      batchUserPromptFor(items),
      budget,
      items,
    );
  } catch (err) {
    // "Request too large" is the one failure a batch can answer by being a smaller batch. Groq
    // refuses three full-resolution photographs outright where it takes one; halving and trying
    // again reads the group rather than reporting six unread documents. Only ever halved, never
    // retried whole — the same request would be refused the same way.
    if (err instanceof VisionExtractionError && err.tooLarge && items.length > 1) {
      const half = Math.ceil(items.length / 2);
      const [a, b] = await Promise.all([
        extractBatchWithVision(items.slice(0, half), cfg),
        extractBatchWithVision(items.slice(half), cfg),
      ]);
      return new Map([...a, ...b]);
    }
    throw err;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new VisionExtractionError(`The model returned invalid JSON for a batch of ${items.length} images`, items[0].fileName, err);
  }

  const out = new Map<string, ExtractionResult>();
  const obj = (parsed ?? {}) as Record<string, unknown>;
  const list = (Array.isArray(obj.results) && obj.results) || (Array.isArray(obj.images) && obj.images) || (Array.isArray(parsed) && parsed) || [];
  for (const [i, entry] of (list as unknown[]).entries()) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    // Position is the fallback, not the key: a model that dropped the label but kept the order
    // is still usable, and one that did neither yields a missing entry rather than a shifted one.
    const label = typeof e.label === 'string' && items.some((it) => it.label === e.label) ? e.label : items[i]?.label;
    if (!label || out.has(label)) continue;
    const item = items.find((it) => it.label === label)!;
    const result = normalizeModelResponse(e, item.fileName);
    result.lowConfidenceNotes ??= [];
    out.set(label, result);
  }
  return out;
}
