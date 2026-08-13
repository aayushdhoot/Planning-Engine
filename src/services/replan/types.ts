// The replan agent has two jobs now: (1) turn a free-text query into ExternalDelay[] mutations
// (defined in engine/planner.ts) that the deterministic core can apply — it never computes a
// date itself, and must ask a clarifying question instead of guessing; or (2) answer a general
// question about the project's current status, grounded strictly in the project summary it's
// given (see context.ts) — it must not invent a figure that isn't in that data.

export type ReplanAgentKind = 'delay' | 'question' | 'unclear';

export interface ProposedDelay {
  match: string; // substring against activity name, or exact against trade
  delayWorkingDays: number;
  reason: string;
}

export interface ReplanAgentResult {
  /** which of the agent's two jobs this query was — see prompts.ts for the exact rules */
  kind: ReplanAgentKind;
  /** true iff kind === 'delay' — kept as its own field (rather than derived) since it's the
   * flag api/replan/approve.ts gates on, and legacy callers already read it that way */
  applicable: boolean;
  delays: ProposedDelay[];
  summary: string;
  clarifyingQuestion?: string;
  /** the prose answer for kind === 'question' (and the short "I can help with…" note for
   * kind === 'unclear'); absent for kind === 'delay' */
  answer?: string;
}

export const REPLAN_JSON_SCHEMA = {
  name: 'replan_agent_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'applicable', 'delays', 'summary'],
    properties: {
      kind: { type: 'string', enum: ['delay', 'question', 'unclear'] },
      applicable: { type: 'boolean' },
      delays: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['match', 'delayWorkingDays', 'reason'],
          properties: {
            match: { type: 'string' },
            delayWorkingDays: { type: 'number' },
            reason: { type: 'string' },
          },
        },
      },
      summary: { type: 'string' },
      clarifyingQuestion: { type: ['string', 'null'] },
      answer: { type: ['string', 'null'] },
    },
  },
} as const;