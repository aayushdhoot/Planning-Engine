// The replan agent's job is narrow: turn a free-text query into ExternalDelay[] mutations
// (defined in engine/planner.ts) that the deterministic core can apply. It never computes a
// date itself — same rule as extraction, enforced the same way: the agent must not invent a
// delayWorkingDays it wasn't given, and must ask a clarifying question instead of guessing.

export interface ProposedDelay {
  match: string; // substring against activity name, or exact against trade
  delayWorkingDays: number;
  reason: string;
}

export interface ReplanAgentResult {
  applicable: boolean;
  delays: ProposedDelay[];
  summary: string;
  clarifyingQuestion?: string;
}

export const REPLAN_JSON_SCHEMA = {
  name: 'replan_agent_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['applicable', 'delays', 'summary'],
    properties: {
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
    },
  },
} as const;