// Core domain types. Every quantitative value is Traced (T1-TRACE).

export type Provenance = 'input' | 'norm' | 'computed';

export interface Traced<T> {
  value: T;
  provenance: Provenance;
  /** Human-readable pointer to the origin, e.g. "SKF, Pune Schedule.xlsx row 4" or "norms-v1:leadTimes.partitionGlass" */
  source: string;
}

export type DepType = 'FS' | 'SS' | 'FF';

export interface Dependency {
  pred: string; // predecessor activity id
  type: DepType;
  /** lag in working days (can be negative) */
  lag: number;
}

export interface Activity {
  id: string;
  name: string;
  phase: string;
  trade: string;
  /** duration in working days */
  duration: Traced<number>;
  deps: Dependency[];
  /** crew size per working day, from norms */
  crew: Traced<number>;
  isMilestone: boolean;
  /** share of its BOQ package value this activity carries (0..1), for cashflow */
  packageCode?: string;
  valueShare?: number;
  /** percent complete 0..100 if actuals known */
  percentComplete?: Traced<number>;
  /** planned start from the source schedule, when one was supplied (used to derive dep lags) */
  plannedStartFromInput?: string;
}

export interface CalendarConfig {
  /** 0=Sun..6=Sat; days of week that are OFF */
  weeklyOffDays: number[];
  /** ISO dates that are holidays */
  holidays: string[];
  /** site work mode multiplier applied to durations (1 = normal) */
  workModeFactor: number;
}

export interface BoqPackage {
  code: string;
  name: string;
  clientAmount: Traced<number>;
  bcsAmount: Traced<number> | null; // internal cost; null when unknown
  trade: string;
  /** physical quantity from a line-item BOQ, when the sheet carries QTY/UNIT columns */
  quantity?: Traced<number>;
  unit?: string;
}

export interface ContractMilestone {
  code: string; // RA1..
  dayOffset: number; // calendar days from start
  percent: number; // % of contract value billed
  description: string;
}

export interface SiteConditionNote {
  trade: string;
  status: 'not_started' | 'in_progress' | 'complete';
  percentComplete?: number;
  note: string;
  source: string;
}

export interface MaterialListItem {
  item: string;
  trade: string;
  spec?: string;
  quantity?: Traced<number>;
  unit?: string;
  source: string;
}

export interface ScopeNote {
  area: string;
  note: string;
  source: string;
}

export interface DesignReference {
  packageCodeHint?: string;
  trade: string;
  description: string;
  source: string;
}

export interface ProjectInputs {
  id: string;
  name: string;
  client: string;
  location: string;
  areaSft: Traced<number> | null;
  contractStart: string | null; // ISO date
  contractDurationCalDays: Traced<number> | null;
  contractValue: Traced<number> | null;
  bcsValue: Traced<number> | null;
  milestones: ContractMilestone[];
  boqPackages: BoqPackage[];
  /** activities from an existing schedule input; empty when only BOQ present */
  scheduleActivities: Activity[];
  /** which mandatory inputs are present */
  provided: { boq: boolean; contract: boolean; layout: boolean; drawings: boolean; day0Images: boolean; design3d: boolean; salesKt: boolean; makeList: boolean; paymentTerms: boolean };
  ldPercentPerWeek: number | null;
  ldCapPercent: number | null;
  dlpMonths: number | null;
  siteConditions: SiteConditionNote[];
  materialItems: MaterialListItem[];
  scopeNotes: ScopeNote[];
  designRefs: DesignReference[];

}

export interface BufferPolicy {
  /** internal buffer in working days; must be within [min,max] */
  internalBufferDays: number;
  min: number;
  max: number;
}

export interface EngineConfig {
  calendar: CalendarConfig;
  buffer: BufferPolicy;
  normsVersion: string;
  /** in-app edits to versioned norms; applied without mutating the norms file */
  normsOverrides?: { packageLeadTimeDays?: Record<string, number> };
  /**
   * Actual dates, when they differ from what the contract says. A contract states a
   * commencement date and a duration; site reality often does not match, and the plan has to
   * follow the real dates rather than the paper ones. Blank fields fall back to the contract.
   *
   * The internal pair drives the CPM baseline the team works to; the client pair drives the
   * committed baseline the client is shown. They are deliberately independent — that gap is
   * the buffer.
   */
  dates?: ScheduleDates;
}

export interface ScheduleDates {
  /** re-anchors the CPM baseline; every computed date shifts with it */
  internalStart?: string | null;
  /** internal target finish. Reported as variance against the CPM finish, never used to
   *  silently compress durations — the engine states the gap rather than inventing pace. */
  internalEnd?: string | null;
  clientStart?: string | null;
  /** committed finish shown to the client; replaces contract start + duration when set */
  clientEnd?: string | null;
}

// ---------- Scheduled output ----------

export interface ScheduledActivity extends Activity {
  es: number; // early start (working-day index from project start, 0-based)
  ef: number; // early finish (exclusive)
  ls: number;
  lf: number;
  totalFloat: number;
  critical: boolean;
  startDate: string; // ISO
  endDate: string; // ISO, inclusive last working day
}

export interface CpmResult {
  activities: ScheduledActivity[];
  projectDurationDays: number; // working days
  criticalPath: string[]; // activity ids in order
}
