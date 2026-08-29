// Extraction schema: the strict shape the vision model must return for one source file.
// Mirrors domain/types.ts' Phase 1 ProjectInputs fields exactly, minus `source` (the adapter
// stamps that itself — never trust the model to fill in its own provenance string).
//
// Deliberately conservative like extractorFor() in engine/coverage.ts: every field is optional
// and an empty result is valid. A vision model returning nothing it can't support is correct
// behavior, not a failure — the alternative is a model that invents numbers to look useful.

export type ExtractableKind = 'contract' | 'site_image' | 'make_list' | 'sales_kt' | 'drawing_or_3d' | 'unknown';

export interface ExtractedContract {
  contractStart?: string; // ISO date
  contractDurationCalDays?: number;
  contractValue?: number;
  bcsValue?: number;
  milestones?: { code: string; dayOffset: number; percent: number; description: string }[];
  ldPercentPerWeek?: number;
  ldCapPercent?: number;
  dlpMonths?: number;
  /** page/section this was read from, e.g. "p.4, clause 12" — combined with the file name by the adapter */
  locator?: string;
}

export interface ExtractedSiteCondition {
  trade: string; // free text; adapter validates against norms.crewByTrade before use
  status: 'not_started' | 'in_progress' | 'complete';
  percentComplete?: number;
  note: string;
  locator?: string; // e.g. "photo 4"
}

export interface ExtractedMaterialItem {
  item: string;
  trade: string;
  spec?: string;
  quantity?: number;
  unit?: string;
  locator?: string;
}

export interface ExtractedScopeNote {
  area: string;
  note: string;
  locator?: string;
}

export interface ExtractedDesignRef {
  packageCodeHint?: string;
  trade: string;
  description: string;
  locator?: string;
}

/**
 * The twelve things engine/intake.ts asks the project head before it will build a plan.
 *
 * They were asked as blank fields on a screen that had just read 178 documents, several of
 * which state the answer outright — the contract names the working hours, the fit-out guideline
 * names the week-offs, the payment annexure names the RA milestones. Retyping a figure the
 * engine has already seen is both wasted work and a chance to mistype it, so the reader now
 * looks for these while it has the page open and the person confirms rather than composes.
 *
 * Confirmation is not a formality. Nothing here is treated as an answer until someone says so
 * — an extracted value is a well-sourced proposal, and the screen exists because a confident
 * plan built on a guessed date is worse than no plan.
 */
export type PlanningQueryKey =
  | 'start' | 'duration' | 'area' | 'workmode' | 'weekoff' | 'phasing'
  | 'scope' | 'longlead' | 'approvals' | 'milestones' | 'team' | 'constraints';

export const PLANNING_QUERY_KEYS: PlanningQueryKey[] = [
  'start', 'duration', 'area', 'workmode', 'weekoff', 'phasing',
  'scope', 'longlead', 'approvals', 'milestones', 'team', 'constraints',
];

export interface ExtractedPlanningAnswer {
  key: PlanningQueryKey;
  /** the answer in the document's own words — never the model's paraphrase of a policy */
  value: string;
  /** page/clause it was read from, so the person confirming can check it in seconds */
  locator?: string;
}

/** What the model returns for one file. Every array/object is optional — absence means
 * "nothing of this kind found in this file", not an extraction failure. */
export interface ExtractionResult {
  kind: ExtractableKind;
  contract?: ExtractedContract;
  siteConditions?: ExtractedSiteCondition[];
  materialItems?: ExtractedMaterialItem[];
  scopeNotes?: ExtractedScopeNote[];
  designRefs?: ExtractedDesignRef[];
  /** direct answers to the intake questions, when the document states one outright */
  planningAnswers?: ExtractedPlanningAnswer[];
  /** model's own confidence flags — things it saw but could not read confidently.
   * Surfaced as assumptions[], same as wbs.ts' notes[] convention. */
  lowConfidenceNotes: string[];
}

/** JSON Schema handed to the model via response_format for structured output. Kept in lockstep
 * with the TS interfaces above — if you add a field there, add it here too. */
export const EXTRACTION_JSON_SCHEMA = {
  name: 'extraction_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['kind', 'lowConfidenceNotes'],
    properties: {
      kind: { type: 'string', enum: ['contract', 'site_image', 'make_list', 'sales_kt', 'drawing_or_3d', 'unknown'] },
      contract: {
        type: ['object', 'null'],
        additionalProperties: false,
        properties: {
          contractStart: { type: ['string', 'null'] },
          contractDurationCalDays: { type: ['number', 'null'] },
          contractValue: { type: ['number', 'null'] },
          bcsValue: { type: ['number', 'null'] },
          milestones: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['code', 'dayOffset', 'percent', 'description'],
              properties: {
                code: { type: 'string' },
                dayOffset: { type: 'number' },
                percent: { type: 'number' },
                description: { type: 'string' },
              },
            },
          },
          ldPercentPerWeek: { type: ['number', 'null'] },
          ldCapPercent: { type: ['number', 'null'] },
          dlpMonths: { type: ['number', 'null'] },
          locator: { type: ['string', 'null'] },
        },
      },
      siteConditions: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['trade', 'status', 'note'],
          properties: {
            trade: { type: 'string' },
            status: { type: 'string', enum: ['not_started', 'in_progress', 'complete'] },
            percentComplete: { type: ['number', 'null'] },
            note: { type: 'string' },
            locator: { type: ['string', 'null'] },
          },
        },
      },
      materialItems: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['item', 'trade'],
          properties: {
            item: { type: 'string' },
            trade: { type: 'string' },
            spec: { type: ['string', 'null'] },
            quantity: { type: ['number', 'null'] },
            unit: { type: ['string', 'null'] },
            locator: { type: ['string', 'null'] },
          },
        },
      },
      scopeNotes: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['area', 'note'],
          properties: {
            area: { type: 'string' },
            note: { type: 'string' },
            locator: { type: ['string', 'null'] },
          },
        },
      },
      designRefs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['trade', 'description'],
          properties: {
            packageCodeHint: { type: ['string', 'null'] },
            trade: { type: 'string' },
            description: { type: 'string' },
            locator: { type: ['string', 'null'] },
          },
        },
      },
      planningAnswers: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['key', 'value'],
          properties: {
            key: { type: 'string', enum: PLANNING_QUERY_KEYS },
            value: { type: 'string' },
            locator: { type: ['string', 'null'] },
          },
        },
      },
      lowConfidenceNotes: { type: 'array', items: { type: 'string' } },
    },
  },
} as const;