// Text-only Groq call for the replan agent — now uses openai/gpt-oss-20b, a non-preview model
// with solid structured-output support, separate from the qwen/qwen3.6-27b model used for the
// vision extraction layer. This allows for independent rate limit management and resource
// allocation between the vision and Q&A components.
import { REPLAN_JSON_SCHEMA, type ProposedDelay, type ReplanAgentKind, type ReplanAgentResult } from './types';
import { REPLAN_SYSTEM_PROMPT, replanUserPrompt } from './prompts';

export interface ReplanAgentConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'gemini-1.5-flash';
const DEFAULT_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/openai';

export class ReplanAgentError extends Error {}

export async function parseReplanQuery(
  query: string,
  projectSummary: Record<string, unknown>,
  cfg: ReplanAgentConfig,
): Promise<ReplanAgentResult> {
  const model = cfg.model ?? DEFAULT_MODEL;
  const baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL;
  const apiKey = cfg.apiKey;

  const messages = [
    { role: 'system', content: REPLAN_SYSTEM_PROMPT },
    { role: 'user', content: replanUserPrompt(query, projectSummary) },
  ];

  const call = (responseFormat: Record<string, unknown>) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
      model, messages, response_format: responseFormat, temperature: 0,
       max_tokens: 2048,

      }),
    });

  let res: Response | null = null;
  let lastErrorBody = '';
  try {
    for (const attempt of [
      { type: 'json_schema', json_schema: REPLAN_JSON_SCHEMA },
      { type: 'json_object' },
      { type: 'json_object' },
    ]) {
      res = await call(attempt);
      if (res.ok) break;
      lastErrorBody = await res.text().catch(() => '');
    }
  } catch (err) {
    throw new ReplanAgentError(`Network error calling Groq: ${err instanceof Error ? err.message : err}`);
  }

  if (!res || !res.ok) {
    throw new ReplanAgentError(
      `Groq couldn't produce a valid response after 3 attempts — try rephrasing the question, or try again in a moment. (${lastErrorBody.slice(0, 200)})`,
    );
  }

  const json = await res.json();
  const raw = json?.choices?.[0]?.message?.content;
  if (!raw) throw new ReplanAgentError('Groq returned no content');

  let parsed: { kind?: unknown; applicable?: unknown; delays?: unknown; summary?: unknown; clarifyingQuestion?: unknown; answer?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ReplanAgentError(`Groq returned invalid JSON: ${err instanceof Error ? err.message : err}`);
  }

  const rawDelays = Array.isArray(parsed.delays) ? (parsed.delays as unknown[]) : [];
  const validDelays: ProposedDelay[] = rawDelays
    .map((d) => {
      if (!d || typeof d !== 'object') return null;
      const r = d as Record<string, unknown>;
      const match = r.match ?? r.activity ?? r.activityName ?? r.trade ?? r.name;
      const delayWorkingDays = r.delayWorkingDays ?? r.days ?? r.delayDays ?? r.delay;
      const reason = r.reason ?? r.note;
      return { match, delayWorkingDays, reason };
    })
    .filter(
      (d): d is { match: string; delayWorkingDays: number; reason: unknown } =>
        !!d && typeof d.match === 'string' && d.match.trim().length > 0 &&
        typeof d.delayWorkingDays === 'number' && Number.isFinite(d.delayWorkingDays) && d.delayWorkingDays > 0,
    )
    .map((d) => ({
      match: d.match,
      delayWorkingDays: d.delayWorkingDays,
      reason: typeof d.reason === 'string' && d.reason.trim() ? d.reason : `per replan query: "${query}"`,
    }));

  if (validDelays.length !== rawDelays.length) {
    console.warn(`parseReplanQuery: dropped ${rawDelays.length - validDelays.length} malformed delay entr${rawDelays.length - validDelays.length === 1 ? 'y' : 'ies'} from Groq's response`, rawDelays);
  }

  const VALID_KINDS: ReplanAgentKind[] = ['delay', 'question', 'unclear'];
  const kind: ReplanAgentKind =
    typeof parsed.kind === 'string' && (VALID_KINDS as string[]).includes(parsed.kind)
      ? (parsed.kind as ReplanAgentKind)
      : validDelays.length > 0
        ? 'delay'
        : 'unclear';

  return {
    kind,
    applicable: typeof parsed.applicable === 'boolean' ? parsed.applicable : kind === 'delay',
    delays: validDelays,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    clarifyingQuestion: typeof parsed.clarifyingQuestion === 'string' ? parsed.clarifyingQuestion : undefined,
    answer: typeof parsed.answer === 'string' && parsed.answer.trim() ? parsed.answer : undefined,
  };
}