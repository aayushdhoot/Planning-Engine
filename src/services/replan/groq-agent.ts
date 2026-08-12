// Text-only Groq call for the replan agent. Deliberately a different model than the vision
// extraction layer: this is the latency-sensitive, conversational side of the system (per the
// original design split), and openai/gpt-oss-20b is a current, non-preview Groq model with
// solid structured-output support — unlike qwen3.6-27b, which is vision-focused and preview.
// Swapping either model later is a one-line change in the relevant client file.
import { REPLAN_JSON_SCHEMA, type ProposedDelay, type ReplanAgentResult } from './types';
import { REPLAN_SYSTEM_PROMPT, replanUserPrompt } from './prompts';

export interface ReplanAgentConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

const DEFAULT_MODEL = 'openai/gpt-oss-20b';
const DEFAULT_BASE_URL = 'https://api.groq.com/openai/v1';

export class ReplanAgentError extends Error {}

export async function parseReplanQuery(
  query: string,
  activities: { name: string; trade: string; startDate: string }[],
  cfg: ReplanAgentConfig,
): Promise<ReplanAgentResult> {
  const model = cfg.model ?? DEFAULT_MODEL;
  const baseUrl = cfg.baseUrl ?? DEFAULT_BASE_URL;

  const messages = [
    { role: 'system', content: REPLAN_SYSTEM_PROMPT },
    { role: 'user', content: replanUserPrompt(query, activities) },
  ];

  // openai/gpt-oss-20b is a reasoning model — it spends tokens on internal reasoning before
  // producing the final JSON. Without a generous max_tokens budget and a capped reasoning
  // effort, the reasoning can consume the whole response and leave nothing for the actual
  // answer, which is exactly what produced Groq's "failed_generation: ''" error in practice.
  const call = (responseFormat: Record<string, unknown>) =>
    fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.apiKey}` },
      body: JSON.stringify({
        model, messages, response_format: responseFormat, temperature: 0,
        max_tokens: 2048, reasoning_effort: 'low',
      }),
    });

  // Three attempts before giving up: strict schema, then plain JSON mode, then one retry of
  // plain JSON mode — a reasoning model's structured-output failures are often one-off
  // (a specific query happened to blow the reasoning budget), and today's real-world failure
  // was exactly that: both the schema call and its immediate fallback failed on the same query.
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

  let parsed: { applicable?: unknown; delays?: unknown; summary?: unknown; clarifyingQuestion?: unknown };
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new ReplanAgentError(`Groq returned invalid JSON: ${err instanceof Error ? err.message : err}`);
  }

  // The json_object fallback path (no strict schema enforcement) can return field names or
  // shapes that don't exactly match ReplanAgentResult — this happened in practice with
  // openai/gpt-oss-20b, which has been observed using "activity" instead of "match" even under
  // strict schema mode. Aliased here rather than trusting the model to use our exact field
  // names — a lenient read is safer than dropping an otherwise-valid delay.
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

  return {
    applicable: typeof parsed.applicable === 'boolean' ? parsed.applicable : validDelays.length > 0,
    delays: validDelays,
    summary: typeof parsed.summary === 'string' ? parsed.summary : '',
    clarifyingQuestion: typeof parsed.clarifyingQuestion === 'string' ? parsed.clarifyingQuestion : undefined,
  };
}