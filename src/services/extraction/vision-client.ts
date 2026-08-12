// Thin wrapper around the Groq API (OpenAI-compatible /chat/completions) for both vision and
// text extraction. One provider, one model, for the pilot — kept isolated from
// extraction-service.ts so swapping provider/model later touches one file, not the extraction
// logic. qwen/qwen3.6-27b is Groq's current multimodal model; Groq flags it as a preview model,
// so this file degrades to plain JSON mode if strict json_schema mode isn't accepted, rather
// than hard-failing the whole pilot on a provider-side capability gap.
import { EXTRACTION_JSON_SCHEMA, type ExtractionResult } from './types';
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

function parseRetryWaitMs(errorText: string): number {
  const m = errorText.match(/try again in ([\d.]+)s/i);
  if (m) return Math.min(MAX_RETRY_WAIT_MS, Math.ceil(parseFloat(m[1]) * 1000) + 500); // +500ms safety margin
  return DEFAULT_RETRY_WAIT_MS;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class VisionExtractionError extends Error {
  constructor(
    message: string,
    public readonly fileName: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'VisionExtractionError';
  }
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
      await sleep(parseRetryWaitMs(text));
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
    const hint = res.status === 429 ? ' (rate limit persisted after retrying — try again shortly, or read fewer images at once)' : '';
    throw new VisionExtractionError(`Groq returned ${res.status} for ${input.fileName}: ${text.slice(0, 300)}${hint}`, input.fileName);
  }

  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) throw new VisionExtractionError(`Groq returned no content for ${input.fileName}`, input.fileName);

  let parsed: ExtractionResult;
  try {
    parsed = JSON.parse(raw);
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